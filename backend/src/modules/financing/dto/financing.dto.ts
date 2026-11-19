import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ClaimFlag,
  DocumentProvider,
  FinancingDecision,
  FinancingPeriodicity,
  FinancingStep,
  RepaymentMethod,
} from '../../../common/enums/financing.enum.js';
import { MAX_FCFA } from '../financing-rules.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = 'La date doit être au format AAAA-MM-JJ.';
const FCFA_MSG = `Le montant est un nombre entier de FCFA (au plus ${MAX_FCFA}).`;

/** Text trimmed; empty = null. */
const blankToNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  );

export class FilesQueryDto {
  @IsOptional()
  @IsEnum(FinancingStep, { message: 'Étape inconnue.' })
  step?: FinancingStep;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  claimClass?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CreateFinancingFileDto {
  @IsUUID('4', { message: 'La ferme est invalide.' })
  farmId: string;

  @IsString()
  @IsNotEmpty({ message: 'L’objet du financement est obligatoire.' })
  @MaxLength(1000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  purpose: string;

  @IsOptional()
  @IsInt({ message: FCFA_MSG })
  @Min(1, { message: FCFA_MSG })
  @Max(MAX_FCFA, { message: FCFA_MSG })
  requestedFcfa?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @blankToNull()
  notes?: string | null;
}

export class UpdateFinancingFileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'L’objet du financement ne peut pas être vide.' })
  @MaxLength(1000)
  purpose?: string;

  @IsOptional()
  @IsInt({ message: FCFA_MSG })
  @Min(1, { message: FCFA_MSG })
  @Max(MAX_FCFA, { message: FCFA_MSG })
  requestedFcfa?: number | null;

  @IsOptional()
  @IsInt({ message: FCFA_MSG })
  @Min(1, { message: FCFA_MSG })
  @Max(MAX_FCFA, { message: FCFA_MSG })
  grantedFcfa?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @blankToNull()
  amountNote?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Le taux a deux décimales au plus.' })
  @Min(0)
  @Max(100)
  ratePct?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  durationMonths?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  graceMonths?: number | null;

  @IsOptional()
  @IsEnum(FinancingPeriodicity, { message: 'Périodicité inconnue.' })
  periodicity?: FinancingPeriodicity | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @blankToNull()
  guarantees?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @blankToNull()
  guaranteeFund?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  guaranteePct?: number | null;

  @IsOptional()
  @IsEnum(ClaimFlag, { message: 'Classe de créance inconnue.' })
  claimFlag?: ClaimFlag | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @blankToNull()
  claimFlagNote?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @blankToNull()
  notes?: string | null;
}

export class PassStepDto {
  @IsEnum(FinancingStep, { message: 'Étape inconnue.' })
  to: FinancingStep;

  @IsOptional()
  @IsEnum(FinancingDecision, { message: 'Décision inconnue.' })
  decision?: FinancingDecision;

  @IsOptional()
  @Matches(DATE, { message: DATE_MSG })
  decisionDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class GenerateScheduleDto {
  @Matches(DATE, { message: DATE_MSG })
  firstDueDate: string;
}

export class DisbursementDto {
  @IsOptional()
  @Matches(DATE, { message: DATE_MSG })
  plannedDate?: string | null;

  @IsInt({ message: FCFA_MSG })
  @Min(1, { message: FCFA_MSG })
  @Max(MAX_FCFA, { message: FCFA_MSG })
  amountFcfa: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @blankToNull()
  condition?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @blankToNull()
  note?: string | null;
}

export class ReleaseDisbursementDto {
  @Matches(DATE, { message: DATE_MSG })
  releasedOn: string;

  @IsOptional()
  @IsUUID('4', { message: 'La visite est invalide.' })
  visitId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @blankToNull()
  note?: string | null;
}

export class RepaymentDto {
  @Matches(DATE, { message: DATE_MSG })
  paidOn: string;

  @IsInt({ message: FCFA_MSG })
  @Min(1, { message: FCFA_MSG })
  @Max(MAX_FCFA, { message: FCFA_MSG })
  amountFcfa: number;

  @IsEnum(RepaymentMethod, { message: 'Mode de paiement inconnu.' })
  method: RepaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @blankToNull()
  reference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @blankToNull()
  note?: string | null;
}

export class ReasonDto {
  @IsString()
  @IsNotEmpty({ message: 'Le motif est obligatoire.' })
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  reason: string;
}

export class OptionalReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

/** Multipart fields of `POST …/documents` (the file is a separate part). */
export class UploadDocumentDto {
  @IsOptional()
  @IsUUID('4', { message: 'L’exigence est invalide.' })
  requirementId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  label?: string;

