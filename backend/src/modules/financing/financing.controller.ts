import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AuditExport,
  AuditThirdPartyRead,
} from '../../common/decorators/audit.decorator.js';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import type { UploadedImageFile } from '../farms/farms.service.js';
import { ConsentService } from './consent.service.js';
import { LEGAL_BASIS } from './data/legal.js';
import {
  ConsentsQueryDto,
  CreateFinancingFileDto,
  CreateRequirementDto,
  CreateTemplateDto,
  DisbursementDto,
  FarmPickerQueryDto,
  FinancialsQueryDto,
  FinancialStatementsDto,
  FilesQueryDto,
  GenerateScheduleDto,
  PaperConsentDto,
  PassStepDto,
  ReasonDto,
  ReleaseDisbursementDto,
  RepaymentDto,
  ReviewDocumentDto,
  UpdateFinancingFileDto,
  UpdateRequirementDto,
  UploadDocumentDto,
} from './dto/financing.dto.js';
import { FinancingOverviewService } from './financing-overview.service.js';
import { FinancingPortfolioService } from './financing-portfolio.service.js';
import { FinancingService } from './financing.service.js';
import { FinancingStatementsService } from './financing-statements.service.js';
import { FINANCING_FILE_MAX_BYTES } from './financing-storage.js';
import { XLSX_MIME } from '../../common/utils/spreadsheet.js';

const upload = () =>
  FileInterceptor('file', { limits: { fileSize: FINANCING_FILE_MAX_BYTES, files: 1 } });

interface StoredFile {
  buffer: Buffer;
  mime: string;
  fileName: string;
}

/** Streams a stored file (never static, never cached; journaled by `@AuditExport`). */
function send(res: Response, file: StoredFile): StreamableFile {
  res.set({
    'Content-Type': file.mime,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'Cache-Control': 'private, no-store',
  });
  return new StreamableFile(file.buffer);
}

/**
 * Financer workspace of the programme (matrix domain FINANCEMENT, held by the
 * BCEG; read-only for the DGE and the programme administration). Every route
 * works on every farm of the programme: the bank opens a file and records a
 * consent before it can read the farm's data; only the farm overview (360°)
 * is bound to the caller's perimeter (FINANCEMENT_PERIMETRE).
 *
 * Route params named `:fid` (not `:farmId`) on purpose: `ProgramAccessGuard`
 * checks every `:farmId` against the scope, which would make the first
 * consent of a farm outside the perimeter impossible.
 */
@ApiTags('Financement (BCEG)')
@Roles(UserRole.PLATFORM_ADMIN)
@Domain('FINANCEMENT')
@Controller('programme/financing')
export class FinancingController {
  constructor(
    private readonly files: FinancingService,
    private readonly consents: ConsentService,
    private readonly portfolio: FinancingPortfolioService,
    private readonly overview: FinancingOverviewService,
    private readonly statements: FinancingStatementsService,
  ) {}

  // ── Portfolio ────────────────────────────────────────────────────────────

  @Get('portfolio')
  @AuditThirdPartyRead('Portefeuille de financement')
  @ApiOperation({ summary: 'Tableau de bord du portefeuille de financement' })
  getPortfolio(@CurrentUser() user: AuthUser) {
    return this.portfolio.portfolio(user);
  }

  @Get('portfolio/export')
  @AuditExport('Portefeuille de financement (Excel)')
  @ApiOperation({ summary: 'Export Excel du portefeuille, une ligne par dossier' })
  async exportPortfolio(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const file = await this.portfolio.export();
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(file.buffer);
  }

  // ── Files ────────────────────────────────────────────────────────────────

  @Get('files')
  @AuditThirdPartyRead('Dossiers de financement')
  @ApiOperation({ summary: 'Dossiers de financement (filtres : étape, classe, province, recherche)' })
  listFiles(@Query() query: FilesQueryDto) {
    return this.files.listFiles(query);
  }

  @Post('files')
  @ApiOperation({ summary: 'Ouvrir un dossier de financement pour une ferme du programme' })
  createFile(@CurrentUser() user: AuthUser, @Body() dto: CreateFinancingFileDto) {
    return this.files.createFile(user, dto);
  }

