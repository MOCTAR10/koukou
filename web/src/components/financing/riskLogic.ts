import type { PortfolioRisk } from '../../api/types-financing';

/** One colour per ageing bucket (light to dark amber then red); the label is always printed next to it. */
export const AGEING_COLORS: Record<PortfolioRisk['ageing'][number]['key'], string> = {
  J1_30: '#fbbf24',
  J31_60: '#f97316',
  J61_90: '#dc2626',
  J90_PLUS: '#7f1d1d',
};

export const totalOverdue = (ageing: PortfolioRisk['ageing']): number => ageing.reduce((n, b) => n + b.overdueFcfa, 0);

export const totalOverdueFiles = (ageing: PortfolioRisk['ageing']): number => ageing.reduce((n, b) => n + b.files, 0);

/** « 62,5 % », the dash being avoided: a missing share reads « — ». */
export function shareText(pct: number | null): string {
  return pct == null ? '—' : `${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

export const PROVISIONS_NOTE =
  'Provisions indicatives : la comptabilité de la BCEG fait foi et les garanties ne sont pas prises en compte. Taux réglables dans les paramètres du programme, groupe « Financement » (COBAC R-2018/01, art. 17-18).';

export const PURPOSE_NOTE = 'L’objet d’un financement est un texte libre : la répartition de l’encours se fait donc par province.';
