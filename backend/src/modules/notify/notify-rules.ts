import { AlertLevel } from '../../common/enums/alert-level.enum.js';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationEvent,
} from '../../common/enums/notification.enum.js';

/**
 * Pure rules of the notify module (architecture §12): which events are
 * confidential, rule validation, severity filter, SMS retries and texts.
 */

export const EVENT_LABELS: Readonly<Record<NotificationEvent, string>> = {
  [NotificationEvent.ALERT_RAISED]: 'Alerte de conseil rouge (ferme)',
  [NotificationEvent.SANITARY_ALERT_CREATED]: 'Nouvelle alerte sanitaire',
  [NotificationEvent.SANITARY_ALERT_STATUS_CHANGED]:
    "Changement de statut d'une alerte sanitaire",
  [NotificationEvent.SANITARY_ALERT_PUBLISHED]: 'Alerte sanitaire publiée',
  [NotificationEvent.DECLARATION_RECEIVED]: 'Déclaration sanitaire reçue',
  [NotificationEvent.WEIGHING_LATE]: 'Pesée en retard',
  [NotificationEvent.SYNC_CONFLICT]: 'Conflit de saisie hors ligne',
  [NotificationEvent.REPORT_READY]: 'Rapport du programme disponible',
  // POUFA lot A2 vet.
  [NotificationEvent.DECLARATION_REVIEWED]:
    'Déclaration sanitaire examinée par les services vétérinaires',
};

/**
 * Events about unpublished sanitary data: they reach the farm and the
 * veterinary services only (`mayHandleSanitaryDeclarations`), whatever the
 * rules say.
 */
export const CONFIDENTIAL_EVENTS: readonly NotificationEvent[] = [
  NotificationEvent.SANITARY_ALERT_CREATED,
  NotificationEvent.SANITARY_ALERT_STATUS_CHANGED,
  NotificationEvent.DECLARATION_RECEIVED,
  // POUFA lot A2 vet: the decision on an unpublished declaration.
  NotificationEvent.DECLARATION_REVIEWED,
];

export function isConfidential(event: NotificationEvent): boolean {
  return CONFIDENTIAL_EVENTS.includes(event);
}

const SEVERITY_RANK: Readonly<Record<AlertLevel, number>> = {
  [AlertLevel.VERT]: 0,
  [AlertLevel.JAUNE]: 1,
  [AlertLevel.ROUGE]: 2,
};

export function severityPasses(
  severity: AlertLevel,
  minimum: AlertLevel,
): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum];
}

/** Channel order of an occurrence; the first one present leads it. */
export const CHANNEL_ORDER: readonly NotificationChannel[] = [
  NotificationChannel.IN_APP,
  NotificationChannel.PUSH,
  NotificationChannel.SMS,
];

export const ESCALATE_MAX_MIN = 24 * 60;

export interface RuleShape {
  event: NotificationEvent;
  audience: NotificationAudience;
  profileCode: string | null;
  channels: readonly NotificationChannel[];
  escalateAfterMin: number | null;
}

/**
 * French reason why a rule is invalid, or null. `vetProfile` tells whether
 * its profile may read unpublished sanitary data.
 */
export function ruleProblem(rule: RuleShape, vetProfile: boolean): string | null {
  const channels = new Set(rule.channels);
  if (channels.size !== rule.channels.length) {
    return 'Canal en double dans la règle.';
  }
  if (!channels.has(NotificationChannel.IN_APP)) {
    return "Une règle inclut toujours la notification dans l'application : c'est sa lecture qui arrête l'escalade.";
  }
  // POUFA lot A: the report's own recipients only make sense for a report.
  if (
    rule.audience === NotificationAudience.REPORT_RECIPIENTS &&
    rule.event !== NotificationEvent.REPORT_READY
  ) {
    return 'Le destinataire « destinataires du rapport » ne sert qu’à l’événement « rapport disponible ».';
  }
  if (rule.audience === NotificationAudience.PROFILE) {
    if (!rule.profileCode) {
      return 'Précisez le profil destinataire (profileCode).';
    }
    if (isConfidential(rule.event) && !vetProfile) {
      return 'Avant publication, les données sanitaires ne vont qu’à la ferme et aux services vétérinaires : choisissez un autre événement ou un autre profil.';
    }
  } else if (rule.profileCode) {
    return 'profileCode ne sert qu’au destinataire PROFILE.';
  }
  if (rule.escalateAfterMin !== null) {
    if (channels.has(NotificationChannel.SMS)) {
      return 'Escalade inutile : la règle envoie déjà un SMS.';
    }
    if (
      !Number.isInteger(rule.escalateAfterMin) ||
      rule.escalateAfterMin < 1 ||
      rule.escalateAfterMin > ESCALATE_MAX_MIN
    ) {
      return `Le délai d'escalade va de 1 à ${ESCALATE_MAX_MIN} minutes.`;
    }
  }
  return null;
}

/** SMS sends tried before giving up (ECHEC). */
export const SMS_MAX_ATTEMPTS = 4;
const SMS_RETRY_DELAYS_MIN = [1, 5, 15, 60];

/** Minutes before the next try after `attempts` failures (growing delay). */
export function smsRetryDelayMin(attempts: number): number {
  const i = Math.min(Math.max(attempts, 1), SMS_RETRY_DELAYS_MIN.length) - 1;
  return SMS_RETRY_DELAYS_MIN[i];
}

/** Start of the UTC day of `now` (daily SMS cap). */
export function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * The SMS travels in clear: programme, what happened and a farm or band
 * code, nothing else (no diagnosis, no exploitant name).
 */
export function smsText(
  programCode: string,
  event: NotificationEvent,
  code: string | null,
): string {
  const ref = code ? ` ${code}` : '';
  const what: Record<NotificationEvent, string> = {
    [NotificationEvent.ALERT_RAISED]: `alerte sur la ferme${ref}`,
    [NotificationEvent.SANITARY_ALERT_CREATED]: `nouvelle alerte sanitaire${ref}`,
    [NotificationEvent.SANITARY_ALERT_STATUS_CHANGED]: `alerte sanitaire${ref} mise à jour`,
    [NotificationEvent.SANITARY_ALERT_PUBLISHED]: `alerte sanitaire publiée${ref}`,
    [NotificationEvent.DECLARATION_RECEIVED]: `nouvelle déclaration sanitaire${ref}`,
    [NotificationEvent.WEIGHING_LATE]: code
      ? `pesée en retard, bande ${code}`
      : 'pesée en retard',
    [NotificationEvent.SYNC_CONFLICT]: `conflit de saisie${ref}`,
    [NotificationEvent.REPORT_READY]: 'nouveau rapport disponible',
    [NotificationEvent.DECLARATION_REVIEWED]: `déclaration sanitaire examinée${ref}`,
  };
  return `${programCode} : ${what[event]}. Ouvrez l'application.`;
}
