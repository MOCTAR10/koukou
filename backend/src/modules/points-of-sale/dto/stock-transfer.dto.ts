import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { StockTransferProductType } from '../../../common/enums/stock-transfer-product-type.enum.js';

export class CreateStockTransferDto {
  @IsEnum(StockTransferProductType, {
    message: 'Type de produit de transfert invalide.',
  })
  productType: StockTransferProductType;

  @IsOptional()
  @IsUUID('4', { message: 'Identifiant d’ordre d’abattage invalide.' })
  slaughterOrderId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de lot invalide.' })
  batchId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de lot d’intrant invalide.' })
  inputLotId?: string;

  @IsUUID('4', { message: 'Identifiant de point de vente invalide.' })
  pointOfSaleId: string;

  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être d’au moins une unité.' })
  quantity: number;

  @IsOptional()
  unit?: string;
}