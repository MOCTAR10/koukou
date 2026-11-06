import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = 'Date attendue au format AAAA-MM-JJ.';

export class EconomieSynthesisQueryDto {
  @ApiPropertyOptional({
    description: 'Début de période (AAAA-MM-JJ), défaut : le 1er du mois',
  })
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    description: 'Fin de période (AAAA-MM-JJ), défaut : aujourd’hui',
  })
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  to?: string;

  @ApiPropertyOptional({ description: 'Province (identifiant)' })
  @IsOptional()
  @IsUUID('4', { message: 'Province invalide.' })
  provinceId?: string;
}

export class EconomieSynthesisExportDto extends EconomieSynthesisQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], default: 'csv' })
  @IsOptional()
  @IsIn(['csv', 'xlsx'], { message: 'Format attendu : csv ou xlsx.' })
  format?: 'csv' | 'xlsx';
}
