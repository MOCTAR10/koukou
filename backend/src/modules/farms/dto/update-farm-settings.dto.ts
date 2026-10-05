import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

/** Paramètres de ferme modifiables par le Propriétaire (ou un membre
 *  disposant de « reglages:ferme »). Tous les champs sont optionnels :
 *  seuls ceux transmis sont mis à jour. */
export class UpdateFarmSettingsDto {
  @ApiPropertyOptional({
    description: "Nom de l'exploitation",
    example: 'Ferme de SunPark',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, {
    message: 'Le nom de la ferme doit contenir au moins 2 caractères.',
  })
  @IsNotEmpty({ message: 'Le nom de la ferme est obligatoire.' })
  name?: string;

  @ApiPropertyOptional({ description: 'Ville administrative', example: 'Libreville' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La ville administrative est obligatoire.' })
  administrativeCity?: string;

  @ApiPropertyOptional({
    description: "Poids d'un sac d'aliment (kg)",
    example: 50,
  })
  @IsOptional()
  @IsNumber({}, { message: "Le poids du sac doit être un nombre." })
  @Min(1, { message: 'Le poids du sac doit être supérieur à 0 kg.' })
  defaultSacKg?: number;
}
