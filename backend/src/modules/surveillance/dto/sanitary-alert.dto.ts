import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SanitaryAlertOrigin } from '../../../common/enums/sanitary-alert.enum.js';
import { ALERT_FAMILY } from '../sanitary-alert-rules.js';

const FAMILIES = Object.values(ALERT_FAMILY);

export class ListSanitaryAlertsDto {
  @ApiPropertyOptional({ enum: FAMILIES })
  @IsOptional()
  @IsIn(FAMILIES, {
    message: `La famille de statut doit être l'une de : ${FAMILIES.join(', ')}.`,
  })
  statusFamily?: string;

  @ApiPropertyOptional({ description: 'Code d’un statut STATUT_ALERTE' })
  @IsOptional()
  @IsString({ message: 'Le statut doit être un code.' })
  @MaxLength(40, { message: 'Le code de statut est trop long.' })
  statusCode?: string;

  @ApiPropertyOptional({ enum: SanitaryAlertOrigin })
  @IsOptional()
  @IsEnum(SanitaryAlertOrigin, {
    message: "L'origine doit être MORTALITE ou DECLARATION.",
  })
  origin?: SanitaryAlertOrigin;

  @ApiPropertyOptional({ description: 'Ferme (liste du programme seulement)' })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de ferme invalide.' })
  farmId?: string;

  @ApiPropertyOptional({ example: 'G1' })
  @IsOptional()
  @IsString({ message: 'Le code de province doit être un texte.' })
  @MaxLength(10, { message: 'Le code de province est trop long.' })
  provinceCode?: string;

  @ApiPropertyOptional({ description: 'true = publiées, false = non publiées' })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'published doit valoir true ou false.' })
  published?: boolean;

  @ApiPropertyOptional({ description: 'Jour du fait, à partir de (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de début doit être au format AAAA-MM-JJ.' })
  from?: string;

  @ApiPropertyOptional({ description: 'Jour du fait, jusqu’au (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de fin doit être au format AAAA-MM-JJ.' })
  to?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit doit être un entier.' })
  @Min(1, { message: 'limit doit valoir au moins 1.' })
  @Max(200, { message: 'limit vaut au plus 200.' })
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'offset doit être un entier.' })
  @Min(0, { message: 'offset ne peut pas être négatif.' })
  offset?: number;
}

export class TransitionSanitaryAlertDto {
  @ApiProperty({
    description: 'Code du statut visé (liste STATUT_ALERTE)',
    example: 'EN_ANALYSE',
  })
  @Matches(/^[A-Z0-9_]{1,40}$/, {
    message: 'Le statut doit être un code de la liste STATUT_ALERTE.',
  })
  statusCode: string;

  @ApiPropertyOptional({
    description: 'Commentaire (obligatoire pour confirmer ou infirmer)',
  })
  @IsOptional()
  @IsString({ message: 'Le commentaire doit être un texte.' })
  @MaxLength(2000, {
    message: 'Le commentaire ne doit pas dépasser 2000 caractères.',
  })
  comment?: string;
}

export class PublishSanitaryAlertDto {
  @ApiPropertyOptional({ description: 'Commentaire de publication' })
  @IsOptional()
  @IsString({ message: 'Le commentaire doit être un texte.' })
  @MaxLength(2000, {
    message: 'Le commentaire ne doit pas dépasser 2000 caractères.',
  })
  comment?: string;
}
