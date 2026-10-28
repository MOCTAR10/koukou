import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { FeedUnit } from '../../common/enums/food-type.enum.js';
import { InputKind } from '../../common/enums/input-kind.enum.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { FlockReconciliationService } from '../batches/flock-reconciliation.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { koukouBus, KOUKOU_EVENTS } from '../../common/utils/event-bus.js';
import { DailyEntry } from './entities/daily-entry.entity.js';
import { CreateDailyEntryDto } from './dto/create-daily-entry.dto.js';
import { FeedStockService, entryPhaseKeyOf } from '../feed-stock/feed-stock.service.js';

@Injectable()
export class DailyEntriesService {
  constructor(
    @InjectRepository(DailyEntry)
    private readonly entryRepo: Repository<DailyEntry>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(InputLot)
    private readonly inputRepo: Repository<InputLot>,
    private readonly farmsService: FarmsService,
    private readonly flockReconciliation: FlockReconciliationService,
    private readonly dataSource: DataSource,
    private readonly feedStock: FeedStockService,
  ) {}

  async create(
    user: AuthUser,
    farmId: string,
    batchId: string,
    dto: CreateDailyEntryDto,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new NotFoundException('Lot introuvable dans cette ferme.');

    if (batch.status === BatchStatus.CLOTURE) {
      throw new BadRequestException(
        'Lot clôturé : impossible d’ajouter une saisie (immuabilité).',
      );
    }

    if (dto.inputLotId != null) {
      const lot = await this.inputRepo.findOne({
        where: { id: dto.inputLotId, farmId },
      });
      if (!lot || lot.kind !== InputKind.ALIMENT) {
        throw new BadRequestException(
          'Lot d’intrant alimentaire introuvable dans cette ferme (catégorie ALIMENT uniquement).',
        );
      }
    }

    if (dto.skipStockDeduction === true && dto.inputLotId != null) {
      throw new BadRequestException(
        'skipStockDeduction et inputLotId sont mutuellement exclus : un achat externe ne peut pas être rattaché à un lot de stock interne.',
      );
    }

    return this.dataSource
      .transaction(async (em) => {
        // Lock order batch → feed lot, same as POS sales (which pre-lock
        // batches first): avoids a lock-order inversion with the feed lot
        // lock taken in assertConsumptionAvailable.
        await em.getRepository(ProductionBatch).findOne({
          where: { id: batch.id },
          lock: { mode: 'pessimistic_write' },
        });
        const entryRepo = em.getRepository(DailyEntry);
        const existing = await entryRepo.findOne({
          where: { batchId, entryDate: dto.entryDate },
        });

        // Seuls les champs réellement fournis sont appliqués (l'upsert ne doit pas
        // écraser les saisies du jour quand on ne met à jour qu'un seul champ).
        const data: Partial<DailyEntry> = {
          batchId,
          entryDate: dto.entryDate,
          createdById: user.id,
        };
        if (dto.deaths !== undefined) data.deaths = dto.deaths;
        const feedProvided =
          dto.feedQuantity !== undefined || dto.feedBags !== undefined;
        const prevFeedKg = existing?.feedQuantity ?? 0;
        let newFeedKg = prevFeedKg;
        if (feedProvided) {
          newFeedKg = this.toKg(dto, batch, existing);
          data.feedQuantity = newFeedKg;
        }
        if (dto.feedUnit !== undefined) data.feedUnit = dto.feedUnit ?? null;
        // Poids du sac retenu pour la conversion SAC → kg (valeur propre à la
        // saisie, sinon le défaut du lot, sinon 50 kg).
        const effFeedUnit = dto.feedUnit ?? existing?.feedUnit ?? null;
        if (dto.bagSizeKg !== undefined && effFeedUnit === FeedUnit.SAC) {
          data.bagSizeKg = dto.bagSizeKg ?? null;
        } else if (effFeedUnit === FeedUnit.KG) {
          data.bagSizeKg = null;
        }
        if (dto.feedType !== undefined) data.feedType = dto.feedType ?? null;
        if (dto.feedPhase !== undefined) data.feedPhase = dto.feedPhase ?? null;
        if (dto.customFeedPhaseName !== undefined)
          data.customFeedPhaseName = dto.customFeedPhaseName ?? null;

        // Intégrité du stock provende (Module 3) :
        // 1) Toute consommation doit être rattachée à un lot consommable dès qu'un
        //    lot éligible existe (auto-affectation FEFO si le client n'en fournit pas).
        // 2) Jamais de stock négatif : si la consommation incrémentale dépasse le
        //    disponible du lot → 400 + alerte ALIMENT « stock insuffisant ».
        // 3) Si AUCUN lot consommable de la phase n'existe → la saisie est conservée
        //    (aucune perte de donnée) mais une alerte ALIMENT « rupture » est levée.
        // 4) skipStockDeduction (achat externe) : la consommation est enregistrée
        //    SANS lien à un lot de stock, sans décrément et sans alerte « rupture ».
        const skipDeduction =
          dto.skipStockDeduction ?? existing?.skipStockDeduction ?? false;
        data.skipStockDeduction = skipDeduction;
        const deltaFeedKg = newFeedKg - prevFeedKg;
        if (skipDeduction) {
          data.inputLotId = null;
        } else {
          const prevLotId = existing?.inputLotId ?? null;
          const lotSwitch =
            dto.inputLotId != null &&
            dto.inputLotId !== '' &&
            dto.inputLotId !== prevLotId;
          if (deltaFeedKg > 0 || (lotSwitch && newFeedKg > 0)) {
            const entryPhase = entryPhaseKeyOf({
              feedPhase: dto.feedPhase ?? existing?.feedPhase,
              feedType: dto.feedType ?? existing?.feedType,
            });
            const resolvedLotId = await this.feedStock.resolveConsumptionLot(
              farmId,
              entryPhase,
              dto.inputLotId ?? prevLotId,
              em,
              newFeedKg,
            );
            if (resolvedLotId == null) {
              data.inputLotId = dto.inputLotId ?? prevLotId;
              await this.feedStock.raiseNoFeedAlert(farmId, entryPhase);
            } else {
              data.inputLotId = resolvedLotId;
              // Same lot: only the increase is new consumption. Another lot:
              // the whole entry moves onto it and must fit its stock.
              await this.feedStock.assertConsumptionAvailable(
                farmId,
                resolvedLotId,
                resolvedLotId === prevLotId ? deltaFeedKg : newFeedKg,
                em,
              );
            }
          } else if (dto.inputLotId !== undefined) {
            data.inputLotId = dto.inputLotId ?? null;
          }
        }
        if (dto.waterL !== undefined) data.waterL = dto.waterL;
        if (dto.avgWeightKg !== undefined)
          data.avgWeightKg = dto.avgWeightKg ?? null;
        if (dto.eggsCollected !== undefined)
          data.eggsCollected = dto.eggsCollected;
        if (dto.eggsSellable !== undefined)
          data.eggsSellable = dto.eggsSellable;
        if (dto.eggsCracked !== undefined) data.eggsCracked = dto.eggsCracked;
        if (dto.eggsSmall !== undefined) data.eggsSmall = dto.eggsSmall;
        if (dto.eggsDoubleYolk !== undefined)
          data.eggsDoubleYolk = dto.eggsDoubleYolk;
        if (dto.eggsDirty !== undefined) data.eggsDirty = dto.eggsDirty;
        if (dto.source !== undefined) data.source = dto.source;

        const entry = existing
          ? entryRepo.merge(existing, data)
          : entryRepo.create(data);
        await entryRepo.save(entry);
        await this.recomputeLiveCount(em, batch.id);
        return entry;
      })
      .then((entry) => {
        koukouBus.emit(KOUKOU_EVENTS.DAILY_ENTRY_CREATED, {
          farmId,
          batchId,
          entryDate: dto.entryDate,
        });
        return entry;
      });
  }

