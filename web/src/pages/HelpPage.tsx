import {
  CreditCard,
  Globe2,
  LifeBuoy,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  Syringe,
  Timer,
  UserPlus,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { Card, PageHeader } from '../components/ui';

interface Guide {
  icon: LucideIcon;
  iconCls: string;
  title: string;
  lines: string[];
}

const SECTIONS: Array<{ title: string; subtitle?: string; guides: Guide[] }> = [
  {
    title: 'Démarrage rapide',
    subtitle: 'Les 4 premiers gestes',
    guides: [
      {
        icon: PiggyBank,
        iconCls: 'text-amber-600',
        title: '1. Votre ferme',
        lines: [
          'Votre ferme est créée à l’inscription. Complétez son nom et son logo dans Réglages.',
          'Le même compte vous connecte au site web et à l’application mobile Fermia.',
        ],
      },
      {
        icon: UserPlus,
        iconCls: 'text-brand-600',
        title: '2. Votre équipe',
        lines: [
          'Menu → Équipe : ajoutez un compte éleveur (terrain) pour les saisies.',
          'L’éleveur saisit, vend et encaisse depuis l’application mobile ; l’ouverture/clôture de caisse reste au propriétaire.',
        ],
      },
      {
        icon: Syringe,
        iconCls: 'text-emerald-600',
        title: '3. Un lot, un calendrier',
        lines: [
          'Créez le lot, entrez les saisies du jour chaque matin (moins d’1 minute).',
          'Menu → Sanitaire : générez le calendrier de soins, complétez les soins et tracez les traitements.',
        ],
      },
      {
        icon: CreditCard,
        iconCls: 'text-amber-700',
        title: '4. Vendre & encaisser',
        lines: [
          'Menu → Ventes : pièce, au kilo, œufs ou autre, avec un client et un coupon optionnels.',
          'La caisse s’ouvre automatiquement ; les reçus et bordereaux proviennent du serveur (PDF).',
        ],
      },
    ],
  },
  {
    title: 'Connexion & qualité',
    guides: [
      {
        icon: Wifi,
        iconCls: 'text-red-500',
        title: 'Connexion et hors-ligne',
        lines: [
          'Sur le site web, chaque opération part directement au serveur : une connexion est nécessaire.',
          'Sans réseau, utilisez l’application mobile : une saisie ou une vente y est mise en attente, puis synchronisée automatiquement dès que la connexion revient.',
        ],
      },
      {
        icon: RefreshCw,
        iconCls: 'text-brand-600',
        title: 'Alertes & advisory',
        lines: [
          'La page Alertes priorise vos actions (rouge → jaune) : saisie manquante, soin, stock de provende.',
          'Acquittez une alerte d’un clic ; elle restera historisée.',
        ],
      },
      {
        icon: ShieldCheck,
        iconCls: 'text-emerald-600',
        title: 'Traçabilité',
        lines: [
          'Aliments HACCP : n° de lot fournisseur, péremption, stock par bâtiment.',
          'Menu → Abattage : ordres vivant/abattu, bordereau pour l’abattoir, passeport sanitaire du lot.',
        ],
      },
    ],
  },
  {
    title: 'À propos',
    guides: [
      {
        icon: Globe2,
        iconCls: 'text-slate-400',
        title: 'Langue & support',
        lines: ['Interface en français (Gabon).', 'Aide détaillée et tutoriels vidéo prévus dans une prochaine version.'],
      },
      {
        icon: Timer,
        iconCls: 'text-slate-400',
        title: 'Statut',
        lines: ['Site web relié au serveur, comme l’application mobile : les données sont les mêmes des deux côtés.'],
      },
    ],
  },
];

export function HelpPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Langue & aide" subtitle="Français · Guide de démarrage" />

      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h2 className="text-base font-semibold text-slate-800">{section.title}</h2>
          {section.subtitle ? <p className="text-sm text-slate-500">{section.subtitle}</p> : null}
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {section.guides.map((guide) => (
              <Card key={guide.title} className="p-4">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                    <guide.icon className={`h-5 w-5 ${guide.iconCls}`} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{guide.title}</h3>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 marker:text-brand-500">
                  {guide.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <p className="flex items-center justify-center gap-2 text-sm text-slate-400">
        <LifeBuoy className="h-4 w-4" /> Besoin d’aide ? Contactez l’équipe Fermia.
      </p>
    </div>
  );
}
