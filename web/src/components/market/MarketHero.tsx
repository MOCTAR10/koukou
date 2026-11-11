import { HandCoins, MapPin, QrCode, ShieldCheck, X, type LucideIcon } from 'lucide-react';

const TRUST: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ShieldCheck, title: 'Fermes vérifiées', text: 'Seules les fermes vérifiées publient.' },
  { icon: QrCode, title: 'Lots tracés', text: 'L’origine d’un lot tracé se consulte en un clic.' },
  { icon: HandCoins, title: 'Paiement direct à la ferme', text: 'Vous payez la ferme : Fermia n’encaisse rien.' },
];

/** Navy over two soft glows (brand green, brand blue): the same family as the app's hero surfaces. */
const BACKDROP =
  'radial-gradient(52rem 26rem at 88% -12%, rgb(96 160 64 / 0.30), transparent 62%), radial-gradient(44rem 26rem at -6% 112%, rgb(42 120 159 / 0.50), transparent 60%), linear-gradient(135deg, #0c2331 0%, #112e41 55%, #163e57 100%)';

/**
 * Top of the catalogue, kept short so the listings start high: one line of
 * title, one of text, the city search beside them, and the three promises as
 * a single row of labels. Full-bleed under the header; `pb` leaves room for
 * the filter panel that overlaps its bottom edge.
 */
export function MarketHero({ city, onCity }: { city: string; onCity: (city: string) => void }) {
  return (
    <section className="relative left-1/2 -mt-6 w-screen -translate-x-1/2 text-white" style={{ backgroundImage: BACKDROP }}>
      <div className="mx-auto max-w-page px-4 pb-20 pt-6 sm:pt-8 xl:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <div className="min-w-0">
            <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              Achetez en direct aux fermes du Gabon
            </h1>
            <p className="mt-1.5 text-sm text-brand-100 sm:text-base">Volaille, œufs et carcasses, en stock ou en précommande.</p>
          </div>

          <label className="relative block w-full shrink-0 lg:w-[26rem]">
            <span className="sr-only">Ville</span>
            <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-500" />
            <input
              value={city}
              onChange={(e) => onCity(e.target.value)}
              placeholder="Votre ville : Libreville, Oyem…"
              className="h-12 w-full rounded-full border-0 bg-white pl-12 pr-11 text-[15px] text-slate-900 shadow-raised outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-white/25"
            />
            {city ? (
              <button
                type="button"
                onClick={() => onCity('')}
                aria-label="Effacer la ville"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] font-medium text-brand-100">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title} title={text} className="flex items-center gap-1.5">
              <Icon className="h-4 w-4 text-emerald-300" aria-hidden />
              {title}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
