import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Download, LayoutGrid, LogIn, Maximize2, Menu, Presentation as PresentationIcon, Search, X } from 'lucide-react';
import { API_DOCS_URL, PDF_URL } from './data';
import { PrintDeck, Presentation, STAGE_H, STAGE_W, buildSlides, type Slide } from './Presentation';

/** Below this width the slide is laid out for a phone (its compact render) instead of a scaled 16:9 stage. */
const COMPACT_BELOW = 640;

/** Lower-case, accent-free text for the search. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Width of an element, followed on resize. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** A slide scaled to the width of its column, 16:9. */
function Stage({ slide, children }: { slide: Slide; children?: ReactNode }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const compact = w > 0 && w < COMPACT_BELOW;
  const scale = w / STAGE_W;
  return (
    <div ref={ref} className="relative overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_-12px_rgba(12,35,49,0.35)] ring-1 ring-black/5">
      {compact ? (
        <div aria-live="polite">{slide.render(true)}</div>
      ) : (
        <div style={{ height: w ? STAGE_H * scale : undefined, aspectRatio: w ? undefined : '16 / 9' }} aria-live="polite">
          {w ? (
            <div style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }} className="overflow-hidden">
              {slide.render(false)}
            </div>
          ) : null}
        </div>
      )}
      {children}
    </div>
  );
}

