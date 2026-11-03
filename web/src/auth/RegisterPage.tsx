import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { isGabonPhoneValid, normalizeGabonPhone } from '../lib/phone';
import { useAuth } from './AuthContext';
import { AuthLayout, authLinkCls } from './AuthLayout';

const inputTallCls = `${inputCls} !py-2.5`;

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
    <AuthLayout
      eyebrow="Espace ferme"
      title="Créer mon compte"
      wide
      footer={
        <p>
          Déjà un compte ?{' '}
          <Link to="/login" className={authLinkCls}>
            Me connecter
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <ErrorNote error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom complet">
            <input className={inputTallCls} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
          </Field>
          <Field label="Nom de la ferme">
            <input className={inputTallCls} value={farmName} onChange={(e) => setFarmName(e.target.value)} autoComplete="organization" required />
          </Field>
        </div>
        <Field label="Téléphone" hint="Il vous servira d'identifiant.">
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
        <Button type="submit" busy={submitting} className="w-full !py-2.5">
          {submitting ? 'Création…' : 'Créer mon compte'}
        </Button>
      </form>
    </AuthLayout>
  );
}
