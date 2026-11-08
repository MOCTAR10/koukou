import { Plus } from 'lucide-react';
import type { ParameterView } from '../../api/types-admin';
import { dateTimeFr } from '../../lib/format';
import { Note, Pill, type Tone } from '../flock/shared';
import { Button, ErrorNote, Modal } from '../form';
import { Loading } from '../ui';
import {
  classifyVersions,
  formatParameterValue,
  isDefaultSince,
  isProposedVersion,
  ownerLabel,
  rangeLabel,
  TYPE_LABELS,
  VERSION_STATE_LABELS,
  type VersionState,
} from './parameters';
import { OWNER_PROFILES_CLOSED_TO_PLATFORM, ownerRightLabel } from './adminRights';
import { useParameterHistory } from './queries';

/** Who may propose a value: the owner right from the matrix (POUFA lot A2 vet). */
function ownerProposalNote(owner: string): string {
  const right = ownerRightLabel(owner);
  const who = right ? `les profils qui ont le droit « ${right} » (par défaut « ${ownerLabel(owner)} »)` : `le profil « ${ownerLabel(owner)} »`;
  return OWNER_PROFILES_CLOSED_TO_PLATFORM.includes(owner)
    ? `Seuls ${who} peuvent proposer une nouvelle valeur ; l’administrateur plateforme la consulte.`
    : `Seuls ${who}, ou l’administrateur plateforme, peuvent proposer une nouvelle valeur.`;
}

const STATE_TONE: Record<VersionState, Tone> = { FUTURE: 'brand', IN_FORCE: 'emerald', PAST: 'slate' };

/** One parameter: its definition and every version, scheduled ones included (versions are never rewritten). */
export function ParameterHistoryPanel({
  param,
  canPropose,
  onPropose,
  onClose,
}: {
  param: ParameterView;
  canPropose: boolean;
  onPropose: () => void;
  onClose: () => void;
}) {
  const history = useParameterHistory(param.key);
  const versions = history.data ? classifyVersions(history.data, new Date()) : [];

  return (
    <Modal side wide title={param.label} onClose={onClose}>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Clé</dt>
          <dd className="font-mono text-xs text-slate-800">{param.key}</dd>
          <dt className="text-slate-500">Type</dt>
          <dd>
            {TYPE_LABELS[param.type]}
            {param.unit ? ` · ${param.unit}` : ''}
          </dd>
          {rangeLabel(param) ? (
            <>
              <dt className="text-slate-500">Bornes</dt>
              <dd>{rangeLabel(param)}</dd>
            </>
          ) : null}
          <dt className="text-slate-500">Profil responsable</dt>
          <dd>{ownerLabel(param.ownerProfile)}</dd>
          {param.defaultValue !== undefined ? (
            <>
              <dt className="text-slate-500">Valeur par défaut</dt>
              <dd className={param.type === 'formula' ? 'break-words font-mono text-xs' : undefined}>
                {formatParameterValue(param.type, param.defaultValue, param.unit)}
                {param.defaultNote ? <span className="block text-xs text-amber-700">{param.defaultNote}</span> : null}
              </dd>
            </>
          ) : null}
        </dl>

        {canPropose ? (
          <Button onClick={onPropose}>
            <Plus className="h-4 w-4" /> Nouvelle valeur
          </Button>
        ) : (
          <p className="text-xs text-slate-500">
            {ownerProposalNote(param.ownerProfile)}
          </p>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Versions</h3>
          {history.isLoading ? <Loading /> : null}
          <ErrorNote error={history.error} />
          {history.data && versions.length === 0 ? <p className="text-sm text-slate-500">Aucune version enregistrée.</p> : null}
          <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
            {versions.map((v) => (
              <li key={v.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={STATE_TONE[v.state]}>{VERSION_STATE_LABELS[v.state]}</Pill>
                  {isProposedVersion(v) ? <Pill tone="amber">Proposé (cahier des charges)</Pill> : null}
                  <span className="text-xs text-slate-500">{isDefaultSince(v.validFrom) ? 'valeur par défaut' : `à partir du ${dateTimeFr(v.validFrom)}`}</span>
                </div>
                <p className={param.type === 'formula' ? 'break-words font-mono text-xs text-slate-900' : 'font-semibold text-slate-900'}>
                  {formatParameterValue(param.type, v.value, param.unit)}
                </p>
                {v.reason ? <p className="text-xs text-slate-600">Motif : {v.reason}</p> : null}
                <p className="text-[11px] text-slate-500">
                  Enregistrée le {dateTimeFr(v.createdAt)}
                  {v.createdById
                    ? v.createdByName
                      ? ` · par ${v.createdByName}`
                      : ` · auteur ${v.createdById.slice(0, 8)}… (voir le journal d’audit)`
                    : ' · par le serveur (valeur initiale)'}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <Note tone="slate">
          Les versions sont immuables : une erreur se corrige par une nouvelle version, qui s’applique à partir de sa date. Les calculs passés
          gardent la valeur alors en vigueur.
        </Note>
      </div>
    </Modal>
  );
}
