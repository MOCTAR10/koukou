// Pure rules of the in-app updates, kept free of native modules so they can be tested.

export interface ApkInfo {
  versionCode: number;
  version: string;
  runtimeVersion: string;
  url: string;
}

/** Reads the small version.json published next to the APK; null when it is not usable. */
export function parseApkInfo(raw: unknown): ApkInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const code = Number(r.versionCode);
  if (!Number.isInteger(code) || code <= 0) return null;
  if (typeof r.url !== 'string' || !/^https:\/\//.test(r.url)) return null;
  return {
    versionCode: code,
    version: typeof r.version === 'string' ? r.version : '',
    runtimeVersion: typeof r.runtimeVersion === 'string' ? r.runtimeVersion : '',
    url: r.url,
  };
}

/**
 * A newer APK is offered only when the installed build is older AND the new one
 * carries native changes (another runtime version): otherwise the over-the-air
 * bundle brings the same code without a 60 MB download.
 */
export function shouldOfferApk(
  remote: ApkInfo,
  local: { buildNumber: number | null; runtimeVersion: string | null; otaEnabled: boolean },
): boolean {
  if (local.buildNumber == null || remote.versionCode <= local.buildNumber) return false;
  if (!local.otaEnabled || !local.runtimeVersion || !remote.runtimeVersion) return true;
  return remote.runtimeVersion !== local.runtimeVersion;
}

/** Throttle: at most one check per `minGapMs`. */
export function isCheckDue(lastAt: number | null, now: number, minGapMs: number): boolean {
  return lastAt == null || now - lastAt >= minGapMs || now < lastAt;
}
