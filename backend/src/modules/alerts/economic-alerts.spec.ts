import { describe, expect, it } from 'vitest';
import { AlertKind } from '../../common/enums/alert-level.enum.js';
import { ECONOMIC_ALERT_KINDS, visibleAlerts } from './economic-alerts.js';

describe('visibleAlerts (F6)', () => {
  const alerts = [
    { id: 'a', kind: AlertKind.MORTALITE },
    { id: 'b', kind: AlertKind.RENTABILITE },
    { id: 'c', kind: AlertKind.VENTE },
    { id: 'd', kind: AlertKind.ALIMENT },
  ];

  it('keeps every alert for a reader of the economic domain', () => {
    expect(visibleAlerts(alerts, true).map((a) => a.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('drops the margin and sales alerts otherwise', () => {
    expect(visibleAlerts(alerts, false).map((a) => a.id)).toEqual(['a', 'd']);
  });

  it('lists RENTABILITE and VENTE as economic', () => {
    expect([...ECONOMIC_ALERT_KINDS].sort()).toEqual(['RENTABILITE', 'VENTE']);
  });
});
