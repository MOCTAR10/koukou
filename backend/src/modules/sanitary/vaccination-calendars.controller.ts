import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
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
import { assertSanitarySettings } from '../surveillance/veterinary-authority.js';

/**
 * Reference vaccination calendars of the programme, maintained by the
 * veterinary services (CDC « calendrier vaccinal paramétrable par les
 * services vétérinaires »): an institutional profile granted SANITAIRE CREER
 * / MODIFIER (the seeded VETERINAIRE profile, or any profile the
 * administration grants them). POUFA lot A2 vet: the platform admin reads
 * them (`GET /sanitary/protocols[/:id]`, shared rows) and changes nothing.
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
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateVaccinationCalendarDto,
  ) {
    assertSanitarySettings(user.role, 'calendars');
    return this.calendars.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Renommer un calendrier partagé ou en faire le calendrier de référence',
  })
  @ApiParam({ name: 'id' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVaccinationCalendarDto,
  ) {
    assertSanitarySettings(user.role, 'calendars');
    return this.calendars.update(id, dto);
  }

  @Post(':id/steps')
  @ApiOperation({ summary: 'Ajouter une étape à un calendrier partagé' })
  @ApiParam({ name: 'id' })
  addStep(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProtocolStepInput,
  ) {
    assertSanitarySettings(user.role, 'calendars');
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
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateCalendarStepDto,
  ) {
    assertSanitarySettings(user.role, 'calendars');
    return this.calendars.updateStep(id, stepId, dto);
  }
}
