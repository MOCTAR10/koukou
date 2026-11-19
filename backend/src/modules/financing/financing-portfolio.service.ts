import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  DisbursementStatus,
  FinancingStep,
} from '../../common/enums/financing.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { addMonths, FINANCING_STEP_ORDER } from './financing-rules.js';
import { toXlsx } from '../../common/utils/spreadsheet.js';
import { grants, type InstitutionAccess } from '../access/access-rules.js';
import type { GrantableDomain } from '../access/access-domains.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { ProgrammeService } from '../programme/programme.service.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { ConsentService } from './consent.service.js';
import { FinancingFile } from './entities/financing-file.entity.js';
import type * as C from './financing.contract.js';
import { FinancingService } from './financing.service.js';
import { FinancingViewService } from './financing-view.service.js';

const CLAIM_CLASSES: readonly C.ClaimClass[] = [
  'SANS_OBJET',
  'SAIN',
  'SENSIBLE',
  'IMPAYE',
  'DOUTEUX',
  'RESTRUCTURE',
  'IRRECOUVRABLE',
  'SOLDE',
];

const STEP_LABELS: Record<C.FinancingStep, string> = {
  DEMANDE: 'Demande',
  INSTRUCTION: 'Instruction',
  DECISION: 'Décision',
  DECAISSEMENT: 'Décaissement',
  SUIVI: 'Suivi',
  CLOTURE: 'Clôture',
};

const CLAIM_LABELS: Record<C.ClaimClass, string> = {
  SANS_OBJET: 'Sans encours',
  SAIN: 'Saine',
  SENSIBLE: 'Sensible',
  IMPAYE: 'Impayée',
  DOUTEUX: 'Douteuse',
  RESTRUCTURE: 'Restructurée',
  IRRECOUVRABLE: 'Irrécouvrable',
  SOLDE: 'Soldée',
};

/** Caller's reach: its access (null = platform admin) and the domains it reads. */
export interface Reach {
  access: InstitutionAccess | null;
  reads: (domain: GrantableDomain) => boolean;
}

