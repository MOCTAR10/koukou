import { ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MarketListingKind,
  MarketProduct,
} from '../../../common/enums/market.enum.js';
import { Species } from '../../../common/enums/species.enum.js';

export class CreateMarketListingDto {
  @IsEnum(MarketListingKind, { message: 'Type d’annonce invalide.' })
  kind: MarketListingKind;

  @IsEnum(MarketProduct, { message: 'Produit invalide.' })
  product: MarketProduct;

  @IsUUID('4', { message: 'Identifiant de lot invalide.' })
  batchId: string;

  @IsOptional()
  @IsString({ message: 'La description doit être une chaîne.' })
  @MaxLength(500, { message: 'La description est trop longue.' })
  description?: string;

  @IsInt({ message: 'Le prix unitaire doit être un entier.' })
  @Min(1, { message: 'Le prix unitaire doit être positif (FCFA).' })
  unitPriceFcfa: number;

  @IsInt({ message: 'La quantité publiée doit être un entier.' })
  @Min(1, { message: 'La quantité publiée doit être positive.' })
  quantityPublished: number;

  @IsOptional()
  @IsInt({ message: 'La quantité minimale doit être un entier.' })
  @Min(1, { message: 'La quantité minimale doit être positive.' })
  minOrderQty?: number;

  @IsOptional()
  @IsDateString({}, { message: 'La date doit être au format YYYY-MM-DD.' })
  readyDate?: string;

  @IsOptional()
  @IsInt({ message: 'L’acompte doit être un pourcentage entier.' })
  @Min(1, { message: 'L’acompte doit être compris entre 1 et 100 %.' })
  @Max(100, { message: 'L’acompte doit être compris entre 1 et 100 %.' })
  depositPct?: number;

  @IsOptional()
  @IsBoolean({ message: 'Le retrait doit être vrai ou faux.' })
  pickupAvailable?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'La livraison doit être vraie ou fausse.' })
  deliveryAvailable?: boolean;

  @IsOptional()
  @IsInt({ message: 'Les frais de livraison doivent être un entier.' })
  @Min(0, { message: 'Les frais de livraison ne peuvent pas être négatifs.' })
  deliveryFeeFcfa?: number;
}

/** What can change once created. Kind, product, batch and date need a new draft. */
export class UpdateMarketListingDto extends PartialType(
  PickType(CreateMarketListingDto, [
    'description',
    'unitPriceFcfa',
    'quantityPublished',
    'minOrderQty',
    'readyDate',
    'depositPct',
    'pickupAvailable',
    'deliveryAvailable',
    'deliveryFeeFcfa',
  ] as const),
) {}

export class ReadyDateSuggestionQueryDto {
  @IsUUID('4', { message: 'Identifiant de lot invalide.' })
  batchId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le poids visé doit être un nombre.' })
  @IsPositive({ message: 'Le poids visé doit être positif.' })
  targetWeightKg?: number;
}

export class MarketCatalogueQueryDto {
  @ApiPropertyOptional({ enum: MarketListingKind })
  @IsOptional()
  @IsEnum(MarketListingKind, { message: 'Type d’annonce invalide.' })
  kind?: MarketListingKind;

  @ApiPropertyOptional({ enum: MarketProduct })
  @IsOptional()
  @IsEnum(MarketProduct, { message: 'Produit invalide.' })
  product?: MarketProduct;

  @ApiPropertyOptional({ enum: Species })
  @IsOptional()
  @IsEnum(Species, { message: 'Espèce invalide.' })
  species?: Species;

  @IsOptional()
  @IsString({ message: 'La ville doit être une chaîne.' })
  @MaxLength(80, { message: 'Le nom de la ville est trop long.' })
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La limite doit être un entier.' })
  @Min(1, { message: 'La limite doit être positive.' })
  @Max(50, { message: 'La limite ne peut pas dépasser 50.' })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Le décalage doit être un entier.' })
  @Min(0, { message: 'Le décalage ne peut pas être négatif.' })
  offset?: number;
}
