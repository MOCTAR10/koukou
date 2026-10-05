import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const MIME_PDF = 'application/pdf';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export interface PdfDeviceResult {
  /** true quand le PDF est écrit dans le dossier choisi par l'utilisateur (SAF, Android) */
  savedToDownloads?: boolean;
  /** true quand le PDF est partagé via la feuille système (Enregistrer dans Fichiers… sur iOS) */
  shared?: boolean;
  uri: string;
}

/**
 * Android (privacy-first) : demande à l'utilisateur d'autoriser un dossier
 * (Téléchargements recommandé) via le sélecteur SAF, puis écrit le PDF dedans.
 * Aucune permission globale n'est requise — l'accès est accordé dossier par dossier.
 */
export async function savePdfToDownloads(bytes: Uint8Array, filename: string): Promise<PdfDeviceResult> {
  const dir = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!dir.granted || !dir.directoryUri) {
    return { savedToDownloads: false, uri: '' };
  }
  const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
    dir.directoryUri,
    filename.replace(/\.pdf$/i, ''),
    MIME_PDF,
  );
  await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, toBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { savedToDownloads: true, uri: fileUri };
}

/** iOS / autres : copie en cache puis feuille de partage système (Enregistrer dans Fichiers…). */
export async function savePdfToShareSheet(bytes: Uint8Array, filename: string): Promise<PdfDeviceResult> {
  const dest = (FileSystem.cacheDirectory ?? '') + filename;
  await FileSystem.writeAsStringAsync(dest, toBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(dest, {
    mimeType: MIME_PDF,
    dialogTitle: 'Reçu PDF',
    UTI: 'com.adobe.pdf',
  });
  return { shared: true, uri: dest };
}

/** Enregistrement d'un PDF sur mobile : Android → Downloads (SAF), iOS → partage. */
export async function savePdfOnDevice(bytes: Uint8Array, filename: string): Promise<PdfDeviceResult> {
  return Platform.OS === 'android' ? savePdfToDownloads(bytes, filename) : savePdfToShareSheet(bytes, filename);
}