import { Link } from 'react-router-dom';
import {
  BookOpenCheck,
  ClipboardList,
  CreditCard,
  Gauge,
  KeyRound,
  ScrollText,
  ShieldAlert,
  Sprout,
  Globe2,
  LifeBuoy,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  Syringe,
  Timer,
  UserPlus,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useMenuAccess } from '../app/useMenuAccess';
import { Card, IconTile, PageHeader, type IconTone } from '../components/ui';

interface Guide {
  icon: LucideIcon;
  iconTone: IconTone;
  title: string;
  lines: string[];
  /** Page the guide is about, with the link label (institution guide). */
  link?: { to: string; label: string };
}

const SECTIONS: Array<{ title: string; subtitle?: string; guides: Guide[] }> = [
  {
    title: 'Démarrage rapide',
    subtitle: 'Les 4 premiers gestes',
    guides: [
      {
        icon: PiggyBank,
        iconTone: 'accent',
        title: '1. Votre ferme',
        lines: [
          'Votre ferme est enregistrée par le registre du programme POUFA, qui vous remet votre code de connexion à l’activation de votre compte.',
          'Son nom et son code (G1-0012…) sont ceux du registre ; ajoutez votre logo dans Réglages.',
          'Le même compte vous connecte au site web et à l’application mobile Fermia.',
        ],
      },
      {
        icon: UserPlus,
        iconTone: 'brand',
        title: '2. Votre équipe',
        lines: [
          'Menu → Équipe : ajoutez un compte éleveur (terrain) pour les saisies.',
          'L’éleveur saisit, vend et encaisse depuis le site web ou l’application mobile ; l’ouverture et la clôture de caisse demandent un droit accordé par le propriétaire.',
        ],
      },
      {
        icon: Syringe,
        iconTone: 'green',
        title: '3. Un lot, un calendrier',
        lines: [
          'Créez le lot, entrez les saisies du jour chaque matin (moins d’1 minute).',
          'Menu → Sanitaire : générez le calendrier de soins, complétez les soins et tracez les traitements.',
        ],
      },
      {
        icon: CreditCard,
        iconTone: 'amber',
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
        icon: WifiOff,
        iconTone: 'red',
        title: 'Connexion et hors-ligne',
        lines: [
          'Sur le site web comme sur l’application mobile, une saisie ou une vente faite sans réseau est mise en attente, puis synchronisée automatiquement dès que la connexion revient.',
          'Les données déjà consultées restent lisibles hors ligne. Quelques actions demandent le réseau : un message vous le signale.',
        ],
      },
      {
        icon: RefreshCw,
        iconTone: 'brand',
        title: 'Alertes et conseils',
        lines: [
          'La page Alertes priorise vos actions (rouge → jaune) : saisie manquante, soin, stock de provende.',
          'Acquittez une alerte d’un clic ; elle restera historisée.',
        ],
      },
      {
        icon: ShieldCheck,
        iconTone: 'green',
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
        iconTone: 'slate',
        title: 'Aide et support',
        lines: ['Interface en français (Gabon).', 'Aide détaillée et tutoriels vidéo prévus dans une prochaine version.'],
      },
      {
        icon: Timer,
        iconTone: 'slate',
        title: 'Statut',
        lines: ['Site web relié au serveur, comme l’application mobile : les données sont les mêmes des deux côtés.'],
      },
    ],
  },
];

