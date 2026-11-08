import { describe, expect, it } from 'vitest';
import { GRANTABLE_DOMAINS, grantableActions, type AccessMatrix, type ScopeKind } from '../api/types-access';
import { adminRights } from '../components/admin/adminRights';
import { canCorrectClosedBand, pilotageRights } from '../components/pilotage/pilotageAccess';
import { registryRights } from '../components/registry/registryAccess';
import { notificationRights, surveillanceRights } from '../components/surveillance/surveillanceAccess';
import { institutionWrites } from './menu-access';

/** An institution granted « Consulter » on every domain it can read: the read-only access of the audit. */
const readOnlyMatrix: AccessMatrix = Object.fromEntries(GRANTABLE_DOMAINS.map((d) => [d, ['CONSULTER']]));
const SCOPES: ScopeKind[] = ['ALL', 'PROVINCES', 'FARMS', 'FINANCED', 'OPERATOR', 'AGGREGATE', 'AUDIT'];
const readOnly = (scopeKind: ScopeKind) => ({ scopeKind, matrix: readOnlyMatrix });

describe('read-only institution access', () => {
  it('institutionWrites (canWrite) is false for every domain', () => {
    for (const scope of SCOPES) {
      for (const d of GRANTABLE_DOMAINS) expect(institutionWrites(readOnly(scope), d), `${scope}/${d}`).toBe(false);
    }
  });

  it('is false for every domain when the access is unknown', () => {
    for (const d of GRANTABLE_DOMAINS) expect(institutionWrites(null, d)).toBe(false);
  });

  it('the Fermia domains and DECLARATIONS can only ever be read-only', () => {
    for (const d of ['VENTES', 'MARCHE', 'COMPTABILITE', 'EQUIPE', 'DECLARATIONS'] as const) {
      expect(grantableActions(d)).toEqual(['CONSULTER']);
    }
  });

  it('registry, steering, administration and surveillance rights hold no write', () => {
    for (const scope of SCOPES) {
      const access = readOnly(scope);
      const reg = registryRights('INSTITUTION', access);
      expect([reg.create, reg.edit, reg.activateOwner, reg.import, reg.regenerateCode, reg.gps, reg.verify, reg.suspendTeam]).toEqual(
        Array(8).fill(false),
      );
      const pil = pilotageRights('INSTITUTION', access);
      expect([pil.editTemplates, pil.generate]).toEqual([false, false]);
      expect(canCorrectClosedBand('INSTITUTION', access)).toBe(false);
      const adm = adminRights('INSTITUTION', access);
      expect([adm.parameters.write, adm.lists.write]).toEqual([false, false]);
      expect(Object.entries(adm.recovery).filter(([k, v]) => k !== 'view' && v)).toEqual([]);
      const sur = surveillanceRights('INSTITUTION', access);
      expect([sur.qualify, sur.publish, sur.editLists, sur.createCalendars, sur.editCalendars, sur.reviewDeclarations]).toEqual(
        Array(6).fill(false),
      );
      expect(notificationRights('INSTITUTION', access).writeRules).toBe(false);
    }
  });
});
