/**
 * The farm an account opens on when it has not chosen one yet: the first of
 * the registry by code (G1-0001…), so a programme profile reaching many farms
 * (veterinary services, agents) does not land on whichever name sorts first.
 * Farms without a code keep the order of the list, after the coded ones.
 */
export function defaultFarmId(
  farms: readonly { id: string; code?: string | null }[],
): string | null {
  let best: { id: string; code: string } | null = null;
  for (const farm of farms) {
    const code = farm.code?.trim();
    if (!code) continue;
    if (!best || code.localeCompare(best.code, 'fr', { numeric: true }) < 0) {
      best = { id: farm.id, code };
    }
  }
  return best?.id ?? farms[0]?.id ?? null;
}
