import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Sigma } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { ParameterVersion, ParameterView, SetParameterBody } from '../../api/types-admin';
import { dateTimeFr } from '../../lib/format';
import { Note } from '../flock/shared';
import { Button, ErrorNote, Field, FormColumns, inputCls, Modal } from '../form';
import {
  checkReason,
  FORMULA_FUNCTIONS,
  FORMULA_MAX_LENGTH,
  formatParameterValue,
  formulaNames,
  insertToken,
  localDateTimeInput,
  ownerLabel,
  parseParameterInput,
  rangeLabel,
  sameValue,
  unknownNames,
  validFromOf,
  isDefaultSince,
  valueToInput,
  type FormulaName,
  type ValidFromMode,
} from './parameters';
import { invalidateParameters } from './queries';

/**
 * « Nouvelle valeur » of a parameter: typed value, effective date (now or
 * later, never in the past) and mandatory reason. A formula is compiled by
 * the server with the whole indicator set: its 400 message is shown as is.
 */
export function ParameterValueModal({ param, catalog, onClose }: { param: ParameterView; catalog: readonly ParameterView[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isFormula = param.type === 'formula';
  const [raw, setRaw] = useState(() => valueToInput(param.type, param.value));
  const [mode, setMode] = useState<ValidFromMode>('now');
  const [local, setLocal] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const save = useMutation({
    mutationFn: (body: SetParameterBody) => api.post<ParameterVersion>(`/programme/parameters/${encodeURIComponent(param.key)}`, body),
    onSuccess: () => {
      invalidateParameters(queryClient, param.key);
      onClose();
    },
  });

  const names = useMemo(() => formulaNames(catalog, param.key), [catalog, param.key]);
  const unknown = isFormula ? unknownNames(raw, [...names.variables.map((v) => v.name), ...names.indicators.map((v) => v.name)]) : [];
  const parsed = parseParameterInput(param, raw);
  const unchanged = parsed.ok && param.value !== null && sameValue(parsed.value, param.value);
  const minLocal = localDateTimeInput(new Date(Date.now() + 60_000));

  const insert = (token: string) => {
    const el = textarea.current;
    const start = el?.selectionStart ?? raw.length;
    const end = el?.selectionEnd ?? raw.length;
    const next = insertToken(raw, start, end, token);
    setRaw(next.text);
    setFormError(null);
    save.reset();
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.caret, next.caret);
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.ok) return setFormError(parsed.error);
    const from = validFromOf(mode, local, new Date());
    if (!from.ok) return setFormError(from.error);
    const reasonErr = checkReason(reason);
    if (reasonErr) return setFormError(reasonErr);
    setFormError(null);
    save.mutate({ value: parsed.value, reason: reason.trim(), ...(from.value ? { validFrom: from.value } : {}) });
  };

  const serverRefusal = save.error instanceof ApiError && save.error.status === 400 && isFormula ? save.error.message : null;

  const valueField = isFormula ? (
    <div className="space-y-2">
      <Field label="Expression" hint={`${raw.length} / ${FORMULA_MAX_LENGTH} caractères · nombres à virgule ou à point, fonctions séparées par « ; ».`}>
        <textarea
          ref={textarea}
          className={`${inputCls} font-mono`}
          rows={5}
          spellCheck={false}
          maxLength={FORMULA_MAX_LENGTH}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setFormError(null);
            save.reset();
          }}
        />
      </Field>
      {unknown.length ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Nom(s) non reconnu(s) : <span className="font-mono">{unknown.join(', ')}</span>. Le serveur refusera la formule s’ils ne sont pas dans la
          liste.
        </p>
      ) : null}
      {serverRefusal ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          <p className="font-semibold">Le serveur a refusé la formule (le jeu d’indicateurs ne compile plus) :</p>
          <p className="mt-1 whitespace-pre-wrap font-mono text-xs">{serverRefusal}</p>
        </div>
      ) : null}
    </div>
  ) : param.type === 'json' ? (
    <Field label="Valeur (JSON)">
      <textarea className={`${inputCls} font-mono`} rows={6} value={raw} onChange={(e) => setRaw(e.target.value)} />
    </Field>
  ) : (
    <Field label={`Nouvelle valeur${param.unit ? ` (${param.unit})` : ''}`} hint={rangeLabel(param) ?? undefined}>
      <input
        className={inputCls}
        inputMode={param.type === 'string' ? 'text' : 'decimal'}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setFormError(null);
        }}
        autoFocus
      />
    </Field>
  );

  const commonFields = (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-slate-600">Date d’effet</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="validFrom" checked={mode === 'now'} onChange={() => setMode('now')} /> Maintenant
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <input type="radio" name="validFrom" checked={mode === 'later'} onChange={() => setMode('later')} /> À partir du
          <input
            type="datetime-local"
            className={`${inputCls} max-w-56`}
            min={minLocal}
            value={local}
            onChange={(e) => {
              setLocal(e.target.value);
              setMode('later');
              setFormError(null);
            }}
            aria-label="Date d’effet"
          />
        </label>
        <p className="text-xs text-slate-500">
          La valeur s’applique à partir de cette date, jamais avant : les faits déjà enregistrés gardent la valeur alors en vigueur.
        </p>
      </fieldset>
      <Field label="Motif du changement" hint="Obligatoire : il figure dans l’historique (par exemple la décision du comité de pilotage).">
        <textarea className={inputCls} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} required />
      </Field>
    </div>
  );

  const header = (
    <div className="rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
      <p className="text-xs text-slate-500">
        <span className="font-mono">{param.key}</span> · responsable : {ownerLabel(param.ownerProfile)}
      </p>
      <p className="mt-1 text-slate-700">
        En vigueur{param.validFrom ? (isDefaultSince(param.validFrom) ? ' (valeur par défaut)' : ` depuis le ${dateTimeFr(param.validFrom)}`) : ''} :{' '}
        <span className={isFormula ? 'break-words font-mono text-xs' : 'font-semibold'}>{formatParameterValue(param.type, param.value, param.unit)}</span>
      </p>
    </div>
  );

  const actions = (
    <div className="space-y-3">
      {unchanged ? <Note tone="amber">La valeur saisie est celle déjà en vigueur.</Note> : null}
      <ErrorNote error={formError ?? (serverRefusal ? null : save.error)} />
      <div className="flex justify-end gap-2">
        <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
          Annuler
        </Button>
        <Button type="submit" busy={save.isPending}>
          Enregistrer la nouvelle valeur
        </Button>
      </div>
    </div>
  );

  if (!isFormula) {
    return (
      <Modal title={`Nouvelle valeur · ${param.label}`} onClose={onClose}>
        <form className="space-y-4" onSubmit={submit}>
          {header}
          {valueField}
          {commonFields}
          {actions}
        </form>
      </Modal>
    );
  }

  return (
    <Modal large title={`Nouvelle formule · ${param.label.replace(/^Formule : /, '')}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        {header}
        <FormColumns>
          <div className="space-y-4">
            {valueField}
            {commonFields}
          </div>
          <aside className="space-y-3 text-sm">
            <NameList title="Variables de la bande" names={names.variables} onPick={insert} />
            {names.indicators.length ? <NameList title="Autres indicateurs" names={names.indicators} onPick={insert} /> : null}
            <div>
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Sigma className="h-3.5 w-3.5" /> Fonctions
              </h3>
              <ul className="space-y-1">
                {FORMULA_FUNCTIONS.map((f) => (
                  <li key={f.name}>
                    <button type="button" className="font-mono text-xs text-brand-700 hover:underline" onClick={() => insert(`${f.name}(`)}>
                      {f.syntax}
                    </button>{' '}
                    <span className="text-xs text-slate-500">{f.help}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-slate-500">
              Une division par zéro ou une donnée manquante donne un indicateur vide, jamais une erreur. Le serveur vérifie tout le jeu
              d’indicateurs (noms, cycles) à la date d’effet et à chaque changement de formule déjà programmé.
            </p>
          </aside>
        </FormColumns>
        {actions}
      </form>
    </Modal>
  );
}

function NameList({ title, names, onPick }: { title: string; names: readonly FormulaName[]; onPick: (name: string) => void }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
        {names.map((v) => (
          <li key={v.name}>
            <button type="button" className="text-left" onClick={() => onPick(v.name)} title={`Insérer ${v.name}`}>
              <span className="font-mono text-xs text-brand-700 hover:underline">{v.name}</span>{' '}
              <span className="text-xs text-slate-500">
                {v.label}
                {v.unit ? ` (${v.unit})` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
