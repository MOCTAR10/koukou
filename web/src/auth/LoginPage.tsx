import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { useAuth } from './AuthContext';
import { ApiError, getStoredUser } from '../api/client';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { AuthLayout, authLinkCls } from './AuthLayout';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const buying = from?.startsWith('/marche') ?? false;

  useEffect(() => {
    const u = getStoredUser();
    if (u) navigate(from ?? '/app');
  }, [navigate, from]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(phone.trim(), code, from);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Impossible de contacter le serveur. Réessayez plus tard.');
      }
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      audience={buying ? 'buyer' : 'farm'}
      eyebrow={buying ? 'Marché Fermia' : 'Espace ferme'}
      title="Connexion"
      subtitle="Entrez votre téléphone et votre code secret."
      footer={
        <>
          <p>
            Pas encore de compte ?{' '}
            <Link to={buying ? '/marche/inscription' : '/register'} state={buying ? { from } : undefined} className={authLinkCls}>
              Créer mon compte
            </Link>
          </p>
          <p>
            Vous voulez acheter ?{' '}
            <Link to="/marche" className={authLinkCls}>
              Voir le marché
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <ErrorNote error={error} />
        <Field label="Téléphone">
          <span className="relative block">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputCls} !py-2.5 pl-9`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="074 12 34 56"
              autoComplete="username"
              inputMode="tel"
              required
            />
          </span>
        </Field>
        <Field label="Code secret">
          <span className="relative block">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              className={`${inputCls} !py-2.5 pl-9`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="••••••"
              autoComplete="current-password"
              required
            />
          </span>
        </Field>
        <Button type="submit" busy={submitting} className="w-full !py-2.5">
          {submitting ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>
    </AuthLayout>
  );
}
