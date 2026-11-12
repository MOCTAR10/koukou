import { Text, TextInput } from 'react-native';

/**
 * Plafond global de la taille de police système.
 *
 * Android et iOS agrandissent tout le texte selon le réglage « taille de
 * police » du téléphone (jusqu'à x1,3 ou plus sur le terrain). Les cartes et
 * tuiles de l'app, dimensionnées pour une échelle de 1, débordaient alors
 * (libellés tronqués, chiffres coupés). On garde l'accessibilité (le texte
 * grossit toujours) mais on plafonne le grossissement.
 *
 * Ce module est importé par `constants/theme` : il s'exécute donc avant le
 * premier rendu, pour `Text` et `TextInput` natifs comme pour `AppText`.
 */
export const MAX_FONT_SCALE = 1.15;

type Renderable = { render?: (props: Record<string, unknown>, ref: unknown) => unknown };

function cap(component: unknown) {
  const target = component as Renderable & { __fermiaCapped?: boolean };
  const original = target.render;
  if (typeof original !== 'function' || target.__fermiaCapped) return;
  target.render = function render(this: unknown, props, ref) {
    // Une valeur explicite posée par un écran garde la priorité.
    return original.call(this, { maxFontSizeMultiplier: MAX_FONT_SCALE, ...props }, ref);
  };
  target.__fermiaCapped = true;
}

cap(Text);
cap(TextInput);
