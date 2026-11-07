import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, Download, FileDown, LogIn, Menu, Presentation as PresentationIcon, X } from 'lucide-react';
import { API_DOCS_URL, APK_URL, PDF_URL, PLATFORM_URL, CHAPTERS, PARTS, SCREEN_COUNT } from './data';
import { FaqSection, HowToReadSection, RoutesSection, ChapterSection, PortabilitySection, RequirementsSection, SecuritySection, SynthesisSection } from './sections';
import { ChannelCards } from './parts';
import { PrintDeck, Presentation } from './Presentation';

interface TocItem {
  id: string;
  title: string;
  group: string;
}

const TOC: TocItem[] = [
  { id: 'lire', title: 'Comment lire ce guide', group: 'Repères' },
  { id: 'parcours', title: 'Parcours par acteur', group: 'Repères' },
  { id: 'synthese', title: 'Synthèse du cahier des charges', group: 'Synthèse' },
  { id: 'exigences', title: 'Matrice des 68 exigences', group: 'Synthèse' },
  { id: 'portabilite', title: 'Mise en œuvre et portabilité', group: 'Synthèse' },
  { id: 'securite', title: 'Sécurité et données', group: 'Synthèse' },
  ...PARTS.flatMap((part) => CHAPTERS.filter((c) => c.part === part).map((c) => ({ id: c.id, title: c.t, group: part }))),
  { id: 'faq', title: 'Questions fréquentes', group: 'FAQ' },
];

