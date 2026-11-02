import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CareType } from '../../../common/enums/care-type.enum.js';

export class CreateTreatmentDto {
  @ApiProperty({
    enum: CareType,
    description: 'Type de soin (ANTIBIOTIQUE, VACCIN…)',
  })
  @IsEnum(CareType, { message: 'Le type de soin doit être une valeur valide.' })
  careType: CareType;

  @ApiProperty({ description: 'Nom du produit administré' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du produit est obligatoire.' })
  productName: string;

  @ApiPropertyOptional({ description: 'Dosage (ex : 1 g/L d’eau)' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({
    description: 'Voie d’administration (eau de boisson, SC, IM)',
  })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({
    description: 'Date/heure d’administration (défaut : maintenant)',
  })
  @IsOptional()
  @IsDateString()
  administeredAt?: string;

  @ApiPropertyOptional({
    description:
      "Délai d'attente (jours) avant commercialisation — tracé HACCP",
    default: 0,
  })
  @IsOptional()
  @IsInt({ message: 'Le délai d’attente doit être un nombre entier de jours.' })
  @Min(0)
  withdrawalDays?: number;

  @ApiPropertyOptional({
    description: 'Référence au lot d’intrant (médicament)',
  })
  @IsOptional()
  @IsString()
  medicationLotId?: string;

  @ApiPropertyOptional({
    description: 'Remarques (vétérinaire, observation, etc.)',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
