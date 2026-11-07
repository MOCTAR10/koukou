import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock, MessageSquareText, Store } from 'lucide-react';
import { useAuth } from './AuthContext';
import { ApiError, getStoredUser } from '../api/client';
import { clearSessionExpired, sessionExpired, SESSION_EXPIRED_MESSAGE } from '../api/session-expiry';
import { landingAfterLogin } from '../app/roles';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { AuthLayout, authLinkCls } from './AuthLayout';
import { otpCodeError, type OtpChallenge } from './login';

/** Number typed after the fixed +241 prefix → full international number (a typed +… or 00… is kept). */
function fullPhone(raw: string): string {
  const v = raw.trim();
  if (v.startsWith('+') || v.startsWith('00')) return v;
  return `+241${v.replace(/^0/, '')}`;
}

/** Gabon flag (emoji flags do not render on Windows). */
function GabonFlag() {
  return (
    <svg viewBox="0 0 4 3" className="h-3.5 w-5 overflow-hidden rounded-[3px] ring-1 ring-slate-200" aria-hidden>
      <rect width="4" height="1" fill="#009E60" />
      <rect y="1" width="4" height="1" fill="#FCD116" />
      <rect y="2" width="4" height="1" fill="#3A75C4" />
    </svg>
  );
}

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Impossible de contacter le serveur. Réessayez plus tard.';
}

export function LoginPage() {
  const { login, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  // Institutional sign-in with SMS: the second step replaces the form.
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const buying = from?.startsWith('/marche') ?? false;
  // Sent back here by a 401 (token past its validity): say so, once.
  const [expired] = useState(() => sessionExpired());

  useEffect(() => {
    clearSessionExpired();
  }, []);

  useEffect(() => {
    const u = getStoredUser();
    if (u) navigate(landingAfterLogin(u.role, from), { replace: true });
  }, [navigate, from]);

  async function signIn() {
    const outcome = await login(fullPhone(phone), code, from);
    if (outcome.kind === 'otp') {
      setChallenge(outcome.challenge);
      setOtp('');
      setSubmitting(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(messageOf(err));
      setSubmitting(false);
    }
  }

  async function onSubmitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !challenge) return;
    const invalid = otpCodeError(otp);
    if (invalid) return setError(invalid);
    setSubmitting(true);
    setError(null);
    try {
      await verifyOtp(challenge.challengeId, otp, from);
    } catch (err) {
      setError(messageOf(err));
      setSubmitting(false);
    }
  }

  /** A new challenge (expired code, too many attempts): same phone and code. */
  async function resend() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(messageOf(err));
      setSubmitting(false);
    }
  }

  if (challenge) {
    return (
      <AuthLayout
        eyebrow="Accès institutionnel"
        title="Code de vérification"
        subtitle={
          challenge.sentTo
            ? `Un code à 6 chiffres vient d’être envoyé par SMS au ${challenge.sentTo}. Il reste valable 5 minutes.`
            : 'Un code à 6 chiffres vient d’être envoyé par SMS. Il reste valable 5 minutes.'
        }
        footer={
          <p>
            <button
              type="button"
              className={authLinkCls}
              onClick={() => {
                setChallenge(null);
                setOtp('');
                setError(null);
              }}
            >
              Changer de compte
            </button>
          </p>
        }
      >
        <form onSubmit={onSubmitOtp} className="space-y-4">
          <ErrorNote error={error} />
          <Field label="Code reçu par SMS">
            <span className="relative block">
              <MessageSquareText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputCls} !py-2.5 pl-9 tracking-[0.3em]`}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={9}
                autoFocus
                required
              />
            </span>
          </Field>
          <Button type="submit" busy={submitting} className="w-full !py-2.5">
            {submitting ? 'Vérification…' : 'Valider'}
          </Button>
          <Button tone="secondary" className="w-full" disabled={submitting} onClick={() => void resend()}>
            Recevoir un nouveau code
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      audience={buying ? 'buyer' : 'programme'}
      eyebrow={buying ? 'Marché Fermia' : 'Espace sécurisé'}
      title={buying ? 'Connexion' : 'Bienvenue'}
      subtitle={buying ? 'Connectez-vous avec votre téléphone et votre code secret.' : undefined}
      footer={
        buying ? (
          <p>
            Pas encore de compte client ?{' '}
            <Link to="/marche/inscription" state={{ from }} className={authLinkCls}>
              Créer un compte client du Marché
            </Link>
          </p>
        ) : (
          <>
            <Link
              to="/marche"
              className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-[13px] font-semibold text-brand-700 ring-1 ring-slate-200 transition hover:bg-brand-50 hover:ring-brand-200"
            >
              <Store className="h-4 w-4" /> Acheter sur le Marché Fermia
            </Link>
            <Link to="/guide" className={authLinkCls + ' mt-3 block text-xs'}>
              Guide de la plateforme
            </Link>
          </>
        )
      }
    >
      <form onSubmit={onSubmit} className="space-y-4 [@media(max-height:760px)]:space-y-3">
        {expired && !error ? (
          <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            {SESSION_EXPIRED_MESSAGE}
          </p>
        ) : null}
        <ErrorNote error={error} />
        <Field label="Téléphone">
          <span className="relative block">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-2 border-r border-slate-200 pl-3.5 pr-3 text-[15px] font-medium text-slate-700">
              <GabonFlag /> +241
            </span>
            <input
              className={`${inputCls} !h-12 !rounded-xl !py-3 !pl-[6.5rem] text-[15px] [@media(max-height:760px)]:!h-10`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="74 12 34 56"
              autoComplete="username"
              inputMode="tel"
              required
            />
          </span>
        </Field>
        <Field label="Code secret">
          <span className="relative block">
            <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              className={`${inputCls} !h-12 !rounded-xl !py-3 !pl-11 text-[15px] [@media(max-height:760px)]:!h-10`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="••••••"
              autoComplete="current-password"
              required
            />
          </span>
        </Field>
        <Button
          type="submit"
          busy={submitting}
          className="!mt-6 w-full !h-12 [@media(max-height:760px)]:!mt-4 [@media(max-height:760px)]:!h-11 !rounded-xl bg-gradient-to-r from-brand-700 to-brand-900 text-[15px] shadow-lg shadow-brand-900/25 transition hover:shadow-xl"
        >
          {submitting ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>
    </AuthLayout>
  );
}
