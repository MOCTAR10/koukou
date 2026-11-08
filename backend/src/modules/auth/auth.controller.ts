import { Body, Controller, Get, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { AuthService } from './auth.service.js';
import { BuyerProfileDto, RegisterBuyerDto } from './dto/buyer.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { Domain } from '../../common/decorators/domain.decorator.js';

// Rate limit: the global APP_GUARD ThrottlerGuard applies @Throttle below.
// Adding @UseGuards(ThrottlerGuard) here too counted each request twice.
@ApiTags('Authentification')
@Domain('COMPTE')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('register-buyer')
  @ApiOperation({ summary: 'Inscription d’un acheteur du Market (sans ferme)' })
  registerBuyer(@Body() dto: RegisterBuyerDto) {
    return this.authService.registerBuyer(dto);
  }

  @Get('buyer-profile')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR, UserRole.ACHETEUR)
  @ApiOperation({ summary: 'Mon profil d’acheteur (null si aucun)' })
  buyerProfile(@CurrentUser() user: AuthUser) {
    return this.authService.getBuyerProfile(user);
  }

  @Put('buyer-profile')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR, UserRole.ACHETEUR)
  @ApiOperation({ summary: 'Créer ou modifier mon profil d’acheteur' })
  saveBuyerProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: BuyerProfileDto,
  ) {
    return this.authService.saveBuyerProfile(user, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @Post('login')
  @ApiOperation({
    summary:
      'Connexion (téléphone + code). Compte institutionnel : renvoie otpRequired et envoie un code par SMS',
  })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @Post('login/otp')
  @ApiOperation({
    summary:
      'Connexion d’un compte institutionnel, 2e étape : code reçu par SMS (session de 8 h)',
  })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }
}
