import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type SelectQueryBuilder } from 'typeorm';
import { isUuid } from '../../common/context/request-context.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import {
  ReportLevel,
  ReportPeriodicity,
  ReportSection,
} from '../../common/enums/report.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { PdfService } from '../../common/services/pdf.service.js';
import { isUniqueViolation } from '../../common/utils/idempotency.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type ReportReadyEvent,
} from '../../common/utils/event-bus.js';
import {
  grants,
  isMembershipEffective,
  type InstitutionAccess,
} from '../access/access-rules.js';
import {
  INPUT_RECONCILIATION_SOURCE,
  type InputPeriodLine,
  type InputReconciliationSource,
} from './input-reconciliation.js';
import { ProgramMembership } from '../access/entities/program-membership.entity.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { BandeSnapshot } from '../bandes/entities/bande-snapshot.entity.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { utcDay } from '../batches/poufa/bande-rules.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { ParametersService } from '../programme/parameters.service.js';
import { ProgrammeService } from '../programme/programme.service.js';
import { BandComparisonService } from './band-comparison.service.js';
import {
  DEFAULT_REPORT_TEMPLATES,
  SECTION_LABELS,
  checkTemplate,
  hasFarmRows,
  matrixReadsRun,
} from './data/default-report-templates.js';
import {
  ReportRun,
  type ReportRecipient,
} from './entities/report-run.entity.js';
import {
  ReportTemplate,
  type ReportAudience,
} from './entities/report-template.entity.js';
import {
  PilotageDashboardService,
  type DashboardContext,
  type PilotageDashboard,
} from './pilotage-dashboard.service.js';
import { PilotageObjectiveService } from './pilotage-objective.service.js';
import {
  completenessLevel,
  groupVisible,
  lastCompletePeriod,
  mortalityLevel,
  periodContaining,
  isDay,
  type Period,
} from './pilotage-rules.js';
import { PilotageScopeService } from './pilotage-scope.service.js';
import {
  areaReport,
  bandReport,
  frDate,
  type FarmToFollow,
  type InputsSection,
} from './report-pdf.js';

/** At most this many farms are listed in « Fermes à suivre ». */
const MAX_FARMS_TO_FOLLOW = 40;
/** End-of-band runs produced per sweep (the rest waits for the next hour). */
const BAND_BATCH = 50;
/** End-of-band reports cover bands closed at most this long before the template existed. */
const BAND_LOOKBACK_DAYS = 7;

export interface UpdateTemplateInput {
  label?: string;
  periodicity?: ReportPeriodicity;
  sections?: ReportSection[];
  audience?: Partial<ReportAudience>;
  active?: boolean;
}

export interface GenerateInput {
  /** A day of the period to produce (default: the last complete one). */
  periodStart?: string;
  /** Province of a PROVINCE-level template. */
  provinceCode?: string;
  /** Closed band of the end-of-band template. */
  batchId?: string;
}

export interface RunsQuery {
  template?: string;
  level?: string;
  from?: string;
  to?: string;
  /** End-of-band runs of one band (web « Bilan POUFA » tab). */
  batchId?: string;
}

/** A new template (POUFA lot A): every field of the PATCH, plus code and level. */
export interface CreateTemplateInput {
  code: string;
  label: string;
  level: ReportLevel;
  periodicity: ReportPeriodicity;
  sections: ReportSection[];
  audience?: Partial<ReportAudience>;
  active?: boolean;
}

export interface TemplateView {
  id: string;
  code: string;
  label: string;
  periodicity: ReportPeriodicity;
  level: ReportLevel;
  sections: { code: ReportSection; label: string }[];
  audience: ReportAudience;
  active: boolean;
  /** The PDF names farms: never sent to an aggregate-only account. */
  hasFarmRows: boolean;
  updatedAt: Date;
}

export type RunView = Omit<ReportRun, 'pdf' | 'template'> & {
  downloadPath: string;
};

interface AreaTarget {
  province: { id: string; code: string; name: string } | null;
}

interface RunTarget {
  level: ReportLevel;
  provinceId: string | null;
  farm: {
    id: string;
    provinceId: string | null;
    ownerId: string | null;
  } | null;
  hasFarmRows: boolean;
}

