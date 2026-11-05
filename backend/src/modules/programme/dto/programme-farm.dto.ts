import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { GpsSource } from '../../../common/enums/gps-source.enum.js';
import { toPhone } from '../../../common/utils/phone.js';

/** `"true"` / `"false"` from a multipart form or a query string, or a real boolean. */
export const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

const PHONE_PATTERN = /^\+?\d{6,15}$/;
const PHONE_MESSAGE =
  'Téléphone invalide : 6 à 15 chiffres, éventuellement précédés de +.';

export class FarmGpsDto {
  @ApiProperty({ example: 0.39 })
  @IsNumber({}, { message: 'La latitude doit être un nombre.' })
  @Min(-90, { message: 'Latitude invalide.' })
  @Max(90, { message: 'Latitude invalide.' })
  latitude: number;

  @ApiProperty({ example: 9.45 })
  @IsNumber({}, { message: 'La longitude doit être un nombre.' })
  @Min(-180, { message: 'Longitude invalide.' })
  @Max(180, { message: 'Longitude invalide.' })
  longitude: number;

  @ApiPropertyOptional({
    description: 'Date du relevé (défaut : maintenant)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Date du relevé invalide.' })
  capturedAt?: string;

  @ApiPropertyOptional({
    enum: GpsSource,
    description:
      'APPAREIL = relevé sur place par le téléphone ; MANUEL = saisie ou correction à la main (défaut)',
  })
  @IsOptional()
  @IsEnum(GpsSource, { message: 'Source GPS inconnue.' })
  source?: GpsSource;

  @ApiPropertyOptional({ description: 'Précision annoncée (m)' })
  @IsOptional()
  @IsNumber({}, { message: 'La précision doit être un nombre.' })
  @Min(0, { message: 'La précision doit être positive.' })
  accuracyM?: number;
}

export class SetFarmGpsDto extends FarmGpsDto {
  @ApiPropertyOptional({ description: 'Motif de la correction' })
  @IsOptional()
  @IsString({ message: 'Le motif doit être un texte.' })
  @MaxLength(500, { message: 'Le motif ne doit pas dépasser 500 caractères.' })
  reason?: string;
}

export class FarmInfrastructureDto {
  @ApiProperty({ example: 'BATIMENT_ELEVAGE' })
  @IsString({ message: "Le code d'infrastructure doit être un texte." })
  @IsNotEmpty({ message: "Le code d'infrastructure est obligatoire." })
  code: string;

  @ApiProperty({ example: 2 })
  @IsInt({ message: 'Le nombre doit être un entier.' })
  @Min(0, { message: 'Le nombre doit être positif.' })
  count: number;

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @IsNumber({}, { message: 'La surface doit être un nombre.' })
  @Min(0, { message: 'La surface doit être positive.' })
  surfaceM2?: number;
}

