import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import type { MyAccess } from '../../api/types-access';
import type { ImportReport, RegistrySheet } from '../../api/types-programme';
import { candidateProvince, candidateTitle, readDuplicateConflict, scoreLabel } from './duplicates';
import { checkImportFile, importFormData, linesOf, outcomeCounts, summarizeImport } from './importReport';
import { activationBlocker, classifyActivationError, isNoOwnerAccount } from './ownerActivation';
import { registryRights } from './registryAccess';
import { buildCreateBody, buildGpsBody, buildUpdateBody, checkInfrastructures, draftOfSheet, EMPTY_CREATE_DRAFT, parseDecimal } from './sheetForm';

const conflict = (body: unknown) => new ApiError(409, 'Doublon probable : G1-0003 « Ferme Ngoma ».', body);

describe('readDuplicateConflict', () => {
  it('splits visible and hidden candidates, best score first', () => {
    const c = readDuplicateConflict(
      conflict({
        message: 'x',
        duplicates: [
          { farmId: 'a', code: 'G1-0003', name: 'Ferme Ngoma', provinceCode: 'G1', provinceName: 'Estuaire', score: 0.9, reasons: ['même nom'] },
          { farmId: 'b', code: 'G1-0007', name: 'Ngoma', provinceCode: 'G1', provinceName: 'Estuaire', score: 1, reasons: ['même nom', 'même téléphone'] },
        ],
      }),
    );
    expect(c?.visible.map((d) => d.code)).toEqual(['G1-0007', 'G1-0003']);
    expect(candidateProvince(c!.visible[0]!)).toBe('Estuaire (G1)');
    expect(c?.hidden).toEqual([]);
    expect(c?.canConfirm).toBe(true);
  });

  it('refuses the confirmation against a hidden candidate', () => {
    const c = readDuplicateConflict(conflict({ duplicates: [{ hidden: true, score: 0.95, reasons: ['nom très proche'] }] }));
    expect(c?.hidden).toHaveLength(1);
    expect(c?.canConfirm).toBe(false);
    expect(candidateTitle(c!.hidden[0]!)).toBe('Ferme hors de votre périmètre');
    expect(candidateProvince(c!.hidden[0]!)).toBeNull();
  });

  it('is null for other refusals', () => {
    expect(readDuplicateConflict(new ApiError(409, 'La référence AMI « A1 » est déjà attribuée', { message: 'x' }))).toBeNull();
    expect(readDuplicateConflict(new ApiError(400, 'x', { duplicates: [{ code: 'G1' }] }))).toBeNull();
    expect(readDuplicateConflict(new Error('réseau'))).toBeNull();
  });

  it('words candidates and scores', () => {
    expect(scoreLabel(0.854)).toBe('85 %');
    expect(scoreLabel(1.3)).toBe('100 %');
    const line = { farmId: null, code: null, name: 'Agri Vert', provinceCode: 'G2', provinceName: null, score: 1, reasons: [], line: 12 };
    expect(candidateTitle(line)).toBe('Ligne 12 · Agri Vert');
    expect(candidateProvince(line)).toBe('G2');
    expect(candidateProvince({ ...line, provinceCode: null })).toBeNull();
  });
});

const report = (over: Partial<ImportReport> = {}): ImportReport => ({
  dryRun: true,
  format: 'LISTE_POUFA',
  read: 4,
  created: 1,
  matched: 1,
  rejected: 2,
  unknownColumns: [],
  lines: [
    { line: 2, name: 'A', outcome: 'A_CREER' },
    { line: 3, name: 'B', outcome: 'DEJA_PRESENTE', code: 'G1-0001' },
    { line: 4, name: 'C', outcome: 'REJETEE', reason: 'Province inconnue' },
    { line: 5, name: 'D', outcome: 'REJETEE', reason: 'Doublon', duplicates: [{ farmId: 'x', code: 'G1-0002', name: 'DD', provinceCode: 'G1', provinceName: 'Estuaire', score: 0.9, reasons: [] }] },
  ],
  ...over,
});

describe('import report', () => {
  it('sums up a dry run and offers the real import', () => {
    const s = summarizeImport(report());
    expect(s.duplicateRejections).toBe(1);
    expect(s.canImport).toBe(true);
    expect(s.sentence).toBe('4 lignes lues : 1 ferme à créer, 1 déjà présente, 2 rejetées.');
  });

  it('never offers to import again after a real run, or with nothing to create', () => {
    expect(summarizeImport(report({ dryRun: false, created: 3 })).canImport).toBe(false);
    expect(summarizeImport(report({ dryRun: false, created: 3 })).sentence).toContain('3 fermes créées');
    expect(summarizeImport(report({ created: 0 })).canImport).toBe(false);
  });

  it('filters and counts lines per outcome', () => {
    expect(linesOf(report(), 'REJETEE').map((l) => l.line)).toEqual([4, 5]);
    expect(linesOf(report(), '')).toHaveLength(4);
    expect(outcomeCounts(report())).toEqual({ CREEE: 0, A_CREER: 1, DEJA_PRESENTE: 1, REJETEE: 2 });
  });

  it('builds the multipart form and checks the file', () => {
    const form = importFormData(new Blob(['numero,nom,province']), 'fermes.csv', { dryRun: false, confirmDuplicate: true });
    expect(form.get('dryRun')).toBe('false');
    expect(form.get('confirmDuplicate')).toBe('true');
    expect(importFormData(new Blob(['x']), 'f.csv', { dryRun: true, confirmDuplicate: false }).has('confirmDuplicate')).toBe(false);
    expect(checkImportFile(null)).toBe('Choisissez un fichier CSV.');
    expect(checkImportFile({ name: 'liste.xlsx', size: 10 })).toMatch(/CSV/);
    expect(checkImportFile({ name: 'liste.CSV', size: 6 * 1024 * 1024 })).toBe('Le fichier dépasse 5 Mo.');
    expect(checkImportFile({ name: 'liste.csv', size: 10 })).toBeNull();
  });
});

