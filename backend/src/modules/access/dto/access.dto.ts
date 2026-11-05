import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { AccessScopeKind } from '../../../common/enums/access-scope-kind.enum.js';
import { normalizePhone } from '../../../common/utils/phone.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAccessProfileDto {
  @ApiProperty({ example: 'AGENT_PROVINCIAL' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, {
    message:
      'Le code du profil : 2 à 40 caractères, lettres majuscules, chiffres et « _ ».',
  })
  code: string;

  @ApiProperty({ example: 'Agent provincial' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le libellé du profil est obligatoire.' })
  @MaxLength(120)
  label: string;

  @ApiProperty({ enum: AccessScopeKind })
  @IsEnum(AccessScopeKind, { message: 'Périmètre inconnu.' })
  scopeKind: AccessScopeKind;

  @ApiProperty({
    description: 'Matrice { domaine: [actions] }',
    example: { REGISTRE: ['CONSULTER'], TECHNIQUE: ['CONSULTER'] },
  })
  @IsObject({
    message: 'La matrice doit être un objet { domaine: [actions] }.',
  })
  matrix: Record<string, unknown>;
}

export class UpdateAccessProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le libellé du profil est obligatoire.' })
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ enum: AccessScopeKind })
  @IsOptional()
  @IsEnum(AccessScopeKind, { message: 'Périmètre inconnu.' })
  scopeKind?: AccessScopeKind;

  @ApiPropertyOptional({ description: 'Matrice { domaine: [actions] }' })
  @IsOptional()
  @IsObject({
    message: 'La matrice doit être un objet { domaine: [actions] }.',
  })
  matrix?: Record<string, unknown>;
}

/** Scope fields shared by creation and update of a membership. */
class MembershipScopeDto {
  @ApiPropertyOptional({
    description: 'Provinces du périmètre PROVINCES (codes G1…G9)',
    example: ['G1'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  provinceCodes?: string[];

  @ApiPropertyOptional({ description: 'Fermes du périmètre FARMS' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true, message: 'Identifiant de ferme invalide.' })
  farmIds?: string[];

  @ApiPropertyOptional({
    description:
      'Fin de validité du rattachement (ISO 8601) ; null : sans limite',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString({}, { message: 'Date de fin de validité invalide.' })
  validUntil?: string | null;
}

export class CreateMembershipDto extends MembershipScopeDto {
  @ApiProperty({ example: 'Agent DGE Estuaire' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Le nom complet est obligatoire.' })
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: '+24174123456' })
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizePhone(value) : value,
  )
  @IsString()
  @Matches(/^\+?\d{8,15}$/, { message: 'Numéro de téléphone invalide.' })
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email?: string;

  @ApiProperty({ example: 'DGE', description: "Code du profil d'accès" })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Le profil est obligatoire.' })
  profileCode: string;
}

export class UpdateMembershipDto extends MembershipScopeDto {
  @ApiPropertyOptional({ description: "Nouveau profil d'accès (code)" })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  profileCode?: string;

  @ApiPropertyOptional({ description: 'false : rattachement suspendu' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
