import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { PERMISSIONS } from '../../common/permissions/permission-catalog.js';
import { OWNER_PROFILE } from '../programme/parameter-catalog.js';
import {
  FERMIA_DOMAINS,
  actionForMethod,
  isInstitutionFermiaDomain,
} from './access-domains.js';
import {
  consults,
  decideRoute,
  decideRouteAny,
  farmScopeSql,
  includesFarm,
  includesProvince,
  isMembershipEffective,
  matrixExcess,
  grantRefusal,
  isNationalAdministrator,
  matrixExcessRefusal,
  mayChangeParameter,
  scopeExcess,
  scopeKindRefusal,
  validateMatrix,
  type InstitutionAccess,
} from './access-rules.js';
import { DEFAULT_PROFILES, PROFILE_CODES } from './data/default-profiles.js';
import {
  PERMISSION_DOMAINS,
  institutionPermissions,
} from './permission-domains.js';
import { mayHandleSanitaryDeclarations } from './sanitary-declaration.policy.js';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';
const G1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const G2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const FARM_A = 'bbbbbbbb-0000-4000-8000-00000000000a';
const FARM_B = 'bbbbbbbb-0000-4000-8000-00000000000b';

function access(
  code: string,
  extra: Partial<InstitutionAccess> = {},
): InstitutionAccess {
  const p = DEFAULT_PROFILES.find((d) => d.code === code);
  if (!p) throw new Error(code);
  return {
    membershipId: 'm',
    userId: 'u',
    programId: PROGRAM,
    profileId: `p-${code}`,
    profileCode: p.code,
    profileLabel: p.label,
    scopeKind: p.scopeKind,
    matrix: p.matrix,
    provinceIds: [],
    farmIds: [],
    operatorId: null,
    ...extra,
  };
}

const farmA = { id: FARM_A, programId: PROGRAM, provinceId: G1 };
const farmB = { id: FARM_B, programId: PROGRAM, provinceId: G2 };

describe('default profiles', () => {
  it('are the seven profiles of the plan, all valid', () => {
    expect(DEFAULT_PROFILES.map((p) => p.code).sort()).toEqual(
      Object.values(PROFILE_CODES).sort(),
    );
    expect(DEFAULT_PROFILES).toHaveLength(7);
    for (const p of DEFAULT_PROFILES) {
      const checked = validateMatrix(p.matrix, p.scopeKind);
      expect(checked, p.code).toEqual({ ok: true, matrix: p.matrix });
    }
  });

  it('cover every parameter owner profile', () => {
    for (const owner of Object.values(OWNER_PROFILE)) {
      expect(
        DEFAULT_PROFILES.some((p) => p.code === owner),
        owner,
      ).toBe(true);
    }
  });

  it('never grant a never-grantable Fermia domain, the bonus ones only to the DGE in consultation', () => {
    for (const p of DEFAULT_PROFILES) {
      for (const d of FERMIA_DOMAINS) {
        if (!isInstitutionFermiaDomain(d) || p.code !== 'DGE') {
          expect(Object.keys(p.matrix), `${p.code} ${d}`).not.toContain(d);
        } else {
          expect(p.matrix[d]).toEqual(['CONSULTER']);
        }
      }
    }
  });
});

describe('actionForMethod', () => {
  it('maps HTTP verbs to actions', () => {
    expect(actionForMethod('GET')).toBe('CONSULTER');
    expect(actionForMethod('post')).toBe('CREER');
    expect(actionForMethod('PATCH')).toBe('MODIFIER');
    expect(actionForMethod('PUT')).toBe('MODIFIER');
    expect(actionForMethod('DELETE')).toBe('MODIFIER');
  });
});

