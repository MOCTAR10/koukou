import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsInt, IsOptional, Min } from 'class-validator';
import { CompleteProphylaxisDto } from '../../sanitary/dto/complete-prophylaxis.dto.js';

/**
 * Completion of a generated task. A vaccination task takes exactly the fields
 * of the care completion (`CompleteProphylaxisDto`: animalCount, route,
 * medicationLotId, productCode, endDate, reason, completedAt, notes), a
 * weighing task those of the weighing below. `idempotencyKey` (offline queue)
 * makes a replay answer the task as it is.
 */
export class CompleteTaskDto extends CompleteProphylaxisDto {
  @ApiPropertyOptional({
    description: 'Pesée : poids moyen du lot (kg)',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Le poids moyen doit être un nombre.' })
  @Min(0.001, { message: 'Le poids moyen doit être positif.' })
  avgWeightKg?: number;

  @ApiPropertyOptional({ description: 'Pesée : nombre de sujets pesés' })
  @IsOptional()
  @IsInt({ message: 'L’échantillon doit être un nombre entier.' })
  @Min(1, { message: 'L’échantillon doit être au moins 1.' })
  sampleSize?: number;

  @ApiPropertyOptional({
    description: 'Pesée : jour de la pesée (AAAA-MM-JJ, défaut : aujourd’hui)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La date de la pesée doit être une date valide.' })
  entryDate?: string;
}
