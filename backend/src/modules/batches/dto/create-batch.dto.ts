import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { BatchType } from '../../../common/enums/batch-type.enum.js';
import { Species } from '../../../common/enums/species.enum.js';

export class CreateBatchDto {
  @ApiProperty({ description: 'Nom du bâtiment / lot', example: 'Bâtiment A' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du lot est obligatoire.' })
  batchName: string;

  @ApiProperty({
    description: 'Date d’arrivée des poussins',
    example: '2026-08-30',
  })
  @IsDateString()
  integrationDate: string;

  @ApiProperty({ description: 'Quantité de poussins au départ' })
  @IsInt()
  @Min(1, { message: 'La quantité de poussins doit être au moins 1.' })
  quantityAtStart: number;

  @ApiPropertyOptional({ description: 'Souche (id Breed)', example: 'uuid' })
  @IsOptional()
  @IsString()
  breedId?: string;

  @ApiProperty({
    enum: BatchType,
    description: "Type d'élevage (CHAIR ou PONDEUSE)",
  })
  @IsEnum(BatchType, { message: 'Le type doit être CHAIR ou PONDEUSE.' })
  type: BatchType;

  @ApiPropertyOptional({
    enum: Species,
    description: 'Espèce (gallinacé) du lot — défaut POULET',
    default: Species.POULET,
  })
  @IsOptional()
  @IsEnum(Species, {
    message:
      'L’espèce doit être une valeur valide (POULET, DINDE, PINTADE, CAILLE, AUTRE).',
  })
  species?: Species;

  @ApiPropertyOptional({
    description:
      'Espèce libre (texte) — obligatoire quand species = AUTRE. Ex : "Canard"',
  })
  @IsOptional()
  @IsString()
  customSpecies?: string;

  @ApiPropertyOptional({
    description:
      'Souche / race libre (texte) — quand species = AUTRE. Ex : "Coureur indien"',
  })
  @IsOptional()
  @IsString()
  customBreed?: string;

  @ApiPropertyOptional({
    description: 'Surface du bâtiment (m²) — pour le calcul de densité',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  buildingAreaM2?: number;

  @ApiPropertyOptional({
    description: "Poids d'un sac d'aliment (kg), défaut = celui de la ferme",
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  feedUnitSacKg?: number;

  @ApiPropertyOptional({
    description: 'Bâtiment (id Building) dans lequel le lot est installé',
  })
  @IsOptional()
  @IsString()
  buildingId?: string;

  @ApiPropertyOptional({
    description: 'Traçabilité HACCP — fournisseur du couvoir (poussins)',
  })
  @IsOptional()
  @IsString()
  couvoirSupplier?: string;

  @ApiPropertyOptional({
    description: 'Traçabilité HACCP — numéro de lot des poussins',
  })
  @IsOptional()
  @IsString()
  chickLotNumber?: string;

  @ApiPropertyOptional({ description: 'Traçabilité HACCP — date d’éclosion' })
  @IsOptional()
  @IsDateString()
  hatchDate?: string;

  @ApiPropertyOptional({
    description:
      'Prix d’achat unitaire du poussin en FCFA (enrichissement du compte de résultat du lot)',
  })
  @IsOptional()
  @IsInt({ message: 'Le prix du poussin doit être un entier (FCFA).' })
  @Min(0, { message: 'Le prix du poussin ne peut pas être négatif.' })
  chickUnitPriceFcfa?: number;

  @ApiPropertyOptional({
    description:
      'Doit être égal à quantityAtStart s’il est fourni (pour un lot déjà en cours, saisir l’effectif actuel comme effectif de départ)',
  })
  @IsOptional()
  @IsInt({ message: 'La quantité vivante doit être un entier.' })
  @Min(0, { message: 'La quantité vivante ne peut pas être négative.' })
  quantityAlive?: number;

  @ApiPropertyOptional({
    description:
      'Bande POUFA ouverte en cours de cycle (J+x) : âge des sujets à l’ouverture, en jours (fermes du programme uniquement)',
  })
  @IsOptional()
  @IsInt({
    message: 'L’âge à l’ouverture doit être un nombre entier de jours.',
  })
  @Min(0, { message: 'L’âge à l’ouverture ne peut pas être négatif.' })
  @Max(365, { message: 'L’âge à l’ouverture ne peut pas dépasser 365 jours.' })
  initialAgeDays?: number;

  @ApiPropertyOptional({
    description:
      'Bande POUFA : poids moyen des sujets à l’ouverture, en grammes (fermes du programme uniquement)',
  })
  @IsOptional()
  @IsNumber(
    {},
    { message: 'Le poids moyen à l’ouverture doit être un nombre.' },
  )
  @Min(1, { message: 'Le poids moyen à l’ouverture doit être positif.' })
  @Max(20_000, { message: 'Le poids moyen à l’ouverture est trop élevé.' })
  initialAvgWeightG?: number;
}
