import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { EASE, durations } from '../lib/motion';

interface AnimatedNumberProps {
  value: number | null | undefined;
  format?: (n: number) => string;
  className?: string;
}

export function AnimatedNumber({
  value,
  format = (n) => String(n),
  className,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value == null || Number.isNaN(value)) {
      el.textContent = '—';
      return;
    }
    if (reduced || !inView) {
      el.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(0, value, {
      duration: durations.base + 0.2,
      ease: EASE,
      onUpdate: (v) => {
        el.textContent = formatRef.current(v);
      },
    });
    return () => controls.stop();
  }, [value, inView, reduced]);

  const visible = value == null || Number.isNaN(value) ? '—' : format(value);

  return (
    <span ref={ref} className={className}>
      {visible}
    </span>
  );
}