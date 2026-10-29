import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ArrayNotEmpty,
  ArrayUnique,
} from 'class-validator';
import { CareType } from '../../../common/enums/care-type.enum.js';

export class CreateManualScheduleDto {
  @ApiProperty({ type: [String], description: 'Lots concernés (un ou plusieurs)' })
  @IsArray({ message: 'Sélectionnez au moins un lot.' })
  @ArrayNotEmpty({ message: 'Sélectionnez au moins un lot.' })
  @IsUUID('all', { each: true, message: 'Identifiant de lot invalide.' })
  @ArrayUnique({ message: 'Un lot ne doit apparaître qu’une seule fois.' })
  lotIds: string[];

  @ApiProperty({ description: 'Vaccin ou médicament uniquement' })
  @IsEnum(CareType, { message: 'Type de soin invalide.' })
  careType: CareType;

  @ApiProperty({ description: 'Intitulé du soin' })
  @IsString({ message: 'Intitulé du soin requis.' })
  @MaxLength(160, { message: 'Intitulé limité à 160 caractères.' })
  name: string;

  @ApiProperty({
    description: 'Date planifiée (YYYY-MM-DD, UTC)',
    example: '2026-09-12',
  })
  @IsISO8601({ strict: true }, { message: 'Date invalide (format YYYY-MM-DD).' })
  scheduledDate: string;

  @ApiPropertyOptional({ description: 'Voie d’administration' })
  @IsOptional()
  @IsString({ message: 'Voie d’administration invalide.' })
  route?: string;

  @ApiPropertyOptional({ description: 'Dosage (optionnel)' })
  @IsOptional()
  @IsString({ message: 'Dosage invalide.' })
  dosage?: string;

  @ApiPropertyOptional({ description: 'Notes (optionnel)' })
  @IsOptional()
  @IsString({ message: 'Notes invalides.' })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Délai d’attente HACCP en jours (0 par défaut)',
  })
  @IsOptional()
  @IsInt({ message: 'Délai d’attente en jours entiers.' })
  @Min(0, { message: 'Délai d’attente positif ou nul.' })
  withdrawalDays?: number;

  @ApiPropertyOptional({
    description:
      'Sortir le médicament du stock (seulement pour MEDICAMENT ; jamais de quantité négative)',
  })
  @IsOptional()
  @IsBoolean({ message: 'Valeur booléenne attendue.' })
  decrementStock?: boolean;

  @ApiPropertyOptional({
    description: 'Lot d’intrant (médicament) du stock à décrémenter',
  })
  @IsOptional()
  @IsString({ message: 'Lot d’intrant invalide.' })
  medicationLotId?: string;

  @ApiPropertyOptional({
    description: 'Quantité (dose) à sortir du stock — requise si « Sortir du stock »',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Quantité de médicament invalide.' })
  @Min(0.001, { message: 'Quantité de médicament positive.' })
  medicationQty?: number;

  @ApiPropertyOptional({ description: 'Unité de la quantité (ex. dose, flacon, L)' })
  @IsOptional()
  @IsString({ message: 'Unité invalide.' })
  medicationUnit?: string;
}