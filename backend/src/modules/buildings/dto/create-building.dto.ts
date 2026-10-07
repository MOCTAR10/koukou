import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateBuildingDto {
  @ApiProperty({ description: 'Nom du bâtiment', example: 'Bâtiment A' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du bâtiment est obligatoire.' })
  name: string;

  @ApiPropertyOptional({
    description: 'Surface du bâtiment (m²) — densité au niveau bâtiment',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  buildingAreaM2?: number;

  @ApiPropertyOptional({
    description: 'Capacité (oiseaux) — pour le ratio par rapport à la capacité',
  })
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

  @ApiPropertyOptional({
    description: 'Longitude du bâtiment (coordonnées GPS)',
    example: 9.4512,
  })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Latitude du bâtiment', example: 0.4162 })
  @IsOptional()
  @IsNumber()
  latitude?: number;
}
