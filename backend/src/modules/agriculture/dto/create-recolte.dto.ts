import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { RecolteUnit } from '../../../common/enums/recolte-unit.enum.js';

export class CreateRecolteDto {
  @ApiProperty({ description: 'Parcelle récoltée' })
  @IsUUID('4', { message: 'La parcelle doit être un UUID valide.' })
  parcelleId: string;

  @ApiPropertyOptional({ description: 'Date de récolte (défaut : aujourd’hui)' })
  @IsOptional()
  @IsDateString()
  harvestDate?: string;

  @ApiProperty({ description: 'Quantité récoltée' })
  @IsNumber()
  @Min(0.001, { message: 'La quantité récoltée doit être positive.' })
  quantity: number;

  @ApiProperty({ enum: RecolteUnit, description: 'Unité de la quantité' })
  @IsEnum(RecolteUnit, { message: 'L’unité doit être KG, PIECE ou SAC.' })
  unit: RecolteUnit;

  @ApiPropertyOptional({ description: 'Notes libres' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Les notes ne peuvent pas être vides.' })
  notes?: string;
}