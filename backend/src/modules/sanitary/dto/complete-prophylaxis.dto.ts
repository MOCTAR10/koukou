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

  @ApiPropertyOptional({ description: 'Nombre d’animaux vaccinés ou traités' })
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
}
