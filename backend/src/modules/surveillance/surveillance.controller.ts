import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  CreateRefItemDto,
  UpdateRefItemDto,
} from '../programme/dto/ref-item.dto.js';
import {
  ListSanitaryAlertsDto,
  PublishSanitaryAlertDto,
  TransitionSanitaryAlertDto,
} from './dto/sanitary-alert.dto.js';
import { SanitaryAlertsService } from './sanitary-alerts.service.js';
import {
  SANITARY_LIST_TYPES,
  SanitaryListsService,
} from './sanitary-lists.service.js';
import { AuditThirdPartyRead } from '../../common/decorators/audit.decorator.js';
import {
  ListSanitaryDeclarationsDto,
  ReviewSanitaryDeclarationDto,
} from './dto/sanitary-declaration.dto.js';
import { SanitaryDeclarationsService } from './sanitary-declarations.service.js';
import { assertSanitarySettings } from './veterinary-authority.js';

const sanitaryListPipe = new ParseEnumPipe(ProgramListType, {
  exceptionFactory: () =>
    new BadRequestException(
      `Type de liste inconnu (${Object.values(ProgramListType).join(', ')}).`,
    ),
});

/**
 * Official sanitary surveillance, programme side (POUFA plan §10): the
 * alerts of every farm in the caller's scope, their qualification and
 * publication, and the sanitary lists the veterinary services maintain.
 * Platform admin, or an institutional profile granted the domain SANITAIRE
 * (the seeded VETERINAIRE profile); before publication an alert stays
 * between the farm and the veterinary services, whatever the matrix
 * (`SanitaryDeclarationPolicy`). Qualifying and publishing are the veterinary
 * authority's alone (`veterinary-authority.ts`, CDC n° 25-26): the platform
 * admin reads the alerts and the lists, never decides an alert nor changes a
 * list (POUFA lot A2 vet). The register of declarations and their
 * validation (CDC n° 26) are the veterinary authority's too.
 */
@ApiTags('Surveillance sanitaire (programme)')
@Domain('SANITAIRE')
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('surveillance')
export class SurveillanceController {
  constructor(
    private readonly alerts: SanitaryAlertsService,
    private readonly lists: SanitaryListsService,
    private readonly declarations: SanitaryDeclarationsService,
  ) {}

  @Get('alerts')
  @AuditThirdPartyRead('Alertes sanitaires (non publiées comprises)')
  @ApiOperation({
    summary:
      'Alertes sanitaires officielles du périmètre (non publiées : services vétérinaires seulement)',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListSanitaryAlertsDto) {
    return this.alerts.list(user, query);
  }

  @Get('alerts/:alertId')
  @AuditThirdPartyRead('Détail d’une alerte sanitaire')
  @ApiOperation({ summary: 'Détail d’une alerte sanitaire et son historique' })
  @ApiParam({ name: 'alertId' })
  detail(
    @CurrentUser() user: AuthUser,
    @Param('alertId', ParseUUIDPipe) alertId: string,
  ) {
    return this.alerts.detail(user, alertId);
  }

  @Post('alerts/:alertId/transitions')
  @Action('MODIFIER')
  @ApiOperation({
    summary:
      'Qualifier une alerte : NOUVELLE → EN_ANALYSE → CONFIRMEE | INFIRMEE → CLOSE (commentaire obligatoire pour confirmer ou infirmer)',
  })
  @ApiParam({ name: 'alertId' })
  transition(
    @CurrentUser() user: AuthUser,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() dto: TransitionSanitaryAlertDto,
  ) {
    return this.alerts.transition(user, alertId, dto);
  }

  @Post('alerts/:alertId/publish')
  @Action('VALIDER')
  @ApiOperation({
    summary:
      'Publier une alerte confirmée (autorité vétérinaire) : elle devient visible des tableaux de bord',
  })
  @ApiParam({ name: 'alertId' })
  publish(
    @CurrentUser() user: AuthUser,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() dto: PublishSanitaryAlertDto,
  ) {
    return this.alerts.publish(user, alertId, dto);
  }

  // POUFA lot A2 vet (begin): register and validation of the declarations
  // (CDC n° 26 « valident les événements »).
  @Get('declarations')
  @AuditThirdPartyRead('Registre des déclarations sanitaires')
  @ApiOperation({
    summary:
      'Registre des déclarations sanitaires du périmètre, avec leur examen vétérinaire (services vétérinaires seulement)',
  })
  listDeclarations(
    @CurrentUser() user: AuthUser,
    @Query() query: ListSanitaryDeclarationsDto,
  ) {
    return this.declarations.list(user, query);
  }

  @Get('declarations/:declarationId')
  @AuditThirdPartyRead('Détail d’une déclaration sanitaire')
  @ApiOperation({ summary: 'Détail d’une déclaration sanitaire et de son examen' })
  @ApiParam({ name: 'declarationId' })
  declarationDetail(
    @CurrentUser() user: AuthUser,
    @Param('declarationId', ParseUUIDPipe) declarationId: string,
  ) {
    return this.declarations.detail(user, declarationId);
  }

  @Post('declarations/:declarationId/review')
  @Action('VALIDER')
  @ApiOperation({
    summary:
      'Examiner une déclaration sans alerte : VALIDEE, INFIRMEE (commentaire obligatoire) ou ALERTE (ouvre une alerte officielle) ; une seule fois, la ferme est notifiée',
  })
  @ApiParam({ name: 'declarationId' })
  reviewDeclaration(
    @CurrentUser() user: AuthUser,
    @Param('declarationId', ParseUUIDPipe) declarationId: string,
    @Body() dto: ReviewSanitaryDeclarationDto,
  ) {
    return this.declarations.review(user, declarationId, dto);
  }
  // POUFA lot A2 vet (end)

  @Post('lists/:listType')
  @Action('MODIFIER')
  @ApiOperation({
    summary: `Ajouter un élément à une liste sanitaire (${SANITARY_LIST_TYPES.join(', ')})`,
  })
  @ApiParam({ name: 'listType', enum: SANITARY_LIST_TYPES })
  createItem(
    @CurrentUser() user: AuthUser,
    @Param('listType', sanitaryListPipe) listType: ProgramListType,
    @Body() dto: CreateRefItemDto,
  ) {
    assertSanitarySettings(user.role, 'lists');
    return this.lists.create(listType, dto);
  }

  @Patch('lists/:listType/:code')
  @ApiOperation({
    summary:
      'Renommer, réordonner, activer ou désactiver un élément d’une liste sanitaire',
  })
  @ApiParam({ name: 'listType', enum: SANITARY_LIST_TYPES })
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('listType', sanitaryListPipe) listType: ProgramListType,
    @Param('code') code: string,
    @Body() dto: UpdateRefItemDto,
  ) {
    assertSanitarySettings(user.role, 'lists');
    return this.lists.update(listType, code, dto);
  }
}
