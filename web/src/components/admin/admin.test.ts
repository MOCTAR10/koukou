import { describe, expect, it } from 'vitest';
import type { AccessMatrix, ScopeKind } from '../../api/types-access';
import type { ParameterVersion, ParameterView } from '../../api/types-admin';
import { adminRights, mayPropose, ownerRightLabel, showsAdminArea } from './adminRights';
import { boundaryFromGeoJson, boundaryFromText, MAX_GEOMETRY_BYTES } from './geojson';
import { codeFromLabel, createItemBody, familiesOf, isVetList, LIST_TYPES, newItemErrors, sortItems, updateItemBody } from './lists';
import {
  classifyVersions,
  formatParameterValue,
  formulaNames,
  groupByTheme,
  insertToken,
  isProposedVersion,
  matchesSearch,
  parseParameterInput,
  rangeLabel,
  themeOf,
  unknownNames,
  validFromOf,
  valueToInput,
} from './parameters';

const profile = (code: string, scopeKind: ScopeKind, matrix: AccessMatrix) => ({ code, scopeKind, matrix });

// Seeded system profiles (backend access/data/default-profiles.ts).
const DGE = profile('DGE', 'ALL', {
  REGISTRE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'],
  TECHNIQUE: ['CONSULTER'],
  PARAMETRES: ['CONSULTER', 'MODIFIER', 'VALIDER'],
});
const VETERINAIRE = profile('VETERINAIRE', 'ALL', {
  REGISTRE: ['CONSULTER'],
  SANITAIRE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'],
  PARAMETRES: ['CONSULTER', 'MODIFIER'],
});
const ADMIN = profile('ADMIN', 'ALL', { REGISTRE: ['CONSULTER'], PARAMETRES: ['CONSULTER', 'MODIFIER'], ADMINISTRATION: ['CONSULTER', 'CREER', 'MODIFIER', 'ADMINISTRER'] });
const ANINF = profile('ANINF', 'AUDIT', { AUDIT: ['CONSULTER'] });
const MAEDR = profile('MAEDR', 'AGGREGATE', { PILOTAGE: ['CONSULTER', 'VALIDER'], PARAMETRES: ['CONSULTER'] });
const AGENT = profile('AGENT_TECHNIQUE', 'FARMS', { REGISTRE: ['CONSULTER'], TECHNIQUE: ['CONSULTER'], PARAMETRES: ['CONSULTER'] });

