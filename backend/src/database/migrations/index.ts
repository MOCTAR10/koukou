import { Baseline1793909600725 } from './1793909600725-Baseline.js';
import { BandsNeverDeleted1793909660080 } from './1793909660080-BandsNeverDeleted.js';
import { ProgrammeModule1793911267753 } from './1793911267753-ProgrammeModule.js';
import { AuditJournal1793911381642 } from './1793911381642-AuditJournal.js';
import { AuditProgrammeTables1793912000000 } from './1793912000000-AuditProgrammeTables.js';
import { FarmRegistry1793912829244 } from './1793912829244-FarmRegistry.js';
import { AuditFarmRegistryTables1793913000000 } from './1793913000000-AuditFarmRegistryTables.js';
import { InstitutionalAccess1793915009645 } from './1793915009645-InstitutionalAccess.js';
import { AuditInstitutionalAccessTables1793915100000 } from './1793915100000-AuditInstitutionalAccessTables.js';

/**
 * Every migration, in order. Listed as classes rather than a file glob so the
 * same list works compiled (dist) and from the TypeScript sources (vitest e2e).
 * Register each new generated migration here; `migration:check` fails in CI
 * when one is forgotten, since its change then never reaches the database.
 */
export const MIGRATIONS = [
  Baseline1793909600725,
  BandsNeverDeleted1793909660080,
  ProgrammeModule1793911267753,
  AuditJournal1793911381642,
  AuditProgrammeTables1793912000000,
  FarmRegistry1793912829244,
  AuditFarmRegistryTables1793913000000,
  InstitutionalAccess1793915009645,
  AuditInstitutionalAccessTables1793915100000,
];