/** Portfolio dashboard, its watchlist and the Excel export of the financer workspace. */
@Injectable()
export class FinancingPortfolioService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly programme: ProgrammeService,
    private readonly scope: ScopeResolver,
    private readonly view: FinancingViewService,
    private readonly files: FinancingService,
    private readonly consents: ConsentService,
    private readonly constants: ReferenceConstantsService,
  ) {}

  /** Files of the programme, limited to the caller's scope when it is not programme-wide. */
  private async scopedFiles(programId: string): Promise<FinancingFile[]> {
    const limited = await this.view.limitedFarmIds(programId);
    return this.dataSource
      .getRepository(FinancingFile)
      .find({ where: limited ? { programId, farmId: In(limited) } : { programId } });
  }

  async reachOf(user: AuthUser): Promise<Reach> {
    if (user.role === UserRole.PLATFORM_ADMIN) {
      return { access: null, reads: () => true };
    }
    const access = await this.scope.requireAccess(user);
    return { access, reads: (d) => grants(access.matrix, d, 'CONSULTER') };
  }

  /** Farms of `ids` the caller's perimeter reaches (all of them for the platform admin). */
  async farmsInReach(reach: Reach, ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    if (!reach.access) return new Set(ids);
    const qb = this.dataSource
      .createQueryBuilder()
      .from(Farm, 'f')
      .select('f.id', 'id')
      .where('f.id IN (:...ids)', { ids: [...ids] });
    this.scope.applyFarmScope(qb, 'f', reach.access);
    return new Set((await qb.getRawMany<{ id: string }>()).map((r) => r.id));
  }

  private async farmsInScopeCount(reach: Reach, programId: string): Promise<number> {
    const qb = this.dataSource
      .createQueryBuilder()
      .from(Farm, 'f')
      .where('f.program_id = :programId', { programId });
    if (reach.access) this.scope.applyFarmScope(qb, 'f', reach.access);
    return qb.getCount();
  }

  async portfolio(user: AuthUser): Promise<C.PortfolioView> {
    const program = await this.programme.current();
    await this.files.ensureRequirements(program.id);
    const reach = await this.reachOf(user);
    const settings = await this.view.settings();
    const files = await this.scopedFiles(program.id);
    const bundles = await this.view.bundles(files, settings);
    const requirements = await this.view.requirements(program.id);
    const rows = files.map((f) => this.view.row(bundles.get(f.id)!, requirements));
    const all = [...bundles.values()];

    const sum = (f: (b: (typeof all)[number]) => number) => all.reduce((s, b) => s + f(b), 0);
    const outstanding = sum((b) => b.calc.amounts.outstandingFcfa);
    const dueToDate = all.reduce(
      (s, b) => s + b.calc.instalments.filter((i) => i.dueDate <= settings.today).reduce((x, i) => x + i.dueFcfa, 0),
      0,
    );
    const paidToDate = all.reduce(
      (s, b) => s + b.calc.instalments.filter((i) => i.dueDate <= settings.today).reduce((x, i) => x + Math.min(i.paidFcfa, i.dueFcfa), 0),
      0,
    );
    const atRisk = all
      .filter((b) => b.calc.claimClass === 'IMPAYE' || b.calc.claimClass === 'DOUTEUX')
      .reduce((s, b) => s + b.calc.amounts.outstandingFcfa, 0);
    const money = (b: (typeof all)[number]) => b.calc.amounts.grantedFcfa ?? b.calc.amounts.requestedFcfa ?? 0;

    const bucket = (
      keys: readonly string[],
      labelOf: (k: string) => string,
      keyOf: (b: (typeof all)[number]) => string,
      amount: (b: (typeof all)[number]) => number,
    ): C.PortfolioBucket[] =>
      keys.map((key) => {
        const inBucket = all.filter((b) => keyOf(b) === key);
        return { key, label: labelOf(key), files: inBucket.length, amountFcfa: inBucket.reduce((s, b) => s + amount(b), 0) };
      });

    // Key = province CODE (same value as GET files?province=), label = its name.
    const provinceKey = (b: (typeof all)[number]) => b.farm.provinceCode ?? 'SANS';
    const provinceLabels = new Map(all.map((b) => [provinceKey(b), b.farm.provinceName ?? 'Sans province']));
    const provinces = [...provinceLabels.keys()].sort((a, b) => provinceLabels.get(a)!.localeCompare(provinceLabels.get(b)!, 'fr'));
    const monthKeys: string[] = [];
    for (let i = 11; i >= 0; i--) monthKeys.push(addMonths(`${settings.today.slice(0, 7)}-01`, -i).slice(0, 7));
    const monthly = monthKeys.map((month) => ({ month, disbursedFcfa: 0, repaidFcfa: 0, dueFcfa: 0 }));
    const slot = (date: string | null) => (date ? monthly.find((m) => m.month === date.slice(0, 7)) : undefined);
    for (const b of all) {
      for (const t of b.tranches) {
        if (t.status === DisbursementStatus.DEBLOQUEE) {
          const m = slot(t.releasedOn);
          if (m) m.disbursedFcfa += t.amountFcfa;
        }
      }
      for (const r of b.repayments) {
        if (r.cancelledAt) continue;
        const m = slot(r.paidOn);
        if (m) m.repaidFcfa += r.amountFcfa;
      }
      for (const i of b.calc.instalments) {
        const m = slot(i.dueDate);
        if (m) m.dueFcfa += i.dueFcfa;
      }
    }

    const limit = new Date(Date.parse(`${settings.today}T00:00:00Z`) + settings.upcomingDays * 86_400_000).toISOString().slice(0, 10);
    const upcoming = all
      .flatMap((b) =>
        b.calc.instalments
          .filter((i) => i.status !== 'PAYEE' && i.dueDate >= settings.today && i.dueDate <= limit)
          .map((i) => ({
            fileId: b.file.id,
            reference: b.file.reference,
            farmName: b.farm.name,
            dueDate: i.dueDate,
            dueFcfa: i.dueFcfa - i.paidFcfa,
          })),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.reference.localeCompare(b.reference));
    const pending = all
      .filter((b) => b.file.step !== FinancingStep.CLOTURE)
      .flatMap((b) =>
        b.tranches
          .filter((t) => t.status === DisbursementStatus.PREVUE)
          .map((t) => ({
            fileId: b.file.id,
            reference: b.file.reference,
            farmName: b.farm.name,
            number: t.number,
            plannedDate: t.plannedDate,
            amountFcfa: t.amountFcfa,
          })),
      )
      .sort((a, b) => (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999'));

    const docs = rows.reduce(
      (s, r) => ({
        expected: s.expected + r.documents.expected,
        provided: s.provided + r.documents.provided,
        validated: s.validated + r.documents.validated,
      }),
      { expected: 0, provided: 0, validated: 0 },
    );

    const financedFarms = new Set(all.filter((b) => b.calc.amounts.disbursedFcfa > 0).map((b) => b.file.farmId));
    return {
      asOf: settings.today,
      perimeter: await this.scope.financedPerimeter(program.id),
      farms: {
        inScope: await this.farmsInScopeCount(reach, program.id),
        withFile: new Set(files.map((f) => f.farmId)).size,
        financed: financedFarms.size,
      },
      totals: {
        files: files.length,
        requestedFcfa: sum((b) => b.file.requestedFcfa ?? 0),
        grantedFcfa: sum((b) => b.file.grantedFcfa ?? 0),
        disbursedFcfa: sum((b) => b.calc.amounts.disbursedFcfa),
        outstandingFcfa: outstanding,
        repaidFcfa: sum((b) => b.calc.amounts.repaidFcfa),
        overdueFcfa: sum((b) => b.calc.amounts.overdueFcfa),
        repaymentRatePct: dueToDate > 0 ? Math.round((paidToDate / dueToDate) * 1000) / 10 : null,
        atRiskPct: outstanding > 0 ? Math.round((atRisk / outstanding) * 1000) / 10 : null,
      },
      bySteps: bucket(FINANCING_STEP_ORDER, (k) => STEP_LABELS[k as C.FinancingStep], (b) => b.file.step, money),
      byClaimClass: bucket(CLAIM_CLASSES, (k) => CLAIM_LABELS[k as C.ClaimClass], (b) => b.calc.claimClass, (b) => b.calc.amounts.outstandingFcfa),
      byProvince: bucket(provinces, (k) => provinceLabels.get(k) ?? k, provinceKey, (b) => b.calc.amounts.disbursedFcfa),
      monthly,
      late: rows.filter((r) => r.daysLate > 0).sort((a, b) => b.daysLate - a.daysLate),
      upcoming,
      pendingDisbursements: pending,
      documents: docs,
      consent: await this.consents.coverage(program.id),
      watchlist: await this.watchlist(reach, program.id, all, settings.today),
    };
  }

  /**
   * Financed farms (something disbursed) with a signal worth attention. The
   * farm-data signals (sanitary alert, mortality, missing entries, margin)
   * are read in one batched query each, only for farms inside the caller's
   * perimeter and only if its matrix opens the domain; a late instalment is
   * the bank's own data and always counts.
   */
  private async watchlist(
    reach: Reach,
    programId: string,
    all: Array<{ file: FinancingFile; farm: { name: string }; calc: { amounts: C.FinancingAmounts; daysLate: number } }>,
    today: string,
  ): Promise<C.PortfolioView['watchlist']> {
    const financed = all.filter((b) => b.calc.amounts.disbursedFcfa > 0);
    if (financed.length === 0) return [];
    const farmIds = [...new Set(financed.map((b) => b.file.farmId))];
    const inReach = await this.farmsInReach(reach, farmIds);
    const reasons = new Map<string, string[]>();
    const add = (farmId: string, reason: string) => {
      const list = reasons.get(farmId);
      if (list) list.push(reason);
      else reasons.set(farmId, [reason]);
    };
    for (const b of financed) {
      if (b.calc.daysLate > 0) add(b.file.farmId, `Échéance en retard (${b.calc.daysLate} j) — ${b.file.reference}`);
    }
    const ids = farmIds.filter((id) => inReach.has(id));
    if (ids.length > 0) {
      const q = <T>(sql: string, params: unknown[]): Promise<T[]> => this.dataSource.query(sql, params);
      if (reach.reads('SANITAIRE')) {
        // Published alerts only: an unpublished one is the vets' and the farm's.
        const rows = await q<{ farm_id: string }>(
          `SELECT DISTINCT farm_id FROM sanitary_alerts
            WHERE farm_id = ANY($1::uuid[]) AND closed_at IS NULL AND published_at IS NOT NULL`,
          [ids],
        );
        for (const r of rows) add(r.farm_id, 'Alerte sanitaire ouverte');
      }
      if (reach.reads('TECHNIQUE')) {
        // The advisory mortality alert is raised above the constants' threshold.
        const warn = await this.constants.get(ReferenceKey.MORTALITY_CRITICAL_PCT, 5);
        const mortality = await q<{ farm_id: string }>(
          `SELECT DISTINCT a.farm_id FROM alerts a
             JOIN production_batches b ON b.id = a.batch_id
            WHERE a.farm_id = ANY($1::uuid[]) AND a.kind = 'MORTALITE' AND a.status = 'ACTIVE'
              AND b.status IN ('ACTIF', 'EN_VENTE')`,
          [ids],
        );
        for (const r of mortality) add(r.farm_id, `Mortalité au-dessus du seuil d’alerte (${warn} %)`);
        // Open band with no daily entry for 7 days (the band's opening counts when it has none).
        const silent = await q<{ farm_id: string }>(
          `SELECT s.farm_id FROM (
             SELECT b.farm_id, MAX(COALESCE(e.last_entry, b.integration_date)) AS last_day
               FROM production_batches b
               LEFT JOIN (SELECT batch_id, MAX(entry_date) AS last_entry FROM daily_entries GROUP BY batch_id) e
                      ON e.batch_id = b.id
              WHERE b.farm_id = ANY($1::uuid[]) AND b.status IN ('ACTIF', 'EN_VENTE')
              GROUP BY b.farm_id) s
            WHERE s.last_day < ($2::date - 7)`,
          [ids, today],
        );
        for (const r of silent) add(r.farm_id, 'Aucune saisie depuis 7 jours');
      }
      if (reach.reads('ECONOMIQUE')) {
        const since = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
        const margin = await q<{ farm_id: string }>(
          `SELECT farm_id FROM (
             SELECT farm_id, SUM(sales) - SUM(expenses) AS margin, SUM(sales) + SUM(expenses) AS activity FROM (
               SELECT farm_id, total_amount_fcfa AS sales, 0 AS expenses FROM sales
                WHERE farm_id = ANY($1::uuid[]) AND status <> 'CANCELLED' AND sale_date >= $2
               UNION ALL
               SELECT farm_id, 0, amount_fcfa FROM expenses
                WHERE farm_id = ANY($1::uuid[]) AND expense_date >= $2) x
             GROUP BY farm_id) m
            WHERE margin < 0 AND activity > 0`,
          [ids, since],
        );
        for (const r of margin) add(r.farm_id, 'Marge négative sur 90 jours');
      }
    }
    return farmIds
      .filter((id) => reasons.has(id))
      .map((id) => {
        const first = financed.find((b) => b.file.farmId === id)!;
        return { farmId: id, farmName: first.farm.name, reference: first.file.reference, reasons: reasons.get(id)! };
      })
      .sort((a, b) => b.reasons.length - a.reasons.length || a.farmName.localeCompare(b.farmName, 'fr'));
  }

  /** One row per file, Excel. */
  async export(): Promise<{ filename: string; buffer: Buffer }> {
    const program = await this.programme.current();
    await this.files.ensureRequirements(program.id);
    const settings = await this.view.settings();
    const files = await this.scopedFiles(program.id);
    const bundles = await this.view.bundles(files, settings);
    const requirements = await this.view.requirements(program.id);
    const rows = files
      .map((f) => this.view.row(bundles.get(f.id)!, requirements))
      .sort((a, b) => a.reference.localeCompare(b.reference));
    const headers = [
      'Référence', 'Code ferme', 'Ferme', 'Province', 'Exploitant', 'Objet', 'Étape', 'Décision', 'Classe de créance',
      'Jours de retard', 'Montant demandé (FCFA)', 'Montant accordé (FCFA)', 'Décaissé (FCFA)', 'Total à rembourser (FCFA)',
      'Remboursé (FCFA)', 'Impayé échu (FCFA)', 'Encours (FCFA)', 'Pièces fournies', 'Pièces attendues', 'Consentement', 'Prochaine échéance',
    ];
    const data = rows.map((r) => [
      r.reference, r.farmCode, r.farmName, r.provinceName, r.exploitantName, r.purpose, STEP_LABELS[r.step], r.decision,
      CLAIM_LABELS[r.claimClass], r.daysLate, r.amounts.requestedFcfa, r.amounts.grantedFcfa, r.amounts.disbursedFcfa,
      r.amounts.scheduledFcfa, r.amounts.repaidFcfa, r.amounts.overdueFcfa, r.amounts.outstandingFcfa, r.documents.provided,
      r.documents.expected, { AUCUN: 'Non recueilli', ACTIF: 'Donné', RETIRE: 'Retiré' }[r.consent], r.nextDueDate,
    ]);
    return {
      filename: `financement-portefeuille-${settings.today}.xlsx`,
      buffer: await toXlsx(headers, data, { sheetName: 'Portefeuille' }),
    };
  }
}
