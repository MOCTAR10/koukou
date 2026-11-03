import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bird, BookOpen, Building2, HandCoins, PackageOpen, Plus, Syringe } from 'lucide-react';
import { api } from '../api/client';
import type { FeedStockSummary } from '../api/types';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { BuildingFormModal } from './flock/Buildings';
import { CreateLotModal } from './flock/CreateLotModal';
import { DailyEntryModal } from './flock/DailyEntryModal';
import { FeedEntryModal } from './flock/StockModals';
import { IconTile, type IconTone } from './ui';

type ModalKey = 'daily' | 'lot' | 'feed' | 'building';

interface Entry {
  key: ModalKey | 'care' | 'sale';
  label: string;
  hint: string;
  icon: ReactNode;
  tone: IconTone;
  /** The entry shows when the account holds any of these, as in mobile's CreateCenter. */
  perms: string[];
}

const ENTRIES: Entry[] = [
  { key: 'daily', label: 'Saisie du jour', hint: 'Morts, aliments, eau', icon: <BookOpen />, tone: 'green', perms: ['saisie:creer'] },
  { key: 'lot', label: 'Nouveau lot', hint: 'Bande de volailles', icon: <Bird />, tone: 'brand', perms: ['production:gerer'] },
  { key: 'feed', label: 'Entrée provende', hint: 'Nouveau lot HACCP', icon: <PackageOpen />, tone: 'slate', perms: ['stock:gerer'] },
  { key: 'care', label: 'Soin', hint: 'Protocole sanitaire', icon: <Syringe />, tone: 'brand', perms: ['sanitaire:signaler', 'sanitaire:gerer'] },
  { key: 'building', label: 'Bâtiment', hint: 'Infrastructure', icon: <Building2 />, tone: 'brand', perms: ['production:gerer'] },
  { key: 'sale', label: 'Encaisser', hint: 'Point de vente', icon: <HandCoins />, tone: 'accent', perms: ['vente:creer'] },
];

/** Reception form with the stock it reads for its phase hints, fetched only once opened. */
function FeedEntryFromHub({ onClose }: { onClose: () => void }) {
  const { farmId } = useFarm();
  const stock = useQuery({
    queryKey: ['feed-stock', farmId],
    queryFn: () => api.get<FeedStockSummary>(`/farms/${farmId}/feed-stock`),
    enabled: !!farmId,
  });
  return <FeedEntryModal stock={stock.data} onClose={onClose} />;
}

/** The header's "+": the same six shortcuts as mobile's create wheel. */
export function QuickCreate() {
  const navigate = useNavigate();
  const { hasPermission } = useFarmProfile();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalKey | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const entries = ENTRIES.filter((e) => hasPermission(...e.perms));
  if (entries.length === 0) return null;

  const pick = (key: Entry['key']) => {
    setOpen(false);
    if (key === 'care') navigate('/app/sanitary');
    else if (key === 'sale') navigate('/app/finance/ventes');
    else setModal(key);
  };

  const close = () => setModal(null);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Créer"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white transition hover:bg-brand-700"
      >
        <Plus className="h-5 w-5" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Créer"
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {entries.map((e) => (
            <button
              key={e.key}
              type="button"
              role="menuitem"
              onClick={() => pick(e.key)}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
            >
              <IconTile icon={e.icon} tone={e.tone} size="sm" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800">{e.label}</span>
                <span className="block text-xs text-slate-500">{e.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {/* The header's backdrop blur would trap the modals' fixed positioning: render them on the body. */}
      {modal
        ? createPortal(
            <>
              {modal === 'daily' ? <DailyEntryModal onClose={close} /> : null}
              {modal === 'lot' ? (
                <CreateLotModal
                  onClose={close}
                  onCreated={(id) => {
                    close();
                    navigate(`/app/batches?lot=${id}`);
                  }}
                />
              ) : null}
              {modal === 'feed' ? <FeedEntryFromHub onClose={close} /> : null}
              {modal === 'building' ? <BuildingFormModal onClose={close} /> : null}
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
