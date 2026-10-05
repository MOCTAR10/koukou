import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { User } from '../users/entities/user.entity.js';
import { UsersModule } from '../users/users.module.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsModule } from '../farms/farms.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { resolveJwtSecret } from './auth.secret.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Farm]),
    UsersModule,
    FarmsModule,
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
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
