import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, CopyPlus, Download, FileText, Pencil, Play, Plus, Users } from 'lucide-react';
import { api } from '../../api/client';
import { SCOPE_KIND_LABELS, type ScopeKind } from '../../api/types-access';
import type { GenerateReportResult, ReportLevel, ReportRun, ReportSection, ReportTemplate } from '../../api/types-pilotage';
import { dateFr, dateTimeFr } from '../../lib/format';
import { Button, ErrorNote, Field, FormColumns, Modal, inputCls } from '../form';
import { Note, Pill, SectionCard } from '../flock/shared';
import { useProvinces } from '../registry/queries';
import { DataTable, EmptyState, Loading, Td, Th } from '../ui';
import { bytesLabel } from './format';
import { PILOTAGE_REFRESH_MS } from './perimeter';
import type { PilotageRights } from './pilotageAccess';
import {
  AUDIENCE_SCOPE_KINDS,
  LEVEL_LABELS,
  PERIODICITIES_BY_LEVEL,
  PERIODICITY_LABELS,
  SECTIONS_BY_LEVEL,
  SECTION_LABELS,
  audienceSummary,
  createTemplateBody,
  createTemplateError,
  generateBody,
  generateFormError,
  namesFarms,
  newTemplateForm,
  normaliseTemplateCode,
  recipientsSummary,
  runFilename,
  runPeriodLabel,
  runsQueryString,
  templateForm,
  templateFormError,
  templateCodeError,
  templatePatch,
  type GenerateForm,
  type TemplateForm,
} from './reports';

export const RUNS_KEY = 'pilotage-report-runs';

/**
 * Scheduled PDF reports (CDC row 40): templates (periodicity, sections,
 * audience; edited with PILOTAGE:ADMINISTRER), the runs within the reader's
 * scope, a manual run of a closed period (PILOTAGE:CREER) and the PDF with
 * its SHA-256 fingerprint. A farm account only reads its bands' end-of-band
 * reports (the server filters the runs).
 */
export function ReportsView({ rights }: { rights: PilotageRights }) {
  // POUFA lot A pilot: `?rapport=<runId>` (a REPORT_READY notification) opens that run.
  const [params] = useSearchParams();
  const [openRun, setOpenRun] = useState<string | null>(() => params.get('rapport'));
  return (
    <div className="space-y-6">
      {rights.view ? <TemplatesSection rights={rights} onRun={setOpenRun} /> : null}
      <RunsSection farmAccount={!rights.view} onOpen={setOpenRun} />
      {openRun ? <RunDetail id={openRun} onClose={() => setOpenRun(null)} /> : null}
    </div>
  );
}

function useTemplates(enabled: boolean) {
  return useQuery({
    queryKey: ['pilotage-report-templates'],
    queryFn: () => api.get<ReportTemplate[]>('/pilotage/reports/templates'),
    enabled,
    retry: false,
  });
}

