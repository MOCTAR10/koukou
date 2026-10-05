import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  CashMovementSource,
  CashMovementType,
  CashSessionStatus,
} from '../../common/enums/cash-session-status.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { CashSession } from './entities/cash-session.entity.js';
import { CashMovement } from './entities/cash-movement.entity.js';
import {
  OpenCashSessionDto,
  CloseCashSessionDto,
  CreateCashMovementDto,
  UpdateCashMovementDto,
} from './dto/caisse.dto.js';
import { AccountingService } from '../accounting/accounting.service.js';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CaisseSummary {
  session: CashSession;
  movements: CashMovement[];
  expectedBalanceFcfa: number;
  inFcfa: number;
  outFcfa: number;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    (err as { code?: unknown })?.code === '23505'
  );
}

@Injectable()
export class CaisseService {
  constructor(
    @InjectRepository(CashSession)
    private readonly sessionRepo: Repository<CashSession>,
    @InjectRepository(CashMovement)
    private readonly movementRepo: Repository<CashMovement>,
    private readonly farmsService: FarmsService,
    private readonly dataSource: DataSource,
    private readonly accountingService: AccountingService,
  ) {}

  async open(
    user: AuthUser,
    farmId: string,
    dto: OpenCashSessionDto,
  ): Promise<CashSession> {
    await this.farmsService.assertAccessible(user, farmId);
    const open = await this.findOpen(farmId);
    if (open) {
      throw new BadRequestException(
        `Une session de caisse est déjà ouverte depuis le ${open.openedAt}. La clôturer avant d'en ouvrir une nouvelle.`,
      );
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      return await this.dataSource.transaction(async (em) => {
        const session = await em.getRepository(CashSession).save(
          em.getRepository(CashSession).create({
            farmId,
            status: CashSessionStatus.OPEN,
            openedAt: dto.openedAt ?? today,
            openingBalanceFcfa: dto.openingBalanceFcfa,
            openedById: user.id,
          }),
        );
        if (session.openingBalanceFcfa > 0) {
          await this.accountingService.post(em, {
            farmId,
            date: session.openedAt,
            label: `Fonds de caisse du ${session.openedAt}`,
            source: 'CAISSE',
            sourceId: `open:${session.id}`,
            lines: [
              { account: '571', debit: session.openingBalanceFcfa, label: 'Caisse — espèces' },
              { account: '108', credit: session.openingBalanceFcfa, label: 'Apports de l’exploitant' },
            ],
            operatorId: user.id,
          });
        }
        return session;
      });
    } catch (err) {
      // Index unique partiel (ferme, statut OPEN) : deux ouvertures
      // concurrentes → 23505. On re-lit la session gagnante pour la signaler.
      if (isUniqueViolation(err)) {
        const winner = await this.findOpen(farmId);
        throw new BadRequestException(
          `Une session de caisse est déjà ouverte${winner ? ` depuis le ${winner.openedAt}` : ''}. La clôturer avant d'en ouvrir une nouvelle.`,
        );
      }
      throw err;
    }
  }

  async close(
    user: AuthUser,
    farmId: string,
    dto: CloseCashSessionDto,
  ): Promise<CashSession & { summary: CaisseSummary }> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.dataSource.transaction(async (em) => {
      const session = await em.getRepository(CashSession).findOne({
        where: { farmId, status: CashSessionStatus.OPEN },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) {
        throw new BadRequestException(
          'Aucune session de caisse ouverte à clôturer.',
        );
      }
      const summary = await this.summary(farmId, session, em);
      const difference = dto.declaredBalanceFcfa - summary.expectedBalanceFcfa;
      session.status = CashSessionStatus.CLOSED;
      session.closedAt = new Date();
      session.closedById = user.id;
      session.closingBalanceFcfa = dto.declaredBalanceFcfa;
      session.closingExpectedFcfa = summary.expectedBalanceFcfa;
      session.closingDifferenceFcfa = difference;
      const saved = await em.getRepository(CashSession).save(session);
      // Comptabilité : écart de clôture → pertes divers (658) ou produits
      // divers (758) selon le signe de l'écart, contre Caisse.
      if (difference !== 0) {
        await this.accountingService.post(em, {
          farmId,
          date: saved.closedAt ? saved.closedAt.toISOString().slice(0, 10) : saved.openedAt,
          label:
            difference < 0
              ? `Clôture de caisse du ${saved.openedAt} — écart négatif ${difference} FCFA`
              : `Clôture de caisse du ${saved.openedAt} — écart positif +${difference} FCFA`,
          source: 'CAISSE',
          sourceId: `close:${saved.id}`,
          lines:
            difference < 0
              ? [
                  { account: '658', debit: -difference, label: 'Pertes et charges diverses' },
                  { account: '571', credit: -difference, label: 'Caisse — espèces' },
                ]
              : [
                  { account: '571', debit: difference, label: 'Caisse — espèces' },
                  { account: '758', credit: difference, label: 'Produits et gains divers' },
                ],
          operatorId: user.id,
        });
      }
      return { ...saved, summary };
    });
  }

