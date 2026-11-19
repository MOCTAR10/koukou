import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import {
  DisbursementStatus,
  FinancingDocumentStatus,
  FinancingStep,
} from '../../common/enums/financing.enum.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { todayLocal } from '../../common/utils/date.utils.js';
import { type InstitutionAccess } from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { userNames } from '../../common/utils/user-names.js';
import { ParametersService } from '../programme/parameters.service.js';
import type * as C from './financing.contract.js';
import {
  FINANCING_STEP_ORDER,
  allocateRepayments,
  claimClassOf,
  instalmentState,
  sumTranches,
} from './financing-rules.js';
import { FinancingDisbursement } from './entities/financing-disbursement.entity.js';
import { FinancingDocument } from './entities/financing-document.entity.js';
import { FinancingFile } from './entities/financing-file.entity.js';
import { FinancingInstalment } from './entities/financing-instalment.entity.js';
import { FinancingRepayment } from './entities/financing-repayment.entity.js';
import { FinancingRequirement } from './entities/financing-requirement.entity.js';
import { FinancingStepEvent } from './entities/financing-step-event.entity.js';

export const IMPAYE_KEY = 'FINANCEMENT_IMPAYE_JOURS';
export const ECHEANCE_KEY = 'FINANCEMENT_ALERTE_ECHEANCE_JOURS';

export interface FinancingSettings {
  /** Libreville day. */
  today: string;
  impayeDays: number;
  upcomingDays: number;
}

export interface FarmInfo {
  id: string;
  code: string | null;
  name: string;
  provinceName: string | null;
  provinceCode?: string | null;
  exploitantName: string | null;
}

export interface Calc {
  amounts: C.FinancingAmounts;
  instalments: C.Instalment[];
  claimClass: C.ClaimClass;
  daysLate: number;
  nextDueDate: string | null;
  allPaid: boolean;
}

