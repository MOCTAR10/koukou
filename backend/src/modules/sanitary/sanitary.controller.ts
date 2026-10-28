import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { SanitaryService } from './sanitary.service.js';
import { CancelProphylaxisDto } from './dto/cancel-prophylaxis.dto.js';
import { CompleteProphylaxisDto } from './dto/complete-prophylaxis.dto.js';
import { GenerateCalendarDto } from './dto/generate-calendar.dto.js';
import { RescheduleProphylaxisDto } from './dto/reschedule-prophylaxis.dto.js';
import { CreateTreatmentDto } from './dto/create-treatment.dto.js';

@ApiTags('Sanitaire & Prophylaxie')
@Controller('farms/:farmId/batches/:batchId')
export class SanitaryController {
  constructor(private readonly sanitaryService: SanitaryService) {}

  @Get('prophylaxis')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Calendrier prophylactique du lot (planifiés, en retard, faits, annulés)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  listProphylaxis(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.sanitaryService.listProphylaxis(user, farmId, batchId);
  }

  @Post('prophylaxis/generate')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('sanitaire:gerer')
  @ApiOperation({
    summary:
      'Générer automatiquement le calendrier de vaccination/traitement standard (protocole par défaut de l’espèce/type, ou protocole choisi)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  generateCalendar(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Body() dto: GenerateCalendarDto,
  ) {
    return this.sanitaryService.generateCalendar(
      user,
      farmId,
      batchId,
      dto.protocolId,
    );
  }

  @Post('prophylaxis/:eventId/complete')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('sanitaire:gerer', 'sanitaire:signaler')
  @ApiOperation({ summary: 'Marquer un soin comme réalisé (FAIT)' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  completeEvent(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CompleteProphylaxisDto,
  ) {
    return this.sanitaryService.completeEvent(
      user,
      farmId,
      batchId,
      eventId,
      dto,
    );
  }

  @Post('prophylaxis/:eventId/cancel')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('sanitaire:gerer')
  @ApiOperation({ summary: 'Annuler un soin planifié' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  cancelEvent(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CancelProphylaxisDto,
  ) {
    return this.sanitaryService.cancelEvent(
      user,
      farmId,
      batchId,
      eventId,
      dto.reason,
    );
  }

  @Patch('prophylaxis/:eventId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('sanitaire:gerer')
  @ApiOperation({ summary: 'Reporter/planifier un soin (nouvelle date)' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  rescheduleEvent(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
    @Body() dto: RescheduleProphylaxisDto,
  ) {
    return this.sanitaryService.rescheduleEvent(
      user,
      farmId,
      batchId,
      eventId,
      dto.scheduledDate,
    );
  }

  @Post('treatments')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('sanitaire:gerer', 'sanitaire:signaler')
  @ApiOperation({
    summary:
      'Enregistrer un traitement (antibiotique/vitamine…) — ouvre un délai d’attente HACCP',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  createTreatment(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Body() dto: CreateTreatmentDto,
  ) {
    return this.sanitaryService.createTreatment(user, farmId, batchId, dto);
  }

  @Get('treatments')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Historique des traitements du lot (registre HACCP)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  listTreatments(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.sanitaryService.listTreatments(user, farmId, batchId);
  }
}
