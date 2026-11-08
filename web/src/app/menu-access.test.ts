import { describe, expect, it } from 'vitest';
import type { AccessMatrix, ScopeKind } from '../api/types-access';
import {
  ACCESS_ADMIN_PATH,
  alwaysOpen,
  canAdministerAccess,
  grantsAccess,
  INSTITUTION_LANDING_ORDER,
  INSTITUTION_MENU,
  institutionLanding,
  institutionReads,
  institutionOpensPath,
  institutionShowsEntry,
  menuRuleFor,
  MY_ACCESS_PATH,
  pagesOfDomain,
  PILOTAGE_PATH,
  scopeReachesFarms,
} from './menu-access';

const p = (scopeKind: ScopeKind, matrix: AccessMatrix) => ({ scopeKind, matrix });

// The seeded system profiles (backend access/data/default-profiles.ts).
const AGENT_TECHNIQUE = p('FARMS', { REGISTRE: ['CONSULTER'], TECHNIQUE: ['CONSULTER', 'VALIDER'], INTRANTS: ['CONSULTER'], PARAMETRES: ['CONSULTER'] });
const DGE = p('ALL', {
  REGISTRE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'],
  TECHNIQUE: ['CONSULTER'],
  INTRANTS: ['CONSULTER', 'VALIDER'],
  ECONOMIQUE: ['CONSULTER'],
  TRACABILITE: ['CONSULTER'],
  PILOTAGE: ['CONSULTER'],
  PARAMETRES: ['CONSULTER', 'MODIFIER'],
});
// The DGE after the « lot A droits » migration: the Fermia modules in consultation.
const DGE_FERMIA = p('ALL', {
  ...DGE.matrix,
  VENTES: ['CONSULTER'],
  MARCHE: ['CONSULTER'],
  COMPTABILITE: ['CONSULTER'],
  EQUIPE: ['CONSULTER'],
});
const VETERINAIRE = p('ALL', { REGISTRE: ['CONSULTER'], SANITAIRE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'], PARAMETRES: ['CONSULTER', 'MODIFIER'] });
const MAEDR = p('AGGREGATE', { PILOTAGE: ['CONSULTER', 'VALIDER'], PARAMETRES: ['CONSULTER'] });
const ANINF = p('AUDIT', { AUDIT: ['CONSULTER'] });
const ADMIN = p('ALL', { REGISTRE: ['CONSULTER'], PARAMETRES: ['CONSULTER', 'MODIFIER'], ADMINISTRATION: ['CONSULTER', 'CREER', 'MODIFIER', 'ADMINISTRER'] });

describe('menuRuleFor', () => {
  it('finds the entry or its closest parent', () => {
    expect(menuRuleFor('/app/sanitary')).toEqual(INSTITUTION_MENU['/app/sanitary']);
    expect(menuRuleFor('/app/finance/caisse')).toEqual(INSTITUTION_MENU['/app/finance']);
    expect(menuRuleFor('/app/settings')?.kind).toBe('never');
    expect(menuRuleFor('/app/acces/profils')).toEqual(INSTITUTION_MENU['/app/acces']);
    expect(menuRuleFor('/app/batches/')).toEqual(INSTITUTION_MENU['/app/batches']);
    expect(menuRuleFor('/app/stock?tab=x')).toEqual(INSTITUTION_MENU['/app/stock']);
    expect(menuRuleFor('/app/unknown')).toBeNull();
    expect(menuRuleFor('/marche')).toBeNull();
  });
});

describe('institution menu', () => {
  it('never shows a Fermia-only area, whatever the profile', () => {
    const everything = p('ALL', {
      REGISTRE: ['CONSULTER'],
      TECHNIQUE: ['CONSULTER'],
      INTRANTS: ['CONSULTER'],
      SANITAIRE: ['CONSULTER'],
      ECONOMIQUE: ['CONSULTER', 'CREER', 'MODIFIER'],
      TRACABILITE: ['CONSULTER'],
      PILOTAGE: ['CONSULTER'],
      PARAMETRES: ['CONSULTER'],
      ADMINISTRATION: ['CONSULTER', 'ADMINISTRER'],
    });
    for (const path of [
      // POUFA lot A droits: the Fermia modules need their own grant, not ECONOMIQUE.
      '/app/finance/ventes',
      '/app/finance/caisse',
      '/app/orders',
      '/app/market',
      '/app/points-of-sale',
      '/app/accounting',
      '/app/team',
      '/app/hr',
      '/app/settings',
      '/app/platform',
      '/app/home',
    ]) {
      expect(institutionShowsEntry(path, everything)).toBe(false);
      expect(institutionOpensPath(path, everything)).toBe(false);
    }
  });

  it('follows the matrix: each page needs « Consulter » on its domain', () => {
    expect(institutionShowsEntry('/app/sanitary', VETERINAIRE)).toBe(true);
    expect(institutionShowsEntry('/app/dashboard', VETERINAIRE)).toBe(false);
    expect(institutionShowsEntry('/app/batches', VETERINAIRE)).toBe(false);
    expect(institutionShowsEntry('/app/dashboard', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/stock', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/slaughter', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/reports', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/sanitary', DGE)).toBe(false);
    expect(institutionShowsEntry('/app/stock', AGENT_TECHNIQUE)).toBe(true);
    expect(institutionShowsEntry('/app/expenses', AGENT_TECHNIQUE)).toBe(false);
    // A write without « Consulter » opens no screen.
    expect(institutionShowsEntry('/app/stock', p('ALL', { INTRANTS: ['MODIFIER'] }))).toBe(false);
  });

  it('always shows the help and the account’s own access', () => {
    expect(institutionShowsEntry('/app/help', ANINF)).toBe(true);
    expect(institutionShowsEntry(MY_ACCESS_PATH, ANINF)).toBe(true);
    expect(alwaysOpen('/app/help')).toBe(true);
    expect(alwaysOpen('/app/dashboard')).toBe(false);
  });

  it('hides an unknown entry but lets an unknown URL open (the server decides)', () => {
    expect(institutionShowsEntry('/app/nouvelle-page', DGE)).toBe(false);
    expect(institutionOpensPath('/app/nouvelle-page', DGE)).toBe(true);
  });

  it('keeps an AUDIT scope to the journal, like the server', () => {
    expect(grantsAccess(p('AUDIT', { TECHNIQUE: ['CONSULTER'] }), 'TECHNIQUE', 'CONSULTER')).toBe(false);
    expect(grantsAccess(ANINF, 'AUDIT', 'CONSULTER')).toBe(true);
  });
});

describe('institutionReads', () => {
  it('reads a programme domain with « Consulter » on it', () => {
    expect(institutionReads(DGE, 'TRACABILITE')).toBe(true);
    expect(institutionReads(AGENT_TECHNIQUE, 'TRACABILITE')).toBe(false);
    expect(institutionReads(AGENT_TECHNIQUE, 'SANITAIRE')).toBe(false);
    expect(institutionReads(VETERINAIRE, 'SANITAIRE')).toBe(true);
    expect(institutionReads(VETERINAIRE, 'TECHNIQUE')).toBe(false);
    // Only « Consulter » opens a read.
    expect(institutionReads(p('ALL', { ECONOMIQUE: ['CREER'] }), 'ECONOMIQUE')).toBe(false);
    // The AUDIT scope reads the journal only.
    expect(institutionReads(ANINF, 'AUDIT')).toBe(true);
    expect(institutionReads(p('AUDIT', { TECHNIQUE: ['CONSULTER'] }), 'TECHNIQUE')).toBe(false);
  });

  it('never reads a never-grantable Fermia domain, even with the access unreadable', () => {
    for (const d of ['CULTURES', 'COMPTE', 'PLATEFORME'] as const) {
      expect(institutionReads(DGE_FERMIA, d)).toBe(false);
      expect(institutionReads(null, d)).toBe(false);
    }
    expect(institutionReads(null, 'TECHNIQUE')).toBe(true);
  });

  // POUFA lot A droits: the Fermia modules, granted in consultation.
  it('reads a Fermia module only when granted, never with the access unreadable', () => {
    for (const d of ['VENTES', 'MARCHE', 'COMPTABILITE', 'EQUIPE'] as const) {
      expect(institutionReads(DGE, d)).toBe(false);
      expect(institutionReads(DGE_FERMIA, d)).toBe(true);
      expect(institutionReads(AGENT_TECHNIQUE, d)).toBe(false);
      expect(institutionReads(null, d)).toBe(false);
    }
  });
});

describe('Fermia modules for institutions (POUFA lot A droits)', () => {
  it('opens each module page with its own domain', () => {
    expect(institutionShowsEntry('/app/finance/ventes', DGE_FERMIA)).toBe(true);
    expect(institutionShowsEntry('/app/finance/caisse', DGE_FERMIA)).toBe(true);
    expect(institutionShowsEntry('/app/orders', DGE_FERMIA)).toBe(true);
    expect(institutionShowsEntry('/app/points-of-sale', DGE_FERMIA)).toBe(true);
    expect(institutionShowsEntry('/app/market', DGE_FERMIA)).toBe(true);
    expect(institutionShowsEntry('/app/accounting', DGE_FERMIA)).toBe(true);
    expect(institutionShowsEntry('/app/hr', DGE_FERMIA)).toBe(true);
    expect(institutionShowsEntry('/app/team', DGE_FERMIA)).toBe(true);
    // Granted separately.
    const caisseOnly = p('ALL', { VENTES: ['CONSULTER'] });
    expect(institutionShowsEntry('/app/finance/caisse', caisseOnly)).toBe(true);
    expect(institutionShowsEntry('/app/accounting', caisseOnly)).toBe(false);
    expect(institutionShowsEntry('/app/hr', caisseOnly)).toBe(false);
  });

  it('keeps the farm settings, platform and ground home closed', () => {
    for (const path of ['/app/settings', '/app/platform', '/app/home', '/app/parcels']) {
      expect(institutionOpensPath(path, DGE_FERMIA)).toBe(false);
    }
  });

  it('opens the expenses and the programme synthesis with ECONOMIQUE', () => {
    expect(institutionShowsEntry('/app/expenses', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/economie', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/economie', AGENT_TECHNIQUE)).toBe(false);
    // The synthesis needs a farm scope: the BCEG (FINANCED) holds ECONOMIQUE but reaches no farm yet.
    expect(institutionShowsEntry('/app/economie', p('FINANCED', { ECONOMIQUE: ['CONSULTER'] }))).toBe(false);
    expect(institutionShowsEntry('/app/economie', p('AGGREGATE', { ECONOMIQUE: ['CONSULTER'] }))).toBe(false);
    // the registry needs a scope that reaches farms (server refuses otherwise)
    expect(institutionShowsEntry('/app/registre', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/registre', p('FINANCED', { REGISTRE: ['CONSULTER'] }))).toBe(false);
    expect(institutionShowsEntry('/app/registre', p('AGGREGATE', { REGISTRE: ['CONSULTER'] }))).toBe(false);
    // data recovery is national only (RecoveryPage + server imports)
    expect(institutionShowsEntry('/app/reprise', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/reprise', p('FINANCED', { REGISTRE: ['CONSULTER'] }))).toBe(false);
    expect(institutionShowsEntry('/app/reprise', AGENT_TECHNIQUE)).toBe(false);
  });
});

describe('access administration', () => {
  it('belongs to the platform admin and to a profile granted ADMINISTRATION', () => {
    expect(canAdministerAccess('PLATFORM_ADMIN', null, 'ADMINISTRER')).toBe(true);
    expect(canAdministerAccess('INSTITUTION', ADMIN)).toBe(true);
    expect(canAdministerAccess('INSTITUTION', ADMIN, 'ADMINISTRER')).toBe(true);
    expect(canAdministerAccess('INSTITUTION', p('ALL', { ADMINISTRATION: ['CONSULTER'] }), 'ADMINISTRER')).toBe(false);
    expect(canAdministerAccess('INSTITUTION', DGE)).toBe(false);
    expect(canAdministerAccess('INSTITUTION', null)).toBe(false);
    expect(canAdministerAccess('PROPRIETAIRE', ADMIN)).toBe(false);
    expect(institutionShowsEntry(ACCESS_ADMIN_PATH, ADMIN)).toBe(true);
    expect(institutionShowsEntry(ACCESS_ADMIN_PATH, DGE)).toBe(false);
  });
});

describe('institutionLanding', () => {
  it('opens the programme steering first when the profile reaches it', () => {
    expect(institutionLanding(DGE, 12)).toBe(PILOTAGE_PATH);
  });

  it('otherwise opens the first page the profile reaches on a farm', () => {
    expect(institutionLanding(AGENT_TECHNIQUE, 3)).toBe('/app/dashboard');
    expect(institutionLanding(VETERINAIRE, 12)).toBe('/app/sanitary');
  });

  it('sends a programme admin with no farm page to the access administration', () => {
    expect(institutionLanding(ADMIN, 12)).toBe(ACCESS_ADMIN_PATH);
  });

  it('sends scopes without farms, and an empty scope, to the access page', () => {
    expect(institutionLanding(p('FINANCED', { TECHNIQUE: ['CONSULTER'] }), 0)).toBe(MY_ACCESS_PATH);
    expect(institutionLanding(AGENT_TECHNIQUE, 0)).toBe(MY_ACCESS_PATH);
    expect(institutionLanding(null, 5)).toBe(MY_ACCESS_PATH);
  });

  it('sends a steering profile without a farm to the programme steering', () => {
    expect(institutionLanding(MAEDR, 0)).toBe(PILOTAGE_PATH);
    expect(institutionLanding(DGE, 0)).toBe(PILOTAGE_PATH);
    expect(institutionShowsEntry(PILOTAGE_PATH, MAEDR)).toBe(true);
    expect(institutionShowsEntry(PILOTAGE_PATH, AGENT_TECHNIQUE)).toBe(false);
    expect(institutionOpensPath('/app/pilotage/rapports', VETERINAIRE)).toBe(false);
  });

  it('sends the ANINF audit account to the journal', () => {
    expect(institutionLanding(ANINF, 0)).toBe('/app/audit');
    expect(institutionShowsEntry('/app/audit', ANINF)).toBe(true);
    expect(institutionShowsEntry('/app/parametres', ANINF)).toBe(false);
    expect(institutionShowsEntry('/app/reprise', ANINF)).toBe(false);
  });

  it('opens the programme administration by domain', () => {
    expect(institutionShowsEntry('/app/parametres', MAEDR)).toBe(true);
    expect(institutionShowsEntry('/app/parametres', p('ALL', { ADMINISTRATION: ['CONSULTER'] }))).toBe(true);
    expect(institutionShowsEntry('/app/parametres/listes', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/reprise', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/audit', DGE)).toBe(false);
  });

  it('only lands on pages of the table (a missing route would loop on /app)', () => {
    for (const path of INSTITUTION_LANDING_ORDER) expect(INSTITUTION_MENU[path]?.kind).toBe('grant');
  });
});

describe('surveillance and notifications (POUFA L5)', () => {
  it('opens the programme surveillance and its settings with SANITAIRE', () => {
    expect(institutionShowsEntry('/app/surveillance', VETERINAIRE)).toBe(true);
    expect(institutionOpensPath('/app/surveillance/parametres', VETERINAIRE)).toBe(true);
    expect(institutionShowsEntry('/app/surveillance', DGE)).toBe(false);
    expect(institutionOpensPath('/app/surveillance', ANINF)).toBe(false);
  });

  it('opens the inbox to every institution, the rules with ADMINISTRATION only', () => {
    expect(alwaysOpen('/app/notifications')).toBe(true);
    expect(institutionOpensPath('/app/notifications', MAEDR)).toBe(true);
    expect(institutionOpensPath('/app/notifications/regles', ADMIN)).toBe(true);
    expect(institutionOpensPath('/app/notifications/regles', VETERINAIRE)).toBe(false);
    expect(alwaysOpen('/app/notifications/regles')).toBe(false);
  });
});

describe('helpers', () => {
  it('scopeReachesFarms matches the server', () => {
    expect((['ALL', 'PROVINCES', 'FARMS'] as ScopeKind[]).every(scopeReachesFarms)).toBe(true);
    expect((['FINANCED', 'OPERATOR', 'AGGREGATE', 'AUDIT'] as ScopeKind[]).some(scopeReachesFarms)).toBe(false);
  });

  it('pagesOfDomain lists the pages a domain opens', () => {
    expect(pagesOfDomain('SANITAIRE')).toEqual(['/app/sanitary', '/app/surveillance', '/app/visites']);
    expect(pagesOfDomain('ECONOMIQUE')).toEqual(['/app/reports', '/app/expenses', '/app/economie']);
    expect(pagesOfDomain('EQUIPE')).toEqual(['/app/team', '/app/hr']);
    expect(pagesOfDomain('AUDIT')).toEqual(['/app/audit']);
  });
});

describe('POUFA visites menu row', () => {
  it('opens the visits to the agent, the DGE and the veterinary services, not to the audit profile', () => {
    expect(menuRuleFor('/app/visites')).toEqual({
      kind: 'grant',
      any: [
        ['TECHNIQUE', 'CONSULTER'],
        ['SANITAIRE', 'CONSULTER'],
      ],
    });
    expect(institutionShowsEntry('/app/visites', VETERINAIRE)).toBe(true);
    expect(institutionShowsEntry('/app/visites', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/visites', ANINF)).toBe(false);
  });
});

describe('POUFA W6 menu rows', () => {
  it('maps the inputs and traceability pages to their domains', () => {
    expect(menuRuleFor('/app/intrants')).toEqual({ kind: 'grant', any: [['INTRANTS', 'CONSULTER']] });
    expect(menuRuleFor('/app/livraisons')).toEqual({ kind: 'grant', any: [['INTRANTS', 'CONSULTER']], farms: true });
    expect(menuRuleFor('/app/tracabilite/operateurs')).toEqual(INSTITUTION_MENU['/app/tracabilite']);
  });
});

describe('farm modules need a scope that reaches farms', () => {
  it('hides them from aggregate, financed and audit scopes, even when the domain is granted', () => {
    const farmPages = ['/app/dashboard', '/app/batches', '/app/sanitary', '/app/stock', '/app/reports', '/app/finance/ventes', '/app/team'];
    const all: AccessMatrix = { TECHNIQUE: ['CONSULTER'], SANITAIRE: ['CONSULTER'], INTRANTS: ['CONSULTER'], ECONOMIQUE: ['CONSULTER'], VENTES: ['CONSULTER'], EQUIPE: ['CONSULTER'] };
    for (const kind of ['AGGREGATE', 'FINANCED', 'AUDIT'] as ScopeKind[]) {
      for (const page of farmPages) expect(institutionShowsEntry(page, p(kind, all))).toBe(false);
    }
    for (const kind of ['ALL', 'PROVINCES', 'FARMS'] as ScopeKind[]) {
      for (const page of farmPages) expect(institutionShowsEntry(page, p(kind, all))).toBe(true);
    }
  });
  it('MAEDR and ANINF see no farm module', () => {
    for (const page of Object.keys(INSTITUTION_MENU).filter((k) => {
      const r = INSTITUTION_MENU[k];
      return r.kind === 'grant' && r.farms;
    })) {
      expect(institutionShowsEntry(page, MAEDR)).toBe(false);
      expect(institutionShowsEntry(page, ANINF)).toBe(false);
    }
  });
});