/**
 * Scheduled PDF reports (CDC « Rapports périodiques automatiques »): the
 * templates, their runs (PDF + SHA-256 + recipients, one per template, scope
 * and period), the hourly production and the « rapport disponible » event,
 * and the scoped list and download of the runs.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly seeded = new Set<string>();

  constructor(
    @InjectRepository(ReportTemplate)
    private readonly templates: Repository<ReportTemplate>,
    @InjectRepository(ReportRun) private readonly runs: Repository<ReportRun>,
    @InjectRepository(BandeSnapshot)
    private readonly snapshots: Repository<BandeSnapshot>,
    @InjectRepository(ProductionBatch)
    private readonly batches: Repository<ProductionBatch>,
    @InjectRepository(Farm) private readonly farmRepo: Repository<Farm>,
    @InjectRepository(ProgramMembership)
    private readonly memberships: Repository<ProgramMembership>,
    @Inject(INPUT_RECONCILIATION_SOURCE)
    private readonly inputSource: InputReconciliationSource,
    private readonly pilotageScope: PilotageScopeService,
    private readonly scope: ScopeResolver,
    private readonly dashboards: PilotageDashboardService,
    private readonly objectives: PilotageObjectiveService,
    private readonly comparisons: BandComparisonService,
    private readonly parameters: ParametersService,
    private readonly programme: ProgrammeService,
    private readonly farms: FarmsService,
    private readonly pdf: PdfService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------

  /** Seeds the default templates of the programme once (never overwrites). */
  async ensureTemplates(programId: string): Promise<void> {
    if (this.seeded.has(programId)) return;
    for (const t of DEFAULT_REPORT_TEMPLATES) {
      await this.templates
        .createQueryBuilder()
        .insert()
        .into(ReportTemplate)
        .values({
          programId,
          code: t.code,
          label: t.label,
          periodicity: t.periodicity,
          level: t.level,
          sections: t.sections,
          audience: t.audience,
          active: true,
        })
        .orIgnore()
        .execute();
    }
    this.seeded.add(programId);
  }

  async listTemplates(): Promise<TemplateView[]> {
    const program = await this.programme.current();
    await this.ensureTemplates(program.id);
    const rows = await this.templates.find({
      where: { programId: program.id },
      order: { code: 'ASC' },
    });
    return rows.map((t) => this.templateView(t));
  }

  async updateTemplate(
    code: string,
    input: UpdateTemplateInput,
  ): Promise<TemplateView> {
    const template = await this.templateByCode(code);
    const next = {
      level: template.level,
      periodicity: input.periodicity ?? template.periodicity,
      sections: input.sections ?? template.sections,
      audience: {
        scopeKinds:
          input.audience?.scopeKinds ?? template.audience.scopeKinds ?? [],
        profileCodes:
          input.audience?.profileCodes ?? template.audience.profileCodes ?? [],
        farmOwners:
          input.audience?.farmOwners ?? template.audience.farmOwners ?? false,
      },
    };
    const check = checkTemplate(next);
    if (!check.ok) throw new BadRequestException(check.error);
    await this.dataSource.transaction(async (em) => {
      await em.getRepository(ReportTemplate).save({
        ...template,
        label: input.label?.trim() || template.label,
        periodicity: next.periodicity,
        sections: [...new Set(next.sections)],
        audience: {
          scopeKinds: [...new Set(next.audience.scopeKinds)],
          profileCodes: [...new Set(next.audience.profileCodes)],
          farmOwners: Boolean(next.audience.farmOwners),
        },
        active: input.active ?? template.active,
      });
    });
    return this.templateView(await this.templateByCode(code));
  }

  // POUFA lot A pilot: create and duplicate templates (CDC §5.4, §7.3
  // « modèles et périodicité paramétrables »).

  /**
   * A new template, checked like a PATCH. Its code never changes.
   * @throws ConflictException when the code exists
   */
  async createTemplate(input: CreateTemplateInput): Promise<TemplateView> {
    const program = await this.programme.current();
    await this.ensureTemplates(program.id);
    const audience: ReportAudience = {
      scopeKinds: [...new Set(input.audience?.scopeKinds ?? [])],
      profileCodes: [...new Set(input.audience?.profileCodes ?? [])],
      farmOwners: Boolean(input.audience?.farmOwners),
    };
    const sections = [...new Set(input.sections)];
    const check = checkTemplate({
      level: input.level,
      periodicity: input.periodicity,
      sections,
      audience,
    });
    if (!check.ok) throw new BadRequestException(check.error);
    try {
      await this.templates.insert({
        programId: program.id,
        code: input.code,
        label: input.label.trim(),
        periodicity: input.periodicity,
        level: input.level,
        sections,
        audience,
        active: input.active ?? true,
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(
          `Un modèle de rapport de code « ${input.code} » existe déjà.`,
        );
      }
      throw e;
    }
    return this.templateView(await this.templateByCode(input.code));
  }

  /** Copy of a template under a new code, inactive until it is reviewed. */
  async duplicateTemplate(
    code: string,
    input: { code: string; label?: string },
  ): Promise<TemplateView> {
    const source = await this.templateByCode(code);
    return this.createTemplate({
      code: input.code,
      label: input.label?.trim() || `Copie de ${source.label}`.slice(0, 160),
      level: source.level,
      periodicity: source.periodicity,
      sections: source.sections,
      audience: source.audience,
      active: false,
    });
  }
  // End POUFA lot A pilot.

  private async templateByCode(code: string): Promise<ReportTemplate> {
    const program = await this.programme.current();
    await this.ensureTemplates(program.id);
    const t = await this.templates.findOne({
      where: { programId: program.id, code },
    });
    if (!t) throw new NotFoundException(`Modèle de rapport inconnu : ${code}.`);
    return t;
  }

  private templateView(t: ReportTemplate): TemplateView {
    return {
      id: t.id,
      code: t.code,
      label: t.label,
      periodicity: t.periodicity,
      level: t.level,
      sections: t.sections.map((s) => ({
        code: s,
        label: SECTION_LABELS[s] ?? s,
      })),
      audience: t.audience,
      active: t.active,
      hasFarmRows: hasFarmRows(t.level, t.sections),
      updatedAt: t.updatedAt,
    };
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  /**
   * Hourly production: the last complete week / month of every active
   * periodic template (national, or one per province holding farms), and the
   * end-of-band report of bands closed since. Safe to run twice or on two
   * servers: a run is unique per template, scope and period.
   */
  async sweep(now: Date = new Date()): Promise<{ created: number }> {
    const program = await this.programme.current();
    await this.ensureTemplates(program.id);
    const active = await this.templates.find({
      where: { programId: program.id, active: true },
      order: { code: 'ASC' },
    });
    let created = 0;
    for (const t of active) {
      try {
        if (t.level === ReportLevel.BANDE) {
          created += await this.sweepBands(t, now);
          continue;
        }
        if (t.periodicity === ReportPeriodicity.FIN_DE_BANDE) continue;
        const period = lastCompletePeriod(t.periodicity, now);
        const targets: AreaTarget[] =
          t.level === ReportLevel.NATIONAL
            ? [{ province: null }]
            : (await this.provincesWithFarms(program.id)).map((p) => ({
                province: p,
              }));
        for (const target of targets) {
          const key = this.scopeKey(
            t.level,
            target.province?.code ?? null,
            null,
          );
          if (await this.exists(t.id, key, period.from)) continue;
          const res = await this.generateArea(t, period, target, null);
          if (res.created) created++;
        }
      } catch (err) {
        this.logger.error(`Rapports « ${t.code} » : ${String(err)}`);
      }
    }
    return { created };
  }

  /** Manual production of one run (platform admin, or PILOTAGE:CREER within scope). */
  async generateManual(
    user: AuthUser,
    code: string,
    input: GenerateInput,
  ): Promise<{ created: boolean; run: RunView }> {
    const template = await this.templateByCode(code);
    const access = await this.accessOf(user);
    if (template.level === ReportLevel.BANDE) {
      if (!input.batchId || !isUuid(input.batchId)) {
        throw new BadRequestException('Bande obligatoire (batchId).');
      }
      const batch = await this.batches.findOne({
        where: { id: input.batchId },
      });
      const farm = batch
        ? await this.farmRepo.findOne({ where: { id: batch.farmId } })
        : null;
      if (!batch || !farm || farm.programId !== template.programId) {
        throw new NotFoundException('Bande introuvable.');
      }
      this.assertCovers(access, {
        level: ReportLevel.BANDE,
        provinceId: farm.provinceId,
        farm,
        hasFarmRows: true,
      });
      if (batch.status !== BatchStatus.CLOTURE) {
        throw new BadRequestException(
          'Le rapport de fin de bande attend la clôture de la bande.',
        );
      }
      const res = await this.generateBand(template, batch, farm, user.id);
      if (!res) {
        throw new BadRequestException(
          "Le bilan figé de la bande n'est pas encore disponible : réessayez dans un instant.",
        );
      }
      return { created: res.created, run: this.runView(res.run) };
    }
    if (template.periodicity === ReportPeriodicity.FIN_DE_BANDE) {
      throw new BadRequestException('Périodicité incohérente pour ce modèle.');
    }
    const today = utcDay();
    let period: Period;
    if (input.periodStart) {
      if (!isDay(input.periodStart)) {
        throw new BadRequestException('Date invalide (attendu AAAA-MM-JJ).');
      }
      period = periodContaining(template.periodicity, input.periodStart);
    } else {
      period = lastCompletePeriod(template.periodicity);
    }
    if (period.to >= today) {
      throw new BadRequestException(
        "Cette période n'est pas terminée : un rapport porte sur une période close.",
      );
    }
    let province: AreaTarget['province'] = null;
    if (template.level === ReportLevel.PROVINCE) {
      const codeP = input.provinceCode?.trim().toUpperCase();
      if (!codeP) {
        throw new BadRequestException('Province obligatoire (provinceCode).');
      }
      const rows: { id: string; code: string; name: string }[] =
        await this.dataSource.query(
          `SELECT id, code, name FROM provinces WHERE program_id = $1 AND code = $2`,
          [template.programId, codeP],
        );
      if (!rows[0])
        throw new BadRequestException(`Province inconnue : ${codeP}.`);
      province = rows[0];
    }
    this.assertCovers(access, {
      level: template.level,
      provinceId: province?.id ?? null,
      farm: null,
      hasFarmRows: hasFarmRows(template.level, template.sections),
    });
    const res = await this.generateArea(
      template,
      period,
      { province },
      user.id,
    );
    return { created: res.created, run: this.runView(res.run) };
  }

  private async generateArea(
    template: ReportTemplate,
    period: Period,
    target: AreaTarget,
    generatedById: string | null,
  ): Promise<{ created: boolean; run: ReportRun }> {
    const farmRows = hasFarmRows(template.level, template.sections);
    const view = await this.pilotageScope.systemView(!farmRows);
    const raw = target.province ? { province: target.province.code } : {};
    const ctx = await this.dashboards.context(view, {
      ...raw,
      from: period.from,
      to: period.to,
    });
    const dashboard = await this.dashboards.build(ctx);
    const objective = template.sections.includes(ReportSection.OBJECTIF)
      ? await this.objectives.objective(view, raw)
      : null;
    const farmsToFollow =
      farmRows && template.sections.includes(ReportSection.FERMES_A_SUIVRE)
        ? await this.farmsToFollow(ctx)
        : [];
    const inputs = template.sections.includes(ReportSection.INTRANTS)
      ? await this.inputsSection(ctx, dashboard)
      : null;
    const where = target.province ? ` — ${target.province.name}` : '';
    const title = `${template.label}${where} — ${frDate(period.from)} au ${frDate(period.to)}`;
    const generatedAt = new Date();
    const pdf = await this.pdf.createAccountingPdf(
      areaReport({
        title: `${template.label}${where}`,
        heading: target.province
          ? `Programme POUFA — ${target.province.name}`
          : 'Programme POUFA — national',
        periodLabel: `Du ${frDate(period.from)} au ${frDate(period.to)}`,
        sections: template.sections,
        dashboard,
        objective,
        farmsToFollow,
        inputs,
        generatedAt,
      }),
    );
    const runTarget: RunTarget = {
      level: template.level,
      provinceId: target.province?.id ?? null,
      farm: null,
      hasFarmRows: farmRows,
    };
    return this.store(template, {
      title: title.slice(0, 200),
      scopeKey: this.scopeKey(
        template.level,
        target.province?.code ?? null,
        null,
      ),
      provinceId: target.province?.id ?? null,
      farmId: null,
      batchId: null,
      period,
      hasFarmRows: farmRows,
      pdf,
      recipients: await this.recipients(template, runTarget),
      generatedById,
    });
  }

  /** End-of-band run, or null while the band's frozen bilan is missing. */
  private async generateBand(
    template: ReportTemplate,
    batch: ProductionBatch,
    farm: Farm,
    generatedById: string | null,
  ): Promise<{ created: boolean; run: ReportRun } | null> {
    const snapshot = await this.snapshots.findOne({
      where: { batchId: batch.id },
      order: { version: 'DESC' },
    });
    if (!snapshot) return null;
    const comparison = template.sections.includes(ReportSection.COMPARAISON)
      ? await this.comparisons.compareBand(farm.programId, batch)
      : null;
    const period: Period = {
      from: batch.integrationDate.slice(0, 10),
      to: snapshot.asOf.slice(0, 10),
    };
    const label = batch.code ?? batch.batchName ?? batch.id;
    const pdf = await this.pdf.createAccountingPdf(
      bandReport({
        title: `${template.label} ${label}`,
        heading: `${farm.code ?? ''} ${farm.name}`.trim(),
        periodLabel: `Du ${frDate(period.from)} au ${frDate(period.to)}`,
        sections: template.sections,
        bandCode: batch.code,
        snapshot,
        comparison,
        generatedAt: new Date(),
      }),
    );
    return this.store(template, {
      title: `${template.label} ${label}`.slice(0, 200),
      scopeKey: this.scopeKey(ReportLevel.BANDE, null, batch.id),
      provinceId: farm.provinceId,
      farmId: farm.id,
      batchId: batch.id,
      period,
      hasFarmRows: true,
      pdf,
      recipients: await this.recipients(template, {
        level: ReportLevel.BANDE,
        provinceId: farm.provinceId,
        farm,
        hasFarmRows: true,
      }),
      generatedById,
    });
  }

  private async sweepBands(
    template: ReportTemplate,
    now: Date,
  ): Promise<number> {
    const since = new Date(
      Math.min(template.createdAt.getTime(), now.getTime()) -
        BAND_LOOKBACK_DAYS * 86_400_000,
    );
    const rows: { id: string }[] = await this.dataSource.query(
      `SELECT b.id
         FROM production_batches b
         JOIN farms f ON f.id = b.farm_id
        WHERE f.program_id = $1
          AND b.status = $2
          AND b.closed_at >= $3
          AND EXISTS (SELECT 1 FROM bande_snapshots s WHERE s.batch_id = b.id)
          AND NOT EXISTS (
            SELECT 1 FROM report_runs r
             WHERE r.template_id = $4 AND r.batch_id = b.id
          )
        ORDER BY b.closed_at
        LIMIT ${BAND_BATCH}`,
      [template.programId, BatchStatus.CLOTURE, since, template.id],
    );
    let created = 0;
    for (const { id } of rows) {
      const batch = await this.batches.findOne({ where: { id } });
      const farm = batch
        ? await this.farmRepo.findOne({ where: { id: batch.farmId } })
        : null;
      if (!batch || !farm) continue;
      // One faulty band must not stop the reports of the others.
      try {
        const res = await this.generateBand(template, batch, farm, null);
        if (res?.created) created++;
      } catch (err) {
        this.logger.error(
          `Rapport « ${template.code} », bande ${id} : ${String(err)}`,
        );
      }
    }
    return created;
  }

  private async store(
    template: ReportTemplate,
    run: {
      title: string;
      scopeKey: string;
      provinceId: string | null;
      farmId: string | null;
      batchId: string | null;
      period: Period;
      hasFarmRows: boolean;
      pdf: Buffer;
      recipients: ReportRecipient[];
      generatedById: string | null;
    },
  ): Promise<{ created: boolean; run: ReportRun }> {
    const sha256 = createHash('sha256').update(run.pdf).digest('hex');
    const inserted = await this.dataSource.transaction(async (em) =>
      em
        .createQueryBuilder()
        .insert()
        .into(ReportRun)
        .values({
          templateId: template.id,
          programId: template.programId,
          templateCode: template.code,
          title: run.title,
          level: template.level,
          scopeKey: run.scopeKey,
          provinceId: run.provinceId,
          farmId: run.farmId,
          batchId: run.batchId,
          periodStart: run.period.from,
          periodEnd: run.period.to,
          hasFarmRows: run.hasFarmRows,
          pdf: run.pdf,
          sizeBytes: run.pdf.length,
          sha256,
          recipients: run.recipients,
          generatedById: run.generatedById,
        })
        .orIgnore()
        .returning(['id'])
        .execute(),
    );
    const id = (inserted.raw as { id?: string }[])[0]?.id;
    const created = Boolean(id);
    const saved = await this.runs.findOneOrFail({
      where: created
        ? { id }
        : {
            templateId: template.id,
            scopeKey: run.scopeKey,
            periodStart: run.period.from,
          },
    });
    if (created) {
      const event: ReportReadyEvent = {
        runId: saved.id,
        templateCode: saved.templateCode,
        title: saved.title,
        level: saved.level,
        periodStart: saved.periodStart,
        periodEnd: saved.periodEnd,
        provinceId: saved.provinceId,
        farmId: saved.farmId,
        batchId: saved.batchId,
        recipientUserIds: saved.recipients.map((r) => r.userId),
        downloadPath: this.downloadPath(saved.id),
        programId: saved.programId,
        recipients: saved.recipients.map((r) => ({
          userId: r.userId,
          kind: r.kind,
          profileCode: r.profileCode,
        })),
      };
      koukouBus.emit(KOUKOU_EVENTS.REPORT_READY, event);
    }
    return { created, run: saved };
  }

  private async exists(
    templateId: string,
    scopeKey: string,
    periodStart: string,
  ): Promise<boolean> {
    return this.runs.exists({ where: { templateId, scopeKey, periodStart } });
  }

  private scopeKey(
    level: ReportLevel,
    provinceCode: string | null,
    batchId: string | null,
  ): string {
    if (level === ReportLevel.BANDE) return `BANDE:${batchId}`;
    if (level === ReportLevel.PROVINCE) return `PROVINCE:${provinceCode}`;
    return 'NATIONAL';
  }

  private async provincesWithFarms(
    programId: string,
  ): Promise<{ id: string; code: string; name: string }[]> {
    return this.dataSource.query(
      `SELECT p.id, p.code, p.name FROM provinces p
        WHERE p.program_id = $1
          AND EXISTS (SELECT 1 FROM farms f WHERE f.province_id = p.id)
        ORDER BY p.sort, p.code`,
      [programId],
    );
  }

  /**
   * POUFA lot A: « Intrants et ressources » of the period, from
   * `INPUT_RECONCILIATION_SOURCE` (deliveries shipped in the period) and the
   * dashboard's stock gaps over `SEUIL_ECART_INTRANTS_PCT`. For an
   * aggregate-only report, an input delivered to fewer than k farms is hidden.
   */
  private async inputsSection(
    ctx: DashboardContext,
    dashboard: PilotageDashboard,
  ): Promise<InputsSection> {
    const available =
      this.inputSource.available && Boolean(this.inputSource.periodLines);
    const farmIds = ctx.rows.map((r) => r.farm.id);
    const lines: InputPeriodLine[] =
      available && farmIds.length > 0
        ? await this.inputSource.periodLines!(farmIds, ctx.period)
        : [];
    const k = ctx.minGroupSize;
    return {
      available,
      thresholdPct: dashboard.inputs.thresholdPct,
      lines: lines.map((l) => ({
        ...l,
        suppressed: ctx.view.aggregateOnly && !groupVisible(l.farms, k),
      })),
      gaps: dashboard.inputs.figures,
      gapsSuppressed: dashboard.inputs.suppressed,
    };
  }

  /**
   * Farms to follow up: red mortality, red completeness or a published
   * sanitary alert, worst first (map thresholds).
   */
  private async farmsToFollow(ctx: DashboardContext): Promise<FarmToFollow[]> {
    const resolver = await this.parameters.resolver(ctx.view.programId);
    const now = new Date();
    const mT = {
      jaune: Number(resolver.value('CARTE_MORTALITE_JAUNE_PCT', now)),
      rouge: Number(resolver.value('CARTE_MORTALITE_ROUGE_PCT', now)),
    };
    const cT = {
      jaune: Number(resolver.value('CARTE_COMPLETUDE_JAUNE_PCT', now)),
      rouge: Number(resolver.value('CARTE_COMPLETUDE_ROUGE_PCT', now)),
    };
    const provinces = new Map(ctx.provinces.map((p) => [p.id, p.name]));
    const out: (FarmToFollow & { score: number })[] = [];
    for (const { farm, facts } of ctx.rows) {
      if (facts.bands === 0 && facts.publishedAlerts === 0) continue;
      const mortalityPct = ctx.indicators.mortality(facts.deaths, facts.exposed);
      const completenessPct = ctx.indicators.completeness(
        facts.daysEntered,
        facts.daysElapsed,
      );
      const reasons: string[] = [];
      if (mortalityLevel(mortalityPct, mT) === 'ROUGE')
        reasons.push('mortalité');
      if (completenessLevel(completenessPct, cT) === 'ROUGE')
        reasons.push('saisies');
      // F1: only a published sanitary alert, never a conduct alert.
      if (facts.publishedAlerts > 0) reasons.push('alerte sanitaire publiée');
      if (reasons.length === 0) continue;
      out.push({
        code: farm.code,
        name: farm.name,
        province: farm.provinceId ? (provinces.get(farm.provinceId) ?? '') : '',
        mortalityPct,
        completenessPct,
        publishedAlerts: facts.publishedAlerts,
        reason: reasons.join(', '),
        score: reasons.length * 1000 + (mortalityPct ?? 0),
      });
    }
    return out
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_FARMS_TO_FOLLOW)
      .map(({ score: _score, ...f }) => f);
  }

  // -------------------------------------------------------------------------
  // Recipients and visibility
  // -------------------------------------------------------------------------

  /** Accounts told a run is available (owner, institutional members in scope). */
  private async recipients(
    template: ReportTemplate,
    target: RunTarget,
  ): Promise<ReportRecipient[]> {
    const out: ReportRecipient[] = [];
    if (template.audience.farmOwners && target.farm?.ownerId) {
      out.push({
        userId: target.farm.ownerId,
        kind: 'OWNER',
        profileCode: null,
      });
    }
    const kinds = template.audience.scopeKinds ?? [];
    if (kinds.length === 0) return out;
    const members = await this.memberships.find({
      where: { active: true },
      relations: { profile: true },
    });
    const now = new Date();
    for (const m of members) {
      const p = m.profile;
      if (!p || p.programId !== template.programId) continue;
      if (!isMembershipEffective(m, now)) continue;
      if (!kinds.includes(p.scopeKind)) continue;
      const codes = template.audience.profileCodes ?? [];
      if (codes.length > 0 && !codes.includes(p.code)) continue;
      // PILOTAGE:CONSULTER, or TECHNIQUE:CONSULTER for an end-of-band run.
      if (!matrixReadsRun(p.matrix ?? {}, template.level)) continue;
      const access = {
        scopeKind: p.scopeKind,
        provinceIds: m.provinceIds ?? [],
        farmIds: m.farmIds ?? [],
      };
      if (!this.covers(access, target)) continue;
      if (out.some((r) => r.userId === m.userId)) continue;
      out.push({ userId: m.userId, kind: 'MEMBER', profileCode: p.code });
    }
    return out;
  }

  /** Whether a scope reaches a run's content. */
  private covers(
    access: Pick<InstitutionAccess, 'scopeKind' | 'provinceIds' | 'farmIds'>,
    target: RunTarget,
  ): boolean {
    switch (access.scopeKind) {
      case AccessScopeKind.ALL:
        return true;
      case AccessScopeKind.AGGREGATE:
        return !target.hasFarmRows && target.level !== ReportLevel.BANDE;
      case AccessScopeKind.PROVINCES:
        return (
          target.level !== ReportLevel.NATIONAL &&
          target.provinceId !== null &&
          access.provinceIds.includes(target.provinceId)
        );
      case AccessScopeKind.FARMS:
        return (
          target.level === ReportLevel.BANDE &&
          target.farm !== null &&
          access.farmIds.includes(target.farm.id)
        );
      default:
        return false;
    }
  }

  /** @throws ForbiddenException when an institution's scope does not reach the run */
  private assertCovers(
    access: InstitutionAccess | null,
    target: RunTarget,
  ): void {
    if (!access) return;
    if (!this.covers(access, target)) {
      throw new ForbiddenException(
        'Accès refusé : ce rapport porte sur des données hors de votre périmètre.',
      );
    }
  }

  /** Platform admin → null; institution → its access; others → 403. */
  private async accessOf(user: AuthUser): Promise<InstitutionAccess | null> {
    if (user.role === UserRole.PLATFORM_ADMIN) return null;
    if (user.role === UserRole.INSTITUTION)
      return this.scope.requireAccess(user);
    throw new ForbiddenException(
      'Accès refusé : seuls l’administration et les comptes institutionnels produisent des rapports.',
    );
  }

  /** Restricts a `report_runs` query (alias `r`) to what the user may read. */
  private async restrictRuns(
    user: AuthUser,
    qb: SelectQueryBuilder<ReportRun>,
  ): Promise<void> {
    if (user.role === UserRole.PLATFORM_ADMIN) return;
    if (user.role === UserRole.INSTITUTION) {
      const access = await this.scope.requireAccess(user);
      // POUFA lot A: the runs routes are open to every membership (SESSION);
      // the matrix decides here — PILOTAGE:CONSULTER reads every run in
      // scope, TECHNIQUE:CONSULTER only the end-of-band ones.
      const pilotage = grants(access.matrix, 'PILOTAGE', 'CONSULTER');
      if (!pilotage && !matrixReadsRun(access.matrix, ReportLevel.BANDE)) {
        throw new ForbiddenException(
          'Accès refusé : votre profil ne donne pas accès aux rapports du programme.',
        );
      }
      if (!pilotage) {
        qb.andWhere('r.level = :bandOnlyLevel', {
          bandOnlyLevel: ReportLevel.BANDE,
        });
      }
      qb.andWhere('r.program_id = :runsProgramId', {
        runsProgramId: access.programId,
      });
      switch (access.scopeKind) {
        case AccessScopeKind.ALL:
          return;
        case AccessScopeKind.AGGREGATE:
          qb.andWhere('r.has_farm_rows = false').andWhere(
            'r.level <> :bandLevel',
            {
              bandLevel: ReportLevel.BANDE,
            },
          );
          return;
        case AccessScopeKind.PROVINCES:
          if (access.provinceIds.length === 0) qb.andWhere('1 = 0');
          else {
            qb.andWhere('r.level <> :nationalLevel', {
              nationalLevel: ReportLevel.NATIONAL,
            }).andWhere('r.province_id IN (:...runsProvinceIds)', {
              runsProvinceIds: [...access.provinceIds],
            });
          }
          return;
        case AccessScopeKind.FARMS:
          if (access.farmIds.length === 0) qb.andWhere('1 = 0');
          else {
            qb.andWhere('r.level = :bandLevel', {
              bandLevel: ReportLevel.BANDE,
            }).andWhere('r.farm_id IN (:...runsFarmIds)', {
              runsFarmIds: [...access.farmIds],
            });
          }
          return;
        default:
          qb.andWhere('1 = 0');
          return;
      }
    }
    // Farm owner or member: the end-of-band reports of his farms.
    const farmIds = (await this.farms.findMine(user)).map((f) => f.id);
    if (farmIds.length === 0) {
      qb.andWhere('1 = 0');
      return;
    }
    qb.andWhere('r.level = :bandLevel', {
      bandLevel: ReportLevel.BANDE,
    }).andWhere('r.farm_id IN (:...runsFarmIds)', { runsFarmIds: farmIds });
  }

  async listRuns(user: AuthUser, query: RunsQuery): Promise<RunView[]> {
    const qb = this.runs.createQueryBuilder('r');
    await this.restrictRuns(user, qb);
    if (query.template) {
      qb.andWhere('r.template_code = :template', { template: query.template });
    }
    if (query.level) qb.andWhere('r.level = :level', { level: query.level });
    if (query.batchId) {
      if (!isUuid(query.batchId))
        throw new BadRequestException('Bande : identifiant invalide.');
      qb.andWhere('r.batch_id = :batchId', { batchId: query.batchId });
    }
    if (query.from) {
      if (!isDay(query.from))
        throw new BadRequestException('Date de début invalide.');
      qb.andWhere('r.period_end >= :from', { from: query.from });
    }
    if (query.to) {
      if (!isDay(query.to))
        throw new BadRequestException('Date de fin invalide.');
      qb.andWhere('r.period_start <= :to', { to: query.to });
    }
    const rows = await qb
      .orderBy('r.created_at', 'DESC')
      .addOrderBy('r.title', 'ASC')
      .take(500)
      .getMany();
    return rows.map((r) => this.runView(r));
  }

  /** @throws NotFoundException when absent or out of the user's reach */
  async findRun(user: AuthUser, id: string): Promise<RunView> {
    return this.runView(await this.loadRun(user, id, false));
  }

  async pdfOf(
    user: AuthUser,
    id: string,
  ): Promise<{ run: ReportRun; pdf: Buffer }> {
    const run = await this.loadRun(user, id, true);
    return { run, pdf: run.pdf! };
  }

  private async loadRun(
    user: AuthUser,
    id: string,
    withPdf: boolean,
  ): Promise<ReportRun> {
    if (!isUuid(id)) throw new NotFoundException('Rapport introuvable.');
    const qb = this.runs.createQueryBuilder('r').where('r.id = :id', { id });
    if (withPdf) qb.addSelect('r.pdf');
    await this.restrictRuns(user, qb);
    const run = await qb.getOne();
    if (!run) throw new NotFoundException('Rapport introuvable.');
    return run;
  }

  private runView(r: ReportRun): RunView {
    const { pdf: _pdf, template: _template, ...rest } = r;
    return { ...rest, downloadPath: this.downloadPath(r.id) };
  }

  private downloadPath(id: string): string {
    return `/pilotage/reports/runs/${id}/pdf`;
  }
}
