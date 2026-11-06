import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuditModule } from './modules/audit/audit.module.js';
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
import { MarketModule } from './modules/market/market.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PointsOfSaleModule } from './modules/points-of-sale/points-of-sale.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { WeatherModule } from './modules/weather/weather.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { AdvisoryModule } from './modules/advisory/advisory.module.js';
import { AgricultureModule } from './modules/agriculture/agriculture.module.js';
import { SpatialModule } from './modules/spatial/spatial.module.js';
import { PushModule } from './modules/push/push.module.js';
import { ProgrammeModule } from './modules/programme/programme.module.js';
import { AccessModule } from './modules/access/access.module.js';
import { BandesModule } from './modules/bandes/bandes.module.js';
import { SupplyModule } from './modules/supply/supply.module.js';
import { SyncModule } from './modules/sync/sync.module.js';
import { TraceModule } from './modules/trace/trace.module.js';
import { DatabaseModule } from './database/database.module.js';
import {
  dbConnection,
  schemaOptions,
  type EnvReader,
} from './database/typeorm-options.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: 120,
        },
      ],
      // Test-only escape hatch: the e2e suite logs in hundreds of times from
      // one IP and would trip the auth limits (5-10/min). Set only by
      // test/e2e-setup.ts; never set it in a deployed environment.
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const env: EnvReader = (key, fallback) =>
          String(config.get(key, fallback));
        const db = dbConnection(env);
        await ensurePostgis(
          db.host,
          db.port,
          db.username,
          db.password,
          db.database,
        );
        return {
          type: 'postgres',
          ...db,
          autoLoadEntities: true,
          ...schemaOptions(env),
        };
      },
    }),
    // Before AuthModule: its global guard must run ahead of the auth guards
    // (global guards run in module registration order), see AuditPlanGuard.
    AuditModule,
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
    MarketModule,
    PointsOfSaleModule,
    TasksModule,
    WeatherModule,
    PlatformModule,
    AdvisoryModule,
    SpatialModule,
    AgricultureModule,
    PushModule,
    ProgrammeModule,
    AccessModule,
    BandesModule,
    SupplyModule,
    SyncModule,
    TraceModule,
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

/**
 * Tente d'activer l'extension PostGIS (idempotent) AVANT la connexion TypeORM
 * afin que les migrations et les calculs ST_* fonctionnent dès le démarrage.
 * PostGIS est optionnel : sans lui, le spatial se replie sur le calcul JS
 * (`SpatialService.areaHa`) et l'API reste fonctionnelle.
 */
async function ensurePostgis(
  host: string,
  port: number,
  username: string,
  password: string,
  database: string,
): Promise<void> {
  const client = new Client({ host, port, user: username, password, database });
  try {
    await client.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis');
  } catch (err) {
    console.warn(
      '[PostGIS] Extension indisponible — repli sur le calcul de surface JavaScript.',
      err instanceof Error ? err.message : err,
    );
  } finally {
    try {
      await client.end();
    } catch {
      /* connexion déjà fermée */
    }
  }
}
