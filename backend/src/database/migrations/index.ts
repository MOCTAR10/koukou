import { Baseline1793909600725 } from './1793909600725-Baseline.js';
import { BandsNeverDeleted1793909660080 } from './1793909660080-BandsNeverDeleted.js';

/**
 * Every migration, in order. Listed as classes rather than a file glob so the
 * same list works compiled (dist) and from the TypeScript sources (vitest e2e).
 * Register each new generated migration here; `migration:check` fails in CI
 * when one is forgotten, since its change then never reaches the database.
 */
export const MIGRATIONS = [
  Baseline1793909600725,
  BandsNeverDeleted1793909660080,
];
