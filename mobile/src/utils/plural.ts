/** « 1 lot » / « 2 lots »: French plural (0 and 1 are singular). */
export function plural(n: number, one: string, many?: string): string {
  return `${n.toLocaleString('fr-FR')} ${Math.abs(n) < 2 ? one : (many ?? `${one}s`)}`;
}
