import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { FeedUnit, FoodType } from '../../../common/enums/food-type.enum.js';
import { FeedEntryType } from '../../../common/enums/feed-entry-type.enum.js';
import { FeedPhase } from '../../../common/enums/feed-phase.enum.js';
import { InputKind } from '../../../common/enums/input-kind.enum.js';
import { IdempotentDto } from '../../../common/utils/idempotency.js';

export class CreateInputLotDto extends IdempotentDto {
  @ApiPropertyOptional({ description: 'Lot de production lié (optionnel)' })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiProperty({ enum: InputKind, description: "Type d'intrant" })
  @IsEnum(InputKind, { message: "Type d'intrant invalide." })
  kind: InputKind;

  @ApiPropertyOptional({ enum: FoodType, description: 'Type d\u2019aliment (ancien — pour compat)' })
  @IsOptional()
  @IsEnum(FoodType)
  foodType?: FoodType;

  @ApiPropertyOptional({
    description: 'Produit du catalogue provende (définit foodType et le prix unitaire par défaut)',
  })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ description: 'Nom du produit', example: 'Provende Démarrage' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du produit est obligatoire.' })
  productName: string;

  @ApiProperty({ description: 'Fournisseur', example: 'CEAG' })
  @IsString()
  @IsNotEmpty({ message: 'Le fournisseur est obligatoire.' })
  supplier: string;

  @ApiProperty({ description: 'Numéro de lot fournisseur (exigence HACCP)' })
  @IsString()
  @IsNotEmpty({
    message: 'Le numéro de lot fournisseur est obligatoire (HACCP).',
  })
  supplierLotNumber: string;

  @ApiPropertyOptional({ description: 'Date de péremption' })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @ApiPropertyOptional({ description: 'Date de réception' })
  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @ApiPropertyOptional({
    description: 'Quantité reçue (kg ou dose — optionnelle, recalculée côté service selon le type d\u2019entrée)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Prix d\u2019achat unitaire en FCFA (permet le renseignement du coût de revient — enrichissement P&L)',
  })
  @IsOptional()
  @IsInt({ message: 'Le prix unitaire doit être un entier (FCFA).' })
  @Min(0, { message: 'Le prix unitaire ne peut pas être négatif.' })
  unitPriceFcfa?: number;

  @ApiPropertyOptional({ enum: FeedUnit, description: 'Unité (SAC ou KG)' })
  @IsOptional()
  @IsEnum(FeedUnit)
  unit?: FeedUnit;

  @ApiPropertyOptional({ enum: FeedEntryType, description: "Type d'entrée provende", default: FeedEntryType.BAG })
  @IsOptional()
  @IsEnum(FeedEntryType)
  entryType?: FeedEntryType;

  @ApiPropertyOptional({ enum: FeedPhase, description: 'Phase d\u2019aliment (Bulker/Sac)' })
  @IsOptional()
  @IsEnum(FeedPhase)
  feedPhase?: FeedPhase;

  @ApiPropertyOptional({ description: 'Nom du type d\u2019aliment personnalisé' })
  @IsOptional()
  @IsString()
  customFeedPhaseName?: string;

  @ApiPropertyOptional({ description: 'Taille du sac en kg (10, 25, 40, 50)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  bagSizeKg?: number;

  @ApiPropertyOptional({ description: 'Nombre de sacs' })
  @IsOptional()
  @IsInt()
  @Min(0)
  numberOfBags?: number;

  @ApiPropertyOptional({ description: 'Tonnage en MT (Bulker, Matière première, optionnel pour Sac)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tonnageMt?: number;

  @ApiPropertyOptional({ description: 'Prix par tonne métrique en FCFA (Bulker)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  costPerMtFcfa?: number;

  @ApiPropertyOptional({ description: 'Coût total en FCFA (Matière première)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalCostFcfa?: number;

  @ApiPropertyOptional({ description: 'Quantité de dose (Médicament)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  doseQuantity?: number;

  @ApiPropertyOptional({ description: 'Unité de dose (ex. g/kg, ml/L)' })
  @IsOptional()
  @IsString()
  doseUnit?: string;

  @ApiPropertyOptional({ description: 'Nom de l\u2019additif (Médicament)' })
  @IsOptional()
  @IsString()
  additiveName?: string;

  @ApiPropertyOptional({ description: 'Remarques (Médicament)' })
  @IsOptional()
  @IsString()
  notes?: string;
}
