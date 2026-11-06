import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessCoreModule } from '../access/access-core.module.js';
import { User } from '../users/entities/user.entity.js';
import { FarmsController } from './farms.controller.js';
import { FarmsService } from './farms.service.js';
import { FarmEmployee } from './entities/farm-employee.entity.js';
import { Farm } from './entities/farm.entity.js';
import { Province } from '../programme/entities/province.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Farm, FarmEmployee, User, Province]),
    AccessCoreModule,
  ],
  controllers: [FarmsController],
  providers: [FarmsService],
  exports: [FarmsService, AccessCoreModule],
})
export class FarmsModule {}
