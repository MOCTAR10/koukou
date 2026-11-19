import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { isUuid } from '../../common/context/request-context.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  ConsentMethod,
  ConsentRecordStatus,
  DocumentProvider,
  DocumentSource,
  FinancingDocumentStatus,
  FinancingStep,
} from '../../common/enums/financing.enum.js';
import { FarmStaffRole } from '../../common/enums/farm-staff-role.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { isRealIsoDate, todayLocal } from '../../common/utils/date.utils.js';
import { KOUKOU_EVENTS, koukouBus } from '../../common/utils/event-bus.js';
import { userNames } from '../../common/utils/user-names.js';
import { grants } from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import type { UploadedImageFile } from '../farms/farms.service.js';
import { ProgrammeService } from '../programme/programme.service.js';
import { CONSENT_CLAUSES } from './data/legal.js';
import type {
  CreateTemplateDto,
  FarmerConsentDto,
  PaperConsentDto,
} from './dto/financing.dto.js';
import { ConsentTemplate } from './entities/consent-template.entity.js';
import { FarmConsent } from './entities/farm-consent.entity.js';
import { FinancingFile } from './entities/financing-file.entity.js';
import type * as C from './financing.contract.js';
import {
  discardFile,
  financingDir,
  parseJsonStrings,
  readStored,
  storeFile,
  templatesDir,
  validateUpload,
} from './financing-storage.js';
import { FinancingViewService, blockersOf, isExpired, lineState } from './financing-view.service.js';
import { FinancingService } from './financing.service.js';
import { FinancingDocument } from './entities/financing-document.entity.js';
import { FinancingRequirement } from './entities/financing-requirement.entity.js';
import { userNames as namesOf } from '../../common/utils/user-names.js';

/** Institution the farmer's data is shared with. */
export const FINANCER_NAME = 'BCEG';

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';

/**
 * Consent of the farmers to share their data with the financer (loi
 * n° 001/2011 modifiée par la loi n° 025/2023, art. 6, 72, 73, 100): the
 * bank's immutable templates, the consents (proof kept: template id, version
 * and hash, time, user, IP and user agent) and their withdrawal.
 */
