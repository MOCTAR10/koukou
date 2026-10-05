import { OmitType } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { CustomerType } from '../../../common/enums/customer-type.enum.js';

export class CreateCustomerDto {
  @IsNotEmpty({ message: 'Le nom du client est obligatoire.' })
  @IsString({ message: 'Le nom du client doit être une chaîne de caractères.' })
  fullName: string;

  @IsOptional()
  @IsEnum(CustomerType, { message: 'Type de client invalide.' })
  type?: CustomerType;

  @IsOptional()
  @IsString({ message: 'Le numéro de téléphone doit être une chaîne.' })
  @Matches(/^\+?[0-9\s-]{6,20}$/, {
    message: 'Le numéro de téléphone n’est pas valide.',
  })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'L’e-mail doit être une chaîne de caractères.' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'La ville doit être une chaîne de caractères.' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'Les notes doivent être une chaîne de caractères.' })
  notes?: string;
}

export class UpdateCustomerDto extends OmitType(CreateCustomerDto, [
  'fullName',
] as const) {
  @IsOptional()
  @IsString({ message: 'Le nom du client doit être une chaîne de caractères.' })
  fullName?: string;
}

/** Encaissement depuis la fiche client : montant réparti sur les ventes impayées. */
export class CustomerPaymentDto {
  @IsInt({ message: 'Le montant doit être un nombre entier.' })
  @Min(1, { message: 'Le montant doit être supérieur à zéro.' })
  amountFcfa: number;

  /** Clé d'idempotence (file hors-ligne) : rejoue sans double encaissement. */
  @IsOptional()
  @IsString({ message: 'La clé d’idempotence doit être une chaîne.' })
  @MaxLength(100, { message: 'La clé d’idempotence est trop longue.' })
  idempotencyKey?: string;
}