describe('adminRights', () => {
  it('gives the platform admin everything, farm accounts nothing', () => {
    const all = adminRights('PLATFORM_ADMIN');
    expect(all.parameters.anyOwner && all.lists.write && all.lists.readInactive && all.audit.view && all.recovery.validate).toBe(true);
    expect(showsAdminArea(adminRights('PROPRIETAIRE'))).toBe(false);
    expect(showsAdminArea(adminRights('INSTITUTION', null))).toBe(false);
  });

  it('reads the matrix of an institution', () => {
    const dge = adminRights('INSTITUTION', DGE);
    expect(dge.parameters).toMatchObject({ view: true, write: true, matrix: DGE.matrix });
    expect(dge.lists.write).toBe(false);
    expect(dge.recovery).toEqual({ view: true, deposit: true, edit: true, validate: true, integrate: true, reject: true });
    expect(dge.audit.view).toBe(false);

    const admin = adminRights('INSTITUTION', ADMIN);
    expect(admin.lists).toEqual({ view: true, write: true, readInactive: true, readInactiveSanitary: true });
    // The profiles that maintain the lists read the deactivated items (`?all=true`).
    expect(adminRights('INSTITUTION', DGE).lists.readInactive).toBe(true);
    expect(adminRights('INSTITUTION', VETERINAIRE).lists.readInactive).toBe(true);
    expect(adminRights('INSTITUTION', MAEDR).lists).toMatchObject({ readInactive: false, readInactiveSanitary: false });
    expect(adminRights('INSTITUTION', AGENT).lists.readInactive).toBe(false);
    expect(
      adminRights('INSTITUTION', profile('VET_TERRAIN', 'PROVINCES', { SANITAIRE: ['CONSULTER', 'MODIFIER'] })).lists,
    ).toMatchObject({ readInactive: false, readInactiveSanitary: true });
    // REGISTRE:CONSULTER only: reads the recovery, can't validate.
    expect(admin.recovery).toMatchObject({ view: true, deposit: false, validate: false });
  });

  it('keeps the ANINF account to the journal', () => {
    const r = adminRights('INSTITUTION', ANINF);
    expect(r.audit.view).toBe(true);
    expect(r.parameters.view || r.lists.view || r.recovery.view).toBe(false);
  });

  it('needs a national scope for the recovery', () => {
    expect(adminRights('INSTITUTION', profile('X', 'PROVINCES', { REGISTRE: ['CONSULTER', 'CREER'] })).recovery.view).toBe(false);
    expect(adminRights('INSTITUTION', AGENT).recovery.view).toBe(false);
    expect(adminRights('INSTITUTION', MAEDR).parameters).toMatchObject({ view: true, write: false });
  });

  it('lets only the owner profile propose a value', () => {
    expect(mayPropose(adminRights('INSTITUTION', DGE).parameters, 'DGE')).toBe(true);
    expect(mayPropose(adminRights('INSTITUTION', DGE).parameters, 'VETERINAIRE')).toBe(false);
    expect(mayPropose(adminRights('INSTITUTION', VETERINAIRE).parameters, 'VETERINAIRE')).toBe(true);
    expect(mayPropose(adminRights('INSTITUTION', MAEDR).parameters, 'DGE')).toBe(false);
    expect(mayPropose(adminRights('PLATFORM_ADMIN').parameters, 'ADMIN')).toBe(true);
    // CDC n° 25: the veterinary thresholds are the vets' alone (POUFA lot A sante).
    expect(mayPropose(adminRights('PLATFORM_ADMIN').parameters, 'VETERINAIRE')).toBe(false);
    expect(mayPropose(adminRights('INSTITUTION', ADMIN).parameters, 'ADMIN')).toBe(true);
    expect(mayPropose(adminRights('INSTITUTION', ADMIN).parameters, 'DGE')).toBe(false);
    expect(mayPropose(adminRights('INSTITUTION', DGE).parameters, 'INCONNU')).toBe(false);
  });

  // POUFA lot A2 vet: the owner right comes from the matrix, never the profile code.
  it('reads the owner right in the matrix, whatever the profile code', () => {
    const custom = profile('VETO_PROVINCE', 'PROVINCES', VETERINAIRE.matrix);
    expect(mayPropose(adminRights('INSTITUTION', custom).parameters, 'VETERINAIRE')).toBe(true);
    const stripped = profile('VETERINAIRE', 'ALL', { ...VETERINAIRE.matrix, SANITAIRE: ['CONSULTER'] });
    expect(mayPropose(adminRights('INSTITUTION', stripped).parameters, 'VETERINAIRE')).toBe(false);
    expect(ownerRightLabel('VETERINAIRE')).toBe('Sanitaire : Modifier');
    expect(ownerRightLabel('DGE')).toBe('Paramètres : Valider');
    expect(ownerRightLabel('X')).toBeNull();
  });
});

const view = (over: Partial<ParameterView>): ParameterView => ({
  key: 'X',
  label: 'Paramètre',
  type: 'number',
  unit: null,
  ownerProfile: 'DGE',
  min: null,
  max: null,
  value: null,
  validFrom: null,
  reason: null,
  createdById: null,
  versionId: null,
  ...over,
});

describe('parameter themes', () => {
  it('groups the catalog by key prefix', () => {
    expect(themeOf({ key: 'BANDE_DUREE_REFERENCE_J', type: 'integer' })).toBe('BANDE');
    expect(themeOf({ key: 'PESEE_FREQUENCE_J', type: 'integer' })).toBe('PESEE');
    expect(themeOf({ key: 'SEUIL_ALERTE_MORTALITE_JOUR_PCT', type: 'number' })).toBe('SANITAIRE');
    expect(themeOf({ key: 'SEUIL_ECART_INTRANTS_PCT', type: 'number' })).toBe('INTRANTS');
    expect(themeOf({ key: 'SEUIL_TRACABILITE_QR_PCT', type: 'number' })).toBe('TRACABILITE');
    expect(themeOf({ key: 'SEUIL_ECART_RECEPTION_ABATTOIR_PCT', type: 'number' })).toBe('TRACABILITE');
    expect(themeOf({ key: 'CARTE_MORTALITE_JAUNE_PCT', type: 'number' })).toBe('PILOTAGE');
    expect(themeOf({ key: 'NOTIF_SMS_PLAFOND_JOUR', type: 'integer' })).toBe('NOTIFICATIONS');
    expect(themeOf({ key: 'FORMULE_IC', type: 'formula' })).toBe('FORMULES');
    expect(themeOf({ key: 'NOUVEAU', type: 'string' })).toBe('AUTRES');
    const groups = groupByTheme([view({ key: 'FORMULE_IC', type: 'formula' }), view({ key: 'PESEE_FREQUENCE_J' }), view({ key: 'BANDE_X' })]);
    expect(groups.map((g) => g.theme)).toEqual(['BANDE', 'PESEE', 'FORMULES']);
  });

  it('searches without accents', () => {
    expect(matchesSearch(view({ label: 'Fréquence des pesées' }), 'frequence')).toBe(true);
    expect(matchesSearch(view({ key: 'PESEE_FREQUENCE_J' }), 'pesee_')).toBe(true);
    expect(matchesSearch(view({ label: 'Autre' }), 'pesée')).toBe(false);
  });
});