describe('owner account', () => {
  it('sorts the activation refusals', () => {
    expect(classifyActivationError(new ApiError(409, 'Un compte existe', { existingAccount: true })).kind).toBe('existingAccount');
    expect(classifyActivationError(new ApiError(409, 'Acheteur', { buyerAccount: true })).kind).toBe('buyerAccount');
    expect(classifyActivationError(new ApiError(409, 'Pas propriétaire', { message: 'x' })).kind).toBe('other');
    expect(classifyActivationError(new ApiError(400, 'x', { existingAccount: true })).kind).toBe('other');
  });

  it('spots a new code asked before the activation', () => {
    expect(isNoOwnerAccount(new ApiError(409, 'Activez d’abord', { noOwnerAccount: true }))).toBe(true);
    expect(isNoOwnerAccount(new ApiError(403, 'Hors périmètre', { message: 'x' }))).toBe(false);
    expect(isNoOwnerAccount(new Error('réseau'))).toBe(false);
  });

  it('needs the exploitant’s name and phone first', () => {
    expect(activationBlocker({ exploitant: { name: 'Jean', phone: '074' }, hasOwnerAccount: false })).toBeNull();
    expect(activationBlocker({ exploitant: { name: 'Jean', phone: ' ' }, hasOwnerAccount: false })).toMatch(/téléphone/);
    expect(activationBlocker({ exploitant: { name: null, phone: '074' }, hasOwnerAccount: false })).toMatch(/nom/);
    expect(activationBlocker({ exploitant: { name: 'J', phone: '0' }, hasOwnerAccount: true })).toMatch(/déjà activé/);
  });
});

type Profile = Pick<MyAccess['profile'], 'matrix' | 'scopeKind'>;

describe('registryRights', () => {
  it('gives the platform admin every right, a farm account none', () => {
    expect(registryRights('PLATFORM_ADMIN')).toEqual({
      view: true,
      create: true,
      edit: true,
      activateOwner: true,
      import: true,
      regenerateCode: true,
    });
    expect(registryRights('PROPRIETAIRE').view).toBe(false);
    expect(registryRights('INSTITUTION').view).toBe(false); // access not loaded
  });

  it("reads an institution's rights from its access profile, like the server", () => {
    const agent: Profile = { scopeKind: 'PROVINCES', matrix: { REGISTRE: ['CONSULTER', 'MODIFIER'], ADMINISTRATION: ['ADMINISTRER'] } };
    expect(registryRights('INSTITUTION', agent)).toEqual({
      view: true,
      create: false,
      edit: true,
      activateOwner: true,
      import: false,
      regenerateCode: true,
    });
    const national: Profile = { scopeKind: 'ALL', matrix: { REGISTRE: ['CONSULTER', 'CREER'] } };
    expect(registryRights('INSTITUTION', national)).toMatchObject({ create: true, import: true, edit: false, activateOwner: false, regenerateCode: false });
    const provincial: Profile = { scopeKind: 'PROVINCES', matrix: { REGISTRE: ['CONSULTER', 'CREER'] } };
    expect(registryRights('INSTITUTION', provincial).import).toBe(false);
    // An AUDIT-scope profile reads the journal only.
    expect(registryRights('INSTITUTION', { scopeKind: 'AUDIT', matrix: { REGISTRE: ['CONSULTER'] } }).view).toBe(false);
  });
});

const sheet: RegistrySheet = {
  id: 'f1',
  code: 'G1-0001',
  programId: 'p',
  name: 'Ferme Ngoma',
  administrativeCity: 'Libreville',
  province: { id: 'p1', code: 'G1', name: 'Estuaire' },
  localite: { id: 'l1', code: 'G1-01', name: 'Libreville' },
  amiRef: 'AMI-1',
  cohort: { code: 'COHORTE_1', label: 'Cohorte 1' },
  exploitant: { name: 'Jean Mba', phone: '+24174000000' },
  owner: null,
  hasOwnerAccount: false,
  capacityPlaces: 1200,
  occupation: { chicksPlaced: 0, capacityPlaces: 1200, ratePct: 0 },
  gps: null,
  status: null,
  active: true,
  isVerified: false,
  infrastructures: [],
  duplicateOverride: null,
  createdAt: '',
  updatedAt: '',
};

