// F4 (POUFA): abattoir picked on an external slaughter order. The server only
// accepts an active operator of the programme whose type belongs to the
// ABATTOIR family (`sale-cession.service.ts#assertAbattoir`).

export const ABATTOIR_FAMILY = 'ABATTOIR';

interface OperatorLike {
  id: string;
  code: string;
  name: string;
  typeCode: string;
  active: boolean;
}

interface TypeLike {
  code: string;
  family: string | null;
  active?: boolean;
}

/** Active operators whose type is of the ABATTOIR family, by name. */
export function abattoirOperators<T extends OperatorLike>(operators: readonly T[] | undefined, types: readonly TypeLike[] | undefined): T[] {
  const codes = new Set((types ?? []).filter((t) => t.family === ABATTOIR_FAMILY).map((t) => t.code));
  return (operators ?? []).filter((o) => o.active && codes.has(o.typeCode)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** `operatorId` to send: only an external order carries an abattoir. */
export function slaughterOperatorId(destination: string, operatorId: string | null, choices: readonly { id: string }[]): string | undefined {
  if (destination !== 'EXTERNE' || !operatorId) return undefined;
  return choices.some((c) => c.id === operatorId) ? operatorId : undefined;
}
