import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { runAfterCommit } from '../../common/utils/after-commit.js';
import { KOUKOU_EVENTS, koukouBus } from '../../common/utils/event-bus.js';
import type {
  DailyEntry,
  FieldSyncMeta,
} from '../daily-entries/entities/daily-entry.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { ParametersService } from '../programme/parameters.service.js';
import {
  effectiveCapture,
  resolveFields,
  type EffectiveCapture,
  type FieldDecision,
  type ServerField,
} from './conflict-rules.js';
import { SyncClockSample } from './entities/sync-clock-sample.entity.js';
import { SyncConflict } from './entities/sync-conflict.entity.js';

/** Offline metadata a queued write may carry. */
export interface SyncMetadata {
  capturedAt?: string;
  baseUpdatedAt?: string;
  baseValues?: Record<string, unknown>;
  deviceSentAt?: string;
  deviceId?: string;
}

/** Daily-entry fields compared one by one (feed in kg). */
export const DAILY_ENTRY_SYNC_FIELDS = [
  'deaths',
  'feedQuantity',
  'waterL',
  'avgWeightKg',
  'sampleSize',
  'eggsCollected',
  'eggsSellable',
  'eggsCracked',
  'eggsSmall',
  'eggsDoubleYolk',
  'eggsDirty',
] as const;

export type DailyEntrySyncField = (typeof DAILY_ENTRY_SYNC_FIELDS)[number];

export interface DailyEntryReconciliation {
  capture: EffectiveCapture;
  /** Fields not to write (the server keeps its value). */
  dropped: DailyEntrySyncField[];
  /** `DailyEntry.fieldSync` after the write. */
  fieldSync: Record<string, FieldSyncMeta>;
  /** `DailyEntry.capturedAt` after the write. */
  capturedAt: Date | null;
  /**
   * Write time to store as `DailyEntry.updatedAt`: the same instant as the
   * fields' `updatedAt`, so a phone sending it back as `baseUpdatedAt` is
   * never taken for a change made meanwhile.
   */
  updatedAt: Date;
  /** At least one sent field is written. */
  applied: boolean;
  conflicts: SyncConflict[];
}

