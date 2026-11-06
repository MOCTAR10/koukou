import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { GpsSource } from '../../common/enums/gps-source.enum.js';
import {
  ImportJobType,
  ImportRowOutcome,
} from '../../common/enums/import-job.enum.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { Province } from '../programme/entities/province.entity.js';
import {
  FarmImportService,
  type ImportLine,
} from '../programme/farms/farm-import.service.js';
import {
  ProgrammeFarmsService,
  type ProvinceLabels,
  type RegistryEntry,
} from '../programme/farms/programme-farms.service.js';
import {
  normalizeAmiRef,
  normalizeFarmName,
} from '../programme/farms/registry-rules.js';
import { RefListsService } from '../programme/ref-lists.service.js';
import type { ImportJob } from './entities/import-job.entity.js';
import {
  fieldLabel,
  IDENTITY_FIELDS,
  planEnrichment,
  type EnrichmentContext,
  type EnrichmentPlan,
  type ListItem,
  type NamedItem,
} from './farm-enrichment.js';
import type { RowFinding, RowResult, StagedRow } from './recovery-types.js';

/** Field key → header understood by the farm importer (`import-mapping.ts`). */
const IMPORTER_HEADERS: Readonly<Record<string, string>> = {
  name: 'nom',
  province: 'province',
  localite: 'localite',
  exploitantName: 'exploitant',
  exploitantPhone: 'telephone',
  amiRef: 'amiref',
  cohort: 'cohorte',
  capacityPlaces: 'capacite',
  latitude: 'latitude',
  longitude: 'longitude',
  status: 'statut',
};

interface RegistryState {
  readonly pool: RegistryEntry[];
  readonly labels: ProvinceLabels;
  readonly localitesByProvince: Map<string, NamedItem[]>;
  readonly localiteNames: Map<string, string>;
  readonly cohorts: ListItem[];
  readonly statuses: ListItem[];
  readonly takenAmiRefs: Set<string>;
}

/**
 * AMI sheets → registry farms. Creation goes through the farm importer
 * (`FarmImportService`: province/localité/list checks, AMI reference unique,
 * idempotency by AMI reference or name + province, duplicate blocking), so
 * the reprise never bypasses the registry rules. A farm already present is
 * completed on its empty fields only (`farm-enrichment.ts`), and identity
 * fields are re-checked against the duplicate detector.
 */
