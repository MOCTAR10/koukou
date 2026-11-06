import { CareType } from '../../common/enums/care-type.enum.js';
import { HealthEventKind } from '../../common/enums/health-event-kind.enum.js';
import { RearingEventKind as K } from '../../common/enums/trace.enum.js';
import { rearingTimeline, type RearingSources } from './rearing-timeline.js';

const base: RearingSources = {
  band: {
    integrationDate: '2026-10-01',
    quantityAtStart: 1000,
    initialAgeDays: 3,
    couvoirSupplier: 'Couvoir X',
    chickLotNumber: 'C-12',
    hatchDate: null,
    closedAt: new Date('2026-11-10T08:00:00Z'),
  },
  cares: [
    {
      careType: CareType.VACCIN,
      name: 'Gumboro',
      completedAt: new Date('2026-10-10T07:00:00Z'),
      withdrawalDays: 0,
    },
    {
      careType: CareType.ANTIBIOTIQUE,
      name: 'Amoxicilline',
      completedAt: new Date('2026-10-20T07:00:00Z'),
      withdrawalDays: 5,
    },
  ],
  treatments: [
    // Written by the completed antibiotic care: shown once.
    {
      careType: CareType.ANTIBIOTIQUE,
      productName: 'Amoxicilline',
      administeredAt: new Date('2026-10-20T07:00:00Z'),
      withdrawalEndDate: '2026-10-25',
      reason: 'Infection respiratoire',
      endDate: '2026-10-24',
      animalCount: 980,
    },
    {
      careType: CareType.MEDICAMENT,
      productName: 'Anticoccidien',
      administeredAt: new Date('2026-10-15T07:00:00Z'),
      withdrawalEndDate: null,
    },
  ],
  days: [
    { day: '2026-10-02', deaths: 4, weighed: false, lastWeightG: null, sampleSize: null },
    { day: '2026-10-03', deaths: 0, weighed: false, lastWeightG: 80, sampleSize: null },
    { day: '2026-10-08', deaths: 1, weighed: true, lastWeightG: 412.4, sampleSize: 30 },
  ],
  healthEvents: [
    {
      kind: HealthEventKind.VISITE_VETO,
      occurredAt: '2026-10-08',
      title: 'Contrôle',
      quantity: 0,
      disease: null,
    },
  ],
  sorties: [
    {
      id: 's1',
      sortieDate: '2026-11-10',
      count: 995,
      weightKg: 2100,
      reasonCode: 'ABATTOIR',
      reasonLabel: 'Abattoir',
      operatorName: 'Abattoir de Owendo',
      lotCode: 'G1-0012-B07-L01-01',
    },
  ],
};

describe('rearingTimeline', () => {
  it('lists the band records in order, without re-entry', () => {
    const items = rearingTimeline(base);
    expect(items.map((i) => [i.date, i.kind])).toEqual([
      ['2026-10-01', K.OUVERTURE],
      ['2026-10-02', K.MORTALITE],
      ['2026-10-08', K.EVENEMENT_SANITAIRE],
      ['2026-10-08', K.MORTALITE],
      ['2026-10-08', K.PESEE],
      ['2026-10-10', K.SOIN],
      ['2026-10-15', K.TRAITEMENT],
      ['2026-10-20', K.SOIN],
      ['2026-11-10', K.SORTIE],
      ['2026-11-10', K.CLOTURE],
    ]);
    expect(items[0].label).toBe('Mise en place : 1000 sujets (reçus à J+3)');
    expect(items[1].label).toBe('4 morts');
    expect(items[4].label).toBe('Pesée : 412 g de moyenne');
    expect(items[8].label).toBe(
      'Sortie : 995 sujets (Abattoir) vers Abattoir de Owendo',
    );
    expect(items[8].details).toMatchObject({ lotCode: 'G1-0012-B07-L01-01' });
  });

  it('T2 intrants: deliveries received and feed consumed per stock lot', () => {
    const items = rearingTimeline({
      ...base,
      deliveries: [
        {
          id: 'd1',
          code: 'G1-0012-L03',
          receivedDate: '2026-10-01',
          source: 'ETAT_SMAG',
          supplierName: null,
          lines: [
            {
              intrantCode: 'ALIMENT_DEMARRAGE',
              intrantLabel: 'Aliment démarrage',
              unitCode: 'SAC',
              receivedQuantity: 20,
              feedPhase: 'DEMARRAGE',
            },
            {
              intrantCode: 'VACCIN_GUMBORO',
              intrantLabel: null,
              unitCode: 'FLACON',
              receivedQuantity: 0,
              feedPhase: null,
            },
          ],
        },
      ],
      feedLots: [
        {
          inputLotId: 'l1',
          productName: 'Aliment démarrage',
          supplierLotNumber: 'SMAG-77',
          fromDay: '2026-10-02',
          toDay: '2026-10-08',
          kg: 512.25,
        },
        {
          inputLotId: null,
          productName: null,
          supplierLotNumber: null,
          fromDay: '2026-10-09',
          toDay: '2026-10-09',
          kg: 30,
        },
        {
          inputLotId: 'l2',
          productName: 'Rien',
          supplierLotNumber: 'X',
          fromDay: '2026-10-09',
          toDay: '2026-10-09',
          kg: 0,
        },
      ],
    });
    expect(items.slice(0, 3).map((i) => [i.date, i.kind])).toEqual([
      ['2026-10-01', K.OUVERTURE],
      ['2026-10-01', K.INTRANT],
      ['2026-10-02', K.ALIMENT],
    ]);
    expect(items[1].label).toBe(
      'Livraison G1-0012-L03 reçue : Aliment démarrage 20 SAC',
    );
    expect(items[1].details).toMatchObject({ code: 'G1-0012-L03' });
    expect(items[2].label).toBe(
      'Aliment consommé : 512,3 kg (Aliment démarrage, lot SMAG-77), du 2026-10-02 au 2026-10-08',
    );
    expect(items[2].quantity).toBe(512.25);
    const outside = items.filter((i) => i.kind === K.ALIMENT);
    expect(outside).toHaveLength(2);
    expect(outside[1].label).toBe('Aliment consommé : 30 kg (hors stock suivi)');
  });

  it('leaves out health events the viewer may not read', () => {
    const items = rearingTimeline({ ...base, healthEvents: null });
    expect(items.some((i) => i.kind === K.EVENEMENT_SANITAIRE)).toBe(false);
  });

  it('gives reason, period and animal count of cares and treatments (n° 23)', () => {
    const items = rearingTimeline({
      ...base,
      cares: base.cares.map((c) => ({ ...c, animalCount: 1000 })),
    });
    const abx = items.find((i) => i.label === 'Antibiotique : Amoxicilline');
    expect(abx?.details).toMatchObject({
      reason: 'Infection respiratoire',
      startDate: '2026-10-20',
      endDate: '2026-10-24',
      animalCount: 980,
    });
    const vaccine = items.find((i) => i.kind === K.SOIN && i.date === '2026-10-10');
    expect(vaccine?.details).toMatchObject({ reason: null, startDate: '2026-10-10', endDate: '2026-10-10', animalCount: 1000 });
    const medic = items.find((i) => i.kind === K.TRAITEMENT);
    expect(medic?.details).toMatchObject({ startDate: '2026-10-15', animalCount: null });
  });
});
