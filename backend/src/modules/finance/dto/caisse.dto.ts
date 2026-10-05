import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CashMovementType } from '../../../common/enums/cash-session-status.enum.js';

export class OpenCashSessionDto {
  @IsInt({ message: 'Le fonds de caisse doit être un entier.' })
  @Min(0, { message: 'Le fonds de caisse ne peut pas être négatif.' })
  openingBalanceFcfa: number;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date d’ouverture doit être au format YYYY-MM-DD.' },
  )
  openedAt?: string;
}

export class CloseCashSessionDto {
  @IsInt({ message: 'Le solde déclaré doit être un entier.' })
  @Min(0, { message: 'Le solde déclaré ne peut pas être négatif.' })
  declaredBalanceFcfa: number;
}

export class CreateCashMovementDto {
  @IsEnum(CashMovementType, { message: 'Type de mouvement invalide.' })
  type: CashMovementType;

  @IsInt({ message: 'Le montant doit être un entier.' })
  @Min(1, { message: 'Le montant doit être positif (FCFA).' })
  amountFcfa: number;

  @IsOptional()
  @IsString({ message: 'La raison doit être une chaîne de caractères.' })
  reason?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date du mouvement doit être au format YYYY-MM-DD.' },
  )
  movementDate?: string;
}

export class UpdateCashMovementDto {
  @IsOptional()
  @IsInt({ message: 'Le montant doit être un entier.' })
  @Min(1, { message: 'Le montant doit être positif (FCFA).' })
  amountFcfa?: number;

  @IsOptional()
  @IsString({ message: 'La raison doit être une chaîne de caractères.' })
  reason?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date du mouvement doit être au format YYYY-MM-DD.' },
  )
  movementDate?: string;
}