  async createMovement(
    user: AuthUser,
    farmId: string,
    dto: CreateCashMovementDto,
  ): Promise<CashMovement> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.dataSource.transaction(async (em) => {
      const session = await em.getRepository(CashSession).findOne({
        where: { farmId, status: CashSessionStatus.OPEN },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) {
        throw new BadRequestException(
          'Aucune session de caisse ouverte. Ouvrir la caisse avant d’enregistrer un mouvement.',
        );
      }
      if (dto.type === CashMovementType.OUT) {
        const movements = await em.getRepository(CashMovement).find({
          where: { cashSessionId: session.id },
          order: { createdAt: 'ASC' },
        });
        let inFcfa = 0;
        let outFcfa = 0;
        for (const m of movements) {
          if (m.type === CashMovementType.IN) inFcfa += m.amountFcfa;
          else outFcfa += m.amountFcfa;
        }
        const available = session.openingBalanceFcfa + inFcfa - outFcfa;
        if (dto.amountFcfa > available) {
          throw new BadRequestException(
            `Sortie de ${dto.amountFcfa} FCFA refusée : solde de caisse disponible ${available} FCFA. Une caisse ne peut pas être négative.`,
          );
        }
      }
      const movement = await em.getRepository(CashMovement).save(
        em.getRepository(CashMovement).create({
          farmId,
          cashSessionId: session.id,
          type: dto.type,
          source: CashMovementSource.MANUAL,
          amountFcfa: dto.amountFcfa,
          reason: dto.reason ?? null,
          movementDate: dto.movementDate ?? new Date().toISOString().slice(0, 10),
          createdById: user.id,
        }),
      );

      // Comptabilité : apport (571/108) ou prélèvement (108/571) de l'exploitant.
      await this.accountingService.post(em, {
        farmId,
        date: movement.movementDate,
        label:
          dto.type === CashMovementType.IN
            ? `Apport en caisse${dto.reason ? ` — ${dto.reason}` : ''}`
            : `Prélèvement en caisse${dto.reason ? ` — ${dto.reason}` : ''}`,
        source: 'CAISSE',
        sourceId: `movement:${movement.id}`,
        lines:
          dto.type === CashMovementType.IN
            ? [
                { account: '571', debit: movement.amountFcfa, label: 'Caisse — espèces' },
                { account: '108', credit: movement.amountFcfa, label: 'Apports de l’exploitant' },
              ]
            : [
                { account: '108', debit: movement.amountFcfa, label: 'Apports de l’exploitant' },
                { account: '571', credit: movement.amountFcfa, label: 'Caisse — espèces' },
              ],
        operatorId: user.id,
      });

      return movement;
    });
  }

