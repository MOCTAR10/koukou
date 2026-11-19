import { useEffect, useState, type FormEvent } from 'react';
import { Check, Search } from 'lucide-react';
import { classNames } from '../../lib/format';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import { Loading } from '../ui';
import type { FinancingFarmOption } from '../../api/types-financing';
import { useCreateFile, useFarmSearch } from './queries';
import { FcfaInput } from './shared';

/** Picks a farm of the programme (search by code, name, exploitant or province). */
function FarmPickerField({ value, onPick }: { value: FinancingFarmOption | null; onPick: (f: FinancingFarmOption) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const search = useFarmSearch(debounced);
  const items = search.data ?? [];
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          className={classNames(inputCls, 'pl-9')}
          type="search"
          placeholder="Code, nom, exploitant ou province"
          aria-label="Rechercher une ferme du programme"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200" role="listbox" aria-label="Fermes du programme">
        {search.isLoading ? (
          <div className="p-3">
            <Loading />
          </div>
        ) : search.isError ? (
          <p className="p-3 text-sm text-slate-600">La liste des fermes n’a pas pu être chargée.</p>
        ) : items.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">Aucune ferme ne correspond.</p>
        ) : (
          items.map((f) => {
            const selected = value?.id === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onPick(f)}
                className={classNames('flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50', selected && 'bg-brand-50')}
              >
                <span className="w-20 shrink-0 font-mono text-xs font-semibold text-slate-500">{f.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{f.name}</span>
                  <span className="block truncate text-xs text-slate-500">{[f.provinceName, f.exploitantName].filter(Boolean).join(' · ')}</span>
                </span>
                {selected ? <Check className="h-4 w-4 shrink-0 text-brand-700" aria-label="Ferme choisie" /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Opens a financing file: the farm, what the money is for, the amount asked. */
export function NewFileModal({ onClose, onCreated }: { onClose: () => void; onCreated: (fileId: string) => void }) {
  const create = useCreateFile();
  const [farm, setFarm] = useState<FinancingFarmOption | null>(null);
  const [purpose, setPurpose] = useState('');
  const [requested, setRequested] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!farm) return;
    create.mutate(
      { farmId: farm.id, purpose: purpose.trim(), requestedFcfa: requested, notes: notes.trim() || null },
      { onSuccess: (file) => onCreated(file.id) },
    );
  };

  return (
    <Modal title="Nouveau dossier de financement" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Ferme">
          <FarmPickerField value={farm} onPick={setFarm} />
        </Field>
        {farm ? (
          <p className="text-sm text-slate-700">
            Ferme choisie : <span className="font-semibold">{farm.name}</span> <span className="font-mono text-xs text-slate-500">{farm.code}</span>
          </p>
        ) : null}
        <Field label="Objet du financement" hint="Par exemple : bâtiment d’élevage, matériel, fonds de roulement.">
          <input className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)} required maxLength={200} />
        </Field>
        <Field label="Montant demandé">
          <FcfaInput value={requested} onChange={setRequested} />
        </Field>
        <Field label="Note (facultatif)">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
        <ErrorNote error={create.error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={create.isPending} disabled={!farm || purpose.trim().length < 3}>
            Ouvrir le dossier
          </Button>
        </div>
      </form>
    </Modal>
  );
}
