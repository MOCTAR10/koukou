import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { LocaliteKind } from '../../../common/enums/localite-kind.enum.js';

export class CreateLocaliteDto {
  @ApiProperty({ example: 'G1' })
  @IsString({ message: 'Le code de province doit être un texte.' })
  @IsNotEmpty({ message: 'La province est obligatoire.' })
  provinceCode: string;

  @ApiProperty({ example: 'Owendo' })
  @IsString({ message: 'Le nom doit être un texte.' })
  @IsNotEmpty({ message: 'Le nom est obligatoire.' })
  @MaxLength(120, { message: 'Le nom ne doit pas dépasser 120 caractères.' })
  name: string;

  @ApiPropertyOptional({ enum: LocaliteKind, default: LocaliteKind.AUTRE })
  @IsOptional()
  @IsEnum(LocaliteKind, { message: 'Type de localité inconnu.' })
  kind?: LocaliteKind;

  @ApiPropertyOptional({ example: 'Owendo' })
  @IsOptional()
  @IsString({ message: 'Le chef-lieu doit être un texte.' })
  @MaxLength(120, {
    message: 'Le chef-lieu ne doit pas dépasser 120 caractères.',
  })
  chefLieu?: string;

  @ApiPropertyOptional({
    description: 'Code stable ; généré (G1-06…) quand absent',
    example: 'G1-OWENDO',
  })
  @IsOptional()
  @Matches(/^[A-Z0-9_-]{1,40}$/, {
    message:
      'Le code doit contenir de 1 à 40 caractères : majuscules, chiffres, - ou _.',
  })
  code?: string;

  @ApiPropertyOptional({ description: "Ordre d'affichage" })
  @IsOptional()
  @IsInt({ message: "L'ordre doit être un entier." })
  @Min(0, { message: "L'ordre doit être positif." })
  sort?: number;
}

/** The code and the province never change. */
export class UpdateLocaliteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Le nom doit être un texte.' })
  @IsNotEmpty({ message: 'Le nom ne peut pas être vide.' })
  @MaxLength(120, { message: 'Le nom ne doit pas dépasser 120 caractères.' })
  name?: string;

  @ApiPropertyOptional({ enum: LocaliteKind })
  @IsOptional()
  @IsEnum(LocaliteKind, { message: 'Type de localité inconnu.' })
  kind?: LocaliteKind;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Le chef-lieu doit être un texte.' })
  @MaxLength(120, {
    message: 'Le chef-lieu ne doit pas dépasser 120 caractères.',
  })
  chefLieu?: string;

  @ApiPropertyOptional({ description: 'false = désactivée (jamais supprimée)' })
  @IsOptional()
  @IsBoolean({ message: 'active doit être vrai ou faux.' })
  active?: boolean;

  @ApiPropertyOptional({ description: "Ordre d'affichage" })
  @IsOptional()
  @IsInt({ message: "L'ordre doit être un entier." })
  @Min(0, { message: "L'ordre doit être positif." })
  sort?: number;
}
