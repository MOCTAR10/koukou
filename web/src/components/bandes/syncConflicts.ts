// Offline conflicts of a band (`GET /farms/:farmId/sync-conflicts?batchId=`),
// explained in French: the rule is « la dernière saisie horodatée est
// retenue, le conflit est signalé » (CDC §7.2,
// `backend/docs/poufa-conflits-hors-ligne.md`). Same wording as mobile.

export interface SyncConflictRow {
  id: string;
  batchId: string | null;
  entityType: string;
  entityLabel: string | null;
  field: string;
  /** SERVEUR: the value already recorded is kept; APPAREIL: the value sent wins. */
  winner: 'SERVEUR' | 'APPAREIL';
  serverValue: unknown;
  incomingValue: unknown;
  serverCapturedAt: string | null;
  serverDeviceId: string | null;
  incomingCapturedAt: string;
  incomingCapturedAtRaw: string | null;
  incomingDeviceId: string | null;
  clockSkewMs: number | null;
  clockCorrected: boolean;
  createdAt: string;
}

export const SYNC_FIELD_LABELS: Record<string, string> = {
  deaths: 'Morts du jour',
  feedQuantity: 'Aliment (kg)',
  waterL: 'Eau (L)',
  avgWeightKg: 'Poids moyen',
  sampleSize: 'Sujets pesés',
  eggsCollected: 'Œufs collectés',
  eggsSellable: 'Œufs commercialisables',
  eggsCracked: 'Œufs fêlés',
  eggsSmall: 'Petits œufs',
  eggsDoubleYolk: 'Œufs double jaune',
  eggsDirty: 'Œufs sales',
};

export function syncFieldLabel(field: string): string {
  return SYNC_FIELD_LABELS[field] ?? field;
}

/** A conflicting value as typed (weights in g, decimals with a comma). */
export function syncValueLabel(field: string, value: unknown): string {
  if (value == null || value === '') return 'vide';
  if (typeof value !== 'number') return String(value);
  if (field === 'avgWeightKg') return `${Math.round(value * 1000).toLocaleString('fr-FR')} g`;
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function timeLabel(iso: string | null | undefined): string {
  if (!iso) return 'à une heure inconnue';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'à une heure inconnue';
  const day = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const hour = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `le ${day} à ${hour}`;
}

export interface ConflictExplanation {
  /** « Saisie du 2026-11-05 · Morts du jour ». */
  title: string;
  kept: string;
  lost: string;
  /** Why that value was kept. */
  reason: string;
  /** The phone clock was off and its time was corrected by the server. */
  clockNote: string | null;
}

/** Which value was kept, which one was set aside, and why. */
export function conflictExplanation(c: SyncConflictRow): ConflictExplanation {
  const label = syncFieldLabel(c.field);
  const title = `${c.entityLabel ?? 'Saisie'} · ${label}`;
  const server = syncValueLabel(c.field, c.serverValue);
  const incoming = syncValueLabel(c.field, c.incomingValue);
  const serverAt = timeLabel(c.serverCapturedAt);
  const incomingAt = timeLabel(c.incomingCapturedAt);
  const sameTime =
    c.serverCapturedAt != null && Date.parse(c.serverCapturedAt) === Date.parse(c.incomingCapturedAt);
  const kept =
    c.winner === 'APPAREIL'
      ? `Valeur retenue : ${incoming} (saisie ${incomingAt}, arrivée hors ligne).`
      : `Valeur retenue : ${server} (déjà enregistrée, saisie ${serverAt}).`;
  const lost =
    c.winner === 'APPAREIL'
      ? `Valeur remplacée : ${server} (saisie ${serverAt} sur un autre appareil), conservée dans l’historique des conflits.`
      : `Valeur non retenue : ${incoming} (saisie ${incomingAt} hors ligne), conservée dans l’historique des conflits.`;
  const reason =
    c.winner === 'APPAREIL'
      ? 'Les deux appareils ont modifié ce champ : la saisie la plus récente l’emporte.'
      : sameTime
        ? 'Les deux saisies portent la même heure : en cas d’égalité, la valeur déjà enregistrée est gardée.'
        : 'Les deux appareils ont modifié ce champ : la valeur déjà enregistrée avait été saisie plus tard, elle est gardée.';
  const clockNote = c.clockCorrected
    ? 'L’horloge du téléphone était décalée : l’heure de saisie a été corrigée par le serveur avant de décider.'
    : null;
  return { title, kept, lost, reason, clockNote };
}
