import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ImportJobStatus,
  ImportJobType,
  ImportRowOutcome,
  ImportRowStatus,
} from '../../../common/enums/import-job.enum.js';
import { toBoolean } from '../../programme/dto/programme-farm.dto.js';

/** Multipart text field holding JSON → object (left as is when not JSON). */
const jsonObject = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  if (value.trim() === '') return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

export class DepositImportDto {
  @ApiProperty({ enum: ImportJobType })
  @IsEnum(ImportJobType, {
    message:
      'Type de reprise inconnu (AMI, BANDES_HISTORIQUES, OUTIL_TRANSITOIRE).',
  })
  type: ImportJobType;

  @ApiPropertyOptional({ description: 'Origine du fichier, campagne…' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Note : 500 caractères au maximum.' })
  note?: string;

  @ApiPropertyOptional({
    description:
      'Reprendre aussi les lignes signalées comme doublons probables',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'confirmDuplicate doit être un booléen.' })
  confirmDuplicate?: boolean;

  @ApiPropertyOptional({
    description:
      'Correspondance des colonnes (JSON) : en-tête du fichier → champ (null = ignorée). Sans elle, les en-têtes sont reconnus automatiquement.',
    example: '{"Nom exploitation":"name"}',
  })
  @IsOptional()
  @Transform(jsonObject)
  @IsObject({ message: 'mapping doit être un objet JSON.' })
  mapping?: Record<string, string | null>;
}

export class ImportSettingsDto {
  @ApiPropertyOptional({
    description: 'En-tête du fichier → champ (null = colonne ignorée)',
    example: { 'Nom exploitation': 'name', Observations: null },
  })
  @IsOptional()
  @IsObject({ message: 'mapping doit être un objet.' })
  mapping?: Record<string, string | null>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'confirmDuplicate doit être un booléen.' })
  confirmDuplicate?: boolean;
}

export class CorrectImportRowDto {
  @ApiPropertyOptional({
    description: 'Champ → nouvelle valeur (null ou "" = vider)',
    example: { province: 'G1' },
  })
  @IsOptional()
  @IsObject({ message: 'values doit être un objet.' })
  values?: Record<string, string | null>;

  @ApiPropertyOptional({
    description: 'Exclure (true) ou rétablir (false) la ligne',
  })
  @IsOptional()
  @IsBoolean({ message: 'exclude doit être un booléen.' })
  exclude?: boolean;

  @ApiProperty({ description: 'Motif de la correction (rapport de reprise)' })
  @IsString({ message: 'Le motif de la correction est obligatoire.' })
  @MinLength(5, { message: 'Le motif doit faire au moins 5 caractères.' })
  @MaxLength(500, { message: 'Motif : 500 caractères au maximum.' })
  reason: string;
}

export class ValidateImportDto {
  @ApiPropertyOptional({ description: 'Commentaire de validation' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Commentaire : 500 caractères au maximum.' })
  comment?: string;
}

export class RejectImportDto {
  @ApiProperty({ description: 'Motif du rejet' })
  @IsString({ message: 'Le motif du rejet est obligatoire.' })
  @MinLength(5, { message: 'Le motif doit faire au moins 5 caractères.' })
  @MaxLength(500, { message: 'Motif : 500 caractères au maximum.' })
  reason: string;
}

export class ListImportsQueryDto {
  @ApiPropertyOptional({ enum: ImportJobType })
  @IsOptional()
  @IsEnum(ImportJobType, { message: 'Type de reprise inconnu.' })
  type?: ImportJobType;

  @ApiPropertyOptional({ enum: ImportJobStatus })
  @IsOptional()
  @IsEnum(ImportJobStatus, { message: 'Statut inconnu.' })
  status?: ImportJobStatus;
}

export class ImportRowsQueryDto {
  @ApiPropertyOptional({ enum: ImportRowStatus })
  @IsOptional()
  @IsEnum(ImportRowStatus, { message: 'Statut de ligne inconnu.' })
  status?: ImportRowStatus;

  @ApiPropertyOptional({
    enum: ImportRowOutcome,
    description: "Résultat (de l'intégration, sinon de l'essai, sinon prévu)",
  })
  @IsOptional()
  @IsEnum(ImportRowOutcome, { message: 'Résultat inconnu.' })
  outcome?: ImportRowOutcome;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}
