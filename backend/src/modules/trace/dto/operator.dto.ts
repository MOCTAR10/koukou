import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const PHONE = /^\+?[0-9\s.()-]{6,20}$/;

export class CreateOperatorDto {
  @ApiProperty({
    description: "Type : code d'un élément de la liste TYPE_OPERATEUR",
    example: 'ABATTOIR',
  })
  @IsString()
  @IsNotEmpty({ message: "Le type d'opérateur est obligatoire." })
  @MaxLength(40)
  typeCode: string;

  @ApiProperty({ example: 'Abattoir de Owendo' })
  @IsString()
  @IsNotEmpty({ message: "Le nom de l'opérateur est obligatoire." })
  @MaxLength(160, { message: 'Nom trop long (160 caractères au plus).' })
  name: string;

  @ApiPropertyOptional({ description: 'Localité (identifiant)' })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de localité invalide.' })
  localiteId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @ApiPropertyOptional({ description: 'Personne à contacter' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(PHONE, { message: 'Le numéro de téléphone n’est pas valide.' })
  contactPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @MaxLength(160)
  contactEmail?: string | null;

  @ApiPropertyOptional({ description: 'Référence de la convention signée' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  conventionRef?: string | null;

  @ApiPropertyOptional({ description: 'Date de signature de la convention' })
  @IsOptional()
  @IsDateString({}, { message: 'Date de signature invalide.' })
  conventionSignedAt?: string | null;
}

export class UpdateOperatorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "Le type d'opérateur ne peut pas être vide." })
  @MaxLength(40)
  typeCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "Le nom de l'opérateur ne peut pas être vide." })
  @MaxLength(160, { message: 'Nom trop long (160 caractères au plus).' })
  name?: string;

  @ApiPropertyOptional({ description: 'null retire la localité' })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de localité invalide.' })
  localiteId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(PHONE, { message: 'Le numéro de téléphone n’est pas valide.' })
  contactPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @MaxLength(160)
  contactEmail?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  conventionRef?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({}, { message: 'Date de signature invalide.' })
  conventionSignedAt?: string | null;

  @ApiPropertyOptional({ description: 'false désactive (jamais supprimé)' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ListOperatorsQueryDto {
  @ApiPropertyOptional({ description: 'Code TYPE_OPERATEUR' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  type?: string;

  @ApiPropertyOptional({ description: 'Recherche (nom ou code)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({
    description: 'true : opérateurs désactivés inclus (administration)',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  all?: string;
}
