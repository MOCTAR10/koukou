import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { PERMISSION_GROUPS } from '../../common/permissions/permission-catalog.js';
import { FarmsService } from './farms.service.js';
import type { UploadedImageFile } from './farms.service.js';
import { CreateElevageDto } from './dto/create-eleveur.dto.js';
import { UpdateEleveurDto } from './dto/update-eleveur.dto.js';
import { CreateFarmDto } from './dto/create-farm.dto.js';
import { UpdateFarmSettingsDto } from './dto/update-farm-settings.dto.js';

@ApiTags('Fermes')
@Controller('farms')
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Post()
  @Roles(UserRole.PROPRIETAIRE)
  @ApiOperation({ summary: 'Créer une ferme (Propriétaire)' })
  createFarm(@CurrentUser() user: AuthUser, @Body() dto: CreateFarmDto) {
    return this.farmsService.create(user, dto);
  }

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Lister mes fermes (selon rôle)' })
  findMine(@CurrentUser() user: AuthUser) {
    return this.farmsService.findMine(user);
  }

  @Patch(':farmId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('reglages:ferme')
  @ApiOperation({
    summary:
      "Modifier les paramètres de la ferme (nom, ville, poids du sac). Propriétaire ou membre avec « reglages:ferme ».",
  })
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: UpdateFarmSettingsDto,
  ) {
    return this.farmsService.updateFarm(user, farmId, dto);
  }

  @Post(':farmId/logo')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('reglages:ferme')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary:
      'Envoyer le logo de la ferme (PNG/JPEG/WEBP, 2 Mo max). Multipart « file ».',
  })
  async uploadLogo(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @UploadedFile() file: UploadedImageFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu (champ « file »).');
    }
    const farm = await this.farmsService.assertAccessible(user, farmId);
    return this.farmsService.setFarmLogo(farm, file);
  }

  @Delete(':farmId/logo')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('reglages:ferme')
  @ApiOperation({
    summary:
      'Retirer le logo personnalisé de la ferme — retour au logo KouKou par défaut.',
  })
  async removeLogo(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
  ) {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    return this.farmsService.clearFarmLogo(farm);
  }

  @Post(':farmId/eleveurs')  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('equipe:gerer')
  @ApiOperation({
    summary:
      'Créer un compte membre (Administrateur KouKou ou Éleveur Koukou) et le lier à la ferme',
  })
  createEleveur(
    @CurrentUser() owner: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateElevageDto,
  ) {
    return this.farmsService.createEmployee(owner, farmId, dto);
  }

  @Patch(':farmId/eleveurs/:employmentId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('equipe:gerer')
  @ApiOperation({
    summary:
      'Éditer un membre : poste, rôle, bâtiment, suspension, permissions (Administrateur)',
  })
  updateEleveur(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('employmentId') employmentId: string,
    @Body() dto: UpdateEleveurDto,
  ) {
    return this.farmsService.updateEmployee(user, farmId, employmentId, dto);
  }

  @Get(':farmId/eleveurs')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('equipe:gerer')
  @ApiOperation({ summary: 'Lister les membres de la ferme' })
  async listEleveurs(
    @CurrentUser() owner: AuthUser,
    @Param('farmId') farmId: string,
  ) {
    await this.farmsService.assertAccessible(owner, farmId);
    return this.farmsService.listEmployees(farmId);
  }

  @Get(':farmId/me')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Mon profil sur la ferme : rôle, intitulé du poste, droits effectifs',
  })
  async me(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.farmsService.profileOf(user, farmId);
  }

  @Get(':farmId/permissions')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('equipe:gerer')
  @ApiOperation({
    summary: 'Catalogue des permissions accordables aux membres (gestion d’équipe)',
  })
  async permissions(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    return PERMISSION_GROUPS;
  }

  @Get(':farmId/team')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('equipe:taches')
  @ApiOperation({
    summary:
      'Équipe assignable à des tâches : membres actifs (id, userId, fullName, rôle)',
  })
  async team(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.farmsService.listAssignableTeam(user, farmId);
  }
}