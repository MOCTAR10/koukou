import { BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import {
  TraceLotKind,
  TraceLotStatus,
} from '../../common/enums/trace.enum.js';
import { PUBLIC_LOT_NOTICE, toPublicLotView } from './public-lot-view.js';
import {
  QR_SIGNATURE_LENGTH,
  geoCellOf,
  hashIp,
  lotQrUrl,
  signLotCode,
  signatureMatches,
} from './qr-signature.js';
import {
  DEV_TRACE_PUBLIC_BASE_URL,
  DEV_TRACE_QR_SECRET,
  TRACE_BASE_URL_MISSING_MESSAGE,
  TRACE_SECRET_MISSING_MESSAGE,
  resolveTraceConfig,
} from './trace-config.js';

const env = (vars: Record<string, string>) => (key: string) => vars[key];

describe('QR signature', () => {
  const code = 'G1-0012-B07-L01-03';

  it('is a truncated, url-safe HMAC of the code with the server key', () => {
    const s = signLotCode('key-a', code);
    expect(s).toHaveLength(QR_SIGNATURE_LENGTH);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(signLotCode('key-a', code)).toBe(s);
    expect(signLotCode('key-b', code)).not.toBe(s);
    expect(signLotCode('key-a', 'G1-0012-B07-L01-04')).not.toBe(s);
  });

  it('matches only the exact signature', () => {
    const s = signLotCode('key-a', code);
    expect(signatureMatches(s, s)).toBe(true);
    expect(signatureMatches(s, `${s.slice(0, -1)}x`)).toBe(false);
    expect(signatureMatches(s, s.slice(1))).toBe(false);
    expect(signatureMatches(s, null)).toBe(false);
    expect(signatureMatches(s, undefined)).toBe(false);
  });

  it('builds the printed address', () => {
    expect(lotQrUrl('https://poufa.ga/', code, 'abc_-1')).toBe(
      'https://poufa.ga/l/G1-0012-B07-L01-03?s=abc_-1',
    );
  });

  it('never keeps the IP: a keyed fingerprint', () => {
    const h = hashIp('key-a', '196.1.2.3');
    expect(h).toHaveLength(32);
    expect(h).not.toContain('196');
    expect(hashIp('key-a', '196.1.2.3')).toBe(h);
    expect(hashIp('key-b', '196.1.2.3')).not.toBe(h);
    expect(hashIp('key-a', undefined)).toBeNull();
  });

  it('keeps only a coarse area of a position', () => {
    expect(geoCellOf('0.4162', '9.4673')).toBe('0.4;9.4');
    expect(geoCellOf('-1.65', '13.58')).toBe('-1.7;13.5');
    expect(geoCellOf(undefined, '9')).toBeNull();
    expect(geoCellOf('abc', '9')).toBeNull();
    expect(geoCellOf('91', '9')).toBeNull();
  });
});

describe('resolveTraceConfig', () => {
  it('requires the key and the public address in production', () => {
    expect(() => resolveTraceConfig(env({ NODE_ENV: 'production' }))).toThrow(
      TRACE_SECRET_MISSING_MESSAGE,
    );
    expect(() =>
      resolveTraceConfig(
        env({ NODE_ENV: 'production', TRACE_QR_SECRET: DEV_TRACE_QR_SECRET }),
      ),
    ).toThrow(TRACE_SECRET_MISSING_MESSAGE);
    expect(() =>
      resolveTraceConfig(
        env({ NODE_ENV: 'production', TRACE_QR_SECRET: 's3cret' }),
      ),
    ).toThrow(TRACE_BASE_URL_MISSING_MESSAGE);
    const ok = resolveTraceConfig(
      env({
        NODE_ENV: 'production',
        TRACE_QR_SECRET: 's3cret',
        TRACE_PUBLIC_BASE_URL: 'https://poufa.ga/',
      }),
    );
    expect(ok).toMatchObject({
      secret: 's3cret',
      publicBaseUrl: 'https://poufa.ga',
      consommonsGabonaisUrl: 'https://poufa.ga/consommons-gabonais',
      warnings: [],
    });
  });

  it('falls back to development defaults elsewhere, with a warning', () => {
    const dev = resolveTraceConfig(env({}));
    expect(dev.secret).toBe(DEV_TRACE_QR_SECRET);
    expect(dev.publicBaseUrl).toBe(DEV_TRACE_PUBLIC_BASE_URL);
    expect(dev.warnings).toHaveLength(1);
  });
});

describe('public lot view', () => {
  it('is a whitelist with the mandatory mention', () => {
    const view = toPublicLotView(
      {
        code: 'G1-0012-B07-L01-03',
        kind: TraceLotKind.SOUS_LOT,
        status: TraceLotStatus.CEDE,
        quantity: 50,
        cededOn: '2026-11-05',
        farmName: 'Ferme Test',
        localiteName: 'Owendo',
        provinceName: 'Estuaire',
        bandCode: 'G1-0012-B07',
        species: Species.POULET,
        customSpecies: null,
        batchType: BatchType.CHAIR,
        integrationDate: '2026-09-20',
        closedAt: new Date('2026-11-05T10:00:00Z'),
        operatorTypeLabel: 'Abattoir',
      },
      'https://poufa.ga/consommons-gabonais',
    );
    expect(view.notice).toBe(PUBLIC_LOT_NOTICE);
    expect(view.notice).toContain('ne constitue pas un certificat sanitaire');
    expect(view.producer).toEqual({
      farmName: 'Ferme Test',
      localite: 'Owendo',
      province: 'Estuaire',
    });
    expect(view.band).toEqual({
      code: 'G1-0012-B07',
      openedOn: '2026-09-20',
      closedOn: '2026-11-05',
    });
    expect(view.consommonsGabonais.url).toBe(
      'https://poufa.ga/consommons-gabonais',
    );
    const text = JSON.stringify(view);
    for (const forbidden of ['phone', 'latitude', 'longitude', 'Fcfa', 'Id"']) {
      expect(text).not.toContain(forbidden);
    }
  });
});
