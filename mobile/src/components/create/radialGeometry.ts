/**
 * Géométrie du menu radial — fonctions pures, sans rendu ni état, pour rester
 * testables et réutilisables.
 *
 * Le cercle démarre en haut (−90°) et tourne dans le sens horaire, comme un
 * cadran : l'entrée la plus fréquente (« Saisie du jour ») tombe sur midi.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  width: number;
  height: number;
}

export const NODE_SIZE = 56;
export const HUB_SIZE = 88;
/** Logo du hub : plus petit que le hub pour laisser la place au nom de la ferme. */
export const HUB_LOGO = 48;

/** Marge de sécurité entre le nœud le plus écarté et le bord de l'écran. */
const EDGE_MARGIN = 12;

/**
 * Dégagement entre le bas du nom de ferme et le nœud de minuit, au rayon
 * minimal. C'est lui qui fixe `MIN_RADIUS` : le nom occupe le vide sous le
 * logo, et ce dégagement garantit qu'il ne passe jamais sous le nœud du bas.
 */
const RING_GAP = 14;

/**
 * Hauteur réservée au nom de la ferme sous le logo (2 lignes à 11/14 + marge).
 *
 * Ce vide n'est pas du gaspillage : le nom occupe justement l'espace entre le
 * logo et le nœud de minuit, ce qui rend l'anneau plus lisible. Mais il doit
 * entrer dans le calcul du rayon, sinon le nom passerait sous ce nœud.
 */
export const HUB_NAME_H = 32;

/**
 * Rayon minimal. Il faut que l'espace sous le logo — nom de la ferme inclus —
 * reste vide jusqu'au nœud de minuit, sinon le nom le chevauche :
 *   centre→fin du nom ≈ HUB_LOGO/2 + gap + HUB_NAME_H
 *   + écart au bord interne du nœud de minuit (R − NODE/2)
 */
const MIN_RADIUS = HUB_LOGO / 2 + 4 + HUB_NAME_H + NODE_SIZE / 2 + RING_GAP;
/** Rayon maximal : au-delà, l'anneau se raréfie et le hub paraît abandonné. */
const MAX_RADIUS = 104;

/**
 * Rayon du cercle, mesuré du centre du hub.
 *
 * Il est serré autour du logo : `width·0.25` vaut ~98pt sur un iPhone 14, un
 * chouïa en dessous du plancher, donc en pratique `MIN_RADIUS` guide les
 * téléphones courants. Un ratio plus élevé (0.36, le défaut d'origine)
 * écartait les nœuds dans le tiers extérieur de l'écran.
 *
 * Trois contraintes s'appliquent, la plus petite l'emporte :
 *  - la largeur, pour garder le ratio ci-dessus ;
 *  - la hauteur, parce que l'anneau emporte un libellé sous son nœud de minuit ;
 *  - la largeur disponible, pour que le nœud de minuit tienne dans l'écran.
 *
 * `MIN_RADIUS` reste un plancher : sur un gabarit trop petit pour lui, on
 * l'atteint plutôt que d'écraser les nœuds sur le logo. C'est le seul cas où
 * l'anneau déborde, et il n'a pas de solution — voir `fitsOnScreen`.
 */
export function ringRadius(bounds: Bounds): number {
  const byWidth = bounds.width * 0.25;
  // En hauteur, l'anneau occupe `R + demi-nœud` vers le haut et `R + demi-nœud
  // + libellé` vers le bas : le bas est le côté contraignant, il contient le
  // libellé du nœud de minuit. Un écran bas (paysage) doit donc réduire le rayon.
  const byHeight = (bounds.height - labelTail(0)) / 2;
  // En largeur, le nœud le plus écarté est à `R` (midi/minuit) : il faut
  // `R + demi-nœud + marge` de chaque côté du hub.
  const byWidthFit = bounds.width / 2 - NODE_SIZE / 2 - EDGE_MARGIN;
  const raw = Math.min(byWidth, byHeight, byWidthFit);
  // `MIN_RADIUS` est un plancher de lisibilité : s'il ne rentre pas, on
  // l'atteint quand même plutôt que d'écraser les nœuds sur le logo.
  return Math.round(Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, raw)) * 100) / 100;
}

