/**
 * Legal references of the financer workspace and the mandatory clauses of
 * the consent (constants in code, shown to the bank). Texts marked
 * `verified: false` are cited from secondary sources: to be confirmed by the
 * bank's legal department before being relied on.
 */

export interface LegalBasisRow {
  code: string;
  title: string;
  reference: string;
  articles: string | null;
  use: string;
  url: string | null;
  verified: boolean;
}

const LOI_DONNEES = 'Loi n° 001/2011 du 25 septembre 2011 modifiée par la loi n° 025/2023 (JO n° 218 bis du 15 juillet 2023)';

export const LEGAL_BASIS: readonly LegalBasisRow[] = [
  {
    code: 'LOI_001_2011',
    title: 'Protection des données à caractère personnel',
    reference: LOI_DONNEES,
    articles: 'art. 6, 70-73, 100, 43, 53, 60-61',
    use: 'Fonde le consentement de l’exploitant au partage de ses données avec la banque, l’information préalable, le droit de retrait à tout moment et les droits d’accès, de rectification, d’opposition et d’effacement.',
    url: null,
    verified: true,
  },
  {
    code: 'COBAC_R_2018_01',
    title: 'Classification des créances et provisionnement',
    reference: 'Règlement COBAC R-2018/01 du 16 janvier 2018',
    articles: 'art. 4-11, 12-14',
    use: 'Définit les classes de créances (saines, sensibles, impayées, douteuses, irrécouvrables) et le seuil de 90 jours d’impayé qui fait passer une créance de impayée à douteuse.',
    url: null,
    verified: true,
  },
  {
    code: 'AUS_OHADA_2010',
    title: 'Sûretés',
    reference: 'Acte uniforme OHADA portant organisation des sûretés du 15 décembre 2010',
    articles: 'art. 13-14, 92-96, 118-124',
    use: 'Encadre le cautionnement, le gage de matériel et le gage de stocks pris en garantie du financement.',
    url: null,
    verified: true,
  },
  {
    code: 'COBAC_R_2023_01',
    title: 'Conservation des pièces du dossier client',
    reference: 'Règlement COBAC R-2023/01 du 19 décembre 2023',
    articles: null,
    use: 'Conservation pendant dix ans des pièces du dossier client, dont la pièce d’identité du promoteur.',
    url: null,
    verified: false,
  },
  {
    code: 'LOI_025_2021',
    title: 'Transactions électroniques',
    reference: 'Loi n° 025/2021 sur les transactions électroniques',
    articles: null,
    use: 'Valeur juridique de l’écrit et de la signature électroniques, utile au consentement donné en ligne et aux pièces numérisées.',
    url: null,
    verified: false,
  },
  {
    code: 'AUDCIF_2017',
    title: 'Droit comptable et information financière',
    reference: 'Acte uniforme OHADA relatif au droit comptable et à l’information financière du 26 janvier 2017',
    articles: null,
    use: 'Cadre des états financiers des petites entités, demandés à l’instruction du dossier.',
    url: null,
    verified: false,
  },
  {
    code: 'AUSCOOP_2010',
    title: 'Sociétés coopératives',
    reference: 'Acte uniforme relatif au droit des sociétés coopératives du 15 décembre 2010',
    articles: null,
    use: 'Statuts et pouvoirs du signataire lorsque l’exploitation est une coopérative.',
    url: null,
    verified: false,
  },
];

export interface ConsentClauseDef {
  code: string;
  label: string;
  /** « art. 100 ». */
  legalBasis: string;
}

/** Mandatory mentions of a consent template (loi n° 001/2011 modifiée par la loi n° 025/2023). */
export const CONSENT_CLAUSES: readonly ConsentClauseDef[] = [
  { code: 'IDENTITE_RESPONSABLE', label: 'Identité et coordonnées du responsable du traitement', legalBasis: 'art. 100' },
  { code: 'FINALITE', label: 'Finalité précise du traitement', legalBasis: 'art. 70, 100' },
  { code: 'CATEGORIES_DONNEES', label: 'Catégories de données concernées', legalBasis: 'art. 100' },
  { code: 'DESTINATAIRES', label: 'Destinataires des données', legalBasis: 'art. 100' },
  { code: 'DUREE_CONSERVATION', label: 'Durée de conservation des données', legalBasis: 'art. 100' },
  { code: 'DROITS', label: 'Droits d’accès, de rectification, d’opposition et d’effacement', legalBasis: 'art. 100' },
  { code: 'RETRAIT', label: 'Droit de retirer son consentement à tout moment et procédure de retrait', legalBasis: 'art. 73, 100' },
  { code: 'RECLAMATION_APDPVP', label: 'Droit de réclamation auprès de l’APDPVP', legalBasis: 'art. 100' },
  { code: 'DISTINCT_DU_CONTRAT', label: 'Consentement distinct du contrat de financement', legalBasis: 'art. 72' },
  { code: 'TRANSFERT_HORS_GABON', label: 'Transfert de données hors du Gabon, ou son absence', legalBasis: 'art. 100, 171' },
];
