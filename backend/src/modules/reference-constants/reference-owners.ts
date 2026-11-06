import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { PROFILE_CODES } from '../access/data/default-profiles.js';

/**
 * Owner profile of each Fermia conduct threshold (`reference_constants`,
 * POUFA audit F8): the platform admin no longer holds them alone. They are
 * exposed in PARAMETRES; only their owner profile (with PARAMETRES:MODIFIER)
 * or the platform admin changes them, like the programme parameters
 * (`mayChangeParameter`). « Proposé » split, à valider DGE: the sanitary
 * ones (vide sanitaire, prophylaxie, mortality, vaccination calendar lead)
 * belong to the veterinary services (CDC §3: they set the alert thresholds),
 * every other one (margins, feed autonomy, densities, sales…) to the DGE
 * (« fixe les paramètres de suivi »). Pure.
 */
export type ReferenceGroup = 'SANITAIRE' | 'CONDUITE';

const SANITARY_KEYS: ReadonlySet<string> = new Set<string>([
  ReferenceKey.VIDE_SANITAIRE_MIN_DAYS,
  ReferenceKey.VIDE_SANITAIRE_MAX_DAYS,
  ReferenceKey.PROPHYLAXIE_RETARD_WARN_DAYS,
  ReferenceKey.CALENDAR_LEAD_DAYS,
  ReferenceKey.MORTALITY_WARN_PCT,
  ReferenceKey.MORTALITY_CRITICAL_PCT,
]);

export function referenceGroup(key: string): ReferenceGroup {
  return SANITARY_KEYS.has(key) ? 'SANITAIRE' : 'CONDUITE';
}

/** The institutional profile that owns a conduct threshold. */
export function referenceOwner(key: string): string {
  return referenceGroup(key) === 'SANITAIRE'
    ? PROFILE_CODES.VETERINAIRE
    : PROFILE_CODES.DGE;
}
