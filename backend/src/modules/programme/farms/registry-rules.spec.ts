import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, detectDelimiter, CsvError } from './csv.js';
import {
  mapCsvTable,
  mapJsonRows,
  parseCount,
  parseDecimal,
} from './import-mapping.js';
import {
  compactKey,
  duplicateScore,
  foldText,
  isProbableDuplicate,
  matchByCodeOrName,
  matchListItem,
  nameSimilarity,
  normalizeAmiRef,
  normalizeFarmName,
} from './registry-rules.js';

const PROVINCES = [
  { code: 'G1', name: 'Estuaire' },
  { code: 'G2', name: 'Haut-Ogooué' },
  { code: 'G3', name: 'Moyen-Ogooué' },
  { code: 'G4', name: 'Ngounié' },
  { code: 'G5', name: 'Nyanga' },
  { code: 'G6', name: 'Ogooué-Ivindo' },
  { code: 'G7', name: 'Ogooué-Lolo' },
  { code: 'G8', name: 'Ogooué-Maritime' },
  { code: 'G9', name: 'Woleu-Ntem' },
];

describe('farm name normalization', () => {
  it('folds accents, case and punctuation', () => {
    expect(foldText("FERME AVICOLE GRÂCE D'HORIZON (FAGH)")).toBe(
      'ferme avicole grace d horizon fagh',
    );
    expect(foldText('L’ŒUF-NATURE')).toBe('l oeuf nature');
    expect(compactKey('Haut-Ogooué')).toBe(compactKey('HAUT OGOOUE'));
  });

  it('drops generic words and particles', () => {
    expect(normalizeFarmName('FERME AVICOLE NGOMA')).toBe('ngoma');
    expect(normalizeFarmName('Coopérative agropastorale Nyali')).toBe('nyali');
    expect(normalizeFarmName('ETS Élevage de la Komo')).toBe('komo');
    expect(normalizeFarmName('Société agricole Pongui’s Family')).toBe(
      'pongui s family',
    );
    expect(normalizeFarmName('EXPLOITATION AGRICOLE DU KOMO MONDAH')).toBe(
      'komo mondah',
    );
  });

  it('keeps the folded name when only generic words are left', () => {
    expect(normalizeFarmName('FERME AGRICOLE')).toBe('ferme agricole');
  });

  it('normalizes AMI references', () => {
    expect(normalizeAmiRef('  ami-2025 / 012 ')).toBe('AMI-2025 / 012');
    expect(normalizeAmiRef('   ')).toBeNull();
    expect(normalizeAmiRef(undefined)).toBeNull();
  });
});

