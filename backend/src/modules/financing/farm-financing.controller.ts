import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { ConsentService } from './consent.service.js';
import { FarmerConsentDto, OptionalReasonDto } from './dto/financing.dto.js';

/**
 * Farmer side of the financing: the consent he gives or withdraws. Domain COMPTE (a Fermia-only domain no
 * institutional matrix can hold): institutions never reach it, and the
 * service lets only the farm's owner or managers write.
 */
@ApiTags('Financement (côté exploitant)')
@Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
@Domain('COMPTE')
@Controller('farms/:farmId/financing')
export class FarmFinancingController {
  constructor(private readonly consents: ConsentService) {}

  @Post('consent')
  @ApiOperation({ summary: 'Donner mon consentement au partage de mes données avec la banque' })
  give(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: FarmerConsentDto,
    @Req() req: Request,
  ) {
    return this.consents.giveOnline(user, farmId, dto, {
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });
  }

  @Post('consent/withdraw')
  @ApiOperation({ summary: 'Retirer mon consentement (immédiat, non rétroactif)' })
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: OptionalReasonDto,
  ) {
    return this.consents.withdrawOnline(user, farmId, dto.reason ?? null);
  }
}
