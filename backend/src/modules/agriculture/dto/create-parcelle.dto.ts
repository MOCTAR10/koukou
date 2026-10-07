import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import type { GeoJsonGeometry } from '../../../common/geo/geo-geometry.js';
import { ParcelleStatus } from '../../../common/enums/parcelle-status.enum.js';

export class CreateParcelleDto {
  @ApiProperty({ description: 'Nom de la parcelle', example: 'Parcelle A' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la parcelle est obligatoire.' })
  name: string;

  @ApiProperty({ description: 'Culture plantée (identifiant du référentiel)' })
  @IsUUID('4', { message: 'La culture doit être un UUID valide.' })
  cultureId: string;

  @ApiPropertyOptional({
    description: 'Surface (ha). Recalculée depuis le contour si fourni.',
    example: 1.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  areaHa?: number;

  @ApiPropertyOptional({
    description: 'Contour de la parcelle (Polygon/MultiPolygon GeoJSON)',
  })
  @IsOptional()
  @IsObject()
  boundaryGeoJson?: GeoJsonGeometry;

  @ApiPropertyOptional({ description: 'Date de plantation (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  plantedAt?: string;

  @ApiPropertyOptional({
    description: 'Statut de la parcelle',
    enum: ParcelleStatus,
    default: ParcelleStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ParcelleStatus, {
    message: 'Le statut doit être PREPARATION, ACTIVE, JACHERE ou CLOTURE.',
  })
  status?: ParcelleStatus;

  @ApiPropertyOptional({ description: 'Notes libres' })
  @IsOptional()
  @IsString()
  notes?: string;
}