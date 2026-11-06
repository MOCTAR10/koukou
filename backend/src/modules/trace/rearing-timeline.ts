import { CareType } from '../../common/enums/care-type.enum.js';
import { HealthEventKind } from '../../common/enums/health-event-kind.enum.js';
import { RearingEventKind } from '../../common/enums/trace.enum.js';

/**
 * Rearing chronology of a lot (CDC T2 « Historique d'élevage du lot »): the
 * band's own records, never re-entered — opening, cares, treatments,
 * mortality, weighings, health events, sorties and closure. Pure, so the
 * ordering and wording are unit-tested.
 */
export interface RearingItem {
  date: string;
  kind: RearingEventKind;
  label: string;
  quantity: number | null;
  details: Record<string, unknown>;
}

export interface RearingSources {
  band: {
    integrationDate: string;
    quantityAtStart: number;
    initialAgeDays: number | null;
    couvoirSupplier: string | null;
    chickLotNumber: string | null;
    hatchDate: string | null;
    closedAt: Date | null;
  };
  cares: {
    careType: CareType;
    name: string;
    completedAt: Date;
    withdrawalDays: number;
  }[];
  treatments: {
    careType: CareType;
    productName: string;
    administeredAt: Date;
    withdrawalEndDate: string | null;
  }[];
  days: {
    day: string;
    deaths: number;
    weighed: boolean;
    lastWeightG: number | null;
    sampleSize: number | null;
  }[];
  /** Absent when the viewer may not read sanitary declarations. */
  healthEvents: {
    kind: HealthEventKind;
    occurredAt: string;
    title: string;
    quantity: number;
    disease: string | null;
  }[] | null;
  sorties: {
    id: string;
    sortieDate: string;
    count: number;
    weightKg: number | null;
    reasonCode: string;
    reasonLabel: string | null;
    operatorName: string | null;
    lotCode: string | null;
  }[];
}

const CARE_LABELS: Record<CareType, string> = {
  VACCIN: 'Vaccin',
  MEDICAMENT: 'Médicament',
  VITAMINE: 'Vitamine',
  ANTIBIOTIQUE: 'Antibiotique',
  AUTRE: 'Soin',
};

const HEALTH_LABELS: Record<HealthEventKind, string> = {
  MALADIE: 'Maladie',
  MORTALITE: 'Mortalité',
  REFORME: 'Réforme',
  SYMPTOME: 'Symptôme',
  VISITE_VETO: 'Visite vétérinaire',
  AUTRE: 'Événement sanitaire',
};

const ORDER: readonly RearingEventKind[] = [
  RearingEventKind.OUVERTURE,
  RearingEventKind.SOIN,
  RearingEventKind.TRAITEMENT,
  RearingEventKind.EVENEMENT_SANITAIRE,
  RearingEventKind.MORTALITE,
  RearingEventKind.PESEE,
  RearingEventKind.SORTIE,
  RearingEventKind.CLOTURE,
];

const dayOf = (d: Date | string) =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

export function rearingTimeline(src: RearingSources): RearingItem[] {
  const items: RearingItem[] = [];
  const { band } = src;
  const age = band.initialAgeDays ?? 0;
  items.push({
    date: dayOf(band.integrationDate),
    kind: RearingEventKind.OUVERTURE,
    label: `Mise en place : ${band.quantityAtStart} sujets${age > 0 ? ` (reçus à J+${age})` : ''}`,
    quantity: band.quantityAtStart,
    details: {
      initialAgeDays: band.initialAgeDays,
      couvoirSupplier: band.couvoirSupplier,
      chickLotNumber: band.chickLotNumber,
      hatchDate: band.hatchDate,
    },
  });
  // A care with a withdrawal period also writes a treatment record: shown once.
  const careKeys = new Set(
    src.cares.map((c) => `${c.name}|${c.completedAt.getTime()}`),
  );
  for (const c of src.cares) {
    items.push({
      date: dayOf(c.completedAt),
      kind: RearingEventKind.SOIN,
      label: `${CARE_LABELS[c.careType] ?? 'Soin'} : ${c.name}`,
      quantity: null,
      details: { careType: c.careType, withdrawalDays: c.withdrawalDays },
    });
  }
  for (const t of src.treatments) {
    if (careKeys.has(`${t.productName}|${t.administeredAt.getTime()}`)) continue;
    items.push({
      date: dayOf(t.administeredAt),
      kind: RearingEventKind.TRAITEMENT,
      label: `Traitement : ${t.productName}`,
      quantity: null,
      details: { careType: t.careType, withdrawalEndDate: t.withdrawalEndDate },
    });
  }
  for (const d of src.days) {
    if (d.deaths > 0) {
      items.push({
        date: d.day,
        kind: RearingEventKind.MORTALITE,
        label: `${d.deaths} mort${d.deaths > 1 ? 's' : ''}`,
        quantity: d.deaths,
        details: {},
      });
    }
    if (d.weighed && d.lastWeightG != null) {
      items.push({
        date: d.day,
        kind: RearingEventKind.PESEE,
        label: `Pesée : ${Math.round(d.lastWeightG)} g de moyenne`,
        quantity: null,
        details: { avgWeightG: d.lastWeightG, sampleSize: d.sampleSize },
      });
    }
  }
  for (const h of src.healthEvents ?? []) {
    items.push({
      date: dayOf(h.occurredAt),
      kind: RearingEventKind.EVENEMENT_SANITAIRE,
      label: `${HEALTH_LABELS[h.kind] ?? 'Événement sanitaire'} : ${h.title}`,
      quantity: h.quantity || null,
      details: { kind: h.kind, disease: h.disease },
    });
  }
  for (const s of src.sorties) {
    const reason = s.reasonLabel ?? s.reasonCode;
    items.push({
      date: dayOf(s.sortieDate),
      kind: RearingEventKind.SORTIE,
      label: `Sortie : ${s.count} sujet${s.count > 1 ? 's' : ''} (${reason})${s.operatorName ? ` vers ${s.operatorName}` : ''}`,
      quantity: s.count,
      details: {
        sortieId: s.id,
        reasonCode: s.reasonCode,
        weightKg: s.weightKg,
        lotCode: s.lotCode,
      },
    });
  }
  if (band.closedAt) {
    items.push({
      date: dayOf(band.closedAt),
      kind: RearingEventKind.CLOTURE,
      label: 'Clôture de la bande',
      quantity: null,
      details: {},
    });
  }
  return items
    .map((item, i) => ({ item, i }))
    .sort(
      (a, b) =>
        a.item.date.localeCompare(b.item.date) ||
        ORDER.indexOf(a.item.kind) - ORDER.indexOf(b.item.kind) ||
        a.i - b.i,
    )
    .map(({ item }) => item);
}
