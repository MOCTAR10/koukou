import type {
  AlertLevel,
  CreateRuleBody,
  NotificationAudience,
  NotificationChannel,
  NotificationEvent,
  NotificationRule,
  RuleBody,
} from '../../api/types-surveillance';
import { VET_PROFILE_CODE } from './surveillanceAccess';

/**
 * Notification rule form (`/programme/notification-rules`), same checks as
 * the server's `notify-rules.ts` `ruleProblem`: the in-app channel is always
 * on (its reading stops the escalation), at most one of SMS or escalation,
 * a profile for the PROFILE audience only, and unpublished sanitary events
 * never to a non-veterinary profile. The server's message still shows.
 */

export const AUDIENCE_LABELS: Readonly<Record<NotificationAudience, string>> = {
  PROFILE: 'Un profil institutionnel',
  FARM_MANAGERS: 'Propriétaire et administrateurs de la ferme',
  FARM_TEAM: 'Toute l’équipe de la ferme',
  REPORT_RECIPIENTS: 'Les destinataires du rapport',
};

export const CHANNEL_LABELS: Readonly<Record<NotificationChannel, string>> = {
  IN_APP: 'Dans l’application',
  PUSH: 'Notification push',
  SMS: 'SMS',
};

export const SEVERITY_LABELS: Readonly<Record<AlertLevel, string>> = {
  VERT: 'Toutes (vert et plus)',
  JAUNE: 'Jaune et rouge',
  ROUGE: 'Rouge seulement',
};

export const ESCALATE_MAX_MIN = 24 * 60;

export interface RuleForm {
  code: string;
  event: NotificationEvent | '';
  label: string;
  audience: NotificationAudience;
  profileCode: string;
  push: boolean;
  sms: boolean;
  /** Minutes before the SMS escalation of an unread notification ('' = none). */
  escalate: string;
  severityMin: AlertLevel;
  active: boolean;
}

export function emptyRuleForm(): RuleForm {
  return { code: '', event: '', label: '', audience: 'PROFILE', profileCode: '', push: true, sms: false, escalate: '', severityMin: 'VERT', active: true };
}

export function formFromRule(rule: NotificationRule): RuleForm {
  return {
    code: rule.code,
    event: rule.event,
    label: rule.label,
    audience: rule.audience,
    profileCode: rule.profileCode ?? '',
    push: rule.channels.includes('PUSH'),
    sms: rule.channels.includes('SMS'),
    escalate: rule.escalateAfterMin === null ? '' : String(rule.escalateAfterMin),
    severityMin: rule.severityMin,
    active: rule.active,
  };
}

export function channelsOf(form: Pick<RuleForm, 'push' | 'sms'>): NotificationChannel[] {
  return ['IN_APP', ...(form.push ? (['PUSH'] as const) : []), ...(form.sms ? (['SMS'] as const) : [])];
}

/** French reason why the form can't be saved, or null. */
export function ruleFormProblem(form: RuleForm, opts: { creating: boolean; confidential: boolean }): string | null {
  if (opts.creating) {
    if (!/^[A-Z0-9_]{2,60}$/.test(form.code)) return 'Le code contient de 2 à 60 caractères : majuscules, chiffres ou _.';
    if (!form.event) return 'Choisissez l’événement.';
  }
  if (!form.label.trim()) return 'Le libellé est obligatoire.';
  // POUFA lot A pilot: same rule as the server's ruleProblem.
  if (form.audience === 'REPORT_RECIPIENTS' && form.event && form.event !== 'REPORT_READY') {
    return 'Le destinataire « destinataires du rapport » ne sert qu’à l’événement « rapport disponible ».';
  }
  if (form.label.trim().length > 200) return 'Le libellé ne doit pas dépasser 200 caractères.';
  if (form.audience === 'PROFILE') {
    if (!form.profileCode) return 'Précisez le profil destinataire.';
    if (opts.confidential && form.profileCode !== VET_PROFILE_CODE) {
      return 'Avant publication, les données sanitaires ne vont qu’à la ferme et aux services vétérinaires : choisissez un autre événement ou un autre profil.';
    }
  }
  if (form.escalate.trim()) {
    if (form.sms) return 'Escalade inutile : la règle envoie déjà un SMS. Choisissez le SMS ou l’escalade, pas les deux.';
    const n = Number(form.escalate);
    if (!Number.isInteger(n) || n < 1 || n > ESCALATE_MAX_MIN) return `Le délai d’escalade va de 1 à ${ESCALATE_MAX_MIN} minutes.`;
  }
  return null;
}

export function ruleBody(form: RuleForm): RuleBody {
  return {
    label: form.label.trim(),
    audience: form.audience,
    profileCode: form.audience === 'PROFILE' ? form.profileCode || null : null,
    channels: channelsOf(form),
    escalateAfterMin: form.escalate.trim() ? Number(form.escalate) : null,
    severityMin: form.severityMin,
    active: form.active,
  };
}

export function createRuleBody(form: RuleForm): CreateRuleBody {
  if (!form.event) throw new Error('event required');
  return { code: form.code, event: form.event, ...ruleBody(form) };
}

/** « Dans l’application, SMS après 30 min ». */
export function deliverySummary(rule: Pick<NotificationRule, 'channels' | 'escalateAfterMin'>): string {
  const parts = rule.channels.map((c) => CHANNEL_LABELS[c] ?? c);
  if (rule.escalateAfterMin !== null) parts.push(`SMS si non lue après ${rule.escalateAfterMin} min`);
  return parts.join(', ');
}
