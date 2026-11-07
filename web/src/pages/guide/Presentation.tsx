import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { API_DOCS_URL, APK_URL, AUDIT_LABEL, CHAPTERS, CHAPTER_BLOCKS, FAQ, PLATFORM_URL, SCREEN_COUNT, SUMMARY, cdcFor } from './data';
import { PIPELINE, PRACTICES, REDEPLOY, SECURITY } from './practices';
import { ChannelCards, ScreenFigure } from './parts';
import { ChapterSection, FaqSection, PortabilitySection, RequirementsSection, RoutesSection, SecuritySection, SynthesisSection, HowToReadSection, Flow } from './sections';
import type { Chapter, Figure } from './types';

export interface Slide {
  id: string;
  /** Short label: side list, counter, aria. */
  label: string;
  /** Group of the side list (Introduction, Cahier des charges, a part of the guide...). */
  section: string;
  /** Headline shown above the slide in the guide viewer. */
  title: string;
  /** Plain text used by the guide's search. */
  text: string;
  /** « Ce que dit cette page »: the long-form content shown under the slide in the guide viewer. */
  notes?: () => ReactNode;
  render: (compact: boolean) => ReactNode;
}

export const STAGE_W = 1280;
export const STAGE_H = 720;
const COMPACT_BELOW = 820;

const TOTAL = SUMMARY.decomptes.lignes['Total'];
const MVP = SUMMARY.decomptes.lignes['Obligatoire MVP'];

/**
 * Text sizes: the stage is 1280 x 720 and is scaled to the screen, so 20 px here is 30 px on a 1920 x 1080 projector.
 * Body text is never below 18 px on the stage.
 */
