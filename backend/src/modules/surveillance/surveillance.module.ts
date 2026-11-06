import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsModule } from '../farms/farms.module.js';
import { RefItem } from '../programme/entities/ref-item.entity.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { SanitaryAlertTransition } from './entities/sanitary-alert-transition.entity.js';
import { SanitaryAlert } from './entities/sanitary-alert.entity.js';
import { FarmSanitaryAlertsController } from './farm-sanitary-alerts.controller.js';
import { SanitaryAlertsService } from './sanitary-alerts.service.js';
import { SanitaryListsService } from './sanitary-lists.service.js';
import { SanitaryDeclarationsService } from './sanitary-declarations.service.js';
import { SurveillanceController } from './surveillance.controller.js';

/**
 * Official sanitary surveillance (POUFA plan §10, lot L5): `SanitaryAlert`
 * and its circuit, the sanitary lists of the veterinary services. The
 * declarations themselves stay in the sanitary module (`HealthEvent`), which
 * imports this one to open the alert of a suspicion.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SanitaryAlert,
      SanitaryAlertTransition,
      RefItem,
      Farm,
    ]),
    FarmsModule,
    ProgrammeModule,
  ],
  controllers: [SurveillanceController, FarmSanitaryAlertsController],
  providers: [
    SanitaryAlertsService,
    SanitaryListsService,
    // POUFA lot A2 vet: register and validation of the declarations.
    SanitaryDeclarationsService,
  ],
  exports: [SanitaryAlertsService],
})
export class SurveillanceModule {}
