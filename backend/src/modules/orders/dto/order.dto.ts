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
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SaleItemProductType,
  SaleItemUnit,
} from '../../../common/enums/sale-item-type.enum.js';
import { PaymentMethod } from '../../../common/enums/payment-method.enum.js';
import { OrderCanal } from '../../../common/enums/order-canal.enum.js';

export class CreateOrderItemDto {
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
  @IsEnum(SaleItemUnit, { message: 'Unité de commande invalide.' })
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
}

export class OrderDepositDto {
  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
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

export class CreateOrderDto {
  @IsEnum(OrderCanal, { message: 'Canal de commande invalide.' })
  canal: OrderCanal;

  /** Clé d'idempotence (rejeu offline) : une seconde création avec la même
   *  clé pour la même ferme renvoie la commande existante. */
  @IsOptional()
  @IsString({ message: 'La clé d’idempotence doit être une chaîne.' })
  idempotencyKey?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date de retrait/livraison doit être au format YYYY-MM-DD.' },
  )
  expectedDate?: string;

  @IsOptional()
  @IsString({ message: 'L’adresse de livraison doit être une chaîne.' })
  @IsNotEmpty({ message: 'L’adresse de livraison ne doit pas être vide.' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'La province de livraison doit être une chaîne.' })
  province?: string;

  @IsOptional()
  @IsNumber({}, { message: 'La latitude doit être un nombre.' })
  @Min(-90, { message: 'Latitude invalide.' })
  @Max(90, { message: 'Latitude invalide.' })
  latitude?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La longitude doit être un nombre.' })
  @Min(-180, { message: 'Longitude invalide.' })
  @Max(180, { message: 'Longitude invalide.' })
  longitude?: number;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date de facturation doit être au format YYYY-MM-DD.' },
  )
  saleDate?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Identifiant client invalide.' })
  customerId?: string;

  /** Point de livraison/réception (null = retrait à la ferme). */
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

  @IsArray({ message: 'La liste des articles est invalide.' })
  @IsNotEmpty({ message: 'Au moins un article est requis.' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  /** Acompte encaissé au moment du bon de commande (caisse ouverte requise). */
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderDepositDto)
  deposit?: OrderDepositDto;
}

export class FinalOrderItemDto {
  @IsUUID('4', { message: 'Identifiant d’article de vente invalide.' })
  saleItemId: string;

  @IsNumber({}, { message: 'La quantité finale doit être un nombre.' })
  @IsPositive({ message: 'La quantité finale doit être strictement positive.' })
  quantity: number;

  @IsOptional()
  @IsInt({ message: 'Le nombre de pièces doit être un entier.' })
  @IsPositive({ message: 'Le nombre de pièces doit être strictement positif.' })
  pieceCount?: number;
}

export class FinalizeOrderDto {
  /** Solde encaissé à la livraison (ouvre le reste à payer si absent). */
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderDepositDto)
  payment?: OrderDepositDto;

  /** Corrections finales de quantités (au kilo notamment) avant facturation. */
  @IsOptional()
  @IsArray({ message: 'La liste des quantités finales est invalide.' })
  @ValidateNested({ each: true })
  @Type(() => FinalOrderItemDto)
  items?: FinalOrderItemDto[];
}
