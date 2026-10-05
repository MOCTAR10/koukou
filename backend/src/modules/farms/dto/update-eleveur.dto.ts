import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { FarmStaffRole } from '../../../common/enums/farm-staff-role.enum.js';

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
}