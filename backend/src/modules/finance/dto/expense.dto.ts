import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { IdempotentDto } from '../../../common/utils/idempotency.js';
import { ExpenseCategory } from '../../../common/enums/expense-category.enum.js';

export class CreateExpenseDto extends IdempotentDto {
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date de la dépense doit être au format YYYY-MM-DD.' },
  )
  expenseDate?: string;

  /** Legacy accounting category; optional when `posteCharge` is sent. */
  @IsOptional()
  @IsEnum(ExpenseCategory, { message: 'Catégorie de dépense invalide.' })
  category?: ExpenseCategory;

  /** Code of an active item of the `POSTE_CHARGE` list (checked by the service). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Le poste de charge doit être un code.' })
  posteCharge?: string;

  @IsInt({ message: 'Le montant doit être un entier.' })
  @Min(1, { message: 'Le montant doit être positif (FCFA).' })
  amountFcfa: number;

  @IsOptional()
  @IsString({ message: 'Le libellé doit être une chaîne de caractères.' })
  label?: string;

  @IsOptional()
  @IsString({ message: 'Le fournisseur doit être une chaîne de caractères.' })
  supplier?: string;

  @IsOptional()
  @IsString({ message: 'Les notes doivent être une chaîne de caractères.' })
  notes?: string;

  @IsOptional()
  paidByCaisse?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de lot de production invalide.' })
  batchId?: string;
}

export class UpdateExpenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Le poste de charge doit être un code.' })
  posteCharge?: string;

  @IsOptional()
  @IsEnum(ExpenseCategory, { message: 'Catégorie de dépense invalide.' })
  category?: ExpenseCategory;

  @IsOptional()
  @IsString({ message: 'Le libellé doit être une chaîne de caractères.' })
  label?: string;

  @IsOptional()
  @IsString({ message: 'Le fournisseur doit être une chaîne de caractères.' })
  supplier?: string;

  @IsOptional()
  @IsString({ message: 'Les notes doivent être une chaîne de caractères.' })
  notes?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de lot de production invalide.' })
  batchId?: string;
}

export class ListExpensesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date de début doit être au format YYYY-MM-DD.' },
  )
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date de fin doit être au format YYYY-MM-DD.' },
  )
  to?: string;

  @ApiPropertyOptional({ enum: ExpenseCategory })
  @IsOptional()
  @IsEnum(ExpenseCategory, { message: 'Catégorie de dépense invalide.' })
  category?: ExpenseCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de lot de production invalide.' })
  batchId?: string;
}
