import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DeclarationReviewStatus } from '../../../common/enums/declaration-review.enum.js';
import { HealthEventKind } from '../../../common/enums/health-event-kind.enum.js';
import {
  DECLARATION_REVIEW_STATES,
  REVIEW_COMMENT_MAX,
  type DeclarationReviewState,
} from '../declaration-review-rules.js';

/** POUFA lot A2 vet: the vets' register of declarations (CDC n° 26). */
export class ListSanitaryDeclarationsDto {
  @ApiPropertyOptional({ enum: DECLARATION_REVIEW_STATES })
  @IsOptional()
  @IsIn(DECLARATION_REVIEW_STATES, {
    message: `L'état doit être l'un de : ${DECLARATION_REVIEW_STATES.join(', ')}.`,
  })
  state?: DeclarationReviewState;

  @ApiPropertyOptional({ enum: HealthEventKind })
  @IsOptional()
  @IsEnum(HealthEventKind, { message: 'Type de déclaration inconnu.' })
  kind?: HealthEventKind;

  @ApiPropertyOptional({ description: 'Ferme' })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de ferme invalide.' })
  farmId?: string;

  @ApiPropertyOptional({ example: 'G1' })
  @IsOptional()
  @IsString({ message: 'Le code de province doit être un texte.' })
  @MaxLength(10, { message: 'Le code de province est trop long.' })
  provinceCode?: string;

  @ApiPropertyOptional({ description: 'Date de la déclaration, à partir de (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de début doit être au format AAAA-MM-JJ.' })
  from?: string;

  @ApiPropertyOptional({ description: 'Date de la déclaration, jusqu’au (AAAA-MM-JJ)' })
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

export class ReviewSanitaryDeclarationDto {
  @ApiProperty({
    enum: DeclarationReviewStatus,
    description:
      'VALIDEE (prise en compte), INFIRMEE (commentaire obligatoire) ou ALERTE (ouvre une alerte sanitaire officielle)',
  })
  @IsEnum(DeclarationReviewStatus, {
    message: 'La décision doit être VALIDEE, INFIRMEE ou ALERTE.',
  })
  decision: DeclarationReviewStatus;

  @ApiPropertyOptional({ description: 'Commentaire (obligatoire pour infirmer)' })
  @IsOptional()
  @IsString({ message: 'Le commentaire doit être un texte.' })
  @MaxLength(REVIEW_COMMENT_MAX, {
    message: `Le commentaire ne doit pas dépasser ${REVIEW_COMMENT_MAX} caractères.`,
  })
  comment?: string;
}
