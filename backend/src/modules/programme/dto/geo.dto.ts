import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SetProvinceGeometryDto {
  @ApiProperty({
    description:
      'Contour GeoJSON (Polygon ou MultiPolygon, WGS84, positions [longitude, latitude])',
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [9.3, 0.3],
          [9.6, 0.3],
          [9.6, 0.6],
          [9.3, 0.6],
          [9.3, 0.3],
        ],
      ],
    },
  })
  @IsObject({ message: 'Le contour doit être un objet GeoJSON.' })
  geometry: Record<string, unknown>;
}

export class GeoCheckDto {
  @ApiProperty({ example: 0.39 })
  @IsNumber({}, { message: 'La latitude doit être un nombre.' })
  @Min(-90, { message: 'Latitude invalide.' })
  @Max(90, { message: 'Latitude invalide.' })
  latitude: number;

  @ApiProperty({ example: 9.45 })
  @IsNumber({}, { message: 'La longitude doit être un nombre.' })
  @Min(-180, { message: 'Longitude invalide.' })
  @Max(180, { message: 'Longitude invalide.' })
  longitude: number;

  @ApiProperty({ example: 'G1' })
  @IsString({ message: 'Le code de province doit être un texte.' })
  @IsNotEmpty({ message: 'La province est obligatoire.' })
  provinceCode: string;
}
