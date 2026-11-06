import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferenceConstant } from './entities/reference-constant.entity.js';
import { ReferenceConstantsService } from './reference-constants.service.js';
import { ReferenceConstantsController } from './reference-constants.controller.js';
import { AccessCoreModule } from '../access/access-core.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([ReferenceConstant]), AccessCoreModule],
  controllers: [ReferenceConstantsController],
  providers: [ReferenceConstantsService],
  exports: [ReferenceConstantsService],
})
export class ReferenceConstantsModule {}