/**
 * Centre du hub.
 *
 * Il ne peut pas être simplement `width/2, height/2` : l'anneau est plus haut
 * que large (nœud du haut + nœud du bas + son libellé), donc un hub centré
 * parfaitement ferait sortir le libellé du bas. On centre le BLOC visible
 * (du bord haut du nœud supérieur au bord bas de la queue de libellé) dans
 * l'écran : le cercle reste au centre, décalé du strict minimum pour que le
 * libellé du nœud de minuit ne quitte jamais l'écran.
 */
export function hubCentre({ width, height }: Bounds, radius: number): Point {
  // Encombrement réel au-dessus et au-dessous du hub, marges comprises.
  const topExtent = radius + NODE_SIZE / 2 + EDGE_MARGIN;
  const bottomExtent = labelTail(radius) + EDGE_MARGIN;
  // Petit décalage vers le haut : l'anneau est plus « lourd » en bas (sa queue
  // de libellé), donc le hub ne peut pas être au milieu géométriquement.
  const y = (height - topExtent - bottomExtent) / 2 + topExtent;
  return { x: width / 2, y: Math.round(y * 100) / 100 };
}

/**
 * Positions des `count` nœuds, en décalages relatifs au centre du hub.
 * `count` est borné à 3…6 : en dessous, un « cercle » n'a plus de sens et le
 * rendu se dégrade en deux points opposés.
 */
export function radialPositions(count: number, radius: number): Point[] {
  const n = Math.min(6, Math.max(3, Math.round(count)));
  return Array.from({ length: n }, (_, i) => {
    const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
    return {
      x: Math.round(Math.cos(angle) * radius * 100) / 100,
      y: Math.round(Math.sin(angle) * radius * 100) / 100,
    };
  });
}

/**
 * Un libellé est toujours SOUS son nœud — pas le long du rayon. Placé
 * radialement, le libellé du nœud de midi se retrouvait au-dessus de lui : la
 * lecture suivait un arc, alors qu'elle doit suivre la gravité. Empiler sous
 * chaque nœud donne une colonne de texte stable quelle que soit la position.
 */
const LABEL_GAP = 6;
export const LABEL_H = 20;
/** Largeur nominale d'un libellé court, si le texte est plus court que ça. */
export const LABEL_MIN_W = 64;
/** Plafond : au-delà, deux libellés voisins se chevaucheraient. */
export const LABEL_MAX_W = 108;
/** Facteur de largeur moyenne par caractère pour `small` semibold (≈12pt). */
const CHAR_W = 6.4;

/**
 * Largeur d'un libellé déduite de son texte, plafonnée pour que les voisins ne
 * se touchent pas. Sans cette mesure, un libellé fixe trop étroit tronque
 * « Entrée provende » et un libellé trop large chevauche son voisin.
 */
export function labelWidth(text: string, count = 6): number {
  const w = text.length * CHAR_W + 10;
  return Math.min(labelMaxWidth(count), Math.max(LABEL_MIN_W, Math.round(w)));
}

/**
 * Largeur maximale d'un libellé pour un anneau de `count` nœuds.
 *
 * Les nœuds voisins sont séparés par `2R·sin(π/n)` horizontalement, et leurs
 * libellés sont posés en dessous, donc sur la même ligne. La largeur max est
 * cette corde. Avec 3 nœuds la place est généreuse ; à 6 elle se resserre.
 */
export function labelMaxWidth(count: number): number {
  const n = Math.min(6, Math.max(3, Math.round(count)));
  const chord = 2 * MAX_RADIUS * Math.sin(Math.PI / n);
  return Math.round(Math.min(LABEL_MAX_W, Math.max(LABEL_MIN_W, chord)));
}

