import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditRead } from '../../common/decorators/audit.decorator.js';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { AccessAdminService } from './access-admin.service.js';
import {
  CreateAccessProfileDto,
  CreateMembershipDto,
  UpdateAccessProfileDto,
  UpdateMembershipDto,
} from './dto/access.dto.js';

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Institutional access of the programme (POUFA plan §5.2): access profiles
 * and the memberships of institutional accounts. Platform admin, or an
 * institutional profile granted ADMINISTRATION.
 */
@ApiTags('Programme (POUFA) — accès institutionnels')
@Domain('ADMINISTRATION')
@Controller('programme/access')
export class AccessAdminController {
  constructor(private readonly access: AccessAdminService) {}

  @Get('me')
  @Domain('SESSION')
  @Roles(UserRole.INSTITUTION)
  @ApiOperation({
    summary: 'Mon accès (compte institutionnel) : profil, matrice, périmètre',
  })
  me(@CurrentUser() user: AuthUser) {
    return this.access.me(user);
  }

  @Get('catalog')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Domaines, actions et périmètres disponibles' })
  catalog() {
    return this.access.catalog();
  }

  @Get('profiles')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: "Profils d'accès du programme" })
  profiles() {
    return this.access.listProfiles();
  }

  @Post('profiles')
  @Roles(UserRole.PLATFORM_ADMIN)
  @Action('ADMINISTRER')
  @ApiOperation({ summary: "Créer un profil d'accès (non système)" })
  createProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAccessProfileDto,
  ) {
    return this.access.createProfile(user, dto);
  }

  @Patch('profiles/:id')
  @Roles(UserRole.PLATFORM_ADMIN)
  @Action('ADMINISTRER')
  @ApiOperation({
    summary:
      "Modifier un profil (libellé, matrice ; le périmètre d'un profil système ne change pas)",
  })
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateAccessProfileDto,
  ) {
    return this.access.updateProfile(user, id, dto);
  }

  @Delete('profiles/:id')
  @Roles(UserRole.PLATFORM_ADMIN)
  @Action('ADMINISTRER')
  @ApiOperation({
    summary: 'Supprimer un profil non système sans compte rattaché',
  })
  deleteProfile(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.access.deleteProfile(user, id);
  }

  @Get('memberships')
  @Roles(UserRole.PLATFORM_ADMIN)
  @AuditRead('Comptes institutionnels et rattachements (administration)')
  @ApiOperation({ summary: 'Comptes institutionnels et leurs rattachements' })
  memberships() {
    return this.access.listMemberships();
  }

  @Post('memberships')
  @Roles(UserRole.PLATFORM_ADMIN)
  @Action('ADMINISTRER')
  @ApiOperation({
    summary:
      'Créer un compte institutionnel et son rattachement (code de connexion renvoyé une seule fois)',
  })
  createMembership(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMembershipDto,
  ) {
    return this.access.createMembership(user, dto);
  }

  @Patch('memberships/:id')
  @Roles(UserRole.PLATFORM_ADMIN)
  @Action('ADMINISTRER')
  @ApiOperation({
    summary:
      'Changer le profil ou le périmètre, suspendre (active: false), fixer la fin de validité',
  })
  updateMembership(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.access.updateMembership(user, id, dto);
  }
}