describe('decideRoute', () => {
  it('denies by default: no domain, or no membership', () => {
    expect(decideRoute(access('DGE'), undefined, 'CONSULTER').allowed).toBe(
      false,
    );
    expect(decideRoute(null, 'REGISTRE', 'CONSULTER').allowed).toBe(false);
  });

  it('follows the matrix', () => {
    const dge = access('DGE');
    expect(decideRoute(dge, 'REGISTRE', 'CREER').allowed).toBe(true);
    expect(decideRoute(dge, 'TECHNIQUE', 'CONSULTER').allowed).toBe(true);
    expect(decideRoute(dge, 'TECHNIQUE', 'CREER').allowed).toBe(false);
    expect(decideRoute(dge, 'SANITAIRE', 'CONSULTER').allowed).toBe(false);
    expect(decideRoute(dge, 'ADMINISTRATION', 'ADMINISTRER').allowed).toBe(
      false,
    );
    const denied = decideRoute(dge, 'TECHNIQUE', 'CREER');
    expect(denied.allowed === false && denied.reason).toContain('POUFA / DGE');
  });

  it('opens a Fermia bonus domain granted in consultation, never the others', () => {
    const dge = access('DGE');
    expect(decideRoute(dge, 'VENTES', 'CONSULTER').allowed).toBe(true);
    expect(decideRoute(dge, 'VENTES', 'CREER').allowed).toBe(false);
    const forged = access('DGE', {
      matrix: { PLATEFORME: ['CONSULTER'], CULTURES: ['MODIFIER'] } as never,
    });
    expect(decideRoute(forged, 'PLATEFORME', 'CONSULTER').allowed).toBe(false);
    expect(decideRoute(forged, 'CULTURES', 'MODIFIER').allowed).toBe(false);
    expect(decideRoute(access('AGENT_TECHNIQUE'), 'VENTES', 'CONSULTER').allowed).toBe(false);
  });

  it('accepts an alternative grant (@AlsoGrantedBy)', () => {
    const agent = access('AGENT_TECHNIQUE');
    expect(decideRoute(agent, 'REGISTRE', 'MODIFIER').allowed).toBe(false);
    expect(
      decideRouteAny(agent, 'REGISTRE', 'MODIFIER', [['TECHNIQUE', 'VALIDER']]).allowed,
    ).toBe(true);
    const vet = decideRouteAny(access('VETERINAIRE'), 'REGISTRE', 'MODIFIER', [['TECHNIQUE', 'VALIDER']]);
    expect(vet.allowed === false && vet.reason).toContain('Registre');
    expect(decideRouteAny(null, 'REGISTRE', 'MODIFIER', [['TECHNIQUE', 'VALIDER']]).allowed).toBe(false);
  });

  it('consults: the matrix, never outside the journal for an audit scope', () => {
    expect(consults(access('DGE'), 'ECONOMIQUE')).toBe(true);
    expect(consults(access('AGENT_TECHNIQUE'), 'ECONOMIQUE')).toBe(false);
    expect(consults(access('ANINF'), 'AUDIT')).toBe(true);
    expect(consults(access('ANINF', { matrix: { REGISTRE: ['CONSULTER'] } }), 'REGISTRE')).toBe(false);
  });

  it('keeps the audit scope on the journal only', () => {
    const aninf = access('ANINF');
    expect(decideRoute(aninf, 'AUDIT', 'CONSULTER').allowed).toBe(true);
    expect(decideRoute(aninf, 'REGISTRE', 'CONSULTER').allowed).toBe(false);
    expect(decideRoute(access('DGE'), 'AUDIT', 'CONSULTER').allowed).toBe(
      false,
    );
  });

  it('opens SESSION to any member', () => {
    expect(decideRoute(access('MAEDR'), 'SESSION', 'CONSULTER').allowed).toBe(
      true,
    );
    expect(decideRoute(null, 'SESSION', 'CONSULTER').allowed).toBe(false);
  });

  it('opens REFERENCE to any member, the audit scope included, never in a matrix', () => {
    for (const code of ['MAEDR', 'ANINF', 'BCEG', 'AGENT_TECHNIQUE']) {
      expect(decideRoute(access(code), 'REFERENCE', 'CONSULTER').allowed).toBe(
        true,
      );
    }
    expect(decideRoute(null, 'REFERENCE', 'CONSULTER').allowed).toBe(false);
    const refused = validateMatrix(
      { REFERENCE: ['CONSULTER'] },
      AccessScopeKind.ALL,
    );
    expect(refused.ok).toBe(false);
  });
});

