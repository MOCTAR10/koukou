import { describe, expect, it } from 'vitest';

import {
  HUB_LOGO,
  HUB_NAME_H,
  HUB_SIZE,
  LABEL_H,
  LABEL_MAX_W,
  NODE_SIZE,
  fitsOnScreen,
  guideCircleSize,
  isSupportedCount,
  labelAnchor,
  labelHeight,
  labelMaxWidth,
  labelTail,
  labelWidth,
  layout,
} from './radialGeometry';

/** Gabarits réellement rencontrés : petits mobiles, mobiles, grandes phones, tablette, paysage. */
const SCREENS = [
  { name: 'SE 1re gen (petit)', width: 320, height: 568 },
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 12 mini', width: 375, height: 812 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone 14 Pro Max', width: 430, height: 932 },
  { name: 'Pixel 7', width: 412, height: 915 },
  { name: 'Android large', width: 480, height: 1040 },
  { name: 'tablette portrait', width: 768, height: 1024 },
  { name: 'tablette paysage', width: 1024, height: 768 },
  /**
   * Paysage sur téléphone : trop bas pour un anneau complet. Gardé
   * volontairement dans la liste pour vérifier que `fitsOnScreen` le signale
   * au lieu de laisser un menu tronqué.
   */
  { name: 'paysage étroit', width: 568, height: 320 },
];

const COUNTS = [3, 4, 5, 6];
/** Libellés réels du menu : le plus long doit rester entier. */
const TEXTS = ['Saisie', 'Lot', 'Provende', 'Soin', 'Bâtiment', 'Encaisser'];
const EDGE = 12;

const overlaps = (
  a: { l: number; t: number; r: number; b: number },
  b: { l: number; t: number; r: number; b: number },
) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

describe('layout — rien ne sort de l’écran', () => {
  for (const s of SCREENS) {
    // Le paysage étroit ne peut pas contenir un anneau complet : c'est un
    // gabarit signalé, pas une régression à faire passer sous silence.
    const supported = fitsOnScreen({ width: s.width, height: s.height });

    for (const n of COUNTS) {
      if (!supported) continue;

      it(`${s.name} ${s.width}×${s.height}, ${n} nœuds`, () => {
        const { hub, slots } = layout(n, { width: s.width, height: s.height });

        // Nœuds dans l'écran.
        for (const p of slots) {
          const cx = hub.x + p.x;
          const cy = hub.y + p.y;
          expect(cx - NODE_SIZE / 2).toBeGreaterThanOrEqual(EDGE);
          expect(cx + NODE_SIZE / 2).toBeLessThanOrEqual(s.width - EDGE);
          expect(cy - NODE_SIZE / 2).toBeGreaterThanOrEqual(EDGE);
          expect(cy + NODE_SIZE / 2).toBeLessThanOrEqual(s.height - EDGE);
        }

        // Libellés dans l'écran, entiers, et jamais deux en collision.
        // On n'évalue que les `n` premiers libellés : un anneau à 3 nœuds
        // n'affiche que 3 libellés, pas 6.
        const boxes = TEXTS.slice(0, n).map((text, i) => {
          const a = labelAnchor(slots[i], hub, { width: s.width, height: s.height }, text, n);
          return { text, l: a.left, t: a.top, r: a.left + a.width, b: a.top + a.height };
        });

        for (const box of boxes) {
          expect(box.l).toBeGreaterThanOrEqual(EDGE);
          expect(box.r).toBeLessThanOrEqual(s.width - EDGE);
          expect(box.t).toBeGreaterThanOrEqual(EDGE);
          expect(box.b).toBeLessThanOrEqual(s.height - EDGE);
          // La boîte est dimensionnée au texte : il ne peut pas être tronqué.
          expect(box.r - box.l).toBeLessThanOrEqual(LABEL_MAX_W);
        }

        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(overlaps(boxes[i], boxes[j])).toBe(false);
          }
        }
      });
    }
  }
});

describe('layout — le nom de la ferme reste lisible', () => {
  for (const s of SCREENS) {
    if (!fitsOnScreen({ width: s.width, height: s.height })) continue;

    it(`${s.name} : le nom ne passe pas sous le nœud de minuit`, () => {
      const { radius, hub } = layout(6, { width: s.width, height: s.height });

      // Bas du bloc logo + nom.
      const nameBottom = hub.y + HUB_LOGO / 2 + 4 + HUB_NAME_H;
      // Bord interne du nœud le plus bas (6 nœuds ⇒ un nœud à minuit).
      const lowestNodeTop = hub.y + radius - NODE_SIZE / 2;

      expect(nameBottom).toBeLessThanOrEqual(lowestNodeTop);

      // Le nom reste dans l'écran.
      expect(nameBottom).toBeLessThanOrEqual(s.height - EDGE);
      // Et le logo ne sort pas par le haut.
      expect(hub.y - HUB_LOGO / 2).toBeGreaterThanOrEqual(EDGE);
    });
  }
});

const SUPPORTED = SCREENS.filter((s) => fitsOnScreen({ width: s.width, height: s.height }));

