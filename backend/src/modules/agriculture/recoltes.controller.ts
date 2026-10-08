import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { CreateRecolteDto } from './dto/create-recolte.dto.js';
import { RecoltesService } from './recoltes.service.js';

@ApiTags('Récoltes (Agriculture)')
@Controller('farms/:farmId/recoltes')
export class RecoltesController {
  constructor(private readonly recoltesService: RecoltesService) {}

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('agri:gerer')
  @ApiOperation({ summary: 'Journaliser une récolte de parcelle' })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateRecolteDto,
  ) {
    return this.recoltesService.create(user, farmId, dto);
  }

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Journal des récoltes de la ferme' })
  @ApiParam({ name: 'farmId' })
  findAll(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.recoltesService.findAll(user, farmId);
  }

  @Get('stock')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Stock récolté disponible par parcelle (récolté − vendu)',
  })
  @ApiParam({ name: 'farmId' })
  stock(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.recoltesService.stock(user, farmId);
  }
}