/** Thumbnail of a slide for the overview, rendered only once it scrolls into view. */
function Thumb({ slide }: { slide: Slide }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return (
    <div ref={ref} className="pointer-events-none relative aspect-video overflow-hidden bg-white" aria-hidden>
      {seen && w ? (
        <div style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${w / STAGE_W})`, transformOrigin: 'top left' }} className="overflow-hidden">
          {slide.render(false)}
        </div>
      ) : null}
    </div>
  );
}

interface Group {
  section: string;
  items: Array<{ slide: Slide; index: number }>;
}

function SideList({ groups, current, onPick }: { groups: Group[]; current: number; onPick: (i: number) => void }) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);
  if (groups.length === 0) return <p className="px-4 py-6 text-sm text-slate-500">Aucune page ne correspond à la recherche.</p>;
  return (
    <div className="space-y-5 pb-6">
      {groups.map((g) => (
        <div key={g.section}>
          <p className="flex items-baseline justify-between px-4 text-[13px] font-bold uppercase tracking-[0.14em] text-amber-800">
            {g.section} <span className="text-[11px] font-medium tracking-normal text-slate-500">{g.items.length}</span>
          </p>
          <ul className="mt-1.5 space-y-0.5 px-2">
            {g.items.map(({ slide, index }) => {
              const active = index === current;
              return (
                <li key={slide.id}>
                  <button
                    type="button"
                    ref={active ? activeRef : undefined}
                    onClick={() => onPick(index)}
                    aria-current={active ? 'page' : undefined}
                    className={
                      'flex w-full items-baseline gap-3 rounded-lg px-3 py-1.5 text-left text-[15px] transition-colors ' +
                      (active ? 'bg-brand-900 font-medium text-white' : 'text-slate-700 hover:bg-white hover:text-slate-950')
                    }
                  >
                    <span className={'w-6 shrink-0 text-right text-[13px] font-bold tabular-nums ' + (active ? 'text-amber-300' : 'text-slate-500')}>{index + 1}</span>
                    <span className="min-w-0">{slide.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Overview({ groups, current, onPick }: { groups: Group[]; current: number; onPick: (i: number) => void }) {
  return (
    <div className="space-y-10">
      {groups.map((g) => (
        <section key={g.section}>
          <h2 className="text-2xl font-bold tracking-tight text-brand-900">{g.section}</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {g.items.map(({ slide, index }) => (
              <li key={slide.id}>
                <button
                  type="button"
                  onClick={() => onPick(index)}
                  className={'block w-full overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ' + (index === current ? 'border-amber-500 ring-2 ring-amber-400' : 'border-slate-200')}
                >
                  <Thumb slide={slide} />
                  <span className="flex items-baseline gap-2 border-t border-slate-100 px-3 py-2.5 text-[15px] text-slate-800">
                    <b className="tabular-nums text-amber-800">{index + 1}</b> <span className="truncate">{slide.label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Public, institutional guide to the platform, read page by page like a presentation. No login: only demo data is shown. */
export function GuidePage() {
  const slides = useMemo(buildSlides, []);
  const [params, setParams] = useSearchParams();
  const presenting = params.get('present') === '1';
  const printing = presenting && params.get('print') === '1';
  const overview = params.get('vue') === '1';
  const pageParam = Number(params.get('page'));
  const current = Number.isInteger(pageParam) && pageParam >= 1 && pageParam <= slides.length ? pageParam - 1 : 0;
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Guide de la plateforme Fermia · Programme POUFA';
    return () => {
      document.title = prev;
    };
  }, []);

  const groups = useMemo<Group[]>(() => {
    const q = fold(query.trim());
    const map = new Map<string, Group>();
    slides.forEach((slide, index) => {
      if (q && !fold(`${slide.label} ${slide.title} ${slide.section} ${slide.text}`).includes(q)) return;
      const g = map.get(slide.section) ?? { section: slide.section, items: [] };
      g.items.push({ slide, index });
      map.set(slide.section, g);
    });
    return [...map.values()];
  }, [slides, query]);

  const goTo = useCallback(
    (i: number) => {
      const n = Math.min(slides.length - 1, Math.max(0, i));
      setParams({ page: String(n + 1) }, { replace: true });
      setMenuOpen(false);
      topRef.current?.scrollIntoView({ block: 'start' });
    },
    [setParams, slides.length],
  );
  const setOverview = useCallback((on: boolean) => setParams(on ? { page: String(current + 1), vue: '1' } : { page: String(current + 1) }, { replace: true }), [setParams, current]);
  const startPresentation = useCallback(() => setParams({ present: '1', slide: String(current + 1) }), [setParams, current]);
  const stopPresentation = useCallback(() => {
    // The presentation keeps its slide number in the address: come back to that page.
    const n = Number(new URLSearchParams(window.location.search).get('slide'));
    setParams({ page: String(Number.isInteger(n) && n >= 1 ? n : current + 1) });
  }, [setParams, current]);

  useEffect(() => {
    if (presenting) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        if (e.key === 'Escape') (t as HTMLInputElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') (e.preventDefault(), goTo(current + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') (e.preventDefault(), goTo(current - 1));
      else if (e.key === 'g' || e.key === 'G') setOverview(!overview);
      else if (e.key === 'f' || e.key === 'F') startPresentation();
      else if (e.key === '/') (e.preventDefault(), searchRef.current?.focus(), setMenuOpen(true));
      else if (e.key === 'Escape' && overview) setOverview(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting, current, goTo, overview, setOverview, startPresentation]);

  if (printing) return <PrintDeck />;

  const slide = slides[current];
  const prev = current > 0 ? slides[current - 1] : null;
  const next = current < slides.length - 1 ? slides[current + 1] : null;
  const progress = ((current + 1) / slides.length) * 100;
  const kicker = slide.section === slide.title ? slide.section : `${slide.section} · ${slide.label}`;

  return (
    <div className="min-h-screen bg-[#f4f2ec] text-slate-800">
      <a href="#contenu" className="sr-only z-[60] rounded bg-white px-3 py-2 text-brand-800 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Aller au contenu</a>

      <header className="sticky top-0 z-40 border-b-[3px] border-amber-400 bg-brand-950 text-white">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-controls="sommaire" className="rounded-lg p-2 hover:bg-white/10 lg:hidden">
              {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
              <span className="sr-only">Sommaire</span>
            </button>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight tracking-tight sm:text-xl">Fermia<span className="hidden sm:inline"> — Guide de la plateforme</span><span className="sm:hidden"> · Guide</span></p>
              <p className="hidden truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300 sm:block">Présentation · Programme POUFA · MAEDR</p>
            </div>
          </div>
          <nav aria-label="Actions" className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setOverview(!overview)}
              aria-pressed={overview}
              className={'inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ring-1 ring-white/30 hover:bg-white/10 sm:px-4 ' + (overview ? 'bg-white/15' : '')}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden /> <span className="hidden md:inline">Vue d’ensemble</span>
            </button>
            <button type="button" onClick={startPresentation} className="hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-white/30 hover:bg-white/10 md:inline-flex">
              <PresentationIcon className="h-4 w-4" aria-hidden /> Présenter
            </button>
            <a href={PDF_URL} download className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-3 py-2 text-sm font-bold text-brand-950 hover:bg-amber-300 sm:px-4">
              <Download className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Télécharger le PDF</span>
            </a>
            <Link to="/login" className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ring-1 ring-white/30 hover:bg-white/10 xl:inline-flex">
              <LogIn className="h-4 w-4" aria-hidden /> Connexion
            </Link>
          </nav>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside
          id="sommaire"
          className={
            'border-r border-black/5 bg-[#ebe8df] lg:sticky lg:top-[67px] lg:block lg:h-[calc(100vh-67px)] lg:overflow-y-auto ' +
            (menuOpen ? 'fixed inset-x-0 bottom-0 top-[63px] z-30 block overflow-y-auto' : 'hidden')
          }
        >
          <div className="sticky top-0 z-10 bg-[#ebe8df] p-3">
            <label className="relative block">
              <span className="sr-only">Rechercher dans le guide</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher (titre, texte)…"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
          </div>
          <nav aria-label="Pages du guide">
            <SideList groups={groups} current={current} onPick={goTo} />
          </nav>
        </aside>

        <main id="contenu" className="min-w-0 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
          <div ref={topRef} className="scroll-mt-24" />
          {overview ? (
            <>
              <div className="mb-6 flex items-center justify-between gap-4">
                <h1 className="text-3xl font-bold tracking-tight text-brand-900">Vue d’ensemble</h1>
                <button type="button" onClick={() => setOverview(false)} className="rounded-full px-4 py-2 text-sm font-semibold text-brand-800 ring-1 ring-brand-300 hover:bg-white">Revenir à la page {current + 1}</button>
              </div>
              <Overview
                groups={groups}
                current={current}
                onPick={(i) => {
                  setParams({ page: String(i + 1) }, { replace: true });
                  topRef.current?.scrollIntoView({ block: 'start' });
                }}
              />
            </>
          ) : (
            <div className="mx-auto max-w-[78rem]">
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-amber-800">{kicker}</p>
                  <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight text-brand-900 sm:text-[40px]">{slide.title}</h1>
                </div>
                <p className="shrink-0 pb-1 text-xl font-bold tabular-nums text-slate-500" aria-label={`Page ${current + 1} sur ${slides.length}`}>
                  {current + 1} / {slides.length}
                </p>
              </div>

              <div className="mt-4">
                <Stage key={slide.id} slide={slide}>
                  <button
                    type="button"
                    onClick={startPresentation}
                    className="absolute bottom-3 right-3 hidden items-center gap-2 rounded-full bg-brand-950/85 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur hover:bg-brand-950 sm:inline-flex"
                  >
                    <Maximize2 className="h-4 w-4" aria-hidden /> Agrandir
                  </button>
                </Stage>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10" aria-hidden>
                <div className="h-full bg-[linear-gradient(90deg,#009e60_0_33.3%,#fcd116_33.3%_66.6%,#3a75c4_66.6%_100%)] transition-[width] duration-300" style={{ width: `${progress}%`, backgroundSize: `${(100 / progress) * 100}% 100%` }} />
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {prev ? (
                  <button type="button" onClick={() => goTo(current - 1)} className="group rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-left hover:border-brand-300">
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Précédente</span>
                    <span className="mt-0.5 block truncate text-lg font-bold text-brand-900 group-hover:text-brand-700">{prev.label}</span>
                  </button>
                ) : <span className="hidden sm:block" />}
                {next ? (
                  <button type="button" onClick={() => goTo(current + 1)} className="group rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-right hover:border-brand-300">
                    <span className="flex items-center justify-end gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">Suivante <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
                    <span className="mt-0.5 block truncate text-lg font-bold text-brand-900 group-hover:text-brand-700">{next.label}</span>
                  </button>
                ) : null}
              </div>

              {slide.notes ? (
                <section aria-labelledby="ce-que-dit" className="mt-6 rounded-2xl border border-slate-200 border-l-[6px] border-l-amber-500 bg-white px-5 py-6 sm:px-8 [overflow-wrap:anywhere]">
                  <h2 id="ce-que-dit" className="text-[15px] font-bold uppercase tracking-[0.18em] text-amber-800">Ce que dit cette page</h2>
                  <div className="mt-4 [&_section]:border-t-0 [&_section]:pt-0">{slide.notes()}</div>
                </section>
              ) : null}
            </div>
          )}

          <footer className="mx-auto mt-10 max-w-[78rem] pb-6 text-center text-[13px] leading-relaxed text-slate-500">
            Fermia · Programme POUFA · République gabonaise. Les fermes, exploitants et montants des captures viennent d’un jeu de démonstration ; les numéros de téléphone sont masqués.{' '}
            <a href={API_DOCS_URL} className="underline underline-offset-2 hover:text-brand-800">Documentation de l’API</a>.
            <span className="hidden lg:inline"> Raccourcis : ← → pour naviguer, G pour la vue d’ensemble, F pour agrandir, / pour chercher.</span>
          </footer>
        </main>
      </div>

      {presenting ? <Presentation onExit={stopPresentation} /> : null}
    </div>
  );
}