describe('scope', () => {
  it('ALL: every farm of the programme, never one of another programme', () => {
    const dge = access('DGE');
    expect(includesFarm(dge, farmA)).toBe(true);
    expect(includesFarm(dge, farmB)).toBe(true);
    expect(includesFarm(dge, { ...farmA, programId: OTHER_PROGRAM })).toBe(
      false,
    );
  });

  it('PROVINCES: farms of those provinces', () => {
    const custom = access('DGE', {
      scopeKind: AccessScopeKind.PROVINCES,
      provinceIds: [G1],
    });
    expect(includesFarm(custom, farmA)).toBe(true);
    expect(includesFarm(custom, farmB)).toBe(false);
    expect(includesProvince(custom, G1)).toBe(true);
    expect(includesProvince(custom, G2)).toBe(false);
  });

  it('FARMS: the listed farms only', () => {
    const agent = access('AGENT_TECHNIQUE', { farmIds: [FARM_B] });
    expect(includesFarm(agent, farmA)).toBe(false);
    expect(includesFarm(agent, farmB)).toBe(true);
    expect(includesProvince(agent, G2)).toBe(false);
  });

  it('AGGREGATE, AUDIT and FINANCED (no consent model yet): no farm', () => {
    for (const code of ['MAEDR', 'ANINF', 'BCEG']) {
      expect(includesFarm(access(code), farmA), code).toBe(false);
      expect(farmScopeSql(access(code), 'f').sql, code).toBe('1 = 0');
    }
  });

  it('gives the SQL condition of the scope', () => {
    expect(farmScopeSql(access('DGE'), 'f')).toEqual({
      sql: 'f.program_id = :scopeProgramId',
      params: { scopeProgramId: PROGRAM },
    });
    expect(
      farmScopeSql(
        access('DGE', {
          scopeKind: AccessScopeKind.PROVINCES,
          provinceIds: [G1, G2],
        }),
        'farm',
      ),
    ).toEqual({
      sql: 'farm.program_id = :scopeProgramId AND farm.province_id IN (:...scopeProvinceIds)',
      params: { scopeProgramId: PROGRAM, scopeProvinceIds: [G1, G2] },
    });
    expect(
      farmScopeSql(access('AGENT_TECHNIQUE', { farmIds: [FARM_A] }), 'f'),
    ).toEqual({
      sql: 'f.program_id = :scopeProgramId AND f.id IN (:...scopeFarmIds)',
      params: { scopeProgramId: PROGRAM, scopeFarmIds: [FARM_A] },
    });
    expect(farmScopeSql(access('AGENT_TECHNIQUE'), 'f').sql).toBe('1 = 0');
  });
});

describe('isMembershipEffective', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  it('needs active and not expired', () => {
    expect(isMembershipEffective({ active: true, validUntil: null }, now)).toBe(
      true,
    );
    expect(
      isMembershipEffective({ active: false, validUntil: null }, now),
    ).toBe(false);
    expect(
      isMembershipEffective(
        { active: true, validUntil: new Date('2026-11-05T11:59:59Z') },
        now,
      ),
    ).toBe(false);
    expect(
      isMembershipEffective(
        { active: true, validUntil: new Date('2026-12-01T00:00:00Z') },
        now,
      ),
    ).toBe(true);
  });
});

