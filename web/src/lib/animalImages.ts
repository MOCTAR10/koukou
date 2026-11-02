// Photos shared with the mobile app, resized for the web (web/public/animals).
// Keys are the exact server names: a breed without a photo falls back on its species.

export const BREED_IMAGES: Record<string, string> = {
  'Cobb 500': '/animals/breed-cobb-500.webp',
  'Cobb 700': '/animals/breed-cobb-700.webp',
  'Ross 308': '/animals/breed-ross-308.webp',
  'Ross 708': '/animals/breed-ross-708.webp',
  'Hubbard': '/animals/breed-hubbard.webp',
  'Arbor Acres': '/animals/breed-arbor-acres.webp',
  'Sasso T451': '/animals/breed-sasso-t451.webp',
  'Sasso X44': '/animals/breed-sasso-x44.webp',
  'Kuroiler': '/animals/breed-kuroiler.webp',
  'Kienyeji': '/animals/breed-kienyeji.webp',
  'Poulet Goliath': '/animals/breed-poulet-goliath.webp',
  'ISA Brown': '/animals/breed-isa-brown.webp',
  'Lohmann Brown': '/animals/breed-lohmann-brown.webp',
  'Lohmann White': '/animals/breed-lohmann-white.webp',
  'Hy-Line Brown': '/animals/breed-hy-line-brown.webp',
  'Hy-Line White': '/animals/breed-hy-line-white.webp',
  'Novogen Brown': '/animals/breed-novogen-brown.webp',
  'Bovans Brown': '/animals/breed-bovans-brown.webp',
  'Shaver Brown': '/animals/breed-shaver-brown.webp',
  'White Leghorn': '/animals/breed-white-leghorn.webp',
  'Black Australorp': '/animals/breed-black-australorp.webp',
  'Hisex White': '/animals/breed-hisex-white.webp',
  'Dekalb White': '/animals/breed-dekalb-white.webp',
  'Dekalb Brown': '/animals/breed-dekalb-brown.webp',
  'Pintade Galor': '/animals/breed-pintade-galor.webp',
  'Pintade Danube': '/animals/breed-pintade-danube.webp',
  'Pintade Numidia': '/animals/breed-pintade-numidia.webp',
  'Pintade Pondeuse': '/animals/breed-pintade-pondeuse.webp',
  'Dinde Bronze': '/animals/breed-dinde-bronze.webp',
  'Dinde Blanche': '/animals/breed-dinde-blanche.webp',
  'Dinde Broad-Breasted White': '/animals/breed-dinde-broad-breasted-white.webp',
  'Dinde Bourbon Red': '/animals/breed-dinde-bourbon-red.webp',
  'Dinde Pondeuse': '/animals/breed-dinde-pondeuse.webp',
  'Caille Japonaise': '/animals/breed-caille-japonaise.webp',
  'Canard de Barbarie': '/animals/breed-canard-de-barbarie.webp',
  'Canard de Barbarie (pondeuse)': '/animals/breed-canard-de-barbarie-pondeuse.webp',
  'Canard de Pékin': '/animals/breed-canard-de-pekin.webp',
  'Canard Coureur Indien': '/animals/breed-canard-coureur-indien.webp',
  'Oie de Toulouse': '/animals/breed-oie-de-toulouse.webp',
  'Oie de Chine': '/animals/breed-oie-de-chine.webp',
  'Oie de Chine (pondeuse)': '/animals/breed-oie-de-chine-pondeuse.webp',
  'Faisan de Colchide': '/animals/breed-faisan-de-colchide.webp',
  'Faisan Doré': '/animals/breed-faisan-dore.webp',
};

export const SPECIES_IMAGES: Record<string, string> = {
  'POULET': '/animals/species-poulet.webp',
  'PINTADE': '/animals/species-pintade.webp',
  'DINDE': '/animals/species-dinde.webp',
  'CAILLE': '/animals/species-caille.webp',
  'CANARD': '/animals/species-canard.webp',
  'OIE': '/animals/species-oie.webp',
  'FAISAN': '/animals/species-faisan.webp',
  'AUTRE': '/animals/species-autre.webp',
};

export const EGG_IMAGES = {
  'alveole': '/animals/egg-alveole.webp',
  'oeuf': '/animals/egg-oeuf.webp',
} as const;

/** Photo of a lot: its breed first, then its species, otherwise null. */
export function lotImage(breedName?: string | null, species?: string | null): string | null {
  const breed = breedName?.trim() ? BREED_IMAGES[breedName.trim()] : undefined;
  return breed ?? (species ? SPECIES_IMAGES[species] : undefined) ?? null;
}