/** Section currently under the top of the viewport (scroll-spy). */
function useActiveSection(): string {
  const [active, setActive] = useState(TOC[0].id);
  useEffect(() => {
    const els = TOC.map((t) => document.getElementById(t.id)).filter((e): e is HTMLElement => Boolean(e));
    const onScroll = () => {
      const y = window.scrollY + 140;
      let cur = els[0]?.id ?? TOC[0].id;
      for (const el of els) if (el.offsetTop <= y) cur = el.id;
      setActive(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return active;
}

function TocList({ active, onPick }: { active: string; onPick?: () => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, TocItem[]>();
    for (const t of TOC) map.set(t.group, [...(map.get(t.group) ?? []), t]);
    return [...map.entries()];
  }, []);
  return (
    <div className="space-y-4">
      {groups.map(([group, items]) => (
        <div key={group}>
          <p className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{group}</p>
          <ul className="mt-1">
            {items.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  onClick={onPick}
                  aria-current={active === t.id ? 'location' : undefined}
                  className={
                    'block border-l-2 px-3 py-1.5 text-sm transition-colors ' +
                    (active === t.id ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800' : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900')
                  }
                >
                  {t.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Public, institutional guide to the platform. No login: only demo data is shown. */
export function GuidePage() {
  const [params, setParams] = useSearchParams();
  const presenting = params.get('present') === '1';
  const printing = presenting && params.get('print') === '1';
  const [menuOpen, setMenuOpen] = useState(false);
  const active = useActiveSection();

  useEffect(() => {
    const prev = document.title;
    document.title = 'Guide de la plateforme · Programme POUFA';
    return () => {
      document.title = prev;
    };
  }, []);

  const startPresentation = useCallback(() => setParams({ present: '1' }), [setParams]);
  const stopPresentation = useCallback(() => setParams({}), [setParams]);
  let n = 0;

  if (printing) return <PrintDeck />;
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <a href="#contenu" className="sr-only z-[60] rounded bg-white px-3 py-2 text-brand-800 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Aller au contenu</a>
      <div aria-hidden className="h-1.5 bg-gradient-to-r from-emerald-600 via-amber-400 to-sky-600 print:hidden" />

      <header className="relative overflow-hidden bg-brand-950 text-white">
        <img src="/login-poufa.webp" alt="" aria-hidden width={1600} height={900} className="absolute inset-0 h-full w-full object-cover opacity-30 print:hidden" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-brand-950/60 via-brand-950/80 to-brand-950" />
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pb-14">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <img src="/republique-gabonaise.webp" alt="République gabonaise" className="h-12 w-auto rounded-md bg-white p-0.5 sm:h-16" />
              <img src="/maedr-logo-full.webp" alt="Ministère de l’Agriculture, de l’Élevage et du Développement rural" className="h-12 w-12 rounded-md bg-white object-contain p-0.5 sm:h-16 sm:w-16" />
              <img src="/men-logo.webp" alt="Ministère de l’Économie numérique, de la Digitalisation et de l’Innovation" className="h-12 w-12 rounded-md bg-white object-contain p-0.5 sm:h-16 sm:w-16" />
              <p className="hidden border-l border-white/30 pl-4 text-xl font-bold uppercase tracking-[0.2em] sm:block">POUFA</p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={startPresentation} className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-brand-950 hover:bg-amber-300">
                <PresentationIcon className="h-4 w-4" aria-hidden /> Mode présentation
              </button>
              <a href={PDF_URL} download className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium ring-1 ring-white/25 hover:bg-white/20">
                <Download className="h-4 w-4" aria-hidden /> Présentation (PDF)
              </a>
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium ring-1 ring-white/25 hover:bg-white/20">
                <FileDown className="h-4 w-4" aria-hidden /> Imprimer
              </button>
              <Link to="/login" className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium ring-1 ring-white/25 hover:bg-white/20">
                <LogIn className="h-4 w-4" aria-hidden /> Connexion
              </Link>
            </div>
          </div>
          <div className="mt-10 max-w-4xl lg:mt-14">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-200 sm:text-sm">Programme POUFA · Agri Track 241 · Plateforme Fermia</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Guide de la plateforme</h1>
            <p className="mt-4 max-w-3xl text-base text-brand-100 sm:text-lg">
              Système d’information de suivi technico-économique et de traçabilité de la filière avicole. Chaque écran, expliqué simplement : à quoi il sert, qui l’utilise, et quelles exigences du cahier des charges il couvre.
            </p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-brand-100">
              <div><dt className="sr-only">Version</dt><dd>Novembre 2026</dd></div>
              <div><dt className="sr-only">Langue</dt><dd>Interface en français</dd></div>
              <div><dt className="sr-only">Contenu</dt><dd>{SCREEN_COUNT} écrans annotés</dd></div>
              <div><dt className="sr-only">Audit</dt><dd>Audit v6 du 7 novembre 2026</dd></div>
            </dl>
            <div className="mt-6 max-w-5xl"><ChannelCards web={PLATFORM_URL} apk={APK_URL} dark /></div>
            <p className="mt-4 text-[17px] print:hidden"><a href={API_DOCS_URL} className="underline decoration-white/40 underline-offset-4 hover:decoration-white">Documentation de l’API (Swagger)</a></p>
          </div>
        </div>
      </header>

      {/* Mobile / tablet: collapsible chapter menu. */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden lg:hidden">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="menu-chapitres"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-brand-900"
        >
          <span className="flex items-center gap-2">{menuOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />} Chapitres</span>
          <span className="flex min-w-0 items-center gap-1 font-normal text-slate-500"><span className="truncate">{TOC.find((t) => t.id === active)?.title}</span><ChevronDown className={'h-4 w-4 shrink-0 transition-transform ' + (menuOpen ? 'rotate-180' : '')} aria-hidden /></span>
        </button>
        {menuOpen ? (
          <nav id="menu-chapitres" aria-label="Chapitres" className="max-h-[70vh] overflow-y-auto border-t border-slate-100 py-3">
            <TocList active={active} onPick={() => setMenuOpen(false)} />
          </nav>
        ) : null}
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:px-8 lg:py-12">
        <aside className="hidden print:hidden lg:block">
          <nav aria-label="Sommaire" className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-2">
            <TocList active={active} />
          </nav>
        </aside>
        <main id="contenu" className="min-w-0 space-y-14 [overflow-wrap:anywhere]">
          <HowToReadSection />
          <RoutesSection />
          <SynthesisSection />
          <RequirementsSection />
          <PortabilitySection />
          <SecuritySection />
          {PARTS.map((part) => (
            <div key={part} className="space-y-14">
              <p className="border-b-2 border-brand-700 pb-2 text-sm font-bold uppercase tracking-[0.25em] text-brand-700">{part}</p>
              {CHAPTERS.filter((c) => c.part === part).map((c) => (
                <ChapterSection key={c.id} chapter={c} number={++n} />
              ))}
            </div>
          ))}
          <FaqSection />
        </main>
      </div>

      <footer className="border-t border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
        Programme POUFA · République gabonaise · Les fermes, exploitants et montants des captures sont ceux d’un jeu de démonstration ; les numéros de téléphone sont masqués.
      </footer>

      {presenting ? <Presentation onExit={stopPresentation} /> : null}
    </div>
  );
}
