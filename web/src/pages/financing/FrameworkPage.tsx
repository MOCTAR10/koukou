import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, FileText, ListChecks, PencilLine, Plus, Scale } from 'lucide-react';
import { FINANCING_STEPS, FINANCING_STEP_LABELS, type DocumentFormat, type DocumentProvider, type FinancingRequirement, type FinancingStep } from '../../api/types-financing';
import { useMenuAccess } from '../../app/useMenuAccess';
import {
  ALL_FORMATS,
  FORMAT_LABELS,
  PROVIDER_LABELS,
  configSummary,
  farmerAskCount,
  farmerAskText,
  filterRequirements,
  parseValidity,
  providerOf,
  type ProviderFilter,
  type RequirementX,
} from '../../components/financing/documentsLogic';
import { groupRequirements, moveRequirement } from '../../components/financing/financingLogic';
import { useLegalBasis, useRequirements, useRequirementTemplate, useSaveRequirement } from '../../components/financing/queries';
import { SectionTitle } from '../../components/financing/shared';
import { Button, ErrorNote, Field, Modal, inputCls } from '../../components/form';
import { Card, DataTable, EmptyState, PageHeader, SkeletonRows, StatusBadge, Td, Th } from '../../components/ui';
import { classNames } from '../../lib/format';
import { safeHref } from '../../lib/safeUrl';

