import { HandCoins, MapPin, QrCode, ShieldCheck, X, type LucideIcon } from 'lucide-react';
import { EGG_IMAGES } from '../../lib/animalImages';

const TRUST: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ShieldCheck, title: 'Fermes vérifiées', text: 'Seules les fermes vérifiées publient.' },
  { icon: QrCode, title: 'Lots tracés', text: 'L’origine d’un lot tracé se consulte en un clic.' },
  { icon: HandCoins, title: 'Paiement direct', text: 'Vous payez la ferme : Fermia n’encaisse rien.' },
];

/** Navy over two soft glows (brand green, brand blue): the same family as the app's hero surfaces. */
const BACKDROP =
  'radial-gradient(52rem 26rem at 88% -12%, rgb(96 160 64 / 0.30), transparent 62%), radial-gradient(44rem 26rem at -6% 112%, rgb(42 120 159 / 0.50), transparent 60%), linear-gradient(135deg, #0c2331 0%, #112e41 55%, #163e57 100%)';

/** Decorative photo tiles on wide screens. Each photo is a white cut-out, so it stays on white. */
const TILES = [
  { src: '/animals/breed-isa-brown.webp', cls: 'left-0 top-6 h-44 w-44 -rotate-6' },
  { src: EGG_IMAGES.alveole, cls: 'right-0 top-0 h-40 w-40 rotate-6' },
  { src: '/animals/breed-cobb-500.webp', cls: 'bottom-0 left-24 h-48 w-48 rotate-3' },
];

/**
 * Top of the catalogue: full-bleed under the header, with the city search inside.
 * `pb` leaves room for the filter panel that overlaps its bottom edge.
 */
export function MarketHero({ city, onCity }: { city: string; onCity: (city: string) => void }) {
  return (
    <section className="relative left-1/2 -mt-6 w-screen -translate-x-1/2 text-white" style={{ backgroundImage: BACKDROP }}>
      <div className="mx-auto flex max-w-page items-center gap-10 px-4 pb-24 pt-10 sm:pt-14 xl:px-8">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Le Marché Fermia</p>
          <h1 className="mt-3 max-w-3xl text-balance text-display font-bold leading-[1.08] tracking-tight">
            Achetez en direct aux fermes du Gabon.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-100 sm:text-lg">
            Volaille, œufs et carcasses, disponibles tout de suite ou en précommande. Parcourez sans compte, commandez en quelques clics.
          </p>

          <label className="relative mt-7 block max-w-md">
            <span className="sr-only">Ville</span>
            <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-500" />
            <input
              value={city}
              onChange={(e) => onCity(e.target.value)}
              placeholder="Dans quelle ville ? Libreville, Oyem…"
              className="h-13 w-full rounded-full border-0 bg-white pl-12 pr-11 text-[15px] text-slate-900 shadow-raised outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-white/25"
            />
            {city ? (
              <button
                type="button"
                onClick={() => onCity('')}
                aria-label="Effacer la ville"
                className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          <ul className="mt-8 grid max-w-3xl gap-x-6 gap-y-4 sm:grid-cols-3">
            {TRUST.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-300 ring-1 ring-inset ring-white/10">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-xs leading-snug text-brand-200">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div aria-hidden className="relative hidden h-80 w-[25rem] shrink-0 xl:block">
          {TILES.map((t) => (
            <div key={t.src} className={`absolute overflow-hidden rounded-3xl bg-white p-3 shadow-raised ring-1 ring-white/20 ${t.cls}`}>
              <img src={t.src} alt="" className="h-full w-full object-contain" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
