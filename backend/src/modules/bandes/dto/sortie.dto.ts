import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { SlaughterDestination } from '../../../common/enums/slaughter-destination.enum.js';
import { SlaughterType } from '../../../common/enums/slaughter-type.enum.js';
import type { SortiePriceUnit } from '../entities/sortie.entity.js';

export class CreateSortieDto {
  @ApiProperty({ description: 'Date de la sortie', example: '2026-11-05' })
  @IsDateString({}, { message: 'Date de sortie invalide.' })
  sortieDate: string;

  @ApiProperty({ description: 'Nombre de sujets sortis' })
  @IsInt({ message: 'Le nombre de sujets doit être un entier.' })
  @Min(1, { message: 'Le nombre de sujets doit être au moins 1.' })
  count: number;

  @ApiPropertyOptional({ description: 'Poids vif total des sujets sortis (kg)' })
  @IsOptional()
  @IsNumber({}, { message: 'Le poids doit être un nombre.' })
  @Min(0.001, { message: 'Le poids doit être positif.' })
  weightKg?: number;

  @ApiProperty({
    description: 'Motif : code d’un élément de la liste MOTIF_SORTIE',
    example: 'VENTE_VIF',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le motif de sortie est obligatoire.' })
  @MaxLength(40)
  reasonCode: string;

  @ApiPropertyOptional({ description: 'Destinataire (nom)' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  recipientName?: string;

  @ApiPropertyOptional({ description: 'Destinataire (téléphone)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  recipientPhone?: string;

  @ApiPropertyOptional({
    description:
      'Opérateur du programme destinataire (cession, traçabilité — lot L7)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant d’opérateur invalide.' })
  operatorId?: string;

  @ApiPropertyOptional({
    description: 'Vente : prix unitaire en FCFA (par tête ou par kg)',
  })
  @IsOptional()
  @IsInt({ message: 'Le prix doit être un entier (FCFA).' })
  @Min(0, { message: 'Le prix ne peut pas être négatif.' })
  unitPriceFcfa?: number;

  @ApiPropertyOptional({
    enum: ['TETE', 'KG'],
    description: 'Vente : prix par tête (défaut) ou par kg',
  })
  @IsOptional()
  @IsIn(['TETE', 'KG'], { message: 'Unité de prix : TETE ou KG.' })
  priceUnit?: SortiePriceUnit;

  @ApiPropertyOptional({
    enum: SlaughterType,
    description: 'Abattoir : type d’abattage (défaut ABATTU)',
  })
  @IsOptional()
  @IsIn(Object.values(SlaughterType))
  slaughterType?: SlaughterType;

  @ApiPropertyOptional({
    enum: SlaughterDestination,
    description: 'Abattoir : destination (défaut EXTERNE)',
  })
  @IsOptional()
  @IsIn(Object.values(SlaughterDestination))
  destination?: SlaughterDestination;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Hors ligne : clé d’idempotence (identifiant de l’opération)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Hors ligne : heure de la saisie' })
  @IsOptional()
  @IsDateString()
  capturedAt?: string;

  @ApiPropertyOptional({
    description: 'Hors ligne : heure du téléphone à l’envoi',
  })
  @IsOptional()
  @IsDateString()
  deviceSentAt?: string;

  @ApiPropertyOptional({ description: 'Hors ligne : identifiant de l’appareil' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceId?: string;
}

export class CorrectClosedBandeDto {
  @ApiProperty({ description: 'Jour corrigé', example: '2026-11-01' })
  @IsDateString({}, { message: 'Date invalide.' })
  entryDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  deaths?: number;

  @ApiPropertyOptional({ description: 'Aliment consommé (kg)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feedQuantityKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  waterL?: number;

  @ApiPropertyOptional({ description: 'Poids moyen (kg)' })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  avgWeightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  sampleSize?: number;

  @ApiProperty({ description: 'Motif de la correction (obligatoire)' })
  @IsString()
  @IsNotEmpty({ message: 'Le motif de la correction est obligatoire.' })
  @MaxLength(1000)
  reason: string;
}
