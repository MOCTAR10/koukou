import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Info, Lightbulb, Scale, TrendingUp } from 'lucide-react';
import { Modal } from '../form';
import { IconTile } from '../ui';

export type MetricKey = 'IC' | 'GMQ' | 'IPE';

interface MetricContent {
  icon: ReactNode;
  title: string;
  tagline: string;
  body: string;
  prefix: string;
  numerator: string;
  denominator: string;
  suffix?: string;
  example: string;
  ideal: string;
}

// Same wording as mobile's MetricInfoSheet.
const METRIC_CONTENT: Record<MetricKey, MetricContent> = {
  IC: {
    icon: <Activity />,
    title: 'IC : indice de consommation',
    tagline: 'Le KPI d’efficacité alimentaire',
    body: 'L’IC (ou FCR, Feed Conversion Ratio) mesure combien de kilos d’aliment sont nécessaires pour produire un kilo de poulet. C’est l’indicateur clé de la rentabilité : plus l’IC est bas, mieux l’aliment est valorisé en poids vif.',
    prefix: 'IC =',
    numerator: 'Aliment consommé (kg)',
    denominator: 'Poids vif produit (kg)',
    example: 'Un lot consomme 3 000 kg d’aliment et produit 1 500 kg de poulets : IC = 3 000 ÷ 1 500 = 2,0.',
    ideal: 'Bon IC chair : 1,6 à 1,9. Au-delà de 2,2, l’utilisation de l’aliment se dégrade.',
  },
  GMQ: {
    icon: <TrendingUp />,
    title: 'GMQ : gain moyen quotidien',
    tagline: 'La vitesse de croissance du lot',
    body: 'Le GMQ représente la croissance moyenne quotidienne des sujets, en grammes par jour. Plus il est élevé, plus les poulets atteignent vite leur poids de vente (poids d’abattage visé).',
    prefix: 'GMQ (g/j) =',
    numerator: 'Poids final (g) − Poids initial (g)',
    denominator: 'Nombre de jours d’élevage',
    example: 'Poussin pesé à 40 g au départ, 2 500 g à J40 : (2 500 − 40) ÷ 39 ≈ 63 g/j.',
    ideal: 'Au-delà de 55 g/j, la croissance est considérée rapide. Surveillez l’IC quand le GMQ augmente.',
  },
  IPE: {
    icon: <Scale />,
    title: 'IPE : indice de performance d’élevage',
    tagline: 'Le KPI zootechnique de référence',
    body: 'Dans la gestion technico-économique des poulets de chair, l’IPE (ou indice européen) est la formule de référence mondiale pour évaluer l’efficacité globale d’un lot à la fin de la période d’élevage. Il combine en un seul chiffre la viabilité des animaux, leur vitesse de croissance et l’efficacité de leur alimentation.',
    prefix: 'IPE =',
    numerator: 'Viabilité (%) × Poids moyen (kg)',
    denominator: 'Âge au sacrifice (jours) × IC',
    suffix: '× 100',
    example: 'Viabilité 95 %, poids moyen 2,2 kg, âge 45 j, IC 1,8 : IPE = (95 × 2,2 ÷ (45 × 1,8)) × 100 ≈ 258.',
    ideal: 'Un IPE élevé signale un lot efficace (viable, rapide, économe). La viabilité = 100 % − taux de mortalité.',
  },
};

function MetricInfoModal({ metric, onClose }: { metric: MetricKey; onClose: () => void }) {
  const c = METRIC_CONTENT[metric];
  return (
    <Modal title={c.title} onClose={onClose}>
      <div className="space-y-4 text-left font-normal">
        <div className="flex items-center gap-3">
          <IconTile icon={c.icon} />
          <p className="text-sm font-medium text-slate-700">{c.tagline}</p>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">{c.body}</p>
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-brand-50 p-3 text-sm font-semibold">
          <span className="text-brand-700">{c.prefix}</span>
          <span className="inline-flex min-w-0 flex-col items-center text-center text-slate-800">
            <span className="px-1">{c.numerator}</span>
            <span aria-hidden="true" className="my-1 h-px w-full bg-brand-400" />
            <span className="px-1">{c.denominator}</span>
          </span>
          {c.suffix ? <span className="text-brand-700">{c.suffix}</span> : null}
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-800">Exemple chiffré</p>
          <p className="mt-1 text-sm text-slate-600">{c.example}</p>
        </div>
        <p className="flex items-start gap-2 text-sm text-slate-600">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          {c.ideal}
        </p>
      </div>
    </Modal>
  );
}

/** Info buttons for the three KPIs. The modal is portaled because this sits inside a heading. */
export function MetricInfoButtons() {
  const [metric, setMetric] = useState<MetricKey | null>(null);
  return (
    <span className="ml-auto flex items-center gap-1">
      {(['IC', 'GMQ', 'IPE'] as const).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setMetric(key)}
          aria-label={`Comprendre l’indicateur ${key}`}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-brand-700"
        >
          <Info className="h-3.5 w-3.5" /> {key}
        </button>
      ))}
      {metric ? createPortal(<MetricInfoModal metric={metric} onClose={() => setMetric(null)} />, document.body) : null}
    </span>
  );
}
