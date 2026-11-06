import { describe, expect, it } from 'vitest';
import { BatchType } from '../../common/enums/batch-type.enum.js';
import { ImportRowOutcome } from '../../common/enums/import-job.enum.js';
import {
  bandSourceKey,
  controlBandRows,
  parseBandType,
  parseDay,
  parseInteger,
  parseNumber,
  type BandControlContext,
  type BandRowInput,
  type LinkedBand,
} from './band-import-rules.js';

const FARM = {
  id: 'f1',
  code: 'G1-0001',
  name: 'Ferme Agri Vert',
  provinceCode: 'G1',
  provinceName: 'Estuaire',
  amiRef: 'AMI-42',
  capacityPlaces: 2000,
};

function ctx(over: Partial<BandControlContext> = {}): BandControlContext {
  return {
    today: '2026-11-06',
    farms: [
      FARM,
      {
        ...FARM,
        id: 'f2',
        code: 'G2-0001',
        name: 'Autre',
        amiRef: null,
        provinceCode: 'G2',
        provinceName: 'Haut-Ogooué',
      },
    ],
    breeds: [
      {
        id: 'b1',
        name: 'Cobb 500',
        refCode: 'CB-500',
        type: BatchType.CHAIR,
        farmId: null,
      },
      {
        id: 'b2',
        name: 'ISA Brown',
        refCode: 'ISA',
        type: BatchType.PONDEUSE,
        farmId: null,
      },
    ],
    buildingsByFarm: new Map([['f1', [{ id: 'h1', name: 'Bâtiment A' }]]]),
    links: new Map(),
    bandsByFarm: new Map(),
    confirmDuplicate: false,
    ...over,
  };
}

const band = {
  bandRef: 'B07',
  farmCode: 'G1-0001',
  integrationDate: '01/09/2026',
  quantityAtStart: '1000',
};

const rows = (...values: Record<string, string>[]): BandRowInput[] =>
  values.map((v, i) => ({ line: i + 2, values: v }));

describe('band import parsing', () => {
  it('reads French and ISO days, refuses impossible ones', () => {
    expect(parseDay('01/09/2026')).toBe('2026-09-01');
    expect(parseDay('1-9-26')).toBe('2026-09-01');
    expect(parseDay('2026-09-01T00:00:00')).toBe('2026-09-01');
    expect(parseDay('31/02/2026')).toBeNull();
    expect(parseDay('demain')).toBeNull();
    expect(parseDay('  ')).toBeUndefined();
  });

  it('reads numbers with spaces and commas', () => {
    expect(parseNumber('1 250,5')).toBe(1250.5);
    expect(parseNumber('abc')).toBeNaN();
    expect(parseInteger('12')).toBe(12);
    expect(parseInteger('1,5')).toBeNaN();
    expect(parseInteger('-3')).toBeNaN();
  });

  it('reads band types tolerantly', () => {
    expect(parseBandType('Poulet de chair')).toBe(BatchType.CHAIR);
    expect(parseBandType('pondeuses')).toBe(BatchType.PONDEUSE);
    expect(parseBandType('dinde')).toBeNull();
  });

  it('builds a stable source key', () => {
    expect(bandSourceKey('G1-0001', 'b-07')).toBe(
      bandSourceKey('G1-0001', 'B07'),
    );
  });
});

