import { describe, expect, it } from 'vitest';

import { pushUnavailableReason, resolvePushAvailability } from './push-availability';

describe('resolvePushAvailability', () => {
  it('web : non pris en charge', () => {
    expect(resolvePushAvailability({ os: 'web', isExpoGo: false, projectId: 'p' })).toBe('unsupported');
  });

  it('Expo Go Android : indisponible depuis le SDK 53', () => {
    expect(resolvePushAvailability({ os: 'android', isExpoGo: true, projectId: 'p' })).toBe('expo-go');
  });

  it('Expo Go iOS reste possible avec un projet EAS', () => {
    expect(resolvePushAvailability({ os: 'ios', isExpoGo: true, projectId: 'p' })).toBe('ok');
  });

  it('sans projectId EAS : non configuré', () => {
    expect(resolvePushAvailability({ os: 'android', isExpoGo: false, projectId: undefined })).toBe('not-configured');
    expect(resolvePushAvailability({ os: 'android', isExpoGo: false, projectId: '' })).toBe('not-configured');
  });

  it('build native avec projectId : ok, aucun message', () => {
    const a = resolvePushAvailability({ os: 'android', isExpoGo: false, projectId: 'abc' });
    expect(a).toBe('ok');
    expect(pushUnavailableReason(a)).toBeNull();
    expect(pushUnavailableReason('expo-go')).toContain('Expo Go');
  });
});
