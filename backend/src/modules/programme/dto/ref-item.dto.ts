import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateRefItemDto {
  @ApiProperty({
    description: 'Code stable (majuscules, chiffres, _), jamais modifié',
    example: 'VENTE_MARCHE_MONT_BOUET',
  })
  @Matches(/^[A-Z0-9_]{1,40}$/, {
    message:
      'Le code doit contenir de 1 à 40 caractères : majuscules, chiffres ou _.',
  })
  code: string;

  @ApiProperty({ example: 'Vente au marché de Mont-Bouët' })
  @IsString({ message: 'Le libellé doit être un texte.' })
  @IsNotEmpty({ message: 'Le libellé est obligatoire.' })
  @MaxLength(200, {
    message: 'Le libellé ne doit pas dépasser 200 caractères.',
  })
  label: string;

  @ApiPropertyOptional({
    description:
      'Famille interne (obligatoire pour STATUT_FERME, INTRANT, MOTIF_SORTIE, TYPE_OPERATEUR, STATUT_ALERTE), jamais modifiée',
    example: 'VENTE',
  })
  @IsOptional()
  @IsString({ message: 'La famille doit être un texte.' })
  family?: string;

  @ApiPropertyOptional({ description: 'Élément parent (même programme)' })
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant du parent invalide.' })
  parentId?: string;

  @ApiPropertyOptional({ description: 'Données complémentaires libres' })
  @IsOptional()
  @IsObject({ message: 'meta doit être un objet.' })
  meta?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Ordre d'affichage" })
  @IsOptional()
  @IsInt({ message: "L'ordre doit être un entier." })
  @Min(0, { message: "L'ordre doit être positif." })
  sort?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'active doit être vrai ou faux.' })
  active?: boolean;
}

/** Code and family are immutable: they are not accepted here. */
export class UpdateRefItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Le libellé doit être un texte.' })
  @IsNotEmpty({ message: 'Le libellé ne peut pas être vide.' })
  @MaxLength(200, {
    message: 'Le libellé ne doit pas dépasser 200 caractères.',
  })
  label?: string;

  @ApiPropertyOptional({ description: "Ordre d'affichage" })
  @IsOptional()
  @IsInt({ message: "L'ordre doit être un entier." })
  @Min(0, { message: "L'ordre doit être positif." })
  sort?: number;

  @ApiPropertyOptional({ description: 'false = désactivé (jamais supprimé)' })
  @IsOptional()
  @IsBoolean({ message: 'active doit être vrai ou faux.' })
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject({ message: 'meta doit être un objet.' })
  meta?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Élément parent, null pour le retirer',
    nullable: true,
  })
  @ValidateIf(
    (o: UpdateRefItemDto) => o.parentId !== undefined && o.parentId !== null,
  )
  @IsUUID('4', { message: 'Identifiant du parent invalide.' })
  parentId?: string | null;
}