/**
 * Offline synchronization of programme farms: clock skew per synchronized
 * write and field-by-field conflicts, the later capture winning, the losing
 * value kept in `sync_conflicts`.
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly parameters: ParametersService,
    private readonly farms: FarmsService,
    @InjectRepository(SyncConflict)
    private readonly conflicts: Repository<SyncConflict>,
  ) {}

  /**
   * Capture time of a write; records the phone clock skew when the phone
   * sent its time, and corrects the capture beyond `SYNC_ECART_HORLOGE_MAX_S`.
   */
  async capture(
    em: EntityManager,
    ctx: { programId: string; farmId: string; userId: string | null },
    meta: SyncMetadata,
  ): Promise<EffectiveCapture> {
    const serverNow = new Date();
    const resolver = await this.parameters.resolver(ctx.programId, em);
    const thresholdS = resolver.value<number>(
      'SYNC_ECART_HORLOGE_MAX_S',
      serverNow,
    );
    const capture = effectiveCapture({
      capturedAt: meta.capturedAt ? new Date(meta.capturedAt) : null,
      deviceSentAt: meta.deviceSentAt ? new Date(meta.deviceSentAt) : null,
      serverNow,
      thresholdMs: thresholdS * 1000,
    });
    if (capture.skewMs != null) {
      await em.getRepository(SyncClockSample).insert({
        userId: ctx.userId,
        farmId: ctx.farmId,
        deviceId: meta.deviceId ?? null,
        deviceTime: new Date(meta.deviceSentAt!),
        serverTime: serverNow,
        skewMs: capture.skewMs,
        corrected: Math.abs(capture.skewMs) > thresholdS * 1000,
      });
    }
    return capture;
  }

  /**
   * Decides, field by field, what an incoming daily-entry write may change.
   * Only writes carrying offline metadata (`capturedAt` or `baseUpdatedAt`)
   * are checked; a live write applies as it always did. Conflicts are saved
   * in `em` and announced on the bus after commit.
   */
  async reconcileDailyEntry(
    em: EntityManager,
    ctx: {
      programId: string;
      farmId: string;
      batchId: string;
      user: AuthUser;
      existing: DailyEntry | null;
      /** Sent fields (feed already converted to kg). */
      values: Partial<Record<DailyEntrySyncField, unknown>>;
    },
    meta: SyncMetadata,
  ): Promise<DailyEntryReconciliation> {
    const capture = await this.capture(
      em,
      { programId: ctx.programId, farmId: ctx.farmId, userId: ctx.user.id },
      meta,
    );
    const offline = meta.capturedAt != null || meta.baseUpdatedAt != null;
    const existing = ctx.existing;
    const server = existing ? this.serverFields(existing) : null;
    const decisions: FieldDecision[] = offline
      ? resolveFields(server, {
          values: ctx.values,
          baseValues: meta.baseValues ?? null,
          baseUpdatedAt: meta.baseUpdatedAt
            ? new Date(meta.baseUpdatedAt)
            : null,
          capturedAt: capture.capturedAt,
          userId: ctx.user.id,
          deviceId: meta.deviceId ?? null,
        })
      : Object.entries(ctx.values)
          .filter(([, v]) => v !== undefined)
          .map(([field, incomingValue]) => ({
            field,
            action: 'apply' as const,
            conflict: false,
            incomingValue,
            serverValue: null,
            serverMeta: null,
          }));

    const updatedAt = new Date();
    const now = updatedAt.toISOString();
    const fieldSync: Record<string, FieldSyncMeta> = {
      ...existing?.fieldSync,
    };
    const dropped: DailyEntrySyncField[] = [];
    let applied = false;
    for (const d of decisions) {
      if (d.action === 'apply') {
        applied = true;
        fieldSync[d.field] = {
          capturedAt: capture.capturedAt.toISOString(),
          updatedAt: now,
          userId: ctx.user.id,
          deviceId: meta.deviceId ?? null,
        };
      } else {
        dropped.push(d.field as DailyEntrySyncField);
      }
    }

    const conflicts = existing
      ? decisions
          .filter((d) => d.conflict)
          .map((d) =>
            em.getRepository(SyncConflict).create({
              farmId: ctx.farmId,
              batchId: ctx.batchId,
              entityType: 'DAILY_ENTRY',
              entityId: existing.id,
              entityLabel: `Saisie du ${existing.entryDate.slice(0, 10)}`,
              field: d.field,
              winner: d.action === 'apply' ? 'APPAREIL' : 'SERVEUR',
              serverValue: d.serverValue ?? null,
              incomingValue: d.incomingValue ?? null,
              serverCapturedAt: d.serverMeta
                ? new Date(d.serverMeta.capturedAt)
                : null,
              serverUserId: d.serverMeta?.userId ?? null,
              serverDeviceId: d.serverMeta?.deviceId ?? null,
              incomingCapturedAt: capture.capturedAt,
              incomingCapturedAtRaw: capture.raw,
              incomingUserId: ctx.user.id,
              incomingDeviceId: meta.deviceId ?? null,
              clockSkewMs: capture.skewMs,
              clockCorrected: capture.corrected,
            }),
          )
      : [];
    if (conflicts.length > 0) {
      await em.getRepository(SyncConflict).save(conflicts);
      const event = {
        farmId: ctx.farmId,
        batchId: ctx.batchId,
        conflictIds: conflicts.map((c) => c.id),
      };
      // TODO(notify lot): in-app notification to the agent and the farmer.
      runAfterCommit(em, () =>
        koukouBus.emit(KOUKOU_EVENTS.SYNC_CONFLICT, event),
      );
    }
    return {
      capture,
      dropped,
      fieldSync,
      capturedAt: applied
        ? capture.capturedAt
        : (existing?.capturedAt ?? null),
      updatedAt,
      applied,
      conflicts,
    };
  }

  /** Conflicts of a farm, newest first (optionally one band). */
  async list(
    user: AuthUser,
    farmId: string,
    batchId?: string,
  ): Promise<SyncConflict[]> {
    await this.farms.assertAccessible(user, farmId);
    return this.conflicts.find({
      where: batchId ? { farmId, batchId } : { farmId },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  private serverFields(entry: DailyEntry): Record<string, ServerField> {
    const fallback: FieldSyncMeta = {
      capturedAt: (entry.capturedAt ?? entry.updatedAt).toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      userId: entry.createdById,
      deviceId: null,
    };
    const out: Record<string, ServerField> = {};
    for (const field of DAILY_ENTRY_SYNC_FIELDS) {
      // Tracked entry: a field never written still holds its default, there
      // is nothing to protect. Legacy entry: the whole row is one version.
      const meta = entry.fieldSync ? entry.fieldSync[field] : fallback;
      if (meta) out[field] = { value: entry[field], meta };
    }
    return out;
  }
}
