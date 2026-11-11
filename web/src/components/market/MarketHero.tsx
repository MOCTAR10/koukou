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

/** What the Market sells, as a framed mosaic on wide screens. Each photo is a white cut-out, so it stays on white. */
const MOSAIC = [
  { src: '/animals/breed-isa-brown.webp', label: 'Poulets', cls: 'row-span-2' },
  { src: EGG_IMAGES.alveole, label: 'Œufs', cls: '' },
  { src: '/animals/breed-pintade-galor.webp', label: 'Pintades', cls: '' },
];

/**
 * Top of the catalogue: full-bleed under the header, with the city search inside.
 * Text and search on the left, the mosaic on the right (large screens), and the
 * three promises as one band across the full width. `pb` leaves room for the
 * filter panel that overlaps its bottom edge.
 */
export function MarketHero({ city, onCity }: { city: string; onCity: (city: string) => void }) {
  return (
    <section className="relative left-1/2 -mt-6 w-screen -translate-x-1/2 text-white" style={{ backgroundImage: BACKDROP }}>
      <div className="mx-auto max-w-page px-4 pb-20 pt-7 sm:pb-22 sm:pt-10 xl:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_31rem]">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300 ring-1 ring-inset ring-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Le Marché Fermia
            </p>
            <h1 className="mt-4 max-w-3xl text-balance text-[2rem] font-bold leading-[1.08] tracking-tight sm:text-display xl:text-[3.25rem]">
              Achetez en direct aux fermes du Gabon.
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-[15px] leading-relaxed text-brand-100 sm:text-lg">
              Volaille, œufs et carcasses, disponibles tout de suite ou en précommande. Parcourez sans compte, commandez en quelques clics.
            </p>

            <label className="relative mt-6 block max-w-2xl sm:mt-7">
              <span className="sr-only">Ville</span>
              <span className="pointer-events-none absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <MapPin className="h-5 w-5" />
              </span>
              <input
                value={city}
                onChange={(e) => onCity(e.target.value)}
                placeholder="Votre ville : Libreville, Oyem…"
                className="h-14 w-full rounded-full border-0 bg-white pl-15 pr-12 text-[15px] text-slate-900 shadow-raised outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-white/25"
              />
              {city ? (
                <button
                  type="button"
                  onClick={() => onCity('')}
                  aria-label="Effacer la ville"
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>
          </div>

          <div aria-hidden className="hidden rounded-[2rem] bg-white/[0.06] p-3 ring-1 ring-inset ring-white/10 lg:block">
            <div className="grid h-60 grid-cols-[1.2fr_1fr] grid-rows-2 gap-3 xl:h-64">
              {MOSAIC.map((t) => (
                <div key={t.label} className={`relative overflow-hidden rounded-3xl bg-white shadow-raised ${t.cls}`}>
                  <img src={t.src} alt="" className="h-full w-full object-contain p-3" />
                  <span className="absolute bottom-2.5 left-2.5 rounded-full bg-brand-950/85 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {t.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <ul className="mt-7 grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-white/10 sm:mt-8">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex flex-col items-center gap-2 px-2 py-3 text-center sm:flex-row sm:gap-3 sm:px-5 sm:py-4 sm:text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold sm:text-sm">{title}</span>
                <span className="hidden text-[13px] leading-snug text-brand-200 sm:block">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
