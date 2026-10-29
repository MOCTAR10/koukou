import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

let generated: string | null = null;

const KNOWN_PLACEHOLDERS = ['', 'koukou_ferme_change_me_in_production'];

/**
 * Résout la clé JWT : celle de l'environnement si elle est réelle, sinon un
 * secret aléatoire temporaire (aucun secret connu codé en dur). En l'absence
 * de JWT_SECRET réel, les sessions sont invalidées à chaque redémarrage.
 */
export function resolveJwtSecret(config: ConfigService): string {
  const configured = config.get<string>('JWT_SECRET');
  if (configured && !KNOWN_PLACEHOLDERS.includes(configured.trim())) {
    return configured;
  }
  // Generated once per process: the signer (JwtModule) and the verifier
  // (JwtStrategy) both call this, and two different secrets would turn every
  // authenticated request into a 401.
  if (generated == null) {
    generated = randomBytes(48).toString('hex');
    console.warn(
      '[auth] JWT_SECRET absent ou placeholder détecté : un secret aléatoire temporaire est utilisé. ' +
        "Définissez JWT_SECRET dans l'environnement pour des sessions stables (les jetons seront invalidés au redémarrage).",
    );
  }
  return generated;
}