  /** Issue date of the document (validity runs from it); the upload day when absent. */
  @IsOptional()
  @Matches(DATE, { message: DATE_MSG })
  issuedOn?: string;
}

const FORMATS_MSG = 'Les formats acceptés sont PDF et IMAGE.';
const VALIDITY_MSG = 'La validité est un nombre entier de mois (1 à 120).';

export class ReviewDocumentDto {
  @IsIn(['VALIDE', 'REJETE'], { message: 'Le statut est VALIDE ou REJETE.' })
  status: 'VALIDE' | 'REJETE';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class CreateRequirementDto {
  @IsString()
  @IsNotEmpty({ message: 'Le libellé est obligatoire.' })
  @MaxLength(300)
  label: string;

  @IsEnum(FinancingStep, { message: 'Étape inconnue.' })
  step: FinancingStep;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @blankToNull()
  legalBasis?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @blankToNull()
  help?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsEnum(DocumentProvider, { message: 'Le fournisseur est EXPLOITANT ou BCEG.' })
  providedBy?: DocumentProvider;

  @IsOptional()
  @IsArray()
  @IsIn(['PDF', 'IMAGE'], { each: true, message: FORMATS_MSG })
  formats?: Array<'PDF' | 'IMAGE'>;

  @IsOptional()
  @IsInt({ message: VALIDITY_MSG })
  @Min(1, { message: VALIDITY_MSG })
  @Max(120, { message: VALIDITY_MSG })
  validityMonths?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sort?: number;
}

export class UpdateRequirementDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  label?: string;

  @IsOptional()
  @IsEnum(FinancingStep, { message: 'Étape inconnue.' })
  step?: FinancingStep;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @blankToNull()
  legalBasis?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @blankToNull()
  help?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sort?: number;

  @IsOptional()
  @IsEnum(DocumentProvider, { message: 'Le fournisseur est EXPLOITANT ou BCEG.' })
  providedBy?: DocumentProvider;

  @IsOptional()
  @IsArray()
  @IsIn(['PDF', 'IMAGE'], { each: true, message: FORMATS_MSG })
  formats?: Array<'PDF' | 'IMAGE'>;

  @IsOptional()
  @IsInt({ message: VALIDITY_MSG })
  @Min(1, { message: VALIDITY_MSG })
  @Max(120, { message: VALIDITY_MSG })
  validityMonths?: number | null;
}

export class FarmPickerQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ConsentsQueryDto {
  @IsOptional()
  @IsIn(['AUCUN', 'ACTIF', 'RETIRE'], { message: 'Statut inconnu.' })
  status?: 'AUCUN' | 'ACTIF' | 'RETIRE';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** Multipart fields of `POST …/consent-templates`. */
export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty({ message: 'Le titre est obligatoire.' })
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'La finalité est obligatoire.' })
  @MaxLength(4000)
  purpose: string;

  /** JSON array of strings (multipart field). */
  @IsString()
  @IsNotEmpty({ message: 'Les catégories de données sont obligatoires.' })
  dataCategories: string;

  @IsString()
  @IsNotEmpty({ message: 'La durée de conservation est obligatoire.' })
  @MaxLength(2000)
  retention: string;

  /** JSON array of clause codes (multipart field). */
  @IsString()
  @IsNotEmpty({ message: 'Les mentions confirmées sont obligatoires.' })
  confirmedClauses: string;
}

/** Multipart fields of `POST …/farms/:farmId/consent` (paper consent). */
export class PaperConsentDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom du signataire est obligatoire.' })
  @MaxLength(200)
  signerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  signerQuality?: string;

  @Matches(DATE, { message: DATE_MSG })
  grantedOn: string;
}

export class FarmerConsentDto {
  @IsUUID('4', { message: 'Le modèle de consentement est invalide.' })
  templateId: string;

  @IsString()
  @IsNotEmpty({ message: 'Le nom du signataire est obligatoire.' })
  @MaxLength(200)
  signerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  signerQuality?: string;

  /** Must be literally `true`: the farmer ticks the consent himself. */
  @IsBoolean({ message: 'Le consentement doit être explicitement accepté.' })
  accepted: boolean;
}

export class FinancialsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  to?: string;
}

export class FinancialStatementsDto {
  @IsString()
  @MaxLength(10)
  from: string;

  @IsString()
  @MaxLength(10)
  to: string;
}