@Injectable()
export class ConsentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly programme: ProgrammeService,
    private readonly scope: ScopeResolver,
    private readonly view: FinancingViewService,
    private readonly files: FinancingService,
  ) {}

  // ── Templates ────────────────────────────────────────────────────────────

  private templateView(t: ConsentTemplate, names: Map<string, string>, count: number): C.ConsentTemplate {
    return {
      id: t.id,
      version: t.version,
      title: t.title,
      purpose: t.purpose,
      dataCategories: t.dataCategories,
      retention: t.retention,
      fileName: t.originalName,
      mime: t.mime,
      sizeBytes: t.sizeBytes,
      sha256: t.sha256,
      confirmedClauses: t.confirmedClauses,
      active: t.active,
      createdByName: t.createdById ? (names.get(t.createdById) ?? null) : null,
      createdAt: t.createdAt.toISOString(),
      consentCount: count,
    };
  }

  async templatesView(): Promise<C.ConsentTemplatesView> {
    const program = await this.programme.current();
    const templates = await this.dataSource
      .getRepository(ConsentTemplate)
      .find({ where: { programId: program.id }, order: { version: 'DESC' } });
    const counts: { template_id: string; n: string }[] = await this.dataSource.query(
      `SELECT template_id, COUNT(*) AS n FROM farm_consents WHERE program_id = $1 GROUP BY template_id`,
      [program.id],
    );
    const byTemplate = new Map(counts.map((c) => [c.template_id, Number(c.n)]));
    const names = await userNames(this.dataSource, templates.map((t) => t.createdById));
    return {
      clauses: CONSENT_CLAUSES.map((c) => ({ ...c })),
      templates: templates.map((t) => this.templateView(t, names, byTemplate.get(t.id) ?? 0)),
      perimeter: await this.scope.financedPerimeter(program.id),
    };
  }

  /**
   * Files a new template (immutable). The caller confirms every mandatory
   * clause of the fixed list, each one present in the uploaded document; the
   * previous template is deactivated and the version is max + 1.
   */
  async createTemplate(
    user: AuthUser,
    dto: CreateTemplateDto,
    upload: UploadedImageFile | undefined,
  ): Promise<C.ConsentTemplate> {
    const dataCategories = parseJsonStrings(dto.dataCategories, 'dataCategories');
    const confirmed = parseJsonStrings(dto.confirmedClauses, 'confirmedClauses');
    if (dataCategories.length === 0) {
      throw new BadRequestException('Indiquez au moins une catégorie de données.');
    }
    const known = new Set(CONSENT_CLAUSES.map((c) => c.code));
    const unknown = confirmed.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      throw new BadRequestException(`Mention inconnue : ${unknown.join(', ')}.`);
    }
    const missing = CONSENT_CLAUSES.filter((c) => !confirmed.includes(c.code));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Le modèle doit contenir toutes les mentions obligatoires (loi n° 001/2011 modifiée) ; non confirmée(s) : ${missing
          .map((c) => `${c.label} (${c.legalBasis})`)
          .join(' ; ')}.`,
      );
    }
    const valid = validateUpload(upload);
    const program = await this.programme.current();
    const dir = templatesDir();
    const storedName = await storeFile(dir, valid);
    try {
      const saved = await this.dataSource.transaction(async (em) => {
        await em.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`consent_templates:${program.id}`]);
        const repo = em.getRepository(ConsentTemplate);
        const rows: { v: number | null }[] = await em.query(
          `SELECT MAX(version) AS v FROM consent_templates WHERE program_id = $1`,
          [program.id],
        );
        await repo.update({ programId: program.id, active: true }, { active: false });
        return repo.save(
          repo.create({
            programId: program.id,
            version: Number(rows[0].v ?? 0) + 1,
            title: dto.title.trim(),
            purpose: dto.purpose.trim(),
            dataCategories,
            retention: dto.retention.trim(),
            originalName: valid.originalName,
            storedName,
            mime: valid.mime,
            sizeBytes: valid.buffer.length,
            sha256: valid.sha256,
            confirmedClauses: CONSENT_CLAUSES.map((c) => c.code),
            active: true,
            createdById: user.id,
          }),
        );
      });
      const names = await userNames(this.dataSource, [saved.createdById]);
      return this.templateView(saved, names, 0);
    } catch (err) {
      await discardFile(dir, storedName);
      throw err;
    }
  }

  async templateFile(id: string): Promise<{ buffer: Buffer; mime: string; fileName: string }> {
    const program = await this.programme.current();
    const t = isUuid(id)
      ? await this.dataSource.getRepository(ConsentTemplate).findOne({ where: { id, programId: program.id } })
      : null;
    if (!t) throw new NotFoundException('Modèle de consentement introuvable.');
    return { buffer: await readStored(templatesDir(), t.storedName), mime: t.mime, fileName: t.originalName };
  }

  private async activeTemplate(programId: string, em?: EntityManager): Promise<ConsentTemplate | null> {
    return (em ?? this.dataSource.manager)
      .getRepository(ConsentTemplate)
      .findOne({ where: { programId, active: true } });
  }

  // ── Consents (programme side) ────────────────────────────────────────────

  private async farmOfProgramme(farmId: string, programId: string): Promise<Farm> {
    const farm = isUuid(farmId)
      ? await this.dataSource.getRepository(Farm).findOne({ where: { id: farmId, programId } })
      : null;
    if (!farm) throw new NotFoundException('Ferme introuvable.');
    // A FARMS / PROVINCES caller only works on the farms of its scope.
    await this.view.assertFarmAllowed(farm.id);
    return farm;
  }

  private consentView(
    c: FarmConsent,
    farm: { id: string; code: string | null; name: string },
    names: Map<string, string>,
  ): C.FarmConsent {
    return {
      id: c.id,
      farmId: farm.id,
      farmCode: farm.code ?? '',
      farmName: farm.name,
      status: c.status === ConsentRecordStatus.ACTIVE ? 'ACTIF' : 'RETIRE',
      templateId: c.templateId,
      templateVersion: c.templateVersion,
      method: c.method,
      signerName: c.signerName,
      signerQuality: c.signerQuality,
      grantedAt: c.grantedAt.toISOString(),
      recordedByName: c.recordedById ? (names.get(c.recordedById) ?? null) : null,
      hasProof: !!c.proofStoredName,
      withdrawnAt: c.withdrawnAt ? c.withdrawnAt.toISOString() : null,
      withdrawReason: c.withdrawReason,
    };
  }

  private noConsent(farm: { id: string; code: string | null; name: string }): C.FarmConsent {
    return {
      id: `none:${farm.id}`,
      farmId: farm.id,
      farmCode: farm.code ?? '',
      farmName: farm.name,
      status: 'AUCUN',
      templateId: null,
      templateVersion: null,
      method: null,
      signerName: null,
      signerQuality: null,
      grantedAt: null,
      recordedByName: null,
      hasProof: false,
      withdrawnAt: null,
      withdrawReason: null,
    };
  }

  /** Latest consent row of each farm of `farmIds` (or of the whole programme). */
  private async latestRows(programId: string, farmIds?: readonly string[]): Promise<Map<string, FarmConsent>> {
    const rows: FarmConsent[] = await this.dataSource.query(
      `SELECT DISTINCT ON (farm_id) * FROM farm_consents
        WHERE program_id = $1 ${farmIds ? 'AND farm_id = ANY($2::uuid[])' : ''}
        ORDER BY farm_id, created_at DESC`,
      farmIds ? [programId, farmIds] : [programId],
    );
    // Raw rows use snake_case: map the few fields the views need.
    const out = new Map<string, FarmConsent>();
    for (const r of rows as unknown as Array<Record<string, unknown>>) {
      out.set(r.farm_id as string, {
        id: r.id,
        programId: r.program_id,
        farmId: r.farm_id,
        status: r.status,
        templateId: r.template_id,
        templateVersion: r.template_version,
        templateSha256: r.template_sha256,
        method: r.method,
        signerName: r.signer_name,
        signerQuality: r.signer_quality,
        grantedAt: new Date(r.granted_at as string),
        recordedById: r.recorded_by_id,
        ip: r.ip,
        userAgent: r.user_agent,
        proofOriginalName: r.proof_original_name,
        proofStoredName: r.proof_stored_name,
        proofMime: r.proof_mime,
        proofSha256: r.proof_sha256,
        withdrawnAt: r.withdrawn_at ? new Date(r.withdrawn_at as string) : null,
        withdrawnById: r.withdrawn_by_id,
        withdrawnBySide: r.withdrawn_by_side,
        withdrawReason: r.withdraw_reason,
        createdAt: new Date(r.created_at as string),
      } as FarmConsent);
    }
    return out;
  }

  /** Coverage of the consent over the programme's farms. */
  async coverage(programId: string): Promise<C.ConsentCoverage> {
    const rows: { farms: string; active: string; withdrawn: string }[] = await this.dataSource.query(
      `SELECT (SELECT COUNT(*) FROM farms WHERE program_id = $1) AS farms,
              COUNT(*) FILTER (WHERE c.status = 'ACTIVE') AS active,
              COUNT(*) FILTER (WHERE c.status = 'WITHDRAWN') AS withdrawn
         FROM (SELECT DISTINCT ON (farm_id) farm_id, status FROM farm_consents
                WHERE program_id = $1 ORDER BY farm_id, created_at DESC) c`,
      [programId],
    );
    const farms = Number(rows[0].farms);
    const active = Number(rows[0].active);
    const withdrawn = Number(rows[0].withdrawn);
    return { farms, active, withdrawn, none: Math.max(0, farms - active - withdrawn) };
  }

  async consentsView(query: { status?: C.ConsentStatus; q?: string }): Promise<C.ConsentsView> {
    const program = await this.programme.current();
    const limited = await this.view.limitedFarmIds(program.id);
    const farms: { id: string; code: string | null; name: string }[] = await this.dataSource.query(
      `SELECT id, code, name FROM farms WHERE program_id = $1 AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))
        ORDER BY code NULLS LAST, name`,
      [program.id, limited],
    );
    const latest = await this.latestRows(program.id);
    const names = await userNames(this.dataSource, [...latest.values()].map((c) => c.recordedById));
    const q = query.q?.trim().toLowerCase();
    let items = farms.map((f) => {
      const row = latest.get(f.id);
      return row ? this.consentView(row, f, names) : this.noConsent(f);
    });
    if (query.status) items = items.filter((i) => i.status === query.status);
    if (q) {
      items = items.filter(
        (i) => i.farmName.toLowerCase().includes(q) || i.farmCode.toLowerCase().includes(q),
      );
    }
    return { coverage: await this.coverage(program.id), items };
  }

  /** Current consent of one farm (null when none was ever recorded). */
  async consentOfFarm(farmId: string, programId: string): Promise<C.FarmConsent | null> {
    const farm = await this.farmOfProgramme(farmId, programId);
    const row = (await this.latestRows(programId, [farmId])).get(farmId);
    if (!row) return null;
    return this.consentView(row, farm, await userNames(this.dataSource, [row.recordedById]));
  }

  /** The bank records a paper consent (the signed scan is mandatory). */
  async recordPaper(
    user: AuthUser,
    farmId: string,
    dto: PaperConsentDto,
    upload: UploadedImageFile | undefined,
  ): Promise<C.FarmConsent> {
    const program = await this.programme.current();
    const farm = await this.farmOfProgramme(farmId, program.id);
    if (!isRealIsoDate(dto.grantedOn)) {
      throw new BadRequestException('Date de signature invalide (AAAA-MM-JJ).');
    }
    if (dto.grantedOn > todayLocal()) {
      throw new BadRequestException('La date de signature ne peut pas être dans le futur.');
    }
    const valid = validateUpload(upload);
    const template = await this.activeTemplate(program.id);
    if (!template) {
      throw new ConflictException('Aucun modèle de consentement n’est déposé : déposez-le d’abord.');
    }
    const dir = financingDir(farm.id);
    const storedName = await storeFile(dir, valid);
    try {
      await this.dataSource.transaction(async (em) => {
        await this.assertNoActive(em, farm.id);
        const repo = em.getRepository(FarmConsent);
        await repo.save(
          repo.create({
            programId: program.id,
            farmId: farm.id,
            status: ConsentRecordStatus.ACTIVE,
            templateId: template.id,
            templateVersion: template.version,
            templateSha256: template.sha256,
            method: ConsentMethod.PAPIER,
            signerName: dto.signerName.trim(),
            signerQuality: dto.signerQuality?.trim() || null,
            // Noon in Libreville (UTC+1) of the signature day.
            grantedAt: new Date(`${dto.grantedOn}T12:00:00+01:00`),
            recordedById: user.id,
            proofOriginalName: valid.originalName,
            proofStoredName: storedName,
            proofMime: valid.mime,
            proofSha256: valid.sha256,
          }),
        );
      });
    } catch (err) {
      await discardFile(dir, storedName);
      if (isUniqueViolation(err)) throw new ConflictException('Un consentement est déjà actif pour cette ferme.');
      throw err;
    }
    return (await this.consentOfFarm(farm.id, program.id))!;
  }

  private async assertNoActive(em: EntityManager, farmId: string): Promise<void> {
    const active = await em
      .getRepository(FarmConsent)
      .count({ where: { farmId, status: ConsentRecordStatus.ACTIVE } });
    if (active > 0) {
      throw new ConflictException('Un consentement est déjà actif pour cette ferme : retirez-le avant d’en enregistrer un autre.');
    }
  }

  /** Scan of the latest paper consent of the farm. */
  async proofFile(farmId: string): Promise<{ buffer: Buffer; mime: string; fileName: string }> {
    const program = await this.programme.current();
    const farm = await this.farmOfProgramme(farmId, program.id);
    const row = await this.dataSource.getRepository(FarmConsent).findOne({
      where: { farmId: farm.id },
      order: { createdAt: 'DESC' },
    });
    if (!row?.proofStoredName) throw new NotFoundException('Aucune pièce signée pour cette ferme.');
    return {
      buffer: await readStored(financingDir(farm.id), row.proofStoredName),
      mime: row.proofMime ?? 'application/octet-stream',
      fileName: row.proofOriginalName ?? 'consentement',
    };
  }

  private async withdrawRow(
    farmId: string,
    programId: string,
    by: 'FARMER' | 'BANK',
    userId: string,
    reason: string | null,
  ): Promise<void> {
    let consentId = '';
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(FarmConsent);
      const row = await repo.findOne({
        where: { farmId, programId, status: ConsentRecordStatus.ACTIVE },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new ConflictException('Aucun consentement actif à retirer pour cette ferme.');
      row.status = ConsentRecordStatus.WITHDRAWN;
      row.withdrawnAt = new Date();
      row.withdrawnById = userId;
      row.withdrawnBySide = by;
      row.withdrawReason = reason;
      await repo.save(row);
      consentId = row.id;
    });
    // Effective at once, never retroactive: the notification follows the commit.
    koukouBus.emit(KOUKOU_EVENTS.CONSENT_WITHDRAWN, { farmId, consentId, by });
  }

  /** The bank records a withdrawal asked by the farmer. */
  async withdrawByBank(user: AuthUser, farmId: string, reason: string): Promise<C.FarmConsent> {
    const program = await this.programme.current();
    await this.farmOfProgramme(farmId, program.id);
    await this.withdrawRow(farmId, program.id, 'BANK', user.id, reason);
    return (await this.consentOfFarm(farmId, program.id))!;
  }

  // ── Farmer side ──────────────────────────────────────────────────────────

  /**
   * Who is on the farmer side of a farm: its owner or manager (`canConsent`
   * and `canFile`), or a technical agent acting for him (an institution whose
   * matrix gives the delegated-entry right, TECHNIQUE:CREER, with the farm in
   * its scope: `canFile`, source AGENT), or any other member of the team
   * (reads). The platform admin only reads.
   */
  async farmerSide(
    user: AuthUser,
    farmId: string,
  ): Promise<{ farm: Farm; canConsent: boolean; canFile: boolean; source: DocumentSource | null }> {
    const farm = isUuid(farmId) ? await this.dataSource.getRepository(Farm).findOne({ where: { id: farmId } }) : null;
    if (!farm) throw new NotFoundException('Ferme introuvable.');
    if (user.role === UserRole.PLATFORM_ADMIN) return { farm, canConsent: false, canFile: false, source: null };
    if (user.role === UserRole.PROPRIETAIRE && farm.ownerId !== null && farm.ownerId === user.id) {
      return { farm, canConsent: true, canFile: true, source: DocumentSource.EXPLOITANT };
    }
    if (user.role === UserRole.ELEVEUR) {
      const link = await this.dataSource
        .getRepository(FarmEmployee)
        .findOne({ where: { farmId, userId: user.id } });
      if (link && link.active !== false) {
        const manager = link.role === FarmStaffRole.ADMIN;
        return { farm, canConsent: manager, canFile: manager, source: manager ? DocumentSource.EXPLOITANT : null };
      }
    }
    if (user.role === UserRole.INSTITUTION) {
      const access = await this.scope.requireAccess(user);
      this.scope.assertFarm(access, farm);
      if (grants(access.matrix, 'TECHNIQUE', 'CREER')) {
        return { farm, canConsent: false, canFile: true, source: DocumentSource.AGENT };
      }
    }
    throw new ForbiddenException('Accès refusé : cette ferme ne vous appartient pas ou vous n’y êtes pas rattaché.');
  }

  /** The farmer's list of one file: EXPLOITANT items only, with the farm-side documents only. */
  private farmerChecklist(
    file: FinancingFile,
    requirements: readonly FinancingRequirement[],
    documents: readonly FinancingDocument[],
    ctx: { today: string; consentActive: boolean },
    names: Map<string, string>,
    canFile: boolean,
  ) {
    const farmSide = (d: FinancingDocument) => d.source !== DocumentSource.BCEG;
    return requirements
      .filter((r) => r.providedBy === DocumentProvider.EXPLOITANT && (r.active || documents.some((d) => d.requirementId === r.id)))
      .map((r) => {
        const docs = documents.filter((d) => d.requirementId === r.id);
        const state = lineState(r, docs, ctx);
        const rejected = [...docs].reverse().find((d) => d.status === FinancingDocumentStatus.REJETE);
        const validUntil = docs
          .filter((d) => d.status !== FinancingDocumentStatus.REJETE && !isExpired(d, ctx.today))
          .map((d) => d.expiresOn)
          .filter((d): d is string => d !== null)
          .sort()
          .pop();
        return {
          requirementId: r.id,
          label: r.label,
          step: r.step as C.FinancingStep,
          required: r.required,
          help: r.help,
          formats: r.formats ?? [],
          templateFileName: r.templateOriginalName,
          state: state as C.FarmerChecklistLine['state'],
          rejectReason: state === 'REJETEE' ? (rejected?.rejectReason ?? null) : null,
          expiresOn: validUntil ?? null,
          documents: docs.filter(farmSide).map((d) => ({
            id: d.id,
            fileName: d.originalName,
            sizeBytes: d.sizeBytes,
            status: d.status,
            uploadedAt: d.uploadedAt.toISOString(),
            uploadedByName: d.uploadedById ? (names.get(d.uploadedById) ?? null) : null,
            source: d.source as C.DocumentSource,
          })),
          canFile: canFile && r.active && file.step !== FinancingStep.CLOTURE && state !== 'VALIDEE',
        };
      });
  }

  async farmerView(user: AuthUser, farmId: string): Promise<C.FarmFinancingView> {
    const { farm, canConsent, canFile } = await this.farmerSide(user, farmId);
    const programId = farm.programId;
    const template = await this.activeTemplate(programId);
    const consent = await this.consentOfFarm(farm.id, programId);
    let files: Array<C.FarmFinancingView['files'][number] & { checklist: C.FarmerChecklistLine[]; toFile: number }> = [];
    if (canConsent || canFile || user.role === UserRole.PLATFORM_ADMIN) {
      const entities = await this.dataSource
        .getRepository(FinancingFile)
        .find({ where: { farmId: farm.id }, order: { createdAt: 'DESC' } });
      const settings = await this.view.settings();
      const bundles = await this.view.bundles(entities, settings);
      const requirements = await this.view.requirements(programId);
      const names = await namesOf(this.dataSource, [...bundles.values()].flatMap((b) => b.documents.map((d) => d.uploadedById)));
      files = entities.map((f) => {
        const b = bundles.get(f.id)!;
        const row = this.view.row(b, requirements);
        const ctx = { today: b.today, consentActive: b.consent === 'ACTIF' };
        const checklist = this.farmerChecklist(f, requirements, b.documents, ctx, names, canFile);
        return {
          id: row.id,
          reference: row.reference,
          purpose: row.purpose,
          step: row.step,
          decision: row.decision,
          claimClass: row.claimClass,
          amounts: row.amounts,
          nextDueDate: row.nextDueDate,
          instalments: b.calc.instalments,
          // Only what the farmer himself supplies: the bank's own items stay internal.
          missingDocuments: blockersOf(f.step, requirements.filter((r) => r.providedBy === DocumentProvider.EXPLOITANT), b.documents, ctx),
          checklist,
          toFile: checklist.filter((l) => l.required && l.canFile !== false && ['MANQUANTE', 'REJETEE', 'EXPIREE'].includes(l.state)).length,
        };
      });
    }
    return {
      consent: consent && consent.status !== 'AUCUN' ? consent : null,
      template: template
        ? {
            id: template.id,
            version: template.version,
            title: template.title,
            purpose: template.purpose,
            dataCategories: template.dataCategories,
            retention: template.retention,
            fileName: template.originalName,
          }
        : null,
      recipient: FINANCER_NAME,
      files,
      canConsent,
      canFile,
    } as C.FarmFinancingView;
  }

  async farmerTemplateFile(
    user: AuthUser,
    farmId: string,
  ): Promise<{ buffer: Buffer; mime: string; fileName: string }> {
    const { farm } = await this.farmerSide(user, farmId);
    const template = await this.activeTemplate(farm.programId);
    if (!template) throw new NotFoundException('Aucun modèle de consentement n’est déposé.');
    return this.templateFile(template.id);
  }

  /**
   * Files a document from the farm side (owner, manager, or an agent acting
   * for him): only an EXPLOITANT requirement, on a file of this farm that is
   * not closed, never over a document validated and still valid.
   */
  async farmerFileDocument(
    user: AuthUser,
    farmId: string,
    fileId: string,
    dto: { requirementId?: string; issuedOn?: string },
    upload: Parameters<FinancingService['fileDocument']>[3],
  ): Promise<C.FarmFinancingView> {
    const { farm, canFile, source } = await this.farmerSide(user, farmId);
    if (!canFile || !source) {
      throw new ForbiddenException('Accès refusé : seuls le propriétaire, les administrateurs de la ferme ou un agent technique dépose une pièce.');
    }
    const file = isUuid(fileId)
      ? await this.dataSource.getRepository(FinancingFile).findOne({ where: { id: fileId, farmId: farm.id } })
      : null;
    if (!file) throw new NotFoundException('Dossier de financement introuvable.');
    if (file.step === FinancingStep.CLOTURE) {
      throw new ConflictException('Ce dossier est clos : plus aucune pièce ne peut être déposée.');
    }
    if (!dto.requirementId) throw new BadRequestException('Indiquez la pièce concernée.');
    const requirement = isUuid(dto.requirementId)
      ? await this.dataSource
          .getRepository(FinancingRequirement)
          .findOne({ where: { id: dto.requirementId, programId: file.programId } })
      : null;
    if (!requirement || !requirement.active || requirement.providedBy !== DocumentProvider.EXPLOITANT) {
      throw new BadRequestException('Cette pièce n’est pas à fournir par l’exploitation.');
    }
    const docs = await this.dataSource.getRepository(FinancingDocument).find({ where: { fileId: file.id, requirementId: requirement.id } });
    const ctx = await this.view.docContext(farm.id);
    if (lineState(requirement, docs, ctx) === 'VALIDEE') {
      throw new ConflictException('Cette pièce est déjà validée et toujours valable.');
    }
    await this.files.fileDocument(user, file, { requirementId: requirement.id, issuedOn: dto.issuedOn ?? null }, upload, source);
    return this.farmerView(user, farmId);
  }

  /** A document of the farm's own file, supplied from the farm side only (never the bank's internal ones). */
  async farmerDocumentFile(
    user: AuthUser,
    farmId: string,
    fileId: string,
    docId: string,
  ): Promise<{ buffer: Buffer; mime: string; fileName: string }> {
    const { farm, canConsent, canFile } = await this.farmerSide(user, farmId);
    if (!canConsent && !canFile && user.role !== UserRole.PLATFORM_ADMIN) {
      throw new ForbiddenException('Accès refusé : cette ferme ne vous appartient pas ou vous n’y êtes pas rattaché.');
    }
    const file = isUuid(fileId)
      ? await this.dataSource.getRepository(FinancingFile).findOne({ where: { id: fileId, farmId: farm.id } })
      : null;
    const doc = file && isUuid(docId)
      ? await this.dataSource.getRepository(FinancingDocument).findOne({ where: { id: docId, fileId: file.id } })
      : null;
    if (!file || !doc || doc.source === DocumentSource.BCEG) throw new NotFoundException('Document introuvable.');
    return {
      buffer: await readStored(financingDir(farm.id), doc.storedName),
      mime: doc.mime,
      fileName: doc.originalName,
    };
  }

  /** The blank form of an item the farm supplies. */
  async farmerRequirementTemplate(
    user: AuthUser,
    farmId: string,
    requirementId: string,
  ): Promise<{ buffer: Buffer; mime: string; fileName: string }> {
    await this.farmerSide(user, farmId);
    return this.files.requirementTemplateFile(requirementId, 'FARM');
  }

  /** The farmer gives his consent on line (the server keeps the proof, art. 72). */
  async giveOnline(
    user: AuthUser,
    farmId: string,
    dto: FarmerConsentDto,
    ctx: { ip: string | null; userAgent: string | null },
  ): Promise<C.FarmFinancingView> {
    const { farm, canConsent } = await this.farmerSide(user, farmId);
    if (!canConsent) {
      throw new ForbiddenException('Accès refusé : seuls le propriétaire et les administrateurs de la ferme donnent le consentement.');
    }
    if (dto.accepted !== true) {
      throw new BadRequestException('Le consentement doit être explicitement accepté.');
    }
    const template = await this.activeTemplate(farm.programId);
    if (!template) {
      throw new ConflictException('Aucun modèle de consentement n’est déposé par la banque.');
    }
    if (template.id !== dto.templateId) {
      throw new ConflictException('Le modèle de consentement a changé : relisez-le avant de consentir.');
    }
    try {
      await this.dataSource.transaction(async (em) => {
        await this.assertNoActive(em, farm.id);
        const repo = em.getRepository(FarmConsent);
        await repo.save(
          repo.create({
            programId: farm.programId,
            farmId: farm.id,
            status: ConsentRecordStatus.ACTIVE,
            templateId: template.id,
            templateVersion: template.version,
            templateSha256: template.sha256,
            method: ConsentMethod.EN_LIGNE,
            signerName: dto.signerName.trim(),
            signerQuality: dto.signerQuality?.trim() || null,
            grantedAt: new Date(),
            recordedById: user.id,
            ip: ctx.ip?.slice(0, 64) ?? null,
            userAgent: ctx.userAgent?.slice(0, 400) ?? null,
          }),
        );
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Un consentement est déjà actif pour cette ferme.');
      throw err;
    }
    return this.farmerView(user, farmId);
  }

  async withdrawOnline(user: AuthUser, farmId: string, reason: string | null): Promise<C.FarmFinancingView> {
    const { farm, canConsent } = await this.farmerSide(user, farmId);
    if (!canConsent) {
      throw new ForbiddenException('Accès refusé : seuls le propriétaire et les administrateurs de la ferme retirent le consentement.');
    }
    await this.withdrawRow(farm.id, farm.programId, 'FARMER', user.id, reason?.trim() || null);
    return this.farmerView(user, farmId);
  }
}
