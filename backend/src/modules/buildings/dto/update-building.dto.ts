import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateBuildingDto {
  @ApiPropertyOptional({ description: 'Nom du bâtiment' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Surface du bâtiment (m²)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  buildingAreaM2?: number;

  @ApiPropertyOptional({ description: 'Capacité (oiseaux)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Date du dernier vide sanitaire validé (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  lastVideSanitaireAt?: string;

  @ApiPropertyOptional({ description: 'Longitude du bâtiment' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Latitude du bâtiment' })
  @IsOptional()
  @IsNumber()
  latitude?: number;
}
