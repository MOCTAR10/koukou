import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
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

  @ApiPropertyOptional({
    description:
      'Plafond de crédit par défaut des clients (FCFA) ; null = pas de plafond',
    nullable: true,
  })
  @IsOptional()
  @IsInt({ message: 'Le plafond de crédit doit être un nombre entier de FCFA.' })
  @Min(0, { message: 'Le plafond de crédit ne peut pas être négatif.' })
  @Max(1_000_000_000, { message: 'Le plafond de crédit est trop élevé.' })
  defaultCreditLimitFcfa?: number | null;

  @ApiPropertyOptional({
    description: 'Délai de paiement par défaut (jours) ; null = aucun délai',
    nullable: true,
  })
  @IsOptional()
  @IsInt({ message: 'Le délai de paiement doit être un nombre entier de jours.' })
  @Min(0, { message: 'Le délai de paiement ne peut pas être négatif.' })
  @Max(365, { message: 'Le délai de paiement ne peut pas dépasser 365 jours.' })
  defaultPaymentTermDays?: number | null;
}
