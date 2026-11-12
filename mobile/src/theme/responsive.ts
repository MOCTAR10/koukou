/**
 * Fondation « responsive » : fonctions pures (testées) que le hook `useScreen`
 * et les composants partagés combinent. Aucune dépendance à React Native ici.
 */

export type WidthClass = 'compact' | 'regular' | 'large' | 'tablet';

/** Largeur de référence de la maquette (dp). */
export const REFERENCE_WIDTH = 390;
/** Plafond du grossissement de police (voir `constants/textScale`). */
export const FONT_SCALE_CAP = 1.15;
/** Sous cette hauteur (dp), l'écran est « court » : marges et bandeaux réduits. */
export const SHORT_HEIGHT = 700;
/** Largeur maximale du contenu, centré, sur tablette / paysage. */
export const CONTENT_MAX_WIDTH = 720;

export function widthClassFor(width: number): WidthClass {
  if (width < 360) return 'compact';
  if (width < 412) return 'regular';
  if (width < 600) return 'large';
  return 'tablet';
}

/**
 * Facteur d'échelle borné, relatif à 390 dp : un petit téléphone descend d'un
 * cran (≥ 0,88), un grand monte légèrement (≤ 1,12), jamais plus : rien ne
 * gonfle ni ne devient illisible. Au-delà de 600 dp (tablette) on reste à 1.
 */
export function boundedScale(width: number, min = 0.88, max = 1.12): number {
  if (width >= 600) return 1;
  const raw = width / REFERENCE_WIDTH;
  return Math.min(max, Math.max(min, raw));
}

/** Taille (police, espacement) mise à l'échelle et arrondie. */
export function scaled(size: number, width: number): number {
  return Math.round(size * boundedScale(width));
}

/**
 * Colonnes d'une grille : autant que possible sans descendre sous
 * `minTileWidth`, au moins 1. `tileWidth` est la largeur réelle d'une tuile.
 */
export function gridColumns(
  available: number,
  minTileWidth: number,
  gap = 8,
  maxColumns = 6,
): { columns: number; tileWidth: number } {
  const usable = Math.max(0, available);
  const fit = Math.floor((usable + gap) / (minTileWidth + gap));
  const columns = Math.min(maxColumns, Math.max(1, fit));
  const tileWidth = Math.floor((usable - gap * (columns - 1)) / columns);
  return { columns, tileWidth };
}

export interface ScreenInfo {
  width: number;
  height: number;
  widthClass: WidthClass;
  isCompact: boolean;
  isTablet: boolean;
  isShort: boolean;
  fontScale: number;
  /** Échelle appliquée aux tailles de texte. */
  typeScale: number;
  /** Marge horizontale des écrans. */
  gutter: number;
  /** Largeur utile du contenu (bornée sur tablette). */
  contentWidth: number;
}

export function describeScreen(width: number, height: number, systemFontScale = 1): ScreenInfo {
  const widthClass = widthClassFor(width);
  const isCompact = widthClass === 'compact';
  const isTablet = widthClass === 'tablet';
  const gutter = isCompact ? 12 : isTablet ? 24 : 16;
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);
  return {
    width,
    height,
    widthClass,
    isCompact,
    isTablet,
    isShort: height < SHORT_HEIGHT,
    fontScale: Math.min(systemFontScale, FONT_SCALE_CAP),
    typeScale: boundedScale(width),
    gutter,
    contentWidth,
  };
}
