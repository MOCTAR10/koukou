import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import type { ConsentClause } from '../../api/types-financing';
import { classNames } from '../../lib/format';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import { addCategory, templateError } from './financingLogic';
import { useUploadTemplate } from './queries';
import { FilePick } from './shared';

/** Categories the bank can pick from; it may type its own. */
const CATEGORY_SUGGESTIONS = [
  'Identité et contact de l’exploitant',
  'Production : bandes, effectifs, mortalité',
  'Résultats économiques : ventes et charges',
  'Livraisons et appui du programme',
  'Alertes sanitaires et visites techniques',
  'États financiers (comptabilité SYSCOHADA)',
];

/** Files a new version of the consent template: the document, what the farmer is told, and the mandatory mentions. */
export function TemplateModal({ clauses, onClose }: { clauses: ConsentClause[]; onClose: () => void }) {
  const upload = useUploadTemplate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [retention, setRetention] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [draftCategory, setDraftCategory] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const error = templateError({ title, purpose, retention, dataCategories: categories, confirmedClauses: ticked, hasFile: !!file }, clauses);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (error || !file) {
      setShowErrors(true);
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('title', title.trim());
    form.append('purpose', purpose.trim());
    form.append('retention', retention.trim());
    form.append('dataCategories', JSON.stringify(categories));
    form.append('confirmedClauses', JSON.stringify(ticked));
    upload.mutate(form, { onSuccess: onClose });
  };

  const addDraft = () => {
    setCategories((c) => addCategory(c, draftCategory));
    setDraftCategory('');
  };

  return (
    <Modal title="Déposer un nouveau modèle de consentement" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900 ring-1 ring-brand-100">
          Une nouvelle version ne change pas les consentements déjà donnés : ils restent valables sous la version qui les a recueillis. Seuls les nouveaux consentements utilisent le nouveau modèle.
        </p>
        <Field label="Document du modèle (PDF)">
          <FilePick file={file} onPick={setFile} accept=".pdf,application/pdf" label="Choisir le PDF" />
        </Field>
        <Field label="Titre du modèle">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        </Field>
        <Field label="Finalité" hint="À quoi servent les données, écrit comme vous le souhaitez : l’exploitant le lira tel quel avant de consentir.">
          <textarea className={inputCls} rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} />
        </Field>
        {purpose.trim() ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
            <p className="text-xs font-medium text-slate-500">Ce que lira l’exploitant</p>
            <p className="mt-1">J’accepte que les données de ma ferme soient partagées avec la BCEG dans le but suivant :</p>
            <p className="mt-1 font-medium text-slate-900">«&nbsp;{purpose.trim()}&nbsp;»</p>
          </div>
        ) : null}

        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Catégories de données partagées</p>
          {categories.length > 0 ? (
            <ul className="mb-2 flex flex-wrap gap-2">
              {categories.map((c) => (
                <li key={c} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm text-slate-800 ring-1 ring-slate-200">
                  {c}
                  <button type="button" aria-label={`Retirer la catégorie ${c}`} className="rounded-full p-1 text-slate-500 hover:bg-white hover:text-slate-800" onClick={() => setCategories((l) => l.filter((x) => x !== c))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={draftCategory}
              placeholder="Ajouter une catégorie"
              aria-label="Nouvelle catégorie de données"
              onChange={(e) => setDraftCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDraft();
                }
              }}
              maxLength={120}
            />
            <Button tone="secondary" onClick={addDraft} disabled={!draftCategory.trim()}>
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>Suggestions :</span>
            {CATEGORY_SUGGESTIONS.filter((s) => !categories.some((c) => c.toLowerCase() === s.toLowerCase())).map((s) => (
              <button key={s} type="button" className="rounded-full border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-50" onClick={() => setCategories((c) => addCategory(c, s))}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <Field label="Durée de conservation" hint="Combien de temps la BCEG garde les données, et ce qui se passe ensuite.">
          <input className={inputCls} value={retention} onChange={(e) => setRetention(e.target.value)} maxLength={300} />
        </Field>

        <fieldset className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-800">Mentions obligatoires</legend>
          <p className="mb-2 text-xs text-slate-600">
            La BCEG confirme que son document contient chacune de ces mentions (loi n° 001/2011 modifiée par la loi n° 025/2023). Toutes doivent être cochées.
          </p>
          <ul className="space-y-1">
            {clauses.map((c) => (
              <li key={c.code}>
                <label className={classNames('flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50', ticked.includes(c.code) && 'bg-emerald-50/50')}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#206080]"
                    checked={ticked.includes(c.code)}
                    onChange={(e) => setTicked((t) => (e.target.checked ? [...t, c.code] : t.filter((x) => x !== c.code)))}
                  />
                  <span className="min-w-0 text-sm text-slate-800">
                    {c.label}
                    <span className="ml-2 whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{c.legalBasis}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {showErrors && error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <ErrorNote error={upload.error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={upload.isPending}>
            Déposer le modèle
          </Button>
        </div>
      </form>
    </Modal>
  );
}
