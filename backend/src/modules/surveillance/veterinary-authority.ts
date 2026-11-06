import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../common/enums/role.enum.js';
import type { AccessAction } from '../access/access-domains.js';
import { grants, type InstitutionAccess } from '../access/access-rules.js';
import { mayHandleSanitaryDeclarations } from '../access/sanitary-declaration.policy.js';

/**
 * CDC §5.2 n° 25-26 and §8: « les services vétérinaires sont seuls à […]
 * qualifier les alertes et à décider de leur publication », « publication par
 * l'autorité vétérinaire seule ».
 *
 * The veterinary authority is an institutional account whose profile grants
 * the decision in the access matrix (SANITAIRE:MODIFIER to qualify,
 * SANITAIRE:VALIDER to publish or validate a declaration, seeded on the
 * VETERINAIRE profile) and that the sanitary declarations rule lets through
 * (SANITAIRE:VALIDER, `isVeterinaryAuthority`). No profile code is read: a
 * profile the administration creates with the same rights decides alike. The administration decides who
 * holds these grants; the platform admin holds no matrix: it reads every
 * alert but never decides one. Decision to validate with the DGE and the
 * veterinary services (« à valider DGE / vétérinaires »).
 */
export const SANITARY_DECISION_ACTIONS = {
  qualify: 'MODIFIER',
  publish: 'VALIDER',
  // POUFA lot A2 vet: CDC n° 26 « valident les événements », a declaration
  // that opened no alert.
  validate: 'VALIDER',
} as const satisfies Record<string, AccessAction>;

export type SanitaryDecision = keyof typeof SANITARY_DECISION_ACTIONS;

export const VETERINARY_AUTHORITY_MESSAGE: Record<SanitaryDecision, string> = {
  qualify:
    'Accès refusé : la qualification des alertes sanitaires est réservée à l’autorité vétérinaire (droit Sanitaire : Modifier).',
  publish:
    'Accès refusé : la publication des alertes sanitaires est réservée à l’autorité vétérinaire (droit Sanitaire : Valider).',
  validate:
    'Accès refusé : la validation des déclarations sanitaires est réservée à l’autorité vétérinaire (droit Sanitaire : Valider).',
};

/** Null when the caller may take the decision, else the French refusal. */
export function sanitaryDecisionRefusal(
  user: { role: string },
  access: Pick<InstitutionAccess, 'matrix'> | null,
  decision: SanitaryDecision,
): string | null {
  const refusal = VETERINARY_AUTHORITY_MESSAGE[decision];
  if (user.role !== UserRole.INSTITUTION || !access) return refusal;
  if (!mayHandleSanitaryDeclarations({ role: UserRole.INSTITUTION }, access)) {
    return refusal;
  }
  return grants(access.matrix, 'SANITAIRE', SANITARY_DECISION_ACTIONS[decision])
    ? null
    : refusal;
}

// POUFA lot A2 vet: the vets' settings are closed to the platform admin.
/**
 * What the veterinary services set for the whole programme (CDC « signes
 * paramétrables par les services vétérinaires », « calendrier vaccinal
 * paramétrable par les services vétérinaires », « liste des produits
 * paramétrable »): the sanitary lists and the shared vaccination calendars.
 * Only an institutional account whose matrix grants the route's SANITAIRE
 * action (checked by the access guard) writes them; the platform admin reads
 * them and changes nothing, like the alerts and the VETERINAIRE parameters.
 */
export type SanitarySettings = 'lists' | 'calendars';

export const SANITARY_SETTINGS_MESSAGE: Record<SanitarySettings, string> = {
  lists:
    'Accès refusé : les listes sanitaires (signes cliniques, produits de traitement, statuts des alertes) sont tenues par les services vétérinaires (droit Sanitaire : Modifier) ; l’administrateur de la plateforme les consulte seulement.',
  calendars:
    'Accès refusé : les calendriers vaccinaux du programme sont tenus par les services vétérinaires (droits Sanitaire : Créer et Modifier) ; l’administrateur de la plateforme les consulte seulement.',
};

/** Null when `role` may write the vets' settings (the guard checked the matrix). */
export function sanitarySettingsRefusal(
  role: string,
  settings: SanitarySettings,
): string | null {
  return role === UserRole.INSTITUTION
    ? null
    : SANITARY_SETTINGS_MESSAGE[settings];
}

/** @throws ForbiddenException when `role` may not write the vets' settings */
export function assertSanitarySettings(
  role: string,
  settings: SanitarySettings,
): void {
  const refusal = sanitarySettingsRefusal(role, settings);
  if (refusal) throw new ForbiddenException(refusal);
}