/** Everything read for one file, once, for all the views built from it. */
export interface Bundle {
  file: FinancingFile;
  farm: FarmInfo;
  tranches: FinancingDisbursement[];
  instalments: FinancingInstalment[];
  repayments: FinancingRepayment[];
  documents: FinancingDocument[];
  consent: C.ConsentStatus;
  calc: Calc;
  /** Libreville day the bundle was read (document expiry). */
  today: string;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export type DocState = C.ChecklistLine['state'] | 'EXPIREE';

/** Requirement satisfied by the farm's active consent (no document needed). */
export const CONSENT_REQUIREMENT_CODE = 'DEMANDE_CONSENTEMENT';

export interface DocContext {
  /** Libreville day. */
  today: string;
  /** The farm has an ACTIVE consent. */
  consentActive: boolean;
}

/** A document past its expiry day (computed at read time). */
export function isExpired(d: Pick<FinancingDocument, 'expiresOn'>, today: string): boolean {
  return d.expiresOn !== null && d.expiresOn < today;
}

/**
 * State of a requirement from the documents filed under it: VALIDEE / DEPOSEE
 * need a document still valid; only expired ones make it EXPIREE; only
 * rejected ones REJETEE. The consent requirement is VALIDEE while the farm's
 * consent is active.
 */
export function lineState(
  req: Pick<FinancingRequirement, 'code'>,
  docs: readonly Pick<FinancingDocument, 'status' | 'expiresOn'>[],
  ctx: DocContext,
): DocState {
  if (req.code === CONSENT_REQUIREMENT_CODE && ctx.consentActive) return 'VALIDEE';
  const live = docs.filter((d) => d.status !== FinancingDocumentStatus.REJETE);
  const valid = live.filter((d) => !isExpired(d, ctx.today));
  if (valid.some((d) => d.status === FinancingDocumentStatus.VALIDE)) return 'VALIDEE';
  if (valid.some((d) => d.status === FinancingDocumentStatus.DEPOSE)) return 'DEPOSEE';
  if (live.length > 0) return 'EXPIREE';
  if (docs.length > 0) return 'REJETEE';
  return 'MANQUANTE';
}

/** Required, active requirements of `step` with no valid document (missing, rejected or expired). */
export function blockersOf(
  step: FinancingStep,
  requirements: readonly FinancingRequirement[],
  documents: readonly FinancingDocument[],
  ctx: DocContext,
): string[] {
  return requirements
    .filter((r) => r.active && r.required && r.step === step)
    .filter((r) => {
      const state = lineState(r, documents.filter((d) => d.requirementId === r.id), ctx);
      return state === 'MANQUANTE' || state === 'REJETEE' || state === 'EXPIREE';
    })
    .map((r) => r.label);
}

/**
 * Builds the contract's file views (row and detail) from the database in a
 * fixed number of queries whatever the number of files: lists, portfolio,
 * export and the 360° all read through it. Computed fields (days late, status
 * of the instalments, claim class) are never stored: they follow the
 * Libreville day and the programme parameters.
 */
@Injectable()
export class FinancingViewService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly parameters: ParametersService,
    private readonly scope: ScopeResolver,
  ) {}

  /**
   * The caller's scope when it LIMITS the financing routes: an institution
   * whose scope kind is neither FINANCED nor ALL (a FARMS agent, a PROVINCES
   * delegate) holding FINANCEMENT rights only works on the farms of its
   * scope. Null = programme-wide (platform admin, ALL, FINANCED, farm side).
   * The actor comes from the request context.
   */
  async scopeLimit(): Promise<InstitutionAccess | null> {
    const actor = RequestContext.current();
    if (!actor?.actorUserId || actor.actorRole === UserRole.PLATFORM_ADMIN) return null;
    const access = await this.scope.accessOf(actor.actorUserId);
    if (!access) return null;
    return access.scopeKind === AccessScopeKind.ALL || access.scopeKind === AccessScopeKind.FINANCED
      ? null
      : access;
  }

  /** Farm ids of the caller's limited scope, or null when programme-wide. */
  async limitedFarmIds(programId: string): Promise<string[] | null> {
    const access = await this.scopeLimit();
    if (!access) return null;
    const qb = this.dataSource
      .createQueryBuilder()
      .from('farms', 'f')
      .select('f.id', 'id')
      .where('f.program_id = :programId', { programId });
    this.scope.applyFarmScope(qb, 'f', access);
    return (await qb.getRawMany<{ id: string }>()).map((r) => r.id);
  }

  /** 403 when the caller's limited scope does not hold the farm. */
  async assertFarmAllowed(farmId: string): Promise<void> {
    const access = await this.scopeLimit();
    if (!access) return;
    await this.scope.assertFarmId(access, farmId);
  }

  /** Day and consent state used to read a checklist (expiry, auto-satisfied consent row). */
  async docContext(farmId: string, em: { query: DataSource['query'] } = this.dataSource): Promise<DocContext> {
    const rows: { n: string }[] = await em.query(
      `SELECT COUNT(*) AS n FROM farm_consents WHERE farm_id = $1 AND status = 'ACTIVE'`,
      [farmId],
    );
    return { today: todayLocal(), consentActive: Number(rows[0].n) > 0 };
  }

  async settings(now: Date = new Date()): Promise<FinancingSettings> {
    const [impaye, echeance] = await Promise.all([
      this.parameters.get<number>(IMPAYE_KEY, now),
      this.parameters.get<number>(ECHEANCE_KEY, now),
    ]);
    return {
      today: todayLocal(now),
      impayeDays: impaye ?? 90,
      upcomingDays: echeance ?? 30,
    };
  }

  async requirements(programId: string): Promise<FinancingRequirement[]> {
    const rows = await this.dataSource
      .getRepository(FinancingRequirement)
      .find({ where: { programId } });
    return rows.sort(
      (a, b) =>
        FINANCING_STEP_ORDER.indexOf(a.step) - FINANCING_STEP_ORDER.indexOf(b.step) ||
        a.sort - b.sort ||
        a.label.localeCompare(b.label, 'fr'),
    );
  }

  /** Pure computation of a file's amounts, instalments and claim class. */
  compute(
    file: FinancingFile,
    tranches: readonly FinancingDisbursement[],
    instalments: readonly FinancingInstalment[],
    repayments: readonly FinancingRepayment[],
    settings: FinancingSettings,
  ): Calc {
    const live = repayments.filter((r) => !r.cancelledAt);
    const alloc = allocateRepayments(instalments, live.map((r) => r.amountFcfa));
    const views = instalments
      .map((it, i) => ({ it, state: instalmentState(it, alloc.paid[i], settings.today) }))
      .sort((a, b) => a.it.number - b.it.number);
    const scheduled = views.reduce((s, v) => s + v.state.dueFcfa, 0);
    const disbursed = sumTranches(tranches, DisbursementStatus.DEBLOQUEE);
    const overdue = views
      .filter((v) => v.it.dueDate < settings.today)
      .reduce((s, v) => s + Math.max(0, v.state.dueFcfa - v.state.paidFcfa), 0);
    const daysLate = views.reduce((m, v) => Math.max(m, v.state.daysLate), 0);
    const allPaid = views.length > 0 && views.every((v) => v.state.status === 'PAYEE');
    const upcoming = views
      .filter((v) => v.state.status !== 'PAYEE' && v.it.dueDate >= settings.today)
      .map((v) => v.it.dueDate)
      .sort()[0];
    return {
      amounts: {
        requestedFcfa: file.requestedFcfa,
        grantedFcfa: file.grantedFcfa,
        disbursedFcfa: disbursed,
        scheduledFcfa: scheduled,
        repaidFcfa: live.reduce((s, r) => s + r.amountFcfa, 0),
        overdueFcfa: overdue,
        outstandingFcfa: Math.max(0, disbursed - alloc.principalRepaidFcfa),
      },
      instalments: views.map(({ it, state }) => ({
        id: it.id,
        number: it.number,
        dueDate: it.dueDate,
        principalFcfa: it.principalFcfa,
        interestFcfa: it.interestFcfa,
        dueFcfa: state.dueFcfa,
        paidFcfa: state.paidFcfa,
        status: state.status,
        daysLate: state.daysLate,
      })),
      claimClass: claimClassOf({
        grantedFcfa: file.grantedFcfa,
        disbursedFcfa: disbursed,
        scheduledFcfa: scheduled,
        allPaid,
        daysLate,
        claimFlag: file.claimFlag,
        impayeDays: settings.impayeDays,
      }),
      daysLate,
      nextDueDate: upcoming ?? null,
      allPaid,
    };
  }

  /** Reads the bundles of `files` (same programme) in a handful of queries. */
  async bundles(
    files: readonly FinancingFile[],
    settings: FinancingSettings,
  ): Promise<Map<string, Bundle>> {
    const out = new Map<string, Bundle>();
    if (files.length === 0) return out;
    const ids = files.map((f) => f.id);
    const farmIds = [...new Set(files.map((f) => f.farmId))];
    const [tranches, instalments, repayments, documents, farms, consents] = await Promise.all([
      this.dataSource.getRepository(FinancingDisbursement).find({ where: { fileId: In(ids) }, order: { number: 'ASC' } }),
      this.dataSource.getRepository(FinancingInstalment).find({ where: { fileId: In(ids) }, order: { number: 'ASC' } }),
      this.dataSource.getRepository(FinancingRepayment).find({ where: { fileId: In(ids) }, order: { paidOn: 'ASC', createdAt: 'ASC' } }),
      this.dataSource.getRepository(FinancingDocument).find({ where: { fileId: In(ids) }, order: { uploadedAt: 'ASC' } }),
      this.farmInfos(farmIds),
      this.consentStatuses(farmIds),
    ]);
    const by = <T extends { fileId: string }>(rows: T[]): Map<string, T[]> => {
      const m = new Map<string, T[]>();
      for (const r of rows) {
        const list = m.get(r.fileId);
        if (list) list.push(r);
        else m.set(r.fileId, [r]);
      }
      return m;
    };
    const t = by(tranches);
    const i = by(instalments);
    const r = by(repayments);
    const d = by(documents);
    for (const file of files) {
      const ft = t.get(file.id) ?? [];
      const fi = i.get(file.id) ?? [];
      const fr = r.get(file.id) ?? [];
      out.set(file.id, {
        file,
        farm: farms.get(file.farmId) ?? { id: file.farmId, code: null, name: '—', provinceName: null, exploitantName: null },
        tranches: ft,
        instalments: fi,
        repayments: fr,
        documents: d.get(file.id) ?? [],
        consent: consents.get(file.farmId) ?? 'AUCUN',
        today: settings.today,
        calc: this.compute(file, ft, fi, fr, settings),
      });
    }
    return out;
  }

  async farmInfos(farmIds: readonly string[]): Promise<Map<string, FarmInfo>> {
    if (farmIds.length === 0) return new Map();
    const rows: Array<{
      id: string;
      code: string | null;
      name: string;
      provinceName: string | null;
      provinceCode: string | null;
      exploitantName: string | null;
    }> = await this.dataSource.query(
      `SELECT f.id, f.code, f.name, p.name AS "provinceName", p.code AS "provinceCode", f.exploitant_name AS "exploitantName"
         FROM farms f LEFT JOIN provinces p ON p.id = f.province_id
        WHERE f.id = ANY($1::uuid[])`,
      [farmIds],
    );
    return new Map(rows.map((x) => [x.id, x]));
  }

  /** Current consent state of each farm (latest row wins). */
  async consentStatuses(farmIds: readonly string[]): Promise<Map<string, C.ConsentStatus>> {
    if (farmIds.length === 0) return new Map();
    const rows: Array<{ farm_id: string; status: string }> = await this.dataSource.query(
      `SELECT DISTINCT ON (farm_id) farm_id, status FROM farm_consents
        WHERE farm_id = ANY($1::uuid[]) ORDER BY farm_id, created_at DESC`,
      [farmIds],
    );
    return new Map(
      rows.map((x) => [x.farm_id, x.status === 'ACTIVE' ? 'ACTIF' : 'RETIRE'] as const),
    );
  }

  /** Document counters over the required requirements of the steps reached. */
  documentCounters(
    b: Pick<Bundle, 'file' | 'documents' | 'today' | 'consent'>,
    requirements: readonly FinancingRequirement[],
  ): C.FinancingFileRow['documents'] {
    const reached = FINANCING_STEP_ORDER.indexOf(b.file.step);
    const counters = { expected: 0, provided: 0, validated: 0, rejected: 0 };
    for (const req of requirements) {
      if (!req.active || !req.required) continue;
      if (FINANCING_STEP_ORDER.indexOf(req.step) > reached) continue;
      counters.expected += 1;
      const state = lineState(req, b.documents.filter((d) => d.requirementId === req.id), {
        today: b.today,
        consentActive: b.consent === 'ACTIF',
      });
      if (state === 'VALIDEE') {
        counters.provided += 1;
        counters.validated += 1;
      } else if (state === 'DEPOSEE') counters.provided += 1;
      else if (state === 'REJETEE') counters.rejected += 1;
    }
    return counters;
  }

  row(b: Bundle, requirements: readonly FinancingRequirement[]): C.FinancingFileRow {
    return {
      id: b.file.id,
      reference: b.file.reference,
      farmId: b.file.farmId,
      farmCode: b.farm.code ?? '',
      farmName: b.farm.name,
      provinceName: b.farm.provinceName,
      exploitantName: b.farm.exploitantName,
      purpose: b.file.purpose,
      step: b.file.step as C.FinancingStep,
      decision: b.file.decision,
      claimClass: b.calc.claimClass,
      daysLate: b.calc.daysLate,
      amounts: b.calc.amounts,
      documents: this.documentCounters(b, requirements),
      consent: b.consent,
      nextDueDate: b.calc.nextDueDate,
      updatedAt: b.file.updatedAt.toISOString(),
    };
  }

  async detail(
    b: Bundle,
    requirements: readonly FinancingRequirement[],
    rights: C.FinancingRights,
  ): Promise<C.FinancingFile> {
    // EXPIREE and the extras of the third pass extend the contract's types additively.
    const events = await this.dataSource
      .getRepository(FinancingStepEvent)
      .find({ where: { fileId: b.file.id }, order: { createdAt: 'ASC' } });
    const names = await userNames(this.dataSource, [
      ...events.map((e) => e.byId),
      ...b.repayments.flatMap((x) => [x.recordedById, x.cancelledById]),
      ...b.documents.flatMap((x) => [x.uploadedById, x.reviewedById]),
    ]);
    const nameOf = (id: string | null): string | null => (id ? (names.get(id) ?? null) : null);
    const docView = (x: FinancingDocument): C.FinancingDocument & C.DocumentExtras => ({
      id: x.id,
      requirementId: x.requirementId,
      label: x.label,
      fileName: x.originalName,
      mime: x.mime,
      sizeBytes: x.sizeBytes,
      sha256: x.sha256,
      status: x.status,
      rejectReason: x.rejectReason,
      uploadedByName: nameOf(x.uploadedById),
      uploadedAt: x.uploadedAt.toISOString(),
      reviewedByName: nameOf(x.reviewedById),
      reviewedAt: iso(x.reviewedAt),
      source: x.source,
      issuedOn: x.issuedOn,
      expiresOn: x.expiresOn,
      expired: isExpired(x, b.today),
    });
    const f = b.file;
    const ctx: DocContext = { today: b.today, consentActive: b.consent === 'ACTIF' };
    return {
      ...this.row(b, requirements),
      amountNote: f.amountNote,
      ratePct: f.ratePct,
      durationMonths: f.durationMonths,
      graceMonths: f.graceMonths,
      periodicity: f.periodicity,
      decisionDate: f.decisionDate,
      decisionNote: f.decisionNote,
      guarantees: f.guarantees,
      guaranteeFund: f.guaranteeFund,
      guaranteePct: f.guaranteePct,
      claimFlag: f.claimFlag,
      claimFlagNote: f.claimFlagNote,
      notes: f.notes,
      disbursements: b.tranches.map((t) => ({
        id: t.id,
        number: t.number,
        plannedDate: t.plannedDate,
        amountFcfa: t.amountFcfa,
        condition: t.condition,
        status: t.status,
        releasedOn: t.releasedOn,
        visitId: t.visitId,
        note: t.note,
      })),
      instalments: b.calc.instalments,
      repayments: b.repayments.map((x) => ({
        id: x.id,
        paidOn: x.paidOn,
        amountFcfa: x.amountFcfa,
        method: x.method,
        reference: x.reference,
        note: x.note,
        cancelledAt: iso(x.cancelledAt),
        cancelReason: x.cancelReason,
        recordedByName: nameOf(x.recordedById),
      })),
      checklist: requirements
        .filter((r) => r.active || b.documents.some((d) => d.requirementId === r.id))
        .map((r) => {
          const docs = b.documents.filter((d) => d.requirementId === r.id);
          return {
            requirement: this.requirementView(r),
            documents: docs.map(docView),
            // 'EXPIREE' is the third pass's additive state of the contract.
            state: lineState(r, docs, ctx) as C.ChecklistLine['state'],
          };
        }),
      otherDocuments: b.documents.filter((d) => !d.requirementId).map(docView),
      history: events.map((e) => ({
        id: e.id,
        from: e.fromStep,
        to: e.toStep,
        decision: e.decision,
        note: e.note,
        byName: nameOf(e.byId),
        at: e.createdAt.toISOString(),
      })),
      blockers: blockersOf(f.step, requirements, b.documents, ctx),
      rights,
    };
  }

  requirementView(r: FinancingRequirement): C.FinancingRequirement & C.RequirementConfig {
    return {
      providedBy: r.providedBy,
      formats: r.formats ?? [],
      validityMonths: r.validityMonths,
      templateFileName: r.templateOriginalName,
      id: r.id,
      code: r.code,
      label: r.label,
      step: r.step,
      required: r.required,
      legalBasis: r.legalBasis,
      help: r.help,
      active: r.active,
      sort: r.sort,
    };
  }
}
