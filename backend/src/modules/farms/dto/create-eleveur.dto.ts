import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FarmStaffRole } from '../../../common/enums/farm-staff-role.enum.js';

export class CreateElevageDto {
  @ApiProperty({ description: 'Numéro de téléphone', example: '+24174123457' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de téléphone est obligatoire.' })
  phone: string;

  @ApiPropertyOptional({
    description: 'Adresse e-mail (optionnelle)',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: "L'adresse e-mail n'est pas valide." })
  @IsOptional()
  email?: string;

  @ApiProperty({ description: 'Nom complet de l’éleveur' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom complet est obligatoire.' })
  fullName: string;

  @ApiProperty({
    description: 'Code secret (PIN) temporaire, minimum 6 caractères',
  })
  @IsString()
  @MinLength(6, {
    message: 'Le code doit contenir au moins 6 caractères.',
  })
  code: string;

  @ApiPropertyOptional({
    enum: FarmStaffRole,
    description:
      'Rôle : Administrateur KouKou (droits flexibles) ou Éleveur Koukou (droits fixes). Défaut : Éleveur.',
  })
  @IsOptional()
  @IsEnum(FarmStaffRole, {
    message: 'Rôle inconnu : ADMIN ou ELEVEUR.',
  })
  role?: FarmStaffRole;

  @ApiPropertyOptional({
    description: 'Intitulé du poste (saisie libre), ex : Comptable, RH, Responsable ponte',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'L’intitulé du poste ne doit pas dépasser 80 caractères.' })
  jobTitle?: string;

  @ApiPropertyOptional({ description: 'Bâtiment assigné' })
  @IsOptional()
  @IsString()
  buildingAssignment?: string;

  @ApiPropertyOptional({
    description:
      'Permissions accordées (Administrateur KouKou uniquement). Défaut : permissions de base du rôle.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({ description: 'Lier immédiatement à la ferme' })
  @IsOptional()
  @IsBoolean()
  linkImmediately?: boolean;
}
