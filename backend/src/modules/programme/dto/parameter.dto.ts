import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDefined,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SetParameterDto {
  @ApiProperty({
    description:
      'Nouvelle valeur, du type du paramètre (nombre, texte, formule ou JSON)',
    example: 1.5,
  })
  @IsDefined({ message: 'La valeur est obligatoire.' })
  value: unknown;

  @ApiProperty({ example: 'Décision du comité de pilotage du 12/11/2026' })
  @IsString({ message: 'Le motif doit être un texte.' })
  @IsNotEmpty({ message: 'Le motif du changement est obligatoire.' })
  @MaxLength(500, { message: 'Le motif ne doit pas dépasser 500 caractères.' })
  reason: string;

  @ApiPropertyOptional({
    description:
      "Date d'effet (ISO 8601), maintenant par défaut, jamais dans le passé",
    example: '2026-12-01T00:00:00Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: "La date d'effet doit être une date ISO 8601." })
  validFrom?: string;
}

export class ParametersAtQueryDto {
  @ApiPropertyOptional({
    description:
      'Date (ISO 8601) des valeurs en vigueur ; maintenant par défaut',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'La date doit être une date ISO 8601.' })
  at?: string;
}
