import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { DeclarationReviewStatus } from '../../common/enums/declaration-review.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { runAfterCommit } from '../../common/utils/after-commit.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type DeclarationReviewedEvent,
} from '../../common/utils/event-bus.js';
import type { InstitutionAccess } from '../access/access-rules.js';
import { SanitaryDeclarationPolicy } from '../access/sanitary-declaration.policy.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { HealthEvent } from '../sanitary/entities/health-event.entity.js';
import {
  reviewProblem,
  reviewStateOf,
  type DeclarationReviewState,
} from './declaration-review-rules.js';
import type {
  ListSanitaryDeclarationsDto,
  ReviewSanitaryDeclarationDto,
} from './dto/sanitary-declaration.dto.js';
import { SanitaryAlertsService } from './sanitary-alerts.service.js';
import { sanitaryDecisionRefusal } from './veterinary-authority.js';

const NOT_FOUND = 'Déclaration sanitaire introuvable.';

/** A declaration as the vets' register shows it. */
export interface SanitaryDeclarationView {
  id: string;
  farmId: string;
  farmCode: string | null;
  farmName: string | null;
  batchId: string;
  batchCode: string | null;
  provinceId: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  kind: string;
  occurredAt: string;
  severity: string;
  quantity: number;
  title: string;
  description: string | null;
  symptoms: string | null;
  disease: string | null;
  clinicalSigns: string[];
  suspicion: boolean;
  /** The farm's own follow-up (OUVERT / RESOLU). */
  status: string;
  createdAt: Date;
  createdByName: string | null;
  photos: { id: string; mimeType: string; sizeBytes: number; createdAt: Date }[];
  /** The alert it opened (suspicion) or was converted into. */
  alertId: string | null;
  alertCode: string | null;
  alertStatusCode: string | null;
  alertStatusFamily: string | null;
  /** The vets' decision (null: none yet). */
  reviewStatus: DeclarationReviewStatus | null;
  reviewComment: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  /** Review, else alert, else « à examiner » (`reviewStateOf`). */
  reviewState: DeclarationReviewState;
}

type RawDeclaration = Omit<SanitaryDeclarationView, 'reviewState'>;

/**
 * POUFA lot A2 vet, CDC §5.2 n° 26 « les services vétérinaires […] valident
 * les événements »: the programme register of the sanitary declarations
 * (`HealthEvent`) and their veterinary review. Declarations stay between the
 * farm and the veterinary authority (`SanitaryDeclarationPolicy`, matrix
 * right SANITAIRE:VALIDER): the platform admin reads the register, never
 * decides; an institution reads the farms of its scope only. A declaration
 * that opened an alert is qualified in the alert's circuit; any other one is
 * validated, ruled out or converted into an alert, once, with its author,
 * date and comment (journaled as any POST), and the farm is notified
 * (`DECLARATION_REVIEWED`).
 */
