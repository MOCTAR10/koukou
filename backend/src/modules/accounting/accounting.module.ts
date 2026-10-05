import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/services/common.module.js';
import { FarmsModule } from '../farms/farms.module.js';
import { Account } from './entities/account.entity.js';
import { Exercice } from './entities/exercice.entity.js';
import { JournalEntry } from './entities/journal-entry.entity.js';
import { JournalEntryLine } from './entities/journal-entry-line.entity.js';
import { AccountingService } from './accounting.service.js';
import { AccountingController } from './accounting.controller.js';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([Account, Exercice, JournalEntry, JournalEntryLine]),
    FarmsModule,
  ],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}