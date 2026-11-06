import { describe, expect, it } from 'vitest';
import type { NotificationRule } from '../../api/types-surveillance';
import { channelsOf, createRuleBody, deliverySummary, emptyRuleForm, formFromRule, ruleBody, ruleFormProblem } from './ruleForm';

const base = { ...emptyRuleForm(), code: 'VET_SMS', event: 'SANITARY_ALERT_CREATED' as const, label: 'Vétérinaires', profileCode: 'VETERINAIRE' };

describe('ruleFormProblem', () => {
  it('accepts a valid rule', () => {
    expect(ruleFormProblem(base, { creating: true, confidential: true })).toBeNull();
  });

  it('checks the code and the event on creation only', () => {
    expect(ruleFormProblem({ ...base, code: 'bad code' }, { creating: true, confidential: false })).toMatch(/code/);
    expect(ruleFormProblem({ ...base, event: '' }, { creating: true, confidential: false })).toMatch(/événement/);
    expect(ruleFormProblem({ ...base, code: 'bad code' }, { creating: false, confidential: false })).toBeNull();
  });

  it('needs a profile for the PROFILE audience, a veterinary one for an unpublished sanitary event', () => {
    expect(ruleFormProblem({ ...base, profileCode: '' }, { creating: true, confidential: false })).toMatch(/profil/);
    expect(ruleFormProblem({ ...base, profileCode: 'DGE' }, { creating: true, confidential: true })).toMatch(/services vétérinaires/);
    expect(ruleFormProblem({ ...base, profileCode: 'DGE' }, { creating: true, confidential: false })).toBeNull();
  });

  it('keeps the report recipients audience for the report event (POUFA lot A)', () => {
    const report = { ...base, event: 'REPORT_READY' as const, audience: 'REPORT_RECIPIENTS' as const, profileCode: '' };
    expect(ruleFormProblem(report, { creating: true, confidential: false })).toBeNull();
    expect(ruleFormProblem({ ...report, event: 'WEIGHING_LATE' }, { creating: true, confidential: false })).toMatch(/rapport disponible/);
  });

  it('allows at most one of SMS or escalation, within 1..1440 minutes', () => {
    expect(ruleFormProblem({ ...base, sms: true, escalate: '30' }, { creating: false, confidential: false })).toMatch(/pas les deux/);
    expect(ruleFormProblem({ ...base, escalate: '0' }, { creating: false, confidential: false })).toMatch(/1 à 1440/);
    expect(ruleFormProblem({ ...base, escalate: '1441' }, { creating: false, confidential: false })).toMatch(/1 à 1440/);
    expect(ruleFormProblem({ ...base, escalate: '30' }, { creating: false, confidential: false })).toBeNull();
  });
});

describe('payloads', () => {
  it('keeps the in-app channel always on, in the server order', () => {
    expect(channelsOf({ push: false, sms: false })).toEqual(['IN_APP']);
    expect(channelsOf({ push: true, sms: true })).toEqual(['IN_APP', 'PUSH', 'SMS']);
  });

  it('clears the profile for a farm audience and reads the escalation', () => {
    expect(ruleBody({ ...base, audience: 'FARM_TEAM', escalate: '15' })).toEqual({
      label: 'Vétérinaires',
      audience: 'FARM_TEAM',
      profileCode: null,
      channels: ['IN_APP', 'PUSH'],
      escalateAfterMin: 15,
      severityMin: 'VERT',
      active: true,
    });
    expect(createRuleBody(base)).toMatchObject({ code: 'VET_SMS', event: 'SANITARY_ALERT_CREATED', profileCode: 'VETERINAIRE', escalateAfterMin: null });
  });

  it('reads an existing rule back into the form', () => {
    const rule = {
      code: 'R',
      event: 'WEIGHING_LATE',
      label: 'Pesée',
      audience: 'FARM_MANAGERS',
      profileCode: null,
      channels: ['IN_APP', 'SMS'],
      escalateAfterMin: null,
      severityMin: 'JAUNE',
      active: false,
    } as unknown as NotificationRule;
    expect(formFromRule(rule)).toMatchObject({ push: false, sms: true, escalate: '', profileCode: '', active: false });
    expect(deliverySummary({ channels: ['IN_APP'], escalateAfterMin: 30 })).toBe('Dans l’application, SMS si non lue après 30 min');
  });
});
