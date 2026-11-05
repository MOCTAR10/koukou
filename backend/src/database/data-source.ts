import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import {
  dbConnection,
  ENTITIES_GLOB,
  schemaOptions,
  type EnvReader,
} from './typeorm-options.js';

/**
 * Data source for the TypeORM CLI only (`npm run migration:*`, run from
 * `backend/` after `npm run build`). The app builds its own connection in
 * `app.module.ts` from the same options.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

const env: EnvReader = (key, fallback) => process.env[key] ?? fallback;

export default new DataSource({
  type: 'postgres',
  ...dbConnection(env),
  entities: [ENTITIES_GLOB],
  ...schemaOptions(env),
  // The CLI applies migrations explicitly; never on load.
  migrationsRun: false,
  synchronize: false,
});
