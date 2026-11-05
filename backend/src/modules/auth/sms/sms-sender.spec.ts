import type { ConfigService } from '@nestjs/config';
import { institutionOtpMode, generateOtp } from '../login-challenge.service.js';
import { ConsoleSmsSender, createSmsSender } from './sms-sender.js';

function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('SMS providers', () => {
  it('defaults to the console sender', () => {
    expect(createSmsSender(config({}))).toBeInstanceOf(ConsoleSmsSender);
    expect(
      createSmsSender(config({ SMS_PROVIDER: ' Console ' })).provider,
    ).toBe('console');
  });

  it('refuses to boot on a provider not built yet, or unknown', () => {
    expect(() => createSmsSender(config({ SMS_PROVIDER: 'airtel' }))).toThrow(
      /pas encore disponible/,
    );
    expect(() => createSmsSender(config({ SMS_PROVIDER: 'moov' }))).toThrow(
      /pas encore disponible/,
    );
    expect(() => createSmsSender(config({ SMS_PROVIDER: 'x' }))).toThrow(
      /inconnu/,
    );
  });

  it('keeps the last message per phone on the console sender', async () => {
    const sender = new ConsoleSmsSender();
    await sender.send('+24101', 'un');
    await sender.send('+24102', 'deux');
    await sender.send('+24101', 'trois');
    expect(sender.lastTo('+24101')?.message).toBe('trois');
    expect(sender.lastTo('+24109')).toBeNull();
  });
});

describe('institutional OTP switch', () => {
  it('is off by default, sms when asked, sms on any other value', () => {
    expect(institutionOtpMode(config({}))).toBe('off');
    expect(institutionOtpMode(config({ INSTITUTION_OTP: 'OFF' }))).toBe('off');
    expect(institutionOtpMode(config({ INSTITUTION_OTP: 'sms' }))).toBe('sms');
    expect(institutionOtpMode(config({ INSTITUTION_OTP: 'oui' }))).toBe('sms');
  });

  it('generates 6-digit codes', () => {
    for (let i = 0; i < 50; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });
});