export class SetFarmInfrastructuresDto {
  @ApiProperty({ type: [FarmInfrastructureDto] })
  @IsArray({ message: 'La liste des infrastructures est attendue.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FarmInfrastructureDto)
  items: FarmInfrastructureDto[];
}

/** Sheet fields shared by creation, update and enrolment. */
class FarmSheetFieldsDto {
  @ApiPropertyOptional({
    description: 'Localité (doit appartenir à la province)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Localité invalide.' })
  localiteId?: string | null;

  @ApiPropertyOptional({ example: 'Jean Mba' })
  @IsOptional()
  @IsString({ message: "Le nom de l'exploitant doit être un texte." })
  @MaxLength(160, {
    message: "Le nom de l'exploitant ne doit pas dépasser 160 caractères.",
  })
  exploitantName?: string | null;

  @ApiPropertyOptional({ example: '+24177123456' })
  @IsOptional()
  @Transform(toPhone)
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  exploitantPhone?: string | null;

  @ApiPropertyOptional({ description: 'Référence du formulaire AMI' })
  @IsOptional()
  @IsString({ message: 'La référence AMI doit être un texte.' })
  @MaxLength(64, {
    message: 'La référence AMI ne doit pas dépasser 64 caractères.',
  })
  amiRef?: string | null;

  @ApiPropertyOptional({
    description: 'Code de la liste COHORTE',
    example: 'COHORTE_1',
  })
  @IsOptional()
  @IsString({ message: 'La cohorte doit être un code de liste.' })
  cohort?: string | null;

  @ApiPropertyOptional({ description: 'Capacité (places)', example: 1200 })
  @IsOptional()
  @IsInt({ message: 'La capacité doit être un nombre entier de places.' })
  @Min(0, { message: 'La capacité doit être positive.' })
  capacityPlaces?: number | null;
}

/** Status and duplicate confirmation, at creation and enrolment. */
class FarmEntryDto extends FarmSheetFieldsDto {
  @ApiPropertyOptional({
    description:
      'Code de la liste STATUT_FERME (défaut : la famille PREPARATION)',
  })
  @IsOptional()
  @IsString({ message: 'Le statut doit être un code de liste.' })
  statusCode?: string;

  @ApiPropertyOptional({ type: FarmGpsDto })
  @IsOptional()
  @IsObject({ message: 'Le relevé GPS doit être un objet.' })
  @ValidateNested()
  @Type(() => FarmGpsDto)
  gps?: FarmGpsDto;

  @ApiPropertyOptional({
    description:
      'Créer malgré un doublon probable (409 avec les candidats sinon) ; la confirmation est enregistrée',
  })
  @IsOptional()
  @IsBoolean({ message: 'confirmDuplicate doit être un booléen.' })
  confirmDuplicate?: boolean;
}

export class CreateProgrammeFarmDto extends FarmEntryDto {
  @ApiProperty({ example: 'Ferme avicole Ngoma' })
  @IsString({ message: 'Le nom doit être un texte.' })
  @IsNotEmpty({ message: 'Le nom de la ferme est obligatoire.' })
  @MaxLength(200, { message: 'Le nom ne doit pas dépasser 200 caractères.' })
  name: string;

  @ApiProperty({ example: 'G1' })
  @IsString({ message: 'Le code de province doit être un texte.' })
  @IsNotEmpty({ message: 'La province est obligatoire.' })
  provinceCode: string;

  @ApiPropertyOptional({ type: [FarmInfrastructureDto] })
  @IsOptional()
  @IsArray({ message: 'La liste des infrastructures est attendue.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FarmInfrastructureDto)
  infrastructures?: FarmInfrastructureDto[];
}

export class EnrolFarmDto extends FarmEntryDto {
  @ApiProperty({ example: 'G1' })
  @IsString({ message: 'Le code de province doit être un texte.' })
  @IsNotEmpty({ message: 'La province est obligatoire.' })
  provinceCode: string;
}

/** The code and the programme are never editable; GPS and status have their own routes. */
export class UpdateProgrammeFarmDto extends FarmSheetFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Le nom doit être un texte.' })
  @IsNotEmpty({ message: 'Le nom de la ferme est obligatoire.' })
  @MaxLength(200, { message: 'Le nom ne doit pas dépasser 200 caractères.' })
  name?: string;

  @ApiPropertyOptional({
    description:
      'Correction de la province (le code de la ferme ne change pas)',
  })
  @IsOptional()
  @IsString({ message: 'Le code de province doit être un texte.' })
  @IsNotEmpty({ message: 'La province est obligatoire.' })
  provinceCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'confirmDuplicate doit être un booléen.' })
  confirmDuplicate?: boolean;
}

export class SetFarmStatusDto {
  @ApiProperty({ example: 'OPERATIONNELLE' })
  @IsString({ message: 'Le statut doit être un code de liste.' })
  @IsNotEmpty({ message: 'Le statut est obligatoire.' })
  statusCode: string;

  @ApiPropertyOptional({
    description:
      "Date d'effet (défaut : maintenant ; jamais future ni antérieure au statut en cours)",
  })
  @IsOptional()
  @IsDateString({}, { message: "Date d'effet invalide." })
  from?: string;

  @ApiPropertyOptional({
    description: 'Motif (obligatoire pour une suspension)',
  })
  @IsOptional()
  @IsString({ message: 'Le motif doit être un texte.' })
  @MaxLength(500, { message: 'Le motif ne doit pas dépasser 500 caractères.' })
  reason?: string;
}

export class ActivateOwnerDto {
  @ApiPropertyOptional({
    description:
      "Rattacher la ferme au compte Propriétaire qui existe déjà pour le téléphone de l'exploitant",
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'linkExistingUser doit être un booléen.' })
  linkExistingUser?: boolean;
}

export class ImportFarmsDto {
  @ApiPropertyOptional({
    description: 'Essai à blanc : rien n’est enregistré (défaut : true)',
    default: true,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'dryRun doit être un booléen.' })
  dryRun?: boolean;

  @ApiPropertyOptional({
    description: 'Créer aussi les lignes signalées comme doublons probables',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'confirmDuplicate doit être un booléen.' })
  confirmDuplicate?: boolean;

  @ApiPropertyOptional({
    description:
      'Lignes JSON (mêmes noms de colonnes que le CSV) quand aucun fichier n’est envoyé',
  })
  @IsOptional()
  @IsArray({ message: 'rows doit être une liste de lignes.' })
  @ArrayMaxSize(5000, { message: '5 000 lignes au maximum par import.' })
  @IsObject({ each: true, message: 'Chaque ligne doit être un objet.' })
  rows?: Record<string, unknown>[];
}

export class ListProgrammeFarmsQueryDto {
  @ApiPropertyOptional({ example: 'G1' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ description: 'Identifiant de localité' })
  @IsOptional()
  @IsUUID('4', { message: 'Localité invalide.' })
  localiteId?: string;

  @ApiPropertyOptional({ example: 'COHORTE_1' })
  @IsOptional()
  @IsString()
  cohort?: string;

  @ApiPropertyOptional({ example: 'OPERATIONNELLE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Recherche : nom, code, exploitant, téléphone, réf. AMI',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page doit être un entier.' })
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize doit être un entier.' })
  @Min(1)
  @Max(200)
  pageSize?: number;
}
