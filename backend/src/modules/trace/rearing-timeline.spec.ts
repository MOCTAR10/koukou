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

  it('leaves out health events the viewer may not read', () => {
    const items = rearingTimeline({ ...base, healthEvents: null });
    expect(items.some((i) => i.kind === K.EVENEMENT_SANITAIRE)).toBe(false);
  });
});
