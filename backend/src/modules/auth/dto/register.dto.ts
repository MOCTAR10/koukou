import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'Numéro de téléphone (identifiant)',
    example: '+24174123456',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de téléphone est obligatoire.' })
  phone: string;

  @ApiProperty({ description: 'Nom complet', example: 'Jean Ondo' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom complet est obligatoire.' })
  fullName: string;

  @ApiProperty({
    description: 'Code secret (PIN), minimum 6 caractères',
    example: '123456',
  })
  @IsString()
  @MinLength(6, {
    message: 'Le code doit contenir au moins 6 caractères.',
  })
  code: string;

  @ApiPropertyOptional({
    description:
      "Nom de la ferme (définit la ferme par défaut du Propriétaire). Absent → « Ferme de <nom complet> ».",
    example: 'Ferme de SunPark',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, {
    message: 'Le nom de la ferme doit contenir au moins 2 caractères.',
  })
  farmName?: string;

  @ApiPropertyOptional({
    description: 'Ville administrative de la ferme',
    example: 'Libreville',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'La ville administrative est obligatoire.' })
  farmCity?: string;
}
