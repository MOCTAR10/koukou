/**
 * The instance serves one public programme (POUFA), named by `PROGRAM_CODE`.
 * It is mandatory: every farm belongs to the programme, so the app refuses
 * to start without it rather than run with a half-working registry.
 */
export const PROGRAM_CODE_MISSING_MESSAGE =
  'PROGRAM_CODE est obligatoire : indiquez le code du programme servi par cette instance (ex. PROGRAM_CODE=POUFA dans backend/.env). Toutes les fermes appartiennent à ce programme.';

/**
 * The configured programme code, trimmed.
 * @throws Error when `PROGRAM_CODE` is unset or blank (stops the boot)
 */
export function requireProgramCode(raw: unknown): string {
  const code = typeof raw === 'string' ? raw.trim() : '';
  if (!code) throw new Error(PROGRAM_CODE_MISSING_MESSAGE);
  return code;
}
