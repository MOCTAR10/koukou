import { Module } from '@nestjs/common';
import { ProgrammeModule } from '../programme/programme.module.js';
import { AccessAdminController } from './access-admin.controller.js';
import { AccessAdminService } from './access-admin.service.js';
import { AccessCoreModule } from './access-core.module.js';

/**
 * Institutional access (POUFA plan §5): administration of the profiles and
 * memberships. The scope itself lives in `AccessCoreModule`, the route
 * decision in the global `ProgramAccessGuard`; the seven system profiles are
 * seeded with the programme (`ProgrammeSeedService`).
 */
@Module({
  imports: [AccessCoreModule, ProgrammeModule],
  controllers: [AccessAdminController],
  providers: [AccessAdminService],
})
export class AccessModule {}
