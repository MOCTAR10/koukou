import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import {
  ImportJobStatus,
  ImportJobType,
  ImportRowOutcome,
  ImportRowStatus,
} from '../../common/enums/import-job.enum.js';
import { CsvService } from '../../common/services/csv.service.js';
import { PdfService } from '../../common/services/pdf.service.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import {
  IMPORT_MAX_ROWS,
  type UploadedCsvFile,
} from '../programme/farms/farm-import.service.js';
import { ProgrammeService } from '../programme/programme.service.js';
import { User } from '../users/entities/user.entity.js';
import { BandRecoveryService } from './band-recovery.service.js';
import type {
  CorrectImportRowDto,
  DepositImportDto,
  ImportRowsQueryDto,
  ImportSettingsDto,
  ListImportsQueryDto,
  RejectImportDto,
  ValidateImportDto,
} from './dto/import-job.dto.js';
import { ImportJob } from './entities/import-job.entity.js';
import {
  ImportRow,
  type ImportRowCorrection,
} from './entities/import-row.entity.js';
import { FarmRecoveryService } from './farm-recovery.service.js';
import { readImportFile } from './import-file-readers.js';
import {
  buildMapping,
  fieldsOf,
  mapCells,
  mappingProblem,
  pipelineOf,
} from './import-fields.js';
import {
  countRows,
  rowStatusOf,
  stepRefusal,
  type ImportJobStep,
} from './import-job-rules.js';
import {
  buildReport,
  reportCsvTable,
  type RecoveryReport,
} from './import-report.js';
import { recoveryReportDocument } from './import-report.pdf.js';
import {
  IMPORT_TEMPLATES,
  templateOf,
  templateTable,
  templateView,
} from './import-templates.js';
import type { RowFinding, RowResult, StagedRow } from './recovery-types.js';

const CHUNK = 500;

/** Thrown inside the dry run's transaction to roll it back. */
class DryRunRollback extends Error {}

const ALL_STEPS: readonly ImportJobStep[] = [
  'SETTINGS',
  'CORRECT',
  'DRY_RUN',
  'VALIDATE',
  'INTEGRATE',
  'REJECT',
];

