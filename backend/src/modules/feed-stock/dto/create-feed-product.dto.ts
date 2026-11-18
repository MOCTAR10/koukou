import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FoodType } from '../../../common/enums/food-type.enum.js';
import { FeedEntryType } from '../../../common/enums/feed-entry-type.enum.js';
import { FeedPhase } from '../../../common/enums/feed-phase.enum.js';

export class CreateFeedProductDto {
  @ApiProperty({
    description: 'Nom du produit (unique par ferme)',
    example: 'Provende ponte CEAG 50',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du produit est obligatoire.' })
  name: string;

  @ApiPropertyOptional({ enum: FeedEntryType, description: "Type d'entrée (catalogue)", default: FeedEntryType.BAG })
  @IsOptional()
  @IsEnum(FeedEntryType)
  entryType?: FeedEntryType;

  @ApiPropertyOptional({ enum: FoodType, description: 'Phase / type d\u2019aliment (ancien)' })
  @IsOptional()
  @IsEnum(FoodType)
  foodType?: FoodType;

  @ApiPropertyOptional({ enum: FeedPhase, description: 'Phase d\u2019aliment' })
  @IsOptional()
  @IsEnum(FeedPhase)
  feedPhase?: FeedPhase;

  @ApiPropertyOptional({ description: 'Nom du type d\u2019aliment personnalisé' })
  @IsOptional()
  @IsString()
  customFeedPhaseName?: string;

  @ApiPropertyOptional({ description: 'Kg par sac par défaut', example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultSacKg?: number;

  @ApiPropertyOptional({ description: 'Taille du sac par défaut (kg)', example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  defaultBagSizeKg?: number;

  @ApiPropertyOptional({ description: 'Prix unitaire par défaut en FCFA (par sac à défaut)', example: 17000 })
  @IsOptional()
  @IsInt({ message: 'Le prix unitaire doit être un entier (FCFA).' })
  @Min(0, { message: 'Le prix unitaire ne peut pas être négatif.' })
  defaultUnitPriceFcfa?: number;

  @ApiPropertyOptional({ description: 'Prix par tonne métrique en FCFA (Bulker)', example: 450000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  defaultCostPerMtFcfa?: number;

  @ApiPropertyOptional({ description: 'Prix par sac en FCFA (Sac)', example: 18500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  defaultCostPerBagFcfa?: number;

  @ApiPropertyOptional({ description: 'Fournisseur habituel', example: 'CEAG' })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional({ description: 'Fabricant', example: 'CEAG' })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Le fabricant est limité à 120 caractères.' })
  manufacturer?: string;

  @ApiPropertyOptional({ description: 'Protéine brute annoncée (% de l’aliment)', example: 18 })
  @IsOptional()
  @IsNumber({}, { message: 'Le taux de protéine doit être un nombre.' })
  @Min(0, { message: 'Le taux de protéine ne peut pas être négatif.' })
  @Max(100, { message: 'Le taux de protéine ne peut pas dépasser 100 %.' })
  proteinPct?: number;

  @ApiPropertyOptional({ description: 'Énergie métabolisable annoncée (kcal/kg)' })
  @IsOptional()
  @IsNumber({}, { message: 'L’énergie doit être un nombre.' })
  @Min(0, { message: 'L’énergie ne peut pas être négative.' })
  energyKcalKg?: number;

  @ApiPropertyOptional({ description: 'Référence d’autorisation ou d’agrément du fabricant (texte libre)' })
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'La référence d’autorisation est limitée à 80 caractères.' })
  authorizedRef?: string;

  @ApiPropertyOptional({ description: 'Produit actif dans le catalogue', default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