describe('sheet form', () => {
  it('builds a creation with only what was typed', () => {
    expect(buildCreateBody({ ...EMPTY_CREATE_DRAFT, name: '  Ferme Ngoma ', provinceCode: 'G1' })).toEqual({
      body: { name: 'Ferme Ngoma', provinceCode: 'G1' },
    });
    const full = buildCreateBody(
      {
        ...EMPTY_CREATE_DRAFT,
        name: 'A',
        provinceCode: 'G1',
        exploitantPhone: '+241 74 00-00.00',
        capacityPlaces: '1 200',
        latitude: '0,39',
        longitude: '9.45',
        statusCode: 'OPERATIONNELLE',
        infrastructures: [{ code: 'BATIMENT', count: '2', surfaceM2: '' }],
      },
      true,
    );
    expect(full).toEqual({
      body: {
        name: 'A',
        provinceCode: 'G1',
        exploitantPhone: '+24174000000',
        capacityPlaces: 1200,
        statusCode: 'OPERATIONNELLE',
        gps: { latitude: 0.39, longitude: 9.45, source: 'MANUEL' },
        infrastructures: [{ code: 'BATIMENT', count: 2 }],
        confirmDuplicate: true,
      },
    });
  });

  it('refuses what the server would refuse', () => {
    expect(buildCreateBody({ ...EMPTY_CREATE_DRAFT, provinceCode: 'G1' })).toEqual({ error: 'Le nom de la ferme est obligatoire.' });
    expect(buildCreateBody({ ...EMPTY_CREATE_DRAFT, name: 'A' })).toEqual({ error: 'La province est obligatoire.' });
    expect('error' in buildCreateBody({ ...EMPTY_CREATE_DRAFT, name: 'A', provinceCode: 'G1', exploitantPhone: '12' })).toBe(true);
    expect('error' in buildCreateBody({ ...EMPTY_CREATE_DRAFT, name: 'A', provinceCode: 'G1', capacityPlaces: '1,5' })).toBe(true);
    expect('error' in buildCreateBody({ ...EMPTY_CREATE_DRAFT, name: 'A', provinceCode: 'G1', latitude: '0.3' })).toBe(true);
    expect('error' in buildCreateBody({ ...EMPTY_CREATE_DRAFT, name: 'A', provinceCode: 'G1', latitude: '95', longitude: '9' })).toBe(true);
  });

  it('sends only the changed fields of a sheet, a cleared one as null', () => {
    expect(buildUpdateBody(draftOfSheet(sheet), sheet)).toEqual({ unchanged: true });
    expect(buildUpdateBody({ ...draftOfSheet(sheet), name: 'Ferme Ngoma II', amiRef: '' }, sheet, true)).toEqual({
      body: { name: 'Ferme Ngoma II', amiRef: null, confirmDuplicate: true },
    });
    expect(buildUpdateBody({ ...draftOfSheet(sheet), provinceCode: 'G2', localiteId: '' }, sheet)).toEqual({
      body: { provinceCode: 'G2', localiteId: null },
    });
    expect(buildUpdateBody({ ...draftOfSheet(sheet), exploitantPhone: '+241 74 00 00 00' }, sheet)).toEqual({ unchanged: true });
  });

  it('checks infrastructure lines', () => {
    expect(checkInfrastructures([{ code: '', count: '', surfaceM2: '' }])).toEqual({ items: [] });
    expect('error' in checkInfrastructures([{ code: 'A', count: '1', surfaceM2: '' }, { code: 'A', count: '2', surfaceM2: '' }])).toBe(true);
    expect('error' in checkInfrastructures([{ code: 'A', count: '', surfaceM2: '' }])).toBe(true);
    expect(checkInfrastructures([{ code: 'A', count: '3', surfaceM2: '250,5' }])).toEqual({ items: [{ code: 'A', count: 3, surfaceM2: 250.5 }] });
  });

  it('builds a GPS correction', () => {
    const base = { latitude: '0.4', longitude: '9.4', accuracyM: '', capturedAt: '', reason: '', today: '2026-11-06' };
    expect(buildGpsBody(base)).toEqual({ body: { latitude: 0.4, longitude: 9.4, source: 'MANUEL' } });
    expect(buildGpsBody({ ...base, capturedAt: '2026-11-01', reason: ' Erreur de saisie ', accuracyM: '8' })).toEqual({
      body: { latitude: 0.4, longitude: 9.4, accuracyM: 8, source: 'MANUEL', capturedAt: '2026-11-01', reason: 'Erreur de saisie' },
    });
    expect(buildGpsBody({ ...base, latitude: '', longitude: '' })).toEqual({ error: 'Indiquez la latitude et la longitude du relevé.' });
    expect(buildGpsBody({ ...base, capturedAt: '2026-11-07' })).toEqual({ error: 'La date du relevé ne peut pas être future.' });
  });

  it('parses decimals with a comma or a dot', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('-1,5')).toBe(-1.5);
    expect(parseDecimal('1e3')).toBeNaN();
  });
});
