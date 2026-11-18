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
