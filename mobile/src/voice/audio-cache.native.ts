import { Directory, File, Paths } from 'expo-file-system';

/**
 * Downloads a protected voice note (it needs the Authorization header, which a
 * player cannot always send) into the cache directory and returns the local
 * file URI. A note already downloaded is reused: notes are immutable.
 */
const dir = new Directory(Paths.cache, 'koukou-voice-notes');

export async function fetchAudioToCache(
  source: { uri: string; headers: Record<string, string> },
  audioId: string,
): Promise<string> {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, `${audioId}.m4a`);
  if (target.exists && target.size > 0) return target.uri;
  const file = await File.downloadFileAsync(source.uri, target, { headers: source.headers, idempotent: true });
  return file.uri;
}
