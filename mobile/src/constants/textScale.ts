/**
 * Plafond global de la taille de police système.
 *
 * Android et iOS agrandissent tout le texte selon le réglage « taille de
 * police » du téléphone (x1,3 ou plus sur le terrain). Les cartes et tuiles,
 * dimensionnées pour 1,0, débordaient alors. On garde l'accessibilité (le
 * texte grossit toujours) mais on plafonne le grossissement.
 *
 * Appliqué par `AppText` et `AppTextInput` ; un test (`textScale.test.ts`)
 * interdit d'importer `Text` / `TextInput` bruts depuis react-native.
 */
export const MAX_FONT_SCALE = 1.15;
