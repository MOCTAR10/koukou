import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CreateSanitaryProtocolDto,
  ProtocolStepInput,
} from './create-protocol.dto.js';

/** A shared programme calendar: never tied to a farm. */
export class CreateVaccinationCalendarDto extends OmitType(
  CreateSanitaryProtocolDto,
  ['farmId'] as const,
) {
  @ApiPropertyOptional({
    description:
      'Calendrier de référence de l’espèce et du type (appliqué par défaut aux bandes)',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'reference doit être un booléen.' })
  reference?: boolean;
}

export class UpdateVaccinationCalendarDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Le nom doit être un texte.' })
  @IsNotEmpty({ message: 'Le nom du calendrier est obligatoire.' })
  @MaxLength(200, { message: 'Le nom ne doit pas dépasser 200 caractères.' })
  name?: string;

  @ApiPropertyOptional({
    description:
      'Devenir le calendrier de référence de son espèce et de son type (true seulement)',
  })
  @IsOptional()
  @IsBoolean({ message: 'reference doit être un booléen.' })
  reference?: boolean;
}

export class UpdateCalendarStepDto extends PartialType(ProtocolStepInput) {
  @ApiPropertyOptional({
    description: 'false : l’étape n’est plus appliquée aux nouvelles bandes',
  })
  @IsOptional()
  @IsBoolean({ message: 'active doit être un booléen.' })
  active?: boolean;
}
