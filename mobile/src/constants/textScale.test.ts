import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAX_FONT_SCALE } from './textScale';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx$/.test(name) ? [full] : [];
  });
}

const SRC = join(__dirname, '..');
const RN_IMPORT = /import \{([^}]*)\} from 'react-native';/g;

describe('plafond de la taille de police', () => {
  it('est un plafond raisonnable', () => {
    expect(MAX_FONT_SCALE).toBeGreaterThanOrEqual(1.1);
    expect(MAX_FONT_SCALE).toBeLessThanOrEqual(1.3);
  });

  it('aucun écran n’importe TextInput brut de react-native', () => {
    const offenders = sources(SRC).filter((f) => {
      if (f.endsWith('AppTextInput.tsx')) return false;
      const code = readFileSync(f, 'utf8');
      return [...code.matchAll(RN_IMPORT)].some((m) => /\bTextInput\b/.test(m[1].replace(/type TextInputProps/g, '')));
    });
    expect(offenders).toEqual([]);
  });

  it('tout <Text> brut porte maxFontSizeMultiplier', () => {
    const offenders: string[] = [];
    for (const f of sources(SRC)) {
      const code = readFileSync(f, 'utf8');
      const importsText = [...code.matchAll(RN_IMPORT)].some((m) => /\bText\b/.test(m[1]));
      if (!importsText) continue;
      for (const tag of code.matchAll(/<Text(?:\.\w+)?\b[^>]*>/g)) {
        if (!tag[0].includes('maxFontSizeMultiplier')) offenders.push(`${f}: ${tag[0].slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
