import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Copy, PencilLine } from 'lucide-react';
import { useFarm } from '../../app/FarmContext';
import { dateFr, num, pct } from '../../lib/format';
import { Button, ErrorNote, Modal } from '../form';
import { Loading } from '../ui';
import { FarmFormModal } from './FarmFormModal';
import { GpsSection } from './GpsSection';
import { OwnerAccountSection } from './OwnerAccountSection';
import { useRegistrySheet } from './queries';
import type { RegistryRights } from './registryAccess';
import { InfrastructuresSection, StatusSection } from './SheetSections';
import { RegistryStatusPill } from './shared';
import { TeamSection } from './TeamSection';
import { VerificationSection } from './VerificationSection';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-slate-100 pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="truncate text-sm text-slate-900">{children ?? '—'}</dd>
    </div>
  );
}

/** Registry sheet of a programme farm, every section with its own action. */
export function RegistrySheetPanel({ farmId, rights, onClose }: { farmId: string; rights: RegistryRights; onClose: () => void }) {
  const navigate = useNavigate();
  const { farms, setFarm } = useFarm();
  const sheet = useRegistrySheet(farmId);
  const [editing, setEditing] = useState(false);
  const s = sheet.data;
  const inSwitcher = farms.some((f) => f.id === farmId);

  return (
    <Modal side wide title={s ? `${s.code ?? 'Ferme'} · ${s.name}` : 'Fiche de la ferme'} onClose={onClose}>
      {sheet.isLoading ? (
        <Loading label="Chargement de la fiche…" />
      ) : !s ? (
        <ErrorNote error={sheet.error ?? 'Fiche introuvable.'} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold text-slate-500">{s.code ?? 'Sans code'}</p>
              <p className="text-lg font-bold text-slate-900">{s.name}</p>
              <p className="text-sm text-slate-500">
                {[s.province ? `${s.province.code} · ${s.province.name}` : null, s.localite?.name].filter(Boolean).join(' — ') || 'Province inconnue'}
              </p>
            </div>
            <RegistryStatusPill status={s.status} active={s.active} />
          </div>
          <div className="flex flex-wrap gap-2">
            {rights.edit ? (
              <Button onClick={() => setEditing(true)}>
                <PencilLine className="h-4 w-4" /> Modifier la fiche
              </Button>
            ) : null}
            {inSwitcher ? (
              <Button
                tone="secondary"
                onClick={() => {
                  setFarm(s.id);
                  navigate('/app/dashboard');
                }}
              >
                Ouvrir l’espace de la ferme <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <Block title="Identification">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Item label="Code">{s.code ? <span className="font-mono">{s.code}</span> : null}</Item>
              <Item label="Province">{s.province?.name}</Item>
              <Item label="Localité">{s.localite?.name}</Item>
              <Item label="Référence AMI">{s.amiRef}</Item>
              <Item label="Cohorte">{s.cohort?.label}</Item>
              <Item label="Ville (météo)">{s.administrativeCity}</Item>
              <Item label="Enregistrée le">{dateFr(s.createdAt)}</Item>
              <Item label="Vérifiée">{s.isVerified ? 'Oui' : 'Non'}</Item>
            </dl>
            {s.duplicateOverride ? (
              <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Enregistrée malgré une ressemblance, confirmée le {dateFr(s.duplicateOverride.confirmedAt)}
                  {s.duplicateOverride.candidateCodes.length ? ` (${s.duplicateOverride.candidateCodes.join(', ')})` : ''}.
                </span>
              </p>
            ) : null}
          </Block>

          <Block title="Exploitant et compte">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Item label="Exploitant">{s.exploitant.name}</Item>
              <Item label="Téléphone">{s.exploitant.phone ? <span className="font-mono">{s.exploitant.phone}</span> : null}</Item>
            </dl>
            <OwnerAccountSection sheet={s} rights={rights} onEditSheet={() => setEditing(true)} />
          </Block>

          {rights.team ? (
            <Block title="Comptes d’équipe">
              <TeamSection farmId={s.id} canSuspend={rights.suspendTeam} />
            </Block>
          ) : null}

          <Block title="Statut">
            <StatusSection sheet={s} canEdit={rights.edit} />
            {/* POUFA lot A droits: Market verification (REGISTRE:VALIDER). */}
            <VerificationSection sheet={s} canVerify={rights.verify} />
          </Block>

          <Block title="Capacité et occupation">
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
              <Item label="Capacité">{s.capacityPlaces != null ? `${num(s.capacityPlaces, 0)} places` : null}</Item>
              <Item label="Poussins en place">{num(s.occupation.chicksPlaced, 0)}</Item>
              <Item label="Taux d’occupation">{s.occupation.ratePct != null ? pct(s.occupation.ratePct) : null}</Item>
            </dl>
            {s.capacityPlaces == null ? <p className="text-xs text-slate-500">Renseignez la capacité pour calculer le taux d’occupation.</p> : null}
          </Block>

          <Block title="Position GPS">
            <GpsSection sheet={s} canEdit={rights.gps} />
          </Block>

          <Block title="Infrastructures">
            <InfrastructuresSection sheet={s} canEdit={rights.edit} />
          </Block>
        </div>
      )}
      {editing && s ? <FarmFormModal sheet={s} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} /> : null}
    </Modal>
  );
}
