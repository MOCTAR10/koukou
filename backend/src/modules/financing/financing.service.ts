import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { isUuid } from '../../common/context/request-context.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  DisbursementStatus,
  DocumentProvider,
  DocumentSource,
  FinancingDecision,
  FinancingDocumentStatus,
  FinancingStep,
} from '../../common/enums/financing.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { KOUKOU_EVENTS, koukouBus } from '../../common/utils/event-bus.js';
import { isRealIsoDate, todayLocal } from '../../common/utils/date.utils.js';
import { grants } from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import type { UploadedImageFile } from '../farms/farms.service.js';
import { ProgrammeService } from '../programme/programme.service.js';
import { DEFAULT_REQUIREMENTS } from './data/default-requirements.js';
import {
  CreateFinancingFileDto,
  CreateRequirementDto,
  DisbursementDto,
  FilesQueryDto,
  GenerateScheduleDto,
  PassStepDto,
  ReleaseDisbursementDto,
  RepaymentDto,
  ReviewDocumentDto,
  UpdateFinancingFileDto,
  UpdateRequirementDto,
  UploadDocumentDto,
} from './dto/financing.dto.js';
import { FinancingDisbursement } from './entities/financing-disbursement.entity.js';
import { FinancingDocument } from './entities/financing-document.entity.js';
import { FinancingFile } from './entities/financing-file.entity.js';
import { FinancingInstalment } from './entities/financing-instalment.entity.js';
import { FinancingRepayment } from './entities/financing-repayment.entity.js';
import { FinancingRequirement } from './entities/financing-requirement.entity.js';
import { FinancingStepEvent } from './entities/financing-step-event.entity.js';
import type * as C from './financing.contract.js';
import {
  FINANCING_STEP_LABELS,
  addMonths,
  canReleaseAtStep,
  generateSchedule,
  scheduleTermsProblem,
  type ScheduleInput,
  stepPassVerdict,
  sumTranches,
  trancheProblem,
} from './financing-rules.js';
import {
  FINANCING_FILE_MAX_BYTES,
  discardFile,
  financingDir,
  readStored,
  storeFile,
  templatesDir,
  validateUpload,
} from './financing-storage.js';
import {
  FinancingViewService,
  blockersOf,
} from './financing-view.service.js';

export { FINANCING_FILE_MAX_BYTES };

const ALL_RIGHTS: C.FinancingRights = { read: true, create: true, edit: true, validate: true };

