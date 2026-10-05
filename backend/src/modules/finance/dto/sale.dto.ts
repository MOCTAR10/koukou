import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SaleItemProductType,
  SaleItemUnit,
} from '../../../common/enums/sale-item-type.enum.js';
import { PaymentMethod } from '../../../common/enums/payment-method.enum.js';

export class CreateSaleItemDto {
  @ApiPropertyOptional({ enum: SaleItemProductType })
  @IsEnum(SaleItemProductType, {
    message: 'Type de produit invalide.',
  })
  productType: SaleItemProductType;

  @IsOptional()
  @IsString({ message: 'Le libellé doit être une chaîne de caractères.' })
  label?: string;

  @IsNumber({}, { message: 'La quantité doit être un nombre.' })
  @IsPositive({ message: 'La quantité doit être strictement positive.' })
  quantity: number;

  @ApiPropertyOptional({ enum: SaleItemUnit })
  @IsOptional()
  @IsEnum(SaleItemUnit, { message: 'Unité de vente invalide.' })
  unit?: SaleItemUnit;

  @IsOptional()
  @IsInt({ message: 'Le nombre de pièces doit être un entier.' })
  @IsPositive({ message: 'Le nombre de pièces doit être strictement positif.' })
  pieceCount?: number;

  @IsInt({ message: 'Le prix unitaire doit être un entier.' })
  @Min(1, { message: 'Le prix unitaire doit être positif (FCFA).' })
  unitPriceFcfa: number;

  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de lot de production invalide.' })
  batchId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de lot d’intrant invalide.' })
  inputLotId?: string;

  /** Ordre d'abattage source (vente ABATTU depuis le pool de carcasses). */
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant d’ordre d’abattage invalide.' })
  sourceSlaughterOrderId?: string;

  /** Réserve d'un transfert ferme → boutique (vente ABATTU, OEUFS ou PROVENDE). */
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de transfert invalide.' })
  stockTransferId?: string;
}

export class PaymentInputDto {
  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsEnum(PaymentMethod, { message: 'Méthode de paiement invalide.' })
  method?: PaymentMethod;

  @IsInt({ message: 'Le montant doit être un entier.' })
  @Min(1, { message: 'Le montant doit être positif (FCFA).' })
  amountFcfa: number;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date de paiement doit être au format YYYY-MM-DD.' },
  )
  paymentDate?: string;

  @IsOptional()
  @IsString({ message: 'La clé d’idempotence doit être une chaîne.' })
  idempotencyKey?: string;
}

export class CreateSaleDto {
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date de vente doit être au format YYYY-MM-DD.' },
  )
  saleDate?: string;

  @IsOptional()
  @IsString({ message: 'La clé d’idempotence doit être une chaîne.' })
  idempotencyKey?: string;

  @IsArray({ message: 'La liste des articles est invalide.' })
  @IsNotEmpty({ message: 'Au moins un article est requis.' })
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

  @IsOptional()
  @IsUUID('4', { message: 'Identifiant client invalide.' })
  customerId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de point de vente invalide.' })
  pointOfSaleId?: string;

  @IsOptional()
  @IsString({ message: 'Le téléphone client doit être une chaîne.' })
  @Matches(/^\+?[0-9\s-]{6,20}$/, {
    message: 'Numéro de téléphone client invalide.',
  })
  customerPhone?: string;

  @IsOptional()
  @IsString({ message: 'Le nom du client doit être une chaîne.' })
  @IsNotEmpty({ message: 'Le nom du client ne doit pas être vide.' })
  customerName?: string;

  @IsOptional()
  @IsString({ message: 'Le code promo doit être une chaîne.' })
  @IsNotEmpty({ message: 'Le code promo ne doit pas être vide.' })
  promoCode?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de lot de production invalide.' })
  batchId?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PaymentInputDto)
  payments?: PaymentInputDto[];
}
