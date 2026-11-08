// Links built from server text (QR URL, partner link, phone): never `javascript:`/`data:`.

/** The URL when it is http(s) or an app path (`/…`), otherwise `null`. */
export function safeHref(raw: string | null | undefined): string | null {
  const url = (raw ?? '').trim();
  if (!url) return null;
  // A path of this site; `//host` is a protocol-relative link to another site.
  if (url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** `tel:` link of a typed phone number: digits and a leading plus only, `null` when no digit is left. */
export function telHref(raw: string | null | undefined): string | null {
  const phone = (raw ?? '').trim();
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return `tel:${phone.startsWith('+') ? '+' : ''}${digits}`;
}
