import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { inputCls } from '../components/form';

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

const FIELD = `${inputCls} !h-12 !rounded-xl !py-3 text-[15px] [@media(max-height:760px)]:!h-10`;

/** The phone field of every sign-in and sign-up: fixed +241, the number typed with or without its leading 0. */
export function PhoneField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-2 border-r border-slate-200 pl-3.5 pr-3 text-[15px] font-medium text-slate-700">
        <GabonFlag /> +241
      </span>
      <input
        className={`${FIELD} !pl-[6.5rem]`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="74 12 34 56"
        autoComplete="username"
        inputMode="tel"
        required
      />
    </span>
  );
}

/** Secret code with a show/hide button, so it is typed once. */
export function SecretField({
  value,
  onChange,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
}) {
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;
  return (
    <span className="relative block">
      <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type={shown ? 'text' : 'password'}
        className={`${FIELD} !pl-11 !pr-12`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="••••••"
        autoComplete={autoComplete}
        required
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Masquer le code' : 'Afficher le code'}
        aria-pressed={shown}
        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <Icon className="h-4 w-4" />
      </button>
    </span>
  );
}

const TAB = 'flex-1 rounded-lg py-2 text-center text-sm font-semibold transition-colors';

/**
 * Sign-in and sign-up of a Market customer, one click apart. The other page
 * replaces this one and keeps `from`, so the visitor still returns to the
 * listing that asked for an account.
 */
export function BuyerAuthSwitch({ active, from }: { active: 'login' | 'register'; from?: string }) {
  const state = { from: from ?? '/marche' };
  const cls = (on: boolean) => `${TAB} ${on ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`;
  return (
    <nav aria-label="Compte client du Marché" className="mb-5 flex gap-1 rounded-xl bg-slate-100 p-1">
      <Link to="/login" state={state} replace className={cls(active === 'login')} aria-current={active === 'login' ? 'page' : undefined}>
        Se connecter
      </Link>
      <Link to="/marche/inscription" state={state} replace className={cls(active === 'register')} aria-current={active === 'register' ? 'page' : undefined}>
        Créer un compte
      </Link>
    </nav>
  );
}
