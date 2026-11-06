import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AlertLevel } from '../../common/enums/alert-level.enum.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  SanitaryAlertOrigin,
  SanitaryAlertTransitionKind,
} from '../../common/enums/sanitary-alert.enum.js';
import { runAfterCommit } from '../../common/utils/after-commit.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type BandeStatsRefreshedEvent,
  type SanitaryAlertEvent,
} from '../../common/utils/event-bus.js';
import type { InstitutionAccess } from '../access/access-rules.js';
import {
  SanitaryDeclarationPolicy,
  mayHandleSanitaryDeclarations,
} from '../access/sanitary-declaration.policy.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { addDays, factInstant, utcDay } from '../batches/poufa/bande-rules.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { RefItem } from '../programme/entities/ref-item.entity.js';
import { IdCounterService } from '../programme/id-counter.service.js';
import { ParametersService } from '../programme/parameters.service.js';
import type { HealthEvent } from '../sanitary/entities/health-event.entity.js';
import type {
  ListSanitaryAlertsDto,
  PublishSanitaryAlertDto,
  TransitionSanitaryAlertDto,
} from './dto/sanitary-alert.dto.js';
import { SanitaryAlertTransition } from './entities/sanitary-alert-transition.entity.js';
import { SanitaryAlert } from './entities/sanitary-alert.entity.js';
import {
  sanitaryDecisionRefusal,
  type SanitaryDecision,
} from './veterinary-authority.js';
import {
  ACTIVE_FAMILIES,
  ALERT_FAMILY,
  exceededDays,
  frPct,
  outcomeAfter,
  planMortalityAlert,
  publicationCheck,
  sanitaryAlertCode,
  transitionError,
  type MortalityDay,
} from './sanitary-alert-rules.js';

/** Veterinary threshold (programme parameter, owner VETERINAIRE). */
export const MORTALITY_THRESHOLD_KEY = 'SEUIL_ALERTE_MORTALITE_JOUR_PCT';

/**
 * Days of the projection the mortality check looks back on: an entry caught
 * up late (offline phone) still opens an alert, while an old band's history
 * does not flood the vets on its first rebuild.
 */
export const MORTALITY_LOOKBACK_DAYS = 14;

const NOT_FOUND = 'Alerte sanitaire introuvable.';
const SEVERITY_RANK: Record<AlertLevel, number> = {
  [AlertLevel.VERT]: 0,
  [AlertLevel.JAUNE]: 1,
  [AlertLevel.ROUGE]: 2,
};

function frDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** An alert as the screens get it. */
export interface SanitaryAlertView {
  id: string;
  code: string;
  origin: SanitaryAlertOrigin;
  farmId: string;
  farmCode: string | null;
  farmName: string | null;
  batchId: string | null;
  batchCode: string | null;
  provinceId: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  healthEventId: string | null;
  statusCode: string;
  statusFamily: string;
  outcome: string | null;
  severity: AlertLevel;
  factDay: string;
  lastFactDay: string;
  mortalityPct: number | null;
  thresholdPct: number | null;
  deaths: number | null;
  presentStart: number | null;
  clinicalSigns: string[];
  summary: string;
  published: boolean;
  publishedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SanitaryAlertTransitionView {
  id: string;
  kind: SanitaryAlertTransitionKind;
  fromStatusCode: string | null;
  toStatusCode: string;
  toFamily: string;
  comment: string | null;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
}

/** Filter of the published alerts read by the dashboards (L6). */
export interface PublishedAlertsFilter {
  /** Fact day from (inclusive, `YYYY-MM-DD`). */
  from?: string;
  /** Fact day to (inclusive). */
  to?: string;
  /** Published at or after this instant (the steering's window). */
  publishedFrom?: Date;
  /** Published strictly before this instant. */
  publishedBefore?: Date;
  provinceIds?: readonly string[];
  /** Restrict to an institutional scope (farm-level scopes only). */
  access?: InstitutionAccess;
}

export interface PublishedAlertsByProvince {
  provinceId: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  /** Published alerts whose fact day is in the period. */
  published: number;
  /** Among them, not closed yet. */
  open: number;
}

type Viewer =
  | { kind: 'all' }
  | { kind: 'farm' }
  | { kind: 'institution'; access: InstitutionAccess; vet: boolean };

/**
 * Official sanitary alerts (POUFA plan §10): opening (mortality threshold,
 * suspicion), qualification circuit, publication, and the reads of the
 * screens and dashboards. Visibility before publication follows
 * `SanitaryDeclarationPolicy` (the farm and the veterinary services only).
 */
@Injectable()
export class SanitaryAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SanitaryAlertsService.name);
  private readonly pending = new Set<Promise<void>>();

  private readonly onStats = (e: BandeStatsRefreshedEvent) =>
    this.track(this.evaluateMortality(e));

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly parameters: ParametersService,
    private readonly counters: IdCounterService,
    private readonly farms: FarmsService,
    private readonly scope: ScopeResolver,
    private readonly declarations: SanitaryDeclarationPolicy,
  ) {}

  onModuleInit(): void {
    koukouBus.on(KOUKOU_EVENTS.BANDE_STATS_REFRESHED, this.onStats);
  }

  async onModuleDestroy(): Promise<void> {
    koukouBus.off(KOUKOU_EVENTS.BANDE_STATS_REFRESHED, this.onStats);
    await this.flush();
  }

  /** Waits for the mortality checks in flight (tests, shutdown). */
  async flush(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled(this.pending);
    }
  }

  // ---------- Opening ----------

  /**
   * Opens or extends the band's mortality alert from its projection: days
   * of the last {@link MORTALITY_LOOKBACK_DAYS} whose `mortality_day_pct`
   * passes the threshold in force on that day. One alert per episode: new
   * days extend the alert still being handled; days an earlier alert covered
   * are never raised again. Serialized per band (advisory lock).
   */
  async evaluateMortality(
    e: Pick<BandeStatsRefreshedEvent, 'batchId' | 'programId'>,
    now: Date = new Date(),
  ): Promise<SanitaryAlert | null> {
    return this.dataSource.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `sanitary-alert:${e.batchId}`,
      ]);
      const since = addDays(utcDay(now), -MORTALITY_LOOKBACK_DAYS);
      const days: MortalityDay[] = await em.query(
        `SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day,
                mortality_day_pct AS "mortalityDayPct",
                deaths, present_start AS "presentStart"
           FROM bande_daily_stats
          WHERE batch_id = $1 AND day >= $2::date
            AND mortality_day_pct IS NOT NULL
          ORDER BY day`,
        [e.batchId, since],
      );
      if (days.length === 0) return null;
      const resolver = await this.parameters.resolver(e.programId, em);
      const exceeded = exceededDays(days, (day) =>
        Number(resolver.value<number>(MORTALITY_THRESHOLD_KEY, factInstant(day, now))),
      );
      if (exceeded.length === 0) return null;

      const repo = em.getRepository(SanitaryAlert);
      const [{ covered }]: { covered: string | null }[] = await em.query(
        `SELECT TO_CHAR(MAX(last_fact_day), 'YYYY-MM-DD') AS covered
           FROM sanitary_alerts WHERE batch_id = $1 AND origin = $2`,
        [e.batchId, SanitaryAlertOrigin.MORTALITE],
      );
      const open = await repo.findOne({
        where: {
          batchId: e.batchId,
          origin: SanitaryAlertOrigin.MORTALITE,
          statusFamily: In([...ACTIVE_FAMILIES]),
        },
        order: { createdAt: 'DESC' },
      });
      const plan = planMortalityAlert({
        exceeded,
        coveredUntil: covered,
        open: open
          ? { lastFactDay: open.lastFactDay, mortalityPct: open.mortalityPct }
          : null,
      });
      if (plan.action === 'none') return null;
      if (plan.action === 'extend' && open) {
        await repo.update(open.id, {
          lastFactDay: plan.lastFactDay,
          mortalityPct: plan.mortalityPct,
        });
        return repo.findOneByOrFail({ id: open.id });
      }
      if (plan.action !== 'create') return null;
      const band: { farmId: string; code: string | null }[] = await em.query(
        `SELECT farm_id AS "farmId", code FROM production_batches WHERE id = $1`,
        [e.batchId],
      );
      if (!band[0]) return null;
      const farm = await em.getRepository(Farm).findOneByOrFail({
        id: band[0].farmId,
      });
      const first = plan.first;
      return this.open(em, {
        farm,
        batchId: e.batchId,
        origin: SanitaryAlertOrigin.MORTALITE,
        severity: AlertLevel.ROUGE,
        factDay: first.day,
        lastFactDay: plan.lastFactDay,
        mortalityPct: plan.mortalityPct,
        thresholdPct: first.thresholdPct,
        deaths: first.deaths,
        presentStart: first.presentStart,
        clinicalSigns: [],
        healthEventId: null,
        summary:
          `Mortalité du jour ${frPct(first.mortalityDayPct)} % le ${frDate(first.day)} ` +
          `(seuil vétérinaire ${frPct(first.thresholdPct)} %)` +
          (band[0].code ? ` — bande ${band[0].code}` : ''),
        createdById: null,
        comment: 'Ouverte automatiquement : seuil de mortalité journalière dépassé.',
      });
    });
  }

  /**
   * Opens the alert of a declaration of suspicion, in the caller's
   * transaction (the declaration and its alert commit together). A
   * declaration opens one alert at most.
   */
  async raiseFromDeclaration(
    em: EntityManager,
    event: HealthEvent,
    farm: Farm,
    // POUFA lot A2 vet: a declaration the vets convert into an alert (CDC
    // n° 26): opened by them, with their comment.
    conversion?: { byUserId: string; comment: string | null },
  ): Promise<SanitaryAlert> {
    const existing = await em
      .getRepository(SanitaryAlert)
      .findOne({ where: { healthEventId: event.id } });
    if (existing) return existing;
    const band: { code: string | null }[] = await em.query(
      `SELECT code FROM production_batches WHERE id = $1`,
      [event.batchId],
    );
    // A suspicion is never « vert ».
    const severity =
      SEVERITY_RANK[event.severity] >= SEVERITY_RANK[AlertLevel.JAUNE]
        ? event.severity
        : AlertLevel.JAUNE;
    const day = String(event.occurredAt).slice(0, 10);
    return this.open(em, {
      farm,
      batchId: event.batchId,
      origin: SanitaryAlertOrigin.DECLARATION,
      severity,
      factDay: day,
      lastFactDay: day,
      mortalityPct: null,
      thresholdPct: null,
      deaths: null,
      presentStart: null,
      clinicalSigns: event.clinicalSigns ?? [],
      healthEventId: event.id,
      summary: conversion
        ? `Déclaration convertie en alerte : ${event.title}`
        : `Suspicion déclarée : ${event.title}`,
      createdById: conversion ? conversion.byUserId : event.createdById,
      comment: conversion
        ? conversion.comment ||
          (band[0]?.code
            ? `Déclaration de la bande ${band[0].code} convertie en alerte par les services vétérinaires.`
            : 'Déclaration convertie en alerte par les services vétérinaires.')
        : band[0]?.code
          ? `Déclaration de suspicion sur la bande ${band[0].code}.`
          : 'Déclaration de suspicion.',
    });
  }

  private async open(
    em: EntityManager,
    input: {
      farm: Farm;
      batchId: string | null;
      origin: SanitaryAlertOrigin;
      severity: AlertLevel;
      factDay: string;
      lastFactDay: string;
      mortalityPct: number | null;
      thresholdPct: number | null;
      deaths: number | null;
      presentStart: number | null;
      clinicalSigns: string[];
      healthEventId: string | null;
      summary: string;
      createdById: string | null;
      comment: string;
    },
  ): Promise<SanitaryAlert> {
    const initial = await this.initialStatus(em, input.farm.programId);
    const year = new Date().getUTCFullYear();
    const n = await this.counters.next(`ALERTE_SANITAIRE:${year}`, em);
    const repo = em.getRepository(SanitaryAlert);
    const alert = await repo.save(
      repo.create({
        code: sanitaryAlertCode(year, n),
        programId: input.farm.programId,
        farmId: input.farm.id,
        batchId: input.batchId,
        provinceId: input.farm.provinceId,
        origin: input.origin,
        healthEventId: input.healthEventId,
        statusCode: initial.code,
        statusFamily: ALERT_FAMILY.NOUVELLE,
        outcome: null,
        severity: input.severity,
        factDay: input.factDay,
        lastFactDay: input.lastFactDay,
        mortalityPct: input.mortalityPct,
        thresholdPct: input.thresholdPct,
        deaths: input.deaths,
        presentStart: input.presentStart,
        clinicalSigns: input.clinicalSigns,
        summary: input.summary.slice(0, 300),
        publishedAt: null,
        publishedById: null,
        closedAt: null,
        createdById: input.createdById,
      }),
    );
    await em.getRepository(SanitaryAlertTransition).save({
      alertId: alert.id,
      kind: SanitaryAlertTransitionKind.CREATION,
      fromStatusCode: null,
      toStatusCode: initial.code,
      toFamily: ALERT_FAMILY.NOUVELLE,
      comment: input.comment,
      authorId: input.createdById,
    });
    const event = this.busEvent(alert);
    runAfterCommit(em, () =>
      koukouBus.emit(KOUKOU_EVENTS.SANITARY_ALERT_CREATED, event),
    );
    return alert;
  }

  /** First active NOUVELLE status of the programme's STATUT_ALERTE list. */
  private async initialStatus(
    em: EntityManager,
    programId: string,
  ): Promise<RefItem> {
    const item = await em.getRepository(RefItem).findOne({
      where: {
        programId,
        listType: ProgramListType.STATUT_ALERTE,
        family: ALERT_FAMILY.NOUVELLE,
        active: true,
      },
      order: { sort: 'ASC', label: 'ASC' },
    });
    if (!item) {
      throw new BadRequestException(
        'Aucun statut actif de famille NOUVELLE dans la liste STATUT_ALERTE.',
      );
    }
    return item;
  }

  // ---------- Qualification and publication ----------

  /**
   * Moves the alert along the circuit (veterinary services: SANITAIRE
   * MODIFIER in the matrix, and the declarations rule).
   */
  async transition(
    user: AuthUser,
    alertId: string,
    dto: TransitionSanitaryAlertDto,
  ): Promise<SanitaryAlertView & { transitions: SanitaryAlertTransitionView[] }> {
    await this.declarations.assert(user);
    const viewer = await this.viewer(user);
    this.assertDecision(user, viewer, 'qualify');
    await this.dataSource.transaction(async (em) => {
      const alert = await this.lockAlert(em, alertId);
      await this.assertVisible(viewer, alert, em);
      const target = await em.getRepository(RefItem).findOne({
        where: {
          programId: alert.programId,
          listType: ProgramListType.STATUT_ALERTE,
          code: dto.statusCode,
        },
      });
      if (!target || !target.family) {
        throw new BadRequestException(
          `Statut « ${dto.statusCode} » inconnu dans la liste STATUT_ALERTE.`,
        );
      }
      const error = transitionError(
        { code: alert.statusCode, family: alert.statusFamily },
        { code: target.code, family: target.family, active: target.active },
        dto.comment,
      );
      if (error) throw new BadRequestException(error);
      const from = alert.statusCode;
      alert.statusCode = target.code;
      alert.statusFamily = target.family;
      alert.outcome = outcomeAfter(alert.outcome, target.family);
      if (target.family === ALERT_FAMILY.CLOSE) alert.closedAt = new Date();
      await em.getRepository(SanitaryAlert).save(alert);
      const transition = await em.getRepository(SanitaryAlertTransition).save({
        alertId: alert.id,
        kind: SanitaryAlertTransitionKind.STATUT,
        fromStatusCode: from,
        toStatusCode: target.code,
        toFamily: target.family,
        comment: dto.comment?.trim() || null,
        authorId: user.id,
      });
      const event = { ...this.busEvent(alert), transitionId: transition.id };
      runAfterCommit(em, () =>
        koukouBus.emit(KOUKOU_EVENTS.SANITARY_ALERT_STATUS_CHANGED, event),
      );
    });
    return this.detail(user, alertId);
  }

  /**
   * Publication by the veterinary authority (SANITAIRE VALIDER): once, and
   * only for a confirmed alert. From then on the dashboards read it.
   */
  async publish(
    user: AuthUser,
    alertId: string,
    dto: PublishSanitaryAlertDto,
  ): Promise<SanitaryAlertView & { transitions: SanitaryAlertTransitionView[] }> {
    await this.declarations.assert(user);
    const viewer = await this.viewer(user);
    this.assertDecision(user, viewer, 'publish');
    await this.dataSource.transaction(async (em) => {
      const alert = await this.lockAlert(em, alertId);
      await this.assertVisible(viewer, alert, em);
      const check = publicationCheck(alert);
      if (!check.ok) {
        throw check.conflict
          ? new ConflictException(check.error)
          : new BadRequestException(check.error);
      }
      alert.publishedAt = new Date();
      alert.publishedById = user.id;
      await em.getRepository(SanitaryAlert).save(alert);
      const transition = await em.getRepository(SanitaryAlertTransition).save({
        alertId: alert.id,
        kind: SanitaryAlertTransitionKind.PUBLICATION,
        fromStatusCode: alert.statusCode,
        toStatusCode: alert.statusCode,
        toFamily: alert.statusFamily,
        comment: dto.comment?.trim() || null,
        authorId: user.id,
      });
      const event = { ...this.busEvent(alert), transitionId: transition.id };
      runAfterCommit(em, () =>
        koukouBus.emit(KOUKOU_EVENTS.SANITARY_ALERT_PUBLISHED, event),
      );
    });
    return this.detail(user, alertId);
  }

  /**
   * CDC n° 25-26: only the veterinary authority (matrix grant + declarations
   * rule) qualifies or publishes; the platform admin keeps read access.
   * @throws ForbiddenException
   */
  private assertDecision(
    user: AuthUser,
    viewer: Viewer,
    decision: SanitaryDecision,
  ): void {
    const refusal = sanitaryDecisionRefusal(
      user,
      viewer.kind === 'institution' ? viewer.access : null,
      decision,
    );
    if (refusal) throw new ForbiddenException(refusal);
  }

  private async lockAlert(
    em: EntityManager,
    alertId: string,
  ): Promise<SanitaryAlert> {
    const alert = await em
      .getRepository(SanitaryAlert)
      .createQueryBuilder('a')
      .setLock('pessimistic_write')
      .where('a.id = :id', { id: alertId })
      .getOne();
    if (!alert) throw new NotFoundException(NOT_FOUND);
    return alert;
  }

  // ---------- Reads ----------

  /** Programme-wide list (platform admin, institutions within their scope). */
  async list(
    user: AuthUser,
    query: ListSanitaryAlertsDto,
  ): Promise<{ items: SanitaryAlertView[]; total: number }> {
    const viewer = await this.viewer(user);
    const qb = this.baseQuery(viewer);
    if (query.farmId) qb.andWhere('a.farm_id = :farmId', { farmId: query.farmId });
    return this.runList(qb, query);
  }

  /** A farm's alerts, published or not (the farm side, or institutions). */
  async listForFarm(
    user: AuthUser,
    farmId: string,
    query: ListSanitaryAlertsDto,
  ): Promise<{ items: SanitaryAlertView[]; total: number }> {
    await this.farms.assertAccessible(user, farmId);
    const viewer = await this.viewer(user);
    const qb = this.baseQuery(viewer).andWhere('a.farm_id = :farmId', {
      farmId,
    });
    return this.runList(qb, query);
  }

  /** One alert with its history; 404 when the viewer may not see it. */
  async detail(
    user: AuthUser,
    alertId: string,
    farmId?: string,
  ): Promise<SanitaryAlertView & { transitions: SanitaryAlertTransitionView[] }> {
    if (farmId) await this.farms.assertAccessible(user, farmId);
    const viewer = await this.viewer(user);
    const qb = this.baseQuery(viewer).andWhere('a.id = :alertId', { alertId });
    if (farmId) qb.andWhere('a.farm_id = :farmId', { farmId });
    const raw = await qb.getRawOne<RawAlert>();
    if (!raw) throw new NotFoundException(NOT_FOUND);
    const transitions: RawTransition[] = await this.dataSource.query(
      `SELECT t.id, t.kind, t.from_status_code AS "fromStatusCode",
              t.to_status_code AS "toStatusCode", t.to_family AS "toFamily",
              t.comment, t.author_id AS "authorId", u."fullName" AS "authorName",
              t.created_at AS "createdAt"
         FROM sanitary_alert_transitions t
         LEFT JOIN users u ON u.id = t.author_id
        WHERE t.alert_id = $1
        ORDER BY t.created_at, t.id`,
      [alertId],
    );
    return { ...toView(raw), transitions };
  }

  /**
   * Published alerts (dashboards, map: L6). Period on the fact day. Without
   * `access`, the whole programme; with it, the farm-level scope of that
   * institutional account (an AGGREGATE scope should read
   * {@link publishedCountsByProvince} instead).
   */
  async publishedAlerts(
    filter: PublishedAlertsFilter = {},
  ): Promise<SanitaryAlertView[]> {
    const qb = this.publishedQuery(filter);
    qb.orderBy('a.fact_day', 'DESC').addOrderBy('a.created_at', 'DESC');
    return (await qb.getRawMany<RawAlert>()).map(toView);
  }

  /** Published alerts counted per province (no farm detail: aggregates). */
  async publishedCountsByProvince(
    filter: Omit<PublishedAlertsFilter, 'access'> = {},
  ): Promise<PublishedAlertsByProvince[]> {
    const qb = this.publishedQuery(filter)
      .select('a.province_id', 'provinceId')
      .addSelect('p.code', 'provinceCode')
      .addSelect('p.name', 'provinceName')
      .addSelect('COUNT(*)::int', 'published')
      .addSelect(
        `COUNT(*) FILTER (WHERE a.status_family <> '${ALERT_FAMILY.CLOSE}')::int`,
        'open',
      )
      .groupBy('a.province_id')
      .addGroupBy('p.code')
      .addGroupBy('p.name')
      .orderBy('p.code', 'ASC', 'NULLS LAST');
    return qb.getRawMany<PublishedAlertsByProvince>();
  }

  private publishedQuery(
    filter: PublishedAlertsFilter,
  ): SelectQueryBuilder<SanitaryAlert> {
    const qb = this.selectQuery().where('a.published_at IS NOT NULL');
    if (filter.from) qb.andWhere('a.fact_day >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('a.fact_day <= :to', { to: filter.to });
    if (filter.publishedFrom) {
      qb.andWhere('a.published_at >= :publishedFrom', {
        publishedFrom: filter.publishedFrom,
      });
    }
    if (filter.publishedBefore) {
      qb.andWhere('a.published_at < :publishedBefore', {
        publishedBefore: filter.publishedBefore,
      });
    }
    if (filter.provinceIds) {
      if (filter.provinceIds.length === 0) qb.andWhere('1 = 0');
      else {
        qb.andWhere('a.province_id IN (:...provinceIds)', {
          provinceIds: [...filter.provinceIds],
        });
      }
    }
    if (filter.access) this.scope.applyFarmScope(qb, 'f', filter.access);
    return qb;
  }

  private selectQuery(): SelectQueryBuilder<SanitaryAlert> {
    return this.dataSource
      .getRepository(SanitaryAlert)
      .createQueryBuilder('a')
      .innerJoin('farms', 'f', 'f.id = a.farm_id')
      .leftJoin('production_batches', 'b', 'b.id = a.batch_id')
      .leftJoin('provinces', 'p', 'p.id = a.province_id')
      .select(ALERT_COLUMNS);
  }

  /** Base query with the viewer's visibility applied. */
  private baseQuery(viewer: Viewer): SelectQueryBuilder<SanitaryAlert> {
    const qb = this.selectQuery().where('1 = 1');
    if (viewer.kind === 'institution') {
      this.scope.applyFarmScope(qb, 'f', viewer.access);
      // Before publication: the farm and the veterinary services only.
      if (!viewer.vet) qb.andWhere('a.published_at IS NOT NULL');
    }
    return qb;
  }

  private async runList(
    qb: SelectQueryBuilder<SanitaryAlert>,
    query: ListSanitaryAlertsDto,
  ): Promise<{ items: SanitaryAlertView[]; total: number }> {
    if (query.statusFamily) {
      qb.andWhere('a.status_family = :family', { family: query.statusFamily });
    }
    if (query.statusCode) {
      qb.andWhere('a.status_code = :statusCode', {
        statusCode: query.statusCode,
      });
    }
    if (query.origin) qb.andWhere('a.origin = :origin', { origin: query.origin });
    if (query.provinceCode) {
      qb.andWhere('p.code = :provinceCode', {
        provinceCode: query.provinceCode,
      });
    }
    if (query.published !== undefined) {
      qb.andWhere(
        query.published ? 'a.published_at IS NOT NULL' : 'a.published_at IS NULL',
      );
    }
    if (query.from) qb.andWhere('a.fact_day >= :from', { from: query.from });
    if (query.to) qb.andWhere('a.fact_day <= :to', { to: query.to });
    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy('a.created_at', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .offset(query.offset ?? 0)
      .limit(query.limit ?? 50)
      .getRawMany<RawAlert>();
    return { items: rows.map(toView), total };
  }

  private async viewer(user: AuthUser): Promise<Viewer> {
    if (user.role === UserRole.PLATFORM_ADMIN) return { kind: 'all' };
    if (user.role === UserRole.INSTITUTION) {
      const access = await this.scope.requireAccess(user);
      return {
        kind: 'institution',
        access,
        vet: mayHandleSanitaryDeclarations(user, access),
      };
    }
    return { kind: 'farm' };
  }

  /** @throws NotFoundException when the viewer may not see the alert */
  private async assertVisible(
    viewer: Viewer,
    alert: SanitaryAlert,
    em: EntityManager,
  ): Promise<void> {
    if (viewer.kind === 'all') return;
    if (viewer.kind === 'farm') throw new NotFoundException(NOT_FOUND);
    const farm = await em.getRepository(Farm).findOne({
      where: { id: alert.farmId },
      select: { id: true, programId: true, provinceId: true },
    });
    if (
      !farm ||
      !this.scope.includes(viewer.access, farm) ||
      (!viewer.vet && !alert.publishedAt)
    ) {
      throw new NotFoundException(NOT_FOUND);
    }
  }

  private busEvent(alert: SanitaryAlert): SanitaryAlertEvent {
    return {
      alertId: alert.id,
      farmId: alert.farmId,
      batchId: alert.batchId,
      code: alert.code,
      origin: alert.origin,
      statusCode: alert.statusCode,
      statusFamily: alert.statusFamily,
      severity: alert.severity,
    };
  }

  private track(work: Promise<unknown>): void {
    const p = work.then(
      () => undefined,
      (err: unknown) =>
        this.logger.error(
          `Contrôle du seuil de mortalité : ${err instanceof Error ? err.message : String(err)}`,
        ),
    );
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }
}

const ALERT_COLUMNS = [
  'a.id AS "id"',
  'a.code AS "code"',
  'a.origin AS "origin"',
  'a.farm_id AS "farmId"',
  'f.code AS "farmCode"',
  'f.name AS "farmName"',
  'a.batch_id AS "batchId"',
  'b.code AS "batchCode"',
  'a.province_id AS "provinceId"',
  'p.code AS "provinceCode"',
  'p.name AS "provinceName"',
  'a.health_event_id AS "healthEventId"',
  'a.status_code AS "statusCode"',
  'a.status_family AS "statusFamily"',
  'a.outcome AS "outcome"',
  'a.severity AS "severity"',
  `TO_CHAR(a.fact_day, 'YYYY-MM-DD') AS "factDay"`,
  `TO_CHAR(a.last_fact_day, 'YYYY-MM-DD') AS "lastFactDay"`,
  'a.mortality_pct AS "mortalityPct"',
  'a.threshold_pct AS "thresholdPct"',
  'a.deaths AS "deaths"',
  'a.present_start AS "presentStart"',
  'a.clinical_signs AS "clinicalSigns"',
  'a.summary AS "summary"',
  'a.published_at AS "publishedAt"',
  'a.closed_at AS "closedAt"',
  'a.created_at AS "createdAt"',
  'a.updated_at AS "updatedAt"',
];

type RawAlert = Omit<SanitaryAlertView, 'published'>;
type RawTransition = SanitaryAlertTransitionView;

function toView(raw: RawAlert): SanitaryAlertView {
  return { ...raw, published: raw.publishedAt !== null };
}
