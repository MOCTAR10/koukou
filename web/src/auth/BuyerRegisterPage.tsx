import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { BUYER_TYPES } from '../components/market/shared';
import { Card } from '../components/ui';
import { isGabonPhoneValid, normalizeGabonPhone } from '../lib/phone';
import { useAuth } from './AuthContext';

/** Account of someone who buys: no farm is created. */
export function BuyerRegisterPage() {
  const { registerBuyer } = useAuth();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [fullName, setFullName] = useState('');
  const [type, setType] = useState('PARTICULIER');
  const [organizationName, setOrganizationName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (fullName.trim().length < 3) return setError('Le nom doit comporter au moins 3 lettres.');
    const number = normalizeGabonPhone(phone);
    if (!isGabonPhoneValid(number)) return setError('Numéro invalide : 9 chiffres commençant par 0, par exemple 074 12 34 56.');
    if (code.length < 6) return setError('Le code secret doit contenir au moins 6 caractères.');
    if (code !== confirm) return setError('Les deux codes ne correspondent pas.');
    setSubmitting(true);
    setError(null);
    try {
      await registerBuyer(
        {
          fullName: fullName.trim(),
          phone: number,
          code,
          type,
          organizationName: type !== 'PARTICULIER' ? organizationName.trim() || undefined : undefined,
          city: city.trim() || undefined,
        },
        from,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de contacter le serveur. Réessayez plus tard.');
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-5">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Créer un compte acheteur</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">Pour commander et précommander auprès des fermes.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nom complet">
            <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
          </Field>
          <Field label="Je suis">
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              {BUYER_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </Field>
          {type !== 'PARTICULIER' ? (
            <Field label="Nom de l’établissement">
              <input className={inputCls} maxLength={120} value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} autoComplete="organization" />
            </Field>
          ) : null}
          <Field label="Ville">
            <input className={inputCls} maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Téléphone" hint="Il vous servira d’identifiant.">
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="074 12 34 56" inputMode="tel" autoComplete="username" required />
          </Field>
          <Field label="Code secret" hint="Au moins 6 caractères.">
            <input type="password" className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Confirmer le code secret">
            <input type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </Field>
          <ErrorNote error={error} />
          <Button type="submit" className="w-full" busy={submitting}>
            Créer mon compte
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          Déjà un compte ?{' '}
          <Link to="/login" state={{ from: from ?? '/marche' }} className="font-semibold text-brand-600 hover:text-brand-700">
            Me connecter
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-slate-500">
          Vous êtes éleveur ?{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
            Créer un compte ferme
          </Link>
        </p>
      </Card>
    </div>
  );
}
