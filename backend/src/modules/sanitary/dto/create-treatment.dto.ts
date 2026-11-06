import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { CareType } from '../../../common/enums/care-type.enum.js';
import { IdempotentDto } from '../../../common/utils/idempotency.js';

/**
 * Treatment register entry (CDC §5.2 n° 23): start and end days, product,
 * reason, animals. `idempotencyKey` (offline queue): a replay returns the
 * record already stored.
 */
export class CreateTreatmentDto extends IdempotentDto {
  @ApiProperty({
    enum: CareType,
    description: 'Type de soin (ANTIBIOTIQUE, VACCIN…)',
  })
  @IsEnum(CareType, { message: 'Le type de soin doit être une valeur valide.' })
  careType: CareType;

  @ApiPropertyOptional({
    description:
      'Code du produit dans la liste PRODUIT_TRAITEMENT (obligatoire dès que la liste a un élément actif)',
  })
  @IsOptional()
  @IsString({ message: 'Le code du produit doit être une chaîne.' })
  @MaxLength(60, { message: 'Le code du produit est trop long.' })
  productCode?: string;

  @ApiPropertyOptional({
    description:
      'Étape d’un programme sanitaire déjà réalisée (bande ouverte en cours) : le produit est celui de l’étape, hors liste PRODUIT_TRAITEMENT',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant d’étape de programme invalide.' })
  protocolStepId?: string;

  @ApiPropertyOptional({
    description:
      'Nom du produit en texte libre, accepté seulement tant que la liste PRODUIT_TRAITEMENT est vide',
  })
  @IsOptional()
  @IsString({ message: 'Le nom du produit doit être une chaîne.' })
  productName?: string;

  @ApiPropertyOptional({ description: 'Dosage (ex : 1 g/L d’eau)' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({
    description: 'Voie d’administration (eau de boisson, SC, IM)',
  })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({
    description: 'Date/heure d’administration (défaut : maintenant)',
  })
  @IsOptional()
  @IsDateString()
  administeredAt?: string;

  @ApiPropertyOptional({
    description:
      'Dernier jour du traitement (AAAA-MM-JJ). Le délai d’attente court à partir de ce jour.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La date de fin doit être une date valide.' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Motif du traitement' })
  @IsOptional()
  @IsString({ message: 'Le motif doit être une chaîne.' })
  @MaxLength(500, { message: 'Le motif dépasse 500 caractères.' })
  reason?: string;

  @ApiPropertyOptional({ description: 'Nombre d’animaux traités' })
  @IsOptional()
  @IsInt({ message: 'Le nombre d’animaux doit être un nombre entier.' })
  @Min(1, { message: 'Le nombre d’animaux doit être au moins 1.' })
  animalCount?: number;

  @ApiPropertyOptional({
    description:
      "Délai d'attente (jours) avant commercialisation — tracé HACCP",
    default: 0,
  })
  @IsOptional()
  @IsInt({ message: 'Le délai d’attente doit être un nombre entier de jours.' })
  @Min(0)
  withdrawalDays?: number;

  @ApiPropertyOptional({
    description: 'Référence au lot d’intrant (médicament)',
  })
  @IsOptional()
  @IsString()
  medicationLotId?: string;

  @ApiPropertyOptional({
    description: 'Remarques (vétérinaire, observation, etc.)',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
