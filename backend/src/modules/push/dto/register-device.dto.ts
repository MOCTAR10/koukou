import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Jeton Expo (ExponentPushToken[…])' })
  @IsString()
  @Matches(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/, {
    message: 'Jeton de notification invalide.',
  })
  token: string;

  @ApiPropertyOptional({ enum: ['ios', 'android'] })
  @IsOptional()
  @IsIn(['ios', 'android'], { message: 'Plateforme invalide.' })
  platform?: 'ios' | 'android';
}
