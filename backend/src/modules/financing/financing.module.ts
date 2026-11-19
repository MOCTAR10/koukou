import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/services/common.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { AccessCoreModule } from '../access/access-core.module.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { ReferenceConstantsModule } from '../reference-constants/reference-constants.module.js';
import { ConsentService } from './consent.service.js';
import { ConsentTemplate } from './entities/consent-template.entity.js';
import { FarmConsent } from './entities/farm-consent.entity.js';
import { FinancingDisbursement } from './entities/financing-disbursement.entity.js';
import { FinancingDocument } from './entities/financing-document.entity.js';
import { FinancingFile } from './entities/financing-file.entity.js';
import { FinancingInstalment } from './entities/financing-instalment.entity.js';
import { FinancingRepayment } from './entities/financing-repayment.entity.js';
import { FinancingRequirement } from './entities/financing-requirement.entity.js';
import { FinancingStepEvent } from './entities/financing-step-event.entity.js';
import { FarmFinancingController } from './farm-financing.controller.js';
import { FarmFinancingFilesController } from './farm-financing-files.controller.js';
import { FinancingController } from './financing.controller.js';
import { FinancingOverviewService } from './financing-overview.service.js';
import { FinancingPortfolioService } from './financing-portfolio.service.js';
import { FinancingService } from './financing.service.js';
import { FinancingStatementsService } from './financing-statements.service.js';
import { FinancingViewService } from './financing-view.service.js';

/**
 * Financer workspace (BCEG): financing files, document checklist, tranches,
 * schedule, repayments, claim classes, the farmers' consent and the portfolio
 * dashboard. Matrix domain FINANCEMENT; see « Financement (BCEG) » in AGENTS.md.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Farm,
      FinancingFile,
      FinancingStepEvent,
      FinancingRequirement,
      FinancingDocument,
      FinancingDisbursement,
      FinancingInstalment,
      FinancingRepayment,
      ConsentTemplate,
      FarmConsent,
    ]),
    AccessCoreModule,
    AccountingModule,
    CommonModule,
    ProgrammeModule,
    ReferenceConstantsModule,
  ],
  controllers: [FinancingController, FarmFinancingController, FarmFinancingFilesController],
  providers: [
    FinancingViewService,
    FinancingService,
    ConsentService,
    FinancingPortfolioService,
    FinancingOverviewService,
    FinancingStatementsService,
  ],
  exports: [FinancingService],
})
export class FinancingModule {}
