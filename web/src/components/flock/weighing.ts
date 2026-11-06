// Weighing of a daily entry (CDC n° 8 « Date ; nombre pesé ; poids moyen »):
// the number of birds weighed goes with every average weight, prefilled with
// the programme's sample size (PESEE_ECHANTILLON_TETES).

/** Value the « Sujets pesés » field opens with. */
export function initialSampleSize(
  existing: { sampleSize?: number | null; avgWeightKg?: number | null } | null | undefined,
  expected: number | null | undefined,
): string {
  if (existing?.sampleSize) return String(existing.sampleSize);
  return expected && expected > 0 ? String(expected) : '';
}

/**
 * French message when the sample does not go with the weight, else null.
 * Required as soon as a weight is typed; a whole number from 1 to the birds
 * present (the server refuses more).
 */
export function sampleSizeError(weightG: number, raw: string, present: number | null): string | null {
  if (!(weightG > 0)) return null;
  const text = raw.trim();
  if (text === '') return 'Indiquez le nombre de sujets pesés avec le poids moyen.';
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) return 'Le nombre de sujets pesés est un nombre entier d’au moins 1.';
  if (present != null && present > 0 && n > present) {
    return `Échantillon impossible : ${n} sujet(s) pesé(s) pour ${present} présent(s).`;
  }
  return null;
}

/** The sample is below what the programme asks: advisory only. */
export function sampleBelowExpected(raw: string, expected: number | null | undefined): boolean {
  const n = Number(raw.trim());
  return expected != null && expected > 0 && Number.isInteger(n) && n > 0 && n < expected;
}
