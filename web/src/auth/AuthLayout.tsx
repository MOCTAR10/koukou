import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Store } from 'lucide-react';
import { ProgrammeLockup } from '../components/Logo';
import { motion, useReducedMotion } from 'motion/react';
import { EASE, durations } from '../lib/motion';

const AUDIENCES = {
  programme: {
    headline: 'Programme POUFA, console de pilotage.',
    intro: 'Le suivi des fermes avicoles du programme, du registre national aux indicateurs de production.',
    points: [
      'Registre national des fermes et de leurs exploitants',
      'Pilotage de l’objectif national de 100 000 tonnes',
      'Surveillance sanitaire et alertes du programme',
      'Journal d’audit et droits d’accès par institution',
    ],
    insight: null,
  },
  farm: {
    headline: 'Toute votre ferme, au même endroit.',
    intro: 'Suivez vos bandes, vos stocks et vos ventes, depuis le bureau comme sur le terrain.',
    points: [
      'Lots, saisies du jour et alertes sanitaires',
      'Stock, ventes, caisse et comptabilité',
      'Le travail continue, même sans réseau',
    ],
    insight: {
      title: 'Vendez aussi sur le Marché Fermia',
      text: 'Publiez vos stocks et vos précommandes : hôtels, restaurants et particuliers commandent directement à votre ferme.',
    },
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
    insight: null,
  },
} as const;

/** Sign-in and sign-up frame: a brand panel beside the form on a computer, the form alone under a compact band on a phone. */
export function AuthLayout({
  audience = 'programme',
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
    <div className={'min-h-screen bg-white lg:grid ' + (audience === 'programme' ? 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]' : 'lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]')}>
      {audience === 'programme' ? <ProgrammeAside /> : (
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 text-white lg:block">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-brand-400/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-32 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex min-h-screen flex-col justify-between gap-8 p-10 xl:p-14 [@media(max-height:720px)]:gap-5 [@media(max-height:720px)]:px-10 [@media(max-height:720px)]:py-7">
          <img src="/fermia-lockup-light.png" alt="Fermia — Gérez votre ferme" className="h-16 w-fit xl:h-20 [@media(max-height:720px)]:h-12" />
          <div className="max-w-lg">
            <h2 className="text-display font-bold leading-[1.1] tracking-tight [@media(max-height:720px)]:text-3xl">{copy.headline}</h2>
            <p className="mt-4 text-base text-brand-100 xl:text-lg [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:text-sm">{copy.intro}</p>
            <ul className="mt-7 space-y-3 [@media(max-height:720px)]:mt-4 [@media(max-height:720px)]:space-y-2">
              {copy.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-brand-50 xl:text-base [@media(max-height:720px)]:text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Check className="h-3 w-3" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          {copy.insight ? (
            <div className="flex max-w-lg items-start gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 xl:p-5 [@media(max-height:720px)]:p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Store className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold xl:text-base [@media(max-height:720px)]:text-sm">{copy.insight.title}</p>
                <p className="mt-1 text-sm text-brand-100">{copy.insight.text}</p>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
      )}

      <div className="flex min-h-screen flex-col lg:min-h-0">
        <div className="bg-gradient-to-br from-brand-800 to-brand-950 px-5 py-4 lg:hidden">
          {audience === 'programme' ? (
            <ProgrammeLockup compact />
          ) : (
            <img src="/fermia-lockup-light.png" alt="Fermia — Gérez votre ferme" className="h-12 w-auto" />
          )}
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
            {audience === 'programme' ? (
              <img
                src="/maedr-logo-full.webp"
                alt="Ministère de l’Agriculture, de l’Élevage et du Développement rural"
                className="mb-6 hidden h-32 w-32 object-contain lg:block"
              />
            ) : null}
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

const PROGRAMME_FIGURES = [
  { value: '150', label: 'fermes avicoles' },
  { value: '100 000 t', label: 'objectif de production' },
  { value: '2030', label: 'horizon de suivi' },
] as const;

/** Programme sign-in: full-height field photo, official programme title, ministry seal. */
function ProgrammeAside() {
  return (
    <aside className="relative hidden overflow-hidden bg-brand-950 text-white lg:block">
      <img
        src="/login-poufa.webp"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-[30%_35%]"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-brand-950 via-brand-950/40 via-40% to-transparent" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-brand-950/30 to-transparent" />
      <div className="relative flex min-h-screen flex-col justify-between p-10 xl:p-14 [@media(max-height:720px)]:px-10 [@media(max-height:720px)]:py-7">
        <div className="flex items-center gap-3 self-start rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/20 backdrop-blur-md">
                    <div className="text-[11px] uppercase leading-tight tracking-wider text-white/90">
            <p className="font-semibold">République gabonaise</p>
            <p className="text-white/70">Ministère de l’Agriculture, de l’Élevage et du Développement rural</p>
          </div>
        </div>
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200 ring-1 ring-amber-300/30">
            Programme POUFA
          </p>
          <h2 className="mt-4 text-3xl font-bold leading-[1.15] tracking-tight drop-shadow xl:text-4xl [@media(max-height:720px)]:text-3xl">
            Suivi technico-économique et traçabilité de la filière avicole
          </h2>
          <p className="mt-3 max-w-lg text-sm text-white/85 xl:text-base [@media(max-height:720px)]:text-sm">
            Le système d’information national du programme : registre des fermes, production, surveillance sanitaire et
            traçabilité des lots, de la ferme au consommateur.
          </p>
          <dl className="mt-6 grid max-w-lg grid-cols-3 gap-3 [@media(max-height:720px)]:mt-5">
            {PROGRAMME_FIGURES.map((f) => (
              <div key={f.label} className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-md">
                <dt className="sr-only">{f.label}</dt>
                <dd>
                  <span className="block text-xl font-bold xl:text-2xl">{f.value}</span>
                  <span className="text-xs text-white/70">{f.label}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 flex items-center gap-2 text-xs text-white/60 [@media(max-height:720px)]:mt-5">
            <img src="/logo.png" alt="" className="h-4 w-auto opacity-80" />
            Plateforme propulsée par Fermia
          </p>
        </div>
      </div>
    </aside>
  );
}
