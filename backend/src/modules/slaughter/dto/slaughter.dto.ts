import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { SlaughterDestination } from '../../../common/enums/slaughter-destination.enum.js';
import { SlaughterType } from '../../../common/enums/slaughter-type.enum.js';

export class CreateSlaughterOrderDto {
  @ApiProperty({ description: 'Lot de production à abattre' })
  @IsUUID('4', { message: 'Identifiant de lot de production invalide.' })
  batchId: string;

  @ApiProperty({ enum: SlaughterType })
  @IsEnum(SlaughterType, { message: 'Type d’abattage invalide.' })
  slaughterType: SlaughterType;

  @ApiProperty({ enum: SlaughterDestination })
  @IsEnum(SlaughterDestination, { message: 'Destination invalide.' })
  destination: SlaughterDestination;

  @ApiProperty({ description: 'Date prévue d’abattage (YYYY-MM-DD)' })
  @IsDateString(
    {},
    { message: 'La date prévue doit être au format YYYY-MM-DD.' },
  )
  plannedDate: string;

  @ApiProperty({ description: 'Nombre d’oiseaux envoyés' })
  @IsInt({ message: 'Le nombre d’oiseaux doit être un entier.' })
  @Min(1, { message: 'Le nombre d’oiseaux doit être positif.' })
  birdCount: number;

  @ApiPropertyOptional({ description: 'Poids total (kg) — facultatif' })
  @IsOptional()
  @IsNumber({}, { message: 'Le poids total doit être un nombre.' })
  @IsPositive({ message: 'Le poids total doit être positif.' })
  totalWeightKg?: number;

  @ApiPropertyOptional({
    description: 'Poids carcasse (kg) — rendement calculé si poids vif présent',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Le poids carcasse doit être un nombre.' })
  @IsPositive({ message: 'Le poids carcasse doit être positif.' })
  carcassWeightKg?: number;

  @ApiPropertyOptional({
    description:
      'Code lot abattoir (saisie manuelle possible à tout moment, jamais bloquant)',
  })
  @IsOptional()
  @IsString({ message: 'Le code lot abattoir doit être une chaîne.' })
  abattoirLotCode?: string;

  @ApiPropertyOptional({ description: 'Remarques' })
  @IsOptional()
  @IsString({ message: 'Les remarques doivent être une chaîne.' })
  abattoirNotes?: string;

  // POUFA lot A2 divers (F4): the abattoir of the operator registry.
  @ApiPropertyOptional({
    description:
      'Abattoir (registre des opérateurs) : le traitement de l’ordre cède le lot à cet opérateur',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant d’abattoir invalide.' })
  operatorId?: string;
}

export class UpdateSlaughterOrderDto {
  @ApiPropertyOptional({ enum: SlaughterType })
  @IsOptional()
  @IsEnum(SlaughterType, { message: 'Type d’abattage invalide.' })
  slaughterType?: SlaughterType;

  @ApiPropertyOptional({ description: 'Date prévue d’abattage (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date prévue doit être au format YYYY-MM-DD.' },
  )
  plannedDate?: string;

  @ApiPropertyOptional({ description: 'Nombre d’oiseaux envoyés' })
  @IsOptional()
  @IsInt({ message: 'Le nombre d’oiseaux doit être un entier.' })
  @Min(1, { message: 'Le nombre d’oiseaux doit être positif.' })
  birdCount?: number;

  @ApiPropertyOptional({ description: 'Poids total (kg) — facultatif' })
  @IsOptional()
  @IsNumber({}, { message: 'Le poids total doit être un nombre.' })
  @IsPositive({ message: 'Le poids total doit être positif.' })
  totalWeightKg?: number;

  @ApiPropertyOptional({
    description: 'Poids carcasse (kg) — renseigné à la réception de l’abattoir',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Le poids carcasse doit être un nombre.' })
  @IsPositive({ message: 'Le poids carcasse doit être positif.' })
  carcassWeightKg?: number;

  @ApiPropertyOptional({ description: 'Code lot abattoir (saisie manuelle)' })
  @IsOptional()
  @IsString({ message: 'Le code lot abattoir doit être une chaîne.' })
  abattoirLotCode?: string;

  @ApiPropertyOptional({ description: 'Remarques' })
  @IsOptional()
  @IsString({ message: 'Les remarques doivent être une chaîne.' })
  abattoirNotes?: string;

  // POUFA lot A2 divers (F4): null removes the abattoir (before processing).
  @ApiPropertyOptional({ description: 'Abattoir (registre des opérateurs), null pour le retirer', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID('4', { message: 'Identifiant d’abattoir invalide.' })
  operatorId?: string | null;
}

export class SendSlaughterOrderDto {
  @ApiPropertyOptional({ description: 'Code interne si abattoir propre' })
  @IsOptional()
  @IsString({ message: 'Le code interne doit être une chaîne.' })
  internalBatchCode?: string;

  @ApiPropertyOptional({
    description: 'Code lot abattoir déjà connu à l’envoi',
  })
  @IsOptional()
  @IsString({ message: 'Le code lot abattoir doit être une chaîne.' })
  abattoirLotCode?: string;

  @ApiPropertyOptional({ description: 'Remarques d’envoi' })
  @IsOptional()
  @IsString({ message: 'Les remarques doivent être une chaîne.' })
  abattoirNotes?: string;
}

export class ProcessSlaughterOrderDto {
  @ApiPropertyOptional({
    description: 'Poids carcasse (kg) — rendement calculé si poids vif présent',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Le poids carcasse doit être un nombre.' })
  @IsPositive({ message: 'Le poids carcasse doit être positif.' })
  carcassWeightKg?: number;

  @ApiPropertyOptional({ description: 'Code lot abattoir reçu (manuel)' })
  @IsOptional()
  @IsString({ message: 'Le code lot abattoir doit être une chaîne.' })
  abattoirLotCode?: string;

  @ApiPropertyOptional({ description: 'Remarques de traitement' })
  @IsOptional()
  @IsString({ message: 'Les remarques doivent être une chaîne.' })
  abattoirNotes?: string;
}

export class CancelSlaughterOrderDto {
  @ApiPropertyOptional({ description: 'Motif d’annulation' })
  @IsOptional()
  @IsNotEmpty({ message: 'Le motif doit être non vide.' })
  @IsString({ message: 'Le motif doit être une chaîne.' })
  reason?: string;
}
