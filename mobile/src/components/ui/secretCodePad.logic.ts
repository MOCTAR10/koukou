/** Bornes du code secret (aligné sur l'inscription : min. 6 chiffres). */
export const CODE_MIN = 6;
export const CODE_MAX = 12;

/** Ajoute un chiffre au code si valide et sous la longueur maximale (pur, testable). */
export function appendCodeDigit(value: string, digit: string, max: number = CODE_MAX): string {
  if (!/^[0-9]$/.test(digit)) return value;
  if (value.length >= max) return value;
  return value + digit;
}

/** Retire le dernier chiffre du code (pur, testable). */
export function removeCodeDigit(value: string): string {
  return value.slice(0, -1);
}