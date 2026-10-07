import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { FarmStaffRole } from '../../../common/enums/farm-staff-role.enum.js';
import { ContractType } from '../../../common/enums/contract-type.enum.js';

export class UpdateEleveurDto {
  @ApiPropertyOptional({
    enum: FarmStaffRole,
    description:
      'Rôle au sein de la ferme. Un passage en Éleveur réinitialise les permissions sur le bloc fixe.',
  })
  @IsOptional()
  @IsEnum(FarmStaffRole, { message: 'Rôle inconnu : ADMIN ou ELEVEUR.' })
  role?: FarmStaffRole;

  @ApiPropertyOptional({ description: 'Intitulé du poste (saisie libre)' })
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value))
  @IsOptional()
  @ValidateIf((o) => o.jobTitle != null)
  @IsString()
  @MaxLength(80, { message: 'L’intitulé du poste ne doit pas dépasser 80 caractères.' })
  jobTitle?: string | null;

  @ApiPropertyOptional({ description: 'Bâtiment assigné' })
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value))
  @IsOptional()
  @ValidateIf((o) => o.buildingAssignment != null)
  @IsString()
  @MaxLength(120, { message: 'Bâtiment assigné trop long.' })
  buildingAssignment?: string | null;

  @ApiPropertyOptional({
    description: 'Actif/inactif : un membre inactif perd tout accès à la ferme.',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Permissions accordées (Administrateur KouKou uniquement).',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({
    description: 'Clé de profil métier (ex : veterinaire, comptable, rh) — applique rôle et permissions.',
  })
  @IsOptional()
  @IsString()
  profileKey?: string;

  /* ── Dossier RH ── */

  @ApiPropertyOptional({ description: 'Service / département' })
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value))
  @IsOptional()
  @ValidateIf((o) => o.department != null)
  @IsString()
  @MaxLength(80, { message: 'Le département ne doit pas dépasser 80 caractères.' })
  department?: string | null;

  @ApiPropertyOptional({ enum: ContractType, description: 'Nature du contrat' })
  @IsOptional()
  @ValidateIf((o) => o.contractType != null)
  @IsEnum(ContractType, { message: 'Type de contrat inconnu.' })
  contractType?: ContractType | null;

  @ApiPropertyOptional({ description: "Date d'embauche (ISO YYYY-MM-DD)" })
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value))
  @IsOptional()
  @ValidateIf((o) => o.hireDate != null)
  @IsDateString({}, { message: "Date d'embauche invalide." })
  hireDate?: string | null;

  @ApiPropertyOptional({ description: 'Fin de contrat prévue (ISO YYYY-MM-DD)' })
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value))
  @IsOptional()
  @ValidateIf((o) => o.endDate != null)
  @IsDateString({}, { message: 'Date de fin invalide.' })
  endDate?: string | null;

  @ApiPropertyOptional({ description: 'Salaire de référence en FCFA (entier)' })
  @IsOptional()
  @ValidateIf((o) => o.salaryFcfa != null)
  @IsInt({ message: 'Le salaire doit être un entier (FCFA).' })
  @Min(0, { message: 'Le salaire ne peut pas être négatif.' })
  salaryFcfa?: number | null;

  @ApiPropertyOptional({ description: 'Observations RH' })
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value))
  @IsOptional()
  @ValidateIf((o) => o.notes != null)
  @IsString()
  @MaxLength(1000, { message: 'La note ne doit pas dépasser 1000 caractères.' })
  notes?: string | null;
}