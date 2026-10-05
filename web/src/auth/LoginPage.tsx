import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Lock, User } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useAuth } from './AuthContext';
import { ApiError } from '../api/client';
import { getStoredUser } from '../api/client';
import { useEffect } from 'react';
import { Logo } from '../components/Logo';
import { EASE, durations } from '../lib/motion';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const u = getStoredUser();
    if (u && u.role === 'PLATFORM_ADMIN') navigate('/app/platform');
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(phone.trim(), code);
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
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      <motion.div
        className="w-full max-w-xs rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
        initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: durations.base, ease: EASE }}
      >
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <Logo className="h-24 w-auto" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">KouKou</h1>
            <p className="text-[13px] text-slate-500">
              Console Administrateur Plateforme
            </p>
          </div>
        </div>

        {error ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Téléphone
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+241 6x xx xx xx"
                autoComplete="username"
                inputMode="tel"
                required
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Code secret
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="••••••"
                autoComplete="current-password"
                required
              />
            </div>
          </div>
          <motion.button
            type="submit"
            disabled={submitting}
            whileTap={{ scale: 0.99 }}
            className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? 'Connexion…' : 'Se connecter'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
