import { useState, type ReactNode } from 'react';
import { STATUS_LABEL, STATUS_TONE } from './data';
import type { Block, Figure } from './types';

/** Coverage status as a text badge (never colour alone). */
export function StatusBadge({ statut }: { statut: string }) {
  return (
    <span className={'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[15px] font-semibold ring-1 ring-inset ' + (STATUS_TONE[statut] ?? 'bg-slate-50 text-slate-700 ring-slate-200')}>
      {STATUS_LABEL[statut] ?? statut}
    </span>
  );
}

/** Table that scrolls sideways on a narrow screen instead of squeezing its columns. */
export function TableWrap({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export const thCls = 'bg-slate-50 px-3 py-2 text-left text-[15px] font-semibold uppercase tracking-wide text-slate-600';
export const tdCls = 'border-t border-slate-100 px-3 py-2 align-top text-[17px] text-slate-700';

/** Screenshot with numbered markers; the legend below lists what each marker shows. */
export function ScreenFigure({ fig, large = false, eager = false, hideLegend = false }: { fig: Figure; large?: boolean; eager?: boolean; hideLegend?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <figure className="break-inside-avoid">
      <div className="relative overflow-hidden rounded-xl bg-slate-100 shadow-sm ring-1 ring-slate-300">
        <img
          src={`/guide/${fig.k}.webp`}
          alt={fig.alt}
          width={1440}
          height={900}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="block h-auto w-full"
        />
        {fig.m.map((m, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Repère ${i + 1} : ${m.title}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(i)}
            style={{ left: `${(m.x / 1440) * 100}%`, top: `${(m.y / 900) * 100}%` }}
            className={
              'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-brand-700 font-bold text-white shadow-md transition-transform print:shadow-none ' +
              (large ? 'h-7 w-7 text-[17px] ' : 'h-[clamp(16px,2.4vw,24px)] w-[clamp(16px,2.4vw,24px)] text-[clamp(8px,1.3vw,12px)] ') +
              (active === i ? 'scale-125 bg-accent-600 ring-4 ring-accent-300/60' : '')
            }
          >
            {i + 1}
          </button>
        ))}
      </div>
      {hideLegend ? null : <figcaption className="mt-2 text-[17px] text-slate-600">{fig.cap}</figcaption>}
      <ol hidden={hideLegend} className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {fig.m.map((m, i) => (
          <li
            key={i}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className={'flex gap-2.5 rounded-md px-1.5 py-1 text-[17px] ' + (active === i ? 'bg-accent-50' : '')}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">{i + 1}</span>
            <span>
              <b className="font-semibold text-slate-900">{m.title}.</b> <span className="text-slate-600">{m.desc}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function Blocks({ blocks }: { blocks?: Block[] }) {
  if (!blocks) return null;
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        if (b.kind === 'lead') return <p key={i} className="text-lg leading-relaxed text-slate-700">{b.text}</p>;
        if (b.kind === 'p') return <p key={i} className="text-slate-700">{b.text}</p>;
        if (b.kind === 'callout')
          return (
            <div key={i} className={'rounded-xl border-l-4 p-4 ' + (b.tone === 'warn' ? 'border-accent-500 bg-accent-50' : 'border-brand-500 bg-brand-50')}>
              <p className="text-[15px] font-bold uppercase tracking-widest text-slate-600">{b.title}</p>
              {b.text.map((t, j) => <p key={j} className="mt-1.5 text-[17px] text-slate-700">{t}</p>)}
            </div>
          );
        return (
          <TableWrap key={i} label="Tableau">
            <table className="w-full min-w-[32rem] border-collapse">
              <thead><tr>{b.head.map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className={tdCls + (j === 0 ? ' font-semibold text-slate-900' : '')}>{c}</td>)}</tr>)}</tbody>
            </table>
          </TableWrap>
        );
      })}
    </div>
  );
}

export const INSTALL_STEPS = [
  'Ouvrez le lien, ou scannez le code QR, depuis le téléphone Android.',
  'Autorisez les sources inconnues quand Android le demande.',
  'Installez l’application.',
  'Connectez-vous avec votre téléphone et votre code secret.',
];

/** The two ways in: web application (PWA) and Android application, with a locally generated QR code. */
export function ChannelCards({ web, apk, size = 'md', dark = false }: { web: string; apk: string; size?: 'md' | 'lg'; dark?: boolean }) {
  const big = size === 'lg';
  const card = dark ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-800';
  const sub = dark ? 'text-brand-100' : 'text-slate-600';
  return (
    <div className={'grid gap-4 ' + (big ? 'grid-cols-2' : 'md:grid-cols-2')}>
      <div className={'rounded-2xl border p-5 ' + card}>
        <p className={'font-bold ' + (big ? 'text-[26px]' : 'text-xl')}>Application web</p>
        <p className={'mt-1 leading-snug ' + sub + (big ? ' text-[20px]' : ' text-[17px]')}>Tous les navigateurs, pour tous les rôles. S’installe comme une application et continue de fonctionner sans réseau.</p>
        <a href={web} className={'mt-3 inline-block rounded-lg bg-white px-4 py-2 font-semibold text-brand-800 ' + (big ? 'text-[20px]' : 'text-[17px]')}>{web.replace('https://', '')}</a>
      </div>
      <div className={'rounded-2xl border p-5 ' + card}>
        <p className={'font-bold ' + (big ? 'text-[26px]' : 'text-xl')}>Application mobile Android</p>
        <div className="mt-2 flex gap-4">
          <img src="/guide/apk-qr.svg" alt="Code QR du téléchargement de l’application Android" width={big ? 150 : 112} height={big ? 150 : 112} className="h-auto shrink-0 rounded-lg bg-white p-1.5" />
          <div>
            <a href={apk} className={'inline-block rounded-lg bg-amber-400 px-4 py-2 font-bold text-brand-950 hover:bg-amber-300 ' + (big ? 'text-[20px]' : 'text-[17px]')}>Télécharger l’APK</a>
            <ol className={'mt-2 list-decimal space-y-0.5 pl-5 leading-snug ' + sub + (big ? ' text-[17px]' : ' text-[15px]')}>
              {INSTALL_STEPS.map((t) => <li key={t}>{t}</li>)}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