/** Header names made unique and non-empty (they key the mapping). */
function uniqueHeaders(cells: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((c, i) => {
    const base = c.trim() || `colonne_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** Mapped values with the line's manual corrections replayed, in order. */
function correctedValues(
  mapped: Record<string, string>,
  corrections: readonly ImportRowCorrection[],
): Record<string, string> {
  const values = { ...mapped };
  for (const c of corrections) {
    for (const ch of c.changes) {
      if (ch.after === null || ch.after === '') delete values[ch.field];
      else values[ch.field] = ch.after;
    }
  }
  return values;
}

/**
 * Data recovery jobs (CDC §9, feature 31; POUFA plan §15): deposit (CSV) →
 * analysis into staging → controls → dry run with report → validation by an
 * authorised profile → integration in one transaction. National scope only
 * for institutional accounts (a recovery spans every province).
 */
@Injectable()
export class ImportJobsService {
  constructor(
    private readonly programme: ProgrammeService,
    private readonly scope: ScopeResolver,
    private readonly farms: FarmRecoveryService,
    private readonly bands: BandRecoveryService,
    private readonly pdf: PdfService,
    private readonly csv: CsvService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // -------------------------------------------------------------------
  // Access and loading
  // -------------------------------------------------------------------

  private async assertNational(user: AuthUser): Promise<void> {
    if (!this.scope.isInstitution(user)) return;
    const access = await this.scope.requireAccess(user);
    if (access.scopeKind !== AccessScopeKind.ALL) {
      throw new ForbiddenException(
        'La reprise des données est réservée aux profils de périmètre national.',
      );
    }
  }

  private async findJob(
    em: EntityManager,
    id: string,
    lock = false,
  ): Promise<ImportJob> {
    const program = await this.programme.current();
    const qb = em
      .getRepository(ImportJob)
      .createQueryBuilder('job')
      .where('job.id = :id AND job.program_id = :programId', {
        id,
        programId: program.id,
      });
    if (lock) qb.setLock('pessimistic_write');
    const job = await qb.getOne();
    if (!job) throw new NotFoundException('Import introuvable.');
    return job;
  }

  private loadRows(em: EntityManager, jobId: string): Promise<ImportRow[]> {
    return em
      .getRepository(ImportRow)
      .find({ where: { jobId }, order: { line: 'ASC' } });
  }

  /** Runs `fn` on the locked job after checking `step` is allowed. */
  private async withJob<T>(
    user: AuthUser,
    id: string,
    step: ImportJobStep,
    fn: (em: EntityManager, job: ImportJob) => Promise<T>,
  ): Promise<T> {
    await this.assertNational(user);
    return this.dataSource.transaction(async (em) => {
      const job = await this.findJob(em, id, true);
      const refusal = stepRefusal(step, job.status);
      if (refusal) throw new ConflictException(refusal);
      return fn(em, job);
    });
  }

  private async persist(
    em: EntityManager,
    job: ImportJob,
    rows: readonly ImportRow[],
  ): Promise<void> {
    await em.getRepository(ImportJob).save(job);
    const repo = em.getRepository(ImportRow);
    for (let i = 0; i < rows.length; i += CHUNK) {
      await repo.upsert(
        rows.slice(
          i,
          i + CHUNK,
        ) as unknown as QueryDeepPartialEntity<ImportRow>[],
        ['id'],
      );
    }
  }

  private staged(rows: readonly ImportRow[]): StagedRow[] {
    return rows.map((r) => ({
      line: r.line,
      values: r.values,
      excluded: r.excluded,
    }));
  }

  // -------------------------------------------------------------------
  // Analysis and controls
  // -------------------------------------------------------------------

  /**
   * Maps every line (corrections replayed), then controls them when the
   * mapping is complete. Leaves the job in ANALYSE (mapping problem) or
   * CONTROLE.
   */
  private async analyse(
    em: EntityManager,
    user: AuthUser,
    job: ImportJob,
    rows: ImportRow[],
    overrides: Record<string, string | null>,
  ): Promise<void> {
    const pipeline = pipelineOf(job.type);
    const unknownHeaders = Object.keys(overrides).filter(
      (h) => !job.headers.includes(h),
    );
    if (unknownHeaders.length > 0) {
      throw new BadRequestException(
        `Colonne(s) absente(s) du fichier : ${unknownHeaders.join(', ')}.`,
      );
    }
    const { mapping, unknownColumns } = buildMapping(
      pipeline,
      job.headers,
      overrides,
    );
    job.columnMapping = mapping;
    job.unknownColumns = unknownColumns;
    job.mappingError = mappingProblem(pipeline, overrides, mapping);
    job.analysedAt = new Date();
    for (const row of rows) {
      row.values = correctedValues(
        mapCells(job.headers, mapping, row.raw),
        row.corrections,
      );
    }
    this.resetResults(job, rows);
    if (job.mappingError) {
      job.status = ImportJobStatus.ANALYSE;
      for (const row of rows) {
        row.status = row.excluded
          ? ImportRowStatus.EXCLUE
          : ImportRowStatus.VALIDE;
        row.errors = [];
        row.warnings = [];
        row.plannedOutcome = null;
        row.details = null;
      }
      job.controlledAt = null;
      job.counts = countRows(rows, 'planned');
      return;
    }
    await this.control(em, user, job, rows);
  }

  private resetResults(job: ImportJob, rows: ImportRow[]): void {
    job.dryRunAt = null;
    job.dryRunById = null;
    for (const row of rows) {
      row.dryRunOutcome = null;
      row.dryRunMessage = null;
      row.dryRunCode = null;
    }
  }

  private async findings(
    em: EntityManager,
    user: AuthUser,
    job: ImportJob,
    rows: readonly ImportRow[],
  ): Promise<Map<number, RowFinding>> {
    if (pipelineOf(job.type) === 'FARMS') {
      return this.farms.control(user, job, this.staged(rows));
    }
    return (await this.bands.control(em, job, this.staged(rows))).findings;
  }

  private async control(
    em: EntityManager,
    user: AuthUser,
    job: ImportJob,
    rows: ImportRow[],
  ): Promise<void> {
    const findings = await this.findings(em, user, job, rows);
    for (const row of rows) {
      const f = row.excluded ? undefined : findings.get(row.line);
      row.errors = f?.errors ?? [];
      row.warnings = f?.warnings ?? [];
      row.plannedOutcome = row.excluded
        ? ImportRowOutcome.EXCLUE
        : (f?.planned ?? null);
      row.groupKey = f?.groupKey ?? null;
      row.sourceKey = f?.sourceKey ?? null;
      row.details = f?.details ?? null;
      row.status = rowStatusOf(row.excluded, row.errors, row.warnings);
    }
    this.resetResults(job, rows);
    job.status = ImportJobStatus.CONTROLE;
    job.controlledAt = new Date();
    job.counts = countRows(rows, 'planned');
  }

  // -------------------------------------------------------------------
  // Steps
  // -------------------------------------------------------------------

  async deposit(
    user: AuthUser,
    file: UploadedCsvFile | undefined,
    dto: DepositImportDto,
  ) {
    await this.assertNational(user);
    if (!file) {
      throw new BadRequestException(
        'Envoyez le fichier CSV dans le champ « file » (séparateur , ou ;).',
      );
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Fichier vide.');
    }
    // Parser seam (import-file-readers.ts): CSV today, xlsx next to it.
    const {
      header: head,
      rows: data,
      encoding,
      delimiter,
    } = await readImportFile(file);
    if (head.length === 0) {
      throw new BadRequestException(
        "Fichier vide : une ligne d'en-tête est attendue.",
      );
    }
    if (data.length === 0) {
      throw new BadRequestException("Aucune ligne de données sous l'en-tête.");
    }
    if (data.length > IMPORT_MAX_ROWS) {
      throw new BadRequestException(
        `${IMPORT_MAX_ROWS} lignes au maximum par import (${data.length} reçues) : découpez le fichier.`,
      );
    }
    const overrides = this.overridesOf(dto.mapping);
    const headers = uniqueHeaders(head);
    const program = await this.programme.current();
    const id = await this.dataSource.transaction(async (em) => {
      const job = em.getRepository(ImportJob).create({
        id: randomUUID(),
        programId: program.id,
        type: dto.type,
        status: ImportJobStatus.DEPOSE,
        fileName: (file.originalname || 'import.csv').slice(0, 255),
        fileSize: file.buffer.length,
        fileSha256: createHash('sha256').update(file.buffer).digest('hex'),
        encoding,
        delimiter,
        headers,
        columnMapping: {},
        unknownColumns: [],
        mappingError: null,
        options: { confirmDuplicate: dto.confirmDuplicate === true },
        counts: countRows([], 'planned'),
        note: dto.note?.trim() || null,
        createdById: user.id,
      });
      const rows = data.map((cells, i) =>
        em.getRepository(ImportRow).create({
          id: randomUUID(),
          jobId: job.id,
          line: i + 2,
          raw: headers.map((_, c) => cells[c] ?? ''),
          values: {},
          status: ImportRowStatus.VALIDE,
          plannedOutcome: null,
          groupKey: null,
          sourceKey: null,
          errors: [],
          warnings: [],
          details: null,
          excluded: false,
          corrections: [],
          dryRunOutcome: null,
          dryRunMessage: null,
          dryRunCode: null,
          outcome: null,
          outcomeMessage: null,
          targetId: null,
          targetCode: null,
        }),
      );
      job.counts = countRows(rows, 'planned');
      await em.getRepository(ImportJob).insert(job);
      await this.persist(em, job, rows);
      await this.analyse(em, user, job, rows, overrides);
      await this.persist(em, job, rows);
      return job.id;
    });
    return this.get(user, id);
  }

  private overridesOf(
    mapping: Record<string, unknown> | undefined,
  ): Record<string, string | null> {
    if (mapping === undefined) return {};
    const out: Record<string, string | null> = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (field !== null && typeof field !== 'string') {
        throw new BadRequestException(
          `Correspondance invalide pour la colonne « ${header} » : un nom de champ ou null est attendu.`,
        );
      }
      out[header] = field === '' ? null : field;
    }
    return out;
  }

  async settings(user: AuthUser, id: string, dto: ImportSettingsDto) {
    await this.withJob(user, id, 'SETTINGS', async (em, job) => {
      const rows = await this.loadRows(em, job.id);
      if (dto.confirmDuplicate !== undefined) {
        job.options = {
          ...job.options,
          confirmDuplicate: dto.confirmDuplicate,
        };
      }
      const overrides = {
        ...job.columnMapping,
        ...this.overridesOf(dto.mapping),
      };
      await this.analyse(em, user, job, rows, overrides);
      await this.persist(em, job, rows);
    });
    return this.get(user, id);
  }

  async correctRow(
    user: AuthUser,
    id: string,
    line: number,
    dto: CorrectImportRowDto,
  ) {
    await this.withJob(user, id, 'CORRECT', async (em, job) => {
      const rows = await this.loadRows(em, job.id);
      const row = rows.find((r) => r.line === line);
      if (!row)
        throw new NotFoundException(
          `Ligne ${line} introuvable dans cet import.`,
        );
      const keys = new Set(fieldsOf(pipelineOf(job.type)).map((f) => f.key));
      const changes: ImportRowCorrection['changes'] = [];
      for (const [field, raw] of Object.entries(dto.values ?? {})) {
        if (!keys.has(field)) {
          throw new BadRequestException(
            `Champ inconnu pour ce type d'import : ${field}.`,
          );
        }
        if (raw !== null && typeof raw !== 'string') {
          throw new BadRequestException(
            `Valeur invalide pour ${field} : un texte ou null est attendu.`,
          );
        }
        const after = raw === null ? null : raw.trim() || null;
        const before = row.values[field] ?? null;
        if (after !== before) changes.push({ field, before, after });
      }
      const excludedChange =
        dto.exclude !== undefined && dto.exclude !== row.excluded;
      if (changes.length === 0 && !excludedChange) {
        throw new BadRequestException(
          'Aucune modification : les valeurs envoyées sont celles de la ligne.',
        );
      }
      row.corrections = [
        ...row.corrections,
        {
          at: new Date().toISOString(),
          byId: user.id,
          reason: dto.reason.trim(),
          changes,
          ...(excludedChange ? { excluded: dto.exclude } : {}),
        },
      ];
      if (excludedChange) row.excluded = dto.exclude as boolean;
      await this.analyse(em, user, job, rows, job.columnMapping);
      await this.persist(em, job, rows);
    });
    return {
      job: await this.get(user, id),
      row: await this.row(user, id, line),
    };
  }

  /**
   * Fresh controls, then the whole integration in a transaction rolled
   * back: the report says exactly what integration would do today (codes
   * included, marked « simulé »).
   */
  async dryRun(user: AuthUser, id: string) {
    const { job, rows, stamp } = await this.withJob(
      user,
      id,
      'DRY_RUN',
      async (em, job) => {
        if (job.mappingError) throw new BadRequestException(job.mappingError);
        const rows = await this.loadRows(em, job.id);
        await this.control(em, user, job, rows);
        await this.persist(em, job, rows);
        return { job, rows, stamp: job.controlledAt?.getTime() };
      },
    );
    let results = new Map<number, RowResult>();
    try {
      await this.dataSource.transaction(async (em) => {
        results = await this.integrateIn(em, user, job, rows, true);
        throw new DryRunRollback();
      });
    } catch (e) {
      if (!(e instanceof DryRunRollback)) throw e;
    }
    await this.dataSource.transaction(async (em) => {
      const current = await this.findJob(em, id, true);
      if (
        current.status !== ImportJobStatus.CONTROLE ||
        current.controlledAt?.getTime() !== stamp
      ) {
        throw new ConflictException(
          "L'import a été modifié pendant l'essai à blanc : relancez l'essai.",
        );
      }
      const fresh = await this.loadRows(em, id);
      for (const row of fresh) {
        const r = this.resultOf(row, results);
        row.dryRunOutcome = r.outcome;
        row.dryRunMessage = r.message;
        row.dryRunCode = r.targetCode;
      }
      current.status = ImportJobStatus.ESSAI;
      current.dryRunAt = new Date();
      current.dryRunById = user.id;
      current.counts = countRows(fresh, 'dryRun');
      await this.persist(em, current, fresh);
    });
    return this.get(user, id);
  }

  /** Outcome of a line from the pipeline's results (lines in error rejected). */
  private resultOf(
    row: ImportRow,
    results: ReadonlyMap<number, RowResult>,
  ): RowResult {
    if (row.excluded) {
      const last = [...row.corrections]
        .reverse()
        .find((c) => c.excluded === true);
      return {
        outcome: ImportRowOutcome.EXCLUE,
        message: `Ligne exclue${last ? ` : ${last.reason}` : ''}.`,
        targetId: null,
        targetCode: null,
      };
    }
    return (
      results.get(row.line) ?? {
        outcome: ImportRowOutcome.REJETEE,
        message: row.errors.join(' ') || 'Ligne non reprise.',
        targetId: null,
        targetCode: null,
      }
    );
  }

  /** Writes the job's lines in `em` (rolled back by the dry run). */
  private async integrateIn(
    em: EntityManager,
    user: AuthUser,
    job: ImportJob,
    rows: readonly ImportRow[],
    dryRun: boolean,
  ): Promise<Map<number, RowResult>> {
    if (pipelineOf(job.type) === 'FARMS') {
      return this.farms.apply(em, user, job, this.staged(rows));
    }
    await this.bands.lock(em, job.programId);
    // Controlled again under the lock: bands recovered since are matched.
    const { findings, plans } = await this.bands.control(
      em,
      job,
      this.staged(rows),
    );
    const results = await this.bands.apply(em, user, job, plans, dryRun);
    for (const [line, f] of findings) {
      if (!results.has(line) && f.errors.length > 0) {
        results.set(line, {
          outcome: ImportRowOutcome.REJETEE,
          message: f.errors.join(' '),
          targetId: null,
          targetCode: null,
        });
      }
    }
    return results;
  }

  async validate(user: AuthUser, id: string, dto: ValidateImportDto) {
    await this.withJob(user, id, 'VALIDATE', async (em, job) => {
      job.status = ImportJobStatus.VALIDE;
      job.validatedAt = new Date();
      job.validatedById = user.id;
      job.validationComment = dto.comment?.trim() || null;
      await em.getRepository(ImportJob).save(job);
    });
    return this.get(user, id);
  }

  /** Integration of a validated job, in one transaction. */
  async integrate(user: AuthUser, id: string) {
    await this.withJob(user, id, 'INTEGRATE', async (em, job) => {
      const rows = await this.loadRows(em, job.id);
      const results = await this.integrateIn(em, user, job, rows, false);
      for (const row of rows) {
        const r = this.resultOf(row, results);
        row.outcome = r.outcome;
        row.outcomeMessage = r.message;
        row.targetId = r.targetId;
        row.targetCode = r.targetCode;
      }
      job.status = ImportJobStatus.INTEGRE;
      job.integratedAt = new Date();
      job.integratedById = user.id;
      job.counts = countRows(rows, 'final');
      await this.persist(em, job, rows);
    });
    return this.get(user, id);
  }

  async reject(user: AuthUser, id: string, dto: RejectImportDto) {
    await this.withJob(user, id, 'REJECT', async (em, job) => {
      job.status = ImportJobStatus.REJETE;
      job.rejectedAt = new Date();
      job.rejectedById = user.id;
      job.rejectionReason = dto.reason.trim();
      await em.getRepository(ImportJob).save(job);
    });
    return this.get(user, id);
  }

  // -------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------

  private async userNames(
    ids: (string | null | undefined)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (unique.length === 0) return new Map();
    const users = await this.dataSource.getRepository(User).find({
      where: { id: In(unique) },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  private jobView(job: ImportJob, names: ReadonlyMap<string, string>) {
    const who = (id: string | null) =>
      id ? { id, fullName: names.get(id) ?? null } : null;
    return {
      id: job.id,
      type: job.type,
      typeLabel: templateOf(job.type).label,
      pipeline: pipelineOf(job.type),
      status: job.status,
      fileName: job.fileName,
      fileSize: job.fileSize,
      fileSha256: job.fileSha256,
      encoding: job.encoding,
      delimiter: job.delimiter,
      note: job.note,
      headers: job.headers,
      columnMapping: job.columnMapping,
      unknownColumns: job.unknownColumns,
      mappingError: job.mappingError,
      options: job.options,
      counts: job.counts,
      allowedSteps: ALL_STEPS.filter(
        (s) =>
          stepRefusal(s, job.status) === null &&
          !(s === 'DRY_RUN' && job.mappingError),
      ),
      createdBy: who(job.createdById),
      createdAt: job.createdAt,
      analysedAt: job.analysedAt,
      controlledAt: job.controlledAt,
      dryRunAt: job.dryRunAt,
      dryRunBy: who(job.dryRunById),
      validatedAt: job.validatedAt,
      validatedBy: who(job.validatedById),
      validationComment: job.validationComment,
      integratedAt: job.integratedAt,
      integratedBy: who(job.integratedById),
      rejectedAt: job.rejectedAt,
      rejectedBy: who(job.rejectedById),
      rejectionReason: job.rejectionReason,
    };
  }

  async list(user: AuthUser, query: ListImportsQueryDto) {
    await this.assertNational(user);
    const program = await this.programme.current();
    const jobs = await this.dataSource.getRepository(ImportJob).find({
      where: {
        programId: program.id,
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const names = await this.userNames(jobs.map((j) => j.createdById));
    return jobs.map((j) => {
      const v = this.jobView(j, names);
      return {
        id: v.id,
        type: v.type,
        typeLabel: v.typeLabel,
        status: v.status,
        fileName: v.fileName,
        note: v.note,
        counts: v.counts,
        createdBy: v.createdBy,
        createdAt: v.createdAt,
        integratedAt: v.integratedAt,
      };
    });
  }

  async get(user: AuthUser, id: string) {
    await this.assertNational(user);
    const job = await this.findJob(this.dataSource.manager, id);
    const names = await this.userNames([
      job.createdById,
      job.dryRunById,
      job.validatedById,
      job.integratedById,
      job.rejectedById,
    ]);
    const view = this.jobView(job, names);
    const sameFile = await this.dataSource.getRepository(ImportJob).find({
      where: {
        programId: job.programId,
        fileSha256: job.fileSha256,
        status: ImportJobStatus.INTEGRE,
      },
      select: { id: true, integratedAt: true },
    });
    const earlier = sameFile.filter((j) => j.id !== job.id);
    return {
      ...view,
      fields: fieldsOf(view.pipeline).map((f) => ({
        key: f.key,
        header: f.header,
        label: f.label,
        required: f.required === true,
      })),
      warnings:
        earlier.length > 0
          ? [
              `Ce fichier a déjà été intégré (${earlier.length} import(s)) : les lignes déjà reprises seront signalées « déjà présentes ».`,
            ]
          : [],
    };
  }

  private rowView(job: ImportJob, row: ImportRow) {
    return {
      id: row.id,
      line: row.line,
      raw: Object.fromEntries(job.headers.map((h, i) => [h, row.raw[i] ?? ''])),
      values: row.values,
      status: row.status,
      excluded: row.excluded,
      errors: row.errors,
      warnings: row.warnings,
      details: row.details,
      plannedOutcome: row.plannedOutcome,
      groupKey: row.groupKey,
      sourceKey: row.sourceKey,
      dryRunOutcome: row.dryRunOutcome,
      dryRunMessage: row.dryRunMessage,
      dryRunCode: row.dryRunCode,
      outcome: row.outcome,
      outcomeMessage: row.outcomeMessage,
      targetId: row.targetId,
      targetCode: row.targetCode,
      corrections: row.corrections,
    };
  }

  async rows(user: AuthUser, id: string, query: ImportRowsQueryDto) {
    await this.assertNational(user);
    const job = await this.findJob(this.dataSource.manager, id);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const qb = this.dataSource
      .getRepository(ImportRow)
      .createQueryBuilder('r')
      .where('r.job_id = :id', { id: job.id });
    if (query.status)
      qb.andWhere('r.status = :status', { status: query.status });
    if (query.outcome) {
      qb.andWhere(
        'COALESCE(r.outcome, r.dry_run_outcome, r.planned_outcome) = :outcome',
        { outcome: query.outcome },
      );
    }
    const [items, total] = await qb
      .orderBy('r.line', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return {
      total,
      page,
      pageSize,
      items: items.map((r) => this.rowView(job, r)),
    };
  }

  async row(user: AuthUser, id: string, line: number) {
    await this.assertNational(user);
    const job = await this.findJob(this.dataSource.manager, id);
    const row = await this.dataSource
      .getRepository(ImportRow)
      .findOne({ where: { jobId: job.id, line } });
    if (!row)
      throw new NotFoundException(`Ligne ${line} introuvable dans cet import.`);
    return this.rowView(job, row);
  }

  async report(user: AuthUser, id: string): Promise<RecoveryReport> {
    await this.assertNational(user);
    const job = await this.findJob(this.dataSource.manager, id);
    const rows = await this.loadRows(this.dataSource.manager, job.id);
    const names = await this.userNames([
      job.createdById,
      job.dryRunById,
      job.validatedById,
      job.integratedById,
      job.rejectedById,
      ...rows.flatMap((r) => r.corrections.map((c) => c.byId)),
    ]);
    return buildReport(job, rows, names);
  }

  async reportPdf(user: AuthUser, id: string) {
    const report = await this.report(user, id);
    return {
      report,
      buffer: await this.pdf.render(recoveryReportDocument(report)),
    };
  }

  async reportCsv(user: AuthUser, id: string) {
    const report = await this.report(user, id);
    const { headers, rows } = reportCsvTable(report);
    return { report, buffer: this.csv.toCsv(headers, rows) };
  }

  templates() {
    return IMPORT_TEMPLATES.map((t) => templateView(t));
  }

  template(type: string) {
    const t = IMPORT_TEMPLATES.find((x) => x.type === (type as ImportJobType));
    if (!t) {
      throw new NotFoundException(
        `Modèle inconnu : ${type} (AMI, BANDES_HISTORIQUES, OUTIL_TRANSITOIRE).`,
      );
    }
    const { headers, example } = templateTable(t);
    return { fileName: t.fileName, buffer: this.csv.toCsv(headers, [example]) };
  }
}
