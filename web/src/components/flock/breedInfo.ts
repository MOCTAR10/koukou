// Breed notes shown at lot creation (same content as the mobile lot sheet).
export const BREED_INFO: Record<string, { origin: string; cycle: string; trait: string }> = {
  // POULET — chair
  'Cobb 500': { origin: 'USA', cycle: '12 semaines', trait: 'Croissance rapide, IC performant, adapté à l\'intensif' },
  'Ross 308': { origin: 'UK', cycle: '12 semaines', trait: 'Bonne conversion alimentaire, chair de qualité' },
  'Ross 708': { origin: 'UK', cycle: '12 semaines', trait: 'Broiler lourd, rendement carcasse élevé, très robuste' },
  'Hubbard': { origin: 'France', cycle: '12 semaines', trait: 'Résistant, adapté aux climats chauds, chair ferme' },
  'Arbor Acres': { origin: 'USA', cycle: '12 semaines', trait: 'Poids lourd rapide, très répandue en Afrique de l\'Ouest' },
  'Sasso T451': { origin: 'France', cycle: '10–12 semaines', trait: 'Croissance lente, rustique, idéale en climat chaud et élevage villageois' },
  'Sasso X44': { origin: 'France', cycle: '10–12 semaines', trait: 'Croissance lente, plumage coloré, très répandue en Afrique' },
  'Cobb 700': { origin: 'USA', cycle: '12 semaines', trait: 'Croissance rapide, poids lourd supérieur au Cobb 500' },
  'Kuroiler': { origin: 'Kenya / Inde', cycle: '16–20 semaines', trait: 'Poule améliorée à double objet (chair + ponte), très rustique en plein air' },
  'Kienyeji': { origin: 'Kenya', cycle: '16–24 semaines', trait: 'Poule locale africaine, robuste, élevage villageois extensif' },
  'Poulet Goliath': { origin: 'Afrique centrale', cycle: '10–12 semaines', trait: 'Croisement rustique des marchés gabonais, croissance plus lente, chair ferme' },
  'Poulet Local Gabonais': { origin: 'Gabon (5 écotypes)', cycle: '20–24 semaines', trait: 'Race locale gabonaise (Nyembwe), croissance très lente, chair ferme très prisée, maximallement rustique' },
  'Poulet Local Gabonais (pondeuse)': { origin: 'Gabon (5 écotypes)', cycle: '60 semaines de ponte', trait: 'Ponte modérée (40–60 œufs/an), excellente couveuse, rusticité maximale' },
  // POULET — pondeuse
  'ISA Brown': { origin: 'France/NL', cycle: '72 semaines', trait: 'Pondeuse industrielle, pic à 93%, robuste' },
  'Lohmann Brown': { origin: 'Allemagne', cycle: '72 semaines', trait: 'Pondeuse colorée, excellemment adaptée aux tropiques' },
  'Lohmann White': { origin: 'Allemagne', cycle: '72 semaines', trait: 'Pondeuse blanche, excellente résistance à la chaleur' },
  'Hy-Line Brown': { origin: 'USA', cycle: '72 semaines', trait: 'Bonne persistance de ponte, coquille solide' },
  'Hy-Line White': { origin: 'USA', cycle: '72 semaines', trait: 'Pondeuse blanche, ponte élevée et coquille solide' },
  'Novogen Brown': { origin: 'France/NL', cycle: '72 semaines', trait: 'Pondeuse efficiente, œufs de qualité homogène' },
  'Bovans Brown': { origin: 'Pays-Bas', cycle: '72 semaines', trait: 'Pondeuse Hendrix polyvalente, pic jusqu\'à 95%' },
  'Shaver Brown': { origin: 'Canada', cycle: '72 semaines', trait: 'Pondeuse classique robuste, pic ~93%, bonne persistance' },
  'White Leghorn': { origin: 'Italie / USA', cycle: '72 semaines', trait: 'Pondeuse blanche légendaire, ponte élevée toute l\'année' },
  'Black Australorp': { origin: 'Australie', cycle: '72 semaines', trait: 'Pondeuse noire très productive (~250 œufs/an), double objet' },
  'Hisex Brown': { origin: 'Pays-Bas / Belgique', cycle: '72 semaines', trait: 'Pondeuse brune importée au Gabon, pic ~93%, robuste en climat chaud' },
  'Hisex White': { origin: 'Pays-Bas', cycle: '72 semaines', trait: 'Pondeuse blanche efficiente, petite taille, coquilles solides' },
  'Dekalb White': { origin: 'USA', cycle: '72 semaines', trait: 'Pondeuse blanche très précoce, excellente persistance en zone chaude' },
  'Dekalb Brown': { origin: 'USA', cycle: '72 semaines', trait: 'Pondeuse brune calme, gros œufs, bonne rusticité' },
  // PINTADE
  'Pintade Galor': { origin: 'France', cycle: '11–12 semaines', trait: 'Pintade de chair productive, poids homogène, chair goûteuse' },
  'Pintade Danube': { origin: 'Europe de l\'Est / France', cycle: '12–13 semaines', trait: 'Pintade lourde (2,3–2,8 kg), excellente rusticité' },
  'Pintade Numidia': { origin: 'Afrique de l\'Ouest', cycle: '12–14 semaines', trait: 'Pintade locale casquée, excellente rusticité, élevage villageois' },
  'Pintade Pondeuse': { origin: 'Sélection française', cycle: '60 semaines de ponte', trait: 'Pondeuse d\'œufs de pintade, fertilité et coquilles solides' },
  // DINDE
  'Dinde Bronze': { origin: 'USA / Royaume-Uni', cycle: '20–24 semaines', trait: 'Dinde lourde traditionnelle, plumage brun, très charnue' },
  'Dinde Blanche': { origin: 'USA', cycle: '18–20 semaines', trait: 'Dinde standard blanche, croissance rapide, gros rendement' },
  'Dinde Broad-Breasted White': { origin: 'USA', cycle: '18–20 semaines', trait: 'Dinde blanche standard d\'élevage, poitrine large, très productive' },
  'Dinde Bourbon Red': { origin: 'USA', cycle: '20–24 semaines', trait: 'Dinde traditionnelle rousse, chair savoureuse, rustique' },
  'Dinde Pondeuse': { origin: 'Sélection européenne / USA', cycle: '60 semaines de ponte', trait: 'Reproductrices / ponte de dinde, pic vers 36–40 semaines' },
  // CAILLE
  'Caille Japonaise': { origin: 'Japon', cycle: '7–8 semaines', trait: 'Caille de chair, petite mais précoce, maturation rapide' },
  'Caille Coturnix': { origin: 'Eurasie / domestiquée', cycle: '7–8 semaines', trait: 'Caille robuste, bonne ponte et bonne chair (double objet)' },
  'Caille Pondeuse': { origin: 'Afrique / Europe', cycle: '30–40 semaines de ponte', trait: 'Ponte intensive (80%+), œufs adaptés à la consommation' },
  // CANARD
  'Canard de Barbarie': { origin: 'Amérique du Sud / France', cycle: '11–12 semaines', trait: 'Canard de chair musqué, poids élevé, faible gras, très prisé' },
  'Canard de Pékin': { origin: 'Chine / Europe', cycle: '8–10 semaines', trait: 'Croissance très rapide, excellent rendement chair, chair tendre' },
  'Canard Coureur Indien': { origin: 'Inde / Europe', cycle: '60 semaines de ponte', trait: 'Ponteuse prolifique (200 œufs/an), posture dressée, très résistant' },
  'Canard de Barbarie (pondeuse)': { origin: 'Amérique du Sud / France', cycle: '50 semaines de ponte', trait: 'Ponte modérée mais régulière, œufs riches et recherchés' },
  // OIE
  'Oie de Toulouse': { origin: 'France', cycle: '20 semaines', trait: 'Grosse oie à foie, chair abondante, prudente et rustique' },
  'Oie de Chine': { origin: 'Asie', cycle: '18 semaines', trait: 'Oie moyenne vive, polymorphe, bonne valorisation de l\'herbe' },
  'Oie de Chine (pondeuse)': { origin: 'Asie', cycle: 'saison de ponte', trait: 'Ponte saisonnière (60–80 œufs), fiable sous climat chaud' },
  // FAISAN
  'Faisan de Colchide': { origin: 'Europe / Asie', cycle: '20 semaines', trait: 'Gibier de chair, viande fine, élevage semi-extensif' },
  'Faisan Doré': { origin: 'Chine', cycle: '20 semaines', trait: 'Faisan ornemental et de chair, poids modéré, plumage éclatant' },
  'Faisan de Colchide (pondeuse)': { origin: 'Europe / Asie', cycle: '30 ± 40 semaines de ponte', trait: 'Ponte saisonnière (~40 œufs), idéale pour volière de reproduction' },
  // AUTRE (volailles locales / non catégorisées)
  'Volaille Locale (chair)': { origin: 'Locale (Gabon)', cycle: '16–24 semaines', trait: 'Poule locale rustique, croissance lente, viande ferme et prisée' },
  'Volaille Locale (pondeuse)': { origin: 'Locale (Gabon)', cycle: '60 semaines de ponte', trait: 'Poule locale pondeuse, ponte modérée mais robuste, couveuse naturelle' },
};
