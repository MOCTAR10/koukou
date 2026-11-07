import chaptersJson from './data/chapters.json';
import mappingJson from './data/cdc-mapping.json';
import requirementsJson from './data/requirements.json';
import summaryJson from './data/cdc-summary.json';
import faqJson from './data/faq.json';
import extraFiguresJson from './data/extra-figures.json';
import type { Block, CdcRef, Chapter, Figure, Requirement, RouteMapping, Summary } from './types';

const EXTRA = extraFiguresJson as unknown as Array<{ chapter: string; fig: Figure }>;
/** The 68 screenshots, grouped in chapters (the 8 detail screens are appended to their chapter). */
export const CHAPTERS: Chapter[] = (chaptersJson as unknown as Chapter[]).map((c) => ({
  ...c,
  figs: [...c.figs, ...EXTRA.filter((e) => e.chapter === c.id).map((e) => e.fig)],
}));
export const SCREEN_COUNT = CHAPTERS.reduce((n, c) => n + c.figs.length, 0);
export const MAPPING = mappingJson as unknown as RouteMapping[];
export const REQUIREMENTS = requirementsJson as unknown as Requirement[];
export const SUMMARY = summaryJson as unknown as Summary;
export const FAQ = faqJson as Array<{ q: string; a: string }>;

export const AUDIT_LABEL = 'Audit v6 (2026-11-07)';
export const PLATFORM_URL = 'https://fermia.greenleaves.ga';
export const APK_URL = `${PLATFORM_URL}/apk/fermia.apk`;
export const API_DOCS_URL = '/api/docs/';
export const PDF_URL = '/guide/POUFA-presentation-jury.pdf';

export const STATUS_LABEL: Record<string, string> = { '✅': 'Couvert', '🟡': 'Partiel léger', '🟠': 'Partiel', '🔎': 'À tester', '❌': 'Non couvert' };
export const STATUS_TONE: Record<string, string> = {
  '✅': 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  '🟡': 'bg-amber-50 text-amber-800 ring-amber-200',
  '🟠': 'bg-amber-50 text-amber-800 ring-amber-200',
  '🔎': 'bg-sky-50 text-sky-800 ring-sky-200',
  '❌': 'bg-red-50 text-red-800 ring-red-200',
};
export const PRIORITIES = ['Obligatoire MVP', 'Phase ultérieure', 'À arbitrer', 'Évolutive'] as const;
export const PARTS = ['Prise en main', 'Programme', 'Modules bonus'] as const;

const byRoute = new Map(MAPPING.map((e) => [e.route, e]));

/** CDC requirements reported under a chapter (deduplicated), plus the notes and bonus lines of its screens. */
export function cdcFor(chapter: Chapter): { rows: CdcRef[]; notes: string[]; bonus: string[] } {
  const entries = chapter.keys.map((k) => byRoute.get(k)).filter((e): e is RouteMapping => Boolean(e));
  const seen = new Set<string>();
  const rows: CdcRef[] = [];
  for (const e of entries) {
    for (const x of e.cdc) {
      if (!seen.has(x.num)) {
        seen.add(x.num);
        rows.push(x);
      }
    }
  }
  return {
    rows,
    notes: entries.map((e) => e.aSavoir).filter((n): n is string => Boolean(n)),
    bonus: [...new Set(entries.flatMap((e) => e.bonus ?? []))],
  };
}

/** Chapters (id, title) that report a CDC requirement number. */
export const CHAPTERS_BY_NUM: Map<string, Array<{ id: string; t: string }>> = (() => {
  const map = new Map<string, Array<{ id: string; t: string }>>();
  for (const c of CHAPTERS) {
    for (const r of cdcFor(c).rows) {
      const list = map.get(r.num) ?? [];
      list.push({ id: c.id, t: c.t });
      map.set(r.num, list);
    }
  }
  return map;
})();

