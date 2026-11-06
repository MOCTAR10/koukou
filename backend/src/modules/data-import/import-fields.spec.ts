import { describe, expect, it } from 'vitest';
import { ImportJobType } from '../../common/enums/import-job.enum.js';
import {
  buildMapping,
  mapCells,
  mappingProblem,
  pipelineOf,
} from './import-fields.js';
import { IMPORT_TEMPLATES, templateTable } from './import-templates.js';

describe('import column mapping', () => {
  it('maps farm headers like the farm importer, ignoring the order number', () => {
    const { mapping, unknownColumns } = buildMapping('FARMS', [
      'Numéro',
      'Nom de la ferme',
      'PROVINCE',
      'Réf AMI',
      'Téléphone',
      'Couleur',
      'Observations',
    ]);
    expect(mapping).toMatchObject({
      Numéro: null,
      'Nom de la ferme': 'name',
      PROVINCE: 'province',
      'Réf AMI': 'amiRef',
      Téléphone: 'exploitantPhone',
      Couleur: null,
    });
    expect(unknownColumns).toEqual(['Couleur']);
  });

  it('maps band headers by aliases and keeps the first of two', () => {
    const { mapping } = buildMapping('BANDS', [
      'N° bande',
      'Code ferme',
      'Date mise en place',
      'Effectif',
      'Date',
      'Mortalité',
      'Morts',
    ]);
    expect(mapping).toMatchObject({
      'N° bande': 'bandRef',
      'Code ferme': 'farmCode',
      'Date mise en place': 'integrationDate',
      Effectif: 'quantityAtStart',
      Date: 'entryDate',
      Mortalité: 'deaths',
      Morts: null,
    });
    expect(mappingProblem('BANDS', {}, mapping)).toBeNull();
  });

  it('applies overrides and reports what makes a mapping unusable', () => {
    const headers = ['Exploitation', 'Région'];
    const auto = buildMapping('FARMS', headers);
    expect(mappingProblem('FARMS', {}, auto.mapping)).toMatch(
      /obligatoire\(s\) absente\(s\) : nom .*province/,
    );
    const overrides = { Exploitation: 'name', Région: 'province' };
    const fixed = buildMapping('FARMS', headers, overrides);
    expect(fixed.mapping).toEqual(overrides);
    expect(mappingProblem('FARMS', overrides, fixed.mapping)).toBeNull();
    expect(
      mappingProblem('FARMS', { Exploitation: 'nom' }, fixed.mapping),
    ).toMatch(/Champ\(s\) inconnu\(s\)/);
    expect(
      mappingProblem(
        'FARMS',
        { Exploitation: 'name', Région: 'name' },
        fixed.mapping,
      ),
    ).toMatch(/même champ : name/);
  });

  it('needs a way to find the farm of a band', () => {
    const { mapping } = buildMapping('BANDS', [
      'ref_bande',
      'date_mise_en_place',
      'effectif_initial',
    ]);
    expect(mappingProblem('BANDS', {}, mapping)).toMatch(
      /La ferme doit être identifiée/,
    );
  });

  it('maps cells to trimmed values, blanks left out', () => {
    expect(
      mapCells(['a', 'b', 'c'], { a: 'name', b: null, c: 'province' }, [
        ' X ',
        'y',
        '',
      ]),
    ).toEqual({ name: 'X' });
  });

  it('every template maps onto its own fields', () => {
    for (const t of IMPORT_TEMPLATES) {
      const { headers } = templateTable(t);
      const pipeline = pipelineOf(t.type);
      const { mapping, unknownColumns } = buildMapping(pipeline, headers);
      expect(unknownColumns).toEqual([]);
      expect(mappingProblem(pipeline, {}, mapping)).toBeNull();
      expect(Object.values(mapping).filter(Boolean)).toEqual(
        t.fields.map((f) => f.key),
      );
    }
    expect(pipelineOf(ImportJobType.AMI)).toBe('FARMS');
    expect(pipelineOf(ImportJobType.OUTIL_TRANSITOIRE)).toBe('BANDS');
  });
});
