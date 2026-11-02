// Same rules as mobile/src/constants/phone.ts: a Gabon number is stored as
// 0XXXXXXXX, so an account made on the phone signs in here with any spelling.
export function normalizeGabonPhone(raw: string): string {
  let n = raw.replace(/\D/g, '');
  if (n.startsWith('241') && n.length >= 11) n = n.slice(3);
  if (n.length > 9) n = n.slice(0, 9);
  if (n.length === 8 && n[0] !== '0' && !n.startsWith('241')) n = `0${n}`;
  return n;
}

export function isGabonPhoneValid(n: string): boolean {
  return /^0\d{8}$/.test(n);
}
