import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';
import { MIGRATIONS } from './migrations/index.js';

/** Directory of the compiled `database/` folder (dist/database at runtime). */
const DATABASE_DIR = dirname(fileURLToPath(import.meta.url));

/** Every compiled entity, for the CLI only (it has no `autoLoadEntities`). */
export const ENTITIES_GLOB = join(DATABASE_DIR, '..', '**', '*.entity.js');

export type EnvReader = (key: string, fallback: string) => string;

export interface DbConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export function dbConnection(env: EnvReader): DbConnection {
  return {
    host: env('DB_HOST', 'localhost'),
    port: Number(env('DB_PORT', '5432')),
    username: env('DB_USERNAME', 'postgres'),
    password: env('DB_PASSWORD', 'postgres'),
    database: env('DB_DATABASE', 'koukou_ferme'),
  };
}

/**
 * Connection options shared by the Nest app and the migration CLI, so the
 * two can never disagree on where the schema comes from.
 *
 * The schema is owned by versioned migrations: they run at boot
 * (`DB_MIGRATIONS_RUN`, default true). `DB_SYNCHRONIZE` stays available as a
 * local escape hatch only and now defaults to false.
 */
export function schemaOptions(
  env: EnvReader,
): Pick<
  PostgresConnectionOptions,
  'synchronize' | 'migrations' | 'migrationsRun' | 'migrationsTableName'
> {
  return {
    synchronize: env('DB_SYNCHRONIZE', 'false') === 'true',
    migrations: MIGRATIONS,
    migrationsRun: env('DB_MIGRATIONS_RUN', 'true') === 'true',
    migrationsTableName: 'schema_migrations',
  };
}
