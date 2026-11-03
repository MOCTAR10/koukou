import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CustomerType } from '../../../common/enums/customer-type.enum.js';
import { toPhone } from '../../../common/utils/phone.js';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class BuyerProfileDto {
  @ApiProperty({ enum: CustomerType })
  @IsEnum(CustomerType, { message: 'Type d’acheteur invalide.' })
  type: CustomerType;

  @ApiPropertyOptional({ example: 'Hôtel du Port' })
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Le nom de l’établissement doit être une chaîne.' })
  @MaxLength(120, { message: 'Le nom de l’établissement est trop long.' })
  organizationName?: string;

  @ApiPropertyOptional({ example: 'Libreville' })
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'La ville doit être une chaîne.' })
  @MaxLength(80, { message: 'Le nom de la ville est trop long.' })
  city?: string;
}

export class RegisterBuyerDto {
  @ApiProperty({ example: '+24174123456' })
  @Transform(toPhone)
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de téléphone est obligatoire.' })
  phone: string;

  @ApiProperty({ example: 'Jean Ondo' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Le nom complet est obligatoire.' })
  fullName: string;

  @ApiProperty({ description: 'Code secret, minimum 6 caractères' })
  @IsString()
  @MinLength(6, { message: 'Le code doit contenir au moins 6 caractères.' })
  code: string;

  @ApiPropertyOptional({ enum: CustomerType })
  @IsOptional()
  @IsEnum(CustomerType, { message: 'Type d’acheteur invalide.' })
  type?: CustomerType;

  @ApiPropertyOptional({ example: 'Hôtel du Port' })
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Le nom de l’établissement doit être une chaîne.' })
  @MaxLength(120, { message: 'Le nom de l’établissement est trop long.' })
  organizationName?: string;

  @ApiPropertyOptional({ example: 'Libreville' })
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'La ville doit être une chaîne.' })
  @MaxLength(80, { message: 'Le nom de la ville est trop long.' })
  city?: string;
}

export class BecomeFarmerDto {
  @ApiPropertyOptional({ example: 'Ferme de SunPark' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(2, {
    message: 'Le nom de la ferme doit contenir au moins 2 caractères.',
  })
  farmName?: string;

  @ApiPropertyOptional({ example: 'Libreville' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  farmCity?: string;
}
