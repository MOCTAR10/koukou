import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MarketFulfilment,
  MarketOrderState,
} from '../../../common/enums/market.enum.js';
import { toPhone } from '../../../common/utils/phone.js';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMarketOrderDto {
  @IsUUID('4', { message: 'Annonce invalide.' })
  listingId: string;

  @IsInt({ message: 'La quantité doit être un entier.' })
  @Min(1, { message: 'La quantité doit être positive.' })
  quantity: number;

  @IsEnum(MarketFulfilment, { message: 'Mode de remise invalide.' })
  fulfilment: MarketFulfilment;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'L’adresse doit être une chaîne.' })
  @MaxLength(200, { message: 'L’adresse est trop longue.' })
  address?: string;

  @IsOptional()
  @Transform(toPhone)
  @IsString({ message: 'Le téléphone doit être une chaîne.' })
  @Matches(/^\+?[0-9]{6,20}$/, { message: 'Numéro de téléphone invalide.' })
  contactPhone?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Le message doit être une chaîne.' })
  @MaxLength(500, { message: 'Le message est trop long.' })
  note?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La date doit être au format YYYY-MM-DD.' })
  desiredDate?: string;

  @IsOptional()
  @IsString({ message: 'La clé d’idempotence doit être une chaîne.' })
  @MaxLength(100, { message: 'La clé d’idempotence est trop longue.' })
  idempotencyKey?: string;
}

export class RejectMarketOrderDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Le motif doit être une chaîne.' })
  @MaxLength(300, { message: 'Le motif est trop long.' })
  reason?: string;
}

export class FarmMarketOrdersQueryDto {
  @ApiPropertyOptional({ enum: MarketOrderState })
  @IsOptional()
  @IsEnum(MarketOrderState, { message: 'État invalide.' })
  state?: MarketOrderState;
}
