import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, EyeOff, Pencil, Plus, RotateCcw, Star, Syringe } from 'lucide-react';
import { api } from '../../api/client';
import type { CalendarProtocol, CalendarStep, CareTypeCode, CreateCalendarBody } from '../../api/types-surveillance';
import { Button, ErrorNote, Field, FormColumns, Modal, inputCls } from '../form';
import { CARE_TYPES, CARE_TYPE_LABEL, Note, Pill, SPECIES_LABEL, SectionCard, TYPE_LABEL } from '../flock/shared';
import { DataTable, EmptyState, Loading, Td, Th } from '../ui';
import { SURVEILLANCE_KEYS } from './queries';
import { emptyStepForm, sharedCalendars, sortedSteps, stepBody, stepFormOf, stepProblem, type StepForm } from './settingsRules';

const SPECIES = Object.keys(SPECIES_LABEL);
const TYPES = ['CHAIR', 'PONDEUSE'];

/**
 * Reference vaccination calendars of the programme (CDC 22, vets' side):
 * the shared protocols (`farmId` null), read through `GET /sanitary/protocols`,
 * written through `/surveillance/vaccination-calendars`. One reference per
 * species and type: band calendars are generated from it. Steps are
 * deactivated, never deleted.
 */
export function VaccinationCalendarsAdmin({ canCreate, canEdit }: { canCreate: boolean; canEdit: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const calendars = useQuery({
    queryKey: SURVEILLANCE_KEYS.calendars,
    // Without farmId: the shared calendars only.
    queryFn: () => api.get<CalendarProtocol[]>('/sanitary/protocols'),
  });
  const rows = sharedCalendars(calendars.data ?? []).sort(
    (a, b) => a.species.localeCompare(b.species) || a.type.localeCompare(b.type) || Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, 'fr'),
  );

  return (
    <SectionCard
      title="Calendriers vaccinaux de référence"
      subtitle="Le calendrier de référence d’une espèce et d’un type est celui appliqué par défaut aux bandes ; un soin passé sa fenêtre est signalé en retard."
      icon={<Syringe />}
      flush
      actions={
        canCreate ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nouveau calendrier
          </Button>
        ) : undefined
      }
    >
      <ErrorNote error={calendars.error} />
      {calendars.isLoading ? (
        <div className="p-4">
          <Loading />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState message="Aucun calendrier partagé." icon={<Syringe />} />
        </div>
      ) : (
        <DataTable>
          <thead className="bg-slate-50">
            <tr>
              <Th>Calendrier</Th>
              <Th>Espèce</Th>
              <Th>Type</Th>
              <Th>Référence</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpenId(p.id)}>
                <Td>
                  <span className="font-medium">{p.name}</span>
                  <span className="block font-mono text-xs text-slate-500">{p.code}</span>
                </Td>
                <Td label="Espèce">{SPECIES_LABEL[p.species] ?? p.species}</Td>
                <Td label="Type">{TYPE_LABEL[p.type] ?? p.type}</Td>
                <Td label="Référence">{p.isDefault ? <Pill tone="brand">Référence</Pill> : '—'}</Td>
                <Td className="row-chevron text-right">
                  <ChevronRight className="inline h-4 w-4 text-slate-400" />
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {openId ? <CalendarDetail id={openId} canEdit={canEdit} onClose={() => setOpenId(null)} /> : null}
      {creating ? <CreateCalendarModal onClose={() => setCreating(false)} onCreated={(id) => setOpenId(id)} /> : null}
    </SectionCard>
  );
}

