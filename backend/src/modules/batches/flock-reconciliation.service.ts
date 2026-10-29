import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import { SlaughterStatus } from '../../common/enums/slaughter-status.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { SaleItem } from '../finance/entities/sale-item.entity.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { SlaughterOrder } from '../slaughter/entities/slaughter-order.entity.js';
import { HealthEvent } from '../sanitary/entities/health-event.entity.js';
import { ProductionBatch } from './entities/production-batch.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { HealthEventKind } from '../../common/enums/health-event-kind.enum.js';

/**
 * Reconcilie les sorties réelles d'un lot : ventes POULET (PIECE/KG, nettes des
 * annulations), ventes ABATTU directes (sans ordre d'abattage source, elles
 * décrémentent le lot au POS) et abattages PROCESSED. Le cheptel vivant doit
 * rester en phase avec ces flux pour que la garde de stock du POS et les
 * métriques reflètent la réalité (tout doit rester synchronisé).
 */
@Injectable()
export class FlockReconciliationService {
  constructor(
    @InjectRepository(SaleItem)
    private readonly saleItemRepo: Repository<SaleItem>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SlaughterOrder)
    private readonly slaughterRepo: Repository<SlaughterOrder>,
    @InjectRepository(HealthEvent)
    private readonly healthEventRepo: Repository<HealthEvent>,
  ) {}

  /**
   * Birds that left the lot per date (sales, slaughter, sanitary culls), with
   * the same rules as the net totals below. Daily-entry deaths are not
   * included (they live on the entries). Feeds per-day population figures.
   */
  async removalsByDate(batchId: string): Promise<Map<string, number>> {
    const [sold, slaughtered, sanitary] = await Promise.all([
      this.soldQuery(batchId)
        .select("TO_CHAR(sale.sale_date, 'YYYY-MM-DD')", 'day')
        .addSelect('COALESCE(SUM(COALESCE(item.piece_count, 0)), 0)', 'total')
        .groupBy('sale.sale_date')
        .getRawMany<{ day: string; total: string }>(),
      this.slaughterQuery(batchId)
        .select("TO_CHAR(order.planned_date, 'YYYY-MM-DD')", 'day')
        .addSelect('COALESCE(SUM(order.bird_count), 0)', 'total')
        .groupBy('order.planned_date')
        .getRawMany<{ day: string; total: string }>(),
      this.sanitaryQuery(batchId)
        .select("TO_CHAR(event.occurred_at, 'YYYY-MM-DD')", 'day')
        .addSelect('COALESCE(SUM(event.quantity), 0)', 'total')
        .groupBy('event.occurred_at')
        .getRawMany<{ day: string; total: string }>(),
    ]);
    const out = new Map<string, number>();
    for (const r of [...sold, ...slaughtered, ...sanitary]) {
      // TO_CHAR: a raw `date` column comes back as a local-midnight Date,
      // which toISOString() would shift to the previous day east of UTC.
      const n = Number(r.total) || 0;
      if (n > 0) out.set(r.day, (out.get(r.day) ?? 0) + n);
    }
    return out;
  }

  /**
   * Deaths declared as MORTALITE health events (they are NOT also typed in
   * the daily entries). Every mortality figure must add them to the
   * daily-entry deaths. Dates are YYYY-MM-DD.
   */
  async deathEvents(
    batchIds: string[],
  ): Promise<Array<{ batchId: string; date: string; quantity: number }>> {
    if (batchIds.length === 0) return [];
    const rows = await this.healthEventRepo
      .createQueryBuilder('event')
      .select('event.batch_id', 'batchId')
      .addSelect("TO_CHAR(event.occurred_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COALESCE(SUM(event.quantity), 0)', 'quantity')
      .where('event.batch_id IN (:...batchIds)', { batchIds })
      .andWhere('event.kind = :kind', { kind: HealthEventKind.MORTALITE })
      .groupBy('event.batch_id')
      .addGroupBy('event.occurred_at')
      .getRawMany<{ batchId: string; date: string; quantity: string }>();
    return rows
      .map((r) => ({
        batchId: r.batchId,
        date: r.date,
        quantity: Number(r.quantity) || 0,
      }))
      .filter((r) => r.quantity > 0);
  }

  private soldQuery(batchId: string, em?: EntityManager) {
    const repo = em ? em.getRepository(SaleItem) : this.saleItemRepo;
    return repo
      .createQueryBuilder('item')
      .innerJoin(
        Sale,
        'sale',
        'sale.id = item.sale_id AND sale.status <> :cancelled',
        { cancelled: SaleStatus.CANCELLED },
      )
      .where('item.batch_id = :batchId', { batchId })
      .andWhere('item.product_type IN (:...types)', {
        types: [
          SaleItemProductType.POULET_PIECE,
          SaleItemProductType.POULET_KG,
          SaleItemProductType.ABATTU_PIECE,
          SaleItemProductType.ABATTU_KG,
        ],
      })
      .andWhere('item.source_slaughter_order_id IS NULL')
      // Une vente enveloppe d'un bon de commande NON livré/annulé ne sort pas
      // du cheptel : les oiseaux sont réservés (assertBirdsAvailable), jamais
      // décrémentés avant la livraison. Les compter ici et les resoustraire à
      // la réservation les décrirait deux fois.
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM orders o WHERE o.sale_id = sale.id AND o.status IN (:...openStatuses))',
        { openStatuses: [OrderStatus.PENDING, OrderStatus.CONFIRMED] },
      );
  }

  private slaughterQuery(batchId: string, em?: EntityManager) {
    const repo = em ? em.getRepository(SlaughterOrder) : this.slaughterRepo;
    return repo
      .createQueryBuilder('order')
      .where('order.batch_id = :batchId', { batchId })
      .andWhere('order.status = :processed', {
        processed: SlaughterStatus.PROCESSED,
      });
  }

  private sanitaryQuery(batchId: string, em?: EntityManager) {
    const repo = em ? em.getRepository(HealthEvent) : this.healthEventRepo;
    return repo
      .createQueryBuilder('event')
      .where('event.batch_id = :batchId', { batchId })
      .andWhere('event.kind IN (:...kinds)', {
        kinds: [HealthEventKind.REFORME, HealthEventKind.MORTALITE],
      });
  }

  async netSoldBirds(
    batchId: string,
    em?: EntityManager,
    asOf?: string,
  ): Promise<number> {
    let qb = this.soldQuery(batchId, em);
    if (asOf) {
      qb = qb.andWhere('sale.sale_date <= :asOf', { asOf });
    }
    const row = await qb
      .select('COALESCE(SUM(COALESCE(item.piece_count, 0)), 0)', 'total')
      .getRawOne();
    return Math.max(0, Number(row?.total ?? 0));
  }

  async netSlaughteredBirds(
    batchId: string,
    em?: EntityManager,
    asOf?: string,
  ): Promise<number> {
    let qb = this.slaughterQuery(batchId, em);
    if (asOf) {
      qb = qb.andWhere('order.planned_date <= :asOf', { asOf });
    }
    const row = await qb
      .select('COALESCE(SUM(order.bird_count), 0)', 'total')
      .getRawOne();
    return Math.max(0, Number(row?.total ?? 0));
  }

  /**
   * Réforme/culling sanitaire (DISTINCT de l'abattage de production) ET pic de
   * mortalité déclaré en événement sanitaire : somme des quantités des
   * événements santé `REFORME` et `MORTALITE` enregistrés sur le lot. Ces deux
   * événements décrémentent `quantityAlive` à la création (et le réintègrent à
   * la suppression) ; leur agrégat fait partie des sorties de cheptel de la
   * réconciliation pour rester en phase à chaque saisie journalière.
   */
  async netSanitaryRemovedBirds(
    batchId: string,
    em?: EntityManager,
    asOf?: string,
  ): Promise<number> {
    let qb = this.sanitaryQuery(batchId, em);
    if (asOf) {
      qb = qb.andWhere('event.occurred_at <= :asOf', { asOf });
    }
    const row = await qb
      .select('COALESCE(SUM(event.quantity), 0)', 'total')
      .getRawOne();
    return Math.max(0, Number(row?.total ?? 0));
  }

  /**
   * Recalcule le cheptel vivant comme source de vérité :
   * arrivés − morts (saisies journalières) − oiseaux vendus (ventes non
   * annulées) − oiseaux abattus − oiseaux retirés (réformes + mortalités
   * déclarées en événement sanitaire).
   * Verrou pessimiste (dans la transaction) pour rester en phase avec les
   * décréments du POS.
   */
  async recomputeLiveCount(em: EntityManager, batchId: string) {
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
      this.netSoldBirds(batchId, em),
      this.netSlaughteredBirds(batchId, em),
      this.netSanitaryRemovedBirds(batchId, em),
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
