import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/** Paramètres de ferme modifiables par le Propriétaire (ou un membre
 *  disposant de « reglages:ferme »). Tous les champs sont optionnels :
 *  seuls ceux transmis sont mis à jour. Le nom n'en fait pas partie. */
export class UpdateFarmSettingsDto {
  /** Refused (400) whatever its value: the name changes in the registry
   *  (`PATCH /programme/farms/:farmId`), which checks for duplicates. Kept
   *  in the DTO so the whitelist does not drop it silently. */
  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Refusé (400) : le nom se modifie dans le registre (PATCH /programme/farms/:farmId).',
  })
  @Allow()
  name?: unknown;

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
