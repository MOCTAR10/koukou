import { describe, expect, it, vi } from 'vitest';
import type { LotView, OperatorView } from '../../api/types-trace';
import { createPayload, draftOf, filterOperators, patchPayload, validateOperator } from './operatorRules';
import { fetchPublicLot, producerLine, publicLotStateFrom, publicLotUrl } from './publicLot';
import { isProgrammeWidePath, programmeEntries, programmeWideLabel, traceRights, traceTabOf, traceTabs } from './traceAccess';
import { codeFromInput, lotsTree, scanWarnings } from './traceLabels';

const VIEW = {
  code: 'G1-0001-B01-L01',
  kind: 'LOT',
  status: 'OUVERT',
  quantity: 500,
  cededOn: null,
  product: { species: 'POULET', speciesLabel: 'Poulet', type: 'CHAIR', typeLabel: 'Chair' },
  producer: { farmName: 'Ferme Nkok', localite: 'Ntoum', province: 'Estuaire' },
  band: { code: 'G1-0001-B01', openedOn: '2026-10-01', closedOn: null },
  operatorType: null,
  consommonsGabonais: { label: 'Consommons Gabonais', url: 'https://example.ga' },
  notice: "Ce QR code indique l'origine du produit. Il ne constitue pas un certificat sanitaire.",
};

describe('public lot page', () => {
  it('maps the answers to what the page shows', () => {
    expect(publicLotStateFrom(200, VIEW)).toEqual({ kind: 'ok', view: VIEW });
    expect(publicLotStateFrom(404, { message: 'QR code inconnu' })).toMatchObject({ kind: 'unknown', title: 'Code inconnu ou non valide' });
    expect(publicLotStateFrom(410, { message: 'Ce lot est clos.' })).toMatchObject({ kind: 'closed', title: 'Lot clos', message: 'Ce lot est clos.' });
    expect(publicLotStateFrom(429, null).kind).toBe('busy');
    expect(publicLotStateFrom(500, null).kind).toBe('error');
    expect(publicLotStateFrom(200, null).kind).toBe('error');
  });

  it('calls the public route with the signature, no token, no credentials', async () => {
    expect(publicLotUrl('/api/', ' G1-0001-B01-L01 ', 'abc_-')).toBe('/api/public/lots/G1-0001-B01-L01?s=abc_-');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(VIEW), { status: 200 }));
    const state = await fetchPublicLot('/api', 'G1-0001-B01-L01', 'sig', fetchImpl as unknown as typeof fetch);
    expect(state.kind).toBe('ok');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe('omit');
    expect(JSON.stringify(init.headers)).not.toMatch(/Authorization/);
  });

  it('says it needs a connection when the server cannot be reached', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect((await fetchPublicLot('/api', 'X', null, failing as unknown as typeof fetch)).kind).toBe('offline');
  });

  it('shows the producer place', () => {
    expect(producerLine(VIEW)).toBe('Ntoum, Estuaire');
  });
});

describe('traceability rights', () => {
  it('follows the matrix and the national scope', () => {
    expect(traceRights('PLATFORM_ADMIN', null).createOperator).toBe(true);
    expect(traceRights('PROPRIETAIRE', null)).toMatchObject({ farmLots: true, createOperator: false, readInactiveOperators: false });
    const admin = { scopeKind: 'ALL' as const, matrix: { ADMINISTRATION: ['CONSULTER', 'CREER', 'MODIFIER', 'ADMINISTRER'] as const } };
    expect(traceRights('INSTITUTION', { ...admin, matrix: { ADMINISTRATION: [...admin.matrix.ADMINISTRATION] } })).toEqual({
      searchByCode: false,
      farmLots: false,
      readInactiveOperators: true,
      createOperator: true,
      editOperator: true,
    });
    expect(traceRights('INSTITUTION', { scopeKind: 'PROVINCES', matrix: { ADMINISTRATION: ['CREER', 'MODIFIER'] } }).createOperator).toBe(false);
    expect(traceRights('INSTITUTION', { scopeKind: 'ALL', matrix: { TRACABILITE: ['CONSULTER'] } })).toMatchObject({
      searchByCode: true,
      readInactiveOperators: true,
      createOperator: false,
    });
  });

  it('puts the programme entries in the menu by domain', () => {
    expect(programmeEntries('PLATFORM_ADMIN', () => false).map((e) => e.to)).toEqual(['/app/intrants', '/app/tracabilite']);
    expect(programmeEntries('INSTITUTION', (to) => to === '/app/tracabilite').map((e) => e.to)).toEqual(['/app/tracabilite']);
    expect(programmeEntries('PROPRIETAIRE', () => true)).toEqual([]);
    expect(isProgrammeWidePath('/app/intrants')).toBe(true);
    expect(isProgrammeWidePath('/app/tracabilite/operateurs')).toBe(true);
    expect(isProgrammeWidePath('/app/tracabilite')).toBe(false);
    expect(isProgrammeWidePath('/app/tracabilite/recherche')).toBe(true);
  });
});

