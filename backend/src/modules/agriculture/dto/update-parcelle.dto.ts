import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import type { GeoJsonGeometry } from '../../../common/geo/geo-geometry.js';
import { ParcelleStatus } from '../../../common/enums/parcelle-status.enum.js';

export class UpdateParcelleDto {
  @ApiPropertyOptional({ description: 'Nom de la parcelle' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Culture plantée' })
  @IsOptional()
  @IsUUID('4', { message: 'La culture doit être un UUID valide.' })
  cultureId?: string;

  @ApiPropertyOptional({ description: 'Surface (ha)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  areaHa?: number;

  @ApiPropertyOptional({ description: 'Contour (GeoJSON)' })
  @IsOptional()
  @IsObject()
  boundaryGeoJson?: GeoJsonGeometry | null;

  @ApiPropertyOptional({ description: 'Date de plantation (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  plantedAt?: string | null;

  @ApiPropertyOptional({ description: 'Statut de la parcelle' })
  @IsOptional()
  @IsEnum(ParcelleStatus, {
    message: 'Le statut doit être PREPARATION, ACTIVE, JACHERE ou CLOTURE.',
  })
  status?: ParcelleStatus;

  @ApiPropertyOptional({ description: 'Notes libres' })
  @IsOptional()
  @IsString()
  notes?: string | null;
}