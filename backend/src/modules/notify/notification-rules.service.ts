import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AlertLevel } from '../../common/enums/alert-level.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  NotificationAudience,
  NotificationEvent,
} from '../../common/enums/notification.enum.js';
import { isUniqueViolation } from '../../common/utils/idempotency.js';
import { AccessProfile } from '../access/entities/access-profile.entity.js';
import { mayHandleSanitaryDeclarations } from '../access/sanitary-declaration.policy.js';
import { Program } from '../programme/entities/program.entity.js';
import { ProgrammeService } from '../programme/programme.service.js';
import { DEFAULT_NOTIFICATION_RULES } from './data/default-rules.js';
import type {
  CreateNotificationRuleDto,
  UpdateNotificationRuleDto,
} from './dto/notification-rule.dto.js';
import { NotificationRule } from './entities/notification-rule.entity.js';
import {
  CHANNEL_ORDER,
  EVENT_LABELS,
  isConfidential,
  ruleProblem,
  type RuleShape,
} from './notify-rules.js';

/**
 * Notification rules of the programme, edited by the administration
 * (ADMINISTRATION ADMINISTRER or the platform admin). The defaults are
 * seeded once per programme (never overwritten): at boot when the
 * programme row exists, else at the first read.
 */
@Injectable()
export class NotificationRulesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationRulesService.name);
  private readonly seeded = new Map<string, Promise<void>>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly programme: ProgrammeService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const program = await this.dataSource
      .getRepository(Program)
      .findOne({ where: { code: this.programme.configuredCode() } });
    // The programme seed may not have run yet: the first read seeds then.
    if (program) await this.ensureDefaults(program.id);
  }

  /** Seeds the default rules of `programId` once per process. */
  ensureDefaults(programId: string): Promise<void> {
    let pending = this.seeded.get(programId);
    if (!pending) {
      pending = this.seedDefaults(programId).catch((err: unknown) => {
        this.seeded.delete(programId);
        throw err;
      });
      this.seeded.set(programId, pending);
    }
    return pending;
  }

  private async seedDefaults(programId: string): Promise<void> {
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(NotificationRule)
      .values(
        DEFAULT_NOTIFICATION_RULES.map((r) => ({
          programId,
          code: r.code,
          label: r.label,
          event: r.event,
          audience: r.audience,
          profileCode: r.profileCode ?? null,
          channels: r.channels,
          escalateAfterMin: null,
          severityMin: r.severityMin ?? AlertLevel.VERT,
          active: true,
          system: true,
        })),
      )
      .orIgnore()
      .execute();
    this.logger.log('Règles de notification par défaut vérifiées.');
  }

  /** Active rules of an event (defaults seeded first). */
  async activeFor(
    programId: string,
    event: NotificationEvent,
  ): Promise<NotificationRule[]> {
    await this.ensureDefaults(programId);
    return this.dataSource.getRepository(NotificationRule).find({
      where: { programId, event, active: true },
      order: { code: 'ASC' },
    });
  }

  async list(): Promise<NotificationRule[]> {
    const program = await this.programme.current();
    await this.ensureDefaults(program.id);
    return this.dataSource.getRepository(NotificationRule).find({
      where: { programId: program.id },
      order: { event: 'ASC', code: 'ASC' },
    });
  }

  /** Events a rule may listen to, for the administration screens. */
  catalog() {
    return Object.values(NotificationEvent).map((event) => ({
      event,
      label: EVENT_LABELS[event],
      confidential: isConfidential(event),
    }));
  }

  async create(dto: CreateNotificationRuleDto): Promise<NotificationRule> {
    const program = await this.programme.current();
    await this.ensureDefaults(program.id);
    const shape: RuleShape = {
      event: dto.event,
      audience: dto.audience,
      profileCode: dto.profileCode ?? null,
      channels: dto.channels,
      escalateAfterMin: dto.escalateAfterMin ?? null,
    };
    await this.check(program.id, shape);
    const repo = this.dataSource.getRepository(NotificationRule);
    try {
      return await repo.save(
        repo.create({
          programId: program.id,
          code: dto.code,
          label: dto.label.trim(),
          ...shape,
          channels: ordered(shape.channels),
          severityMin: dto.severityMin ?? AlertLevel.VERT,
          active: dto.active ?? true,
          system: false,
        }),
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(
          `Une règle de code « ${dto.code} » existe déjà.`,
        );
      }
      throw e;
    }
  }

  /** Edits a rule; its code and event never change. */
  async update(
    id: string,
    dto: UpdateNotificationRuleDto,
  ): Promise<NotificationRule> {
    const program = await this.programme.current();
    const repo = this.dataSource.getRepository(NotificationRule);
    const rule = await repo.findOne({ where: { id, programId: program.id } });
    if (!rule) throw new NotFoundException('Règle de notification introuvable.');
    const audience = dto.audience ?? rule.audience;
    const shape: RuleShape = {
      event: rule.event,
      audience,
      profileCode:
        dto.profileCode !== undefined
          ? dto.profileCode
          : audience === NotificationAudience.PROFILE
            ? rule.profileCode
            : null,
      channels: dto.channels ?? rule.channels,
      escalateAfterMin:
        dto.escalateAfterMin !== undefined
          ? dto.escalateAfterMin
          : rule.escalateAfterMin,
    };
    await this.check(program.id, shape);
    rule.audience = shape.audience;
    rule.profileCode = shape.profileCode;
    rule.channels = ordered(shape.channels);
    rule.escalateAfterMin = shape.escalateAfterMin;
    if (dto.label !== undefined) rule.label = dto.label.trim();
    if (dto.severityMin !== undefined) rule.severityMin = dto.severityMin;
    if (dto.active !== undefined) rule.active = dto.active;
    return repo.save(rule);
  }

  private async check(programId: string, shape: RuleShape): Promise<void> {
    let vet = false;
    if (shape.audience === NotificationAudience.PROFILE && shape.profileCode) {
      const profile = await this.dataSource
        .getRepository(AccessProfile)
        .findOne({ where: { programId, code: shape.profileCode } });
      if (!profile) {
        throw new BadRequestException(
          `Profil « ${shape.profileCode} » inconnu dans le programme.`,
        );
      }
      // Same rule as the declarations themselves: the profile's matrix
      // (SANITAIRE:VALIDER), never its code (POUFA lot A2 vet).
      vet = mayHandleSanitaryDeclarations(
        { role: UserRole.INSTITUTION },
        { matrix: profile.matrix },
      );
    }
    const problem = ruleProblem(shape, vet);
    if (problem) throw new BadRequestException(problem);
  }
}

function ordered<T extends string>(channels: readonly T[]): T[] {
  return [...channels].sort(
    (a, b) =>
      CHANNEL_ORDER.indexOf(a as never) - CHANNEL_ORDER.indexOf(b as never),
  );
}
