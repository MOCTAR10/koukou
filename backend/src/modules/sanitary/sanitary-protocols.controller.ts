import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { SanitaryService } from './sanitary.service.js';
import { CreateSanitaryProtocolDto } from './dto/create-protocol.dto.js';

@ApiTags('Protocoles sanitaires')
@Controller('sanitary/protocols')
export class SanitaryProtocolsController {
  constructor(
    private readonly sanitaryService: SanitaryService,
    private readonly farmsService: FarmsService,
  ) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Lister les protocoles sanitaires : référentiel commun + programmes de la ferme',
  })
  @ApiQuery({ name: 'species', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'farmId', required: false })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('species') species?: string,
    @Query('type') type?: string,
    @Query('farmId') farmId?: string,
  ) {
    const scope = await this.farmsService.resourceScope(user, farmId, 'read');
    return this.sanitaryService.listProtocols(scope, species, type);
  }

  @Get(':id')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Détail d’un protocole avec ses étapes' })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'farmId', required: false })
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('farmId') farmId?: string,
  ) {
    const scope = await this.farmsService.resourceScope(user, farmId, 'read');
    return this.sanitaryService.findProtocol(id, scope);
  }

  @Post()
  @Roles(UserRole.PROPRIETAIRE)
  @ApiOperation({
    summary: 'Créer un programme sanitaire personnalisé pour la ferme',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSanitaryProtocolDto,
  ) {
    const scope = await this.farmsService.resourceScope(
      user,
      dto.farmId,
      'write',
    );
    return this.sanitaryService.createProtocol(scope, dto);
  }
}
