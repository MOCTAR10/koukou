import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { FeedUnit, FoodType } from '../../../common/enums/food-type.enum.js';
import { FeedPhase } from '../../../common/enums/feed-phase.enum.js';
import { ConsumptionSource } from '../../../common/enums/consumption-source.enum.js';

export class CreateDailyEntryDto {
  @ApiProperty({ description: 'Date de la saisie', example: '2026-09-01' })
  @IsDateString()
  entryDate: string;

  @ApiPropertyOptional({ description: 'Nombre de morts du jour' })
  @IsOptional()
  @IsInt()
  @Min(0)
  deaths?: number;

  @ApiPropertyOptional({
    description: 'Aliments en SAC (ou équivalent)',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feedBags?: number;

  @ApiPropertyOptional({
    description: 'Aliments en quantité (unité choisie)',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feedQuantity?: number;

  @ApiPropertyOptional({
    enum: FeedUnit,
    description: "Unité d'aliment (SAC ou KG)",
  })
  @IsOptional()
  @IsEnum(FeedUnit, { message: "L'unité d'aliment doit être SAC ou KG." })
  feedUnit?: FeedUnit;

  @ApiPropertyOptional({ enum: FoodType, description: "Type d'aliment (ancien)" })
  @IsOptional()
  @IsEnum(FoodType)
  feedType?: FoodType;

  @ApiPropertyOptional({
    description: "Poids d'un sac en kg quand l'aliment est saisi en SAC",
    example: 25,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  bagSizeKg?: number;

  @ApiPropertyOptional({ enum: FeedPhase, description: "Phase d'aliment" })
  @IsOptional()
  @IsEnum(FeedPhase)
  feedPhase?: FeedPhase;

  @ApiPropertyOptional({ description: "Nom de la phase personnalisée" })
  @IsOptional()
  @IsString()
  customFeedPhaseName?: string;

  @ApiPropertyOptional({
    description:
      "Achat externe : la consommation d'aliment est enregistrée SANS décrémenter " +
      "le stock suivi (aucun lot de provende interne). Mutuellement exclusif avec inputLotId.",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  skipStockDeduction?: boolean;

  @ApiPropertyOptional({ description: 'Lot d\u2019intrant tracé (HACCP) lié' })
  @IsOptional()
  // '' means "no lot" (it reached the uuid query and failed with a 500).
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsUUID('all', { message: 'Identifiant de lot d’intrant invalide.' })
  inputLotId?: string;

  @ApiPropertyOptional({ description: 'Eau bue en litres (indicateur n°1)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  waterL?: number;

  @ApiPropertyOptional({ description: 'Poids moyen du lot (kg) — pesée hebdo' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  avgWeightKg?: number;

  @ApiPropertyOptional({ description: "Nombre d'œufs collectés" })
  @IsOptional()
  @IsInt()
  @Min(0)
  eggsCollected?: number;

  @ApiPropertyOptional({ description: 'Œufs commercialisables' })
  @IsOptional()
  @IsInt()
  @Min(0)
  eggsSellable?: number;

  @ApiPropertyOptional({ description: 'Œufs fêlés' })
  @IsOptional()
  @IsInt()
  @Min(0)
  eggsCracked?: number;

  @ApiPropertyOptional({ description: 'Petits œufs' })
  @IsOptional()
  @IsInt()
  @Min(0)
  eggsSmall?: number;

  @ApiPropertyOptional({ description: 'Œufs double jaune' })
  @IsOptional()
  @IsInt()
  @Min(0)
  eggsDoubleYolk?: number;

  @ApiPropertyOptional({ description: 'Œufs sales' })
  @IsOptional()
  @IsInt()
  @Min(0)
  eggsDirty?: number;

  @ApiPropertyOptional({
    enum: ConsumptionSource,
    description: 'Source de la saisie',
  })
  @IsOptional()
  @IsEnum(ConsumptionSource)
  source?: ConsumptionSource;

  @ApiPropertyOptional({
    description:
      'Pesée : nombre de sujets pesés pour le poids moyen (échantillon POUFA)',
  })
  @IsOptional()
  @IsInt({ message: 'Le nombre de sujets pesés doit être un entier.' })
  @Min(1, { message: 'Le nombre de sujets pesés doit être au moins 1.' })
  sampleSize?: number;

  // --- Offline synchronization (programme farms, backend/docs/poufa-conflits-hors-ligne.md)

  @ApiPropertyOptional({
    description: 'Hors ligne : heure de la saisie sur le téléphone (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  capturedAt?: string;

  @ApiPropertyOptional({
    description:
      'Hors ligne : `updatedAt` de la saisie connue du téléphone au moment de la saisie (absent pour une création)',
  })
  @IsOptional()
  @IsDateString()
  baseUpdatedAt?: string;

  @ApiPropertyOptional({
    description:
      'Hors ligne : valeurs connues du téléphone avant la modification (deaths, feedQuantity en kg, waterL, avgWeightKg, sampleSize, eggs*)',
  })
  @IsOptional()
  @IsObject()
  baseValues?: Record<string, number | null>;

  @ApiPropertyOptional({
    description:
      'Hors ligne : heure du téléphone au moment de l’envoi (mesure de l’écart d’horloge)',
  })
  @IsOptional()
  @IsDateString()
  deviceSentAt?: string;

  @ApiPropertyOptional({
    description: 'Hors ligne : identifiant de l’appareil',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceId?: string;
}