/** Blocks shown before / after the frame of a chapter. */
export const CHAPTER_BLOCKS: Record<string, { before?: Block[]; after?: Block[] }> = {
  role: {
    before: [
      {
        kind: 'lead',
        text: 'Trois grandes familles de comptes se partagent la plateforme. Les droits ne sont pas figés dans le code : ils vivent dans une matrice que l’administrateur règle (voir « Accès institutionnels »).',
      },
      {
        kind: 'table',
        head: ['Famille', 'Exemples', 'Ce qu’ils voient'],
        rows: [
          ['Administration', 'Administrateur plateforme, administrateur du programme', 'Tout le programme : registre, accès, paramètres, audit, reprise.'],
          ['Institutions', 'DGE, services vétérinaires, MAEDR, ANINF, BCEG, agents techniques', 'Selon leur profil et leur périmètre (toutes les fermes, une province, quelques fermes, ou des chiffres agrégés seulement).'],
          ['Exploitants', 'Propriétaire, éleveur de terrain', 'Leur ferme : suivi des bandes, stock, ventes, caisse, Marché, comptabilité.'],
        ],
      },
      {
        kind: 'callout',
        title: 'À savoir',
        text: ['Si une entrée de menu manque à un collègue, la cause est presque toujours son profil, pas un défaut de l’application. Toute consultation sensible est inscrite au journal d’audit.'],
      },
    ],
  },
  'b-compta': {
    before: [
      {
        kind: 'callout',
        title: 'En clair, pour un non-comptable',
        text: [
          'Comptabilité « en partie double » : chaque opération est notée deux fois, d’où elle vient et où elle va. Vendre un poulet : l’argent entre (caisse, compte 571 ou banque 52) et un produit s’enregistre (ventes de poulets vifs, compte 7011). Acheter de l’aliment : une charge (classe 6) et une dette envers le fournisseur (compte 401). Total des débits = total des crédits : c’est le contrôle de la balance.',
        ],
      },
      {
        kind: 'table',
        head: ['Classe', 'Contenu', 'Exemple dans Fermia'],
        rows: [
          ['1', 'Capitaux', '108 apports et prélèvements de l’exploitant ; 129 / 12 résultat reporté'],
          ['2', 'Immobilisations', 'Bâtiments, matériel'],
          ['3', 'Stocks', '311 provende et aliments valorisés'],
          ['4', 'Tiers', '401 fournisseurs, 411 clients'],
          ['5', 'Trésorerie', '571 caisse espèces, 52 banque et autres moyens'],
          ['6', 'Charges', '6010 achats de volailles, 6011 aliments'],
          ['7', 'Produits', '7011 poulets vifs ou abattus, 7012 œufs'],
        ],
      },
      {
        kind: 'p',
        text: 'Le plan contient environ 93 comptes. Les écritures se posent seules : ventes de poulets vifs ou abattus en 7011, œufs en 7012, encaissement en espèces en 571, autres moyens en 52, dépenses dans la classe 6 selon leur catégorie, intrants en classe 3 ou 6.',
      },
    ],
    after: [
      {
        kind: 'callout',
        tone: 'warn',
        title: 'Ce que fait l’application, et ce qu’elle ne fait pas',
        text: [
          'Le grand livre (détail compte par compte) a son onglet, avec export PDF et CSV. Les exercices se clôturent après la date de fin : stock final, résultat reporté puis ouverture de l’exercice suivant.',
          'Dans le CDC, la dimension économique est classée « phase ultérieure » : cette comptabilité va donc au-delà du MVP. Elle reste facultative pour l’exploitant.',
        ],
      },
    ],
  },
};

export interface Actor {
  name: string;
  role: string;
  chapters: string[];
}

/** Which chapters matter to which actor of the CDC (§3), for the guided routes. */
export const ACTORS: Actor[] = [
  { name: 'Éleveur', role: 'Exploite la ferme : saisies du jour, lots, stock, ventes.', chapters: ['b-dashboard', 'b-lots', 'b-activites', 'b-sanitaire', 'b-stock', 'b-livraisons', 'b-ventes', 'b-caisse', 'b-marche', 'aide'] },
  { name: 'Agent technique', role: 'Accompagne les fermes sur le terrain, relève le GPS.', chapters: ['registre', 'pilotage', 'tracabilite', 'intrants'] },
  { name: 'POUFA / DGE', role: 'Pilote le programme et suit les fermes.', chapters: ['pilotage', 'registre', 'economie', 'intrants', 'parametres', 'reprise'] },
  { name: 'Vétérinaire', role: 'Reçoit les déclarations, qualifie et publie les alertes.', chapters: ['surveillance', 'notifications', 'tracabilite'] },
  { name: 'BCEG (banque)', role: 'Lit les chiffres des fermes financées, avec consentement.', chapters: ['acces', 'economie'] },
  { name: 'MAEDR', role: 'Consulte les chiffres agrégés du programme.', chapters: ['pilotage', 'economie', 'tracabilite'] },
  { name: 'Abattoir', role: 'Reçoit les lots et enregistre l’abattage.', chapters: ['b-abattage', 'tracabilite'] },
  { name: 'Consommateur', role: 'Scanne le QR d’un lot et lit son origine ; achète sur le Marché.', chapters: ['b-marche-public', 'tracabilite'] },
  { name: 'ANINF', role: 'Contrôle l’hébergement, le journal et les accès.', chapters: ['audit', 'acces', 'platform'] },
  { name: 'Administrateur', role: 'Crée les comptes, règle les droits et les paramètres.', chapters: ['registre', 'acces', 'parametres', 'audit', 'reprise', 'platform'] },
];

export interface CdcSection {
  id: string;
  title: string;
  from: number;
  to: number;
  blurb: string;
}

/** CDC chapters, by requirement number (numbers 53 to 68 are the traceability lines T1 to T16). */
export const CDC_SECTIONS: CdcSection[] = [
  { id: '5.1', title: 'Suivi technique et zootechnique', from: 1, to: 20, blurb: 'Fiche de la ferme, bandes, pesées, indicateurs, intrants.' },
  { id: '5.2', title: 'Suivi sanitaire et biosécurité', from: 21, to: 28, blurb: 'Déclarations, vaccins, traitements, alertes.' },
  { id: '5.3', title: 'Suivi économique et commercial', from: 29, to: 35, blurb: 'Ventes, coûts, marge, abattage.' },
  { id: '5.4', title: 'Pilotage et aide à la décision', from: 36, to: 48, blurb: 'Tableaux de bord, carte, rapports, droits, audit, reprise des données.' },
  { id: '5.5', title: 'Services complémentaires', from: 49, to: 52, blurb: 'Prix, assistance vétérinaire, mise en relation, formation.' },
  { id: '6', title: 'Traçabilité', from: 53, to: 68, blurb: 'Lot, QR, historique d’élevage, abattoir, distributeur.' },
];

/** Why a requirement has no screen in this guide. */
export function noScreenReason(statut: string, num: number): string {
  if (statut === '❌') return 'Pas encore livré';
  if (num === 44) return 'Application mobile Android';
  return 'Traitement ou donnée sans écran dédié';
}
