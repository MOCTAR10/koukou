import { UserRole } from '../../common/enums/role.enum.js';
import type { AccessMatrix } from '../access/access-domains.js';
import {
  sanitaryDecisionRefusal,
  sanitarySettingsRefusal,
} from './veterinary-authority.js';

const VET_MATRIX: AccessMatrix = {
  SANITAIRE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'],
};
const vet = { profileCode: 'VETERINAIRE', matrix: VET_MATRIX };

const institution = { role: UserRole.INSTITUTION };

describe('veterinary authority (CDC §5.2 n° 25-26)', () => {
  it('lets the veterinary services qualify, publish and validate', () => {
    expect(sanitaryDecisionRefusal(institution, vet, 'qualify')).toBeNull();
    expect(sanitaryDecisionRefusal(institution, vet, 'publish')).toBeNull();
    expect(sanitaryDecisionRefusal(institution, vet, 'validate')).toBeNull();
  });

  it('never lets the platform admin decide (no matrix)', () => {
    const admin = { role: UserRole.PLATFORM_ADMIN };
    expect(sanitaryDecisionRefusal(admin, null, 'qualify')).toMatch(/autorité vétérinaire/);
    expect(sanitaryDecisionRefusal(admin, null, 'publish')).toMatch(/autorité vétérinaire/);
    expect(sanitaryDecisionRefusal(admin, null, 'validate')).toMatch(/déclarations/);
    expect(sanitaryDecisionRefusal({ role: UserRole.PROPRIETAIRE }, null, 'publish')).not.toBeNull();
  });

  // POUFA lot A2 vet: the matrix decides, never the profile code.
  it('follows the matrix, whatever the profile code', () => {
    const custom = { profileCode: 'VETO_PROVINCE', matrix: VET_MATRIX };
    expect(sanitaryDecisionRefusal(institution, custom, 'qualify')).toBeNull();
    expect(sanitaryDecisionRefusal(institution, custom, 'publish')).toBeNull();
    const granted = { profileCode: 'DGE', matrix: VET_MATRIX };
    expect(sanitaryDecisionRefusal(institution, granted, 'validate')).toBeNull();
  });

  it('refuses a veterinary profile stripped of its rights', () => {
    const noValider = { profileCode: 'VETERINAIRE', matrix: { SANITAIRE: ['CONSULTER', 'MODIFIER'] } as AccessMatrix };
    // Without SANITAIRE:VALIDER it no longer receives the declarations.
    expect(sanitaryDecisionRefusal(institution, noValider, 'qualify')).not.toBeNull();
    expect(sanitaryDecisionRefusal(institution, noValider, 'publish')).toMatch(/Valider/);
    const noModifier = { profileCode: 'VETERINAIRE', matrix: { SANITAIRE: ['CONSULTER', 'VALIDER'] } as AccessMatrix };
    expect(sanitaryDecisionRefusal(institution, noModifier, 'qualify')).toMatch(/Modifier/);
    expect(sanitaryDecisionRefusal(institution, noModifier, 'publish')).toBeNull();
    const stripped = { profileCode: 'VETERINAIRE', matrix: { SANITAIRE: ['CONSULTER'] } as AccessMatrix };
    for (const d of ['qualify', 'publish', 'validate'] as const) {
      expect(sanitaryDecisionRefusal(institution, stripped, d)).not.toBeNull();
    }
    expect(sanitaryDecisionRefusal(institution, null, 'qualify')).not.toBeNull();
  });
});

describe('sanitary settings (POUFA lot A2 vet)', () => {
  it('are written by institutional accounts only, never the platform admin', () => {
    expect(sanitarySettingsRefusal(UserRole.INSTITUTION, 'lists')).toBeNull();
    expect(sanitarySettingsRefusal(UserRole.INSTITUTION, 'calendars')).toBeNull();
    expect(sanitarySettingsRefusal(UserRole.PLATFORM_ADMIN, 'lists')).toMatch(/consulte seulement/);
    expect(sanitarySettingsRefusal(UserRole.PLATFORM_ADMIN, 'calendars')).toMatch(/calendriers vaccinaux/);
    expect(sanitarySettingsRefusal(UserRole.PROPRIETAIRE, 'calendars')).not.toBeNull();
  });
});