describe('duplicate scoring', () => {
  const key = (name: string, provinceId = 'G1', extra = {}) => ({
    normalizedName: normalizeFarmName(name),
    provinceId,
    ...extra,
  });

  it('flags the same farm written differently in the same province', () => {
    const s = duplicateScore(key('Ferme avicole Ngoma'), key('NGOMA (ferme)'));
    expect(s.score).toBe(1);
    expect(s.reasons).toEqual(['MEME_NOM']);
    expect(isProbableDuplicate(s)).toBe(true);
  });

  it('flags a one-letter typo in a long name', () => {
    const s = duplicateScore(
      key('FERME AVICOLE MOUNDOUMOU ODETTE'),
      key('Ferme Moundoumou Odete'),
    );
    expect(isProbableDuplicate(s)).toBe(true);
    expect(s.reasons[0]).toBe('NOM_PROCHE');
  });

  it('ignores the same name in another province', () => {
    const s = duplicateScore(key('Ferme Ngoma', 'G1'), key('Ngoma', 'G4'));
    expect(isProbableDuplicate(s)).toBe(false);
  });

  it('does not confuse distinct farms sharing a word', () => {
    expect(
      isProbableDuplicate(
        duplicateScore(
          key('FERME AVICOLE LA GRÂCE'),
          key('FERME AVICOLE GRÂCE DIVINE'),
        ),
      ),
    ).toBe(false);
  });

  it('flags the same exploitant phone, whatever the province', () => {
    const s = duplicateScore(
      key('Ferme Alpha', 'G1', { phone: '+24177000000' }),
      key('Ferme Omega', 'G5', { phone: '+24177000000' }),
    );
    expect(s.reasons).toEqual(['MEME_TELEPHONE']);
    expect(isProbableDuplicate(s)).toBe(true);
  });

  it('never flags two farms of the POUFA list', () => {
    const table = parseCsv(
      readFileSync(join('test', 'fixtures', 'fermes-poufa.csv'), 'utf8'),
    );
    const { rows } = mapCsvTable(table);
    const keys = rows.map((r) => ({
      name: r.values.name!,
      normalizedName: normalizeFarmName(r.values.name!),
      provinceId: matchByCodeOrName(r.values.province!, PROVINCES)!.code,
    }));
    const flagged: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        if (isProbableDuplicate(duplicateScore(keys[i], keys[j]))) {
          flagged.push(`${keys[i].name} ~ ${keys[j].name}`);
        }
      }
    }
    expect(flagged).toEqual([]);
  });

  it('scores similarity symmetrically in [0, 1]', () => {
    expect(nameSimilarity('abc', 'abc')).toBe(1);
    expect(nameSimilarity('', 'abc')).toBe(0);
    const ab = nameSimilarity('komo mondah', 'mondah komo');
    expect(ab).toBe(nameSimilarity('mondah komo', 'komo mondah'));
    expect(ab).toBeGreaterThan(0.7);
  });
});

describe('province and list matching', () => {
  it('matches a province by name, tolerant to case, accents and hyphens, or by code', () => {
    expect(matchByCodeOrName('estuaire', PROVINCES)?.code).toBe('G1');
    expect(matchByCodeOrName('HAUT OGOOUE', PROVINCES)?.code).toBe('G2');
    expect(matchByCodeOrName('Ogooué-Maritime', PROVINCES)?.code).toBe('G8');
    expect(matchByCodeOrName('woleu ntem', PROVINCES)?.code).toBe('G9');
    expect(matchByCodeOrName('g5', PROVINCES)?.code).toBe('G5');
    expect(matchByCodeOrName('Ogooué', PROVINCES)).toBeNull();
    expect(matchByCodeOrName('', PROVINCES)).toBeNull();
  });

  it('matches a list item by code, label or trailing number', () => {
    const cohorts = [
      { code: 'COHORTE_1', label: 'Cohorte 1' },
      { code: 'COHORTE_2', label: 'Cohorte 2' },
    ];
    expect(matchListItem('cohorte 2', cohorts)?.code).toBe('COHORTE_2');
    expect(matchListItem('COHORTE_1', cohorts)?.code).toBe('COHORTE_1');
    expect(matchListItem('2', cohorts)?.code).toBe('COHORTE_2');
    expect(matchListItem('3', cohorts)).toBeNull();
    const statuses = [
      { code: 'EN_PREPARATION', label: 'En préparation' },
      { code: 'OPERATIONNELLE', label: 'Opérationnelle' },
    ];
    expect(matchListItem('en preparation', statuses)?.code).toBe(
      'EN_PREPARATION',
    );
    expect(matchListItem('Opérationnelle', statuses)?.code).toBe(
      'OPERATIONNELLE',
    );
  });
});

