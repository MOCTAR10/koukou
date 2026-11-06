import { Baseline1793909600725 } from './1793909600725-Baseline.js';
import { BandsNeverDeleted1793909660080 } from './1793909660080-BandsNeverDeleted.js';
import { ProgrammeModule1793911267753 } from './1793911267753-ProgrammeModule.js';
import { AuditJournal1793911381642 } from './1793911381642-AuditJournal.js';
import { AuditProgrammeTables1793912000000 } from './1793912000000-AuditProgrammeTables.js';
import { FarmRegistry1793912829244 } from './1793912829244-FarmRegistry.js';
import { AuditFarmRegistryTables1793913000000 } from './1793913000000-AuditFarmRegistryTables.js';
import { InstitutionalAccess1793915009645 } from './1793915009645-InstitutionalAccess.js';
import { AuditInstitutionalAccessTables1793915100000 } from './1793915100000-AuditInstitutionalAccessTables.js';
import { PoufaBandes1793916683635 } from './1793916683635-PoufaBandes.js';
import { FarmsAlwaysProgramme1793922775025 } from './1793922775025-FarmsAlwaysProgramme.js';
import { InputDeliveries1793958404106 } from './1793958404106-InputDeliveries.js';
import { Traceability1793958553940 } from './1793958553940-Traceability.js';
import { PilotageReports1793958852697 } from './1793958852697-PilotageReports.js';
import { SanitarySurveillanceNotify1793958965095 } from './1793958965095-SanitarySurveillanceNotify.js';
import { DataRecovery1793959230932 } from './1793959230932-DataRecovery.js';
// POUFA lot A pilot: report notifications and default recipients.
import { PilotReportsSent1794000100000 } from './1794000100000-PilotReportsSent.js';
// POUFA lot A bande: weighing reminder to the whole farm team.
import { WeighingReminderTeam1794000400000 } from './1794000400000-WeighingReminderTeam.js';
// POUFA lot A droits (begin)
import { InstitutionFermiaGrants1794000500000 } from './1794000500000-InstitutionFermiaGrants.js';
import { AuditMaskSalaries1794000500100 } from './1794000500100-AuditMaskSalaries.js';
// POUFA lot A droits (end)
// POUFA lot A2 divers
import { SlaughterOrderOperator1794100500000 } from './1794100500000-SlaughterOrderOperator.js';
import { BreedReferenceRight1794100500100 } from './1794100500100-BreedReferenceRight.js';
// POUFA lot A sante: CDC n° 22-23 (treatments, vaccinations, offline keys).
import { SanitaryConformity1794000300000 } from './1794000300000-SanitaryConformity.js';

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
  PoufaBandes1793916683635,
  FarmsAlwaysProgramme1793922775025,
  InputDeliveries1793958404106,
  Traceability1793958553940,
  PilotageReports1793958852697,
  SanitarySurveillanceNotify1793958965095,
  DataRecovery1793959230932,
  // POUFA lot A pilot.
  PilotReportsSent1794000100000,
  // POUFA lot A sante
  SanitaryConformity1794000300000,
  // POUFA lot A bande
  WeighingReminderTeam1794000400000,
  // POUFA lot A droits (begin)
  InstitutionFermiaGrants1794000500000,
  AuditMaskSalaries1794000500100,
  // POUFA lot A droits (end)
  // POUFA lot A2 divers (begin)
  SlaughterOrderOperator1794100500000,
  BreedReferenceRight1794100500100,
  // POUFA lot A2 divers (end)
];
