import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity, LifeBuoy, ArrowLeft, Building2, Calculator, CalendarClock, Egg, HandCoins, Map, QrCode, ScrollText, Stethoscope, Store, Truck } from 'lucide-react';
import { ConnectionPulse } from '../components/ConnectionPulse';
import { ProgrammeLockup } from '../components/Logo';
import { motion, useReducedMotion } from 'motion/react';
import { EASE, durations } from '../lib/motion';

/** Who the page speaks to: the programme sign-in, or the Market customer. */
type Audience = 'programme' | 'buyer';

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
  audience?: Audience;
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
  const programme = audience === 'programme';
  return (
    <div className={'min-h-screen bg-white lg:grid lg:h-screen lg:overflow-hidden ' + (programme ? 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]' : 'lg:grid-cols-2 xl:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]')}>
      {programme ? <ProgrammeAside /> : <MarketAside />}

      <div className={'relative flex min-h-screen flex-col bg-slate-50 lg:h-screen lg:min-h-0 ' + (programme ? 'lg:overflow-hidden' : 'lg:overflow-y-auto')}>
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(15_23_42/0.07)_1px,transparent_0)] [background-size:22px_22px]" />
        <div
          aria-hidden
          className={'pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ' + (programme ? 'from-emerald-600 via-amber-400 to-sky-600' : 'from-emerald-500 via-brand-500 to-accent-500')}
        />
        <div className="absolute right-3 top-3 z-10 lg:right-5 lg:top-4">
          <ConnectionPulse />
        </div>
        <div className="relative bg-gradient-to-br from-brand-800 to-brand-950 px-5 py-4 lg:hidden">
          {programme ? (
            <ProgrammeLockup />
          ) : (
            <MarketBrand />
          )}
        </div>
        {backTo ? (
          <div className="relative px-5 pt-5 sm:px-10 [@media(max-height:760px)]:lg:pt-3">
            <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
              <ArrowLeft className="h-4 w-4" /> {backLabel}
            </Link>
          </div>
        ) : null}
        <div className="relative flex flex-1 items-start justify-center px-4 py-6 sm:px-10 sm:py-8 lg:items-center lg:py-8 [@media(max-height:760px)]:lg:py-3">
          <motion.div
            className={wide ? 'w-full max-w-xl' : 'w-full max-w-md'}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.base, ease: EASE }}
          >
            <div
              className={
                'rounded-3xl bg-white shadow-[0_24px_60px_-20px_rgb(15_23_42/0.25)] ring-1 ring-slate-200/80 ' +
                (programme ? 'p-7 sm:p-9 [@media(max-height:760px)]:p-6' : 'p-5 sm:p-8 [@media(max-height:820px)]:lg:p-6')
              }
            >
              {programme ? (
                <div className="flex items-center gap-2.5">
                  <img src="/logo.png" alt="" className="h-11 w-auto [@media(max-height:760px)]:h-9" />
                  <span className="leading-none">
                    <span className="block text-2xl font-bold tracking-tight text-brand-900 [@media(max-height:760px)]:text-xl">Fermia</span>
                    <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Gérez votre ferme</span>
                  </span>
                </div>
              ) : eyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>
              ) : null}
              <h1
                className={`${programme ? 'mt-4 lg:text-[2.25rem] [@media(max-height:760px)]:mt-2 [@media(max-height:760px)]:lg:text-[1.75rem]' : 'mt-1 lg:text-[1.75rem]'} text-2xl font-bold tracking-tight text-slate-900 lg:leading-tight`}
              >
                {title}
              </h1>
              {subtitle ? <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p> : null}
              <div className={programme ? 'mt-6 lg:mt-8 [@media(max-height:760px)]:lg:mt-4' : 'mt-5 [@media(max-height:820px)]:lg:mt-4'}>{children}</div>
              {footer ? (
                <div
                  className={`space-y-2 text-center text-slate-500 ${programme ? 'mt-6 border-t border-slate-100 pt-5 text-sm [@media(max-height:760px)]:mt-4 [@media(max-height:760px)]:pt-4' : 'mt-4 text-xs leading-relaxed'}`}
                >
                  {footer}
                </div>
              ) : null}
            </div>
            {programme ? (
              <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500 [@media(max-height:760px)]:mt-3">
                <LifeBuoy className="h-3.5 w-3.5" /> Code oublié ou compte bloqué : contactez l’administrateur du programme
              </p>
            ) : null}
            {programme ? (
              <p className="mt-2 text-center text-[11px] text-slate-500">Version {__APP_VERSION__}
              </p>
            ) : null}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** Fermia leaf, name and the « Marché » pill, on navy. */
