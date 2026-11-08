import { Injectable, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { maskPhone } from '../../audit/audit-sanitize.js';

/**
 * Outgoing SMS, behind one interface so several providers can coexist. The
 * active one is chosen by `SMS_PROVIDER` (default `console`). Only the
 * console sender exists today: the Airtel and Moov adapters come with the
 * notification lot (their APIs are not documented yet).
 */
export interface SmsSender {
  /** Provider name, as in `SMS_PROVIDER`. */
  readonly provider: SmsProvider;
  /** Sends `message` to `phone` (E.164). Rejects when the provider refuses it. */
  send(phone: string, message: string): Promise<void>;
}

export const SMS_PROVIDERS = ['console', 'airtel', 'moov'] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

/** Nest injection token of the active `SmsSender`. */
export const SMS_SENDER = Symbol('SMS_SENDER');

/** One message kept by the console sender (development and tests). */
export interface ConsoleSms {
  phone: string;
  message: string;
  at: Date;
}

/**
 * Development sender: writes the SMS to the server log instead of sending it,
 * and keeps the last few in memory (`lastTo`) so tests can read a code. Never
 * use it in production: the codes appear in the log.
 */
@Injectable()
export class ConsoleSmsSender implements SmsSender {
  readonly provider = 'console' as const;
  private readonly logger = new Logger('SMS');
  private readonly outbox: ConsoleSms[] = [];

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'SMS_PROVIDER=console en production : les SMS ne partent pas, ils sont écrits dans le journal du serveur.',
      );
    }
  }

  send(phone: string, message: string): Promise<void> {
    // In production the message carries one-time codes: never write it (nor
    // the full number) to the server logs.
    if (process.env.NODE_ENV === 'production') {
      this.logger.log(`→ ${maskPhone(phone) ?? '***'} : [contenu masqué]`);
    } else {
      this.logger.log(`→ ${phone} : ${message}`);
    }
    this.outbox.push({ phone, message, at: new Date() });
    if (this.outbox.length > 20) this.outbox.shift();
    return Promise.resolve();
  }

  /** Last message sent to `phone`, if any. */
  lastTo(phone: string): ConsoleSms | null {
    for (let i = this.outbox.length - 1; i >= 0; i--) {
      if (this.outbox[i].phone === phone) return this.outbox[i];
    }
    return null;
  }
}

/**
 * Builds the sender named by `SMS_PROVIDER`. A provider that is not
 * implemented yet stops the boot rather than silently dropping messages.
 */
export function createSmsSender(config: ConfigService): SmsSender {
  const raw = String(config.get('SMS_PROVIDER', 'console'))
    .trim()
    .toLowerCase();
  const provider = (raw || 'console') as SmsProvider;
  if (!(SMS_PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(
      `SMS_PROVIDER inconnu : « ${raw} » (${SMS_PROVIDERS.join(', ')}).`,
    );
  }
  if (provider !== 'console') {
    throw new Error(
      `Le fournisseur SMS « ${provider} » n'est pas encore disponible : utilisez SMS_PROVIDER=console.`,
    );
  }
  return new ConsoleSmsSender();
}
