import { AlertLevel } from '../../common/enums/alert-level.enum.js';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationEvent,
} from '../../common/enums/notification.enum.js';
import { DEFAULT_NOTIFICATION_RULES } from './data/default-rules.js';
import {
  isConfidential,
  ruleProblem,
  severityPasses,
  smsRetryDelayMin,
  smsText,
  utcDayStart,
  type RuleShape,
} from './notify-rules.js';

const { IN_APP, PUSH, SMS } = NotificationChannel;

const rule = (over: Partial<RuleShape> = {}): RuleShape => ({
  event: NotificationEvent.WEIGHING_LATE,
  audience: NotificationAudience.FARM_MANAGERS,
  profileCode: null,
  channels: [IN_APP, PUSH],
  escalateAfterMin: null,
  ...over,
});

describe('notification rules', () => {
  it('always keeps the in-app channel (its reading stops the escalation)', () => {
    expect(ruleProblem(rule({ channels: [PUSH] }), false)).toMatch(
      /application/,
    );
    expect(ruleProblem(rule({ channels: [IN_APP, IN_APP] }), false)).toMatch(
      /double/,
    );
    expect(ruleProblem(rule(), false)).toBeNull();
  });

  it('keeps unpublished sanitary events between the farm and the vets', () => {
    const vetOnly = rule({
      event: NotificationEvent.SANITARY_ALERT_CREATED,
      audience: NotificationAudience.PROFILE,
      profileCode: 'DGE',
    });
    expect(ruleProblem(vetOnly, false)).toMatch(/services vétérinaires/);
    expect(ruleProblem({ ...vetOnly, profileCode: 'VETERINAIRE' }, true)).toBeNull();
    expect(
      ruleProblem(
        { ...vetOnly, event: NotificationEvent.SANITARY_ALERT_PUBLISHED },
        false,
      ),
    ).toBeNull();
    expect(isConfidential(NotificationEvent.DECLARATION_RECEIVED)).toBe(true);
    expect(isConfidential(NotificationEvent.SANITARY_ALERT_PUBLISHED)).toBe(false);
  });

  it('checks the audience and the escalation', () => {
    expect(
      ruleProblem(rule({ audience: NotificationAudience.PROFILE }), false),
    ).toMatch(/profil/);
    expect(ruleProblem(rule({ profileCode: 'DGE' }), false)).toMatch(
      /PROFILE/,
    );
    expect(
      ruleProblem(rule({ channels: [IN_APP, SMS], escalateAfterMin: 10 }), false),
    ).toMatch(/inutile/);
    expect(ruleProblem(rule({ escalateAfterMin: 0 }), false)).toMatch(/1 à/);
    expect(ruleProblem(rule({ escalateAfterMin: 30 }), false)).toBeNull();
  });

  it('seeds valid defaults that need no SMS provider', () => {
    for (const d of DEFAULT_NOTIFICATION_RULES) {
      const shape = {
        event: d.event,
        audience: d.audience,
        profileCode: d.profileCode ?? null,
        channels: d.channels,
        escalateAfterMin: null,
      };
      expect(ruleProblem(shape, d.profileCode === 'VETERINAIRE'), d.code).toBeNull();
      expect(d.channels, d.code).not.toContain(SMS);
    }
    const codes = DEFAULT_NOTIFICATION_RULES.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('filters by severity', () => {
    expect(severityPasses(AlertLevel.ROUGE, AlertLevel.JAUNE)).toBe(true);
    expect(severityPasses(AlertLevel.VERT, AlertLevel.JAUNE)).toBe(false);
    expect(severityPasses(AlertLevel.JAUNE, AlertLevel.JAUNE)).toBe(true);
  });
});

describe('SMS', () => {
  it('says the minimum: programme, event, code', () => {
    const text = smsText('POUFA', NotificationEvent.SANITARY_ALERT_CREATED, 'G1-0012');
    expect(text).toBe(
      "POUFA : nouvelle alerte sanitaire G1-0012. Ouvrez l'application.",
    );
    expect(smsText('POUFA', NotificationEvent.WEIGHING_LATE, null)).toBe(
      "POUFA : pesée en retard. Ouvrez l'application.",
    );
  });

  it('retries with a growing delay', () => {
    expect([1, 2, 3, 4, 9].map(smsRetryDelayMin)).toEqual([1, 5, 15, 60, 60]);
  });

  it('caps per UTC day', () => {
    expect(utcDayStart(new Date('2026-11-06T23:30:00+01:00')).toISOString()).toBe(
      '2026-11-06T00:00:00.000Z',
    );
  });
});
