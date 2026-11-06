import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { ProtocolStepInput } from './dto/create-protocol.dto.js';
import {
  CreateVaccinationCalendarDto,
  UpdateCalendarStepDto,
  UpdateVaccinationCalendarDto,
} from './dto/vaccination-calendar.dto.js';
import { VaccinationCalendarsService } from './vaccination-calendars.service.js';

/**
 * Reference vaccination calendars of the programme, maintained by the
 * veterinary services (CDC « calendrier vaccinal paramétrable par les
 * services vétérinaires »): platform admin, or an institutional profile
 * granted SANITAIRE CREER / MODIFIER (the seeded VETERINAIRE profile). Read
 * them with `GET /sanitary/protocols[/:id]` (shared rows).
 */
@ApiTags('Surveillance sanitaire (programme)')
@Domain('SANITAIRE')
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('surveillance/vaccination-calendars')
export class VaccinationCalendarsController {
  constructor(private readonly calendars: VaccinationCalendarsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Créer un calendrier vaccinal partagé du programme (reference: true pour en faire le calendrier de référence)',
  })
  create(@Body() dto: CreateVaccinationCalendarDto) {
    return this.calendars.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Renommer un calendrier partagé ou en faire le calendrier de référence',
  })
  @ApiParam({ name: 'id' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVaccinationCalendarDto,
  ) {
    return this.calendars.update(id, dto);
  }

  @Post(':id/steps')
  @ApiOperation({ summary: 'Ajouter une étape à un calendrier partagé' })
  @ApiParam({ name: 'id' })
  addStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProtocolStepInput,
  ) {
    return this.calendars.addStep(id, dto);
  }

  @Patch(':id/steps/:stepId')
  @ApiOperation({
    summary:
      'Modifier ou désactiver une étape (active: false) d’un calendrier partagé',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'stepId' })
  updateStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateCalendarStepDto,
  ) {
    return this.calendars.updateStep(id, stepId, dto);
  }
}