  async listForBatch(user: AuthUser, farmId: string, batchId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch) throw new NotFoundException('Lot introuvable dans cette ferme.');
    return this.entryRepo.find({
      where: { batchId },
      order: { entryDate: 'ASC' },
    });
  }

  private toKg(
    dto: CreateDailyEntryDto,
    batch: ProductionBatch,
    existing?: DailyEntry | null,
  ): number {
    const qty = dto.feedQuantity ?? dto.feedBags ?? 0;
    // A correction without feedUnit keeps the unit the entry was saved with.
    const unit = dto.feedUnit ?? existing?.feedUnit ?? null;
    if (unit === FeedUnit.KG) {
      return qty;
    }
    const sacKg =
      dto.bagSizeKg ?? existing?.bagSizeKg ?? batch.feedUnitSacKg ?? 50;
    const bags = dto.feedBags ?? qty;
    return bags * sacKg;
  }

  /**
   * Recalcule le cheptel vivant comme source de vérité :
   * arrivés − morts (saisies journalières) − oiseaux vendus (ventes non
   * annulées) − oiseaux abattus − oiseaux retirés (réformes + mortalités
   * déclarées en événement sanitaire).
   * Verrou pessimiste (dans la transaction) pour rester en phase avec les
   * décréments du POS.
   */
  private async recomputeLiveCount(em: EntityManager, batchId: string) {
    // Verrou pessimiste acquis AVANT toute lecture des flux de sortie : toute
    // vente/abattage concurrent sérialise sur la même ligne et son impact est
    // visible/après notre lecture (pas de course lecture/écriture).
    const locked = await em
      .getRepository(ProductionBatch)
      .createQueryBuilder('batch')
      .setLock('pessimistic_write')
      .where('batch.id = :id', { id: batchId })
      .getOne();
    if (!locked) return;

    const rows = await em
      .getRepository(DailyEntry)
      .find({ where: { batchId } });
    const totalDeaths = rows.reduce((s, e) => s + e.deaths, 0);
    const [soldBirds, slaughteredBirds, sanitaryRemovedBirds] = await Promise.all([
      this.flockReconciliation.netSoldBirds(batchId, em),
      this.flockReconciliation.netSlaughteredBirds(batchId, em),
      this.flockReconciliation.netSanitaryRemovedBirds(batchId, em),
    ]);
    locked.quantityAlive = Math.max(
      0,
      locked.quantityAtStart -
        totalDeaths -
        soldBirds -
        slaughteredBirds -
        sanitaryRemovedBirds,
    );
    await em.getRepository(ProductionBatch).save(locked);
  }
}
