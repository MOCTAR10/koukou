import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { BatchType } from '../../../common/enums/batch-type.enum.js';
import { FeedPhase } from '../../../common/enums/feed-phase.enum.js';
import { ItineraryCategory } from '../../../common/enums/itinerary-category.enum.js';
import { Species } from '../../../common/enums/species.enum.js';

export class ItineraryQueryDto {
  @IsOptional()
  @IsEnum(Species, { message: 'Espèce invalide.' })
  species?: Species;

  @IsOptional()
  @IsEnum(BatchType, { message: 'Type de production invalide (CHAIR ou PONDEUSE).' })
  type?: BatchType;

  /** `true`: deactivated steps included (profiles managing the itinerary). */
  @IsOptional()
  @IsString()
  all?: string;
}

export class CreateItineraryStepDto {
  @IsEnum(Species, { message: 'Espèce invalide.' })
  species: Species;

  @IsEnum(BatchType, { message: 'Type de production invalide (CHAIR ou PONDEUSE).' })
  productionType: BatchType;

  @IsInt({ message: 'L’âge de début doit être un nombre entier de jours.' })
  @Min(0, { message: 'L’âge de début ne peut pas être négatif.' })
  dayFrom: number;

  /** Null or omitted = until the end of the band. */
  @IsOptional()
  @IsInt({ message: 'L’âge de fin doit être un nombre entier de jours.' })
  @Min(0, { message: 'L’âge de fin ne peut pas être négatif.' })
  dayTo?: number | null;

  @IsOptional()
  @IsEnum(FeedPhase, { message: 'Phase alimentaire invalide.' })
  feedPhase?: FeedPhase | null;

  @IsString()
  @IsNotEmpty({ message: 'Le titre est obligatoire.' })
  @MaxLength(160, { message: 'Le titre est limité à 160 caractères.' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Les consignes sont obligatoires.' })
  @MaxLength(2000, { message: 'Les consignes sont limitées à 2000 caractères.' })
  instructions: string;

  @IsEnum(ItineraryCategory, { message: 'Catégorie invalide.' })
  category: ItineraryCategory;

  /** Code of a TEXTE_REFERENCE list item. */
  @IsOptional()
  @IsString()
  @MaxLength(40, { message: 'La référence légale est limitée à 40 caractères.' })
  legalRef?: string | null;

  @IsOptional()
  @IsInt({ message: 'L’ordre doit être un nombre entier.' })
  sort?: number;
}

/** Species and production type never change: deactivate and create anew. */
export class UpdateItineraryStepDto {
  @IsOptional()
  @IsInt({ message: 'L’âge de début doit être un nombre entier de jours.' })
  @Min(0, { message: 'L’âge de début ne peut pas être négatif.' })
  dayFrom?: number;

  @IsOptional()
  @IsInt({ message: 'L’âge de fin doit être un nombre entier de jours.' })
  @Min(0, { message: 'L’âge de fin ne peut pas être négatif.' })
  dayTo?: number | null;

  @IsOptional()
  @IsEnum(FeedPhase, { message: 'Phase alimentaire invalide.' })
  feedPhase?: FeedPhase | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le titre est obligatoire.' })
  @MaxLength(160, { message: 'Le titre est limité à 160 caractères.' })
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Les consignes sont obligatoires.' })
  @MaxLength(2000, { message: 'Les consignes sont limitées à 2000 caractères.' })
  instructions?: string;

  @IsOptional()
  @IsEnum(ItineraryCategory, { message: 'Catégorie invalide.' })
  category?: ItineraryCategory;

  @IsOptional()
  @IsString()
  @MaxLength(40, { message: 'La référence légale est limitée à 40 caractères.' })
  legalRef?: string | null;

  @IsOptional()
  @IsInt({ message: 'L’ordre doit être un nombre entier.' })
  sort?: number;

  @IsOptional()
  @IsBoolean({ message: 'active doit être un booléen.' })
  active?: boolean;
}