function MarketBrand() {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/fermia-leaf.svg" alt="" className="h-8 w-8" />
      <span className="text-xl font-bold tracking-tight text-white">Fermia</span>
      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200 ring-1 ring-inset ring-white/15">
        Marché
      </span>
    </span>
  );
}

/** Market sign-in and sign-up: the programme's field photo, the Market promise over it. */
const MARKET_POINTS = [
  { icon: Egg, title: 'Volaille, œufs, carcasses', text: 'En stock ou en précommande' },
  { icon: CalendarClock, title: 'Précommande', text: 'Réservez les lots bientôt prêts' },
  { icon: Truck, title: 'Retrait ou livraison', text: 'Assurés par la ferme elle-même' },
  { icon: HandCoins, title: 'Paiement direct', text: 'Vous payez la ferme, sans intermédiaire' },
] as const;

/** Market sign-in and sign-up: the programme's field photo, the Market promise centred over it. */
function MarketAside() {
  return (
    <aside className="relative hidden h-screen overflow-hidden bg-brand-950 text-white lg:block">
      <img src="/login-poufa.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[30%_30%]" />
      {/* Darker on the left, where the text sits; the photo stays readable on the right. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-brand-950/95 via-brand-950/75 to-brand-950/25" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-brand-950/90 to-transparent" />
      <div className="relative flex h-full flex-col p-10 xl:p-14 [@media(max-height:780px)]:p-7">
        <MarketBrand />

        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center [@media(max-height:780px)]:py-5">
          <div className="max-w-xl">
            <p className="flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">
              <span className="h-px w-8 bg-emerald-300" />
              Marché Fermia
              <span className="h-px w-8 bg-emerald-300" />
            </p>
            <h2 className="mt-4 text-balance text-[clamp(2rem,3.2vw,3.25rem)] font-bold leading-[1.05] tracking-tight [@media(max-height:780px)]:mt-3">
              Achetez en direct
              <span className="block bg-gradient-to-r from-amber-200 to-emerald-200 bg-clip-text text-transparent">aux fermes du Gabon.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-brand-50/85 xl:text-lg [@media(max-height:780px)]:mt-3 [@media(max-height:780px)]:text-sm">
              Hôtels, restaurants et particuliers commandent auprès de fermes vérifiées du programme POUFA.
            </p>
          </div>

          <ul className="mt-8 grid w-full max-w-xl grid-cols-2 gap-3 text-left [@media(max-height:780px)]:mt-5 [@media(max-height:780px)]:gap-2">
            {MARKET_POINTS.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex items-start gap-3 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-inset ring-white/12 backdrop-blur-sm [@media(max-height:780px)]:p-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 ring-1 ring-emerald-300/30">
                  <Icon className="h-[18px] w-[18px] text-emerald-200" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug">{title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-brand-100/80">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-center justify-center gap-3 border-t border-white/15 pt-5 text-sm font-medium text-white/80 [@media(max-height:780px)]:pt-4">
          Plateforme propulsée par
          <span className="rounded-lg bg-[#f6f3ee] px-3 py-1.5 shadow-lg shadow-black/30">
            <img src="/okoume-labs.webp" alt="Okoumé Labs" className="h-5 w-auto" />
          </span>
        </p>
      </div>
    </aside>
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
          Plateforme propulsée par
          {/* The wordmark is dark green on cream: it keeps its own light plate over the photo. */}
          <span className="rounded-lg bg-[#f6f3ee] px-3 py-1.5 shadow-lg shadow-black/30">
            <img src="/okoume-labs.webp" alt="Okoumé Labs" className="h-6 w-auto" />
          </span>
        </p>
      </div>
    </aside>
  );
}
