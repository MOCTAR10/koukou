import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AccessScopeKind } from '../../../common/enums/access-scope-kind.enum.js';
import {
  ReportLevel,
  ReportPeriodicity,
  ReportSection,
} from '../../../common/enums/report.enum.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = 'Date attendue au format AAAA-MM-JJ.';

/** Filters of the dashboards, the map and the exports. */
export class PilotageQueryDto {
  @ApiPropertyOptional({
    description:
      'Début de période (AAAA-MM-JJ), défaut : 29 jours avant la fin',
  })
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    description: 'Fin de période (AAAA-MM-JJ), défaut : aujourd’hui',
  })
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  to?: string;

  @ApiPropertyOptional({
    description: 'Codes de province séparés par des virgules',
    example: 'G1,G2',
  })
  @IsOptional()
  @IsString({ message: 'Province : texte attendu.' })
  @MaxLength(200)
  province?: string;

  @ApiPropertyOptional({
    description: 'Code de cohorte (liste COHORTE)',
    example: 'COHORTE_1',
  })
  @IsOptional()
  @IsString({ message: 'Cohorte : texte attendu.' })
  @MaxLength(40)
  cohort?: string;

  @ApiPropertyOptional({
    description: 'Code de statut (liste STATUT_FERME)',
    example: 'OPERATIONNELLE',
  })
  @IsOptional()
  @IsString({ message: 'Statut : texte attendu.' })
  @MaxLength(40)
  status?: string;
}

/** Filters of the objective (no period: everything since the programme start). */
export class ObjectiveQueryDto {
  @ApiPropertyOptional({
    description: 'Codes de province séparés par des virgules',
  })
  @IsOptional()
  @IsString({ message: 'Province : texte attendu.' })
  @MaxLength(200)
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Cohorte : texte attendu.' })
  @MaxLength(40)
  cohort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Statut : texte attendu.' })
  @MaxLength(40)
  status?: string;
}

export class ReportAudienceDto {
  @ApiPropertyOptional({ enum: AccessScopeKind, isArray: true })
  @IsOptional()
  @IsArray({ message: 'Périmètres : liste attendue.' })
  @IsEnum(AccessScopeKind, { each: true, message: 'Périmètre inconnu.' })
  scopeKinds?: AccessScopeKind[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Codes de profil (vide = tous)',
  })
  @IsOptional()
  @IsArray({ message: 'Profils : liste attendue.' })
  @IsString({ each: true, message: 'Code de profil : texte attendu.' })
  profileCodes?: string[];

  @ApiPropertyOptional({
    description: 'Prévenir l’exploitant de la ferme (rapport de bande)',
  })
  @IsOptional()
  @IsBoolean({ message: 'farmOwners : vrai ou faux.' })
  farmOwners?: boolean;
}

export class UpdateReportTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Libellé : texte attendu.' })
  @MaxLength(160)
  label?: string;

  @ApiPropertyOptional({ enum: ReportPeriodicity })
  @IsOptional()
  @IsEnum(ReportPeriodicity, { message: 'Périodicité inconnue.' })
  periodicity?: ReportPeriodicity;

  @ApiPropertyOptional({ enum: ReportSection, isArray: true })
  @IsOptional()
  @IsArray({ message: 'Sections : liste attendue.' })
  @IsEnum(ReportSection, { each: true, message: 'Section inconnue.' })
  sections?: ReportSection[];

  @ApiPropertyOptional({ type: ReportAudienceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportAudienceDto)
  audience?: ReportAudienceDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'active : vrai ou faux.' })
  active?: boolean;
}

export class GenerateReportDto {
  @ApiPropertyOptional({
    description:
      'Un jour de la période à produire (défaut : la dernière période close)',
  })
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  periodStart?: string;

  @ApiPropertyOptional({
    description: 'Province (modèle de niveau PROVINCE)',
    example: 'G1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  provinceCode?: string;

  @ApiPropertyOptional({
    description: 'Bande clôturée (modèle de fin de bande)',
  })
  @IsOptional()
  @IsString()
  batchId?: string;
}

export class ReportRunsQueryDto {
  @ApiPropertyOptional({ description: 'Code du modèle' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  template?: string;

  @ApiPropertyOptional({ enum: ReportLevel })
  @IsOptional()
  @IsEnum(ReportLevel, { message: 'Niveau inconnu.' })
  level?: ReportLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  to?: string;
}
