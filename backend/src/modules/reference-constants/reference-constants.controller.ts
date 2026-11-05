import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { ReferenceConstantsService } from './reference-constants.service.js';
import { UpdateReferenceConstantDto } from './dto/update-reference-constant.dto.js';
import { Domain } from '../../common/decorators/domain.decorator.js';

@ApiTags('Réglages (constantes de référence)')
@Domain('TECHNIQUE')
@Controller('reference-constants')
export class ReferenceConstantsController {
  constructor(private readonly constantsService: ReferenceConstantsService) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Lister les constantes de référence (seuils d’alertes, vide sanitaire, autonomie provende…)',
  })
  list() {
    return this.constantsService.findAll();
  }

  @Patch(':key')
  @Domain('PLATEFORME')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Modifier une constante de référence (réglages plateforme) — Administrateur plateforme uniquement, constantes éditables uniquement.',
  })
  @ApiParam({
    name: 'key',
    description: 'Clé de la constante (ex: vide_sanitaire_min_days)',
  })
  update(@Param('key') key: string, @Body() dto: UpdateReferenceConstantDto) {
    return this.constantsService.update(key, dto.value);
  }
}
