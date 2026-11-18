// Web: no file system to cache protected voice notes; listening is offered in
// the Android/iOS app (see audio-cache.native.ts).
export function fetchAudioToCache(
  _source: { uri: string; headers: Record<string, string> },
  _audioId: string,
): Promise<string> {
  return Promise.reject(new Error('L’écoute des notes vocales est disponible dans l’application Android ou iOS.'));
}
