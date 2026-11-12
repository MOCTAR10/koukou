import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

import { API_BASE_URL } from '@/api/client';
import { flushQueue } from '@/offline';
import { connectivity } from '@/offline/connectivity';
import { toast } from '@/components/ui/Feedback';
import { isCheckDue, parseApkInfo, shouldOfferApk, type ApkInfo } from './logic';

const OTA_MIN_GAP_MS = 5 * 60_000;
const APK_MIN_GAP_MS = 30 * 60_000;
const FIRST_CHECK_DELAY_MS = 4_000;

export type AppUpdateState =
  | { kind: 'none' }
  | { kind: 'ota' }
  | { kind: 'apk'; info: ApkInfo }
  | { kind: 'downloading'; progress: number }
  | { kind: 'applying' };

const ENABLED = Platform.OS === 'android' && !__DEV__;

/**
 * Looks for a new version of the app and exposes it; never installs by itself.
 * Every failure (no network, bad answer, native error) is swallowed: the
 * embedded or last downloaded bundle simply keeps running.
 *
 * 1. Over-the-air: new JS bundle downloaded in the background, applied on tap.
 * 2. New APK (native change): shown only when the OTA cannot bring it.
 */
export function useAppUpdate() {
  const [state, setState] = useState<AppUpdateState>({ kind: 'none' });
  const [dismissed, setDismissed] = useState(false);
  const lastOta = useRef<number | null>(null);
  const lastApk = useRef<number | null>(null);
  const busy = useRef(false);
  const otaReady = useRef(false);

  const checkOta = useCallback(async () => {
    if (!Updates.isEnabled || otaReady.current || !isCheckDue(lastOta.current, Date.now(), OTA_MIN_GAP_MS)) return;
    lastOta.current = Date.now();
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return;
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        otaReady.current = true;
        setDismissed(false);
        setState({ kind: 'ota' });
      }
    } catch {
      // Silent: the current bundle keeps running.
    }
  }, []);

  const checkApk = useCallback(async () => {
    if (otaReady.current || !isCheckDue(lastApk.current, Date.now(), APK_MIN_GAP_MS)) return;
    lastApk.current = Date.now();
    try {
      const origin = API_BASE_URL.replace(/\/api\/?$/, '');
      if (!origin.startsWith('https://')) return;
      const res = await fetch(`${origin}/apk/version.json`, { headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) return;
      const info = parseApkInfo(await res.json());
      if (!info) return;
      const build = parseInt(Application.nativeBuildVersion ?? '', 10);
      const offer = shouldOfferApk(info, {
        buildNumber: Number.isFinite(build) ? build : null,
        runtimeVersion: Updates.runtimeVersion,
        otaEnabled: Updates.isEnabled,
      });
      if (offer) {
        setState((s) => (s.kind === 'none' ? { kind: 'apk', info } : s));
      }
    } catch {
      // Silent.
    }
  }, []);

  useEffect(() => {
    if (!ENABLED) return;
    const run = () => {
      if (!connectivity.isOnline()) return;
      void checkOta().then(checkApk);
    };
    const first = setTimeout(run, FIRST_CHECK_DELAY_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    // Back online: look again (the throttle still applies).
    const unsubscribe = connectivity.subscribe(run);
    return () => {
      clearTimeout(first);
      unsubscribe();
      sub.remove();
    };
  }, [checkOta, checkApk]);

  /** Restarts on the downloaded bundle, once pending offline operations have been sent. */
  const applyOta = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState({ kind: 'applying' });
    try {
      // Joins the send already in progress, if any: no reload in the middle of it.
      await Promise.race([flushQueue(), new Promise((r) => setTimeout(r, 20_000))]).catch(() => undefined);
      await Updates.reloadAsync();
    } catch {
      setState({ kind: 'ota' });
      toast.error('Mise à jour impossible', 'Réessayez dans un instant.');
    } finally {
      busy.current = false;
    }
  }, []);

  /** Downloads the APK and opens the Android installer; falls back to the download link. */
  const installApk = useCallback(async (info: ApkInfo) => {
    if (busy.current) return;
    busy.current = true;
    try {
      setState({ kind: 'downloading', progress: 0 });
      const target = `${FileSystem.cacheDirectory}fermia-update.apk`;
      await FileSystem.deleteAsync(target, { idempotent: true });
      const task = FileSystem.createDownloadResumable(info.url, target, {}, (p) => {
        if (p.totalBytesExpectedToWrite > 0) {
          setState({ kind: 'downloading', progress: p.totalBytesWritten / p.totalBytesExpectedToWrite });
        }
      });
      const res = await task.downloadAsync();
      if (!res || res.status !== 200) throw new Error('download');
      const contentUri = await FileSystem.getContentUriAsync(res.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1,
        type: 'application/vnd.android.package-archive',
      });
      setState({ kind: 'apk', info });
    } catch {
      setState({ kind: 'apk', info });
      try {
        await Linking.openURL(info.url);
      } catch {
        toast.error('Mise à jour impossible', 'Vérifiez votre connexion et réessayez.');
      }
    } finally {
      busy.current = false;
    }
  }, []);

  return { state, dismissed, dismiss: () => setDismissed(true), applyOta, installApk };
}
