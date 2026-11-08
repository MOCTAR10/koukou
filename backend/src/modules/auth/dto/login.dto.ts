import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Numéro de téléphone',
    example: '+24174123456',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de téléphone est obligatoire.' })
  @MaxLength(32, { message: 'Numéro de téléphone trop long.' })
  phone: string;

  @ApiProperty({
    description: 'Code secret (PIN) du compte',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le code est obligatoire.' })
  @MaxLength(72, { message: 'Code trop long.' })
  code: string;
}
