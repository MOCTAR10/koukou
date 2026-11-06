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
 * SANITAIRE:VALIDER to publish, seeded on the VETERINAIRE profile) and that
 * the sanitary declarations rule lets through. The administration decides who
 * holds these grants; the platform admin holds no matrix: it reads every
 * alert but never decides one. Decision to validate with the DGE and the
 * veterinary services (« à valider DGE / vétérinaires »).
 */
export const SANITARY_DECISION_ACTIONS = {
  qualify: 'MODIFIER',
  publish: 'VALIDER',
} as const satisfies Record<string, AccessAction>;

export type SanitaryDecision = keyof typeof SANITARY_DECISION_ACTIONS;

export const VETERINARY_AUTHORITY_MESSAGE: Record<SanitaryDecision, string> = {
  qualify:
    'Accès refusé : la qualification des alertes sanitaires est réservée à l’autorité vétérinaire (droit Sanitaire : Modifier).',
  publish:
    'Accès refusé : la publication des alertes sanitaires est réservée à l’autorité vétérinaire (droit Sanitaire : Valider).',
};

/** Null when the caller may take the decision, else the French refusal. */
export function sanitaryDecisionRefusal(
  user: { role: string },
  access: Pick<InstitutionAccess, 'profileCode' | 'matrix'> | null,
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
