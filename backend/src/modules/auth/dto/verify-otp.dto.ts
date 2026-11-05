import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

/** Second login step of an institutional account. */
export class VerifyOtpDto {
  @ApiProperty({ description: 'Identifiant renvoyé par POST /auth/login' })
  @IsUUID('4', { message: 'Identifiant de connexion invalide.' })
  challengeId: string;

  @ApiProperty({
    description: 'Code reçu par SMS (6 chiffres)',
    example: '123456',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Le code reçu par SMS est obligatoire.' })
  @Matches(/^\d{6}$/, { message: 'Le code reçu par SMS compte 6 chiffres.' })
  code: string;
}