function StepFields({ form, onChange }: { form: StepForm; onChange: (f: StepForm) => void }) {
  const set = (patch: Partial<StepForm>) => onChange({ ...form, ...patch });
  const digits = (v: string) => v.replace(/\D/g, '');
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Field label="Soin *" className="sm:col-span-2">
        <input className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Vaccin Gumboro" />
      </Field>
      <Field label="Type">
        <select className={inputCls} value={form.careType} onChange={(e) => set({ careType: e.target.value as CareTypeCode })}>
          {CARE_TYPES.map((c) => (
            <option key={c} value={c}>
              {CARE_TYPE_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ordre *">
        <input className={inputCls} inputMode="numeric" value={form.stepOrder} onChange={(e) => set({ stepOrder: digits(e.target.value) })} />
      </Field>
      <Field label="Du jour (âge) *">
        <input className={inputCls} inputMode="numeric" value={form.dayFrom} onChange={(e) => set({ dayFrom: digits(e.target.value) })} />
      </Field>
      <Field label="Au jour (âge) *">
        <input className={inputCls} inputMode="numeric" value={form.dayTo} onChange={(e) => set({ dayTo: digits(e.target.value) })} />
      </Field>
      <Field label="Voie">
        <input className={inputCls} value={form.route} onChange={(e) => set({ route: e.target.value })} placeholder="Eau de boisson" />
      </Field>
      <Field label="Dosage">
        <input className={inputCls} value={form.dosage} onChange={(e) => set({ dosage: e.target.value })} />
      </Field>
      <Field label="Délai d’attente (j)">
        <input className={inputCls} inputMode="numeric" value={form.withdrawalDays} onChange={(e) => set({ withdrawalDays: digits(e.target.value) })} />
      </Field>
    </div>
  );
}

function CreateCalendarModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('POULET');
  const [type, setType] = useState('CHAIR');
  const [reference, setReference] = useState(false);
  const [step, setStep] = useState<StepForm>(emptyStepForm(1));
  const problem = !name.trim() ? 'Le nom du calendrier est obligatoire.' : stepProblem(step);
  const create = useMutation({
    mutationFn: () => {
      const body: CreateCalendarBody = { name: name.trim(), species, type, reference, steps: [stepBody(step)] };
      return api.post<CalendarProtocol>('/surveillance/vaccination-calendars', body);
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: SURVEILLANCE_KEYS.calendars });
      void queryClient.invalidateQueries({ queryKey: ['protocols'] });
      onClose();
      onCreated(created.id);
    },
  });
  return (
    <Modal title="Nouveau calendrier vaccinal partagé" onClose={onClose} large>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) create.mutate();
        }}
        className="space-y-4"
      >
        <FormColumns>
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-700">Première étape</p>
            <StepFields form={step} onChange={setStep} />
            <p className="text-xs text-slate-500">Les autres étapes s’ajoutent ensuite, depuis le calendrier.</p>
          </div>
          <div className="space-y-3">
            <Field label="Nom *">
              <input className={inputCls} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Espèce">
              <select className={inputCls} value={species} onChange={(e) => setSpecies(e.target.value)}>
                {SPECIES.map((s) => (
                  <option key={s} value={s}>
                    {SPECIES_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type de bande">
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5" checked={reference} onChange={(e) => setReference(e.target.checked)} />
              <span>
                Calendrier de référence
                <span className="block text-xs text-slate-500">Remplace la référence actuelle de cette espèce et de ce type.</span>
              </span>
            </label>
          </div>
        </FormColumns>
        {problem && (name || step.name) ? <Note tone="amber">{problem}</Note> : null}
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={create.isPending} disabled={!!problem}>
            <Check className="h-4 w-4" /> Créer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CalendarDetail({ id, canEdit, onClose }: { id: string; canEdit: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: SURVEILLANCE_KEYS.calendar(id),
    queryFn: () => api.getFresh<CalendarProtocol>(`/sanitary/protocols/${id}`),
  });
  const [name, setName] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<{ id: string | null; form: StepForm } | null>(null);
  const store = (fresh: CalendarProtocol) => {
    queryClient.setQueryData(SURVEILLANCE_KEYS.calendar(id), fresh);
    void queryClient.invalidateQueries({ queryKey: SURVEILLANCE_KEYS.calendars });
    void queryClient.invalidateQueries({ queryKey: ['protocols'] });
    void queryClient.invalidateQueries({ queryKey: ['protocol-detail'] });
  };
  const update = useMutation({
    mutationFn: (body: { name?: string; reference?: true }) => api.patch<CalendarProtocol>(`/surveillance/vaccination-calendars/${id}`, body),
    onSuccess: (fresh) => {
      store(fresh);
      setName(null);
    },
  });
  const saveStep = useMutation({
    mutationFn: (v: { stepId: string | null; body: object }) =>
      v.stepId
        ? api.patch<CalendarProtocol>(`/surveillance/vaccination-calendars/${id}/steps/${v.stepId}`, v.body)
        : api.post<CalendarProtocol>(`/surveillance/vaccination-calendars/${id}/steps`, v.body),
    onSuccess: (fresh) => {
      store(fresh);
      setEditingStep(null);
    },
  });
  const p = detail.data;
  const steps = sortedSteps<CalendarStep>(p?.steps);
  const stepError = editingStep ? stepProblem(editingStep.form) : null;
  const nextOrder = steps.reduce((m, s) => Math.max(m, s.stepOrder), 0) + 1;

  return (
    <Modal side wide title={p ? p.name : 'Calendrier'} onClose={onClose}>
      {detail.isLoading ? <Loading /> : null}
      <ErrorNote error={detail.error ?? update.error} />
      {p ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Pill>{SPECIES_LABEL[p.species] ?? p.species}</Pill>
            <Pill>{TYPE_LABEL[p.type] ?? p.type}</Pill>
            {p.isDefault ? <Pill tone="brand">Calendrier de référence</Pill> : null}
          </div>
          {canEdit ? (
            <div className="flex flex-wrap items-end gap-2">
              {name !== null ? (
                <>
                  <Field label="Nom" className="min-w-0 flex-1">
                    <input className={inputCls} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Button busy={update.isPending} disabled={!name.trim()} onClick={() => update.mutate({ name: name.trim() })}>
                    <Check className="h-4 w-4" /> Enregistrer
                  </Button>
                  <Button tone="secondary" onClick={() => setName(null)}>
                    Annuler
                  </Button>
                </>
              ) : (
                <>
                  <Button tone="secondary" onClick={() => setName(p.name)}>
                    <Pencil className="h-4 w-4" /> Renommer
                  </Button>
                  {!p.isDefault ? (
                    <Button tone="secondary" busy={update.isPending} onClick={() => update.mutate({ reference: true })}>
                      <Star className="h-4 w-4" /> En faire la référence
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Étapes</h3>
              {canEdit && !editingStep ? (
                <Button tone="secondary" onClick={() => setEditingStep({ id: null, form: emptyStepForm(nextOrder) })}>
                  <Plus className="h-4 w-4" /> Ajouter une étape
                </Button>
              ) : null}
            </div>
            {editingStep ? (
              <div className="mb-3 space-y-3 rounded-xl border border-slate-200 p-3">
                <StepFields form={editingStep.form} onChange={(form) => setEditingStep({ ...editingStep, form })} />
                {stepError && editingStep.form.name ? <Note tone="amber">{stepError}</Note> : null}
                <ErrorNote error={saveStep.error} />
                <div className="flex justify-end gap-2">
                  <Button tone="secondary" onClick={() => setEditingStep(null)}>
                    Annuler
                  </Button>
                  <Button
                    busy={saveStep.isPending}
                    disabled={!!stepError}
                    onClick={() => saveStep.mutate({ stepId: editingStep.id, body: stepBody(editingStep.form) })}
                  >
                    <Check className="h-4 w-4" /> Enregistrer l’étape
                  </Button>
                </div>
              </div>
            ) : null}
            {steps.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune étape.</p>
            ) : (
              <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Âge</Th>
                    <Th>Soin</Th>
                    <Th>Voie et dosage</Th>
                    <Th>État</Th>
                    <Th> </Th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100 align-top">
                      <Td>
                        J{s.dayFrom}
                        {s.dayTo !== s.dayFrom ? `–J${s.dayTo}` : ''}
                      </Td>
                      <Td label="Soin">
                        <span className={s.active ? 'font-medium' : 'text-slate-400 line-through'}>{s.name}</span>
                        <span className="block text-xs text-slate-500">
                          {CARE_TYPE_LABEL[s.careType] ?? s.careType}
                          {s.withdrawalDays > 0 ? ` · attente ${s.withdrawalDays} j` : ''}
                        </span>
                      </Td>
                      <Td label="Voie et dosage">{[s.route, s.dosage].filter(Boolean).join(' · ') || '—'}</Td>
                      <Td label="État">{s.active ? <Pill tone="emerald">Appliquée</Pill> : <Pill>Désactivée</Pill>}</Td>
                      <Td className="whitespace-nowrap text-right">
                        {canEdit ? (
                          <div className="flex justify-end gap-1">
                            <Button tone="secondary" onClick={() => setEditingStep({ id: s.id, form: stepFormOf(s) })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              tone="secondary"
                              busy={saveStep.isPending && saveStep.variables?.stepId === s.id}
                              title={s.active ? 'Ne plus appliquer aux nouvelles bandes' : 'Appliquer de nouveau'}
                              onClick={() => saveStep.mutate({ stepId: s.id, body: { active: !s.active } })}
                            >
                              {s.active ? <EyeOff className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                            </Button>
                          </div>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
            {!editingStep ? <ErrorNote error={saveStep.error} /> : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
