import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { mayReadInactiveItems } from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import {
  CreateItineraryStepDto,
  ItineraryQueryDto,
  UpdateItineraryStepDto,
} from './dto/itinerary.dto.js';
import { ItineraryService } from './itinerary.service.js';

/**
 * Technical itinerary (itinéraire technique) by age: reference data read by
 * every farm role and institution (REFERENCE), maintained by the platform
 * admin or an institution holding PARAMETRES:MODIFIER (the DGE by default).
 * Steps are deactivated, never deleted.
 */
@ApiTags('Itinéraire technique')
@Domain('PARAMETRES')
@Controller('programme/itinerary')
export class ItineraryController {
  constructor(
    private readonly itinerary: ItineraryService,
    private readonly scope: ScopeResolver,
  ) {}

  @Get()
  @Domain('REFERENCE')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Itinéraire technique par âge (?species=&type= ; ?all=true : étapes désactivées incluses, profils gestionnaires)',
  })
  async list(@CurrentUser() user: AuthUser, @Query() query: ItineraryQueryDto) {
    return this.itinerary.list(
      { species: query.species, type: query.type },
      await this.includeInactive(user, query.all),
    );
  }

  @Post()
  @Action('MODIFIER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Ajouter une étape à l’itinéraire technique' })
  create(@Body() dto: CreateItineraryStepDto) {
    return this.itinerary.create(dto);
  }

  @Patch(':id')
  @Action('MODIFIER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Modifier, réordonner ou désactiver une étape (jamais supprimée ; espèce et type ne changent pas)',
  })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateItineraryStepDto,
  ) {
    return this.itinerary.update(id, dto);
  }

  private async includeInactive(
    user: AuthUser,
    all: string | undefined,
  ): Promise<boolean> {
    if (all !== 'true') return false;
    if (user.role === UserRole.PLATFORM_ADMIN) return true;
    if (user.role === UserRole.INSTITUTION) {
      const access = await this.scope.accessOf(user.id);
      if (access && mayReadInactiveItems(access.matrix)) return true;
    }
    throw new ForbiddenException(
      'Les étapes désactivées sont réservées aux profils qui gèrent l’itinéraire technique.',
    );
  }
}
