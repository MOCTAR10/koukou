import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UiMode } from '../../../common/enums/ui-mode.enum.js';

/** Body of `PATCH /auth/me/ui-mode` and `PATCH /farms/:farmId/members/:userId/ui-mode`. */
export class SetUiModeDto {
  @ApiProperty({ enum: UiMode })
  @IsEnum(UiMode, { message: 'Mode d’affichage invalide (SIMPLE ou COMPLET).' })
  uiMode: UiMode;
}
