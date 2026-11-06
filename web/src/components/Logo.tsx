export function Logo({ className = 'h-9 w-auto' }: { className?: string }) {
  return <img src="/logo.png" alt="Fermia" className={className} />;
}
/** Ministry badge: the coat of arms sits on white so it reads on any background. */
export function MinistryBadge({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <img
      src="/maedr-logo.jpg"
      alt="Ministère de l’Agriculture, de l’Élevage et du Développement rural"
      className={`${className} shrink-0 rounded-lg bg-white object-cover p-0.5 ring-1 ring-white/30`}
    />
  );
}

/** Sign-in lockup on a dark band: Ministry badge, then the POUFA programme name. */
export function ProgrammeLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <MinistryBadge className={compact ? 'h-12 w-12' : 'h-16 w-16 xl:h-20 xl:w-20'} />
      <div className="border-l border-white/25 pl-4 text-white">
        <p className={compact ? 'text-xl font-bold tracking-[0.18em]' : 'text-3xl font-bold tracking-[0.18em] xl:text-4xl'}>POUFA</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-wider text-brand-200 xl:text-xs">République gabonaise · Ministère de l’Agriculture</p>
      </div>
    </div>
  );
}
