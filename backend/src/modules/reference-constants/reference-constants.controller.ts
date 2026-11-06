import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { ReferenceConstantsService } from './reference-constants.service.js';
import { UpdateReferenceConstantDto } from './dto/update-reference-constant.dto.js';
import {
  AlsoGrantedBy,
  Domain,
} from '../../common/decorators/domain.decorator.js';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';

@ApiTags('Réglages (constantes de référence)')
@Domain('TECHNIQUE')
@Controller('reference-constants')
export class ReferenceConstantsController {
  constructor(private readonly constantsService: ReferenceConstantsService) {}

  @Get()
  // POUFA lot A droits (F8): read in PARAMETRES too (owners edit them there).
  @AlsoGrantedBy(['PARAMETRES', 'CONSULTER'])
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Lister les constantes de référence (seuils d’alertes, vide sanitaire, autonomie provende…) avec leur profil propriétaire',
  })
  list() {
    return this.constantsService.findAll();
  }

  @Patch(':key')
  // POUFA lot A droits (F8): PARAMETRES:MODIFIER and the owner profile
  // (VETERINAIRE for the sanitary thresholds, DGE for the rest), or the
  // platform admin.
  @Domain('PARAMETRES')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Modifier un seuil de conduite Fermia : son profil propriétaire (PARAMETRES:MODIFIER) ou l’administrateur plateforme ; constantes éditables uniquement.',
  })
  @ApiParam({
    name: 'key',
    description: 'Clé de la constante (ex: vide_sanitaire_min_days)',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpdateReferenceConstantDto,
  ) {
    return this.constantsService.update(key, dto.value, user);
  }
}
