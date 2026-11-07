export function Logo({ className = 'h-9 w-auto' }: { className?: string }) {
  return <img src="/logo.png" alt="Fermia" className={className} />;
}
/** The Fermia leaf alone, no tile: for small marks on a light background. */
export function FermiaLeaf({ className = 'h-7 w-7' }: { className?: string }) {
  return <img src="/fermia-leaf.svg" alt="Fermia" className={`${className} shrink-0`} />;
}

/** Ministry badge: the coat of arms sits on white so it reads on any background. */
export function MinistryBadge({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <img
      src="/maedr-logo-full.webp"
      alt="Ministère de l’Agriculture, de l’Élevage et du Développement rural"
      className={`${className} shrink-0 rounded-lg bg-white object-cover p-0.5 ring-1 ring-white/30`}
    />
  );
}

/** Coat of arms alone (no ministry name): for small screens, where the full badge's text is unreadable. */
export function MinistrySeal({ className = 'h-10' }: { className?: string }) {
  return (
    <img
      src="/maedr-seal.webp"
      alt="République gabonaise"
      className={`${className} w-auto shrink-0 rounded-md bg-white object-contain p-0.5 ring-1 ring-white/30`}
    />
  );
}

/** Sign-in lockup on a dark band (phone): coat of arms, then the POUFA programme name. */
export function ProgrammeLockup() {
  return (
    <div className="flex items-center gap-4">
      <MinistrySeal className="h-16 sm:h-[4.5rem]" />
      <div className="border-l border-white/25 pl-4 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-200">Programme</p>
        <p className="text-2xl font-bold tracking-[0.18em]">POUFA</p>
      </div>
    </div>
  );
}
