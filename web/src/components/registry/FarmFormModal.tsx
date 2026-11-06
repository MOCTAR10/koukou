import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import type { RegistrySheet } from '../../api/types-programme';
import { Button, ErrorNote, Field, FormColumns, inputCls, Modal } from '../form';
import { useFarmStatusItems } from '../programme/FarmStatusModal';
import { readDuplicateConflict } from './duplicates';
import { InfrastructureFields } from './InfrastructureFields';
import { invalidateRegistry, storeSheet, useProgrammeList, useProvinces } from './queries';
import { localitesOf } from './registryQuery';
import { DuplicateNotice } from './shared';
import {
  buildCreateBody,
  buildUpdateBody,
  draftOfSheet,
  EMPTY_CREATE_DRAFT,
  type CreateDraft,
  type SheetDraft,
} from './sheetForm';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Creates a programme farm (`POST /programme/farms`) or corrects its sheet
 * (`PATCH`, `sheet` given). A probable duplicate (409) lists the farms that
 * look alike and lets the admin record it anyway (`confirmDuplicate`).
 */
export function FarmFormModal({
  sheet,
  onClose,
  onSaved,
}: {
  sheet?: RegistrySheet;
  onClose: () => void;
  onSaved: (sheet: RegistrySheet) => void;
}) {
  const editing = !!sheet;
  const queryClient = useQueryClient();
  const provinces = useProvinces();
  const cohorts = useProgrammeList('COHORTE');
  const infraItems = useProgrammeList('INFRASTRUCTURE', !editing);
  const statusItems = useFarmStatusItems();
  const [draft, setDraft] = useState<CreateDraft>(() => (sheet ? { ...EMPTY_CREATE_DRAFT, ...draftOfSheet(sheet) } : EMPTY_CREATE_DRAFT));
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (confirmDuplicate: boolean): Promise<RegistrySheet | null> => {
      if (sheet) {
        const built = buildUpdateBody(draft, sheet, confirmDuplicate);
        if ('unchanged' in built) return null;
        if ('error' in built) throw new ApiError(400, built.error);
        return api.patch<RegistrySheet>(`/programme/farms/${sheet.id}`, built.body);
      }
      const built = buildCreateBody(draft, confirmDuplicate);
      if ('error' in built) throw new ApiError(400, built.error);
      return api.post<RegistrySheet>('/programme/farms', built.body);
    },
    onSuccess: (saved) => {
      if (!saved) return onClose();
      storeSheet(queryClient, saved);
      invalidateRegistry(queryClient, saved.id);
      onSaved(saved);
    },
  });
  const conflict = readDuplicateConflict(save.error);

  const set = <K extends keyof CreateDraft>(key: K, value: CreateDraft[K]) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      // A localité belongs to one province.
      if (key === 'provinceCode' && !localitesOf(provinces.data ?? [], String(value)).some((l) => l.id === d.localiteId)) {
        next.localiteId = '';
      }
      return next;
    });
    setFormError(null);
    // The answer was about the previous values.
    if (save.isError) save.reset();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const built = sheet ? buildUpdateBody(draft as SheetDraft, sheet) : buildCreateBody(draft);
    if ('error' in built) return setFormError(built.error);
    setFormError(null);
    save.mutate(false);
  };

  const localites = draft.provinceCode ? localitesOf(provinces.data ?? [], draft.provinceCode).filter((l) => l.active) : [];
  const text = (key: keyof SheetDraft | 'latitude' | 'longitude' | 'accuracyM', extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input className={inputCls} value={draft[key]} onChange={(e) => set(key, e.target.value)} {...extra} />
  );

  return (
    <Modal large title={sheet ? `Modifier la fiche ${sheet.code ?? ''}` : 'Nouvelle ferme du programme'} onClose={onClose}>
      <form className="space-y-5" onSubmit={submit}>
        <FormColumns>
          <div className="space-y-5">
            <Section title="Identification">
              <Field label="Nom de la ferme">{text('name', { required: true, maxLength: 200, autoFocus: !editing })}</Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Province" hint={editing ? 'Une correction de province ne change pas le code de la ferme.' : 'Donne le préfixe du code (G1-0012).'}>
                  <select className={inputCls} value={draft.provinceCode} onChange={(e) => set('provinceCode', e.target.value)} required>
                    <option value="">— Choisir —</option>
                    {(provinces.data ?? []).map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Localité">
                  <select className={inputCls} value={draft.localiteId} onChange={(e) => set('localiteId', e.target.value)} disabled={!draft.provinceCode}>
                    <option value="">{draft.provinceCode ? '— Aucune —' : 'Choisissez d’abord la province'}</option>
                    {localites.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Référence AMI" hint="Formulaire de l’appel à manifestation d’intérêt ; unique dans le programme.">
                  {text('amiRef', { maxLength: 64 })}
                </Field>
                <Field label="Cohorte">
                  <select className={inputCls} value={draft.cohort} onChange={(e) => set('cohort', e.target.value)}>
                    <option value="">— Aucune —</option>
                    {(cohorts.data ?? []).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                    {sheet?.cohort && !(cohorts.data ?? []).some((c) => c.code === sheet.cohort?.code) ? (
                      <option value={sheet.cohort.code}>{sheet.cohort.label}</option>
                    ) : null}
                  </select>
                </Field>
                <Field label="Capacité (places)" hint="Base du taux d’occupation.">
                  {text('capacityPlaces', { inputMode: 'numeric' })}
                </Field>
              </div>
            </Section>
            <Section title="Exploitant">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nom de l’exploitant">{text('exploitantName', { maxLength: 160 })}</Field>
                <Field label="Téléphone" hint="Sert à activer son compte : il se connecte avec ce numéro.">
                  {text('exploitantPhone', { inputMode: 'tel', placeholder: '+241 74 12 34 56' })}
                </Field>
              </div>
            </Section>
          </div>
          <div className="space-y-5">
            {editing ? (
              <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                <p>
                  Le code <span className="font-mono font-semibold text-slate-900">{sheet.code}</span> ne change jamais.
                </p>
                <p>Le statut, la position GPS et les infrastructures se modifient depuis la fiche.</p>
                {sheet.hasOwnerAccount ? (
                  <p>Le compte de l’exploitant est activé : un nouveau téléphone sur la fiche ne change pas son identifiant de connexion.</p>
                ) : null}
              </div>
            ) : (
              <>
                <Section title="Statut initial">
                  <Field label="Statut" hint="Vide : en préparation.">
                    <select className={inputCls} value={draft.statusCode} onChange={(e) => set('statusCode', e.target.value)}>
                      <option value="">— Par défaut —</option>
                      {(statusItems.data ?? []).map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </Section>
                <Section title="Position GPS">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Latitude">{text('latitude', { inputMode: 'decimal', placeholder: '0,3901' })}</Field>
                    <Field label="Longitude">{text('longitude', { inputMode: 'decimal', placeholder: '9,4544' })}</Field>
                  </div>
                  <Field label="Précision (m)" hint="Degrés décimaux. Un point hors de la province est signalé, jamais bloqué.">
                    {text('accuracyM', { inputMode: 'decimal' })}
                  </Field>
                </Section>
                <Section title="Infrastructures">
                  <InfrastructureFields lines={draft.infrastructures} onChange={(l) => set('infrastructures', l)} items={infraItems.data ?? []} />
                </Section>
              </>
            )}
          </div>
        </FormColumns>
        <ErrorNote error={provinces.error ?? cohorts.error} />
        {conflict ? (
          <DuplicateNotice
            conflict={conflict}
            busy={save.isPending}
            onConfirm={() => save.mutate(true)}
            confirmLabel={editing ? 'Enregistrer quand même' : 'Créer quand même'}
          />
        ) : (
          <ErrorNote error={formError ?? save.error} />
        )}
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          {!conflict ? (
            <Button type="submit" busy={save.isPending}>
              {editing ? 'Enregistrer' : 'Créer la ferme'}
            </Button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
