import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BiosecurityAnswer,
  BiosecurityClass,
  VisitType,
} from '../../../common/enums/visit.enum.js';

export class VisitAnswerDto {
  @ApiProperty({
    description: 'Code d’un critère de la liste CRITERE_BIOSECURITE',
    example: 'PEDILUVE',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le critère est obligatoire.' })
  @MaxLength(40)
  criterionCode: string;

  @ApiProperty({ enum: BiosecurityAnswer })
  @IsEnum(BiosecurityAnswer, {
    message: 'La réponse est CONFORME, NON_CONFORME ou NA.',
  })
  answer: BiosecurityAnswer;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Le commentaire est trop long (500 caractères).' })
  comment?: string;
}

export class CreateVisitDto {
  @ApiProperty({ example: '2026-11-10', description: 'Jour de la visite' })
  @IsDateString({}, { message: 'La date de visite est invalide.' })
  visitDate: string;

  @ApiProperty({ enum: VisitType })
  @IsEnum(VisitType, { message: 'Type de visite inconnu.' })
  type: VisitType;

  @ApiPropertyOptional({ description: 'Bande concernée (de la ferme)' })
  @IsOptional()
  @IsUUID('4', { message: 'La bande est invalide.' })
  batchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000, { message: 'Les observations sont trop longues.' })
  observations?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000, { message: 'Les recommandations sont trop longues.' })
  recommendations?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'La latitude est invalide.' })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'La longitude est invalide.' })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ description: 'Date de la prochaine visite' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de prochaine visite est invalide.' })
  nextVisitDate?: string;

  @ApiPropertyOptional({
    description:
      'Visa de l’agent (CDC §3.2) : début de la période des saisies de la bande vérifiées sur place',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Le début de la période visée est invalide.' })
  visaFrom?: string;

  @ApiPropertyOptional({ description: 'Visa : fin de la période vérifiée' })
  @IsOptional()
  @IsDateString({}, { message: 'La fin de la période visée est invalide.' })
  visaTo?: string;

  @ApiPropertyOptional({
    type: [VisitAnswerDto],
    description: 'Grille de biosécurité (critères évalués)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'Trop de critères (100 au plus).' })
  @ValidateNested({ each: true })
  @Type(() => VisitAnswerDto)
  answers?: VisitAnswerDto[];

  @ApiPropertyOptional({ description: 'Heure du téléphone à la saisie (ISO)' })
  @IsOptional()
  @IsDateString({}, { message: 'L’heure de saisie est invalide.' })
  capturedAt?: string;

  @ApiPropertyOptional({
    description: 'Clé de rejeu hors ligne (unique par ferme)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'La clé de rejeu est trop longue.' })
  idempotencyKey?: string;
}

export class ListProgrammeVisitsQueryDto {
  @ApiPropertyOptional({ description: 'Code province' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ enum: BiosecurityClass })
  @IsOptional()
  @IsEnum(BiosecurityClass, { message: 'Classe inconnue (A, B ou C).' })
  classification?: BiosecurityClass;

  @ApiPropertyOptional({ enum: VisitType })
  @IsOptional()
  @IsEnum(VisitType, { message: 'Type de visite inconnu.' })
  type?: VisitType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  farmId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
