import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { PushDevice } from './entities/push-device.entity.js';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([PushDevice, Farm, FarmEmployee])],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
