import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  CreateNotificationRuleDto,
  UpdateNotificationRuleDto,
} from './dto/notification-rule.dto.js';
import { NotificationRulesService } from './notification-rules.service.js';

/**
 * Notification rules of the programme (event → audience, channels,
 * escalation, minimum severity): platform admin, or an institutional
 * profile granted ADMINISTRATION (read: CONSULTER, write: ADMINISTRER).
 */
@ApiTags('Notifications (administration)')
@Domain('ADMINISTRATION')
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('programme/notification-rules')
export class NotificationRulesController {
  constructor(private readonly rules: NotificationRulesService) {}

  @Get()
  @ApiOperation({ summary: 'Règles de notification du programme' })
  list() {
    return this.rules.list();
  }

  @Get('events')
  @ApiOperation({
    summary:
      'Événements notifiables (confidential : données sanitaires non publiées, ferme et vétérinaires seulement)',
  })
  events() {
    return this.rules.catalog();
  }

  @Post()
  @Action('ADMINISTRER')
  @ApiOperation({ summary: 'Ajouter une règle de notification' })
  create(@Body() dto: CreateNotificationRuleDto) {
    return this.rules.create(dto);
  }

  @Patch(':id')
  @Action('ADMINISTRER')
  @ApiOperation({
    summary:
      'Modifier une règle (destinataire, canaux, escalade, gravité, activation ; ni le code ni l’événement)',
  })
  @ApiParam({ name: 'id' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotificationRuleDto,
  ) {
    return this.rules.update(id, dto);
  }
}
