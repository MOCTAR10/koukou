import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BatchType } from '../../../common/enums/batch-type.enum.js';
import { Species } from '../../../common/enums/species.enum.js';
import { CareType } from '../../../common/enums/care-type.enum.js';

export class ProtocolStepInput {
  @ApiProperty({ description: 'Ordre du soin dans le protocole (1, 2, 3…)' })
  @IsInt()
  @Min(0)
  stepOrder: number;

  @ApiProperty({
    description: 'Jour de début de la fenêtre (âge du lot en jours)',
  })
  @IsInt()
  @Min(0)
  dayFrom: number;

  @ApiProperty({
    description: 'Jour de fin de la fenêtre (âge du lot en jours)',
  })
  @IsInt()
  @Min(0)
  dayTo: number;

  @ApiProperty({ enum: CareType, description: 'Type de soin' })
  @IsEnum(CareType, { message: 'Le type de soin doit être une valeur valide.' })
  careType: CareType;

  @ApiProperty({ description: 'Nom du soin (ex : Vaccin Gumboro)' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du soin est obligatoire.' })
  name: string;

  @ApiPropertyOptional({ description: 'Dosage (ex : 1 dose/sujet)' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({
    description: 'Voie d’administration (ex : eau de boisson)',
  })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({
    description: "Délai d'attente (jours) — surtout pour les médicaments",
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  withdrawalDays?: number;
}

export class CreateSanitaryProtocolDto {
  @ApiPropertyOptional({
    description:
      'Ferme propriétaire du programme (omis : référentiel commun, administrateur plateforme uniquement)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de ferme invalide.' })
  farmId?: string;

  @ApiProperty({
    description: 'Nom du protocole (ex : Programme vaccinal poulet de chair)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du protocole est obligatoire.' })
  name: string;

  @ApiPropertyOptional({ description: 'Code unique (auto-généré si absent)' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ enum: Species, default: Species.POULET })
  @IsOptional()
  @IsEnum(Species, { message: 'L’espèce doit être une valeur valide.' })
  species?: Species;

  @ApiProperty({
    enum: BatchType,
    description: 'Type de lot (CHAIR | PONDEUSE)',
  })
  @IsEnum(BatchType, { message: 'Le type doit être CHAIR ou PONDEUSE.' })
  type: BatchType;

  @ApiProperty({
    type: [ProtocolStepInput],
    description: 'Étapes du protocole',
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Le protocole doit contenir au moins une étape.',
  })
  @ValidateNested({ each: true })
  @Type(() => ProtocolStepInput)
  steps: ProtocolStepInput[];
}
