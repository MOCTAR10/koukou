import { AccessScopeKind } from '../../../common/enums/access-scope-kind.enum.js';
import type { AccessMatrix } from '../access-domains.js';

/**
 * The seven institutional profiles of the POUFA plan §5.2 (CDC §3); the
 * farmer keeps Fermia's own farm logic and needs no profile. Seeded once per
 * programme (system profiles: tunable, never deleted). Matrices are
 * « Proposé » defaults to validate with the DGE.
 *
 * Profile codes are also the parameters' owner profiles
 * (`parameter-catalog.ts` `OWNER_PROFILE`: DGE, VETERINAIRE, ADMIN).
 */
export interface DefaultProfile {
  code: string;
  label: string;
  scopeKind: AccessScopeKind;
  matrix: AccessMatrix;
}

export const PROFILE_CODES = {
  AGENT_TECHNIQUE: 'AGENT_TECHNIQUE',
  DGE: 'DGE',
  VETERINAIRE: 'VETERINAIRE',
  BCEG: 'BCEG',
  MAEDR: 'MAEDR',
  ANINF: 'ANINF',
  ADMIN: 'ADMIN',
} as const;

export const DEFAULT_PROFILES: readonly DefaultProfile[] = [
  {
    // Visits farms, checks the declarations (CDC §3: « ses fermes »).
    // TECHNIQUE:VALIDER records the farm GPS point on site (CDC n° 2 and the
    // visits of §5.5, « à valider DGE »): PUT /programme/farms/:farmId/gps.
    code: PROFILE_CODES.AGENT_TECHNIQUE,
    label: 'Agent technique',
    scopeKind: AccessScopeKind.FARMS,
    matrix: {
      REGISTRE: ['CONSULTER'],
      TECHNIQUE: ['CONSULTER', 'VALIDER'],
      INTRANTS: ['CONSULTER'],
      PARAMETRES: ['CONSULTER'],
    },
  },
  {
    // Runs the programme: everything but unpublished sanitary detail and
    // revenue domiciliation; validates orders; owns the follow-up parameters.
    code: PROFILE_CODES.DGE,
    label: 'POUFA / DGE',
    scopeKind: AccessScopeKind.ALL,
    matrix: {
      REGISTRE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'],
      TECHNIQUE: ['CONSULTER'],
      // CREER: records the State's input deliveries (POUFA L4).
      INTRANTS: ['CONSULTER', 'CREER', 'VALIDER'],
      ECONOMIQUE: ['CONSULTER'],
      TRACABILITE: ['CONSULTER'],
      PILOTAGE: ['CONSULTER'],
      // POUFA lot A2 divers: CREER = shared breed reference (F8).
      PARAMETRES: ['CONSULTER', 'CREER', 'MODIFIER'],
      // POUFA lot A droits: the Fermia bonus domains, in consultation (user
      // decision 2026-11-06; migration InstitutionFermiaGrants for existing
      // programmes).
      VENTES: ['CONSULTER'],
      MARCHE: ['CONSULTER'],
      COMPTABILITE: ['CONSULTER'],
      EQUIPE: ['CONSULTER'],
    },
  },
  {
    // Sanitary side only: thresholds, vaccination calendar, alerts.
    code: PROFILE_CODES.VETERINAIRE,
    label: 'Services vétérinaires',
    scopeKind: AccessScopeKind.ALL,
    matrix: {
      REGISTRE: ['CONSULTER'],
      SANITAIRE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'],
      PARAMETRES: ['CONSULTER', 'MODIFIER'],
    },
  },
  {
    // Financed farms with the farmer's consent (consent model: later lot).
    code: PROFILE_CODES.BCEG,
    label: 'BCEG',
    scopeKind: AccessScopeKind.FINANCED,
    matrix: {
      REGISTRE: ['CONSULTER'],
      TECHNIQUE: ['CONSULTER'],
      ECONOMIQUE: ['CONSULTER'],
    },
  },
  {
    // Consolidated data only; validates their publication.
    code: PROFILE_CODES.MAEDR,
    label: 'MAEDR',
    scopeKind: AccessScopeKind.AGGREGATE,
    matrix: {
      PILOTAGE: ['CONSULTER', 'VALIDER'],
      PARAMETRES: ['CONSULTER'],
    },
  },
  {
    // Audits from the journal: consult and export it.
    code: PROFILE_CODES.ANINF,
    label: 'ANINF (audit)',
    scopeKind: AccessScopeKind.AUDIT,
    matrix: {
      AUDIT: ['CONSULTER'],
    },
  },
  {
    // Accounts, rights, lists and territories of the programme.
    code: PROFILE_CODES.ADMIN,
    label: 'Administrateur du programme',
    scopeKind: AccessScopeKind.ALL,
    matrix: {
      REGISTRE: ['CONSULTER'],
      PARAMETRES: ['CONSULTER', 'MODIFIER'],
      ADMINISTRATION: ['CONSULTER', 'CREER', 'MODIFIER', 'ADMINISTRER'],
    },
  },
];
