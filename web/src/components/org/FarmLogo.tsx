import type { FarmWithLogo } from '../../api/types-org';
import { classNames } from '../../lib/format';
import { Logo } from '../Logo';
import { farmLogoSrc } from './shared';

/** The owner's logo, or the Fermia mark when none was uploaded. */
export function FarmLogo({ farm, version = 0, size }: { farm: FarmWithLogo | null; version?: number; size: string }) {
  const src = farmLogoSrc(farm, version);
  return (
    <div className={classNames('flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-slate-200', size)}>
      {src ? (
        <img src={src} alt={`Logo de ${farm?.name ?? 'la ferme'}`} className="h-full w-full object-cover" />
      ) : (
        <Logo className="h-3/4 w-3/4 object-contain" />
      )}
    </div>
  );
}
