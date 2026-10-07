import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Breed } from '../modules/breeds/entities/breed.entity.js';
import { BreedStandard } from '../modules/breeds/entities/breed-standard.entity.js';
import { ReferenceConstant } from '../modules/reference-constants/entities/reference-constant.entity.js';
import { RuleRegistry } from '../modules/alerts/entities/rule-registry.entity.js';
import { SanitaryProtocol } from '../modules/sanitary/entities/sanitary-protocol.entity.js';
import { ProtocolStep } from '../modules/sanitary/entities/protocol-step.entity.js';
import { PaymentMethodConfig } from '../modules/finance/entities/payment-method.entity.js';
import { User } from '../modules/users/entities/user.entity.js';
import { Culture } from '../modules/agriculture/entities/culture.entity.js';
import { DatabaseSeedService } from './database-seed.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReferenceConstant,
      Breed,
      BreedStandard,
      RuleRegistry,
      SanitaryProtocol,
      ProtocolStep,
      PaymentMethodConfig,
      User,
      Culture,
    ]),
  ],
  providers: [DatabaseSeedService],
})
export class DatabaseModule {}