@Injectable()
export class FarmRecoveryService {
  constructor(
    private readonly importer: FarmImportService,
    private readonly registry: ProgrammeFarmsService,
    private readonly lists: RefListsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private importerRows(rows: readonly StagedRow[]): Record<string, string>[] {
    return rows.map((r) =>
      Object.fromEntries(
        Object.entries(IMPORTER_HEADERS).map(([field, header]) => [
          header,
          r.values[field] ?? '',
        ]),
      ),
    );
  }

  private async state(
    em: EntityManager,
    programId: string,
  ): Promise<RegistryState> {
    const pool = await this.registry.loadEntries(em, programId);
    const provinces = await em.getRepository(Province).find({
      where: { programId },
      relations: { localites: true },
    });
    const localitesByProvince = new Map<string, NamedItem[]>();
    const localiteNames = new Map<string, string>();
    for (const p of provinces) {
      const items = p.localites ?? [];
      for (const l of items) localiteNames.set(l.id, l.name);
      localitesByProvince.set(
        p.id,
        items.filter((l) => l.active),
      );
    }
    return {
      pool,
      labels: await this.registry.provinceLabels(em, programId),
      localitesByProvince,
      localiteNames,
      cohorts: await this.lists.list(ProgramListType.COHORTE),
      statuses: await this.lists.list(ProgramListType.STATUT_FERME),
      takenAmiRefs: new Set(
        pool.map((e) => e.amiRef).filter((a): a is string => !!a),
      ),
    };
  }

  /**
   * Plan for an existing farm; identity completions that would make it look
   * like another farm are dropped unless the job confirms duplicates.
   */
  private plan(
    farm: Farm,
    values: Readonly<Record<string, string>>,
    state: RegistryState,
    confirmDuplicate: boolean,
  ): { plan: EnrichmentPlan; duplicates: unknown[] } {
    const ctx: EnrichmentContext = {
      localites: state.localitesByProvince.get(farm.provinceId ?? '') ?? [],
      localiteNames: state.localiteNames,
      cohorts: state.cohorts,
      statuses: state.statuses,
      takenAmiRefs: state.takenAmiRefs,
    };
    const plan = planEnrichment(farm, values, ctx);
    const identity =
      IDENTITY_FIELDS.some((f) => plan.patch[f] !== undefined) || !!plan.gps;
    const self = state.pool.find((e) => e.id === farm.id);
    if (!identity || !self) return { plan, duplicates: [] };
    const after: RegistryEntry = {
      ...self,
      localiteId: plan.patch.localiteId ?? self.localiteId,
      exploitantName: plan.patch.exploitantName ?? self.exploitantName,
      phone: plan.patch.exploitantPhone ?? self.phone,
      latitude: plan.gps?.latitude ?? self.latitude,
      longitude: plan.gps?.longitude ?? self.longitude,
    };
    const before = new Set(
      this.registry
        .scoreAgainst(self, state.pool, state.labels)
        .map((c) => c.farmId),
    );
    const fresh = this.registry
      .scoreAgainst(after, state.pool, state.labels)
      .filter((c) => !before.has(c.farmId));
    if (fresh.length === 0 || confirmDuplicate) {
      return { plan, duplicates: fresh };
    }
    const patch = { ...plan.patch };
    for (const f of IDENTITY_FIELDS) delete patch[f];
    const kept = (Object.keys(patch) as (keyof typeof patch)[]).map((k) =>
      fieldLabel(k),
    );
    return {
      plan: {
        patch,
        gps: null,
        fields: kept,
        warnings: [
          ...plan.warnings,
          `Compléments d'identité non repris (localité, exploitant, téléphone, GPS) : la fiche ressemblerait alors à ${fresh
            .map(
              (c) => `${c.code ?? '?'} « ${c.name} » (${c.reasons.join(', ')})`,
            )
            .join(
              ' ; ',
            )}. Confirmez les doublons dans les réglages de l'import pour les reprendre.`,
        ],
      },
      duplicates: fresh,
    };
  }

  private sourceKey(values: Readonly<Record<string, string>>): string | null {
    const ami = normalizeAmiRef(values.amiRef);
    if (ami) return `AMI:${ami}`;
    if (!values.name || !values.province) return null;
    return `NOM:${values.province.trim().toUpperCase()}|${normalizeFarmName(values.name)}`;
  }

  /** Controls: the farm importer's dry run, plus the completions planned. */
  async control(
    user: AuthUser,
    job: ImportJob,
    rows: readonly StagedRow[],
  ): Promise<Map<number, RowFinding>> {
    const findings = new Map<number, RowFinding>();
    const active = rows.filter((r) => !r.excluded);
    if (active.length === 0) return findings;
    const report = await this.importer.import(user, {
      rows: this.importerRows(active),
      dryRun: true,
      confirmDuplicate: job.options.confirmDuplicate,
    });
    const em = this.dataSource.manager;
    const state = await this.state(em, job.programId);
    const farms = await this.farmsOf(em, report.lines);
    report.lines.forEach((l, i) => {
      const row = active[i];
      const finding: RowFinding = {
        errors: [],
        warnings: [],
        planned: null,
        groupKey: null,
        sourceKey: this.sourceKey(row.values),
        details: null,
      };
      findings.set(row.line, finding);
      if (
        job.type === ImportJobType.AMI &&
        !row.values.amiRef &&
        l.outcome !== 'REJETEE'
      ) {
        finding.warnings.push(
          'Référence AMI absente : la ferme est rapprochée par son nom et sa province.',
        );
      }
      if (l.outcome === 'REJETEE') {
        finding.errors.push(l.reason ?? 'Ligne refusée.');
        finding.planned = ImportRowOutcome.REJETEE;
        if (l.duplicates) finding.details = { duplicates: l.duplicates };
        return;
      }
      if (l.outcome === 'A_CREER') {
        finding.planned = ImportRowOutcome.INTEGREE;
        return;
      }
      finding.planned = ImportRowOutcome.DEJA_PRESENTE;
      const farm = l.farmId ? farms.get(l.farmId) : undefined;
      if (!farm) {
        if (l.reason) finding.warnings.push(l.reason);
        return;
      }
      const { plan, duplicates } = this.plan(
        farm,
        row.values,
        state,
        job.options.confirmDuplicate,
      );
      if (plan.patch.amiRef) state.takenAmiRefs.add(plan.patch.amiRef);
      finding.warnings.push(...plan.warnings);
      finding.details = {
        farmId: farm.id,
        code: farm.code,
        ...(plan.fields.length > 0 ? { completes: plan.fields } : {}),
        ...(duplicates.length > 0 ? { duplicates } : {}),
      };
      if (plan.fields.length > 0) finding.planned = ImportRowOutcome.ENRICHIE;
    });
    return findings;
  }

  private async farmsOf(
    em: EntityManager,
    lines: readonly ImportLine[],
  ): Promise<Map<string, Farm>> {
    const ids = lines.map((l) => l.farmId).filter((id): id is string => !!id);
    if (ids.length === 0) return new Map();
    const rows = await em.getRepository(Farm).find({ where: { id: In(ids) } });
    return new Map(rows.map((f) => [f.id, f]));
  }

  /** Writes the farms in `em` (the job's transaction); excluded lines are skipped. */
  async apply(
    em: EntityManager,
    user: AuthUser,
    job: ImportJob,
    rows: readonly StagedRow[],
  ): Promise<Map<number, RowResult>> {
    const results = new Map<number, RowResult>();
    const active = rows.filter((r) => !r.excluded);
    if (active.length === 0) return results;
    const report = await this.importer.import(user, {
      rows: this.importerRows(active),
      dryRun: false,
      confirmDuplicate: job.options.confirmDuplicate,
      em,
    });
    const state = await this.state(em, job.programId);
    const farms = await this.farmsOf(em, report.lines);
    for (const [i, l] of report.lines.entries()) {
      const row = active[i];
      if (l.outcome === 'CREEE') {
        results.set(row.line, {
          outcome: ImportRowOutcome.INTEGREE,
          message: `Ferme créée au registre : ${l.code}.`,
          targetId: l.farmId ?? null,
          targetCode: l.code ?? null,
        });
        continue;
      }
      if (l.outcome === 'REJETEE') {
        results.set(row.line, {
          outcome: ImportRowOutcome.REJETEE,
          message: l.reason ?? 'Ligne refusée.',
          targetId: null,
          targetCode: null,
        });
        continue;
      }
      const farm = l.farmId ? farms.get(l.farmId) : undefined;
      if (!farm) {
        results.set(row.line, {
          outcome: ImportRowOutcome.DEJA_PRESENTE,
          message: l.reason ?? 'Déjà présente.',
          targetId: null,
          targetCode: null,
        });
        continue;
      }
      const { plan } = this.plan(
        farm,
        row.values,
        state,
        job.options.confirmDuplicate,
      );
      if (plan.fields.length === 0) {
        results.set(row.line, {
          outcome: ImportRowOutcome.DEJA_PRESENTE,
          message: `Déjà au registre (${farm.code}) : rien à compléter.`,
          targetId: farm.id,
          targetCode: farm.code,
        });
        continue;
      }
      if (Object.keys(plan.patch).length > 0) {
        await em.getRepository(Farm).update(farm.id, plan.patch);
        Object.assign(farm, plan.patch);
      }
      if (plan.patch.amiRef) state.takenAmiRefs.add(plan.patch.amiRef);
      if (plan.gps && farm.provinceId) {
        const province = await em
          .getRepository(Province)
          .findOneByOrFail({ id: farm.provinceId });
        await this.registry.applyGps(
          em,
          farm,
          province,
          {
            ...plan.gps,
            capturedAt: new Date(),
            source: GpsSource.IMPORT,
            accuracyM: null,
          },
          user.id,
          `Position reprise (import ${job.type})`,
        );
      }
      // Later lines are scored against the completed sheet.
      const self = state.pool.find((e) => e.id === farm.id);
      if (self) {
        state.pool[state.pool.indexOf(self)] = {
          ...self,
          localiteId: farm.localiteId,
          exploitantName: farm.exploitantName,
          phone: farm.exploitantPhone,
          latitude: farm.latitude,
          longitude: farm.longitude,
          amiRef: farm.amiRef,
        };
      }
      results.set(row.line, {
        outcome: ImportRowOutcome.ENRICHIE,
        message: `Déjà au registre (${farm.code}), complétée : ${plan.fields.join(', ')}.`,
        targetId: farm.id,
        targetCode: farm.code,
      });
    }
    return results;
  }
}