@Injectable()
export class SanitaryDeclarationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: ScopeResolver,
    private readonly declarations: SanitaryDeclarationPolicy,
    private readonly alerts: SanitaryAlertsService,
  ) {}

  async list(
    user: AuthUser,
    query: ListSanitaryDeclarationsDto,
  ): Promise<{ items: SanitaryDeclarationView[]; total: number }> {
    const qb = await this.visibleQuery(user);
    if (query.farmId) qb.andWhere('h.farm_id = :farmId', { farmId: query.farmId });
    if (query.kind) qb.andWhere('h.kind = :kind', { kind: query.kind });
    if (query.provinceCode) {
      qb.andWhere('p.code = :provinceCode', { provinceCode: query.provinceCode });
    }
    if (query.from) qb.andWhere('h.occurred_at >= :from', { from: query.from });
    if (query.to) qb.andWhere('h.occurred_at <= :to', { to: query.to });
    switch (query.state) {
      case 'A_EXAMINER':
        qb.andWhere('h.vet_review_status IS NULL AND a.id IS NULL');
        break;
      case DeclarationReviewStatus.ALERTE:
        qb.andWhere(
          `(h.vet_review_status = 'ALERTE' OR (h.vet_review_status IS NULL AND a.id IS NOT NULL))`,
        );
        break;
      case DeclarationReviewStatus.VALIDEE:
      case DeclarationReviewStatus.INFIRMEE:
        qb.andWhere('h.vet_review_status = :state', { state: query.state });
        break;
      default:
        break;
    }
    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy('h.occurred_at', 'DESC')
      .addOrderBy('h."createdAt"', 'DESC')
      .addOrderBy('h.id', 'DESC')
      .offset(query.offset ?? 0)
      .limit(query.limit ?? 50)
      .getRawMany<RawDeclaration>();
    return { items: rows.map(toView), total };
  }

  async detail(user: AuthUser, id: string): Promise<SanitaryDeclarationView> {
    const qb = await this.visibleQuery(user);
    const raw = await qb.andWhere('h.id = :id', { id }).getRawOne<RawDeclaration>();
    if (!raw) throw new NotFoundException(NOT_FOUND);
    return toView(raw);
  }

  /** The vets' decision on a declaration that opened no alert. */
  async review(
    user: AuthUser,
    id: string,
    dto: ReviewSanitaryDeclarationDto,
  ): Promise<SanitaryDeclarationView> {
    await this.declarations.assert(user);
    const access =
      user.role === UserRole.INSTITUTION
        ? await this.scope.requireAccess(user)
        : null;
    const refusal = sanitaryDecisionRefusal(user, access, 'validate');
    if (refusal) throw new ForbiddenException(refusal);
    await this.dataSource.transaction(async (em) => {
      const event = await em
        .getRepository(HealthEvent)
        .createQueryBuilder('h')
        .setLock('pessimistic_write')
        .where('h.id = :id', { id })
        .getOne();
      if (!event) throw new NotFoundException(NOT_FOUND);
      const farm = await em.getRepository(Farm).findOne({ where: { id: event.farmId } });
      if (!farm || (access && !this.scope.includes(access, farm))) {
        throw new NotFoundException(NOT_FOUND);
      }
      const opened: { code: string }[] = await em.query(
        `SELECT code FROM sanitary_alerts WHERE health_event_id = $1`,
        [event.id],
      );
      const problem = reviewProblem(
        { vetReviewStatus: event.vetReviewStatus, alertCode: opened[0]?.code ?? null },
        dto.decision,
        dto.comment,
      );
      if (problem) {
        throw problem.status === 409
          ? new ConflictException(problem.message)
          : new BadRequestException(problem.message);
      }
      const comment = dto.comment?.trim() || null;
      const alert =
        dto.decision === DeclarationReviewStatus.ALERTE
          ? await this.alerts.raiseFromDeclaration(em, event, farm, {
              byUserId: user.id,
              comment,
            })
          : null;
      await em.getRepository(HealthEvent).update(event.id, {
        vetReviewStatus: dto.decision,
        vetReviewComment: comment,
        vetReviewedById: user.id,
        vetReviewedAt: new Date(),
      });
      const reviewed: DeclarationReviewedEvent = {
        farmId: event.farmId,
        batchId: event.batchId,
        healthEventId: event.id,
        status: dto.decision,
        occurredAt: String(event.occurredAt).slice(0, 10),
        title: event.title,
        alertId: alert?.id ?? null,
        alertCode: alert?.code ?? null,
      };
      runAfterCommit(em, () =>
        koukouBus.emit(KOUKOU_EVENTS.DECLARATION_REVIEWED, reviewed),
      );
    });
    return this.detail(user, id);
  }

  /**
   * Declarations the caller may read: the declarations rule first (403),
   * then the institution's farm scope (SQL).
   */
  private async visibleQuery(
    user: AuthUser,
  ): Promise<SelectQueryBuilder<HealthEvent>> {
    await this.declarations.assert(user);
    let access: InstitutionAccess | null = null;
    if (user.role === UserRole.INSTITUTION) {
      access = await this.scope.requireAccess(user);
    } else if (user.role !== UserRole.PLATFORM_ADMIN) {
      // The farm reads its own declarations on its band (health-events).
      throw new ForbiddenException(
        'Accès refusé : le registre des déclarations est celui des services vétérinaires.',
      );
    }
    const qb = this.dataSource
      .getRepository(HealthEvent)
      .createQueryBuilder('h')
      .innerJoin('farms', 'f', 'f.id = h.farm_id')
      .leftJoin('production_batches', 'b', 'b.id = h.batch_id')
      .leftJoin('provinces', 'p', 'p.id = f.province_id')
      .leftJoin('sanitary_alerts', 'a', 'a.health_event_id = h.id')
      .leftJoin('users', 'c', 'c.id = h.created_by_id')
      .leftJoin('users', 'r', 'r.id = h.vet_reviewed_by_id')
      .select(DECLARATION_COLUMNS)
      .where('1 = 1');
    if (access) this.scope.applyFarmScope(qb, 'f', access);
    return qb;
  }
}

const DECLARATION_COLUMNS = [
  'h.id AS "id"',
  'h.farm_id AS "farmId"',
  'f.code AS "farmCode"',
  'f.name AS "farmName"',
  'h.batch_id AS "batchId"',
  'b.code AS "batchCode"',
  'f.province_id AS "provinceId"',
  'p.code AS "provinceCode"',
  'p.name AS "provinceName"',
  'h.kind AS "kind"',
  `TO_CHAR(h.occurred_at, 'YYYY-MM-DD') AS "occurredAt"`,
  'h.severity AS "severity"',
  'h.quantity AS "quantity"',
  'h.title AS "title"',
  'h.description AS "description"',
  'h.symptoms AS "symptoms"',
  'h.disease AS "disease"',
  'h.clinical_signs AS "clinicalSigns"',
  'h.suspicion AS "suspicion"',
  'h.status AS "status"',
  'h."createdAt" AS "createdAt"',
  'c."fullName" AS "createdByName"',
  `COALESCE((SELECT json_agg(json_build_object('id', ph.id, 'mimeType', ph.mime_type, 'sizeBytes', ph.size_bytes, 'createdAt', ph.created_at) ORDER BY ph.created_at)
     FROM health_event_photos ph WHERE ph.health_event_id = h.id), '[]'::json) AS "photos"`,
  'a.id AS "alertId"',
  'a.code AS "alertCode"',
  'a.status_code AS "alertStatusCode"',
  'a.status_family AS "alertStatusFamily"',
  'h.vet_review_status AS "reviewStatus"',
  'h.vet_review_comment AS "reviewComment"',
  'h.vet_reviewed_by_id AS "reviewedById"',
  'r."fullName" AS "reviewedByName"',
  'h.vet_reviewed_at AS "reviewedAt"',
];

function toView(raw: RawDeclaration): SanitaryDeclarationView {
  return {
    ...raw,
    reviewState: reviewStateOf({
      vetReviewStatus: raw.reviewStatus,
      alertId: raw.alertId,
    }),
  };
}
