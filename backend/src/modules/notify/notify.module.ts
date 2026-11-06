import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessProfile } from '../access/entities/access-profile.entity.js';
import { ProgramMembership } from '../access/entities/program-membership.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { Program } from '../programme/entities/program.entity.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { PushModule } from '../push/push.module.js';
import { User } from '../users/entities/user.entity.js';
import { NotificationRule } from './entities/notification-rule.entity.js';
import { Notification } from './entities/notification.entity.js';
import { NotificationRulesController } from './notification-rules.controller.js';
import { NotificationRulesService } from './notification-rules.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotifyService } from './notify.service.js';

/**
 * Notifications (architecture §12, lot L5): in-app inbox, push, SMS and
 * escalation, driven by `koukouBus` events and the rules the
 * administration edits. SMS go through `AuthModule`'s `SMS_SENDER`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationRule,
      Farm,
      FarmEmployee,
      User,
      ProgramMembership,
      AccessProfile,
      Program,
    ]),
    AuthModule,
    PushModule,
    ProgrammeModule,
  ],
  controllers: [NotificationsController, NotificationRulesController],
  providers: [NotifyService, NotificationRulesService],
  exports: [NotifyService],
})
export class NotifyModule {}
