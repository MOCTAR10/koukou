import { useState } from 'react';
import type { AuditRowChange } from '../../api/types-admin';
import { classNames } from '../../lib/format';
import { rowDiff, type DiffKind } from './audit';

const KIND_CLS: Record<DiffKind, string> = {
  added: 'bg-emerald-50',
  removed: 'bg-red-50',
  changed: 'bg-amber-50',
  same: '',
};

/** Before / after of one row change, column by column; unchanged columns on demand. */
export function DiffView({ change }: { change: Pick<AuditRowChange, 'before' | 'after'> }) {
  const [showSame, setShowSame] = useState(false);
  const lines = rowDiff(change);
  const same = lines.filter((l) => l.kind === 'same').length;
  const shown = showSame ? lines : lines.filter((l) => l.kind !== 'same');

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Colonne</th>
              <th className="px-2 py-1.5 font-semibold">Avant</th>
              <th className="px-2 py-1.5 font-semibold">Après</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.key} className={classNames('border-t border-slate-100 align-top', KIND_CLS[l.kind])}>
                <td className="whitespace-nowrap px-2 py-1 font-mono text-slate-700">{l.key}</td>
                <td className={classNames('max-w-xs break-all px-2 py-1 font-mono', l.kind === 'changed' || l.kind === 'removed' ? 'text-red-800' : 'text-slate-600')}>
                  {l.before ?? <span className="text-slate-400">—</span>}
                </td>
                <td className={classNames('max-w-xs break-all px-2 py-1 font-mono', l.kind === 'changed' || l.kind === 'added' ? 'text-emerald-800' : 'text-slate-600')}>
                  {l.after ?? <span className="text-slate-400">—</span>}
                </td>
              </tr>
            ))}
            {!shown.length ? (
              <tr>
                <td colSpan={3} className="px-2 py-2 text-slate-500">
                  Aucune colonne modifiée.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {same > 0 ? (
        <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => setShowSame((v) => !v)}>
          {showSame ? 'Masquer les colonnes inchangées' : `Afficher les ${same} colonne${same > 1 ? 's' : ''} inchangée${same > 1 ? 's' : ''}`}
        </button>
      ) : null}
    </div>
  );
}
