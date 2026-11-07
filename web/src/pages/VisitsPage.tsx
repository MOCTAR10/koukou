import { useState } from 'react';
import { ClipboardCheck, CloudOff, Globe2, Plus, Tractor, Trash2 } from 'lucide-react';
import type { BiosecurityClass, VisitType, VisitView } from '../api/types-visits';
import { useFarm } from '../app/FarmContext';
import { useInstitutionAccess } from '../app/useInstitutionAccess';
import { useAuth } from '../auth/AuthContext';
import { Pill, Tabs } from '../components/flock/shared';
import { Button, ErrorNote, inlineInputCls, Modal } from '../components/form';
import { useProvinces } from '../components/registry/queries';
import { VisitDetail, ScoreBadge } from '../components/visits/VisitDetail';
import { VisitFormModal } from '../components/visits/VisitFormModal';
import { useFarmVisits, useProgrammeVisits } from '../components/visits/queries';
import { CLASS_LABEL, VISIT_TYPE_LABEL, visitRights } from '../components/visits/visitRules';
import { Card, DataTable, EmptyState, Loading, PageHeader, Td, Th } from '../components/ui';
import { dateFr } from '../lib/format';
import { dismissRejected, useOfflineQueue } from '../offline';

type TabKey = 'ferme' | 'programme';

/**
 * Technical visits and biosecurity controls (CDC n° 45, n° 27): the active
 * farm's visits with the grid, score and class, a form for the agent
 * (TECHNIQUE:VALIDER), and the programme list for institutions, filterable by
 * province, class and type. Rights come from the matrix (`visitRights`).
 */