/** Two-or-three-way choice drawn as buttons on one line (radio semantics). */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ key: T; label: string }>; onChange: (k: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={classNames('whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium transition', value === o.key ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Blank form of an existing requirement: its name, and attach / replace / remove. */
function TemplateField({ item }: { item: RequirementX }) {
  const { attach, remove } = useRequirementTemplate();
  const input = useRef<HTMLInputElement>(null);
  const error = attach.error ?? remove.error;
  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) attach.mutate({ id: item.id, file });
          e.target.value = '';
        }}
      />
      {item.templateFileName ? (
        <p className="flex items-center gap-2 text-sm text-slate-800">
          <FileText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <span className="min-w-0 break-all">{item.templateFileName}</span>
        </p>
      ) : (
        <p className="text-sm text-slate-500">Aucun modèle joint.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button tone="secondary" className="whitespace-nowrap" busy={attach.isPending} onClick={() => input.current?.click()}>
          {item.templateFileName ? 'Remplacer le modèle' : 'Joindre un modèle'}
        </Button>
        {item.templateFileName ? (
          <Button tone="secondary" className="whitespace-nowrap" busy={remove.isPending} onClick={() => remove.mutate(item.id)}>
            Retirer le modèle
          </Button>
        ) : null}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

function RequirementModal({ initial, defaultStep, nextSort, onClose }: { initial: RequirementX | null; defaultStep: FinancingStep; nextSort: number; onClose: () => void }) {
  const save = useSaveRequirement();
  // The template buttons change the stored item while the form is open: read the live copy.
  const live = useRequirements().data?.find((r) => r.id === initial?.id) as RequirementX | undefined;
  const [label, setLabel] = useState(initial?.label ?? '');
  const [step, setStep] = useState<FinancingStep>(initial?.step ?? defaultStep);
  const [required, setRequired] = useState(initial?.required ?? true);
  const [active, setActive] = useState(initial?.active ?? true);
  const [legalBasis, setLegalBasis] = useState(initial?.legalBasis ?? '');
  const [help, setHelp] = useState(initial?.help ?? '');
  const [providedBy, setProvidedBy] = useState<DocumentProvider>(initial ? providerOf(initial) : 'EXPLOITANT');
  const [formats, setFormats] = useState<DocumentFormat[]>(initial?.formats?.length ? initial.formats : [...ALL_FORMATS]);
  const [validity, setValidity] = useState(initial?.validityMonths != null ? String(initial.validityMonths) : '');
  const months = parseValidity(validity);
  const toggleFormat = (f: DocumentFormat, on: boolean) => setFormats((l) => (on ? [...l, f] : l.filter((x) => x !== f)));
  const invalid = label.trim().length < 2 ? 'Donnez un intitulé.' : formats.length === 0 ? 'Choisissez au moins un format.' : months === undefined ? 'La durée de validité est un nombre de mois entre 1 et 120, ou vide.' : null;

  return (
    <Modal title={initial ? 'Modifier la pièce' : 'Ajouter une pièce'} onClose={onClose} wide>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid || months === undefined) return;
          save.mutate(
            {
              id: initial?.id,
              body: {
                label: label.trim(),
                step,
                required,
                legalBasis: legalBasis.trim() || null,
                help: help.trim() || null,
                providedBy,
                formats: formats.length === ALL_FORMATS.length ? [] : formats,
                validityMonths: months,
                active,
                ...(initial ? {} : { sort: nextSort }),
              },
            },
            { onSuccess: onClose },
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Intitulé de la pièce" className="sm:col-span-2">
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={160} autoFocus />
          </Field>
          <Field label="Demandée à l’étape">
            <select className={inputCls} value={step} onChange={(e) => setStep(e.target.value as FinancingStep)}>
              {FINANCING_STEPS.map((s) => (
                <option key={s} value={s}>
                  {FINANCING_STEP_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Fournie par</p>
            <Segmented<DocumentProvider>
              label="Fournie par"
              value={providedBy}
              onChange={setProvidedBy}
              options={[
                { key: 'EXPLOITANT', label: PROVIDER_LABELS.EXPLOITANT },
                { key: 'BCEG', label: PROVIDER_LABELS.BCEG },
              ]}
            />
            <p className="mt-1 text-xs text-slate-500">{providedBy === 'EXPLOITANT' ? 'L’exploitant la voit et la dépose depuis son espace.' : 'Seuls les agents de la BCEG la déposent.'}</p>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1 text-xs font-medium text-slate-600">Formats acceptés</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {ALL_FORMATS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" className="h-5 w-5 accent-[#206080]" checked={formats.includes(f)} onChange={(e) => toggleFormat(f, e.target.checked)} />
                {FORMAT_LABELS[f]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Durée de validité (mois)" hint="Laissez vide : la pièce n’expire pas.">
            <input className={inputCls} inputMode="numeric" value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="Sans limite" />
          </Field>
          <Field label="Source réglementaire (facultatif)" hint="Par exemple : AUS OHADA, art. 14.">
            <input className={inputCls} value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} maxLength={160} />
          </Field>
        </div>

        <Field label="Consigne pour l’exploitant" hint="Une phrase simple : ce qu’il faut apporter, où l’obtenir.">
          <textarea className={inputCls} rows={2} value={help} onChange={(e) => setHelp(e.target.value)} maxLength={300} />
        </Field>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Modèle à télécharger</p>
          {initial && live ? (
            <TemplateField item={live} />
          ) : (
            <p className="text-sm text-slate-500">{initial ? 'Modèle indisponible.' : 'Vous pourrez joindre un modèle vierge une fois la pièce créée.'}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-start gap-3 text-sm text-slate-800">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#206080]" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Pièce obligatoire : sans elle, le dossier ne passe pas à l’étape suivante.
          </label>
          {initial ? (
            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#206080]" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Pièce active : décochée, elle est retirée de la liste (les dossiers qui l’ont reçue la gardent).
            </label>
          ) : null}
        </div>

        {invalid ? <p className="text-sm text-red-700">{invalid}</p> : null}
        <ErrorNote error={save.error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending} disabled={!!invalid}>
            {initial ? 'Enregistrer' : 'Ajouter la pièce'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const FILTERS: ReadonlyArray<{ key: ProviderFilter; label: string }> = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'EXPLOITANT', label: 'Exploitant' },
  { key: 'BCEG', label: 'BCEG' },
];

function RequirementsBlock() {
  const { financing } = useMenuAccess();
  const list = useRequirements(financing.view);
  const save = useSaveRequirement();
  const [editing, setEditing] = useState<{ item: RequirementX | null; step: FinancingStep } | null>(null);
  const [filter, setFilter] = useState<ProviderFilter>('ALL');
  const canEdit = financing.validate;
  const items = (list.data ?? []) as RequirementX[];
  const groups = groupRequirements(items) as Array<{ step: FinancingStep; label: string; items: RequirementX[] }>;
  const nextSort = items.reduce((n, r) => Math.max(n, r.sort), 0) + 1;

  const move = (siblings: FinancingRequirement[], id: string, dir: -1 | 1) => {
    const updates = moveRequirement(siblings, id, dir);
    if (!updates) return;
    // Two small writes: the order is the pair of `sort` values.
    updates.forEach((u) => save.mutate({ id: u.id, body: { sort: u.sort } }));
  };

  return (
    <section aria-label="Liste des pièces" className="space-y-3">
      <SectionTitle
        action={
          canEdit ? (
            <Button className="whitespace-nowrap" onClick={() => setEditing({ item: null, step: 'DEMANDE' })}>
              <Plus className="h-4 w-4" /> Ajouter une pièce
            </Button>
          ) : null
        }
      >
        Liste des pièces de la BCEG
      </SectionTitle>
      <p className="text-sm text-slate-600">
        Cette liste est ce que chaque exploitant voit et dépose depuis son espace : les pièces fournies par l’exploitant apparaissent sur sa page Financement, avec la consigne et le modèle que vous
        joignez. Une pièce ne se supprime pas : on la retire de la liste, et les dossiers qui l’ont déjà reçue la gardent.
      </p>
      <Segmented<ProviderFilter> label="Fournie par" value={filter} onChange={setFilter} options={FILTERS} />
      <ErrorNote error={save.error} />
      {list.isLoading ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : !list.data ? (
        <ErrorNote error={list.error} onRetry={() => void list.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Aucune pièce dans la liste" message="Ajoutez les pièces que la BCEG demande à chaque étape, par exemple la pièce d’identité à la demande." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map((g) => {
            const shown = filterRequirements(g.items, filter);
            return (
              <Card key={g.step} className="p-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold text-slate-800">{g.label}</h3>
                  {canEdit ? (
                    <button type="button" className="whitespace-nowrap text-xs font-semibold text-brand-700 hover:underline" onClick={() => setEditing({ item: null, step: g.step })}>
                      Ajouter à cette étape
                    </button>
                  ) : null}
                </div>
                <p className="mb-1 text-xs text-slate-500">{farmerAskText(farmerAskCount(g.items))}</p>
                {shown.length === 0 ? (
                  <p className="py-3 text-sm text-slate-500">Aucune pièce de ce type à cette étape.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {shown.map((r) => {
                      const i = g.items.findIndex((x) => x.id === r.id);
                      return (
                        <li key={r.id} className={classNames('flex flex-col items-start gap-1 py-2.5 sm:flex-row sm:gap-3', !r.active && 'opacity-60')}>
                          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                            <p className="text-sm font-medium text-slate-900">{r.label}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                              <StatusBadge tone={r.required ? 'info' : 'neutral'} label={r.required ? 'Obligatoire' : 'Facultative'} />
                              {!r.active ? <StatusBadge tone="neutral" label="Retirée de la liste" /> : null}
                              {r.legalBasis ? <span>{r.legalBasis}</span> : null}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">{configSummary(r)}</p>
                            {r.templateFileName ? (
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-600">
                                <FileText className="h-3 w-3 shrink-0" aria-hidden /> Modèle : <span className="break-all">{r.templateFileName}</span>
                              </p>
                            ) : null}
                            {r.help ? <p className="mt-0.5 text-xs text-slate-500">{r.help}</p> : null}
                          </div>
                          {canEdit ? (
                            <div className="flex shrink-0 flex-wrap items-center gap-0.5 sm:justify-end">
                              <button type="button" aria-label={`Monter « ${r.label} »`} disabled={i === 0 || save.isPending} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" onClick={() => move(g.items, r.id, -1)}>
                                <ArrowUp className="h-4 w-4" />
                              </button>
                              <button type="button" aria-label={`Descendre « ${r.label} »`} disabled={i === g.items.length - 1 || save.isPending} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" onClick={() => move(g.items, r.id, 1)}>
                                <ArrowDown className="h-4 w-4" />
                              </button>
                              <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={() => setEditing({ item: r, step: r.step })}>
                                <PencilLine className="h-4 w-4" /> Modifier
                              </button>
                              <button type="button" className="whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={() => save.mutate({ id: r.id, body: { active: !r.active } })}>
                                {r.active ? 'Retirer' : 'Rétablir'}
                              </button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {editing ? <RequirementModal initial={editing.item} defaultStep={editing.step} nextSort={nextSort} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function LegalBlock() {
  const legal = useLegalBasis();
  return (
    <section aria-label="Base réglementaire" className="space-y-3">
      <SectionTitle>Base réglementaire</SectionTitle>
      <p className="text-sm text-slate-600">Les textes sur lesquels s’appuient la liste des pièces, le consentement et le classement des créances.</p>
      <Card className="overflow-hidden">
        {legal.isLoading ? (
          <SkeletonRows rows={5} />
        ) : !legal.data ? (
          <div className="p-4">
            <ErrorNote error={legal.error} onRetry={() => void legal.refetch()} />
          </div>
        ) : legal.data.length === 0 ? (
          <div className="p-4">
            <EmptyState message="Aucun texte référencé." />
          </div>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Texte</Th>
                <Th>Articles</Th>
                <Th className="hidden lg:table-cell">Utilisation</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              {legal.data.map((r) => {
                const url = safeHref(r.url);
                return (
                  <tr key={r.code}>
                    <Td>
                      <span className="font-medium text-slate-900">{r.title}</span>
                      <span className="block text-xs text-slate-500">{r.reference}</span>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                          Consulter le texte <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ) : null}
                    </Td>
                    <Td label="Articles">{r.articles ?? '—'}</Td>
                    <Td label="Utilisation" className="md:max-lg:hidden">
                      {r.use}
                    </Td>
                    <Td label="Statut">{r.verified ? <StatusBadge tone="ok" label="Vérifié" /> : <StatusBadge tone="neutral" label="À confirmer" />}</Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Card>
      <p className="text-xs text-slate-500">« À confirmer » : texte cité d’après des sources secondaires, à faire confirmer par le service juridique de la BCEG.</p>
    </section>
  );
}

/** « Pièces et cadre »: the bank's document checklist and the legal texts behind it. */
export function FrameworkPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Pièces et cadre réglementaire" icon={<Scale className="h-6 w-6" />} subtitle="La liste des pièces de la BCEG et les textes qui l’encadrent." />
      <RequirementsBlock />
      <LegalBlock />
    </div>
  );
}
