import { Plus, Trash2 } from 'lucide-react';
import type { RefItem } from '../../api/types-programme';
import { inlineInputCls, inputCls } from '../form';
import { IconButton } from '../ui';
import type { InfraDraft } from './sheetForm';

/**
 * Lines of the INFRASTRUCTURE list (type, count, surface). `known` labels
 * codes no longer active that the farm still has.
 */
export function InfrastructureFields({
  lines,
  onChange,
  items,
  known = [],
}: {
  lines: InfraDraft[];
  onChange: (lines: InfraDraft[]) => void;
  items: RefItem[];
  known?: Array<{ code: string; label: string }>;
}) {
  const set = (i: number, patch: Partial<InfraDraft>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const taken = new Set(lines.map((l) => l.code));
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const options = [
          ...items.filter((it) => it.active && (!taken.has(it.code) || it.code === line.code)),
          ...known.filter((k) => k.code === line.code && !items.some((it) => it.code === k.code && it.active)),
        ];
        return (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
            <label className="min-w-40 flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">Type</span>
              <select className={inputCls} value={line.code} onChange={(e) => set(i, { code: e.target.value })}>
                <option value="">— Choisir —</option>
                {options.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-600">Nombre</span>
              <input className={`${inlineInputCls} w-20`} inputMode="numeric" value={line.count} onChange={(e) => set(i, { count: e.target.value })} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-600">Surface (m²)</span>
              <input className={`${inlineInputCls} w-24`} inputMode="decimal" value={line.surfaceM2} onChange={(e) => set(i, { surfaceM2: e.target.value })} />
            </label>
            <IconButton label="Retirer cette ligne" danger onClick={() => onChange(lines.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...lines, { code: '', count: '1', surfaceM2: '' }])}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter une infrastructure
      </button>
    </div>
  );
}
