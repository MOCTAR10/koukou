import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RegisterDeviceDto } from './dto/register-device.dto.js';
import { PushService } from './push.service.js';
import { Domain } from '../../common/decorators/domain.decorator.js';

@ApiTags('Notifications')
// The caller's own phone: SESSION, so institutional accounts (vets) get push
// too — COMPTE is Fermia-only and never in a programme matrix.
@Domain('SESSION')
@Controller('push/devices')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post()
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Enregistrer ce téléphone pour les notifications (alertes rouges, tâches).',
  })
  async register(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    await this.pushService.register(user.id, dto);
  }

  @Delete(':token')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Ne plus recevoir de notifications sur ce téléphone.',
  })
  async unregister(
    @CurrentUser() user: AuthUser,
    @Param('token') token: string,
  ) {
    await this.pushService.unregister(user.id, token);
  }
}