function Frame({ kicker, title, children, compact }: { kicker?: string; title: string; children: ReactNode; compact: boolean }) {
  return (
    <div className={compact ? 'flex flex-col gap-4 p-5' : 'flex h-full flex-col gap-4 px-14 py-10'}>
      <div>
        {kicker ? <p className="text-base font-bold uppercase tracking-[0.2em] text-amber-700">{kicker}</p> : null}
        <h2 className={(compact ? 'text-2xl' : 'text-[44px] leading-tight') + ' mt-1 font-bold tracking-tight text-brand-900'}>{title}</h2>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function Cover({ compact }: { compact: boolean }) {
  return (
    <div className="relative flex h-full min-h-[34rem] flex-col justify-between overflow-hidden bg-brand-950 text-white">
      <img src="/login-poufa.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-40" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-brand-950 via-brand-950/70 to-brand-950/30" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-600 via-amber-400 to-sky-600" />
      <div className={'relative flex flex-wrap items-center gap-4 ' + (compact ? 'p-5' : 'px-14 pt-10')}>
        <img src="/maedr-logo-full.webp" alt="Ministère de l’Agriculture, de l’Élevage et du Développement rural" className={(compact ? 'h-14 w-14' : 'h-24 w-24') + ' rounded-lg bg-white object-contain p-1'} />
        <img src="/men-logo.webp" alt="Ministère de l’Économie numérique, de la Digitalisation et de l’Innovation" className={(compact ? 'h-14 w-14' : 'h-24 w-24') + ' rounded-lg bg-white object-contain p-1'} />
      </div>
      <div className={'relative ' + (compact ? 'p-5' : 'px-14 pb-14')}>
        <p className="text-lg font-bold uppercase tracking-[0.25em] text-amber-200">Programme POUFA · Agri Track 241</p>
        <h1 className={(compact ? 'text-3xl' : 'text-[56px]') + ' mt-3 max-w-5xl font-bold leading-[1.1] tracking-tight'}>
          Système d’information de suivi technico-économique et de traçabilité de la filière avicole
        </h1>
        <p className={(compact ? 'text-lg' : 'text-2xl') + ' mt-5 max-w-4xl text-brand-100'}>Plateforme Fermia : {SCREEN_COUNT} écrans, couverture du cahier des charges, sécurité et mise en œuvre.</p>
        <p className="mt-6 text-lg text-brand-200">République gabonaise · Novembre 2026 · {AUDIT_LABEL}</p>
        <p className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xl font-semibold text-white">
          <span>Web : {PLATFORM_URL.replace('https://', '')}</span>
          <span className="rounded-lg bg-amber-400 px-3 py-1 text-brand-950">Android : fermia.greenleaves.ga/apk/fermia.apk</span>
        </p>
      </div>
    </div>
  );
}

function ReadSlide({ compact }: { compact: boolean }) {
  const steps = [
    ['1', 'Un écran', 'Chaque diapositive montre un écran réel de la plateforme.'],
    ['2', 'Des repères', 'Les numéros sur l’image sont expliqués à droite.'],
    ['3', 'Le CDC', 'Le badge « Répond au CDC n° » dit quelles exigences l’écran couvre.'],
    ['4', 'La preuve', 'La synthèse et la matrice disent ce qui est couvert, partiel ou absent.'],
  ];
  return (
    <Frame kicker="Repères" title="Comment suivre cette présentation" compact={compact}>
      <ol className={'grid gap-4 ' + (compact ? '' : 'grid-cols-2')}>
        {steps.map(([n, t, d]) => (
          <li key={n} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xl font-bold text-white">{n}</span>
            <span><b className="block text-2xl text-brand-900">{t}</b><span className="text-xl leading-snug text-slate-700">{d}</span></span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function SynthesisSlide({ compact }: { compact: boolean }) {
  const kpi = [
    { v: TOTAL[0], l: 'exigences', c: 'text-brand-900' },
    { v: TOTAL[1], l: 'couvertes', c: 'text-emerald-700' },
    { v: TOTAL[3], l: 'partielles', c: 'text-amber-700' },
    { v: TOTAL[4], l: 'non couvertes', c: 'text-red-700' },
  ];
  return (
    <Frame kicker="Cahier des charges · Synthèse" title="Ce que la plateforme couvre" compact={compact}>
      <div className={compact ? 'space-y-4' : 'grid grid-cols-[1fr_1.2fr] gap-10'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {kpi.map((k) => (
              <div key={k.l} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className={'text-6xl font-bold tabular-nums ' + k.c}>{k.v}</p>
                <p className="text-xl text-slate-700">{k.l}</p>
              </div>
            ))}
          </div>
          <p className="rounded-2xl border-l-8 border-emerald-600 bg-emerald-50 p-4 text-2xl leading-snug text-slate-900">
            <b>MVP : {MVP[1]} sur {MVP[0]} conformes</b>, {MVP[3]} partielles, {MVP[5]} à tester (recette ANINF du 7 nov. 2026, corrections en cours).
          </p>
        </div>
        <table className="w-full self-start border-collapse text-xl">
          <thead>
            <tr className="text-left text-base uppercase tracking-wide text-slate-600">
              <th className="py-2">Priorité</th><th className="text-right">Total</th><th className="text-right">Couv.</th><th className="text-right">Part.</th><th className="text-right">Non</th><th className="text-right">À tester</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(SUMMARY.decomptes.lignes).map(([k, v]) => (
              <tr key={k} className={'border-t border-slate-300 ' + (k === 'Total' ? 'font-bold' : '')}>
                <td className="py-2.5 font-medium text-slate-900">{k}</td>
                <td className="text-right tabular-nums">{v[0]}</td><td className="text-right tabular-nums">{v[1]}</td><td className="text-right tabular-nums">{v[3]}</td><td className="text-right tabular-nums">{v[4]}</td><td className="text-right tabular-nums">{v[5]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

function ReservesSlide({ compact }: { compact: boolean }) {
  return (
    <Frame kicker="Cahier des charges · Transparence" title="Ce qui reste à faire, sans détour" compact={compact}>
      <div className="space-y-4">
        {SUMMARY.mvpPartiels.map((p) => (
          <div key={p.num} className="rounded-2xl border-l-8 border-amber-500 bg-amber-50 p-5">
            <p className="text-2xl font-bold text-slate-900">MVP, n° {p.num} : {p.intitule}</p>
            <p className="mt-1 text-xl leading-snug text-slate-800">{p.texte}</p>
          </div>
        ))}
        <ul className="list-disc space-y-2 pl-6 text-xl leading-snug text-slate-800 marker:text-amber-600">
          {SUMMARY.reservesHonnetes.slice(1, 3).map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
    </Frame>
  );
}

function FactCards({ items, compact }: { items: Array<{ title: string; text: string }>; compact: boolean }) {
  return (
    <ul className={'grid gap-3 ' + (compact ? '' : 'grid-cols-2')}>
      {items.map((p) => (
        <li key={p.title} className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[22px] font-bold leading-tight text-brand-900">{p.title}</p>
          <p className="mt-1 text-[19px] leading-snug text-slate-700">{p.text}</p>
        </li>
      ))}
    </ul>
  );
}

function ChapterSlide({ chapter, number, fig, index, compact }: { chapter: Chapter; number: number; fig: Figure; index: number; compact: boolean }) {
  const { rows } = cdcFor(chapter);
  const intro = index === 0 ? chapter.why : null;
  const crumb = `${chapter.part} › Chapitre ${String(number).padStart(2, '0')}/${CHAPTERS.length}${chapter.figs.length > 1 ? ` · écran ${index + 1}/${chapter.figs.length}` : ''}`;
  const badge = rows.length > 0 ? `Répond au CDC n° ${rows.map((r) => r.num).join(', ')}` : 'Module bonus, au-delà du CDC';
  return (
    <div className={compact ? 'flex flex-col gap-4 p-5' : 'grid h-full grid-cols-[1.5fr_1fr] gap-7 px-9 py-8'}>
      <div className="flex min-w-0 flex-col justify-center gap-3">
        <ScreenFigure fig={fig} large={!compact} eager hideLegend />
        <p className="flex flex-wrap items-center gap-2">
          <b className="rounded-lg bg-brand-700 px-3 py-1.5 text-xl text-white">{badge}</b>
        </p>
      </div>
      <div className="min-h-0 overflow-hidden">
        <p className="text-base font-bold uppercase tracking-[0.12em] text-amber-700">{crumb}</p>
        <h2 className="mt-1 text-[34px] font-bold leading-tight text-brand-900">{chapter.t}</h2>
        {chapter.who ? <p className="mt-2 text-[19px] leading-snug text-slate-800"><b>Qui : </b>{chapter.who}</p> : null}
        <p className="mt-2 text-[19px] font-semibold leading-snug text-brand-800">{fig.cap}</p>
        {intro ? <p className="mt-2 text-[19px] leading-snug text-slate-800">{intro}</p> : null}
        <ol className="mt-3 space-y-2">
          {fig.m.map((m, i) => (
            <li key={i} className="flex gap-3 text-[19px] leading-snug">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-base font-bold text-white">{i + 1}</span>
              <span><b className="text-slate-900">{m.title}.</b> <span className="text-slate-700">{m.desc}</span></span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function RoleSlide({ compact }: { compact: boolean }) {
  const table = CHAPTER_BLOCKS.role.before?.find((b) => b.kind === 'table');
  return (
    <Frame kicker="Prise en main" title="Qui fait quoi ?" compact={compact}>
      {table && table.kind === 'table' ? (
        <div className="space-y-3">
          {table.rows.map((r) => (
            <div key={r[0]} className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-2xl font-bold text-brand-800">{r[0]} <span className="text-lg font-normal text-slate-600">· {r[1]}</span></p>
              <p className="mt-1 text-xl text-slate-800">{r[2]}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Frame>
  );
}

function Closing({ compact }: { compact: boolean }) {
  const links = [
    { label: 'Plateforme en ligne', href: PLATFORM_URL, text: PLATFORM_URL.replace('https://', '') },
    { label: 'Application Android (APK)', href: APK_URL, text: 'fermia.greenleaves.ga/apk/fermia.apk' },
    { label: 'Documentation de l’API', href: `${PLATFORM_URL}${API_DOCS_URL}`, text: 'fermia.greenleaves.ga/api/docs/' },
    { label: 'Guide complet', href: `${PLATFORM_URL}/guide`, text: 'fermia.greenleaves.ga/guide' },
  ];
  return (
    <div className={'flex h-full min-h-[30rem] flex-col justify-center bg-brand-950 text-white ' + (compact ? 'p-6' : 'px-20')}>
      <p className="text-lg font-bold uppercase tracking-[0.25em] text-amber-200">Merci de votre attention</p>
      <h2 className={(compact ? 'text-3xl' : 'text-[52px]') + ' mt-3 font-bold tracking-tight'}>Retrouvez la plateforme</h2>
      <div className="mt-6 flex items-center gap-6">
        <img src="/guide/apk-qr.svg" alt="Code QR du téléchargement de l’application Android" width={132} height={132} className="rounded-xl bg-white p-2" />
        <p className="max-w-xl text-2xl leading-snug">Scannez pour installer l’application Android, ou ouvrez la plateforme web dans n’importe quel navigateur.</p>
      </div>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} className="block rounded-2xl border border-white/25 bg-white/10 p-5 hover:bg-white/15" target={l.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
              <span className="block text-base uppercase tracking-widest text-brand-200">{l.label}</span>
              <span className="mt-1 block break-all text-2xl font-semibold">{l.text}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-lg text-brand-200">Programme POUFA · République gabonaise · MAEDR</p>
    </div>
  );
}

function FaqSlide({ compact }: { compact: boolean }) {
  return (
    <Frame kicker="Questions fréquentes" title="Les questions que l’on nous pose" compact={compact}>
      <ul className={'grid gap-3 ' + (compact ? '' : 'grid-cols-2')}>
        {FAQ.slice(0, 6).map((f) => (
          <li key={f.q} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[21px] font-bold leading-tight text-brand-900">{f.q}</p>
            <p className="mt-1 line-clamp-3 text-[18px] leading-snug text-slate-700">{f.a}</p>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

const INTRO = 'Introduction';
const CDC = 'Cahier des charges';
const OPS = 'Sécurité et mise en œuvre';
const END = 'Pour aller plus loin';

export function buildSlides(): Slide[] {
  const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  const slides: Slide[] = [
    {
      id: 'couverture', label: 'Plateforme Fermia', section: INTRO, title: 'Plateforme Fermia · Programme POUFA',
      text: 'Système d’information de suivi technico-économique et de traçabilité de la filière avicole',
      render: (c) => <Cover compact={c} />,
    },
    { id: 'lire', label: 'Comment lire ce guide', section: INTRO, title: 'Comment suivre cette présentation', text: 'écran repères CDC preuve', notes: () => <HowToReadSection />, render: (c) => <ReadSlide compact={c} /> },
    {
      id: 'canaux', label: 'Web et Android', section: INTRO, title: 'Deux canaux : web et Android', text: 'navigateur application Android APK installation hors ligne',
      render: (c) => (
        <Frame kicker="Accès à la plateforme" title="Deux canaux : web et Android" compact={c}>
          <ChannelCards web={PLATFORM_URL} apk={APK_URL} size="lg" />
        </Frame>
      ),
    },
    { id: 'role', label: 'Qui fait quoi', section: INTRO, title: 'Qui fait quoi ?', text: 'rôles acteurs administrateur institution exploitant parcours', notes: () => <RoutesSection />, render: (c) => <RoleSlide compact={c} /> },
    { id: 'synthese', label: 'Synthèse du CDC', section: CDC, title: 'Ce que la plateforme couvre', text: 'synthèse exigences couvertes partielles MVP matrice', notes: () => <><SynthesisSection /><div className="mt-10"><RequirementsSection /></div></>, render: (c) => <SynthesisSlide compact={c} /> },
    { id: 'reserves', label: 'Ce qui reste à faire', section: CDC, title: 'Ce qui reste à faire, sans détour', text: SUMMARY.mvpPartiels.map((p) => p.intitule).join(' ') + ' réserves', render: (c) => <ReservesSlide compact={c} /> },
  ];
  chunk(SECURITY, 6).forEach((items, i, all) =>
    slides.push({
      id: `securite-${i}`, label: all.length > 1 ? `Sécurité (${i + 1}/${all.length})` : 'Sécurité', section: OPS, title: 'Sécurité et protection des données',
      text: items.map((x) => `${x.title} ${x.text}`).join(' '),
      notes: i === 0 ? () => <SecuritySection /> : undefined,
      render: (c) => (
        <Frame kicker={`Sécurité · ${i + 1}/${all.length}`} title="Sécurité et protection des données" compact={c}>
          <FactCards items={items} compact={c} />
        </Frame>
      ),
    }),
  );
  slides.push({
    id: 'pipeline', label: 'De la modification à la sauvegarde', section: OPS, title: 'De la modification à la sauvegarde',
    text: [...PIPELINE, ...PRACTICES.slice(0, 4)].map((x) => `${x.title} ${x.text}`).join(' '),
    render: (c) => (
      <Frame kicker="Mise en œuvre · 1/3" title="De la modification à la sauvegarde" compact={c}>
        <div className="space-y-6">
          <Flow items={PIPELINE} large />
          <FactCards items={PRACTICES.slice(0, 4)} compact={c} />
        </div>
      </Frame>
    ),
  });
  slides.push({
    id: 'pratiques', label: 'Pratiques professionnelles', section: OPS, title: 'Des pratiques professionnelles',
    text: PRACTICES.slice(4, 10).map((x) => `${x.title} ${x.text}`).join(' '),
    render: (c) => (
      <Frame kicker="Mise en œuvre · 2/3" title="Des pratiques professionnelles" compact={c}>
        <FactCards items={PRACTICES.slice(4, 10)} compact={c} />
      </Frame>
    ),
  });
  slides.push({
    id: 'portabilite', label: 'Déployer ailleurs', section: OPS, title: 'Déployer sur un autre serveur',
    text: 'portabilité Docker serveur ANINF ' + REDEPLOY.map((x) => `${x.title} ${x.text}`).join(' '),
    notes: () => <PortabilitySection />,
    render: (c) => (
      <Frame kicker="Mise en œuvre · 3/3" title="Déployer sur un autre serveur" compact={c}>
        <div className="space-y-5">
          <p className="max-w-4xl text-2xl leading-snug text-slate-800">Aucun lien avec un hébergeur : un serveur Linux avec Docker suffit, par exemple un centre de données de l’État ou de l’ANINF.</p>
          <Flow items={REDEPLOY} numbered large />
        </div>
      </Frame>
    ),
  });
  CHAPTERS.forEach((chapter, ci) => {
    chapter.figs.forEach((fig, index) => {
      const many = chapter.figs.length > 1;
      slides.push({
        id: `${chapter.id}-${fig.k}`,
        label: many ? `${chapter.t} (${index + 1}/${chapter.figs.length})` : chapter.t,
        section: chapter.part,
        title: index === 0 ? chapter.t : fig.cap.replace(/\.$/, ''),
        text: [chapter.t, chapter.who, chapter.why, fig.alt, fig.cap, ...fig.m.map((m) => `${m.title} ${m.desc}`)].filter(Boolean).join(' '),
        notes: () => <ChapterSection chapter={chapter} number={ci + 1} withFigures={false} />,
        render: (c) => <ChapterSlide chapter={chapter} number={ci + 1} fig={fig} index={index} compact={c} />,
      });
    });
  });
  slides.push({ id: 'faq', label: 'Questions fréquentes', section: END, title: 'Questions fréquentes', text: FAQ.map((f) => `${f.q} ${f.a}`).join(' '), notes: () => <FaqSection />, render: (c) => <FaqSlide compact={c} /> });
  slides.push({ id: 'fin', label: 'Retrouver la plateforme', section: END, title: 'Retrouvez la plateforme', text: 'liens plateforme APK API documentation Swagger', render: (c) => <Closing compact={c} /> });
  return slides;
}

/** Every slide, one 16:9 page each, for the PDF export (/guide?present=1&print=1). */
export function PrintDeck() {
  const slides = useMemo(buildSlides, []);
  useEffect(() => {
    document.documentElement.dataset.deckReady = '1';
  }, []);
  return (
    <div className="bg-white">
      <style>{`@page { size: ${STAGE_W}px ${STAGE_H}px; margin: 0 } html, body { margin: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact }`}</style>
      {slides.map((s) => (
        <div key={s.id} data-slide={s.id} style={{ width: STAGE_W, height: STAGE_H, breakAfter: 'page', pageBreakAfter: 'always', overflow: 'hidden' }} className="bg-white text-slate-900">
          {s.render(false)}
        </div>
      ))}
    </div>
  );
}

/** Full-screen presentation: one slide per step, keyboard / touch navigation, 16:9 stage scaled to the screen. */
export function Presentation({ onExit }: { onExit: () => void }) {
  const slides = useMemo(buildSlides, []);
  const [index, setIndex] = useState(() => {
    const n = Number(new URLSearchParams(window.location.search).get('slide'));
    return Number.isInteger(n) && n >= 1 && n <= slides.length ? n - 1 : 0;
  });
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const touch = useRef<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const compact = size.w < COMPACT_BELOW || size.h > size.w;
  const scale = Math.min(size.w / STAGE_W, (size.h - 44) / STAGE_H);

  const go = useCallback((delta: number) => setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + delta))), [slides.length]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') (e.preventDefault(), go(1));
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') (e.preventDefault(), go(-1));
      else if (e.key === 'Home') setIndex(0);
      else if (e.key === 'End') setIndex(slides.length - 1);
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'Escape' && !document.fullscreenElement) onExit();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onExit, slides.length, toggleFullscreen]);

  // Keep the slide number in the address so a refresh or a shared link lands on the same slide.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('present', '1');
    url.searchParams.set('slide', String(index + 1));
    window.history.replaceState(null, '', url);
  }, [index]);

  const slide = slides[index];
  const progress = ((index + 1) / slides.length) * 100;
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Mode présentation"
      className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-slate-900 print:hidden"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="h-1 w-full bg-white/10" aria-hidden><div className="h-full bg-amber-400 transition-[width] duration-300" style={{ width: `${progress}%` }} /></div>
      {compact ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-white" aria-live="polite">{slide.render(true)}</div>
      ) : (
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <div style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'center center', flex: 'none' }} className="overflow-hidden bg-white shadow-2xl" aria-live="polite">
            {slide.render(false)}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 bg-slate-950 px-3 py-1.5 text-sm text-slate-200">
        <button type="button" onClick={onExit} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10"><X className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Quitter (Échap)</span><span className="sm:hidden">Quitter</span></button>
        <p className="truncate" aria-live="polite">{slide.label}</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Diapositive précédente" className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
          <span className="min-w-[4.5rem] text-center font-mono tabular-nums">{index + 1} / {slides.length}</span>
          <button type="button" onClick={() => go(1)} disabled={index === slides.length - 1} aria-label="Diapositive suivante" className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
          <button type="button" onClick={toggleFullscreen} aria-label="Plein écran (F)" className="ml-1 hidden rounded p-1.5 hover:bg-white/10 sm:block"><Maximize2 className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