/** Guide of the institutions (DGE, MAEDR, veterinary services…) and the platform administrator. */
const INSTITUTION_GUIDES: Guide[] = [
  {
    icon: ClipboardList,
    iconTone: 'brand',
    title: 'Registre des fermes',
    lines: [
      'Le registre est la source unique des fermes du programme : code ferme (G1-0012…), province, cohorte, statut et position GPS.',
      'Filtrez par province, statut ou cohorte ; ouvrez une fiche pour consulter l’éleveur, l’équipe et les vérifications de terrain.',
      'Création, activation du compte éleveur, import et modification dépendent des droits de votre profil : un bouton absent signifie un droit non accordé.',
    ],
    link: { to: '/app/registre', label: 'Ouvrir le registre' },
  },
  {
    icon: Gauge,
    iconTone: 'accent',
    title: 'Pilotage du programme',
    lines: [
      'Tableau de bord, carte, objectif 100 000 t et rapports de fin de bande, sur la période et le périmètre choisis.',
      'Repliez ou dépliez « Filtres (n) » : le nombre indique les filtres actifs, et votre choix est mémorisé.',
      'Un profil agrégé ne voit aucun nom de ferme : seuls les chiffres du périmètre sont affichés.',
    ],
    link: { to: '/app/pilotage', label: 'Ouvrir le pilotage' },
  },
  {
    icon: ShieldAlert,
    iconTone: 'red',
    title: 'Surveillance sanitaire',
    lines: [
      'Les alertes officielles sont qualifiées puis publiées par les services vétérinaires ; les autres profils lisent les alertes publiées de leur périmètre.',
      'Filtrez par statut, origine, province ou période ; ouvrez une alerte pour son historique.',
    ],
    link: { to: '/app/surveillance', label: 'Ouvrir la surveillance' },
  },
  {
    icon: KeyRound,
    iconTone: 'green',
    title: 'Droits et accès',
    lines: [
      'Chaque compte institutionnel a un profil d’accès : domaines consultables (registre, pilotage, sanitaire…) et périmètre (national ou provinces).',
      'La page « Mon accès » liste vos droits ; l’administrateur gère les profils et la matrice des droits depuis « Accès ».',
      'Un droit modifié s’applique à la prochaine connexion du compte concerné.',
    ],
    link: { to: '/app/mon-acces', label: 'Voir mon accès' },
  },
  {
    icon: ScrollText,
    iconTone: 'slate',
    title: 'Journal d’audit',
    lines: [
      'Toute consultation sensible et toute modification sont tracées : qui, quoi, quand.',
      'Filtrez par période, utilisateur ou type d’action pour reconstituer une décision ; le journal ne peut pas être modifié.',
    ],
    link: { to: '/app/audit', label: 'Ouvrir le journal' },
  },
  {
    icon: BookOpenCheck,
    iconTone: 'amber',
    title: 'Paramètres et reprise des données',
    lines: [
      'Les paramètres et listes (cohortes, statuts, seuils de la carte…) sont modifiables par l’administration, sans intervention technique.',
      'La reprise des données importe l’historique des fermes par dépôt de fichiers, avec un essai à blanc avant validation.',
    ],
    link: { to: '/app/parametres', label: 'Ouvrir les paramètres' },
  },
];

export function HelpPage() {
  const menu = useMenuAccess();
  const institutional =
    menu.registry.view || menu.pilotage.view || menu.admin.audit.view || menu.showAccessAdmin || menu.showPlatform || menu.showMyAccess;
  const institutionGuides = INSTITUTION_GUIDES.filter((g) => !g.link || menu.canOpen(g.link.to));
  return (
    <div className="space-y-8">
      <PageHeader title="Aide" subtitle={institutional ? 'Français · Guides institution et ferme' : 'Français · Guide de démarrage'} icon={<LifeBuoy className="h-6 w-6" />} />

      <Link to="/guide" className="flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 hover:border-brand-400">
        <span className="flex items-center gap-3">
          <IconTile icon={<BookOpenCheck className="h-5 w-5" />} tone="brand" />
          <span>
            <span className="block text-sm font-bold text-slate-900">Guide de la plateforme</span>
            <span className="block text-sm text-slate-600">Tous les écrans, le cahier des charges et le mode présentation.</span>
          </span>
        </span>
        <span className="text-sm font-semibold text-brand-700">Ouvrir</span>
      </Link>

      {institutional && institutionGuides.length > 0 ? (
        <>
          <nav aria-label="Sections de l’aide" className="flex flex-wrap gap-2 text-sm">
            <a href="#aide-institution" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-200">
              <Sprout className="h-4 w-4" /> Guide institution
            </a>
            <a href="#aide-ferme" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-200">
              <PiggyBank className="h-4 w-4" /> Guide éleveur
            </a>
          </nav>
          <section id="aide-institution" className="scroll-mt-20">
            <h2 className="text-base font-semibold text-slate-800">Guide institution</h2>
            <p className="text-sm text-slate-600">Registre, droits d’accès et audit du programme POUFA</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {institutionGuides.map((guide) => (
                <Card key={guide.title} className="p-4">
                  <div className="mb-2 flex items-center gap-3">
                    <IconTile icon={<guide.icon className="h-5 w-5" />} tone={guide.iconTone} />
                    <h3 className="text-sm font-bold text-slate-900">{guide.title}</h3>
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 marker:text-brand-500">
                    {guide.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {guide.link ? (
                    <Link to={guide.link.to} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
                      {guide.link.label}
                    </Link>
                  ) : null}
                </Card>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <div id="aide-ferme" className="scroll-mt-20 space-y-8">
      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h2 className="text-base font-semibold text-slate-800">{section.title}</h2>
          {section.subtitle ? <p className="text-sm text-slate-500">{section.subtitle}</p> : null}
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {section.guides.map((guide) => (
              <Card key={guide.title} className="p-4">
                <div className="mb-2 flex items-center gap-3">
                  <IconTile icon={<guide.icon className="h-5 w-5" />} tone={guide.iconTone} />
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
      </div>

      <p className="flex items-center justify-center gap-2 text-sm text-slate-400">
        <LifeBuoy className="h-4 w-4" /> Besoin d’aide ? Contactez l’équipe Fermia.
      </p>
    </div>
  );
}