/** Files, steps, tranches, schedule, repayments, documents and checklist of the financer workspace. */
@Injectable()
export class FinancingService {
  private seededPrograms = new Set<string>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly programme: ProgrammeService,
    private readonly scope: ScopeResolver,
    private readonly view: FinancingViewService,
  ) {}

  // ── Rights and helpers ───────────────────────────────────────────────────

  /** What the caller may do, from the matrix (PLATFORM_ADMIN = all). */
  async rightsOf(user: AuthUser): Promise<C.FinancingRights> {
    if (user.role === UserRole.PLATFORM_ADMIN) return ALL_RIGHTS;
    const access = await this.scope.accessOf(user.id);
    const m = access?.matrix ?? {};
    return {
      read: grants(m, 'FINANCEMENT', 'CONSULTER'),
      create: grants(m, 'FINANCEMENT', 'CREER'),
      edit: grants(m, 'FINANCEMENT', 'MODIFIER'),
      validate: grants(m, 'FINANCEMENT', 'VALIDER'),
    };
  }

  /** Seeds the missing default requirements of the programme (by code, never overwriting). */
  async ensureRequirements(programId: string): Promise<void> {
    if (this.seededPrograms.has(programId)) return;
    const repo = this.dataSource.getRepository(FinancingRequirement);
    const have = new Set((await repo.find({ where: { programId } })).map((r) => r.code));
    const missing = DEFAULT_REQUIREMENTS.map((r, i) => ({ r, i })).filter(({ r }) => !have.has(r.code));
    if (missing.length > 0) {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(FinancingRequirement)
        .values(
          missing.map(({ r, i }) => ({
            programId,
            code: r.code,
            label: r.label,
            step: r.step,
            required: r.required,
            legalBasis: r.legalBasis,
            providedBy: (r.providedBy ?? 'BCEG') as DocumentProvider,
            validityMonths: r.validityMonths ?? null,
            sort: (i + 1) * 10,
          })),
        )
        .orIgnore()
        .execute();
    }
    this.seededPrograms.add(programId);
  }

  private async programId(): Promise<string> {
    const id = (await this.programme.current()).id;
    await this.ensureRequirements(id);
    return id;
  }

  private assertDate(value: string, label: string): void {
    if (!isRealIsoDate(value)) {
      throw new BadRequestException(`${label} : date invalide (AAAA-MM-JJ).`);
    }
  }

  private async loadFile(id: string, em?: EntityManager, lock = false): Promise<FinancingFile> {
    const programId = await this.programId();
    const file = isUuid(id)
      ? await (em ?? this.dataSource.manager).getRepository(FinancingFile).findOne({
          where: { id, programId },
          ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
        })
      : null;
    if (!file) throw new NotFoundException('Dossier de financement introuvable.');
    // A FARMS / PROVINCES caller only works on the farms of its scope.
    await this.view.assertFarmAllowed(file.farmId);
    return file;
  }

  private async detailOf(file: FinancingFile, user: AuthUser): Promise<C.FinancingFile> {
    const settings = await this.view.settings();
    const bundles = await this.view.bundles([file], settings);
    const requirements = await this.view.requirements(file.programId);
    return this.view.detail(bundles.get(file.id)!, requirements, await this.rightsOf(user));
  }

  /** Locks the file row, runs `fn`, answers the fresh detail. */
  private async mutate(
    user: AuthUser,
    id: string,
    fn: (em: EntityManager, file: FinancingFile) => Promise<void>,
  ): Promise<C.FinancingFile> {
    await this.dataSource.transaction(async (em) => {
      const file = await this.loadFile(id, em, true);
      await fn(em, file);
    });
    return this.detailOf(await this.loadFile(id), user);
  }

  // ── Files ────────────────────────────────────────────────────────────────

  async listFiles(query: FilesQueryDto): Promise<C.FinancingFilePage> {
    const programId = await this.programId();
    const params: unknown[] = [programId];
    const where = ['ff.program_id = $1'];
    const limited = await this.view.limitedFarmIds(programId);
    if (limited) {
      params.push(limited);
      where.push('ff.farm_id = ANY($' + params.length + '::uuid[])');
    }
    if (query.step) {
      params.push(query.step);
      where.push(`ff.step = $${params.length}`);
    }
    if (query.province) {
      params.push(query.province.trim());
      where.push(`(p.code ILIKE $${params.length} OR p.name ILIKE $${params.length} OR p.id::text = $${params.length})`);
    }
    if (query.q?.trim()) {
      params.push(`%${query.q.trim()}%`);
      const n = params.length;
      where.push(`(ff.reference ILIKE $${n} OR f.name ILIKE $${n} OR f.code ILIKE $${n} OR f.exploitant_name ILIKE $${n})`);
    }
    const ids: { id: string }[] = await this.dataSource.query(
      `SELECT ff.id FROM financing_files ff
         JOIN farms f ON f.id = ff.farm_id
         LEFT JOIN provinces p ON p.id = f.province_id
        WHERE ${where.join(' AND ')}`,
      params,
    );
    const files = ids.length
      ? await this.dataSource.getRepository(FinancingFile).findBy(ids.map((r) => ({ id: r.id })))
      : [];
    const settings = await this.view.settings();
    const bundles = await this.view.bundles(files, settings);
    const requirements = await this.view.requirements(programId);
    let rows = files.map((f) => this.view.row(bundles.get(f.id)!, requirements));
    if (query.claimClass) rows = rows.filter((r) => r.claimClass === query.claimClass);
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.reference.localeCompare(a.reference));
    const pageSize = query.pageSize ?? 50;
    const page = query.page ?? 1;
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  }

  async getFile(user: AuthUser, id: string): Promise<C.FinancingFile> {
    return this.detailOf(await this.loadFile(id), user);
  }

  async createFile(user: AuthUser, dto: CreateFinancingFileDto): Promise<C.FinancingFile> {
    const programId = await this.programId();
    const farm = isUuid(dto.farmId)
      ? await this.dataSource.query(`SELECT id FROM farms WHERE id = $1 AND program_id = $2`, [dto.farmId, programId])
      : [];
    if (farm.length === 0) throw new NotFoundException('Ferme introuvable.');
    await this.view.assertFarmAllowed(dto.farmId);
    const year = Number(todayLocal().slice(0, 4));
    const id = await this.dataSource.transaction(async (em) => {
      // One counter per programme and year; the row stays locked until commit.
      const rows: { next: number }[] = await em.query(
        `INSERT INTO id_counters (scope, next) VALUES ($1, 1)
         ON CONFLICT (scope) DO UPDATE SET next = id_counters.next + 1 RETURNING next`,
        [`FINANCEMENT:${programId}:${year}`],
      );
      const reference = `BCEG-${year}-${String(Number(rows[0].next)).padStart(4, '0')}`;
      const file = await em.getRepository(FinancingFile).save(
        em.getRepository(FinancingFile).create({
          programId,
          farmId: dto.farmId,
          reference,
          purpose: dto.purpose,
          step: FinancingStep.DEMANDE,
          requestedFcfa: dto.requestedFcfa ?? null,
          notes: dto.notes ?? null,
          createdById: user.id,
        }),
      );
      await em.getRepository(FinancingStepEvent).save(
        em.getRepository(FinancingStepEvent).create({
          fileId: file.id,
          fromStep: null,
          toStep: FinancingStep.DEMANDE,
          byId: user.id,
          note: 'Ouverture du dossier',
        }),
      );
      return file.id;
    });
    return this.detailOf(await this.loadFile(id), user);
  }

  async updateFile(user: AuthUser, id: string, dto: UpdateFinancingFileDto): Promise<C.FinancingFile> {
    return this.mutate(user, id, async (em, file) => {
      if (file.step === FinancingStep.CLOTURE) {
        throw new ConflictException('Le dossier est clos : il ne se modifie plus.');
      }
      const has = <K extends keyof UpdateFinancingFileDto>(k: K) => dto[k] !== undefined;
      if (has('grantedFcfa') && dto.grantedFcfa !== null && dto.grantedFcfa !== undefined) {
        const tranches = await em.getRepository(FinancingDisbursement).find({ where: { fileId: file.id } });
        const planned = sumTranches(tranches);
        if (dto.grantedFcfa < planned) {
          throw new ConflictException(
            `Le montant accordé ne peut pas être inférieur aux tranches prévues ou débloquées (${planned} FCFA).`,
          );
        }
      }
      if (has('grantedFcfa') && dto.grantedFcfa === null) {
        const tranches = await em.getRepository(FinancingDisbursement).find({ where: { fileId: file.id } });
        if (sumTranches(tranches) > 0) {
          throw new ConflictException('Des tranches existent : le montant accordé ne peut pas être effacé.');
        }
      }
      if (has('purpose')) file.purpose = dto.purpose!.trim();
      if (has('requestedFcfa')) file.requestedFcfa = dto.requestedFcfa ?? null;
      if (has('grantedFcfa')) file.grantedFcfa = dto.grantedFcfa ?? null;
      if (has('amountNote')) file.amountNote = dto.amountNote ?? null;
      if (has('ratePct')) file.ratePct = dto.ratePct ?? null;
      if (has('durationMonths')) file.durationMonths = dto.durationMonths ?? null;
      if (has('graceMonths')) file.graceMonths = dto.graceMonths ?? null;
      if (has('periodicity')) file.periodicity = dto.periodicity ?? null;
      if (has('guarantees')) file.guarantees = dto.guarantees ?? null;
      if (has('guaranteeFund')) file.guaranteeFund = dto.guaranteeFund ?? null;
      if (has('guaranteePct')) file.guaranteePct = dto.guaranteePct ?? null;
      if (has('claimFlag')) file.claimFlag = dto.claimFlag ?? null;
      if (has('claimFlagNote')) file.claimFlagNote = dto.claimFlagNote ?? null;
      if (has('notes')) file.notes = dto.notes ?? null;
      if (
        file.graceMonths !== null &&
        file.durationMonths !== null &&
        file.graceMonths >= file.durationMonths
      ) {
        throw new BadRequestException('Le différé doit être inférieur à la durée du crédit.');
      }
      await em.getRepository(FinancingFile).save(file);
    });
  }

  // ── Steps ────────────────────────────────────────────────────────────────

  async passStep(user: AuthUser, id: string, dto: PassStepDto): Promise<C.FinancingFile> {
    let changed: { from: FinancingStep; to: FinancingStep; eventId: string } | null = null;
    const settings = await this.view.settings();
    const result = await this.mutate(user, id, async (em, file) => {
      if (dto.decisionDate) this.assertDate(dto.decisionDate, 'Date de décision');
      const documents = await em.getRepository(FinancingDocument).find({ where: { fileId: file.id } });
      const requirements = await em.getRepository(FinancingRequirement).find({ where: { programId: file.programId } });
      const tranches = await em.getRepository(FinancingDisbursement).find({ where: { fileId: file.id } });
      const instalments = await em.getRepository(FinancingInstalment).find({ where: { fileId: file.id } });
      const repayments = await em.getRepository(FinancingRepayment).find({ where: { fileId: file.id } });
      const calc = this.view.compute(file, tranches, instalments, repayments, settings);
      const verdict = stepPassVerdict({
        step: file.step,
        to: dto.to,
        decision: file.step === FinancingStep.DECISION ? (dto.decision ?? null) : null,
        grantedFcfa: file.grantedFcfa,
        blockers: blockersOf(file.step, requirements, documents, await this.view.docContext(file.farmId, em)),
        outstandingFcfa: calc.amounts.outstandingFcfa,
      });
      if (!verdict.ok) {
        if (verdict.status === 409) throw new ConflictException(verdict.message);
        throw new BadRequestException(verdict.message);
      }
      const from = file.step;
      file.step = verdict.to;
      if (from === FinancingStep.DECISION) {
        file.decision = verdict.decision;
        file.decisionDate = dto.decisionDate ?? settings.today;
        file.decisionNote = dto.note?.trim() || null;
        if (verdict.decision === FinancingDecision.REFUSE) {
          // A refused file is closed: its planned tranches fall.
          await em
            .getRepository(FinancingDisbursement)
            .update(
              { fileId: file.id, status: DisbursementStatus.PREVUE },
              { status: DisbursementStatus.ANNULEE },
            );
        }
      }
      await em.getRepository(FinancingFile).save(file);
      const event = await em.getRepository(FinancingStepEvent).save(
        em.getRepository(FinancingStepEvent).create({
          fileId: file.id,
          fromStep: from,
          toStep: verdict.to,
          decision: from === FinancingStep.DECISION ? verdict.decision : null,
          note: dto.note?.trim() || null,
          byId: user.id,
        }),
      );
      if (from !== verdict.to) changed = { from, to: verdict.to, eventId: event.id };
    });
    if (changed) {
      const c = changed as { from: FinancingStep; to: FinancingStep; eventId: string };
      koukouBus.emit(KOUKOU_EVENTS.FINANCING_STEP_CHANGED, {
        farmId: result.farmId,
        fileId: result.id,
        reference: result.reference,
        from: c.from,
        to: c.to,
        toLabel: FINANCING_STEP_LABELS[c.to],
        eventId: c.eventId,
      });
    }
    return result;
  }

  // ── Tranches ─────────────────────────────────────────────────────────────

  async addDisbursement(user: AuthUser, id: string, dto: DisbursementDto): Promise<C.FinancingFile> {
    return this.mutate(user, id, async (em, file) => {
      if (dto.plannedDate) this.assertDate(dto.plannedDate, 'Date prévue');
      const repo = em.getRepository(FinancingDisbursement);
      const tranches = await repo.find({ where: { fileId: file.id } });
      const problem = trancheProblem(file, tranches, dto.amountFcfa);
      if (problem) throw new ConflictException(problem);
      await repo.save(
        repo.create({
          fileId: file.id,
          number: tranches.reduce((m, t) => Math.max(m, t.number), 0) + 1,
          plannedDate: dto.plannedDate ?? null,
          amountFcfa: dto.amountFcfa,
          condition: dto.condition ?? null,
          note: dto.note ?? null,
          createdById: user.id,
        }),
      );
    });
  }

  private async tranche(em: EntityManager, file: FinancingFile, did: string): Promise<FinancingDisbursement> {
    const t = isUuid(did)
      ? await em.getRepository(FinancingDisbursement).findOne({ where: { id: did, fileId: file.id } })
      : null;
    if (!t) throw new NotFoundException('Tranche introuvable.');
    return t;
  }

  async releaseDisbursement(
    user: AuthUser,
    id: string,
    did: string,
    dto: ReleaseDisbursementDto,
  ): Promise<C.FinancingFile> {
    return this.mutate(user, id, async (em, file) => {
      const t = await this.tranche(em, file, did);
      this.assertDate(dto.releasedOn, 'Date de déblocage');
      if (dto.releasedOn > todayLocal()) {
        throw new BadRequestException('La date de déblocage ne peut pas être dans le futur.');
      }
      if (!canReleaseAtStep(file.step) || file.decision === FinancingDecision.REFUSE) {
        throw new ConflictException('Une tranche se débloque à partir de l’étape « Décaissement ».');
      }
      if (t.status !== DisbursementStatus.PREVUE) {
        throw new ConflictException('Seule une tranche prévue peut être débloquée.');
      }
      if (dto.visitId) {
        const visit = isUuid(dto.visitId)
          ? await em.query(`SELECT 1 FROM farm_visits WHERE id = $1 AND farm_id = $2`, [dto.visitId, file.farmId])
          : [];
        if (visit.length === 0) {
          throw new BadRequestException('La visite indiquée n’est pas une visite de cette ferme.');
        }
      }
      t.status = DisbursementStatus.DEBLOQUEE;
      t.releasedOn = dto.releasedOn;
      t.visitId = dto.visitId ?? null;
      if (dto.note !== undefined) t.note = dto.note ?? null;
      await em.getRepository(FinancingDisbursement).save(t);
    });
  }

  async cancelDisbursement(user: AuthUser, id: string, did: string): Promise<C.FinancingFile> {
    return this.mutate(user, id, async (em, file) => {
      const t = await this.tranche(em, file, did);
      if (t.status !== DisbursementStatus.PREVUE) {
        throw new ConflictException('Seule une tranche prévue peut être annulée.');
      }
      t.status = DisbursementStatus.ANNULEE;
      await em.getRepository(FinancingDisbursement).save(t);
    });
  }

  // ── Schedule and repayments ──────────────────────────────────────────────

  async generateSchedule(user: AuthUser, id: string, dto: GenerateScheduleDto): Promise<C.FinancingFile> {
    return this.mutate(user, id, async (em, file) => {
      this.assertDate(dto.firstDueDate, 'Première échéance');
      if (file.decision === FinancingDecision.REFUSE || file.step === FinancingStep.CLOTURE) {
        throw new ConflictException('Le dossier est clos : aucun échéancier ne peut être généré.');
      }
      const terms = {
        grantedFcfa: file.grantedFcfa ?? undefined,
        ratePct: file.ratePct ?? undefined,
        durationMonths: file.durationMonths ?? undefined,
        graceMonths: file.graceMonths ?? 0,
        periodicity: file.periodicity ?? undefined,
      };
      const problem = scheduleTermsProblem(terms);
      if (problem) throw new ConflictException(problem);
      const live: { n: string }[] = await em.query(
        `SELECT COUNT(*) AS n FROM financing_repayments WHERE file_id = $1 AND cancelled_at IS NULL`,
        [file.id],
      );
      if (Number(live[0].n) > 0) {
        throw new ConflictException(
          'Des remboursements sont enregistrés : l’échéancier ne peut plus être régénéré (annulez-les d’abord, avec un motif).',
        );
      }
      const rows = generateSchedule({ ...terms, firstDueDate: dto.firstDueDate } as ScheduleInput);
      const repo = em.getRepository(FinancingInstalment);
      await repo.delete({ fileId: file.id });
      await repo.save(rows.map((r) => repo.create({ fileId: file.id, ...r })));
    });
  }

  async addRepayment(user: AuthUser, id: string, dto: RepaymentDto): Promise<C.FinancingFile> {
    return this.mutate(user, id, async (em, file) => {
      this.assertDate(dto.paidOn, 'Date de paiement');
      if (dto.paidOn > todayLocal()) {
        throw new BadRequestException('La date de paiement ne peut pas être dans le futur.');
      }
      if (file.step !== FinancingStep.DECAISSEMENT && file.step !== FinancingStep.SUIVI) {
        throw new ConflictException('Un remboursement s’enregistre aux étapes « Décaissement » et « Suivi ».');
      }
      const repo = em.getRepository(FinancingRepayment);
      await repo.save(
        repo.create({
          fileId: file.id,
          paidOn: dto.paidOn,
          amountFcfa: dto.amountFcfa,
          method: dto.method,
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          recordedById: user.id,
        }),
      );
    });
  }

  async cancelRepayment(user: AuthUser, id: string, rid: string, reason: string): Promise<C.FinancingFile> {
    return this.mutate(user, id, async (em, file) => {
      const repo = em.getRepository(FinancingRepayment);
      const r = isUuid(rid) ? await repo.findOne({ where: { id: rid, fileId: file.id } }) : null;
      if (!r) throw new NotFoundException('Remboursement introuvable.');
      if (r.cancelledAt) throw new ConflictException('Ce remboursement est déjà annulé.');
      r.cancelledAt = new Date();
      r.cancelReason = reason;
      r.cancelledById = user.id;
      await repo.save(r);
    });
  }

  // ── Documents ────────────────────────────────────────────────────────────

  /** A farm of a file (for the callers that add their own perimeter checks). */
  async farmOfFile(id: string): Promise<{ farmId: string; reference: string }> {
    const file = await this.loadFile(id);
    return { farmId: file.farmId, reference: file.reference };
  }

  /**
   * Files a document the server generated (not an upload) under the
   * requirement `requirementCode`. Idempotent: the same label on the same
   * requirement (not rejected) answers the file as it is.
   */
  async attachGenerated(
    user: AuthUser,
    id: string,
    doc: { requirementCode: string; label: string; originalName: string; buffer: Buffer },
  ): Promise<C.FinancingFile> {
    const file = await this.loadFile(id);
    await this.ensureRequirements(file.programId);
    const requirement = await this.dataSource
      .getRepository(FinancingRequirement)
      .findOne({ where: { programId: file.programId, code: doc.requirementCode } });
    if (!requirement || !requirement.active) {
      throw new ConflictException(
        'L’exigence « États financiers ou état de trésorerie » est désactivée ou absente de la liste de pièces.',
      );
    }
    const same = await this.dataSource.getRepository(FinancingDocument).findOne({
      where: { fileId: file.id, requirementId: requirement.id, label: doc.label },
    });
    if (same && same.status !== FinancingDocumentStatus.REJETE) return this.detailOf(file, user);
    await this.fileDocument(
      user,
      file,
      { requirementId: requirement.id, label: doc.label },
      { originalname: doc.originalName, mimetype: 'application/pdf', size: doc.buffer.length, buffer: doc.buffer },
      DocumentSource.FERMIA,
    );
    return this.detailOf(file, user);
  }

  /** Bank-side upload (source BCEG). */
  async uploadDocument(
    user: AuthUser,
    id: string,
    dto: UploadDocumentDto,
    upload: UploadedImageFile | undefined,
  ): Promise<C.FinancingFile> {
    const file = await this.loadFile(id);
    await this.fileDocument(user, file, dto, upload, DocumentSource.BCEG);
    return this.detailOf(file, user);
  }

  /** Format family of a stored mime. */
  private formatOf(mime: string): 'PDF' | 'IMAGE' {
    return mime === 'application/pdf' ? 'PDF' : 'IMAGE';
  }

  /** Throws a French 400 when the requirement does not accept this mime. */
  private assertFormat(requirement: Pick<FinancingRequirement, 'formats' | 'label'>, mime: string): void {
    const formats = requirement.formats ?? [];
    if (formats.length > 0 && !formats.includes(this.formatOf(mime))) {
      const wanted = formats.map((f) => (f === 'PDF' ? 'un PDF' : 'une image (JPEG, PNG ou WebP)')).join(' ou ');
      throw new BadRequestException(`Format non accepté pour « ${requirement.label} » : déposez ${wanted}.`);
    }
  }

  /**
   * Files a document on `file` (the caller has checked who may). Format and
   * validity come from the requirement: `expiresOn` = issue date (or today)
   * + validityMonths. Answers the stored document, or null when the same
   * bytes were already filed under the same requirement (idempotent). A
   * farm-side filing tells the bank (FINANCING_DOCUMENT_FILED).
   */
  async fileDocument(
    user: AuthUser,
    file: FinancingFile,
    dto: { requirementId?: string | null; label?: string; issuedOn?: string | null },
    upload: UploadedImageFile | undefined,
    source: DocumentSource,
  ): Promise<FinancingDocument | null> {
    const valid = validateUpload(upload);
    let requirement: FinancingRequirement | null = null;
    if (dto.requirementId) {
      requirement = isUuid(dto.requirementId)
        ? await this.dataSource
            .getRepository(FinancingRequirement)
            .findOne({ where: { id: dto.requirementId, programId: file.programId } })
        : null;
      if (!requirement) throw new BadRequestException('Exigence inconnue.');
      if (!requirement.active) throw new BadRequestException('Cette exigence est désactivée.');
      this.assertFormat(requirement, valid.mime);
    }
    const today = todayLocal();
    if (dto.issuedOn) {
      this.assertDate(dto.issuedOn, 'Date d’émission');
      if (dto.issuedOn > today) throw new BadRequestException('La date d’émission ne peut pas être dans le futur.');
    }
    const expiresOn =
      requirement?.validityMonths ? addMonths(dto.issuedOn ?? today, requirement.validityMonths) : null;
    const repo = this.dataSource.getRepository(FinancingDocument);
    const same = await repo.findOne({
      where: { fileId: file.id, sha256: valid.sha256, requirementId: requirement?.id ?? undefined },
    });
    if (same && same.status !== FinancingDocumentStatus.REJETE && (same.requirementId ?? null) === (requirement?.id ?? null)) {
      return null;
    }
    const dir = financingDir(file.farmId);
    const storedName = await storeFile(dir, valid);
    let saved: FinancingDocument;
    try {
      saved = await repo.save(
        repo.create({
          fileId: file.id,
          requirementId: requirement?.id ?? null,
          label: (dto.label?.trim() || requirement?.label || valid.originalName).slice(0, 300),
          originalName: valid.originalName,
          storedName,
          mime: valid.mime,
          sizeBytes: valid.buffer.length,
          sha256: valid.sha256,
          source,
          issuedOn: dto.issuedOn ?? null,
          expiresOn,
          uploadedById: user.id,
        }),
      );
      await this.dataSource.getRepository(FinancingFile).update(file.id, { updatedAt: new Date() });
    } catch (err) {
      await discardFile(dir, storedName);
      throw err;
    }
    if (source === DocumentSource.EXPLOITANT || source === DocumentSource.AGENT) {
      koukouBus.emit(KOUKOU_EVENTS.FINANCING_DOCUMENT_FILED, {
        farmId: file.farmId,
        fileId: file.id,
        documentId: saved.id,
        reference: file.reference,
        label: saved.label,
      });
    }
    return saved;
  }

  async documentFile(
    id: string,
    docId: string,
  ): Promise<{ buffer: Buffer; mime: string; fileName: string }> {
    const file = await this.loadFile(id);
    const doc = isUuid(docId)
      ? await this.dataSource.getRepository(FinancingDocument).findOne({ where: { id: docId, fileId: file.id } })
      : null;
    if (!doc) throw new NotFoundException('Document introuvable.');
    return {
      buffer: await readStored(financingDir(file.farmId), doc.storedName),
      mime: doc.mime,
      fileName: doc.originalName,
    };
  }

  async reviewDocument(
    user: AuthUser,
    id: string,
    docId: string,
    dto: ReviewDocumentDto,
  ): Promise<C.FinancingFile> {
    let reviewed: { farmId: string; reference: string; doc: FinancingDocument } | null = null;
    const result = await this.mutate(user, id, async (em, file) => {
      const repo = em.getRepository(FinancingDocument);
      const doc = isUuid(docId) ? await repo.findOne({ where: { id: docId, fileId: file.id } }) : null;
      if (!doc) throw new NotFoundException('Document introuvable.');
      if (dto.status === 'REJETE' && !dto.reason?.trim()) {
        throw new BadRequestException('Le motif du rejet est obligatoire.');
      }
      doc.status = dto.status as FinancingDocumentStatus;
      doc.rejectReason = dto.status === 'REJETE' ? dto.reason!.trim() : null;
      doc.reviewedById = user.id;
      doc.reviewedAt = new Date();
      await repo.save(doc);
      reviewed = { farmId: file.farmId, reference: file.reference, doc };
    });
    // The farm hears the verdict on a document it supplied (after the commit).
    const r = reviewed as { farmId: string; reference: string; doc: FinancingDocument } | null;
    if (r && (r.doc.source === DocumentSource.EXPLOITANT || r.doc.source === DocumentSource.AGENT)) {
      koukouBus.emit(KOUKOU_EVENTS.FINANCING_DOCUMENT_REVIEWED, {
        farmId: r.farmId,
        fileId: id,
        documentId: r.doc.id,
        reference: r.reference,
        label: r.doc.label,
        status: r.doc.status === FinancingDocumentStatus.REJETE ? 'REJETE' : 'VALIDE',
        reason: r.doc.rejectReason,
      });
    }
    return result;
  }

  // ── Checklist ────────────────────────────────────────────────────────────

  async listRequirements(): Promise<C.FinancingRequirement[]> {
    const programId = await this.programId();
    return (await this.view.requirements(programId)).map((r) => this.view.requirementView(r));
  }

  /** Farm picker of the « new file » form: every farm of the programme, identification only. */
  async pickFarms(q?: string): Promise<Array<{ id: string; code: string; name: string; provinceName: string | null; exploitantName: string | null }>> {
    const programId = await this.programId();
    const term = q?.trim();
    const limited = await this.view.limitedFarmIds(programId);
    const rows: Array<{ id: string; code: string | null; name: string; provinceName: string | null; exploitantName: string | null }> =
      await this.dataSource.query(
        `SELECT f.id, f.code, f.name, p.name AS "provinceName", f.exploitant_name AS "exploitantName"
           FROM farms f LEFT JOIN provinces p ON p.id = f.province_id
          WHERE f.program_id = $1
            AND ($2::text IS NULL OR f.name ILIKE $3 OR f.code ILIKE $3 OR f.exploitant_name ILIKE $3)
            AND ($4::uuid[] IS NULL OR f.id = ANY($4::uuid[]))
          ORDER BY f.code NULLS LAST, f.name LIMIT 20`,
        [programId, term ?? null, `%${term ?? ''}%`, limited],
      );
    return rows.map((r) => ({ ...r, code: r.code ?? '' }));
  }

  async createRequirement(dto: CreateRequirementDto): Promise<C.FinancingRequirement> {
    const programId = await this.programId();
    const repo = this.dataSource.getRepository(FinancingRequirement);
    const base =
      dto.label
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'EXIGENCE';
    const codes = new Set((await repo.find({ where: { programId } })).map((r) => r.code));
    let code = `${dto.step}_${base}`;
    for (let n = 2; codes.has(code); n++) code = `${dto.step}_${base}_${n}`;
    const max = (await repo.find({ where: { programId, step: dto.step } })).reduce((m, r) => Math.max(m, r.sort), 0);
    const saved = await repo.save(
      repo.create({
        programId,
        code,
        label: dto.label.trim(),
        step: dto.step,
        required: dto.required ?? false,
        legalBasis: dto.legalBasis ?? null,
        help: dto.help ?? null,
        active: dto.active ?? true,
        providedBy: dto.providedBy ?? DocumentProvider.BCEG,
        formats: [...new Set(dto.formats ?? [])],
        validityMonths: dto.validityMonths ?? null,
        sort: dto.sort ?? max + 10,
      }),
    );
    return this.view.requirementView(saved);
  }

  async updateRequirement(id: string, dto: UpdateRequirementDto): Promise<C.FinancingRequirement> {
    const programId = await this.programId();
    const repo = this.dataSource.getRepository(FinancingRequirement);
    const r = isUuid(id) ? await repo.findOne({ where: { id, programId } }) : null;
    if (!r) throw new NotFoundException('Exigence introuvable.');
    if (dto.label !== undefined) r.label = dto.label.trim();
    if (dto.step !== undefined) r.step = dto.step;
    if (dto.required !== undefined) r.required = dto.required;
    if (dto.legalBasis !== undefined) r.legalBasis = dto.legalBasis ?? null;
    if (dto.help !== undefined) r.help = dto.help ?? null;
    if (dto.active !== undefined) r.active = dto.active;
    if (dto.sort !== undefined) r.sort = dto.sort;
    if (dto.providedBy !== undefined) r.providedBy = dto.providedBy;
    if (dto.formats !== undefined) r.formats = [...new Set(dto.formats)];
    if (dto.validityMonths !== undefined) r.validityMonths = dto.validityMonths ?? null;
    return this.view.requirementView(await repo.save(r));
  }

  private async requirementById(id: string): Promise<FinancingRequirement> {
    const programId = await this.programId();
    const r = isUuid(id)
      ? await this.dataSource.getRepository(FinancingRequirement).findOne({ where: { id, programId } })
      : null;
    if (!r) throw new NotFoundException('Exigence introuvable.');
    return r;
  }

  /** Attaches (or replaces) the blank form of a requirement; same checks as any document. */
  async setRequirementTemplate(id: string, upload: UploadedImageFile | undefined): Promise<C.FinancingRequirement> {
    const r = await this.requirementById(id);
    const valid = validateUpload(upload);
    const dir = templatesDir();
    const storedName = await storeFile(dir, valid);
    const previous = r.templateStoredName;
    try {
      r.templateOriginalName = valid.originalName;
      r.templateStoredName = storedName;
      r.templateMime = valid.mime;
      await this.dataSource.getRepository(FinancingRequirement).save(r);
    } catch (err) {
      await discardFile(dir, storedName);
      throw err;
    }
    if (previous) await discardFile(dir, previous);
    return this.view.requirementView(r);
  }

  async deleteRequirementTemplate(id: string): Promise<C.FinancingRequirement> {
    const r = await this.requirementById(id);
    const previous = r.templateStoredName;
    r.templateOriginalName = null;
    r.templateStoredName = null;
    r.templateMime = null;
    await this.dataSource.getRepository(FinancingRequirement).save(r);
    if (previous) await discardFile(templatesDir(), previous);
    return this.view.requirementView(r);
  }

  /** The blank form of a requirement (bank side, or the farm side for an EXPLOITANT item). */
  async requirementTemplateFile(
    id: string,
    audience: 'BANK' | 'FARM',
  ): Promise<{ buffer: Buffer; mime: string; fileName: string }> {
    const r = await this.requirementById(id);
    if (!r.templateStoredName || (audience === 'FARM' && (!r.active || r.providedBy !== DocumentProvider.EXPLOITANT))) {
      throw new NotFoundException('Aucun formulaire joint à cette pièce.');
    }
    return {
      buffer: await readStored(templatesDir(), r.templateStoredName),
      mime: r.templateMime ?? 'application/octet-stream',
      fileName: r.templateOriginalName ?? 'formulaire',
    };
  }
}
