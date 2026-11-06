import { UserRole } from '../../common/enums/role.enum.js';
import { sanitaryDecisionRefusal } from './veterinary-authority.js';

const vet = {
  profileCode: 'VETERINAIRE',
  matrix: { SANITAIRE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'] },
};

const institution = { role: UserRole.INSTITUTION };

describe('veterinary authority (CDC §5.2 n° 25-26)', () => {
  it('lets the veterinary services qualify and publish', () => {
    expect(sanitaryDecisionRefusal(institution, vet, 'qualify')).toBeNull();
    expect(sanitaryDecisionRefusal(institution, vet, 'publish')).toBeNull();
  });

  it('never lets the platform admin decide (no matrix)', () => {
    const admin = { role: UserRole.PLATFORM_ADMIN };
    expect(sanitaryDecisionRefusal(admin, null, 'qualify')).toMatch(/autorité vétérinaire/);
    expect(sanitaryDecisionRefusal(admin, null, 'publish')).toMatch(/autorité vétérinaire/);
    expect(sanitaryDecisionRefusal({ role: UserRole.PROPRIETAIRE }, null, 'publish')).not.toBeNull();
  });

  it('follows the matrix: a vet profile without VALIDER qualifies but does not publish', () => {
    const technician = { profileCode: 'VETERINAIRE', matrix: { SANITAIRE: ['CONSULTER', 'MODIFIER'] } };
    expect(sanitaryDecisionRefusal(institution, technician, 'qualify')).toBeNull();
    expect(sanitaryDecisionRefusal(institution, technician, 'publish')).toMatch(/Valider/);
  });

  it('keeps the declarations rule: another profile never decides, even if granted', () => {
    const dge = { profileCode: 'DGE', matrix: { SANITAIRE: ['CONSULTER', 'MODIFIER', 'VALIDER'] } };
    expect(sanitaryDecisionRefusal(institution, dge, 'publish')).not.toBeNull();
    expect(sanitaryDecisionRefusal(institution, null, 'qualify')).not.toBeNull();
  });
});
