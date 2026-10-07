import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';
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
import { AgricultureModule } from './modules/agriculture/agriculture.module.js';
import { SpatialModule } from './modules/spatial/spatial.module.js';
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
      useFactory: async (config: ConfigService) => {
        const host = config.get('DB_HOST', 'localhost');
        const port = config.get<number>('DB_PORT', 5432);
        const username = config.get('DB_USERNAME', 'postgres');
        const password = config.get('DB_PASSWORD', 'postgres');
        const database = config.get('DB_DATABASE', 'koukou_ferme');
        await ensurePostgis(host, port, username, password, database);
        return {
          type: 'postgres',
          host,
          port,
          username,
          password,
          database,
          autoLoadEntities: true,
          synchronize: config.get('DB_SYNCHRONIZE', 'true') === 'true',
        };
      },
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
    SpatialModule,
    AgricultureModule,
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
 * afin que `synchronize` et les calculs ST_* fonctionnent dès le démarrage.
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