describe('validateMatrix', () => {
  it('normalizes the actions', () => {
    expect(
      validateMatrix(
        { REGISTRE: ['MODIFIER', 'CONSULTER', 'CONSULTER'], TECHNIQUE: [] },
        AccessScopeKind.ALL,
      ),
    ).toEqual({ ok: true, matrix: { REGISTRE: ['CONSULTER', 'MODIFIER'] } });
  });

  it('accepts the Fermia bonus domains in consultation only', () => {
    expect(
      validateMatrix(
        { VENTES: ['CONSULTER'], MARCHE: ['CONSULTER'], COMPTABILITE: ['CONSULTER'], EQUIPE: ['CONSULTER'] },
        AccessScopeKind.ALL,
      ).ok,
    ).toBe(true);
    const write = validateMatrix({ VENTES: ['CONSULTER', 'CREER'] }, AccessScopeKind.ALL);
    expect(write.ok === false && write.error).toContain('consultation');
  });

  it('refuses never-grantable Fermia and unknown domains, unknown actions', () => {
    for (const bad of [
      { MARCHE: ['CREER'] },
      { COMPTABILITE: ['MODIFIER'] },
      { CULTURES: ['CONSULTER'] },
      { COMPTE: ['CONSULTER'] },
      { PLATEFORME: ['CONSULTER'] },
      { INCONNU: ['CONSULTER'] },
      { REGISTRE: ['SUPPRIMER'] },
      { REGISTRE: 'CONSULTER' },
      ['REGISTRE'],
      null,
    ]) {
      expect(
        validateMatrix(bad, AccessScopeKind.ALL).ok,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it('keeps the AUDIT domain on AUDIT profiles, and them on it', () => {
    expect(
      validateMatrix({ AUDIT: ['CONSULTER'] }, AccessScopeKind.ALL).ok,
    ).toBe(false);
    expect(
      validateMatrix(
        { AUDIT: ['CONSULTER'], REGISTRE: ['CONSULTER'] },
        AccessScopeKind.AUDIT,
      ).ok,
    ).toBe(false);
    expect(
      validateMatrix({ AUDIT: ['CONSULTER'] }, AccessScopeKind.AUDIT).ok,
    ).toBe(true);
  });
});

describe('permission codes of an institutional profile', () => {
  it('maps every catalogue code', () => {
    for (const p of PERMISSIONS) {
      expect(PERMISSION_DOMAINS[p.code], p.code).toBeDefined();
    }
  });

  it('derives the codes from the matrix: read codes only on the Fermia domains', () => {
    expect([...institutionPermissions(access('DGE').matrix)].sort()).toEqual([
      'caisse:lire',
      'compta:lire',
      'compta:rapports',
      'intrants:lire',
      'market:lire',
      'registre:gps',
      'rh:lire',
    ]);
    expect([...institutionPermissions(access('AGENT_TECHNIQUE').matrix)].sort()).toEqual([
      'intrants:lire',
      'registre:gps',
    ]);
    expect(
      [...institutionPermissions(access('VETERINAIRE').matrix)].sort(),
    ).toEqual(['sanitaire:gerer', 'sanitaire:lecture', 'sanitaire:signaler']);
    expect(institutionPermissions(access('ANINF').matrix).size).toBe(0);
  });
});

describe('parameter owner profile', () => {
  it('lets the owner profile and the platform admin change a parameter', () => {
    expect(mayChangeParameter(UserRole.PLATFORM_ADMIN, null, 'DGE')).toBe(true);
    expect(mayChangeParameter(UserRole.PLATFORM_ADMIN, null, 'ADMIN')).toBe(
      true,
    );
    expect(
      mayChangeParameter(UserRole.INSTITUTION, 'VETERINAIRE', 'VETERINAIRE'),
    ).toBe(true);
    expect(mayChangeParameter(UserRole.INSTITUTION, 'DGE', 'VETERINAIRE')).toBe(
      false,
    );
    expect(mayChangeParameter(UserRole.INSTITUTION, null, 'DGE')).toBe(false);
    expect(mayChangeParameter(UserRole.PROPRIETAIRE, null, 'DGE')).toBe(false);
  });

  // POUFA lot A sante: CDC §5.2 n° 25.
  it('keeps the veterinary thresholds to the veterinary services only', () => {
    expect(
      mayChangeParameter(UserRole.PLATFORM_ADMIN, null, 'VETERINAIRE'),
    ).toBe(false);
    expect(
      mayChangeParameter(UserRole.INSTITUTION, 'VETERINAIRE', 'VETERINAIRE'),
    ).toBe(true);
  });
});

describe('sanitary declarations', () => {
  it('stay between the farm and the veterinary services', () => {
    expect(
      mayHandleSanitaryDeclarations({ role: UserRole.PROPRIETAIRE }, null),
    ).toBe(true);
    expect(
      mayHandleSanitaryDeclarations({ role: UserRole.ELEVEUR }, null),
    ).toBe(true);
    expect(
      mayHandleSanitaryDeclarations(
        { role: UserRole.INSTITUTION },
        { profileCode: 'VETERINAIRE' },
      ),
    ).toBe(true);
    expect(
      mayHandleSanitaryDeclarations(
        { role: UserRole.INSTITUTION },
        { profileCode: 'DGE' },
      ),
    ).toBe(false);
    expect(
      mayHandleSanitaryDeclarations({ role: UserRole.INSTITUTION }, null),
    ).toBe(false);
    expect(
      mayHandleSanitaryDeclarations({ role: UserRole.OPERATEUR }, null),
    ).toBe(false);
  });
});

describe('granting access (institutional administrator)', () => {
  const K = AccessScopeKind;

  it('orders the scope kinds ALL > PROVINCES > FARMS', () => {
    for (const target of Object.values(K)) {
      expect(scopeKindRefusal(K.ALL, target)).toBeNull();
    }
    expect(scopeKindRefusal(K.PROVINCES, K.PROVINCES)).toBeNull();
    expect(scopeKindRefusal(K.PROVINCES, K.FARMS)).toBeNull();
    expect(scopeKindRefusal(K.PROVINCES, K.ALL)).toContain('plus large');
    expect(scopeKindRefusal(K.FARMS, K.FARMS)).toBeNull();
    expect(scopeKindRefusal(K.FARMS, K.PROVINCES)).toContain('plus large');
    for (const special of [K.FINANCED, K.OPERATOR, K.AGGREGATE, K.AUDIT]) {
      expect(scopeKindRefusal(K.PROVINCES, special)).toContain(
        'périmètre national',
      );
    }
    // A scope that reaches no farm grants nothing.
    expect(scopeKindRefusal(K.AGGREGATE, K.FARMS)).toContain('plus large');
  });

  it('refuses rights the granter does not hold', () => {
    const admin = access('ADMIN').matrix;
    expect(matrixExcess(admin, { REGISTRE: ['CONSULTER'] })).toEqual([]);
    expect(
      matrixExcess(admin, {
        REGISTRE: ['CONSULTER', 'CREER'],
        TECHNIQUE: ['CONSULTER'],
      }),
    ).toEqual([
      ['REGISTRE', 'CREER'],
      ['TECHNIQUE', 'CONSULTER'],
    ]);
    expect(matrixExcessRefusal(admin, { AUDIT: ['CONSULTER'] }, 'ANINF')).toBe(
      "Accès refusé : le profil « ANINF » donne des droits que vous n'avez pas (Journal d'audit : Consulter).",
    );
    expect(matrixExcessRefusal(admin, admin, 'Admin')).toBeNull();
  });

  it('lets the national administrator assign any profile but an audit one', () => {
    const national = access('ADMIN');
    expect(isNationalAdministrator(national)).toBe(true);
    const profile = (code: string) => {
      const p = DEFAULT_PROFILES.find((d) => d.code === code)!;
      return { scopeKind: p.scopeKind, matrix: p.matrix, label: p.label };
    };
    for (const code of [
      'AGENT_TECHNIQUE',
      'DGE',
      'VETERINAIRE',
      'BCEG',
      'MAEDR',
    ]) {
      expect(grantRefusal(national, profile(code))).toBeNull();
    }
    const audit =
      "Accès refusé : seul l'administrateur de la plateforme attribue un profil d'audit.";
    expect(grantRefusal(national, profile('ANINF'))).toBe(audit);
    // A journal right on a farm-scope profile is refused too.
    expect(
      grantRefusal(national, {
        scopeKind: K.ALL,
        matrix: { AUDIT: ['CONSULTER'] },
        label: 'X',
      }),
    ).toBe(audit);
  });

  it('keeps the matrix subset rule for any other institutional admin', () => {
    // A provincial administrator, even with ADMINISTRER.
    const provincial = access('ADMIN', {
      scopeKind: K.PROVINCES,
      provinceIds: ['g1'],
    });
    expect(isNationalAdministrator(provincial)).toBe(false);
    expect(
      grantRefusal(provincial, {
        scopeKind: K.FARMS,
        matrix: { REGISTRE: ['CONSULTER'], TECHNIQUE: ['CONSULTER'] },
        label: 'Agent',
      }),
    ).toContain('Suivi technique : Consulter');
    expect(
      grantRefusal(provincial, {
        scopeKind: K.FARMS,
        matrix: { REGISTRE: ['CONSULTER'] },
        label: 'Lecteur',
      }),
    ).toBeNull();
    // A national scope without ADMINISTRER is not the national administrator.
    const creator = access('ADMIN', {
      matrix: {
        REGISTRE: ['CONSULTER'],
        ADMINISTRATION: ['CONSULTER', 'CREER'],
      },
    });
    expect(isNationalAdministrator(creator)).toBe(false);
    expect(
      grantRefusal(creator, {
        scopeKind: K.FARMS,
        matrix: { TECHNIQUE: ['CONSULTER'] },
        label: 'Agent',
      }),
    ).toContain("droits que vous n'avez pas");
  });

  it('keeps provinces and farms within the granter scope', () => {
    const prov = access('ADMIN', {
      scopeKind: K.PROVINCES,
      provinceIds: [G1],
    });
    expect(
      scopeExcess(prov, {
        scopeKind: K.PROVINCES,
        provinceIds: [G1, G2],
        farms: [],
      }),
    ).toEqual({ provinceIds: [G2], farmIds: [] });
    expect(
      scopeExcess(prov, {
        scopeKind: K.FARMS,
        provinceIds: [],
        farms: [
          { id: FARM_A, provinceId: G1 },
          { id: FARM_B, provinceId: G2 },
        ],
      }),
    ).toEqual({ provinceIds: [], farmIds: [FARM_B] });
    const farmsOnly = access('ADMIN', {
      scopeKind: K.FARMS,
      farmIds: [FARM_A],
    });
    expect(
      scopeExcess(farmsOnly, {
        scopeKind: K.FARMS,
        provinceIds: [],
        farms: [
          { id: FARM_A, provinceId: G1 },
          { id: FARM_B, provinceId: G1 },
        ],
      }),
    ).toEqual({ provinceIds: [], farmIds: [FARM_B] });
    expect(
      scopeExcess(access('ADMIN'), {
        scopeKind: K.PROVINCES,
        provinceIds: [G1, G2],
        farms: [],
      }),
    ).toEqual({ provinceIds: [], farmIds: [] });
  });
});