describe('layout — invariants géométriques', () => {
  it('aucun nœud ne chevauche le logo', () => {
    for (const s of SUPPORTED) {
      const { radius } = layout(6, { width: s.width, height: s.height });
      expect(radius - NODE_SIZE / 2).toBeGreaterThan(HUB_LOGO / 2);
    }
  });

  it('les nœuds restent autour du logo, ni collés ni dispersés', () => {
    for (const s of SUPPORTED) {
      const { radius } = layout(6, { width: s.width, height: s.height });
      const gap = radius - HUB_LOGO / 2 - NODE_SIZE / 2;
      // Serré autour du logo, mais pas au raz du logo ni projeté à l'autre bout.
      expect(gap).toBeGreaterThan(30);
      expect(gap).toBeLessThan(90);
    }
  });

  it('signale les gabarits trop petits plutôt que de tronquer', () => {
    // Paysage sur téléphone : pas de place pour un anneau complet.
    expect(fitsOnScreen({ width: 568, height: 320 })).toBe(false);
    // Un petit portrait passe.
    expect(fitsOnScreen({ width: 320, height: 568 })).toBe(true);
    expect(fitsOnScreen({ width: 390, height: 844 })).toBe(true);
  });

  it('centre le bloc sur l’écran (le cercle visuel reste au milieu)', () => {
    const s = { width: 390, height: 844 };
    const { hub, radius } = layout(6, s);
    // Le bloc visible va du bord haut du nœud supérieur au bord bas de la
    // queue de libellé, marges comprises.
    const top = hub.y - (radius + NODE_SIZE / 2 + EDGE);
    const bottom = hub.y + labelTail(radius) + EDGE;
    // Le hub n'est pas exactement au milieu — la queue de libellé « pèse » en
    // bas — mais le bloc entier l'est, donc l'anneau paraît centré.
    expect(hub.y).toBeLessThan(s.height / 2);
    expect((top + bottom) / 2).toBeCloseTo(s.height / 2, 1);
    // La queue de libellé ne sort toujours pas par le bas.
    expect(hub.y + labelTail(radius)).toBeLessThanOrEqual(s.height - EDGE);
  });

  it('agrandit l’écran → agrandit l’anneau, sans jamais le disperser', () => {
    const small = layout(6, { width: 320, height: 568 });
    const big = layout(6, { width: 430, height: 932 });
    expect(big.radius).toBeGreaterThanOrEqual(small.radius);
    expect(big.radius).toBeLessThanOrEqual(104);
  });
});

describe('labelWidth — le texte n’est jamais tronqué', () => {
  it('couvre le libellé réel le plus long', () => {
    // « Bâtiment » et « Encaisser » sont les plus longs du menu.
    expect(labelWidth('Bâtiment')).toBeGreaterThanOrEqual(8 * 6.4);
    expect(labelWidth('Encaisser')).toBeGreaterThanOrEqual(8 * 6.4);
  });

  it('plafonne selon l’effectif, pour que deux voisins ne se touchent pas', () => {
    const long = 'Un libellé absurdement long qui ne rentrera jamais';
    // À 6 nœuds la corde du cercle limite la largeur ; à 3 nœuds la place est
    // généreuse et c'est le plafond absolu qui s'applique.
    expect(labelWidth(long, 6)).toBe(labelMaxWidth(6));
    expect(labelMaxWidth(6)).toBeLessThan(labelMaxWidth(3));
    expect(labelMaxWidth(3)).toBe(LABEL_MAX_W);
  });

  it('ne descend pas sous une largeur lisible', () => {
    expect(labelWidth('Lot')).toBeGreaterThanOrEqual(64);
  });

  it('mesure la hauteur sur le nombre de lignes', () => {
    expect(labelHeight('Soin', labelWidth('Soin'))).toBe(LABEL_H);
  });
});

describe('labelAnchor — placement sous le nœud', () => {
  const s = { width: 390, height: 844 };
  const { hub, slots } = layout(6, s);

  it('place toujours le libellé SOUS son nœud', () => {
    for (const p of slots) {
      const a = labelAnchor(p, hub, s, 'Provende');
      const nodeBottom = hub.y + p.y + NODE_SIZE / 2;
      expect(a.top).toBeGreaterThan(nodeBottom);
      expect(a.top - nodeBottom).toBeLessThan(20);
    }
  });

  it('centre le libellé sur son nœud quand la place le permet', () => {
    // Nœud de midi : assez de place, donc pas de clamp horizontal.
    const a = labelAnchor(slots[0], hub, s, 'Saisie');
    const centre = a.left + a.width / 2;
    expect(centre).toBeCloseTo(hub.x + slots[0].x, 0);
  });

  it('repousse vers l’intérieur un libellé qui dépasserait à droite', () => {
    const a = labelAnchor({ x: 200, y: 0 }, hub, s, 'Encaisser');
    expect(a.left + a.width).toBeLessThanOrEqual(s.width - EDGE);
  });
});

describe('misc', () => {
  it('dimensionne le cercle de guidage', () => {
    expect(guideCircleSize(90)).toBe(180);
  });

  it('valide les effectifs de nœuds', () => {
    expect(isSupportedCount(3)).toBe(true);
    expect(isSupportedCount(6)).toBe(true);
    expect(isSupportedCount(7)).toBe(false);
  });

  it('expose des tailles cohérentes', () => {
    expect(HUB_LOGO).toBeLessThan(HUB_SIZE);
    expect(HUB_SIZE).toBeGreaterThan(NODE_SIZE);
  });
});