function TemplatesSection({ rights, onRun }: { rights: PilotageRights; onRun: (id: string) => void }) {
  const templates = useTemplates(true);
  const [editing, setEditing] = useState<ReportTemplate | null>(null);
  const [generating, setGenerating] = useState<ReportTemplate | null>(null);
  // POUFA lot A pilot: create and duplicate templates.
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<ReportTemplate | null>(null);
  return (
    <SectionCard
      title="Modèles de rapports"
      subtitle="Produits automatiquement chaque heure pour les périodes closes"
      icon={<FileText />}
      actions={
        rights.editTemplates ? (
          <Button tone="secondary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nouveau modèle
          </Button>
        ) : undefined
      }
    >
      {templates.isLoading ? (
        <Loading />
      ) : templates.error ? (
        <ErrorNote error={templates.error} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {(templates.data ?? []).map((t) => (
            <div key={t.code} className="flex flex-col rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-semibold text-slate-900">{t.label}</p>
                {!t.active ? <Pill tone="slate">Inactif</Pill> : null}
                {t.hasFarmRows ? <Pill tone="amber">Nomme des fermes</Pill> : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t.code} · {LEVEL_LABELS[t.level]} · {PERIODICITY_LABELS[t.periodicity]}
              </p>
              <p className="mt-2 text-sm text-slate-600">{t.sections.map((s) => s.label).join(' · ')}</p>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {audienceSummary(t.audience, SCOPE_KIND_LABELS)}
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                {rights.editTemplates ? (
                  <Button tone="secondary" onClick={() => setEditing(t)}>
                    <Pencil className="h-4 w-4" /> Paramétrer
                  </Button>
                ) : null}
                {rights.editTemplates ? (
                  <Button tone="secondary" onClick={() => setDuplicating(t)}>
                    <CopyPlus className="h-4 w-4" /> Dupliquer
                  </Button>
                ) : null}
                {rights.generate && t.level !== 'BANDE' ? (
                  <Button tone="secondary" onClick={() => setGenerating(t)}>
                    <Play className="h-4 w-4" /> Produire
                  </Button>
                ) : null}
              </div>
              {rights.generate && t.level === 'BANDE' ? (
                <p className="mt-2 text-xs text-slate-500">Se produit à la clôture de chaque bande, ou depuis la fiche du lot (Bilan POUFA).</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {editing ? <TemplateModal template={editing} onClose={() => setEditing(null)} /> : null}
      {creating ? <NewTemplateModal onClose={() => setCreating(false)} /> : null}
      {duplicating ? <DuplicateTemplateModal template={duplicating} onClose={() => setDuplicating(null)} /> : null}
      {generating ? (
        <GenerateModal
          template={generating}
          onClose={() => setGenerating(null)}
          onDone={(id) => {
            setGenerating(null);
            onRun(id);
          }}
        />
      ) : null}
    </SectionCard>
  );
}

function TemplateModal({ template, onClose }: { template: ReportTemplate; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<TemplateForm>(() => templateForm(template));
  const [checkError, setCheckError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.patch<ReportTemplate>(`/pilotage/reports/templates/${encodeURIComponent(template.code)}`, templatePatch(template, form)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pilotage-report-templates'] });
      onClose();
    },
  });
  const submit = () => {
    const err = templateFormError(template.level, form);
    setCheckError(err);
    if (!err) save.mutate();
  };

  return (
    <Modal large title={`Paramétrer : ${template.label}`} onClose={onClose}>
      <div className="space-y-4">
        <TemplateFields level={template.level} form={form} setForm={setForm} />
        <ErrorNote error={checkError ?? save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button busy={save.isPending} onClick={submit}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// POUFA lot A pilot: a new template (`POST /pilotage/reports/templates`).
function NewTemplateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [level, setLevel] = useState<ReportLevel>('NATIONAL');
  const [form, setForm] = useState<TemplateForm>(() => newTemplateForm('NATIONAL'));
  const [checkError, setCheckError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.post<ReportTemplate>('/pilotage/reports/templates', createTemplateBody(code, level, form)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pilotage-report-templates'] });
      onClose();
    },
  });
  const changeLevel = (l: ReportLevel) => {
    setLevel(l);
    setForm((f) => ({ ...newTemplateForm(l), label: f.label }));
  };
  const submit = () => {
    const err = createTemplateError(code, level, form);
    setCheckError(err);
    if (!err) save.mutate();
  };
  return (
    <Modal large title="Nouveau modèle de rapport" onClose={onClose}>
      <div className="space-y-4">
        <FormColumns>
          <Field label="Code" hint="Unique et définitif : majuscules, chiffres et _ (ex. HEBDO_DGE).">
            <input className={inputCls} value={code} maxLength={40} onChange={(e) => setCode(normaliseTemplateCode(e.target.value))} />
          </Field>
          <Field label="Niveau">
            <select className={inputCls} value={level} onChange={(e) => changeLevel(e.target.value as ReportLevel)}>
              {(Object.keys(LEVEL_LABELS) as ReportLevel[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          </Field>
        </FormColumns>
        <TemplateFields level={level} form={form} setForm={setForm} />
        <ErrorNote error={checkError ?? save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button busy={save.isPending} onClick={submit}>
            Créer le modèle
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// POUFA lot A pilot: a copy of a template (`POST …/templates/:code/duplicate`), inactive until reviewed.
function DuplicateTemplateModal({ template, onClose }: { template: ReportTemplate; onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState(() => normaliseTemplateCode(`${template.code}_COPIE`).slice(0, 40));
  const [label, setLabel] = useState(`Copie de ${template.label}`.slice(0, 160));
  const [checkError, setCheckError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.post<ReportTemplate>(`/pilotage/reports/templates/${encodeURIComponent(template.code)}/duplicate`, {
        code,
        label: label.trim() || undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pilotage-report-templates'] });
      onClose();
    },
  });
  const submit = () => {
    const err = templateCodeError(code);
    setCheckError(err);
    if (!err) save.mutate();
  };
  return (
    <Modal title={`Dupliquer : ${template.label}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">La copie reprend le niveau, la périodicité, les sections et les destinataires. Elle est créée inactive : vérifiez-la puis activez-la.</p>
        <Field label="Code de la copie">
          <input className={inputCls} value={code} maxLength={40} onChange={(e) => setCode(normaliseTemplateCode(e.target.value))} />
        </Field>
        <Field label="Libellé">
          <input className={inputCls} value={label} maxLength={160} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <ErrorNote error={checkError ?? save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button busy={save.isPending} onClick={submit}>
            <CopyPlus className="h-4 w-4" /> Dupliquer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** The template form (sections and periodicities of the level, audience). */
function TemplateFields({ level, form, setForm }: { level: ReportLevel; form: TemplateForm; setForm: (f: TemplateForm | ((f: TemplateForm) => TemplateForm)) => void }) {
  const allowed = SECTIONS_BY_LEVEL[level];
  const toggleSection = (s: ReportSection) =>
    setForm((f) => ({ ...f, sections: f.sections.includes(s) ? f.sections.filter((x) => x !== s) : [...f.sections, s] }));
  const toggleKind = (k: ScopeKind) =>
    setForm((f) => ({ ...f, scopeKinds: f.scopeKinds.includes(k) ? f.scopeKinds.filter((x) => x !== k) : [...f.scopeKinds, k] }));
  const farmRows = namesFarms(level, form.sections);
  return (
    <FormColumns>
      <div className="space-y-4">
        <Field label="Libellé">
          <input className={inputCls} value={form.label} maxLength={160} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </Field>
        <Field label="Périodicité">
          <select className={inputCls} value={form.periodicity} onChange={(e) => setForm({ ...form, periodicity: e.target.value as TemplateForm['periodicity'] })}>
            {PERIODICITIES_BY_LEVEL[level].map((p) => (
              <option key={p} value={p}>
                {PERIODICITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-slate-600">Sections (niveau {LEVEL_LABELS[level].toLowerCase()})</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {allowed.map((s) => (
              <label key={s} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.sections.includes(s)} onChange={() => toggleSection(s)} />
                {SECTION_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>
        {farmRows ? (
          <Note tone="amber">Ce rapport nomme des fermes : il ne sera jamais envoyé à un profil de données agrégées.</Note>
        ) : null}
      </div>
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-slate-600">Destinataires : périmètres</legend>
          <div className="space-y-1.5">
            {AUDIENCE_SCOPE_KINDS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.scopeKinds.includes(k)} onChange={() => toggleKind(k)} />
                {SCOPE_KIND_LABELS[k]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Restreindre à ces profils" hint="Codes séparés par des virgules (ex. DGE, MAEDR) ; vide = tous les profils ayant Pilotage : Consulter.">
          <input className={inputCls} value={form.profileCodes} onChange={(e) => setForm({ ...form, profileCodes: e.target.value })} />
        </Field>
        {level === 'BANDE' ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.farmOwners} onChange={(e) => setForm({ ...form, farmOwners: e.target.checked })} />
            Prévenir l’exploitant de la ferme
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Modèle actif (production automatique)
        </label>
      </div>
    </FormColumns>
  );
}

function GenerateModal({ template, onClose, onDone }: { template: ReportTemplate; onClose: () => void; onDone: (runId: string) => void }) {
  const qc = useQueryClient();
  const provinces = useProvinces(template.level === 'PROVINCE');
  const [form, setForm] = useState<GenerateForm>({ periodStart: '', provinceCode: '' });
  const [checkError, setCheckError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ReportRun | null>(null);
  const run = useMutation({
    mutationFn: () =>
      api.post<GenerateReportResult>(`/pilotage/reports/templates/${encodeURIComponent(template.code)}/runs`, generateBody(template.level, form)),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: [RUNS_KEY] });
      if (res.created) onDone(res.run.id);
      else setExisting(res.run);
    },
  });
  const submit = () => {
    const err = generateFormError(template.level, form);
    setCheckError(err);
    if (!err) run.mutate();
  };
  return (
    <Modal title={`Produire : ${template.label}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Un rapport porte sur une période close ({PERIODICITY_LABELS[template.periodicity].toLowerCase()}). Sans date, la dernière période terminée est produite.
        </p>
        <Field label="Un jour de la période" hint="Facultatif : la semaine ou le mois qui contient ce jour.">
          <input type="date" className={inputCls} value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
        </Field>
        {template.level === 'PROVINCE' ? (
          <Field label="Province">
            <select className={inputCls} value={form.provinceCode} onChange={(e) => setForm({ ...form, provinceCode: e.target.value })}>
              <option value="">Choisir…</option>
              {(provinces.data ?? []).map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {existing ? (
          <Note tone="brand">
            Ce rapport existait déjà pour cette période ({runPeriodLabel(existing, dateFr)}) : un rapport produit ne change plus.{' '}
            <button type="button" className="font-medium underline" onClick={() => onDone(existing.id)}>
              L’ouvrir
            </button>
          </Note>
        ) : null}
        <ErrorNote error={checkError ?? run.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button busy={run.isPending} onClick={submit}>
            <Play className="h-4 w-4" /> Produire
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RunsSection({ farmAccount, onOpen }: { farmAccount: boolean; onOpen: (id: string) => void }) {
  const [q, setQ] = useState<{ template: string; level: '' | ReportLevel; from: string; to: string }>({
    template: '',
    level: farmAccount ? 'BANDE' : '',
    from: '',
    to: '',
  });
  const templates = useTemplates(!farmAccount);
  const qs = runsQueryString(q);
  const runs = useQuery({
    queryKey: [RUNS_KEY, qs],
    queryFn: () => api.get<ReportRun[]>(`/pilotage/reports/runs${qs}`),
    retry: false,
    refetchInterval: PILOTAGE_REFRESH_MS,
  });
  return (
    <SectionCard
      title={farmAccount ? 'Rapports de fin de bande de mes fermes' : 'Rapports produits'}
      subtitle="PDF figés : un rapport produit ne change plus (empreinte SHA-256)."
      icon={<FileText />}
      flush
    >
      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {!farmAccount ? (
          <>
            <Field label="Modèle">
              <select className={inputCls} value={q.template} onChange={(e) => setQ({ ...q, template: e.target.value })}>
                <option value="">Tous</option>
                {(templates.data ?? []).map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Niveau">
              <select className={inputCls} value={q.level} onChange={(e) => setQ({ ...q, level: e.target.value as '' | ReportLevel })}>
                <option value="">Tous</option>
                {(Object.keys(LEVEL_LABELS) as ReportLevel[]).map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABELS[l]}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        <Field label="Période à partir du">
          <input type="date" className={inputCls} value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} />
        </Field>
        <Field label="Jusqu’au">
          <input type="date" className={inputCls} value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} />
        </Field>
      </div>
      {runs.isLoading ? (
        <Loading />
      ) : runs.error ? (
        <div className="p-4">
          <ErrorNote error={runs.error} />
        </div>
      ) : (runs.data ?? []).length === 0 ? (
        <EmptyState message={farmAccount ? 'Aucun rapport de fin de bande pour l’instant : il se produit à la clôture de chaque bande.' : 'Aucun rapport produit pour ces filtres.'} icon={<FileText className="h-5 w-5" />} />
      ) : (
        <RunsTable runs={runs.data ?? []} onOpen={onOpen} />
      )}
    </SectionCard>
  );
}

export function RunsTable({ runs, onOpen }: { runs: ReportRun[]; onOpen: (id: string) => void }) {
  return (
    <DataTable>
      <thead>
        <tr>
          <Th>Rapport</Th>
          <Th>Niveau</Th>
          <Th>Période</Th>
          <Th className="hidden lg:table-cell">Produit le</Th>
          <Th className="hidden lg:table-cell">Taille</Th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(r.id)}>
            <Td>
              <button type="button" className="text-left font-medium text-brand-700 hover:underline" onClick={() => onOpen(r.id)}>
                {r.title}
              </button>
            </Td>
            <Td label="Niveau">{LEVEL_LABELS[r.level]}</Td>
            <Td label="Période">{runPeriodLabel(r, dateFr)}</Td>
            <Td label="Produit le" className="md:max-lg:hidden">
              {dateTimeFr(r.createdAt)}
            </Td>
            <Td label="Taille" className="md:max-lg:hidden">
              {bytesLabel(r.sizeBytes)}
            </Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** A run's detail (`GET /pilotage/reports/runs/:id`) and its PDF, with the fingerprint. */
export function RunDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const run = useQuery({
    queryKey: [RUNS_KEY, 'detail', id],
    queryFn: () => api.get<ReportRun>(`/pilotage/reports/runs/${id}`),
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const r = run.data;
  const download = async () => {
    if (!r) return;
    setBusy(true);
    setError(null);
    try {
      await api.download(r.downloadPath, runFilename(r));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal side title={r?.title ?? 'Rapport'} onClose={onClose}>
      {run.isLoading ? (
        <Loading />
      ) : run.error || !r ? (
        <ErrorNote error={run.error ?? 'Rapport introuvable.'} />
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-slate-500">Modèle</dt>
            <dd className="text-slate-800">{r.templateCode}</dd>
            <dt className="text-slate-500">Niveau</dt>
            <dd className="text-slate-800">{LEVEL_LABELS[r.level]}</dd>
            <dt className="text-slate-500">Période</dt>
            <dd className="text-slate-800">{runPeriodLabel(r, dateFr)}</dd>
            <dt className="text-slate-500">Produit le</dt>
            <dd className="text-slate-800">
              {dateTimeFr(r.createdAt)} · {r.generatedById ? 'à la demande' : 'production automatique'}
            </dd>
            <dt className="text-slate-500">Destinataires</dt>
            <dd className="text-slate-800">{recipientsSummary(r)}</dd>
            <dt className="text-slate-500">Taille</dt>
            <dd className="text-slate-800">{bytesLabel(r.sizeBytes)}</dd>
          </dl>
          {r.hasFarmRows ? <Note tone="amber">Ce rapport nomme des fermes.</Note> : null}
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-600">Empreinte SHA-256 du PDF (en-tête X-Report-Sha256)</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-800">{r.sha256}</p>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
              onClick={() => {
                void navigator.clipboard?.writeText(r.sha256).then(() => setCopied(true));
              }}
            >
              <Copy className="h-3.5 w-3.5" /> {copied ? 'Copiée' : 'Copier l’empreinte'}
            </button>
            <p className="mt-2 text-xs text-slate-500">Elle permet de vérifier qu’un PDF reçu est bien celui produit par le programme.</p>
          </div>
          <ErrorNote error={error} />
          <Button busy={busy} onClick={() => void download()}>
            <Download className="h-4 w-4" /> Télécharger le PDF
          </Button>
        </div>
      )}
    </Modal>
  );
}
