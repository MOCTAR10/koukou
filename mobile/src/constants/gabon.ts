/** Provinces du Gabon — le pays (unique pour l'instant) pris en charge. */
export interface GabonProvince {
  name: string;
  capital: string;
}

export const GABON_PROVINCES: GabonProvince[] = [
  { name: 'Estuaire', capital: 'Libreville' },
  { name: 'Haut-Ogooué', capital: 'Franceville' },
  { name: 'Moyen-Ogooué', capital: 'Lambaréné' },
  { name: 'Ngounié', capital: 'Mouila' },
  { name: 'Nyanga', capital: 'Tchibanga' },
  { name: 'Ogooué-Ivindo', capital: 'Makokou' },
  { name: 'Ogooué-Lolo', capital: 'Koulamoutou' },
  { name: 'Ogooué-Maritime', capital: 'Port-Gentil' },
  { name: 'Woleu-Ntem', capital: 'Oyem' },
];

export const GABON_PROVINCE_NAMES = GABON_PROVINCES.map((p) => p.name);

export function isGabonProvince(value: string | null | undefined): boolean {
  return value != null && GABON_PROVINCE_NAMES.includes(value);
}