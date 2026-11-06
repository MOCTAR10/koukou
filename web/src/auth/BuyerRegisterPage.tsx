import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { BUYER_TYPES } from '../components/market/shared';
import { isGabonPhoneValid, normalizeGabonPhone } from '../lib/phone';
import { useAuth } from './AuthContext';
import { AuthLayout, authLinkCls } from './AuthLayout';

const inputTallCls = `${inputCls} !py-2.5`;

/**
 * Market customer account, the only self sign-up of the instance: farm
 * accounts come from the programme registry (owner activation).
 */
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
    <AuthLayout
      audience="buyer"
      eyebrow="Marché Fermia"
      title="Créer un compte client du Marché"
      subtitle="Pour commander et précommander auprès des fermes."
      backTo="/marche"
      backLabel="Retour au marché"
      wide
      footer={
        <>
          <p>
            Déjà un compte ?{' '}
            <Link to="/login" state={{ from: from ?? '/marche' }} className={authLinkCls}>
              Me connecter
            </Link>
          </p>
          <p>
            Vous exploitez une ferme du programme ? Ce compte sert seulement à acheter : votre accès à la ferme vous est remis
            à l’activation de votre compte exploitant.
          </p>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom complet">
            <input className={inputTallCls} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
          </Field>
          <Field label="Je suis">
            <select className={inputTallCls} value={type} onChange={(e) => setType(e.target.value)}>
              {BUYER_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </Field>
          {type !== 'PARTICULIER' ? (
            <Field label="Nom de l’établissement">
              <input className={inputTallCls} maxLength={120} value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} autoComplete="organization" />
            </Field>
          ) : null}
          <Field label="Ville" className={type === 'PARTICULIER' ? 'sm:col-span-2' : undefined}>
            <input className={inputTallCls} maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
        </div>
        <Field label="Téléphone" hint="Il vous servira d’identifiant.">
          <input className={inputTallCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="074 12 34 56" inputMode="tel" autoComplete="username" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code secret" hint="Au moins 6 caractères.">
            <input type="password" className={inputTallCls} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Confirmer le code secret">
            <input type="password" className={inputTallCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </Field>
        </div>
        <ErrorNote error={error} />
        <Button type="submit" className="w-full !py-2.5" busy={submitting}>
          Créer mon compte
        </Button>
      </form>
    </AuthLayout>
  );
}
