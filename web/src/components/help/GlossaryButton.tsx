import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { Modal } from '../form';
import { GLOSSARY, type GlossaryKey } from './glossary';

function GlossaryModal({ keys, onClose }: { keys: GlossaryKey[]; onClose: () => void }) {
  return (
    <Modal title="Comprendre les indicateurs" onClose={onClose}>
      <div className="space-y-4 text-left font-normal">
        {keys.map((k) => {
          const e = GLOSSARY[k];
          return (
            <div key={k} className="rounded-lg bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">{e.term}</p>
              <p className="mt-1 text-sm text-slate-600">{e.definition}</p>
              {e.formula ? <p className="mt-1 text-sm font-medium text-brand-700">Formule : {e.formula}</p> : null}
              {e.note ? <p className="mt-1 text-xs text-slate-500">{e.note}</p> : null}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** Info icon opening the definitions of the given indicators (portaled: it often sits in a heading). */
export function GlossaryButton({ keys, label = 'Définitions' }: { keys: GlossaryKey[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Voir les définitions des indicateurs"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-brand-700"
      >
        <Info className="h-3.5 w-3.5" /> {label}
      </button>
      {open ? createPortal(<GlossaryModal keys={keys} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}
