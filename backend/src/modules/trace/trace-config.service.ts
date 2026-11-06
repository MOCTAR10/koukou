import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  hashIp,
  lotQrUrl,
  signLotCode,
  signatureMatches,
} from './qr-signature.js';
import { resolveTraceConfig, type TraceConfig } from './trace-config.js';

/** Traceability settings (`trace-config.ts`) and the QR signing key. */
@Injectable()
export class TraceConfigService {
  private readonly config: TraceConfig;

  constructor(configService: ConfigService) {
    this.config = resolveTraceConfig((key) => configService.get<string>(key));
    const logger = new Logger(TraceConfigService.name);
    for (const warning of this.config.warnings) logger.warn(warning);
  }

  get consommonsGabonaisUrl(): string {
    return this.config.consommonsGabonaisUrl;
  }

  sign(code: string): string {
    return signLotCode(this.config.secret, code);
  }

  matches(expected: string, provided: string | null | undefined): boolean {
    return signatureMatches(expected, provided);
  }

  qrUrl(code: string, token: string): string {
    return lotQrUrl(this.config.publicBaseUrl, code, token);
  }

  hashIp(ip: string | null | undefined): string | null {
    return hashIp(this.config.secret, ip);
  }
}
