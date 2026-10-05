import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { SanitaryService } from './sanitary.service.js';
import { GenerateProgramDto } from './dto/generate-program.dto.js';
import { CreateManualScheduleDto } from './dto/create-manual-schedule.dto.js';
import { UpdateScheduleDto } from './dto/update-schedule.dto.js';

@ApiTags('Sanitaire & Prophylaxie')
@Controller('farms/:farmId')
export class VaccineSchedulesController {
  constructor(private readonly sanitaryService: SanitaryService) {}

  @Post('vaccine-schedules/programs/generate')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('sanitaire:gerer')
  @ApiOperation({
    summary:
      'Appliquer un programme pré-chargé (calendrier vaccinal Gabon) à un ou plusieurs lots — non bloquant : étapes dont la date est passée ou déjà réalisées sautées avec raison',
  })
  @ApiParam({ name: 'farmId' })
  generateProgram(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: GenerateProgramDto,
  ) {
    return this.sanitaryService.generateVaccineProgram(user, farmId, dto);
  }

  @Post('vaccine-schedules/manual')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('sanitaire:gerer')
  @ApiOperation({
    summary:
      'Planifier un soin unique (vaccin ou médicament) sur un ou plusieurs lots — option « Sortir du stock » pour un médicament (jamais de quantité négative)',
  })
  @ApiParam({ name: 'farmId' })
  createManualSchedule(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateManualScheduleDto,
  ) {
    return this.sanitaryService.createManualSchedule(user, farmId, dto);
  }

  @Patch('batches/:batchId/vaccine-schedules/:eventId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('sanitaire:gerer')
  @ApiOperation({
    summary:
      'Éditer un soin planifié (vaccin ↔ médicament, intitulé, voie, dosage, délai d’attente, notes, date)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  updateSchedule(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.sanitaryService.updateSchedule(
      user,
      farmId,
      batchId,
      eventId,
      dto,
    );
  }

  @Delete('batches/:batchId/vaccine-schedules/:eventId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('sanitaire:gerer')
  @ApiOperation({
    summary:
      'Supprimer un soin planifié — restaure le stock si le soin portait une sortie de stock',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  deleteSchedule(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.sanitaryService.deleteSchedule(
      user,
      farmId,
      batchId,
      eventId,
    );
  }
}