describe('controlBandRows', () => {
  it('plans a band with its entries in date order', () => {
    const r = controlBandRows(
      rows(
        { ...band, breed: 'cobb500', entryDate: '03/09/2026', deaths: '2' },
        {
          bandRef: 'B07',
          farmCode: 'G1-0001',
          entryDate: '02/09/2026',
          deaths: '1',
          feedKg: '25,5',
          avgWeightG: '60',
          sampleSize: '20',
        },
      ),
      ctx(),
    );
    expect(r.rows.every((x) => x.errors.length === 0)).toBe(true);
    expect(r.plans).toHaveLength(1);
    const plan = r.plans[0];
    expect(plan.opening).toMatchObject({
      integrationDate: '2026-09-01',
      quantityAtStart: 1000,
      type: BatchType.CHAIR,
      breedId: 'b1',
      initialAgeDays: 0,
    });
    expect(plan.entries.map((e) => e.entryDate)).toEqual([
      '2026-09-02',
      '2026-09-03',
    ]);
    expect(plan.entries[0]).toMatchObject({
      feedKg: 25.5,
      avgWeightKg: 0.06,
      sampleSize: 20,
    });
    expect(r.rows.map((x) => x.planned)).toEqual([
      ImportRowOutcome.INTEGREE,
      ImportRowOutcome.INTEGREE,
    ]);
  });

  it('finds the farm by AMI reference or by name and province', () => {
    const r = controlBandRows(
      rows(
        {
          bandRef: 'X1',
          amiRef: ' ami-42 ',
          integrationDate: '2026-09-01',
          quantityAtStart: '10',
        },
        {
          bandRef: 'X2',
          farmName: 'AGRI-VERT',
          province: 'estuaire',
          integrationDate: '2026-09-01',
          quantityAtStart: '10',
        },
        {
          bandRef: 'X3',
          farmName: 'Agri Vert',
          integrationDate: '2026-09-01',
          quantityAtStart: '10',
        },
        {
          bandRef: 'X4',
          farmCode: 'G9-9999',
          integrationDate: '2026-09-01',
          quantityAtStart: '10',
        },
      ),
      ctx(),
    );
    expect(r.rows[0].errors).toEqual([]);
    expect(r.rows[1].errors).toEqual([]);
    expect(r.rows[2].errors[0]).toMatch(/province est nécessaire/);
    expect(r.rows[3].errors[0]).toMatch(
      /Ferme inconnue du registre : code « G9-9999 »/,
    );
  });

  it('refuses a code and an AMI reference pointing to two farms', () => {
    const r = controlBandRows(
      rows({ ...band, farmCode: 'G2-0001', amiRef: 'AMI-42' }),
      ctx(),
    );
    expect(r.rows[0].errors[0]).toMatch(/deux fermes différentes/);
  });

  it('blocks the whole band when one line is wrong', () => {
    const r = controlBandRows(
      rows(
        { ...band, entryDate: '02/09/2026', deaths: '1' },
        {
          bandRef: 'B07',
          farmCode: 'G1-0001',
          entryDate: '31/08/2026',
          deaths: '1',
        },
      ),
      ctx(),
    );
    expect(r.plans).toHaveLength(0);
    expect(r.rows[1].errors[0]).toMatch(/antérieure à la mise en place/);
    expect(r.rows[0].errors[0]).toMatch(
      /non reprise tant que la ligne 3 est en erreur/,
    );
    expect(r.rows.map((x) => x.planned)).toEqual([
      ImportRowOutcome.REJETEE,
      ImportRowOutcome.REJETEE,
    ]);
  });

  it('flags inconsistent band columns between lines', () => {
    const r = controlBandRows(
      rows(
        { ...band, entryDate: '02/09/2026' },
        { ...band, quantityAtStart: '1 200', entryDate: '03/09/2026' },
        { ...band, integrationDate: '2026-09-01', entryDate: '04/09/2026' },
      ),
      ctx(),
    );
    expect(r.rows[1].errors[0]).toMatch(
      /Incohérent avec la ligne 2 : effectif initial/,
    );
    // Same day in another format is consistent.
    expect(r.rows[2].errors.join()).not.toMatch(/Incohérent/);
  });

  it('checks dates, headcounts and list codes', () => {
    const r = controlBandRows(
      rows(
        {
          bandRef: 'A',
          farmCode: 'G1-0001',
          integrationDate: '01/12/2026',
          quantityAtStart: '10',
        },
        {
          bandRef: 'B',
          farmCode: 'G1-0001',
          integrationDate: '01/09/2026',
          quantityAtStart: '0',
        },
        {
          bandRef: 'C',
          farmCode: 'G1-0001',
          integrationDate: '01/09/2026',
          quantityAtStart: '10',
          type: 'dinde',
        },
        {
          bandRef: 'D',
          farmCode: 'G1-0001',
          integrationDate: '01/09/2026',
          quantityAtStart: '10',
          breed: 'Inconnue',
        },
        {
          bandRef: 'E',
          farmCode: 'G1-0001',
          integrationDate: '01/09/2026',
          quantityAtStart: '10',
          breed: 'ISA Brown',
        },
        {
          bandRef: 'F',
          farmCode: 'G1-0001',
          integrationDate: '01/09/2026',
          quantityAtStart: '10',
          building: 'Bâtiment Z',
        },
        {
          bandRef: 'G',
          farmCode: 'G1-0001',
          integrationDate: '01/09/2026',
          quantityAtStart: '3000',
        },
        {
          bandRef: 'H',
          farmCode: 'G1-0001',
          integrationDate: '01/09/2026',
          quantityAtStart: '10',
          closureDate: '01/08/2026',
        },
      ),
      ctx(),
    );
    expect(r.rows[0].errors[0]).toMatch(/dans le futur/);
    expect(r.rows[1].errors[0]).toMatch(/Effectif mis en place invalide/);
    expect(r.rows[2].errors[0]).toMatch(/Type de bande inconnu/);
    expect(r.rows[3].errors[0]).toMatch(/Souche inconnue/);
    expect(r.rows[4].errors[0]).toMatch(/incompatible avec une bande CHAIR/);
    expect(r.rows[5].errors[0]).toMatch(/Bâtiment inconnu/);
    expect(r.rows[6].errors).toEqual([]);
    expect(r.rows[6].warnings[0]).toMatch(/supérieur à la capacité/);
    expect(r.rows[7].errors[0]).toMatch(/antérieure à la mise en place/);
  });

  it('checks cumulative deaths, samples and the emptied band', () => {
    const base = { bandRef: 'B07', farmCode: 'G1-0001' };
    const r = controlBandRows(
      rows(
        {
          ...base,
          integrationDate: '01/09/2026',
          quantityAtStart: '10',
          entryDate: '02/09/2026',
          deaths: '4',
          avgWeightG: '50',
          sampleSize: '11',
        },
        { ...base, entryDate: '03/09/2026', deaths: '6' },
        { ...base, entryDate: '04/09/2026', deaths: '0' },
      ),
      ctx(),
    );
    expect(r.rows[0].errors[0]).toMatch(/Échantillon impossible : 11/);
    expect(r.rows[2].errors[0]).toMatch(
      /plus aucun sujet vivant depuis le 03\/09\/2026/,
    );
    const over = controlBandRows(
      rows({
        ...base,
        integrationDate: '01/09/2026',
        quantityAtStart: '10',
        entryDate: '02/09/2026',
        deaths: '11',
      }),
      ctx(),
    );
    expect(over.rows[0].errors[0]).toMatch(/Mortalité cumulée \(11\)/);
  });

  it('refuses entry data without a date and duplicated days', () => {
    const r = controlBandRows(
      rows(
        { ...band, deaths: '2' },
        { bandRef: 'B07', farmCode: 'G1-0001', entryDate: '02/09/2026' },
        { bandRef: 'B07', farmCode: 'G1-0001', entryDate: '2026-09-02' },
      ),
      ctx(),
    );
    expect(r.rows[0].errors[0]).toMatch(/Date de la saisie manquante/);
    expect(r.rows[2].errors[0]).toMatch(/en double \(déjà ligne 3\)/);
  });

  it('blocks a probable duplicate of an existing band unless confirmed', () => {
    const bandsByFarm = new Map([
      [
        'f1',
        [
          {
            id: 'x',
            code: 'G1-0001-B01',
            integrationDate: '2026-09-01',
            quantityAtStart: 1000,
          },
        ],
      ],
    ]);
    const blocked = controlBandRows(rows(band), ctx({ bandsByFarm }));
    expect(blocked.rows[0].errors[0]).toMatch(
      /probablement déjà enregistrée.*G1-0001-B01/,
    );
    const confirmed = controlBandRows(
      rows(band),
      ctx({ bandsByFarm, confirmDuplicate: true }),
    );
    expect(confirmed.rows[0].errors).toEqual([]);
    expect(confirmed.rows[0].warnings[0]).toMatch(/Reprise confirmée/);
  });

  it('re-runs as already present and only adds new days', () => {
    const linked: LinkedBand = {
      batchId: 'bb',
      code: 'G1-0001-B04',
      closed: false,
      integrationDate: '2026-09-01',
      quantityAtStart: 1000,
      entryDates: new Set(['2026-09-02']),
    };
    const links = new Map([[bandSourceKey('G1-0001', 'B07'), linked]]);
    const r = controlBandRows(
      rows(
        { ...band, entryDate: '02/09/2026', deaths: '1' },
        {
          bandRef: 'b-07',
          farmCode: 'G1-0001',
          entryDate: '03/09/2026',
          deaths: '1',
        },
      ),
      ctx({ links }),
    );
    expect(r.plans).toHaveLength(1);
    expect(r.plans[0].linked).toBe(linked);
    expect(r.plans[0].entries.map((e) => e.line)).toEqual([3]);
    expect(r.rows.map((x) => x.planned)).toEqual([
      ImportRowOutcome.DEJA_PRESENTE,
      ImportRowOutcome.INTEGREE,
    ]);
    const closed = controlBandRows(
      rows({ ...band, entryDate: '03/09/2026' }),
      ctx({
        links: new Map([
          [bandSourceKey('G1-0001', 'B07'), { ...linked, closed: true }],
        ]),
      }),
    );
    expect(closed.rows[0].errors[0]).toMatch(/déjà reprise et clôturée/);
  });

  it('warns when a band has no daily entry', () => {
    const r = controlBandRows(rows(band), ctx());
    expect(r.rows[0].warnings[0]).toMatch(/Aucune saisie journalière/);
    expect(r.plans[0].entries).toHaveLength(0);
  });
});