  async updateMovement(
    user: AuthUser,
    farmId: string,
    movementId: string,
    dto: UpdateCashMovementDto,
  ): Promise<CashMovement> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.dataSource.transaction(async (em) => {
      const movementRepo = em.getRepository(CashMovement);
      const movement = await movementRepo.findOne({
        where: { id: movementId, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!movement) throw new NotFoundException('Mouvement de caisse introuvable.');
      if (movement.source !== CashMovementSource.MANUAL) {
        throw new BadRequestException(
          'Seuls les mouvements manuels sont modifiables — les autres sont liés à des opérations comptabilisées.',
        );
      }
      const session = await em.getRepository(CashSession).findOne({
        where: { id: movement.cashSessionId ?? '' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.status !== CashSessionStatus.OPEN) {
        throw new BadRequestException(
          'Session de caisse clôturée : les mouvements sont immuables.',
        );
      }
      const nextAmount = dto.amountFcfa ?? movement.amountFcfa;
      if (
        movement.type === CashMovementType.OUT &&
        nextAmount > movement.amountFcfa
      ) {
        // Re-vérifie le « jamais négatif » hors ce mouvement.
        const movements = await em.getRepository(CashMovement).find({
          where: { cashSessionId: session.id },
        });
        let inFcfa = 0;
        let outFcfa = 0;
        for (const m of movements) {
          if (m.id === movement.id) continue;
          if (m.type === CashMovementType.IN) inFcfa += m.amountFcfa;
          else outFcfa += m.amountFcfa;
        }
        const available = session.openingBalanceFcfa + inFcfa - outFcfa;
        if (nextAmount > available) {
          throw new BadRequestException(
            `Sortie de ${nextAmount} FCFA refusée : solde de caisse disponible ${available} FCFA. Une caisse ne peut pas être négative.`,
          );
        }
      }
      if (dto.amountFcfa != null) movement.amountFcfa = dto.amountFcfa;
      if (dto.reason != null) movement.reason = dto.reason;
      if (dto.movementDate != null) movement.movementDate = dto.movementDate;
      await movementRepo.save(movement);

      // Comptabilité : ajustement 571/108 (ou 108/571) — diff vs l'ancienne,
      // équilibré et idempotent (postOrAdjust).
      const basis =
        movement.type === CashMovementType.IN
          ? 'Apport en caisse'
          : 'Prélèvement en caisse';
      await this.accountingService.postOrAdjust(
        em,
        {
          farmId,
          date: movement.movementDate,
          label: `${basis}${movement.reason ? ` — ${movement.reason}` : ''}`,
          source: 'CAISSE',
          sourceId: `movement:${movement.id}`,
          lines:
            movement.type === CashMovementType.IN
              ? [
                  { account: '571', debit: movement.amountFcfa, label: 'Caisse — espèces' },
                  { account: '108', credit: movement.amountFcfa, label: 'Apports de l’exploitant' },
                ]
              : [
                  { account: '108', debit: movement.amountFcfa, label: 'Apports de l’exploitant' },
                  { account: '571', credit: movement.amountFcfa, label: 'Caisse — espèces' },
                ],
          operatorId: user.id,
        },
        `movement:${movement.id}`,
      );
      return movement;
    });
  }

  async deleteMovement(
    user: AuthUser,
    farmId: string,
    movementId: string,
  ): Promise<{ id: string }> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.dataSource.transaction(async (em) => {
      const movementRepo = em.getRepository(CashMovement);
      const movement = await movementRepo.findOne({
        where: { id: movementId, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!movement) throw new NotFoundException('Mouvement de caisse introuvable.');
      if (movement.source !== CashMovementSource.MANUAL) {
        throw new BadRequestException(
          'Seuls les mouvements manuels sont supprimables — les autres sont liés à des opérations comptabilisées.',
        );
      }
      const session = await em.getRepository(CashSession).findOne({
        where: { id: movement.cashSessionId ?? '' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.status !== CashSessionStatus.OPEN) {
        throw new BadRequestException(
          'Session de caisse clôturée : les mouvements sont immuables.',
        );
      }
      // Comptabilité : contrepassation de l'écriture de mouvement manuel.
      await this.accountingService.post(em, {
        farmId,
        date: todayStr(),
        label: `Suppression mouvement de caisse${movement.reason ? ` — ${movement.reason}` : ''}`,
        source: 'CAISSE',
        sourceId: `movement-cancel:${movement.id}`,
        lines:
          movement.type === CashMovementType.IN
            ? [
                { account: '108', debit: movement.amountFcfa, label: 'Apports de l’exploitant' },
                { account: '571', credit: movement.amountFcfa, label: 'Caisse — espèces' },
              ]
            : [
                { account: '571', debit: movement.amountFcfa, label: 'Caisse — espèces' },
                { account: '108', credit: movement.amountFcfa, label: 'Apports de l’exploitant' },
              ],
        operatorId: user.id,
      });
      await movementRepo.delete(movementId);
      return { id: movementId };
    });
  }

  async getCurrent(
    user: AuthUser,
    farmId: string,
  ): Promise<CaisseSummary | null> {
    await this.farmsService.assertAccessible(user, farmId);
    const session = await this.findOpen(farmId);
    if (!session) return null;
    return this.summary(farmId, session);
  }

  async listSessions(user: AuthUser, farmId: string): Promise<CashSession[]> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.sessionRepo.find({
      where: { farmId },
      order: { openedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  private async findOpen(farmId: string): Promise<CashSession | null> {
    return this.sessionRepo.findOne({
      where: { farmId, status: CashSessionStatus.OPEN },
    });
  }

  private async summary(
    farmId: string,
    session: CashSession,
    em?: EntityManager,
  ): Promise<CaisseSummary> {
    const movementRepo = em ? em.getRepository(CashMovement) : this.movementRepo;
    const movements = await movementRepo.find({
      where: { cashSessionId: session.id },
      order: { createdAt: 'ASC' },
    });
    let inFcfa = 0;
    let outFcfa = 0;
    for (const m of movements) {
      if (m.type === CashMovementType.IN) inFcfa += m.amountFcfa;
      else outFcfa += m.amountFcfa;
    }
    return {
      session,
      movements,
      inFcfa,
      outFcfa,
      expectedBalanceFcfa: session.openingBalanceFcfa + inFcfa - outFcfa,
    };
  }

  /** Pour le POS : session ouverte obligatoire pour un encaissement espèces. */
  async requireOpenSession(farmId: string): Promise<{ session: CashSession }> {
    const session = await this.findOpen(farmId);
    if (!session) {
      throw new NotFoundException(
        'Aucune session de caisse ouverte : ouvrir la caisse journalière avant d’encaisser.',
      );
    }
    return { session };
  }
}