export function VisitsPage() {
  const { user } = useAuth();
  const { farmId } = useFarm();
  const inst = useInstitutionAccess();
  const rights = visitRights(user?.role, inst.access?.profile);
  const [tab, setTab] = useState<TabKey>('ferme');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<{ farmId: string; id: string } | null>(null);
  const [filters, setFilters] = useState({ province: '', classification: '', type: '', retard: '' });

  const { pending, rejected } = useOfflineQueue();
  // Visits recorded on this device that the server has not confirmed yet, or refused.
  const waiting = pending.filter((o) => o.kind === 'visit' && o.farmId === farmId);
  const refused = rejected.filter((o) => o.kind === 'visit' && o.farmId === farmId);
  const farmVisits = useFarmVisits(farmId, rights.view);
  const programme = useProgrammeVisits(filters, rights.programme && tab === 'programme');
  const provinces = useProvinces(rights.programme && tab === 'programme');

  if (!rights.view) {
    return (
      <div className="space-y-5">
        <PageHeader title="Visites techniques" icon={<ClipboardCheck />} />
        <EmptyState icon={<ClipboardCheck />} message="Votre profil ne donne pas accès aux visites techniques." />
      </div>
    );
  }

  const rows: VisitView[] = tab === 'ferme' ? (farmVisits.data ?? []) : (programme.data?.items ?? []);
  const loading = tab === 'ferme' ? farmVisits.isLoading : programme.isLoading;
  const error = tab === 'ferme' ? farmVisits.error : programme.error;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Visites techniques et biosécurité"
        icon={<ClipboardCheck />}
        subtitle="Visites des agents du programme : observations, recommandations, grille de biosécurité, score et classe."
        actions={
          rights.write && farmId ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nouvelle visite
            </Button>
          ) : undefined
        }
      />
      {rights.programme ? (
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          options={[
            { key: 'ferme', label: 'Cette ferme', icon: <Tractor /> },
            { key: 'programme', label: 'Programme', icon: <Globe2 /> },
          ]}
        />
      ) : null}

      {tab === 'programme' ? (
        <div className="flex flex-wrap gap-3" role="group" aria-label="Filtres">
          <select
            aria-label="Province"
            className={`${inlineInputCls} w-auto`}
            value={filters.province}
            onChange={(e) => setFilters({ ...filters, province: e.target.value })}
          >
            <option value="">Toutes les provinces</option>
            {(provinces.data ?? []).map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Classe"
            className={`${inlineInputCls} w-auto`}
            value={filters.classification}
            onChange={(e) => setFilters({ ...filters, classification: e.target.value })}
          >
            <option value="">Toutes les classes</option>
            {(Object.keys(CLASS_LABEL) as BiosecurityClass[]).map((c) => (
              <option key={c} value={c}>
                {CLASS_LABEL[c]}
              </option>
            ))}
          </select>
          <select
            aria-label="Type de visite"
            className={`${inlineInputCls} w-auto`}
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          >
            <option value="">Tous les types</option>
            {(Object.keys(VISIT_TYPE_LABEL) as VisitType[]).map((t) => (
              <option key={t} value={t}>
                {VISIT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <select
            aria-label="Prochaine visite"
            className={`${inlineInputCls} w-auto`}
            value={filters.retard}
            onChange={(e) => setFilters({ ...filters, retard: e.target.value })}
          >
            <option value="">Toutes les visites</option>
            <option value="oui">Prochaine visite en retard</option>
          </select>
        </div>
      ) : null}

      {tab === 'ferme' && (waiting.length > 0 || refused.length > 0) ? (
        <Card className="space-y-2 p-4">
          {waiting.map((op) => (
            <p key={op.id} className="flex items-start gap-2 text-sm text-amber-800">
              <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>En attente d’envoi</b> · {op.label} · enregistrée le {new Date(op.createdAt).toLocaleString('fr-FR')} (partira au retour de la connexion).
              </span>
            </p>
          ))}
          {refused.map((op) => (
            <div key={op.id} className="flex items-start justify-between gap-3 text-sm text-red-700">
              <span>
                <b>Refusée par le serveur</b> · {op.label} : {op.reason} Saisissez-la à nouveau.
              </span>
              <button type="button" onClick={() => dismissRejected(op.id)} className="shrink-0 rounded p-1 text-slate-400 hover:text-red-600" aria-label={`Retirer : ${op.label}`} title="Retirer de la liste">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </Card>
      ) : null}
      <ErrorNote error={error} />
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4">
            <Loading label="Chargement des visites…" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<ClipboardCheck />} message="Aucune visite enregistrée." />
          </div>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Jour</Th>
                {tab === 'programme' ? <Th>Ferme</Th> : null}
                <Th>Type</Th>
                <Th className="hidden lg:table-cell">Bande</Th>
                <Th>Biosécurité</Th>
                <Th className="hidden lg:table-cell">Prochaine visite</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId({ farmId: v.farmId, id: v.id })}>
                  <Td className="whitespace-nowrap font-semibold">{dateFr(v.visitDate)}</Td>
                  {tab === 'programme' ? (
                    <Td label="Ferme">
                      <span className="font-mono text-xs">{v.farmCode}</span> {v.farmName}
                    </Td>
                  ) : null}
                  <Td label="Type">
                    {VISIT_TYPE_LABEL[v.type]}
                    {v.visaFrom ? (
                      <span className="ml-2">
                        <Pill tone="brand">Visa</Pill>
                      </span>
                    ) : null}
                  </Td>
                  <Td label="Bande" className="md:max-lg:hidden">
                    {v.batchCode ?? '—'}
                  </Td>
                  <Td label="Biosécurité">
                    <ScoreBadge visit={v} />
                  </Td>
                  <Td label="Prochaine visite" className="md:max-lg:hidden">
                    {v.nextVisitDate ? dateFr(v.nextVisitDate) : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>

      {creating && farmId ? (
        <VisitFormModal
          farmId={farmId}
          onClose={() => setCreating(false)}
          onSaved={(v) => {
            setCreating(false);
            setOpenId({ farmId: v.farmId, id: v.id });
          }}
        />
      ) : null}
      {openId ? (
        <Modal title="Visite" side onClose={() => setOpenId(null)}>
          <VisitDetail farmId={openId.farmId} id={openId.id} canAddPhotos={rights.write} />
        </Modal>
      ) : null}
    </div>
  );
}
