import { Eye, LayoutGrid } from 'lucide-react';
import type { UiMode } from '../../api/types';
import { classNames } from '../../lib/format';

export const UI_MODE_LABEL: Record<UiMode, string> = {
  SIMPLE: 'Simple',
  COMPLET: 'Complet',
};

export const UI_MODE_HINT: Record<UiMode, string> = {
  SIMPLE: 'grandes icônes, saisie seulement',
  COMPLET: 'toute l’application',
};

const MODES: UiMode[] = ['SIMPLE', 'COMPLET'];

/** « Mode d’affichage » of an account: two big choices, Simple or Complet. */
export function UiModePicker({
  value,
  onChange,
  disabled,
}: {
  value: UiMode;
  onChange: (mode: UiMode) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Mode d’affichage" className="grid grid-cols-2 gap-2">
      {MODES.map((mode) => {
        const on = value === mode;
        const Icon = mode === 'SIMPLE' ? Eye : LayoutGrid;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onChange(mode)}
            className={classNames(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-left disabled:opacity-60',
              on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>
              <span className="block text-sm font-semibold">{UI_MODE_LABEL[mode]}</span>
              <span className={classNames('block text-xs', on ? 'text-brand-100' : 'text-slate-500')}>{UI_MODE_HINT[mode]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
