// Recorded offline conflicts (CDC §7.2 « la dernière saisie horodatée est
// retenue et le conflit signalé »): one French sentence per conflict saying
// which value was kept. Pure, mirroring backend sync/conflict-rules.ts.
import type { SyncConflictView } from '@/api/poufa';

const FIELD_LABELS: Record<string, string> = {
  deaths: 'Morts',
  feedQuantity: 'Aliment',
  waterL: 'Eau',
  avgWeightKg: 'Poids moyen',
  sampleSize: 'Sujets pesés',
  eggsCollected: 'Œufs collectés',
  eggsSellable: 'Œufs vendables',
  eggsCracked: 'Œufs fêlés',
  eggsSmall: 'Petits œufs',
  eggsDoubleYolk: 'Œufs double jaune',
  eggsDirty: 'Œufs sales',
};

export function conflictFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function trimNumber(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** A field value as people read it (weights in g, feed in kg, water in L). */
export function conflictValue(field: string, value: unknown): string {
  if (value == null || value === '') return 'vide';
  if (typeof value !== 'number') return String(value);
  switch (field) {
    case 'avgWeightKg':
      return `${Math.round(value * 1000)} g`;
    case 'feedQuantity':
      return `${trimNumber(value)} kg`;
    case 'waterL':
      return `${trimNumber(value)} L`;
    default:
      return trimNumber(value);
  }
}

/** « 05/11 à 10:05 », Gabon time (UTC+1, no daylight saving). */
export function gabonTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const t = new Date(ms + 3_600_000).toISOString();
  return `${t.slice(8, 10)}/${t.slice(5, 7)} à ${t.slice(11, 16)}`;
}

export interface ConflictExplanation {
  title: string;
  kept: string;
  text: string;
}

/** Which value was kept, and why (the later capture wins, a tie keeps the server). */
export function conflictExplanation(c: SyncConflictView): ConflictExplanation {
  const label = conflictFieldLabel(c.field);
  const server = conflictValue(c.field, c.serverValue);
  const incoming = conflictValue(c.field, c.incomingValue);
  const serverAt = gabonTime(c.serverCapturedAt);
  const incomingAt = gabonTime(c.incomingCapturedAt);
  const at = (t: string | null) => (t ? ` (saisie le ${t})` : '');
  const title = `${c.entityLabel ?? 'Saisie'} · ${label}`;
  let text: string;
  let kept: string;
  if (c.winner === 'APPAREIL') {
    kept = incoming;
    text =
      `La valeur ${incoming} envoyée hors ligne${at(incomingAt)} a été retenue : elle est plus récente que ` +
      `la valeur ${server} enregistrée depuis un autre appareil${at(serverAt)}.`;
  } else {
    kept = server;
    text =
      `La valeur ${server} déjà enregistrée${at(serverAt)} a été conservée : la valeur ${incoming} envoyée ` +
      `hors ligne${at(incomingAt)} n’est pas plus récente.`;
  }
  text += ' La valeur écartée reste gardée dans le journal des conflits.';
  if (c.clockCorrected) {
    text += ' L’heure du téléphone était décalée : elle a été corrigée avant la comparaison.';
  }
  return { title, kept, text };
}
