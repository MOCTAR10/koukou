import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IdempotentDto } from '../../../common/utils/idempotency.js';

/**
 * Completion of a planned care (CDC §5.2 n° 22: date, vaccine, route, number
 * of animals). `idempotencyKey` (offline queue): replaying the same completion
 * returns the care instead of « déjà réalisé ».
 */
export class CompleteProphylaxisDto extends IdempotentDto {
  @ApiPropertyOptional({
    description: 'Date/heure d’exécution réelle (défaut : maintenant)',
  })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({
    description: 'Remarques terrain (lot du vaccin, réaction, etc.)',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Référence au lot d’intrant (médicament/vaccin)',
  })
  @IsOptional()
  @IsString()
  medicationLotId?: string;

  /**
   * Required for a new completion (checked in the service, after the replay
   * check: a completion already stored under the same key passes as is).
   */
  @ApiPropertyOptional({
    description:
      'Nombre d’animaux vaccinés ou traités (obligatoire pour une nouvelle réalisation)',
  })
  @IsOptional()
  @IsInt({ message: 'Le nombre d’animaux doit être un nombre entier.' })
  @Min(1, { message: 'Le nombre d’animaux doit être au moins 1.' })
  animalCount?: number;

  @ApiPropertyOptional({
    description:
      'Voie d’administration réellement utilisée (remplace celle prévue)',
  })
  @IsOptional()
  @IsString({ message: 'La voie d’administration doit être une chaîne.' })
  @MaxLength(120, { message: 'La voie d’administration est trop longue.' })
  route?: string;

  // POUFA lot A2 sante (CDC n° 23): treatment fields, read only when the care
  // has a withdrawal period (it then opens a treatment record).

  @ApiPropertyOptional({
    description:
      'Soin manuel avec délai d’attente : code du produit dans PRODUIT_TRAITEMENT (si non choisi à la planification)',
  })
  @IsOptional()
  @IsString({ message: 'Le code du produit doit être une chaîne.' })
  @MaxLength(60, { message: 'Le code du produit est trop long.' })
  productCode?: string;

  @ApiPropertyOptional({
    description:
      'Dernier jour du traitement (AAAA-MM-JJ) ; obligatoire pour un soin manuel avec délai d’attente',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La date de fin doit être une date valide.' })
  endDate?: string;

  @ApiPropertyOptional({
    description:
      'Motif du traitement ; obligatoire pour un soin manuel avec délai d’attente',
  })
  @IsOptional()
  @IsString({ message: 'Le motif doit être une chaîne.' })
  @MaxLength(500, { message: 'Le motif dépasse 500 caractères.' })
  reason?: string;
}
