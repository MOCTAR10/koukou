import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farm } from '../farms/entities/farm.entity.js';
import { AccessProfile } from './entities/access-profile.entity.js';
import { ProgramMembership } from './entities/program-membership.entity.js';
import { SanitaryDeclarationPolicy } from './sanitary-declaration.policy.js';
import { ScopeResolver } from './scope-resolver.service.js';

/**
 * Institutional access core: membership lookup and scope. It depends on no
 * farms or programme service, so `FarmsModule`, `AuthModule` (global guard)
 * and every feature module can import it without a cycle.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccessProfile, ProgramMembership, Farm])],
  providers: [ScopeResolver, SanitaryDeclarationPolicy],
  exports: [ScopeResolver, SanitaryDeclarationPolicy],
})
export class AccessCoreModule {}