describe('operators form', () => {
  const op = {
    id: 'o1',
    code: 'OP-0001',
    typeCode: 'ABATTOIR',
    name: 'Abattoir de Owendo',
    localite: null,
    address: null,
    contactName: 'M. Ndong',
    contactPhone: '+241 77 00 00 00',
    contactEmail: null,
    conventionRef: 'CV-2026-01',
    conventionSignedAt: '2026-10-01',
    active: true,
  } as unknown as OperatorView;

  it('validates like the DTO', () => {
    expect(validateOperator({ ...draftOf(null), name: ' ' })).toEqual(["Le type d'opérateur est obligatoire.", "Le nom de l'opérateur est obligatoire."]);
    expect(validateOperator({ ...draftOf(op), contactPhone: 'abc', contactEmail: 'x@' })).toEqual([
      'Le numéro de téléphone n’est pas valide.',
      'Adresse e-mail invalide.',
    ]);
  });

  it('sends only what changed, a cleared field as null', () => {
    expect(createPayload({ ...draftOf(null), typeCode: 'ACHETEUR', name: ' Société X ', contactName: ' ' })).toEqual({ typeCode: 'ACHETEUR', name: 'Société X' });
    const before = draftOf(op);
    expect(patchPayload(before, { ...before, contactName: '', conventionRef: 'CV-2026-02' })).toEqual({ contactName: null, conventionRef: 'CV-2026-02' });
    expect(patchPayload(before, before)).toEqual({});
  });

  it('searches names without accents, the active ones first', () => {
    const rows = [op, { ...op, id: 'o2', code: 'OP-0002', name: 'Élevage Abattoir Sud', active: false }, { ...op, id: 'o3', code: 'OP-0003', name: 'Distrib', typeCode: 'DISTRIBUTEUR' }];
    expect(filterOperators(rows, 'abat', '').map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(filterOperators(rows, 'elevage', '').map((o) => o.id)).toEqual(['o2']);
    expect(filterOperators(rows, '', 'DISTRIBUTEUR').map((o) => o.id)).toEqual(['o3']);
  });
});

describe('lots helpers', () => {
  it('nests the sub-lots under their lot', () => {
    const l = (id: string, code: string, parentId: string | null = null) => ({ id, code, parentId }) as LotView;
    expect(lotsTree([l('a', 'B02-L01'), l('b', 'B01-L01'), l('c', 'B01-L01-02', 'b'), l('d', 'B01-L01-01', 'b')]).map((x) => `${x.depth}${x.lot.id}`)).toEqual([
      '0a',
      '0b',
      '1d',
      '1c',
    ]);
  });

  it('reads a code from a pasted QR address', () => {
    expect(codeFromInput('https://fermia.ga/l/g1-0001-b01-l01?s=abc')).toBe('G1-0001-B01-L01');
    expect(codeFromInput(' g1-0001-b01-l01 ')).toBe('G1-0001-B01-L01');
  });

  it('warns about forged codes and scans after closure', () => {
    expect(scanWarnings({ scans: 5, ok: 3, badSignature: 1, afterClosure: 2, distinctDevices: 2, distinctAreas: 0, firstAt: null, lastAt: null })).toEqual([
      '1 scan avec une signature invalide (QR code altéré ou copié).',
      '2 scans après la clôture du lot.',
    ]);
  });
});

describe('traceability page tabs', () => {
  const all = traceRights('PLATFORM_ADMIN', null);
  const none = traceRights('INSTITUTION', null);
  it('lists the tabs open to the caller', () => {
    expect(traceTabs(all, true)).toEqual(['lots', 'recherche', 'operateurs']);
    expect(traceTabs(all, false)).toEqual(['recherche', 'operateurs']);
    expect(traceTabs(none, true)).toEqual(['operateurs']);
  });
  it('picks the tab of the path, else the first allowed one', () => {
    expect(traceTabOf('/app/tracabilite/operateurs', ['lots', 'operateurs'])).toBe('operateurs');
    expect(traceTabOf('/app/tracabilite/recherche', ['recherche', 'operateurs'])).toBe('recherche');
    expect(traceTabOf('/app/tracabilite', ['recherche', 'operateurs'])).toBe('recherche');
    expect(traceTabOf('/app/tracabilite/recherche', ['operateurs'])).toBe('operateurs');
  });
});

describe('programme-wide header line', () => {
  it('names the page, or nothing outside the area', () => {
    expect(programmeWideLabel('/app/intrants')).toMatch(/Intrants/);
    expect(programmeWideLabel('/app/tracabilite/operateurs')).toMatch(/opérateurs/);
    expect(programmeWideLabel('/app/tracabilite')).toBeNull();
  });
});
