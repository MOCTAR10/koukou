import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  DeliveredNotificationsDto,
  ListNotificationsDto,
} from './dto/notification.dto.js';
import { NotifyService } from './notify.service.js';

/**
 * The caller's own in-app inbox (domain SESSION: every account with a farm
 * or an effective programme membership; not Market buyers).
 */
@ApiTags('Notifications')
@Domain('SESSION')
@Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notify: NotifyService) {}

  @Get()
  @ApiOperation({
    summary: 'Mes notifications (récentes d’abord) et le nombre de non lues',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsDto) {
    return this.notify.inbox(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Nombre de mes notifications non lues' })
  async unread(@CurrentUser() user: AuthUser) {
    return { count: await this.notify.unreadCount(user.id) };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Marquer toutes mes notifications comme lues' })
  readAll(@CurrentUser() user: AuthUser) {
    return this.notify.markAllRead(user.id);
  }

  @Post('delivered')
  @ApiOperation({
    summary: 'Accusé de réception de l’application (ENVOYEE → DISTRIBUEE)',
  })
  delivered(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeliveredNotificationsDto,
  ) {
    return this.notify.markDelivered(user.id, dto.ids);
  }

  @Post(':id/read')
  @ApiOperation({
    summary:
      'Marquer une notification comme lue (tous ses canaux ; arrête l’escalade par SMS)',
  })
  @ApiParam({ name: 'id' })
  read(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notify.markRead(user.id, id);
  }
}