describe('parameter values', () => {
  const pct = view({ label: 'Seuil', type: 'number', unit: '%', min: 0, max: 100 });
  it('parses numbers like the server checks them', () => {
    expect(parseParameterInput(pct, '1,5')).toEqual({ ok: true, value: 1.5 });
    expect(parseParameterInput(pct, ' 2.25 ')).toEqual({ ok: true, value: 2.25 });
    expect(parseParameterInput(pct, '101')).toEqual({ ok: false, error: '« Seuil » doit être au plus 100 %.' });
    expect(parseParameterInput(pct, '-1')).toEqual({ ok: false, error: '« Seuil » doit être au moins 0 %.' });
    expect(parseParameterInput(pct, 'abc')).toEqual({ ok: false, error: '« Seuil » doit être un nombre.' });
    expect(parseParameterInput(pct, '1e3')).toMatchObject({ ok: false });
    const big = view({ label: 'Objectif', type: 'number', unit: 't', min: 1, max: 10_000_000 });
    expect(parseParameterInput(big, '100 000')).toEqual({ ok: true, value: 100000 });
  });

  it('refuses decimals on an integer', () => {
    const days = view({ label: 'Durée', type: 'integer', min: 1, max: 365 });
    expect(parseParameterInput(days, '45')).toEqual({ ok: true, value: 45 });
    expect(parseParameterInput(days, '4,5')).toEqual({ ok: false, error: '« Durée » doit être un nombre entier.' });
  });

  it('checks text, formula and JSON', () => {
    expect(parseParameterInput(view({ type: 'string', label: 'T' }), '  ')).toMatchObject({ ok: false });
    expect(parseParameterInput(view({ type: 'formula' }), ' a / b ')).toEqual({ ok: true, value: 'a / b' });
    expect(parseParameterInput(view({ type: 'formula' }), 'x'.repeat(501))).toMatchObject({ ok: false });
    expect(parseParameterInput(view({ type: 'json', label: 'J' }), '{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseParameterInput(view({ type: 'json', label: 'J' }), '{a')).toEqual({ ok: false, error: '« J » : JSON invalide.' });
  });

  it('formats and prefills values', () => {
    expect(formatParameterValue('number', 1.5, '%')).toBe('1,5 %');
    expect(formatParameterValue('integer', 100000, 't')).toBe(`${(100000).toLocaleString('fr-FR')} t`);
    expect(formatParameterValue('formula', 'a / b')).toBe('a / b');
    expect(formatParameterValue('number', null)).toBe('—');
    expect(valueToInput('number', 2.2)).toBe('2,2');
    expect(rangeLabel({ min: 0, max: 100, unit: '%' })).toBe('min 0 · max 100 %');
    expect(rangeLabel({ min: null, max: null, unit: 'kg' })).toBeNull();
  });
});

describe('effective date', () => {
  const now = new Date('2026-11-06T10:00:00Z');
  it('sends nothing for now, a future ISO otherwise, never a past date', () => {
    expect(validFromOf('now', '', now)).toEqual({ ok: true, value: undefined });
    const later = validFromOf('later', '2026-12-01T00:00', now);
    expect(later.ok && typeof later.value === 'string' && Date.parse(later.value) > now.getTime()).toBe(true);
    expect(validFromOf('later', '2026-11-01T00:00', now)).toMatchObject({ ok: false });
    expect(validFromOf('later', '', now)).toEqual({ ok: false, error: "Indiquez la date d'effet." });
  });
});

const version = (id: string, validFrom: string, createdAt: string, over: Partial<ParameterVersion> = {}): ParameterVersion => ({
  id,
  programId: 'p',
  key: 'K',
  value: 1,
  ownerProfile: 'DGE',
  validFrom,
  createdById: 'u',
  reason: 'r',
  createdAt,
  ...over,
});

describe('versions', () => {
  it('finds the version in force like the server (latest validFrom, then latest createdAt)', () => {
    const now = new Date('2026-11-06T10:00:00Z');
    const rows = classifyVersions(
      [
        version('seed', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', { createdById: null, reason: 'Valeur proposée par le cahier des charges, à valider' }),
        version('a', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'),
        version('b', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'),
        version('future', '2026-12-01T00:00:00Z', '2026-11-05T00:00:00Z'),
      ],
      now,
    );
    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ['future', 'FUTURE'],
      ['b', 'IN_FORCE'],
      ['a', 'PAST'],
      ['seed', 'PAST'],
    ]);
    expect(isProposedVersion(rows[3]!)).toBe(true);
    expect(isProposedVersion(rows[1]!)).toBe(false);
  });
});

describe('formula editor', () => {
  const params = [
    view({ key: 'FORMULE_TAUX_MORTALITE', type: 'formula', label: 'Formule : Taux de mortalité', unit: '%' }),
    view({ key: 'FORMULE_VIABILITE', type: 'formula', label: 'Formule : Viabilité', unit: '%' }),
    view({ key: 'PESEE_FREQUENCE_J', type: 'integer' }),
  ];
  it('offers the base variables and the other indicators', () => {
    const names = formulaNames(params, 'FORMULE_VIABILITE');
    expect(names.variables.some((v) => v.name === 'morts_cumules')).toBe(true);
    expect(names.indicators).toEqual([{ name: 'taux_mortalite', label: 'Taux de mortalité', unit: '%' }]);
  });

  it('flags unknown names, not functions nor numbers', () => {
    const known = ['morts_cumules', 'mis_en_place', 'taux_mortalite'];
    expect(unknownNames('morts_cumules / mis_en_place * 100', known)).toEqual([]);
    expect(unknownNames('arrondi(morts_cumules / mis_en_plac; 2)', known)).toEqual(['mis_en_plac']);
    expect(unknownNames('si(taux_mortalite > 5; 1; 0) + Foo', known)).toEqual(['Foo']);
    expect(unknownNames('100 - x - x', known)).toEqual(['x']);
  });

  it('inserts a name at the caret with spaces', () => {
    expect(insertToken('a +', 3, 3, 'b')).toEqual({ text: 'a + b', caret: 5 });
    expect(insertToken('min()', 4, 4, 'x')).toEqual({ text: 'min(x)', caret: 5 });
    expect(insertToken('a+c', 1, 2, 'b')).toEqual({ text: 'a b c', caret: 3 });
  });
});

describe('lists', () => {
  it('lists every list type with the families the server requires', () => {
    expect(LIST_TYPES).toHaveLength(11);
    expect(familiesOf('MOTIF_SORTIE')).toEqual(['VENTE', 'ABATTOIR', 'REFORME', 'AUTRE']);
    expect(familiesOf('COHORTE')).toBeNull();
    expect(isVetList('SIGNE_CLINIQUE') && isVetList('STATUT_ALERTE') && isVetList('PRODUIT_TRAITEMENT')).toBe(true);
    expect(isVetList('UNITE')).toBe(false);
  });

  it('proposes a code from the label', () => {
    expect(codeFromLabel('Vente au marché de Mont-Bouët')).toBe('VENTE_AU_MARCHE_DE_MONT_BOUET');
    expect(codeFromLabel('  -- ')).toBe('');
    expect(codeFromLabel('a'.repeat(50))).toHaveLength(40);
  });

  it('checks a new item', () => {
    expect(newItemErrors('COHORTE', { code: 'C3', label: 'Cohorte 3', family: '' }, [{ code: 'C1' }])).toEqual({});
    expect(newItemErrors('COHORTE', { code: 'c3', label: '', family: '' }, [])).toEqual({
      code: 'Le code doit contenir de 1 à 40 caractères : majuscules, chiffres ou _.',
      label: 'Le libellé est obligatoire.',
    });
    expect(newItemErrors('COHORTE', { code: 'C1', label: 'x', family: '' }, [{ code: 'C1' }]).code).toMatch(/existe déjà/);
    expect(newItemErrors('MOTIF_SORTIE', { code: 'DON', label: 'Don', family: '' }, []).family).toMatch(/obligatoire/);
    expect(newItemErrors('MOTIF_SORTIE', { code: 'DON', label: 'Don', family: 'AUTRE' }, [])).toEqual({});
    expect(createItemBody('MOTIF_SORTIE', { code: ' DON ', label: ' Don ', family: 'AUTRE' })).toEqual({ code: 'DON', label: 'Don', family: 'AUTRE' });
    expect(createItemBody('COHORTE', { code: 'C3', label: 'C 3', family: 'X' })).toEqual({ code: 'C3', label: 'C 3' });
  });

  it('never sends code or family on an edit', () => {
    const item = { label: 'Ancien', sort: 10 };
    expect(updateItemBody(item, { label: 'Nouveau', sort: '10' })).toEqual({ label: 'Nouveau' });
    expect(updateItemBody(item, { label: 'Ancien', sort: '20' })).toEqual({ sort: 20 });
    expect(updateItemBody(item, { label: 'Ancien', sort: '10' })).toBeNull();
    expect(updateItemBody(item, { label: ' ', sort: '' })).toEqual({ error: 'Le libellé ne peut pas être vide.' });
    expect(updateItemBody(item, { label: 'x', sort: '-1' })).toEqual({ error: "L'ordre doit être un entier positif." });
  });

  it('shows active items first', () => {
    const items = [
      { label: 'B', sort: 10, active: false },
      { label: 'C', sort: 20, active: true },
      { label: 'A', sort: 20, active: true },
    ];
    expect(sortItems(items).map((i) => i.label)).toEqual(['A', 'C', 'B']);
  });
});

describe('province boundary', () => {
  const ring = [
    [9.3, 0.3],
    [9.6, 0.3],
    [9.6, 0.6],
    [9.3, 0.6],
    [9.3, 0.3],
  ];
  it('takes a Polygon, a Feature or a FeatureCollection', () => {
    expect(boundaryFromGeoJson({ type: 'Polygon', coordinates: [ring] })).toMatchObject({ ok: true, polygons: 1, points: 5 });
    expect(boundaryFromGeoJson({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } })).toMatchObject({
      ok: true,
      geometry: { type: 'Polygon' },
    });
    const merged = boundaryFromGeoJson({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } },
        { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring]] } },
      ],
    });
    expect(merged).toMatchObject({ ok: true, polygons: 3, geometry: { type: 'MultiPolygon' } });
  });

  it('rounds positions and drops repeated points', () => {
    const r = boundaryFromGeoJson({ type: 'Polygon', coordinates: [[[9.3000004, 0.3], [9.3, 0.3], ...ring.slice(1)]] });
    expect(r.ok && r.geometry.coordinates).toEqual([ring]);
  });

  it('refuses what the server refuses', () => {
    expect(boundaryFromGeoJson({ type: 'Point', coordinates: [9, 0] })).toMatchObject({ ok: false, error: expect.stringMatching(/Point/) });
    expect(boundaryFromGeoJson({ type: 'Polygon', coordinates: [ring.slice(0, 4)] })).toMatchObject({ ok: false, error: expect.stringMatching(/fermé/) });
    expect(boundaryFromGeoJson({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] })).toMatchObject({ ok: false });
    expect(boundaryFromGeoJson({ type: 'Polygon', coordinates: [[[0, 0], [0, 100], [1, 1], [0, 0]]] })).toMatchObject({ ok: false });
    expect(boundaryFromText('not json')).toMatchObject({ ok: false, error: expect.stringMatching(/GeoJSON/) });
  });

  it('refuses a boundary above the body limit', () => {
    const big: number[][] = [];
    for (let i = 0; i < 400_000; i++) big.push([9 + i / 100_000, 0.3 + (i % 2) / 1000]);
    big.push(big[0]!);
    const r = boundaryFromGeoJson({ type: 'Polygon', coordinates: [big] });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/trop lourd.*5 Mo/) });
    // A province outline of a few thousand points now fits (the server takes 5 MB on this route).
    const outline = big.slice(0, 9000);
    outline.push(outline[0]!);
    expect(boundaryFromGeoJson({ type: 'Polygon', coordinates: [outline] })).toMatchObject({ ok: true });
    expect(MAX_GEOMETRY_BYTES).toBe(5 * 1024 * 1024 - 16 * 1024);
  });
});
