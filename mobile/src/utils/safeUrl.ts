// Links built from server text: never a script-like scheme. Pure, unit-tested.

/** The URL when it is http(s), otherwise `null`. */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  const url = (raw ?? '').trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** `tel:` link of a phone number: digits and a leading plus only, `null` when no digit is left. */
export function telUrl(raw: string | null | undefined): string | null {
  const phone = (raw ?? '').trim();
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return `tel:${phone.startsWith('+') ? '+' : ''}${digits}`;
}
