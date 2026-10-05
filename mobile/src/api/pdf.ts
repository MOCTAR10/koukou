import { Platform } from 'react-native';

import { API_BASE_URL, ApiError } from './client';
import { loadSession } from './token';

export interface PdfDownloadResult {
  platform: 'web' | 'android' | 'ios' | 'native';
  /** true quand le PDF a été écrit dans le dossier Téléchargements (Android, via SAF) */
  savedToDownloads?: boolean;
  /** true quand le PDF est passé par la feuille de partage système (iOS) */
  shared?: boolean;
  uri?: string;
}

export async function downloadPdf(path: string, filename: string): Promise<PdfDownloadResult> {
  const session = loadSession();
  const headers: Record<string, string> = { Accept: 'application/pdf' };
  if (session) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const message = text.trim() ? text.trim().slice(0, 200) : `Erreur serveur (${res.status})`;
    throw new ApiError(res.status, message);
  }

  if (Platform.OS === 'web') {
    await savePdfOnWeb(await res.blob(), filename);
    return { platform: 'web' };
  }

  const { savePdfOnDevice } = await import('./pdf-native');
  const result = await savePdfOnDevice(new Uint8Array(await res.arrayBuffer()), filename);
  return {
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    savedToDownloads: result.savedToDownloads,
    shared: result.shared,
    uri: result.uri,
  };
}

export function savePdfOnWeb(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}