import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import {
  SORTIE_FAMILY,
  Sortie,
} from '../bandes/entities/sortie.entity.js';
import { RefItem } from '../programme/entities/ref-item.entity.js';
import { Operator } from './entities/operator.entity.js';
import type { TraceLot } from './entities/trace-lot.entity.js';
import { saleCessionLines, type SaleCessionItem } from './sale-cessions.js';
import { TraceLotsService } from './trace-lots.service.js';

export interface SaleCessionInput {
  farmId: string;
  saleId: string;
  referenceNumber: string;
  /** Day the animals change hands (sale day, delivery day for an order). */
  day: string;
  customerId: string | null;
  userId: string | null;
  items: readonly SaleCessionItem[];
}

/**
 * Cessions from Fermia sales (A4 friction F4, CDC §6.1 « Sortie de ferme et
 * cession »): a POS sale, an order delivered or a carcass sale to a customer
 * linked to a programme operator (`customers.operator_id`) cedes the lot, in
 * the sale's transaction. Each band of the sale gets a VENTE sortie linked to
 * the sale, then the sub-lot, its QR and the CESSION event through
 * `TraceLotsService.cede` (the sortie hook's own path).
 *
 * Never twice: the sortie is a record, the sale stays what counts in the
 * headcount (a VENTE sortie is never counted itself), carcass cessions carry
 * no live weight, and a sale already recorded by a sortie (a VENTE sortie
 * books its sale) gets no second one.
 */
@Injectable()
export class SaleCessionService {
  private readonly logger = new Logger(SaleCessionService.name);

  constructor(private readonly lots: TraceLotsService) {}

  /** The sub-lots created (none without an active operator). */
  async cedeSale(
    em: EntityManager,
    input: SaleCessionInput,
  ): Promise<TraceLot[]> {
    if (!input.customerId) return [];
    const customers: {
      operatorId: string | null;
      fullName: string | null;
      phone: string | null;
    }[] = await em.query(
      `SELECT operator_id AS "operatorId", full_name AS "fullName", phone
         FROM customers WHERE id = $1 AND farm_id = $2`,
      [input.customerId, input.farmId],
    );
    const customer = customers[0];
    if (!customer?.operatorId) return [];
    const lines = saleCessionLines(input.items);
    if (lines.length === 0) return [];
    const already: unknown[] = await em.query(
      'SELECT 1 FROM sorties WHERE sale_id = $1 LIMIT 1',
      [input.saleId],
    );
    if (already.length > 0) return [];

    const farms: { programId: string }[] = await em.query(
      'SELECT program_id AS "programId" FROM farms WHERE id = $1',
      [input.farmId],
    );
    const programId = farms[0]?.programId;
    const operator = await em
      .getRepository(Operator)
      .findOne({ where: { id: customer.operatorId } });
    // A customer linked to an operator since deactivated: the sale goes
    // through, without a cession (a sale is never blocked by traceability).
    if (!programId || !operator?.active || operator.programId !== programId) {
      this.logger.warn(
        `Vente ${input.referenceNumber} : opérateur du client inactif ou hors programme, aucune cession.`,
      );
      return [];
    }
    const reasons = await em.getRepository(RefItem).find({
      where: {
        programId,
        listType: ProgramListType.MOTIF_SORTIE,
        family: SORTIE_FAMILY.VENTE,
      },
      order: { active: 'DESC', sort: 'ASC', code: 'ASC' },
    });
    const reason = reasons[0];
    if (!reason) {
      this.logger.warn(
        `Vente ${input.referenceNumber} : aucun motif de sortie de la famille VENTE, aucune cession.`,
      );
      return [];
    }

    const out: TraceLot[] = [];
    for (const line of lines) {
      const repo = em.getRepository(Sortie);
      const sortie = await repo.save(
        repo.create({
          farmId: input.farmId,
          batchId: line.batchId,
          sortieDate: input.day,
          count: line.count,
          weightKg: line.weightKg,
          reasonCode: reason.code,
          reasonFamily: SORTIE_FAMILY.VENTE,
          recipientName: customer.fullName,
          recipientPhone: customer.phone,
          operatorId: operator.id,
          unitPriceFcfa: null,
          priceUnit: null,
          saleId: input.saleId,
          slaughterOrderId: null,
          notes: line.carcass
            ? `Cession de carcasses : vente ${input.referenceNumber}`
            : `Cession : vente ${input.referenceNumber}`,
          idempotencyKey: null,
          capturedAt: new Date(),
          clockCorrected: false,
          createdById: input.userId,
        }),
      );
      const lot = await this.lots.cede(em, sortie, reason);
      if (lot) out.push(lot);
    }
    return out;
  }
}
