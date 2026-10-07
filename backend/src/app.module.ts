import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BreedsModule } from './modules/breeds/breeds.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { FarmsModule } from './modules/farms/farms.module.js';
import { BuildingsModule } from './modules/buildings/buildings.module.js';
import { BatchesModule } from './modules/batches/batches.module.js';
import { DailyEntriesModule } from './modules/daily-entries/daily-entries.module.js';
import { InputsModule } from './modules/inputs/inputs.module.js';
import { AlertsModule } from './modules/alerts/alerts.module.js';
import { ReferenceConstantsModule } from './modules/reference-constants/reference-constants.module.js';
import { SanitaryModule } from './modules/sanitary/sanitary.module.js';
import { FeedStockModule } from './modules/feed-stock/feed-stock.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { SlaughterModule } from './modules/slaughter/slaughter.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PointsOfSaleModule } from './modules/points-of-sale/points-of-sale.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { WeatherModule } from './modules/weather/weather.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { AdvisoryModule } from './modules/advisory/advisory.module.js';
import { DatabaseModule } from './database/database.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_DATABASE', 'koukou_ferme'),
        autoLoadEntities: true,
        synchronize: config.get('DB_SYNCHRONIZE', 'true') === 'true',
      }),
    }),
    AuthModule,
    UsersModule,
    FarmsModule,
    BuildingsModule,
    BreedsModule,
    BatchesModule,
    DailyEntriesModule,
    InputsModule,
    AlertsModule,
    ReferenceConstantsModule,
    SanitaryModule,
    FeedStockModule,
    FinanceModule,
    SlaughterModule,
    OrdersModule,
    PointsOfSaleModule,
    TasksModule,
    WeatherModule,
    PlatformModule,
    AdvisoryModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
