import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { AlertLevel } from '../../../common/enums/alert-level.enum.js';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationEvent,
} from '../../../common/enums/notification.enum.js';

const CHANNELS = Object.values(NotificationChannel).join(', ');

export class UpdateNotificationRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Le libellé doit être un texte.' })
  @IsNotEmpty({ message: 'Le libellé est obligatoire.' })
  @MaxLength(200, { message: 'Le libellé ne doit pas dépasser 200 caractères.' })
  label?: string;

  @ApiPropertyOptional({ enum: NotificationAudience })
  @IsOptional()
  @IsEnum(NotificationAudience, {
    message: 'Le destinataire doit être PROFILE, FARM_MANAGERS ou FARM_TEAM.',
  })
  audience?: NotificationAudience;

  @ApiPropertyOptional({
    description: 'Code du profil destinataire (destinataire PROFILE), null sinon',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Z0-9_]{2,40}$/, { message: 'Code de profil invalide.' })
  profileCode?: string | null;

  @ApiPropertyOptional({ enum: NotificationChannel, isArray: true })
  @IsOptional()
  @IsArray({ message: `Les canaux sont une liste (${CHANNELS}).` })
  @ArrayMinSize(1, { message: 'Au moins un canal.' })
  @ArrayMaxSize(3, { message: 'Trois canaux au plus.' })
  @IsEnum(NotificationChannel, {
    each: true,
    message: `Canal inconnu (${CHANNELS}).`,
  })
  channels?: NotificationChannel[];

  @ApiPropertyOptional({
    description:
      'Minutes avant l’escalade par SMS d’une notification non lue (null : pas d’escalade)',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt({ message: 'Le délai d’escalade est un nombre entier de minutes.' })
  @Min(1, { message: 'Le délai d’escalade est d’au moins 1 minute.' })
  @Max(1440, { message: 'Le délai d’escalade est d’au plus 1440 minutes.' })
  escalateAfterMin?: number | null;

  @ApiPropertyOptional({ enum: AlertLevel })
  @IsOptional()
  @IsEnum(AlertLevel, { message: 'La gravité minimale est VERT, JAUNE ou ROUGE.' })
  severityMin?: AlertLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'active doit être un booléen.' })
  active?: boolean;
}

export class CreateNotificationRuleDto {
  @ApiProperty({ example: 'VET_ALERTE_SMS' })
  @Matches(/^[A-Z0-9_]{2,60}$/, {
    message:
      'Le code contient de 2 à 60 caractères : majuscules, chiffres ou _.',
  })
  code: string;

  @ApiProperty({ enum: NotificationEvent })
  @IsEnum(NotificationEvent, {
    message: `Événement inconnu (${Object.values(NotificationEvent).join(', ')}).`,
  })
  event: NotificationEvent;

  @ApiProperty()
  @IsString({ message: 'Le libellé doit être un texte.' })
  @IsNotEmpty({ message: 'Le libellé est obligatoire.' })
  @MaxLength(200, { message: 'Le libellé ne doit pas dépasser 200 caractères.' })
  label: string;

  @ApiProperty({ enum: NotificationAudience })
  @IsEnum(NotificationAudience, {
    message: 'Le destinataire doit être PROFILE, FARM_MANAGERS ou FARM_TEAM.',
  })
  audience: NotificationAudience;

  @ApiPropertyOptional({ description: 'Code du profil (destinataire PROFILE)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Z0-9_]{2,40}$/, { message: 'Code de profil invalide.' })
  profileCode?: string | null;

  @ApiProperty({ enum: NotificationChannel, isArray: true })
  @IsArray({ message: `Les canaux sont une liste (${CHANNELS}).` })
  @ArrayMinSize(1, { message: 'Au moins un canal.' })
  @ArrayMaxSize(3, { message: 'Trois canaux au plus.' })
  @IsEnum(NotificationChannel, {
    each: true,
    message: `Canal inconnu (${CHANNELS}).`,
  })
  channels: NotificationChannel[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt({ message: 'Le délai d’escalade est un nombre entier de minutes.' })
  @Min(1, { message: 'Le délai d’escalade est d’au moins 1 minute.' })
  @Max(1440, { message: 'Le délai d’escalade est d’au plus 1440 minutes.' })
  escalateAfterMin?: number | null;

  @ApiPropertyOptional({ enum: AlertLevel })
  @IsOptional()
  @IsEnum(AlertLevel, { message: 'La gravité minimale est VERT, JAUNE ou ROUGE.' })
  severityMin?: AlertLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'active doit être un booléen.' })
  active?: boolean;
}
