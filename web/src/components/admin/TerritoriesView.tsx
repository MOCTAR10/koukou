import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Info, MapPinned, Pencil, Plus, Power, RotateCcw, Upload } from 'lucide-react';
import { api } from '../../api/client';
import type { CreateLocaliteBody, LocaliteKind, SetGeometryResult, UpdateLocaliteBody } from '../../api/types-admin';
import type { LocaliteView, ProvinceView } from '../../api/types-programme';
import { classNames } from '../../lib/format';
import { Note, Pill } from '../flock/shared';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { Card, DataTable, IconButton, Loading, Td, Th } from '../ui';
import type { AdminRights } from './adminRights';
import { boundaryFromText, type GeometryResult } from './geojson';
import { invalidateTerritories, useProvincesAdmin } from './queries';

const KIND_LABELS: Record<LocaliteKind, string> = { DEPARTEMENT: 'Département', COMMUNE: 'Commune', AUTRE: 'Autre' };
const KINDS = Object.keys(KIND_LABELS) as LocaliteKind[];

/**
 * Provinces (seeded, fixed) and their localités: add, rename, reclassify,
 * deactivate (never deleted; the code and the province never change), and
 * the boundary each province's GPS check uses (GeoJSON upload).
 */
export function TerritoriesView({ rights }: { rights: AdminRights['lists'] }) {
  const provinces = useProvincesAdmin(rights.readInactive);
  const [adding, setAdding] = useState<ProvinceView | null>(null);
  const [editing, setEditing] = useState<{ province: ProvinceView; localite: LocaliteView } | null>(null);
  const [toggling, setToggling] = useState<LocaliteView | null>(null);
  const [uploading, setUploading] = useState<ProvinceView | null>(null);

  return (
    <div className="space-y-4">
      <Note tone="slate" icon={<Info />}>
        Les 9 provinces sont fixes. Le contour d’une province sert à vérifier qu’un point GPS du registre est bien dans sa province : un point
        hors contour est signalé, jamais refusé. Sans contour chargé, la vérification n’a pas lieu.
        {!rights.readInactive ? ' Les localités désactivées ne sont visibles que par l’administrateur plateforme.' : ''}
        {!rights.write ? ' Consultation seule : la modification demande le droit Administration · Administrer.' : ''}
      </Note>
      <ErrorNote error={provinces.error} />
      {provinces.isLoading ? <Loading /> : null}

      <div className="grid gap-4 @container xl:grid-cols-2">
        {(provinces.data ?? []).map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  <span className="mr-1.5 font-mono text-xs text-slate-500">{p.code}</span>
                  {p.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Chef-lieu : {p.chefLieu ?? '—'} · {p.localites.length} localité{p.localites.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {p.hasGeometry ? (
                  <Pill tone="emerald">Contour chargé</Pill>
                ) : (
                  <Pill tone="amber">Sans contour</Pill>
                )}
                {rights.write ? (
                  <>
                    <Button tone="secondary" className="px-2.5 py-1 text-xs" onClick={() => setUploading(p)}>
                      <Upload className="h-3.5 w-3.5" /> {p.hasGeometry ? 'Remplacer le contour' : 'Charger le contour'}
                    </Button>
                    <Button tone="secondary" className="px-2.5 py-1 text-xs" onClick={() => setAdding(p)}>
                      <Plus className="h-3.5 w-3.5" /> Localité
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Localité</Th>
                  <Th>Code</Th>
                  <Th>Type</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {p.localites.map((l) => (
                  <tr key={l.id} className={classNames('border-t border-slate-100', !l.active && 'bg-slate-50/60')}>
                    <Td>
                      <span className={classNames('font-medium', l.active ? 'text-slate-900' : 'text-slate-500 line-through')}>{l.name}</span>
                      {l.chefLieu ? <span className="block text-xs text-slate-500">Chef-lieu : {l.chefLieu}</span> : null}
                      {!l.active ? <span className="block text-xs text-slate-500">Désactivée</span> : null}
                    </Td>
                    <Td label="Code">
                      <span className="font-mono text-xs">{l.code}</span>
                    </Td>
                    <Td label="Type">
                      <span className="text-xs">{KIND_LABELS[l.kind as LocaliteKind] ?? l.kind}</span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {rights.write ? (
                        <div className="flex justify-end gap-1">
                          <IconButton label={`Modifier ${l.name}`} onClick={() => setEditing({ province: p, localite: l })}>
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton label={l.active ? `Désactiver ${l.name}` : `Réactiver ${l.name}`} danger={l.active} onClick={() => setToggling(l)}>
                            {l.active ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                          </IconButton>
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        ))}
      </div>

      {adding ? <LocaliteModal province={adding} onClose={() => setAdding(null)} /> : null}
      {editing ? <LocaliteModal province={editing.province} localite={editing.localite} onClose={() => setEditing(null)} /> : null}
      {toggling ? <ToggleLocaliteModal localite={toggling} readInactive={rights.readInactive} onClose={() => setToggling(null)} /> : null}
      {uploading ? <GeometryModal province={uploading} onClose={() => setUploading(null)} /> : null}
    </div>
  );
}

function LocaliteModal({ province, localite, onClose }: { province: ProvinceView; localite?: LocaliteView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(localite?.name ?? '');
  const [kind, setKind] = useState<LocaliteKind>((localite?.kind as LocaliteKind) ?? 'AUTRE');
  const [chefLieu, setChefLieu] = useState(localite?.chefLieu ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      if (localite) {
        const body: UpdateLocaliteBody = {};
        if (name.trim() !== localite.name) body.name = name.trim();
        if (kind !== localite.kind) body.kind = kind;
        if (chefLieu.trim() !== (localite.chefLieu ?? '')) body.chefLieu = chefLieu.trim();
        return api.patch(`/programme/localites/${localite.id}`, body);
      }
      const body: CreateLocaliteBody = { provinceCode: province.code, name: name.trim(), kind, ...(chefLieu.trim() ? { chefLieu: chefLieu.trim() } : {}) };
      return api.post('/programme/localites', body);
    },
    onSuccess: () => {
      invalidateTerritories(queryClient);
      onClose();
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setFormError('Le nom est obligatoire.');
    if (name.trim().length > 120 || chefLieu.trim().length > 120) return setFormError('120 caractères au maximum.');
    setFormError(null);
    save.mutate();
  };

  return (
    <Modal title={localite ? `Modifier ${localite.name}` : `Nouvelle localité · ${province.name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        {localite ? (
          <p className="text-xs text-slate-500">
            Code <span className="font-mono">{localite.code}</span>, province {province.code} : ils ne changent jamais. Les fiches qui utilisent
            cette localité affichent le nouveau nom.
          </p>
        ) : (
          <p className="text-xs text-slate-500">Le code (du type {province.code}-07) est attribué par le serveur, à la suite des existants.</p>
        )}
        <Field label="Nom">
          <input className={inputCls} value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as LocaliteKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Chef-lieu">
            <input className={inputCls} value={chefLieu} maxLength={120} onChange={(e) => setChefLieu(e.target.value)} />
          </Field>
        </div>
        <ErrorNote error={formError ?? save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending}>
            {localite ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ToggleLocaliteModal({ localite, readInactive, onClose }: { localite: LocaliteView; readInactive: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const deactivating = localite.active;
  const save = useMutation({
    mutationFn: () => api.patch(`/programme/localites/${localite.id}`, { active: !deactivating } satisfies UpdateLocaliteBody),
    onSuccess: () => {
      invalidateTerritories(queryClient);
      onClose();
    },
  });
  return (
    <Modal title={deactivating ? `Désactiver ${localite.name} ?` : `Réactiver ${localite.name} ?`} onClose={onClose}>
      <div className="space-y-4 text-sm text-slate-700">
        <p>
          {deactivating
            ? 'La localité ne sera plus proposée pour les nouvelles fiches. Elle n’est jamais supprimée : les fiches qui l’utilisent la gardent.'
            : 'La localité sera de nouveau proposée.'}
        </p>
        {deactivating && !readInactive ? <Note tone="amber">Vous ne la verrez plus ici : seul l’administrateur plateforme peut la réactiver.</Note> : null}
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button tone={deactivating ? 'danger' : 'primary'} busy={save.isPending} onClick={() => save.mutate()}>
            {deactivating ? 'Désactiver' : 'Réactiver'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function GeometryModal({ province, onClose }: { province: ProvinceView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<GeometryResult | null>(null);
  const [fileName, setFileName] = useState('');
  const send = useMutation({
    mutationFn: () => {
      if (!result?.ok) throw new Error('Choisissez un contour valide.');
      return api.put<SetGeometryResult>(`/programme/provinces/${encodeURIComponent(province.code)}/geometry`, { geometry: result.geometry });
    },
    onSuccess: () => invalidateTerritories(queryClient),
  });

  const readFile = async (file: File | undefined) => {
    send.reset();
    setResult(null);
    if (!file) return;
    setFileName(file.name);
    if (file.size > 20 * 1024 * 1024) {
      setResult({ ok: false, error: 'Fichier trop lourd pour être lu dans le navigateur (20 Mo au plus) : simplifiez le contour.' });
      return;
    }
    setResult(boundaryFromText(await file.text()));
  };

  return (
    <Modal title={`Contour · ${province.code} ${province.name}`} onClose={onClose}>
      {send.isSuccess ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Contour enregistré : les prochains relevés GPS des fermes de {province.name} seront vérifiés avec lui.
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Fermer</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Fichier GeoJSON (.geojson ou .json) en WGS 84 : un Polygon ou un MultiPolygon, ou un objet Feature / FeatureCollection qui en
            contient (plusieurs polygones sont réunis). Les positions sont arrondies à 5 décimales (environ 1 m).
            {province.hasGeometry ? ' Le contour actuel sera remplacé.' : ''}
          </p>
          <Field label="Fichier">
            <input type="file" accept=".geojson,.json,application/geo+json,application/json" className={inputCls} onChange={(e) => void readFile(e.target.files?.[0])} />
          </Field>
          {result?.ok ? (
            <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
              <MapPinned className="mt-0.5 h-4 w-4 shrink-0" />
              {fileName} : {result.polygons} polygone{result.polygons > 1 ? 's' : ''}, {result.points.toLocaleString('fr-FR')} points (
              {Math.ceil(result.bytes / 1024)} Ko).
            </p>
          ) : null}
          <ErrorNote error={result && !result.ok ? result.error : send.error} />
          <div className="flex justify-end gap-2">
            <Button tone="secondary" onClick={onClose} disabled={send.isPending}>
              Annuler
            </Button>
            <Button disabled={!result?.ok} busy={send.isPending} onClick={() => send.mutate()}>
              <Upload className="h-4 w-4" /> Enregistrer le contour
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
