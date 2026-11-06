/**
 * Places a band is compared with for `moduleRatioVsCapacity`, most precise
 * first: the capacity of the band's building, then the farm's per-building
 * capacity, then the farm's total capacity from the programme registry
 * (`capacityPlaces`, the only one a registry farm always carries). Null when
 * none is known, or none is positive.
 */
export function referenceCapacity(input: {
  buildingCapacity?: number | null;
  capacityPerBuilding?: number | null;
  capacityPlaces?: number | null;
}): number | null {
  for (const value of [
    input.buildingCapacity,
    input.capacityPerBuilding,
    input.capacityPlaces,
  ]) {
    if (value != null && value > 0) return value;
  }
  return null;
}

/** Start headcount over the reference capacity, or null without one. */
export function moduleRatioVsCapacity(
  quantityAtStart: number,
  capacity: number | null,
): number | null {
  return capacity != null ? quantityAtStart / capacity : null;
}
