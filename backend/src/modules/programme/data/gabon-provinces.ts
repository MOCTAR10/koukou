import { LocaliteKind } from '../../../common/enums/localite-kind.enum.js';

/**
 * Gabon's 9 provinces (codes G1…G9) and their departments, seeded as the
 * initial territory of a programme. Facts copied from `poufa-data/provinces.json`;
 * sources and caveats in `poufa-data/SOURCES.md` (prepared 2026-11-05):
 * - G1…G9 follow ISO 3166-2:GA (GA-1…GA-9) and the usual administrative
 *   codes; no legal text (Journal officiel) fixing them was found.
 * - 48 departments (RGPL 2013, JO n° 189 of January 2014, Wikipédia FR
 *   « Départements du Gabon ») plus Libreville, a commune kept because every
 *   farm needs it as a locality. Owendo and Akanda (communes) are not listed:
 *   users add them as localities.
 * - Komo-Océan is missing from the old OCHA COD-AB: to check against the 2026
 *   COD-AB of INC Gabon.
 * - SPELLING NOT VERIFIED against the Journal officiel; variants met, the
 *   retained form first: Lemboumbi-Leyou / Lébombi-Léyou; Mpassa / Passa;
 *   Douigny / Douigni; Mulundu / Mouloundou; Ogooué et des Lacs / Ogooué et
 *   Lacs; Louetsi / Louétsi; Bouenguidi / Bouénguidi; Djouori-Agnili /
 *   Djououri-Aguilli; Douya-Onoye / Douya-Onoy; Ndzomoe / Ndzomoé;
 *   Moulengui-Binza / Binza; Guiétsou / Guietsou. Names are editable data
 *   (codes are not), so a correction is a rename, not a migration.
 * - A new administrative division has been announced, not adopted yet.
 *
 * Boundaries are NOT shipped here: the only polygons at hand carry a
 * non-commercial licence (UN SALB). They are uploaded later by an
 * administrator (PUT /programme/provinces/:code/geometry).
 */

export interface SeedLocalite {
  readonly name: string;
  readonly chefLieu: string;
  readonly kind: LocaliteKind;
}

export interface SeedProvince {
  readonly code: string;
  readonly name: string;
  readonly chefLieu: string;
  readonly localites: readonly SeedLocalite[];
}

const dep = (name: string, chefLieu: string): SeedLocalite => ({
  name,
  chefLieu,
  kind: LocaliteKind.DEPARTEMENT,
});

export const GABON_PROVINCES: readonly SeedProvince[] = [
  {
    code: 'G1',
    name: 'Estuaire',
    chefLieu: 'Libreville',
    localites: [
      dep('Komo', 'Kango'),
      dep('Komo-Mondah', 'Ntoum'),
      dep('Komo-Océan', 'Ndzomoe'),
      dep('Noya', 'Cocobeach'),
      {
        name: 'Libreville',
        chefLieu: 'Libreville',
        kind: LocaliteKind.COMMUNE,
      },
    ],
  },
  {
    code: 'G2',
    name: 'Haut-Ogooué',
    chefLieu: 'Franceville',
    localites: [
      dep('Bayi-Brikolo', 'Aboumi'),
      dep('Djoué', 'Onga'),
      dep('Djouori-Agnili', 'Bongoville'),
      dep('Lemboumbi-Leyou', 'Moanda'),
      dep('Lékabi-Léwolo', 'Ngouoni'),
      dep('Lékoko', 'Bakoumba'),
      dep('Lékoni-Lékori', 'Akiéni'),
      dep('Mpassa', 'Franceville'),
      dep('Ogooué-Létili', 'Boumango'),
      dep('Plateaux', 'Lékoni'),
      dep('Sébé-Brikolo', 'Okondja'),
    ],
  },
  {
    code: 'G3',
    name: 'Moyen-Ogooué',
    chefLieu: 'Lambaréné',
    localites: [
      dep('Abanga-Bigné', 'Ndjolé'),
      dep('Ogooué et des Lacs', 'Lambaréné'),
    ],
  },
  {
    code: 'G4',
    name: 'Ngounié',
    chefLieu: 'Mouila',
    localites: [
      dep('Boumi-Louetsi', 'Mbigou'),
      dep('Dola', 'Ndendé'),
      dep('Douya-Onoye', 'Mouila'),
      dep('Louetsi-Bibaka', 'Malinga'),
      dep('Louetsi-Wano', 'Lébamba'),
      dep('Mougalaba', 'Guiétsou'),
      dep('Ndolou', 'Mandji'),
      dep('Ogoulou', 'Mimongo'),
      dep('Tsamba-Magotsi', 'Fougamou'),
    ],
  },
  {
    code: 'G5',
    name: 'Nyanga',
    chefLieu: 'Tchibanga',
    localites: [
      dep('Basse-Banio', 'Mayumba'),
      dep('Douigny', 'Moabi'),
      dep('Doutsila', 'Mabanda'),
      dep('Haute-Banio', 'Ndindi'),
      dep('Mongo', 'Moulengui-Binza'),
      dep('Mougoutsi', 'Tchibanga'),
    ],
  },
  {
    code: 'G6',
    name: 'Ogooué-Ivindo',
    chefLieu: 'Makokou',
    localites: [
      dep('Ivindo', 'Makokou'),
      dep('Lopé', 'Booué'),
      dep('Mvoung', 'Ovan'),
      dep('Zadié', 'Mékambo'),
    ],
  },
  {
    code: 'G7',
    name: 'Ogooué-Lolo',
    chefLieu: 'Koulamoutou',
    localites: [
      dep('Lolo-Bouenguidi', 'Koulamoutou'),
      dep('Lombo-Bouenguidi', 'Pana'),
      dep('Mulundu', 'Lastoursville'),
      dep('Offoué-Onoye', 'Iboundji'),
    ],
  },
  {
    code: 'G8',
    name: 'Ogooué-Maritime',
    chefLieu: 'Port-Gentil',
    localites: [
      dep('Bendjé', 'Port-Gentil'),
      dep('Etimboué', 'Omboué'),
      dep('Ndougou', 'Gamba'),
    ],
  },
  {
    code: 'G9',
    name: 'Woleu-Ntem',
    chefLieu: 'Oyem',
    localites: [
      dep('Haut-Komo', 'Médouneu'),
      dep('Haut-Ntem', 'Minvoul'),
      dep('Ntem', 'Bitam'),
      dep('Okano', 'Mitzic'),
      dep('Woleu', 'Oyem'),
    ],
  },
];
