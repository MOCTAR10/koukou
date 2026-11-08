import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { ProgramAccessGuard } from '../../common/guards/program-access.guard.js';
import { AuditModule } from '../audit/audit.module.js';
import { AccessCoreModule } from '../access/access-core.module.js';
import { BuyerProfile } from '../users/entities/buyer-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import { UsersModule } from '../users/users.module.js';
import { FarmsModule } from '../farms/farms.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { resolveJwtSecret } from './auth.secret.js';
import { JwtStrategy } from './jwt.strategy.js';
import { LoginChallenge } from './entities/login-challenge.entity.js';
import { LoginFailure } from './entities/login-failure.entity.js';
import { LoginChallengeService } from './login-challenge.service.js';
import { SMS_SENDER, createSmsSender } from './sms/sms-sender.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, BuyerProfile, LoginChallenge, LoginFailure]),
    UsersModule,
    FarmsModule,
    AccessCoreModule,
    AuditModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  controllers: [AuthController],
  exports: [SMS_SENDER],
  providers: [
    AuthService,
    JwtStrategy,
    LoginChallengeService,
    // SMS_PROVIDER (console only for now; Airtel and Moov come later).
    {
      provide: SMS_SENDER,
      inject: [ConfigService],
      useFactory: createSmsSender,
    },
    // Global guards run in registration order.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ProgramAccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
