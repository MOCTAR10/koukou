/**
 * Moyenne pondérée de valeurs déjà calculées par le serveur (ex. taux de ponte
 * de plusieurs lots pondéré par les vivants). Les lots sans valeur sont ignorés,
 * jamais comptés à zéro. Aucun indicateur n’est recalculé ici.
 */
export function weightedMean(items: ReadonlyArray<{ value: number | null | undefined; weight: number }>): number | null {
  let sum = 0;
  let weights = 0;
  for (const it of items) {
    if (it.value == null || !Number.isFinite(it.value) || !(it.weight > 0)) continue;
    sum += it.value * it.weight;
    weights += it.weight;
  }
  return weights > 0 ? sum / weights : null;
}
