import { AlertLevel } from '../../../common/enums/alert-level.enum.js';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationEvent,
} from '../../../common/enums/notification.enum.js';
import { PROFILE_CODES } from '../../access/data/default-profiles.js';

export interface DefaultRule {
  code: string;
  label: string;
  event: NotificationEvent;
  audience: NotificationAudience;
  profileCode?: string;
  channels: NotificationChannel[];
  severityMin?: AlertLevel;
}

const IN_APP = NotificationChannel.IN_APP;
const PUSH = NotificationChannel.PUSH;

/**
 * « Proposé » defaults, seeded once per programme and then edited by the
 * administration. None uses SMS nor escalation: no SMS provider is live yet
 * (in-app + push only). ALERT_RAISED is in-app only because `PushService`
 * already pushes it to the farm's managers.
 */
export const DEFAULT_NOTIFICATION_RULES: readonly DefaultRule[] = [
  {
    code: 'VET_ALERTE_SANITAIRE_NOUVELLE',
    label: 'Services vétérinaires : nouvelle alerte sanitaire',
    event: NotificationEvent.SANITARY_ALERT_CREATED,
    audience: NotificationAudience.PROFILE,
    profileCode: PROFILE_CODES.VETERINAIRE,
    channels: [IN_APP, PUSH],
  },
  {
    code: 'FERME_ALERTE_SANITAIRE_NOUVELLE',
    label: 'Ferme : alerte sanitaire ouverte sur une bande',
    event: NotificationEvent.SANITARY_ALERT_CREATED,
    audience: NotificationAudience.FARM_MANAGERS,
    channels: [IN_APP, PUSH],
  },
  {
    code: 'VET_ALERTE_SANITAIRE_STATUT',
    label: "Services vétérinaires : statut d'une alerte modifié",
    event: NotificationEvent.SANITARY_ALERT_STATUS_CHANGED,
    audience: NotificationAudience.PROFILE,
    profileCode: PROFILE_CODES.VETERINAIRE,
    channels: [IN_APP],
  },
  {
    code: 'FERME_ALERTE_SANITAIRE_STATUT',
    label: "Ferme : statut de l'alerte sanitaire modifié",
    event: NotificationEvent.SANITARY_ALERT_STATUS_CHANGED,
    audience: NotificationAudience.FARM_MANAGERS,
    channels: [IN_APP],
  },
  {
    code: 'DGE_ALERTE_SANITAIRE_PUBLIEE',
    label: 'POUFA / DGE : alerte sanitaire publiée',
    event: NotificationEvent.SANITARY_ALERT_PUBLISHED,
    audience: NotificationAudience.PROFILE,
    profileCode: PROFILE_CODES.DGE,
    channels: [IN_APP, PUSH],
  },
  {
    code: 'AGENT_ALERTE_SANITAIRE_PUBLIEE',
    label: 'Agents techniques : alerte sanitaire publiée sur leurs fermes',
    event: NotificationEvent.SANITARY_ALERT_PUBLISHED,
    audience: NotificationAudience.PROFILE,
    profileCode: PROFILE_CODES.AGENT_TECHNIQUE,
    channels: [IN_APP, PUSH],
  },
  {
    code: 'FERME_ALERTE_SANITAIRE_PUBLIEE',
    label: 'Équipe de la ferme : alerte sanitaire publiée',
    event: NotificationEvent.SANITARY_ALERT_PUBLISHED,
    audience: NotificationAudience.FARM_TEAM,
    channels: [IN_APP, PUSH],
  },
  {
    code: 'VET_DECLARATION_RECUE',
    label: 'Services vétérinaires : déclaration sanitaire reçue',
    event: NotificationEvent.DECLARATION_RECEIVED,
    audience: NotificationAudience.PROFILE,
    profileCode: PROFILE_CODES.VETERINAIRE,
    channels: [IN_APP, PUSH],
  },
  {
    code: 'FERME_ALERTE_CONSEIL',
    label: 'Ferme : alerte de conseil rouge',
    event: NotificationEvent.ALERT_RAISED,
    audience: NotificationAudience.FARM_MANAGERS,
    channels: [IN_APP],
  },
  {
    code: 'FERME_PESEE_RETARD',
    // The ELEVEUR members weigh the birds: the whole team is reminded.
    label: "Ferme (toute l'équipe) : rappel de pesée en retard",
    event: NotificationEvent.WEIGHING_LATE,
    audience: NotificationAudience.FARM_TEAM,
    channels: [IN_APP, PUSH],
  },
  {
    code: 'AGENT_PESEE_RETARD',
    label: 'Agents techniques : pesée en retard sur leurs fermes',
    event: NotificationEvent.WEIGHING_LATE,
    audience: NotificationAudience.PROFILE,
    profileCode: PROFILE_CODES.AGENT_TECHNIQUE,
    channels: [IN_APP],
  },
  // Next-visit reminders: the agent who planned the visit (VISIT_AGENT). The
  // lead time is the parameter VISITE_RAPPEL_J. The administration may add a
  // PROFILE rule (e.g. DGE on VISIT_OVERDUE) from the notification rules.
  {
    code: 'AGENT_VISITE_RAPPEL',
    label: "Agent technique : rappel de la prochaine visite qu'il a planifiée",
    event: NotificationEvent.VISIT_REMINDER,
    audience: NotificationAudience.VISIT_AGENT,
    channels: [IN_APP, PUSH],
  },
  {
    code: 'AGENT_VISITE_RETARD',
    label: "Agent technique : visite planifiée en retard",
    event: NotificationEvent.VISIT_OVERDUE,
    audience: NotificationAudience.VISIT_AGENT,
    channels: [IN_APP, PUSH],
  },
  {
    code: 'FERME_CONFLIT_SAISIE',
    label: 'Ferme : conflit de saisie hors ligne',
    event: NotificationEvent.SYNC_CONFLICT,
    audience: NotificationAudience.FARM_MANAGERS,
    channels: [IN_APP],
  },
  {
    code: 'AGENT_CONFLIT_SAISIE',
    label: 'Agents techniques : conflit de saisie sur leurs fermes',
    event: NotificationEvent.SYNC_CONFLICT,
    audience: NotificationAudience.PROFILE,
    profileCode: PROFILE_CODES.AGENT_TECHNIQUE,
    channels: [IN_APP],
  },
  // POUFA lot A2 vet: CDC n° 26, the farm hears the vets' decision.
  {
    code: 'FERME_DECLARATION_EXAMINEE',
    label: 'Ferme : déclaration sanitaire examinée par les services vétérinaires',
    event: NotificationEvent.DECLARATION_REVIEWED,
    audience: NotificationAudience.FARM_MANAGERS,
    channels: [IN_APP, PUSH],
  },
  // POUFA lot A pilot: reports are sent, not only stored (CDC §5.4, §7.7).
  {
    code: 'RAPPORT_DISPONIBLE',
    label: 'Destinataires du modèle : rapport du programme disponible',
    event: NotificationEvent.REPORT_READY,
    audience: NotificationAudience.REPORT_RECIPIENTS,
    channels: [IN_APP, PUSH],
  },
];
