import { describe, expect, it } from 'vitest';
import { badgeText, inboxQuery, nextCursor, webTargetFor } from './notificationRoutes';

const A = '11111111-1111-4111-8111-111111111111';
const F = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';

describe('webTargetFor', () => {
  it('opens an official alert on the programme page for the vets, on the farm’s sanitary page otherwise', () => {
    expect(webTargetFor({ route: `/sanitary-alerts/${A}`, farmId: F }, { programmeAlerts: true })).toEqual({
      path: `/app/surveillance?alerte=${A}`,
      farmId: null,
    });
    expect(webTargetFor({ route: `/sanitary-alerts/${A}`, farmId: F }, { programmeAlerts: false })).toEqual({
      path: `/app/sanitary?alerte=${A}`,
      farmId: F,
    });
  });

  it('maps a declaration to the band’s events, on its farm', () => {
    expect(webTargetFor({ route: `/farms/${F}/batches/${B}/health-events`, farmId: null }, { programmeAlerts: true })).toEqual({
      path: `/app/sanitary?lot=${B}&onglet=maladies`,
      farmId: F,
    });
  });

  it('maps the advisory alerts and a band', () => {
    expect(webTargetFor({ route: '/alerts', farmId: F }, { programmeAlerts: false })).toEqual({ path: '/app/alerts', farmId: F });
    expect(webTargetFor({ route: `/batches/${B}`, farmId: F }, { programmeAlerts: false })).toEqual({ path: `/app/batches?lot=${B}`, farmId: F });
  });

  it('opens a programme report on the reports screen (POUFA lot A)', () => {
    expect(webTargetFor({ route: `/reports/${A}`, farmId: null }, { programmeAlerts: false })).toEqual({
      path: `/app/pilotage/rapports?rapport=${A}`,
      farmId: null,
    });
    expect(webTargetFor({ route: '/reports/not-a-uuid', farmId: null }, { programmeAlerts: false })).toBeNull();
  });

  it('has no web page for the rest', () => {
    for (const route of ['', '/sync', `/notifications/${A}`, '/sanitary-alerts/not-a-uuid', 'https://evil.example/x']) {
      expect(webTargetFor({ route, farmId: F }, { programmeAlerts: true })).toBeNull();
    }
  });
});

describe('inbox helpers', () => {
  it('caps the badge', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(undefined)).toBeNull();
    expect(badgeText(3)).toBe('3');
    expect(badgeText(12)).toBe('9+');
  });

  it('pages by the oldest date, only after a full page', () => {
    expect(nextCursor([{ createdAt: 'b' }, { createdAt: 'a' }], 2)).toBe('a');
    expect(nextCursor([{ createdAt: 'b' }], 2)).toBeNull();
    expect(inboxQuery({ unread: true, before: '2026-11-06T10:00:00.000Z', limit: 30 })).toBe(
      'unread=true&before=2026-11-06T10%3A00%3A00.000Z&limit=30',
    );
    expect(inboxQuery({ unread: false, limit: 30 })).toBe('limit=30');
  });
});
