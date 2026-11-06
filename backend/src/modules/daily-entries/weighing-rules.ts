export const WEIGHING_SAMPLE_REQUIRED_MESSAGE =
  'Pesée : indiquez le nombre de sujets pesés (échantillon).';

/**
 * CDC n° 8: a newly recorded average weight always says how many birds were
 * weighed. An unchanged weight of an older entry is left alone. Pure.
 * @returns the French refusal, or null
 */
export function weighingSampleRefusal(
  dto: { avgWeightKg?: number | null; sampleSize?: number | null },
  existing: { avgWeightKg: number | null; sampleSize: number | null } | null,
): string | null {
  if (dto.avgWeightKg == null || !(dto.avgWeightKg > 0)) return null;
  if (dto.avgWeightKg === existing?.avgWeightKg) return null;
  return (dto.sampleSize ?? existing?.sampleSize ?? null) == null
    ? WEIGHING_SAMPLE_REQUIRED_MESSAGE
    : null;
}