describe('CSV parsing', () => {
  it('reads quotes, doubled quotes, delimiters and line breaks inside quotes', () => {
    const text =
      '﻿numero,nom,province\r\n1,"FERME DU NTEM, ONA & FILS",Woleu-Ntem\r\n2,"FERME ""SANGOMA""",Nyanga\n3,"DEUX\nLIGNES",Estuaire\n\n';
    expect(parseCsv(text)).toEqual([
      ['numero', 'nom', 'province'],
      ['1', 'FERME DU NTEM, ONA & FILS', 'Woleu-Ntem'],
      ['2', 'FERME "SANGOMA"', 'Nyanga'],
      ['3', 'DEUX\nLIGNES', 'Estuaire'],
    ]);
  });

  it('detects a semicolon delimiter (French Excel)', () => {
    const text = 'nom;province;capacite\nFerme A;Estuaire;1 200\n';
    expect(detectDelimiter(text)).toBe(';');
    expect(parseCsv(text)[1]).toEqual(['Ferme A', 'Estuaire', '1 200']);
  });

  it('refuses an unterminated quote', () => {
    expect(() => parseCsv('nom,province\n"Ferme,Estuaire\n')).toThrow(CsvError);
  });

  it('reads the whole POUFA list: 150 rows', () => {
    const table = parseCsv(
      readFileSync(join('test', 'fixtures', 'fermes-poufa.csv'), 'utf8'),
    );
    const mapped = mapCsvTable(table);
    expect(mapped.error).toBeNull();
    expect(mapped.format).toBe('LISTE_POUFA');
    expect(mapped.rows).toHaveLength(150);
    expect(mapped.rows[0]).toEqual({
      line: 2,
      values: { name: 'AGRI VERT', province: 'Estuaire' },
    });
    const ntem = mapped.rows.find((r) => r.values.name?.includes('NTEM, ONA'));
    expect(ntem?.values.province).toBe('Woleu-Ntem');
  });
});

describe('import mapping', () => {
  it('maps the full format with tolerant headers and ignores numero', () => {
    const mapped = mapCsvTable([
      [
        'N°',
        'Nom',
        'Province',
        'Localité',
        'Exploitant',
        'Téléphone',
        'Réf AMI',
        'Cohorte',
        'Capacité',
        'Latitude',
        'Longitude',
        'Statut',
        'Remarque',
      ],
      [
        '7',
        'Ferme X',
        'Estuaire',
        'Komo',
        'Jean',
        '077 00 00 00',
        'AMI-1',
        '1',
        '1200',
        '0,39',
        '9.45',
        'Opérationnelle',
        'rien',
      ],
    ]);
    expect(mapped.format).toBe('COMPLET');
    expect(mapped.unknownColumns).toEqual(['Remarque']);
    expect(mapped.rows[0].values).toEqual({
      name: 'Ferme X',
      province: 'Estuaire',
      localite: 'Komo',
      exploitantName: 'Jean',
      exploitantPhone: '077 00 00 00',
      amiRef: 'AMI-1',
      cohort: '1',
      capacityPlaces: '1200',
      latitude: '0,39',
      longitude: '9.45',
      status: 'Opérationnelle',
    });
  });

  it('refuses a file without the name or province column', () => {
    expect(mapCsvTable([['nom'], ['Ferme']]).error).toBe(
      'Colonne(s) obligatoire(s) absente(s) : province.',
    );
    expect(mapCsvTable([]).error).toMatch(/Fichier vide/);
  });

  it('maps JSON rows the same way', () => {
    const mapped = mapJsonRows([
      { nom: 'Ferme A', province: 'G1', capacite: 500 },
      { nom: 'Ferme B', province: 'Nyanga', telephone: '+241 77' },
    ]);
    expect(mapped.format).toBe('COMPLET');
    expect(mapped.rows).toEqual([
      {
        line: 1,
        values: { name: 'Ferme A', province: 'G1', capacityPlaces: '500' },
      },
      {
        line: 2,
        values: {
          name: 'Ferme B',
          province: 'Nyanga',
          exploitantPhone: '+241 77',
        },
      },
    ]);
  });

  it('parses counts and decimals', () => {
    expect(parseCount('1 200')).toBe(1200);
    expect(parseCount('')).toBeUndefined();
    expect(parseCount('12.5')).toBeNaN();
    expect(parseCount('-3')).toBeNaN();
    expect(parseDecimal('0,3912')).toBeCloseTo(0.3912);
    expect(parseDecimal('-1.5')).toBe(-1.5);
    expect(parseDecimal('abc')).toBeNaN();
  });
});
