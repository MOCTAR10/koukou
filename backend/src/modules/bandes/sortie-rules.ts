/** CDC n° 9 and §6.1: every sortie names its recipient. */
export const SORTIE_RECIPIENT_MESSAGE =
  'Le destinataire est obligatoire : un nom ou un opérateur du registre.';

/** A free name or a registry operator (CDC « destinataire obligatoire »). */
export function hasSortieRecipient(dto: {
  recipientName?: string | null;
  operatorId?: string | null;
}): boolean {
  return Boolean(dto.operatorId) || Boolean(dto.recipientName?.trim());
}
