import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { PointOfSaleKind } from '../../../common/enums/point-of-sale-kind.enum.js';

export class CreatePointOfSaleDto {
  @IsEnum(PointOfSaleKind, { message: 'Type de point de vente invalide.' })
  kind: PointOfSaleKind;

  @IsString({ message: 'Le nom doit être une chaîne de caractères.' })
  @Matches(/\S/, { message: 'Le nom ne doit pas être vide.' })
  name: string;

  @IsOptional()
  @IsString({ message: 'L’adresse doit être une chaîne de caractères.' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'La ville doit être une chaîne de caractères.' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'La province doit être une chaîne de caractères.' })
  province?: string;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 7 },
    { message: 'La latitude doit être un nombre valide.' },
  )
  latitude?: number;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 7 },
    { message: 'La longitude doit être un nombre valide.' },
  )
  longitude?: number;

  @IsOptional()
  @IsBoolean({ message: 'Le champ actif doit être un booléen.' })
  isActive?: boolean;
}

export class UpdatePointOfSaleDto {
  @IsOptional()
  @IsEnum(PointOfSaleKind, { message: 'Type de point de vente invalide.' })
  kind?: PointOfSaleKind;

  @IsOptional()
  @IsString({ message: 'Le nom doit être une chaîne de caractères.' })
  @Matches(/\S/, { message: 'Le nom ne doit pas être vide.' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'L’adresse doit être une chaîne de caractères.' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'La ville doit être une chaîne de caractères.' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'La province doit être une chaîne de caractères.' })
  province?: string;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 7 },
    { message: 'La latitude doit être un nombre valide.' },
  )
  latitude?: number;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 7 },
    { message: 'La longitude doit être un nombre valide.' },
  )
  longitude?: number;

  @IsOptional()
  @IsBoolean({ message: 'Le champ actif doit être un booléen.' })
  isActive?: boolean;
}