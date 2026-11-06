import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FeedPhase } from '../../../common/enums/feed-phase.enum.js';
import {
  InputDeliverySource,
  InputDeliveryStatus,
} from '../../../common/enums/input-delivery.enum.js';

export class CreateInputDeliveryLineDto {
  @ApiProperty({
    description: 'Intrant : code d’un élément actif de la liste INTRANT',
    example: 'ALIMENT_DEMARRAGE',
  })
  @IsString()
  @IsNotEmpty({ message: 'L’intrant est obligatoire.' })
  @MaxLength(40)
  intrantCode: string;

  @ApiProperty({
    description: 'Unité : code d’un élément actif de la liste UNITE',
    example: 'SAC',
  })
  @IsString()
  @IsNotEmpty({ message: 'L’unité est obligatoire.' })
  @MaxLength(40)
  unitCode: string;

  @ApiProperty({ description: 'Quantité expédiée (dans l’unité)' })
  @IsNumber({}, { message: 'La quantité doit être un nombre.' })
  @Min(0.001, { message: 'La quantité expédiée doit être positive.' })
  quantity: number;

  @ApiPropertyOptional({
    enum: FeedPhase,
    description:
      'Aliment : phase (stock FEFO par phase). Par défaut `meta.feedPhase` de l’intrant.',
  })
  @IsOptional()
  @IsEnum(FeedPhase, { message: 'Phase d’aliment inconnue.' })
  feedPhase?: FeedPhase;

  @ApiPropertyOptional({
    description: 'Poids d’un sac (kg) quand l’unité est un sac',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Le poids du sac doit être un nombre.' })
  @Min(0.1, { message: 'Le poids du sac doit être positif.' })
  @Max(1000)
  bagSizeKg?: number;

  @ApiPropertyOptional({ description: 'Intrant subventionné', default: false })
  @IsOptional()
  @IsBoolean({ message: 'subsidized doit être vrai ou faux.' })
  subsidized?: boolean;

  @ApiPropertyOptional({
    description: 'Taux de subvention en % (obligatoire si subventionné)',
    example: 70,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Le taux de subvention doit être un nombre.' })
  @Min(0.01, { message: 'Le taux de subvention doit être positif.' })
  @Max(100, { message: 'Le taux de subvention ne dépasse pas 100 %.' })
  subsidyRate?: number;

  @ApiPropertyOptional({
    description: 'Valeur d’une unité avant subvention (FCFA entiers)',
  })
  @IsOptional()
  @IsInt({ message: 'La valeur unitaire doit être un entier (FCFA).' })
  @Min(0, { message: 'La valeur unitaire ne peut pas être négative.' })
  unitValueFcfa?: number;

  @ApiPropertyOptional({ description: 'Numéro de lot du fournisseur (HACCP)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierLotNumber?: string;

  @ApiPropertyOptional({ description: 'Date de péremption (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString({}, { message: 'Date de péremption invalide.' })
  expirationDate?: string;
}

export class CreateInputDeliveryDto {
  @ApiProperty({ description: 'Ferme destinataire (dans votre périmètre)' })
  @IsUUID('4', { message: 'Ferme invalide.' })
  farmId: string;

  @ApiPropertyOptional({ description: 'Bande destinataire (optionnelle)' })
  @IsOptional()
  @IsUUID('4', { message: 'Bande invalide.' })
  bandId?: string;

  @ApiProperty({ enum: InputDeliverySource, example: 'ETAT_SMAG' })
  @IsEnum(InputDeliverySource, {
    message: 'Source inconnue (ETAT_SMAG ou AUTRE).',
  })
  source: InputDeliverySource;

  @ApiPropertyOptional({
    description: 'Fournisseur (obligatoire pour la source AUTRE)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  supplierName?: string;

  @ApiProperty({ description: 'Date d’expédition', example: '2026-11-05' })
  @IsDateString({}, { message: 'Date d’expédition invalide.' })
  shippedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ type: [CreateInputDeliveryLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Une livraison compte au moins une ligne.' })
  @ArrayMaxSize(50, { message: 'Au plus 50 lignes par livraison.' })
  @ValidateNested({ each: true })
  @Type(() => CreateInputDeliveryLineDto)
  lines: CreateInputDeliveryLineDto[];
}

export class ConfirmInputDeliveryLineDto {
  @ApiProperty({ description: 'Ligne de la livraison' })
  @IsUUID('4', { message: 'Ligne invalide.' })
  lineId: string;

  @ApiProperty({ description: 'Quantité réellement reçue (dans l’unité)' })
  @IsNumber({}, { message: 'La quantité reçue doit être un nombre.' })
  @Min(0, { message: 'La quantité reçue ne peut pas être négative.' })
  receivedQuantity: number;

  @ApiPropertyOptional({
    description: 'Motif de l’écart (obligatoire si reçu ≠ expédié)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  discrepancyReason?: string;

  @ApiPropertyOptional({ description: 'Numéro de lot lu sur l’emballage' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierLotNumber?: string;

  @ApiPropertyOptional({ description: 'Date de péremption lue (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString({}, { message: 'Date de péremption invalide.' })
  expirationDate?: string;
}

export class ConfirmInputDeliveryDto {
  @ApiPropertyOptional({
    description: 'Date de réception (défaut : aujourd’hui)',
    example: '2026-11-06',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Date de réception invalide.' })
  receivedDate?: string;

  @ApiPropertyOptional({
    type: [ConfirmInputDeliveryLineDto],
    description: 'Lignes reçues ; une ligne omise est reçue comme expédiée',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ConfirmInputDeliveryLineDto)
  lines?: ConfirmInputDeliveryLineDto[];

  @ApiPropertyOptional({
    description: 'Hors ligne : clé d’idempotence (identifiant de l’opération)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}

export class CancelInputDeliveryDto {
  @ApiProperty({ description: 'Motif de l’annulation' })
  @IsString()
  @MinLength(3, { message: 'Le motif de l’annulation est obligatoire.' })
  @MaxLength(1000)
  reason: string;
}

export class AttachBandDto {
  @ApiProperty({ description: 'Bande de la ferme à rattacher' })
  @IsUUID('4', { message: 'Bande invalide.' })
  bandId: string;
}

export class ListInputDeliveriesQueryDto {
  @ApiPropertyOptional({ example: 'G1', description: 'Code de province' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  province?: string;

  @ApiPropertyOptional({ enum: InputDeliveryStatus })
  @IsOptional()
  @IsIn(Object.values(InputDeliveryStatus), { message: 'Statut inconnu.' })
  status?: InputDeliveryStatus;

  @ApiPropertyOptional({ description: 'Ferme' })
  @IsOptional()
  @IsUUID('4', { message: 'Ferme invalide.' })
  farmId?: string;

  @ApiPropertyOptional({ description: 'Expédiées à partir du (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString({}, { message: 'Date de début invalide.' })
  from?: string;

  @ApiPropertyOptional({ description: 'Expédiées jusqu’au (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString({}, { message: 'Date de fin invalide.' })
  to?: string;

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

export class FarmInputDeliveriesQueryDto {
  @ApiPropertyOptional({ enum: InputDeliveryStatus })
  @IsOptional()
  @IsIn(Object.values(InputDeliveryStatus), { message: 'Statut inconnu.' })
  status?: InputDeliveryStatus;
}
