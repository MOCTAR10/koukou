import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { EGG_IMAGES, SPECIES_IMAGES } from '../lib/animalImages';
import { EASE, durations } from '../lib/motion';

const AUDIENCES = {
  farm: {
    headline: 'Toute votre ferme, au même endroit.',
    intro: 'Suivez vos élevages, vos cultures et vos ventes, depuis le bureau comme sur le terrain.',
    points: [
      'Lots, saisies du jour et alertes sanitaires',
      'Stock, ventes, caisse et comptabilité',
      'Vos stocks et précommandes sur le Marché',
      'Le travail continue, même sans réseau',
    ],
  },
  buyer: {
    headline: 'Achetez directement aux fermes.',
    intro: 'Hôtels, restaurants et particuliers : commandez auprès de fermes vérifiées.',
    points: [
      'Volaille, œufs et carcasses',
      'Précommandez les lots bientôt prêts',
      'Retrait à la ferme ou livraison par la ferme',
      'Vous payez directement la ferme',
    ],
  },
} as const;

const PHOTOS = [SPECIES_IMAGES.POULET, EGG_IMAGES.alveole, SPECIES_IMAGES.PINTADE];

/** Sign-in and sign-up frame: a brand panel beside the form on a computer, the form alone under a compact band on a phone. */
export function AuthLayout({
  audience = 'farm',
  eyebrow,
  title,
  subtitle,
  backTo,
  backLabel,
  wide = false,
  footer,
  children,
}: {
  audience?: keyof typeof AUDIENCES;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  /** Roomier form column, for a form laid out on two columns. */
  wide?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const copy = AUDIENCES[audience];
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 text-white lg:block">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-brand-400/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-32 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex h-screen flex-col justify-between gap-8 p-10 xl:p-14 lg:sticky lg:top-0">
          <img src="/fermia-lockup-light.png" alt="Fermia — Gérez votre ferme" className="h-16 w-fit xl:h-20" />
          <div className="max-w-lg">
            <h2 className="text-display font-bold leading-[1.1] tracking-tight">{copy.headline}</h2>
            <p className="mt-4 text-base text-brand-100 xl:text-lg">{copy.intro}</p>
            <ul className="mt-7 space-y-3">
              {copy.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-brand-50 xl:text-base">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Check className="h-3 w-3" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div aria-hidden className="flex gap-3">
            {PHOTOS.map((src) => (
              <img key={src} src={src} alt="" className="h-20 w-20 rounded-2xl bg-white object-contain p-1.5 shadow-raised xl:h-24 xl:w-24" />
            ))}
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:min-h-0">
        <div className="bg-gradient-to-br from-brand-800 to-brand-950 px-5 py-4 lg:hidden">
          <img src="/fermia-lockup-light.png" alt="Fermia — Gérez votre ferme" className="h-12 w-auto" />
        </div>
        {backTo ? (
          <div className="px-5 pt-5 sm:px-10">
            <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
              <ArrowLeft className="h-4 w-4" /> {backLabel}
            </Link>
          </div>
        ) : null}
        <div className="flex flex-1 items-start justify-center px-5 py-8 sm:px-10 lg:items-center lg:py-10">
          <motion.div
            className={wide ? 'w-full max-w-xl' : 'w-full max-w-md'}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.base, ease: EASE }}
          >
            {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p> : null}
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 lg:text-[2rem] lg:leading-tight">{title}</h1>
            {subtitle ? <p className="mt-2 text-sm text-slate-500 lg:text-base">{subtitle}</p> : null}
            <div className="mt-6 lg:mt-8">{children}</div>
            {footer ? <div className="mt-6 space-y-2 text-center text-sm text-slate-500">{footer}</div> : null}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** Link of an auth page footer. */
export const authLinkCls = 'font-semibold text-brand-600 hover:text-brand-700';
