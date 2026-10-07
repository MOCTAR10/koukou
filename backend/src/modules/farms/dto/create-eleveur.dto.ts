import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { FarmStaffRole } from '../../../common/enums/farm-staff-role.enum.js';
import { ContractType } from '../../../common/enums/contract-type.enum.js';

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

  @ApiPropertyOptional({
    description: 'Clé de profil métier (ex : veterinaire, comptable, rh) — pré-remplit rôle et permissions.',
  })
  @IsOptional()
  @IsString()
  profileKey?: string;

  /* ── Dossier RH ── */

  @ApiPropertyOptional({ description: 'Service / département' })
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'Le département ne doit pas dépasser 80 caractères.' })
  department?: string;

  @ApiPropertyOptional({ enum: ContractType, description: 'Nature du contrat' })
  @IsOptional()
  @IsEnum(ContractType, { message: 'Type de contrat inconnu.' })
  contractType?: ContractType;

  @ApiPropertyOptional({ description: "Date d'embauche (ISO YYYY-MM-DD)" })
  @IsOptional()
  @IsDateString({}, { message: "Date d'embauche invalide." })
  hireDate?: string;

  @ApiPropertyOptional({ description: 'Fin de contrat prévue (ISO YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Date de fin invalide.' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Salaire de référence en FCFA (entier)' })
  @IsOptional()
  @IsInt({ message: 'Le salaire doit être un entier (FCFA).' })
  @Min(0, { message: 'Le salaire ne peut pas être négatif.' })
  salaryFcfa?: number;

  @ApiPropertyOptional({ description: 'Observations RH' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'La note ne doit pas dépasser 1000 caractères.' })
  notes?: string;
}
