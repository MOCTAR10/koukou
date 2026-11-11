import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { BUYER_TYPES } from '../components/market/shared';
import { isGabonPhoneValid, normalizeGabonPhone } from '../lib/phone';
import { useAuth } from './AuthContext';
import { AuthLayout } from './AuthLayout';
import { BuyerAuthSwitch, PhoneField, SecretField } from './fields';

const inputTallCls = `${inputCls} !h-12 !rounded-xl text-[15px] [@media(max-height:760px)]:!h-10`;

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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (fullName.trim().length < 3) return setError('Le nom doit comporter au moins 3 lettres.');
    const number = normalizeGabonPhone(phone);
    if (!isGabonPhoneValid(number)) return setError('Numéro invalide : 8 chiffres après +241, par exemple 74 12 34 56.');
    if (code.length < 6) return setError('Le code secret doit contenir au moins 6 caractères.');
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
        <p>
          Vous exploitez une ferme du programme ? Ce compte sert seulement à acheter : votre accès à la ferme vous est remis
          à l’activation de votre compte exploitant.
        </p>
      }
    >
      <BuyerAuthSwitch active="register" from={from} />
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Téléphone" hint="Il vous servira d’identifiant.">
            <PhoneField value={phone} onChange={setPhone} />
          </Field>
          <Field label="Code secret" hint="Au moins 6 caractères. L’œil permet de le relire.">
            <SecretField value={code} onChange={setCode} autoComplete="new-password" />
          </Field>
        </div>
        <ErrorNote error={error} />
        <Button type="submit" tone="accent" className="w-full !py-2.5" busy={submitting}>
          Créer mon compte
        </Button>
      </form>
    </AuthLayout>
  );
}
