import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowLeft, Building2, Calculator, Check, Map, QrCode, ScrollText, ShieldCheck, Stethoscope, Store } from 'lucide-react';
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
  const programme = audience === 'programme';
  return (
    <div className={'min-h-screen bg-white lg:grid ' + (audience === 'programme' ? 'lg:h-screen lg:overflow-hidden ' : '') + (audience === 'programme' ? 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]' : 'lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]')}>
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

      <div className={'relative flex min-h-screen flex-col lg:min-h-0 lg:overflow-y-auto ' + (programme ? 'bg-slate-50' : '')}>
        {programme ? (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(15_23_42/0.07)_1px,transparent_0)] [background-size:22px_22px]" />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-600 via-amber-400 to-sky-600" />
          </>
        ) : null}
        <div className="relative bg-gradient-to-br from-brand-800 to-brand-950 px-5 py-4 lg:hidden">
          {programme ? (
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
        <div className="relative flex flex-1 items-start justify-center px-5 py-8 sm:px-10 lg:items-center lg:py-10">
          <motion.div
            className={wide ? 'w-full max-w-xl' : 'w-full max-w-md'}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.base, ease: EASE }}
          >
            <div className={programme ? 'rounded-3xl bg-white p-7 shadow-[0_24px_60px_-20px_rgb(15_23_42/0.25)] ring-1 ring-slate-200/80 sm:p-9' : ''}>
              {eyebrow ? (
                <p
                  className={
                    programme
                      ? 'inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-700 ring-1 ring-brand-100'
                      : 'text-xs font-semibold uppercase tracking-wider text-brand-600'
                  }
                >
                  {programme ? <ShieldCheck className="h-3.5 w-3.5" /> : null}
                  {eyebrow}
                </p>
              ) : null}
              <h1
                className={`${programme ? 'mt-4 lg:text-[1.75rem]' : 'mt-1 lg:text-[2rem]'} text-2xl font-bold tracking-tight text-slate-900 lg:leading-tight`}
              >
                {title}
              </h1>
              {subtitle ? <p className="mt-2 text-sm text-slate-500 lg:text-base">{subtitle}</p> : null}
              <div className="mt-6 lg:mt-8">{children}</div>
              {footer ? (
                <div className={`mt-6 space-y-2 text-center text-sm text-slate-500 ${programme ? 'border-t border-slate-100 pt-5' : ''}`}>
                  {footer}
                </div>
              ) : null}
            </div>
            {programme ? (
              <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Connexion sécurisée · Accès réservé aux comptes du programme
              </p>
            ) : null}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** Link of an auth page footer. */
export const authLinkCls = 'font-semibold text-brand-600 hover:text-brand-700';

const PROGRAMME_MODULES = [
  { icon: Building2, label: 'Registre national des fermes' },
  { icon: Activity, label: 'Suivi des bandes et indicateurs' },
  { icon: Stethoscope, label: 'Surveillance sanitaire' },
  { icon: QrCode, label: 'Traçabilité des lots par QR' },
  { icon: Map, label: 'Tableaux de bord et cartographie' },
  { icon: Calculator, label: 'Comptabilité SYSCOHADA' },
  { icon: Store, label: 'Marché et commercialisation' },
  { icon: ScrollText, label: 'Journal d’audit et droits d’accès' },
] as const;

/** Programme sign-in: full-height field photo, ministry seal, official programme title and modules. */
function ProgrammeAside() {
  return (
    <aside className="relative hidden h-screen overflow-hidden bg-brand-950 text-white lg:block">
      <img src="/login-poufa.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[30%_30%]" />
      <div aria-hidden className="absolute inset-0 bg-brand-950/25" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-brand-950/90 via-brand-950/35 via-35% to-transparent" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-[20rem] bg-gradient-to-b from-black/45 to-transparent" />
      <div className="relative flex h-full flex-col p-10 xl:p-12 [@media(max-height:780px)]:p-7">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-white p-1 shadow-xl shadow-black/40">
            <img
              src="/maedr-logo-full.webp"
              alt="Ministère de l’Agriculture, de l’Élevage et du Développement rural"
              className="h-28 w-28 object-contain xl:h-32 xl:w-32 [@media(max-height:780px)]:h-24 [@media(max-height:780px)]:w-24"
            />
          </div>
          <div className="rounded-xl bg-white p-1 shadow-xl shadow-black/40">
            <img
              src="/men-logo.webp"
              alt="Ministère de l’Économie numérique, de la Digitalisation et de l’Innovation"
              className="h-28 w-28 object-contain xl:h-32 xl:w-32 [@media(max-height:780px)]:h-24 [@media(max-height:780px)]:w-24"
            />
          </div>
          <div className="border-l border-white/30 pl-5 text-white">
            <p className="text-2xl font-bold uppercase tracking-[0.2em] drop-shadow xl:text-3xl">Programme POUFA</p>
          </div>
        </div>

        <div className="mt-10 [@media(max-height:780px)]:mt-6">
            <h2 className="text-[clamp(1.1rem,1.95vw,2.5rem)] font-bold leading-[1.15] tracking-tight drop-shadow-[0_2px_10px_rgb(0_0_0/0.6)]">
              <span className="block whitespace-nowrap">Système d’information de suivi technico-économique</span>
              <span className="block whitespace-nowrap">
                et de traçabilité{' '}
                <span className="bg-gradient-to-r from-amber-200 to-emerald-200 bg-clip-text text-transparent">de la filière avicole</span>
              </span>
            </h2>
        </div>

        <div className="mt-auto mb-24 [@media(max-height:780px)]:mb-10">
          <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-amber-200 drop-shadow"><span className="h-px w-8 bg-amber-300" />
            Modules de la plateforme
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 xl:grid-cols-4 xl:gap-x-4 [@media(max-height:780px)]:gap-y-1.5">
            {PROGRAMME_MODULES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5 text-[13px] font-bold leading-snug text-white drop-shadow-[0_1px_3px_rgb(0_0_0/0.8)]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-300/10 ring-1 ring-amber-200/25">
                  <Icon className="h-4 w-4 text-amber-200" aria-hidden />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-5 flex items-center gap-3 text-sm font-medium text-white/85 drop-shadow [@media(max-height:780px)]:mt-3">
          <img src="/logo.png" alt="" className="h-8 w-auto" />
          Plateforme propulsée par Fermia
        </p>
      </div>
    </aside>
  );
}