/** Hauteur d'un libellé qui peut se replier sur deux lignes. */
export function labelHeight(text: string, width: number): number {
  const lines = Math.ceil((text.length * CHAR_W) / Math.max(1, width - 10));
  return lines <= 1 ? LABEL_H : lines * LABEL_H;
}

/**
 * Place le libellé SOUS son nœud, centré horizontalement, puis repoussé dans
 * l'écran. La largeur suit le texte (`labelWidth`) pour qu'il ne soit jamais
 * tronqué : c'est le prix d'un libellé toujours lisible.
 */
export function labelAnchor(
  nodeOffset: Point,
  hub: Point,
  bounds: Bounds,
  text: string,
  count = 6,
): { left: number; top: number; width: number; height: number } {
  const width = labelWidth(text, count);
  const height = labelHeight(text, width);

  const nodeCentreX = hub.x + nodeOffset.x;
  const nodeCentreY = hub.y + nodeOffset.y;

  const half = width / 2;
  const cx = Math.min(
    Math.max(EDGE_MARGIN + half, nodeCentreX),
    Math.max(EDGE_MARGIN + half, bounds.width - EDGE_MARGIN - half),
  );
  const top = nodeCentreY + NODE_SIZE / 2 + LABEL_GAP;

  return { left: cx - half, top, width, height };
}

/** Hauteur totale occupée sous le nœud le plus bas, libellé compris. */
export function labelTail(radius: number, labelH = LABEL_H): number {
  return radius + NODE_SIZE / 2 + LABEL_GAP + labelH;
}

/**
 * Deux libellés voisins sont-ils en collision ?
 *
 * Contrôle indispensable depuis que le libellé est placé SOUS chaque nœud : à 6
 * nœuds, les nœuds de 3 h et 9 h sont côte à côte horizontalement, et leurs
 * libellés — posés en dessous, donc côte à côte aussi — se chevauchent. Sur un
 * grand écran c'est immédiat, sur un petit téléphone ça passe juste, d'où le
 * besoin de vérifier plutôt que de supposer.
 */
export function labelsCollide(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

/** Périmètre du cercle de guidage (carré de côté `2R`). */
export function guideCircleSize(radius: number): number {
  return Math.round(radius * 2);
}

/**
 * Un `count` donné tient-il dans l'écran ? Garde-fou : au-delà de 6 nœuds les
 * libellés se chevauchent, la pastille devient inutilisable.
 */
export function isSupportedCount(count: number): boolean {
  return count >= 3 && count <= 6;
}

export interface RadialLayout {
  radius: number;
  hub: Point;
  slots: Point[];
}

/**
 * Résout toute la mise en page d'un coup. Le composant ne calcule plus rien
 * lui-même : une seule source de vérité, donc aucune chance que le rayon, le
 * centre et les positions divergent.
 */
export function layout(count: number, bounds: Bounds): RadialLayout {
  const radius = ringRadius(bounds);
  return {
    radius,
    hub: hubCentre(bounds, radius),
    slots: radialPositions(count, radius),
  };
}

/**
 * Le gabarit est-il assez grand pour un anneau complet ?
 *
 * Sur un écran très bas (paysage sur téléphone : 320pt de haut), l'anneau et
 * son libellé ne rentrent pas, et aucun rayon ne peut sauver la mise en page
 * sans écraser les nœuds sur le logo. Mieux vaut le dire et avoir un repli
 * propre que rendre un menu tronqué au hasard.
 */
export function fitsOnScreen(bounds: Bounds): boolean {
  const needed = labelTail(MIN_RADIUS) * 2 + EDGE_MARGIN * 2;
  const wideEnough = MIN_RADIUS + NODE_SIZE / 2 + EDGE_MARGIN <= bounds.width / 2;
  return bounds.height >= needed && wideEnough;
}