import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, ExternalLink, Search } from 'lucide-react';
import {
  API_DOCS_URL,
  ACTORS,
  AUDIT_LABEL,
  CDC_SECTIONS,
  CHAPTERS,
  CHAPTERS_BY_NUM,
  SCREEN_COUNT,
  noScreenReason,
  CHAPTER_BLOCKS,
  FAQ,
  PRIORITIES,
  REQUIREMENTS,
  STATUS_LABEL,
  SUMMARY,
  cdcFor,
} from './data';
import { PIPELINE, PRACTICES, REDEPLOY, SECURITY } from './practices';
import { Blocks, ScreenFigure, StatusBadge, TableWrap, tdCls, thCls } from './parts';
import type { Chapter } from './types';

export function SectionTitle({ n, children, id }: { n?: string; children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="flex items-baseline gap-3 text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">
      {n ? <span className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-[17px] font-semibold text-brand-700">{n}</span> : null}
      <span>{children}</span>
    </h2>
  );
}

const PRIORITY_ROWS = Object.entries(SUMMARY.decomptes.lignes);
const TOTAL = SUMMARY.decomptes.lignes['Total'];
const MVP = SUMMARY.decomptes.lignes['Obligatoire MVP'];

function Kpi({ value, label, tone }: { value: number | string; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className={'text-4xl font-bold tabular-nums ' + tone}>{value}</p>
      <p className="mt-1 text-[17px] text-slate-600">{label}</p>
    </div>
  );
}

/** « Synthèse du cahier des charges »: counts by priority, transverse tables, partial MVP lines and reserves. */
export function SynthesisSection() {
  const cols = ['Total', 'Couvert', 'Partiel léger', 'Partiel', 'Non couvert'];
  const transCols = SUMMARY.transverses['colonnes'] as string[];
  const trans = Object.entries(SUMMARY.transverses).filter(([k]) => k !== 'colonnes') as Array<[string, number[]]>;
  return (
    <section id="synthese" data-part="Synthèse" data-title="Synthèse du cahier des charges" className="scroll-mt-24 space-y-6">
      <SectionTitle n="00">Synthèse du cahier des charges</SectionTitle>
      <p className="max-w-3xl text-lg text-slate-700">
        Ce que le cahier des charges demande, ce que la plateforme couvre, et ce qui reste partiel. {AUDIT_LABEL}.
      </p>
      <p className="text-[17px] text-slate-500">Source : {SUMMARY.source}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi value={TOTAL[0]} label="exigences au cahier des charges" tone="text-brand-900" />
        <Kpi value={TOTAL[1]} label="couvertes" tone="text-emerald-700" />
        <Kpi value={TOTAL[3]} label="partielles" tone="text-accent-700" />
        <Kpi value={TOTAL[4]} label="non couvertes" tone="text-red-700" />
      </div>
      <div className="rounded-xl border-l-4 border-emerald-600 bg-emerald-50 p-4 text-slate-800">
        <b>MVP obligatoire : {MVP[1]} exigences couvertes sur {MVP[0]}</b>, {MVP[3]} partielle, aucune manquante.
      </div>

      <h3 className="text-lg font-semibold text-slate-900">Couverture par priorité</h3>
      <TableWrap label="Couverture par priorité">
        <table className="w-full min-w-[34rem] border-collapse">
          <thead>
            <tr>
              <th className={thCls}>Priorité</th>
              {cols.map((c) => <th key={c} className={thCls + ' text-right'}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {PRIORITY_ROWS.map(([k, v]) => (
              <tr key={k} className={k === 'Total' ? 'bg-slate-50 font-bold' : ''}>
                <td className={tdCls + ' font-semibold text-slate-900'}>{k}</td>
                {v.map((x, i) => <td key={i} className={tdCls + ' text-right tabular-nums'}>{x}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="text-[17px] text-slate-600">
        Lecture : sur les {MVP[0]} exigences obligatoires du MVP, {MVP[1]} sont couvertes et {MVP[3]} est partielle. Les phases ultérieures et évolutives n’étaient pas exigées pour le MVP ; plusieurs sont pourtant déjà livrées (comptabilité, traçabilité, Marché).
      </p>

      <h3 className="text-lg font-semibold text-slate-900">Exigences transverses</h3>
      <TableWrap label="Exigences transverses">
        <table className="w-full min-w-[28rem] border-collapse">
          <thead>
            <tr>
              <th className={thCls}>Thème</th>
              {transCols.map((c) => <th key={c} className={thCls + ' text-right'}>{({ '✅': 'Couvert', '🟠': 'Partiel', '❌': 'Non couvert' } as Record<string, string>)[c] ?? c}</th>)}
            </tr>
          </thead>
          <tbody>
            {trans.map(([k, v]) => (
              <tr key={k}>
                <td className={tdCls + ' font-semibold text-slate-900'}>{k}</td>
                {v.map((x, i) => <td key={i} className={tdCls + ' text-right tabular-nums'}>{x}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="text-[17px] text-slate-600">Frictions du terrain : {SUMMARY.frictions}.</p>

      <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
        <h3 className="text-lg font-semibold text-brand-900">Ce qui change depuis la v5</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[17px] text-slate-700 marker:text-brand-500">
          {SUMMARY.changesV6.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </div>

      <h3 className="text-lg font-semibold text-slate-900">Le partiel du MVP, sans détour</h3>
      <div className="space-y-3">
        {SUMMARY.mvpPartiels.map((p) => (
          <div key={p.num} className="rounded-xl border-l-4 border-accent-500 bg-accent-50 p-4">
            <p className="font-semibold text-slate-900">N° {p.num} : {p.intitule}</p>
            <p className="mt-1 text-[17px] text-slate-700">{p.texte}</p>
          </div>
        ))}
      </div>

      <h3 className="text-lg font-semibold text-slate-900">Réserves honnêtes</h3>
      <ul className="list-disc space-y-1.5 pl-5 text-[17px] text-slate-700 marker:text-accent-500">
        {SUMMARY.reservesHonnetes.map((r) => <li key={r}>{r}</li>)}
      </ul>
      <div className="rounded-xl bg-slate-50 p-4 text-[17px] text-slate-700 ring-1 ring-slate-200">
        <b className="text-slate-900">Légende des statuts.</b>{' '}
        <StatusBadge statut="✅" /> fonctionne et se vérifie dans l’application. <StatusBadge statut="🟠" /> existe, avec une limite expliquée. <StatusBadge statut="❌" /> pas encore livré.
      </div>
    </section>
  );
}

/** The 68 requirements, filterable by priority and status, with a text search. */
export function RequirementsSection() {
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return REQUIREMENTS.filter(
      (r) =>
        (!priority || r.priorite === priority) &&
        (!status || r.statut === status) &&
        (!q || `${r.ref} ${r.num} ${r.titre} ${r.note ?? ''}`.toLowerCase().includes(q)),
    );
  }, [priority, status, query]);
  const selectCls = 'h-10 rounded-lg border border-slate-300 bg-white px-3 text-[17px] text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';
  return (
    <section id="exigences" data-part="Synthèse" data-title="Les 68 exigences" className="scroll-mt-24 space-y-5">
      <SectionTitle n="01">Matrice de traçabilité : exigence, écran, statut</SectionTitle>
      <p className="max-w-3xl text-slate-700">Filtrez par priorité ou par statut, ou cherchez un mot. Chaque ligne renvoie, quand il existe, à l’écran de la plateforme qui la couvre.</p>
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-end">
        <label className="flex-1 text-[17px] font-medium text-slate-700">
          Recherche
          <span className="relative mt-1 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex. vaccination, QR, T2…" className={selectCls + ' w-full pl-9'} />
          </span>
        </label>
        <label className="text-[17px] font-medium text-slate-700">
          Priorité
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls + ' mt-1 block w-full'}>
            <option value="">Toutes</option>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label className="text-[17px] font-medium text-slate-700">
          Statut
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls + ' mt-1 block w-full'}>
            <option value="">Tous</option>
            {(['✅', '🟠', '❌'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      <p role="status" className="text-[17px] text-slate-600">{rows.length} exigence{rows.length > 1 ? 's' : ''} sur {REQUIREMENTS.length}.</p>

      {/* Phone: one card per requirement. */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((r) => (
          <li key={r.num} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[17px] font-semibold text-slate-900"><span className="font-mono text-brand-700">{r.ref}</span> {r.titre}</p>
              <StatusBadge statut={r.statut} />
            </div>
            <p className="mt-1 text-[15px] text-slate-500">{r.priorite}</p>
            {r.note ? <p className="mt-1 text-[15px] text-slate-600">{r.note}</p> : null}
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <TableWrap label="Les 68 exigences du cahier des charges">
          <table className="w-full min-w-[40rem] border-collapse">
            <thead>
              <tr>
                <th className={thCls}>N°</th>
                <th className={thCls}>Exigence</th>
                <th className={thCls}>Priorité</th>
                <th className={thCls}>Statut</th>
                <th className={thCls}>Écran</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const screens = CHAPTERS_BY_NUM.get(String(r.num)) ?? CHAPTERS_BY_NUM.get(r.ref) ?? [];
                return (
                  <tr key={r.num} className="break-inside-avoid">
                    <td className={tdCls + ' font-mono font-semibold text-brand-700'}>{r.ref}</td>
                    <td className={tdCls}>
                      <span className="font-medium text-slate-900">{r.titre}</span>
                      {r.note ? <span className="mt-0.5 block text-[15px] text-slate-500">{r.note}</span> : null}
                    </td>
                    <td className={tdCls + ' whitespace-nowrap'}>{r.priorite}</td>
                    <td className={tdCls}><StatusBadge statut={r.statut} /></td>
                    <td className={tdCls}>
                      {screens.length === 0 ? <span className="text-slate-500">{noScreenReason(r.statut, r.num)}</span> : screens.slice(0, 3).map((s) => (
                        <a key={s.id} href={`#${s.id}`} className="block text-brand-700 underline-offset-2 hover:underline">{s.t}</a>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </section>
  );
}

/** Pipeline and numbered steps drawn with plain flex boxes (no image, prints well). */
export function Flow({ items, numbered = false, large = false }: { items: Array<{ title: string; text: string }>; numbered?: boolean; large?: boolean }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-stretch lg:gap-0">
      {items.map((s, i) => (
        <li key={s.title} className="flex min-w-0 flex-1 items-stretch lg:items-center">
          <div className="h-full min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <p className={'flex items-center gap-2 font-bold text-brand-800 ' + (large ? 'text-[22px]' : 'text-[17px]')}>
              {numbered ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-700 text-[11px] text-white">{i + 1}</span> : null}
              {s.title}
            </p>
            <p className={'mt-1 leading-snug text-slate-700 ' + (large ? 'text-[19px]' : 'text-[15px]')}>{s.text}</p>
          </div>
          {i < items.length - 1 ? <ArrowRight className="mx-1.5 hidden h-4 w-4 shrink-0 text-brand-400 lg:block print:hidden" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

function FactGrid({ items }: { items: Array<{ title: string; text: string; source: string }> }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((p) => (
        <li key={p.title} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><Check className="h-3.5 w-3.5" aria-hidden /></span>
          <div>
            <p className="font-semibold text-slate-900">{p.title}</p>
            <p className="mt-0.5 text-[17px] text-slate-600">{p.text}</p>
            <p className="mt-1 font-mono text-[11px] text-slate-400">{p.source}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PortabilitySection() {
  return (
    <section id="portabilite" data-part="Synthèse" data-title="Mise en œuvre et portabilité" className="scroll-mt-24 space-y-6">
      <SectionTitle n="02">Mise en œuvre professionnelle et portabilité</SectionTitle>
      <p className="max-w-3xl text-lg text-slate-700">
        La plateforme est construite et exploitée selon des pratiques courantes du métier. Elle n’est liée à aucun hébergeur : elle peut être redéployée sur un autre serveur, par exemple un centre de données public ou celui de l’ANINF.
      </p>
      <h3 className="text-lg font-semibold text-slate-900">De la modification à la sauvegarde</h3>
      <Flow items={PIPELINE} />
      <FactGrid items={PRACTICES} />
      <h3 className="text-lg font-semibold text-slate-900">Déployer sur un autre serveur</h3>
      <Flow items={REDEPLOY} numbered />
      <p className="text-[17px] text-slate-500">Schéma de principe. Les secrets et les adresses propres à un serveur ne figurent ni dans le dépôt ni dans ce guide.</p>
      <a
        href={API_DOCS_URL}
        className="flex items-center justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50 p-5 transition hover:border-brand-400 print:hidden"
      >
        <span className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-700 text-white"><BookOpen className="h-5 w-5" aria-hidden /></span>
          <span>
            <span className="block font-semibold text-brand-900">Documentation de l’API</span>
            <span className="block text-[17px] text-slate-600">Description OpenAPI de l’ensemble des routes, consultable avec Swagger. Réservée aux équipes techniques qui intègrent la plateforme.</span>
          </span>
        </span>
        <ExternalLink className="h-5 w-5 shrink-0 text-brand-700" aria-hidden />
      </a>
    </section>
  );
}

export function SecuritySection() {
  return (
    <section id="securite" data-part="Synthèse" data-title="Sécurité et protection des données" className="scroll-mt-24 space-y-5">
      <SectionTitle n="03">Sécurité et protection des données</SectionTitle>
      <p className="max-w-3xl text-slate-700">Ce qui est en place dans le code, vérifié dans le dépôt. Les limites sont dites : le consentement des banques, le verrouillage de compte, le changement de code libre-service et les en-têtes helmet ne sont pas encore livrés (voir la synthèse).</p>
      <FactGrid items={SECURITY} />
      <div className="rounded-xl bg-slate-50 p-4 text-[17px] text-slate-700 ring-1 ring-slate-200">
        <b className="text-slate-900">Ce guide lui-même.</b> Page publique, sans donnée réelle : les captures montrent une ferme de démonstration, avec des numéros masqués. Elle ne charge aucun script ni aucune image externe.
      </div>
    </section>
  );
}

export function ChapterSection({ chapter, number }: { chapter: Chapter; number: number }) {
  const { rows, notes, bonus } = cdcFor(chapter);
  const extra = CHAPTER_BLOCKS[chapter.id];
  return (
    <section id={chapter.id} data-part={chapter.part} data-title={chapter.t} className="scroll-mt-24 space-y-5 border-t border-slate-200 pt-10">
      <p className="text-[15px] font-semibold uppercase tracking-widest text-slate-500">
        {chapter.part} <span aria-hidden>›</span> Chapitre {String(number).padStart(2, '0')} / {CHAPTERS.length}
      </p>
      <h2 className="flex flex-wrap items-baseline gap-3 text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">
        <span className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-[17px] font-semibold text-brand-700">{String(number).padStart(2, '0')}</span>
        {chapter.t}
        {chapter.key ? <span className="rounded-full bg-accent-500 px-2.5 py-0.5 font-sans text-[11px] font-bold uppercase tracking-widest text-white">Atout</span> : null}
      </h2>
      {rows.length > 0 ? (
        <p className="flex flex-wrap items-center gap-2 text-[17px] text-slate-700">
          <b className="rounded-lg bg-brand-700 px-3 py-1 text-white">Répond au CDC n° {rows.map((r) => r.num).join(', ')}</b>
          <span className="text-slate-500">{chapter.figs.length} écran{chapter.figs.length > 1 ? 's' : ''}</span>
        </p>
      ) : (
        <p className="text-[17px] text-slate-500">Module ajouté en bonus, au-delà du cahier des charges. {chapter.figs.length} écran{chapter.figs.length > 1 ? 's' : ''}.</p>
      )}
      <Blocks blocks={extra?.before} />
      {chapter.who ? (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200"><p className="text-[15px] font-bold uppercase tracking-widest text-brand-700">Qui</p><p className="mt-1 text-[17px] text-slate-700">{chapter.who}</p></div>
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200"><p className="text-[15px] font-bold uppercase tracking-widest text-brand-700">Pourquoi</p><p className="mt-1 text-[17px] text-slate-700">{chapter.why}</p></div>
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200"><p className="text-[15px] font-bold uppercase tracking-widest text-brand-700">Comment</p><ol className="mt-1 list-decimal space-y-1 pl-4 text-[17px] text-slate-700">{chapter.how?.map((h) => <li key={h}>{h}</li>)}</ol></div>
        </div>
      ) : null}
      {chapter.figs.map((fig) => (
        <div key={fig.k} className="space-y-2">
          <h3 className="text-base font-semibold text-slate-800">{fig.alt}</h3>
          <ScreenFigure fig={fig} />
        </div>
      ))}
      <Blocks blocks={extra?.after} />
      {chapter.keys.length > 0 ? (
        <div className="rounded-xl border border-slate-200 border-l-4 border-l-brand-600 bg-white p-4">
          <p className="text-[15px] font-bold uppercase tracking-widest text-brand-700">Exigences du CDC couvertes</p>
          {rows.length > 0 ? (
            <div className="mt-2">
              <TableWrap label={`Exigences du CDC couvertes par ${chapter.t}`}>
                <table className="w-full min-w-[30rem] border-collapse">
                  <thead><tr><th className={thCls}>N°</th><th className={thCls}>Exigence</th><th className={thCls}>Priorité</th><th className={thCls}>Statut</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.num}>
                        <td className={tdCls + ' font-mono font-semibold text-brand-700'}>{r.num}</td>
                        <td className={tdCls}>{r.intitule}</td>
                        <td className={tdCls + ' whitespace-nowrap'}>{r.priorite}</td>
                        <td className={tdCls}><StatusBadge statut={r.statut} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          ) : (
            <p className="mt-1 text-[17px] text-slate-600">Aucune exigence du CDC n’est directement rattachée à cet écran : il relève du bonus ci-dessous.</p>
          )}
          {notes.map((n) => <p key={n} className="mt-2 text-[17px] text-slate-600"><b>Honnêtement :</b> {n}</p>)}
        </div>
      ) : null}
      {bonus.length > 0 || (chapter.bonus && rows.length === 0) ? (
        <div className="rounded-xl border-l-4 border-accent-500 bg-accent-50 p-4">
          <p className="text-[15px] font-bold uppercase tracking-widest text-accent-800">Au-delà du CDC</p>
          {bonus.length > 0 ? <ul className="mt-1 list-disc pl-5 text-[17px] text-slate-700">{bonus.map((b) => <li key={b}>{b}</li>)}</ul> : <p className="mt-1 text-[17px] text-slate-700">Module de gestion de ferme ajouté en bonus.</p>}
        </div>
      ) : null}
    </section>
  );
}

export function FaqSection() {
  return (
    <section id="faq" data-part="FAQ" data-title="Questions fréquentes" className="scroll-mt-24 space-y-3 border-t border-slate-200 pt-10">
      <SectionTitle>Questions fréquentes</SectionTitle>
      {FAQ.map((f) => (
        <details key={f.q} className="group rounded-xl border border-slate-200 bg-white p-4 open:shadow-sm print:open">
          <summary className="cursor-pointer font-semibold text-slate-900">{f.q}</summary>
          <p className="mt-2 text-[17px] text-slate-600">{f.a}</p>
        </details>
      ))}
    </section>
  );
}

export function HowToReadSection() {
  const steps = [
    ['Lire', 'Chaque chapitre présente un écran : qui l’utilise, à quoi il sert, comment s’en servir.'],
    ['Repérer', 'Les numéros sur la capture renvoient à la liste sous l’image.'],
    ['Vérifier', 'Le badge « Répond au CDC n° » donne les exigences couvertes ; le tableau en fin de chapitre donne leur statut.'],
    ['Contrôler', 'La matrice relie les 68 exigences à leurs écrans. Les parties non couvertes y sont dites.'],
  ];
  return (
    <section id="lire" data-part="Repères" data-title="Comment lire ce guide" className="scroll-mt-24 space-y-5">
      <SectionTitle>Comment lire ce guide</SectionTitle>
      <p className="max-w-3xl text-lg text-slate-700">
        Ce guide montre les {SCREEN_COUNT} écrans de la plateforme Fermia, avec le programme POUFA, et dit pour chacun quelles exigences du cahier des charges (CDC Agri Track 241) il couvre.
      </p>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([t, d], i) => (
          <li key={t} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 font-bold text-brand-800"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-[15px] text-white">{i + 1}</span>{t}</p>
            <p className="mt-1.5 text-[17px] leading-snug text-slate-700">{d}</p>
          </li>
        ))}
      </ol>
      <p className="text-[17px] text-slate-700">
        Un <b>parcours par acteur</b> et un <b>parcours par chapitre du CDC</b> suivent. Le bouton « Mode présentation » transforme le guide en diaporama plein écran.
      </p>
    </section>
  );
}

export function RoutesSection() {
  const title = (id: string) => CHAPTERS.find((c) => c.id === id)?.t ?? id;
  return (
    <section id="parcours" data-part="Repères" data-title="Parcours par acteur et par chapitre du CDC" className="scroll-mt-24 space-y-6">
      <SectionTitle>Parcours : par acteur, par chapitre du CDC</SectionTitle>
      <h3 className="text-xl font-semibold text-slate-900">Par acteur</h3>
      <ul className="grid gap-3 md:grid-cols-2">
        {ACTORS.map((a) => (
          <li key={a.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-lg font-bold text-brand-800">{a.name}</p>
            <p className="text-[17px] text-slate-600">{a.role}</p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[17px]">
              {a.chapters.map((id) => <a key={id} href={`#${id}`} className="text-brand-700 underline underline-offset-2">{title(id)}</a>)}
            </p>
          </li>
        ))}
      </ul>
      <h3 className="text-xl font-semibold text-slate-900">Par chapitre du CDC</h3>
      <ul className="grid gap-3 md:grid-cols-2">
        {CDC_SECTIONS.map((c) => {
          const list = REQUIREMENTS.filter((r) => r.num >= c.from && r.num <= c.to);
          const n = (st: string) => list.filter((r) => r.statut === st).length;
          return (
            <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-lg font-bold text-brand-800">§ {c.id} · {c.title}</p>
              <p className="text-[17px] text-slate-600">{c.blurb}</p>
              <p className="mt-2 flex flex-wrap gap-2 text-[15px] font-semibold">
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-800 ring-1 ring-emerald-200">{n('✅')} couvertes</span>
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800 ring-1 ring-amber-200">{n('🟠')} partielles</span>
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-red-800 ring-1 ring-red-200">{n('❌')} non livrées</span>
              </p>
              <p className="mt-2 text-[17px]"><a href="#exigences" className="text-brand-700 underline underline-offset-2">Voir les exigences n° {list[0].ref} à {list[list.length - 1].ref}</a></p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
