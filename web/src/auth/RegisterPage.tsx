import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { ApiError } from '../api/client';
import { isGabonPhoneValid, normalizeGabonPhone } from '../lib/phone';
import { useAuth } from './AuthContext';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [farmName, setFarmName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (fullName.trim().length < 3) return setError('Le nom doit comporter au moins 3 lettres.');
    if (farmName.trim().length < 3) return setError('Le nom de la ferme doit comporter au moins 3 lettres.');
    const number = normalizeGabonPhone(phone);
    if (!isGabonPhoneValid(number)) return setError('Numéro invalide : 9 chiffres commençant par 0, par exemple 074 12 34 56.');
    if (code.length < 6) return setError('Le code secret doit contenir au moins 6 caractères.');
    if (code !== confirm) return setError('Les deux codes ne correspondent pas.');
    setSubmitting(true);
    setError(null);
    try {
      await register({ fullName: fullName.trim(), farmName: farmName.trim(), phone: number, code });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de contacter le serveur. Réessayez plus tard.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-800 to-brand-950 p-4">
      <img src="/fermia-lockup-light.png" alt="Fermia — Gérez votre ferme" className="mb-6 h-20 w-auto" />
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl shadow-brand-950/40">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Espace ferme</p>
        <h1 className="mb-5 mt-1 text-xl font-bold tracking-tight text-slate-900">Créer mon compte</h1>
        {error ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nom complet">
            <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
          </Field>
          <Field label="Nom de la ferme">
            <input className={inputCls} value={farmName} onChange={(e) => setFarmName(e.target.value)} autoComplete="organization" required />
          </Field>
          <Field label="Téléphone" hint="Il vous servira d'identifiant.">
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="074 12 34 56" inputMode="tel" autoComplete="username" required />
          </Field>
          <Field label="Code secret" hint="Au moins 6 caractères.">
            <input type="password" className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Confirmer le code secret">
            <input type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </Field>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          Déjà un compte ?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Me connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