  @Get('files/:id')
  @AuditThirdPartyRead('Dossier de financement')
  @ApiOperation({ summary: 'Dossier de financement complet' })
  getFile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.files.getFile(user, id);
  }

  @Patch('files/:id')
  @ApiOperation({ summary: 'Modifier les conditions et notes du dossier' })
  updateFile(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateFinancingFileDto) {
    return this.files.updateFile(user, id, dto);
  }

  @Post('files/:id/step')
  @Action('VALIDER')
  @ApiOperation({ summary: 'Faire passer le dossier à l’étape suivante (décision, pièces obligatoires)' })
  passStep(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PassStepDto) {
    return this.files.passStep(user, id, dto);
  }

  @Post('files/:id/schedule')
  @Action('MODIFIER')
  @ApiOperation({ summary: 'Générer (ou régénérer) l’échéancier à annuités constantes' })
  schedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GenerateScheduleDto) {
    return this.files.generateSchedule(user, id, dto);
  }

  @Post('files/:id/disbursements')
  @Action('MODIFIER')
  @ApiOperation({ summary: 'Prévoir une tranche' })
  addDisbursement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DisbursementDto) {
    return this.files.addDisbursement(user, id, dto);
  }

  @Post('files/:id/disbursements/:did/release')
  @Action('VALIDER')
  @ApiOperation({ summary: 'Débloquer une tranche' })
  release(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('did') did: string,
    @Body() dto: ReleaseDisbursementDto,
  ) {
    return this.files.releaseDisbursement(user, id, did, dto);
  }

  @Post('files/:id/disbursements/:did/cancel')
  @Action('VALIDER')
  @ApiOperation({ summary: 'Annuler une tranche prévue' })
  cancelDisbursement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('did') did: string) {
    return this.files.cancelDisbursement(user, id, did);
  }

  @Post('files/:id/repayments')
  @ApiOperation({ summary: 'Enregistrer un remboursement' })
  addRepayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RepaymentDto) {
    return this.files.addRepayment(user, id, dto);
  }

  @Post('files/:id/repayments/:rid/cancel')
  @Action('VALIDER')
  @ApiOperation({ summary: 'Annuler un remboursement (jamais supprimé), avec motif' })
  cancelRepayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('rid') rid: string,
    @Body() dto: ReasonDto,
  ) {
    return this.files.cancelRepayment(user, id, rid, dto.reason);
  }

  // ── Documents ────────────────────────────────────────────────────────────

  @Post('files/:id/documents')
  @UseInterceptors(upload())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Déposer une pièce (PDF, JPEG, PNG, WebP, 10 Mo) ; multipart « file », requirementId, label' })
  addDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: UploadedImageFile | undefined,
  ) {
    return this.files.uploadDocument(user, id, dto, file);
  }

  @Get('files/:id/documents/:docId/file')
  @AuditExport('Pièce d’un dossier de financement')
  @ApiOperation({ summary: 'Télécharger une pièce du dossier' })
  async documentFile(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.files.documentFile(id, docId));
  }

  @Post('files/:id/documents/:docId/review')
  @Action('VALIDER')
  @ApiOperation({ summary: 'Valider ou rejeter une pièce (motif obligatoire au rejet)' })
  review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.files.reviewDocument(user, id, docId, dto);
  }

  // ── Checklist ────────────────────────────────────────────────────────────

  @Get('requirements')
  @ApiOperation({ summary: 'Liste de pièces de la banque, par étape' })
  requirements() {
    return this.files.listRequirements();
  }

  @Post('requirements')
  @Action('VALIDER')
  @ApiOperation({ summary: 'Ajouter une exigence à la liste de pièces' })
  createRequirement(@Body() dto: CreateRequirementDto) {
    return this.files.createRequirement(dto);
  }

  @Patch('requirements/:id')
  @Action('VALIDER')
  @ApiOperation({ summary: 'Modifier ou désactiver une exigence (jamais supprimée)' })
  updateRequirement(@Param('id') id: string, @Body() dto: UpdateRequirementDto) {
    return this.files.updateRequirement(id, dto);
  }

  @Post('requirements/:id/template')
  @Action('VALIDER')
  @UseInterceptors(upload())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Joindre (ou remplacer) le formulaire vierge d’une exigence ; multipart « file »' })
  setTemplate(@Param('id') id: string, @UploadedFile() file: UploadedImageFile | undefined) {
    return this.files.setRequirementTemplate(id, file);
  }

  @Delete('requirements/:id/template')
  @Action('VALIDER')
  @ApiOperation({ summary: 'Retirer le formulaire vierge d’une exigence' })
  deleteTemplate(@Param('id') id: string) {
    return this.files.deleteRequirementTemplate(id);
  }

  @Get('requirements/:id/template')
  @AuditExport('Formulaire vierge d’une exigence')
  @ApiOperation({ summary: 'Télécharger le formulaire vierge d’une exigence' })
  async requirementTemplate(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.files.requirementTemplateFile(id, 'BANK'));
  }

  // ── Consent ──────────────────────────────────────────────────────────────

  @Get('consent-templates')
  @ApiOperation({ summary: 'Modèles de consentement, mentions obligatoires et périmètre du financeur' })
  templates() {
    return this.consents.templatesView();
  }

  @Post('consent-templates')
  @Action('VALIDER')
  @UseInterceptors(upload())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Déposer un nouveau modèle de consentement (immuable) ; multipart « file », title, purpose, dataCategories (JSON), retention, confirmedClauses (JSON)',
  })
  createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTemplateDto,
    @UploadedFile() file: UploadedImageFile | undefined,
  ) {
    return this.consents.createTemplate(user, dto, file);
  }

  @Get('consent-templates/:id/file')
  @AuditExport('Modèle de consentement')
  @ApiOperation({ summary: 'Télécharger le modèle de consentement' })
  async templateFile(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.consents.templateFile(id));
  }

  @Get('consents')
  @AuditThirdPartyRead('Consentements des exploitants')
  @ApiOperation({ summary: 'Consentements par ferme et couverture' })
  listConsents(@Query() query: ConsentsQueryDto) {
    return this.consents.consentsView(query);
  }

  @Post('farms/:fid/consent')
  @UseInterceptors(upload())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Enregistrer un consentement papier (scan signé obligatoire) ; multipart « file », signerName, signerQuality, grantedOn',
  })
  recordConsent(
    @CurrentUser() user: AuthUser,
    @Param('fid', ParseUUIDPipe) fid: string,
    @Body() dto: PaperConsentDto,
    @UploadedFile() file: UploadedImageFile | undefined,
  ) {
    return this.consents.recordPaper(user, fid, dto, file);
  }

  @Get('farms/:fid/consent/proof')
  @AuditExport('Pièce signée du consentement')
  @ApiOperation({ summary: 'Télécharger le scan signé du consentement' })
  async proof(
    @Param('fid', ParseUUIDPipe) fid: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.consents.proofFile(fid));
  }

  @Post('farms/:fid/consent/withdraw')
  @ApiOperation({ summary: 'Enregistrer le retrait du consentement (immédiat, non rétroactif)' })
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param('fid', ParseUUIDPipe) fid: string,
    @Body() dto: ReasonDto,
  ) {
    return this.consents.withdrawByBank(user, fid, dto.reason);
  }

  // ── Farm 360° and legal basis ────────────────────────────────────────────

  /** `:farmId` here is deliberate: the guard binds the farm's data to the perimeter. */
  @Get('farms/:farmId/overview')
  @AuditThirdPartyRead('Vue 360° d’une ferme (financeur)')
  @ApiOperation({ summary: 'Ferme à 360° : fiche, production, économie, appuis, alertes, financement' })
  farm360(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.overview.overview(user, farmId);
  }

  /** Needs COMPTABILITE:CONSULTER on the caller's matrix too (checked in the service). */
  @Get('farms/:farmId/financials')
  @AuditThirdPartyRead('États financiers d’une ferme (financeur)')
  @ApiOperation({ summary: 'États financiers SYSCOHADA de la ferme, ratios, avant/après le premier décaissement' })
  financials(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string, @Query() q: FinancialsQueryDto) {
    return this.statements.financials(user, farmId, q.from, q.to);
  }

  @Get('farms/:farmId/financials/pdf')
  @AuditExport('États financiers d’une ferme (PDF)')
  @ApiOperation({ summary: 'PDF « États financiers » (non audités)' })
  async financialsPdf(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query() q: FinancialsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.statements.pdfOf(user, farmId, q.from, q.to);
    return send(res, { buffer: pdf.buffer, mime: 'application/pdf', fileName: pdf.fileName });
  }

  @Post('files/:id/financial-statements')
  @ApiOperation({ summary: 'Générer le PDF des états financiers et le classer dans le dossier' })
  attachStatements(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FinancialStatementsDto) {
    return this.statements.attachToFile(user, id, dto.from, dto.to);
  }

  /** Identification only, every farm of the programme (the bank picks a farm before any consent). */
  @Get('farms')
  @ApiOperation({ summary: 'Sélecteur de fermes du programme (20 lignes max, identification seule)' })
  pickFarms(@Query() query: FarmPickerQueryDto) {
    return this.files.pickFarms(query.q);
  }

  @Get('legal-basis')
  @ApiOperation({ summary: 'Références juridiques du financement (vérifiées ou à confirmer)' })
  legalBasis() {
    return LEGAL_BASIS;
  }
}
