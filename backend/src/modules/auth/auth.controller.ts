import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

// Rate limit: the global APP_GUARD ThrottlerGuard applies @Throttle below.
// Adding @UseGuards(ThrottlerGuard) here too counted each request twice.
@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Inscription (Propriétaire)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Connexion (téléphone + code)' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
