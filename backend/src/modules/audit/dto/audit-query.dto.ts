import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AuditAction } from '../../../common/enums/audit-action.enum.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INVALID_DAY = 'Date invalide (format AAAA-MM-JJ).';
const INVALID_DATE = 'Date invalide (format AAAA-MM-JJ ou date-heure ISO).';

class PageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La page doit être un entier.' })
  @Min(1, { message: 'La page commence à 1.' })
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La taille de page doit être un entier.' })
  @Min(1, { message: 'La taille de page doit être d’au moins 1.' })
  @Max(200, { message: 'La taille de page est limitée à 200.' })
  limit?: number;
}

/** Period: a day (`2026-11-05`, whole UTC day) or an ISO date-time. */
class PeriodQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString({}, { message: INVALID_DATE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Inclus.' })
  @IsOptional()
  @IsDateString({}, { message: INVALID_DATE })
  to?: string;
}

export class AuditEventsQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all', { message: 'Identifiant d’utilisateur invalide.' })
  actorUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all', { message: 'Identifiant de ferme invalide.' })
  farmId?: string;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction, { message: 'Type d’action inconnu.' })
  action?: AuditAction;

  @ApiPropertyOptional({
    description: 'La route contient ce texte',
    example: '/batches',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  route?: string;

  @ApiPropertyOptional({
    description:
      'Statut HTTP : un code (403), une classe (4xx) ou SUCCES (< 400) / ECHEC (≥ 400)',
    example: '4xx',
  })
  @IsOptional()
  @Matches(/^(\d{3}|[1-5]xx|SUCCES|ECHEC)$/i, {
    message:
      'Statut invalide (un code comme 403, une classe comme 4xx, SUCCES ou ECHEC).',
  })
  status?: string;

  @ApiPropertyOptional({ description: 'Identifiant de requête (X-Request-Id)' })
  @IsOptional()
  @IsUUID('all', { message: 'Identifiant de requête invalide.' })
  requestId?: string;
}

export class AuditRowChangesQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ example: 'production_batches' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  table?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  rowId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all', { message: 'Identifiant de requête invalide.' })
  requestId?: string;
}

export class AuditSealsQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Matches(DAY, { message: INVALID_DAY })
  @IsDateString({ strict: true }, { message: INVALID_DAY })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @Matches(DAY, { message: INVALID_DAY })
  @IsDateString({ strict: true }, { message: INVALID_DAY })
  to?: string;
}

/** Body of `POST /audit/seals/verify`: the days to check (all by default). */
export class VerifySealsDto extends AuditSealsQueryDto {}
