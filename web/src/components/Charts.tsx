import { useId } from 'react';

interface LinePoint {
  x: number;
  y: number;
}

function smoothPath(points: LinePoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const midX = (prev.x + cur.x) / 2;
    d += ` C ${midX} ${prev.y}, ${midX} ${cur.y}, ${cur.x} ${cur.y}`;
  }
  return d;
}

export function LineChart({
  data,
  labels,
  height = 180,
  valueFmt = (v: number) => String(v),
  color = '#0284c7',
  unit,
  reference,
}: {
  data: Array<number | null>;
  labels: string[];
  height?: number;
  valueFmt?: (v: number) => string;
  color?: string;
  /** Unit title shown above the axis (e.g. « % », « t »). */
  unit?: string;
  /** Second series drawn as a dashed grey line (a standard), same indexes as `data`. */
  reference?: Array<number | null>;
}) {
  const gid = useId();
  const W = 560;
  const H = 220;
  const PAD_X = 12;
  const PAD_TOP = 26;
  const PAD_BOTTOM = 28;
  const values = data.map((v, i) => (v == null ? null : ({ i, v }))).filter((x): x is { i: number; v: number } => x !== null);
  if (values.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-500">
        Pas encore de données
      </div>
    );
  }
  const refValues = (reference ?? [])
    .map((v, i) => (v == null ? null : { i, v }))
    .filter((x): x is { i: number; v: number } => x !== null && x.i < data.length);
  const min = Math.min(...values.map((p) => p.v), ...refValues.map((p) => p.v), 0);
  const max = Math.max(...values.map((p) => p.v), ...refValues.map((p) => p.v), 1);
  const span = max - min || 1;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points: Array<{ i: number; x: number; y: number; v: number }> = values.map((p) => ({
    ...p,
    x: PAD_X + p.i * stepX,
    y: PAD_TOP + innerH - ((p.v - min) / span) * innerH,
  }));
  const path = smoothPath(points);
  const refPath = smoothPath(
    refValues.map((p) => ({ x: PAD_X + p.i * stepX, y: PAD_TOP + innerH - ((p.v - min) / span) * innerH })),
  );
  const peak = points.reduce((a, b) => (b.v > a.v ? b : a), points[0]);

  const gridY = [0, 0.5, 1].map((f) => {
    const y = PAD_TOP + innerH - f * innerH;
    const labelV = min + f * span;
    return { y, labelV };
  });

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} className="w-full">
        <defs>
          <linearGradient id={`${gid}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridY.map((g) => (
          <g key={g.y}>
            <line x1={PAD_X} x2={W - PAD_X} y1={g.y} y2={g.y} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={PAD_X} y={g.y - 4} fontSize="14" fill="#475569">
              {valueFmt(g.labelV)}
            </text>
          </g>
        ))}
        <path d={`M ${PAD_X} ${PAD_TOP + innerH} L ${W - PAD_X} ${PAD_TOP + innerH} L ${points[points.length - 1].x} ${points[points.length - 1].y} L ${points[0].x} ${points[0].y} Z`} fill={`url(#${gid}-grad)`} />
        {refValues.length > 1 ? (
          <path d={refPath} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="6 5" />
        ) : null}
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" />
        {unit ? (
          <text x={W - PAD_X} y={12} fontSize="14" fill="#475569" textAnchor="end" fontWeight="600">
            {unit}
          </text>
        ) : null}
        {points.map((p, idx) => (
          <g key={p.i}>
            <circle cx={p.x} cy={p.y} r="3.5" fill={color} />
            {idx === points.length - 1 || p === peak ? (
              <text
                x={Math.min(Math.max(p.x, 36), W - 36)}
                y={p.y - 9 < 14 ? p.y + 20 : p.y - 9}
                fontSize="14"
                fontWeight="600"
                fill="#0f172a"
                textAnchor="middle"
              >
                {valueFmt(p.v)}
              </text>
            ) : null}
            <title>{labels[p.i] ?? ''} — {valueFmt(p.v)}</title>
          </g>
        ))}
        {data.map((v, i) =>
          v == null ? null : (
            <text key={i} x={PAD_X + i * stepX} y={H - 8} fontSize="14" fill="#475569" textAnchor="middle">
              {labels[i] ?? ''}
            </text>
          ),
        )}
      </svg>
    </div>
  );
}

export function BarChart({
  data,
  labels,
  height = 180,
  color = '#0284c7',
  unit,
  peakColor,
}: {
  data: number[];
  labels: string[];
  height?: number;
  color?: string;
  /** Unit title shown top right (e.g. « têtes », « œufs »). */
  unit?: string;
  /** Semantic accent for the highest bar only (e.g. red for a mortality peak); other bars stay neutral. */
  peakColor?: string;
}) {
  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-500">
        Pas encore de données
      </div>
    );
  }
  const W = 560;
  const H = 220;
  const TOP = 28;
  const BOTTOM = 28;
  const max = Math.max(...data, 1);
  const stepX = W / data.length;
  const barW = Math.max(10, Math.min(stepX * 0.55, 40));
  const every = stepX < 22 ? Math.ceil(22 / stepX) : 1;
  const peakIdx = peakColor && max > 0 ? data.indexOf(Math.max(...data)) : -1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} className="w-full">
      {unit ? (
        <text x={W - 4} y={14} fontSize="14" fill="#475569" textAnchor="end" fontWeight="600">
          {unit}
        </text>
      ) : null}
      <line x1={0} x2={W} y1={H - BOTTOM} y2={H - BOTTOM} stroke="#e2e8f0" />
      {data.map((v, i) => {
        const barH = (v / max) * (H - TOP - BOTTOM);
        const cx = i * stepX + stepX / 2;
        const showLabel = i % every === 0;
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={H - BOTTOM - barH} width={barW} height={barH} rx="3" fill={i === peakIdx ? peakColor : color} fillOpacity={0.9}>
              <title>{labels[i] ?? ''} — {v}</title>
            </rect>
            {v > 0 && (every === 1 || i === peakIdx) ? (
              <text x={cx} y={H - BOTTOM - barH - 5} fontSize="14" fontWeight="600" fill="#0f172a" textAnchor="middle">
                {v}
              </text>
            ) : null}
            {showLabel ? (
              <text x={cx} y={H - 8} fontSize="14" fill="#475569" textAnchor="middle">
                {labels[i] ?? ''}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({
  value,
  total,
  label,
  color,
}: {
  value: number;
  total: number;
  label: string;
  color?: string;
}) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const R = 40;
  const C = 2 * Math.PI * R;
  const fill = color ?? (pct >= 0.7 ? '#10b981' : pct >= 0.4 ? '#f59e0b' : '#ef4444');
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 100 100" className="h-24 w-24">
        <circle cx="50" cy="50" r={R} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={fill}
          strokeWidth="10"
          strokeDasharray={`${C * pct} ${C}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="54" textAnchor="middle" fontSize="18" fontWeight="700" fill="#0f172a">
          {Math.round(pct * 100)}
        </text>
      </svg>
      <span className="text-xs text-slate-600">{label}</span>
    </div>
  );
}

export interface GroupedSeries {
  key: string;
  label: string;
  color: string;
  /** Outline only: tells a « due » series from a solid « paid » one without relying on colour. */
  outline?: boolean;
}

/**
 * Grouped vertical bars, one cluster per category (a month), one bar per series. The legend sits above, bars carry
 * their value in the tooltip, the axis is labelled with the compact formatter. Hand-rolled SVG like the others.
 */
export function GroupedBarChart({
  rows,
  series,
  height = 220,
  valueFmt = (v: number) => String(v),
}: {
  rows: Array<{ label: string; values: Record<string, number> }>;
  series: GroupedSeries[];
  height?: number;
  valueFmt?: (v: number) => string;
}) {
  const W = 640;
  const H = 240;
  const LEFT = 52;
  const TOP = 16;
  const BOTTOM = 28;
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => r.values[s.key] ?? 0)));
  const innerW = W - LEFT - 8;
  const innerH = H - TOP - BOTTOM;
  const step = rows.length > 0 ? innerW / rows.length : innerW;
  const groupW = step * 0.78;
  const barW = Math.max(3, groupW / Math.max(1, series.length));
  const every = step < 36 ? Math.ceil(36 / step) : 1;
  const ticks = [0, 0.5, 1];
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
        {series.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={s.outline ? { border: `2px solid ${s.color}`, background: '#fff' } : { background: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
      {rows.length === 0 ? (
        <div style={{ height }} className="flex items-center justify-center text-xs text-slate-500">
          Pas encore de données
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} className="w-full" role="img" aria-label={series.map((s) => s.label).join(', ')}>
          {ticks.map((f) => {
            const y = TOP + innerH - f * innerH;
            return (
              <g key={f}>
                <line x1={LEFT} x2={W - 8} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={f === 0 ? undefined : '3 3'} />
                <text x={LEFT - 6} y={y + 4} fontSize="13" fill="#475569" textAnchor="end">
                  {valueFmt(max * f)}
                </text>
              </g>
            );
          })}
          {rows.map((r, i) => {
            const x0 = LEFT + i * step + (step - groupW) / 2;
            return (
              <g key={i}>
                {series.map((s, k) => {
                  const v = r.values[s.key] ?? 0;
                  const h = (v / max) * innerH;
                  return (
                    <rect
                      key={s.key}
                      x={x0 + k * barW}
                      y={TOP + innerH - h}
                      width={Math.max(2, barW - 1.5)}
                      height={Math.max(h, v > 0 ? 1 : 0)}
                      rx="2"
                      fill={s.outline ? '#fff' : s.color}
                      stroke={s.outline ? s.color : 'none'}
                      strokeWidth={s.outline ? 1.75 : 0}
                    >
                      <title>
                        {r.label} · {s.label} : {valueFmt(v)}
                      </title>
                    </rect>
                  );
                })}
                {i % every === 0 ? (
                  <text x={LEFT + i * step + step / 2} y={H - 8} fontSize="13" fill="#475569" textAnchor="middle">
                    {r.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/**
 * Horizontal bars with the label on the left and the figures on the right of each row (direct labels, no legend).
 * `tone` colours the bars; a funnel is the same rows ordered by step.
 */
export function HorizontalBars({
  rows,
  color = '#2a789f',
  empty = 'Pas encore de données',
}: {
  rows: Array<{ key: string; label: string; value: number; display: string; detail?: string; color?: string }>;
  color?: string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="py-6 text-center text-xs text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(5.5rem,9rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
          <span className="truncate text-sm text-slate-700" title={r.label}>
            {r.label}
          </span>
          <div className="h-5 rounded bg-slate-100" aria-hidden>
            <div className="h-full rounded" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%`, background: r.color ?? color }} />
          </div>
          <span className="col-span-2 text-right text-xs tabular-nums text-slate-600 sm:col-span-1 sm:w-44">
            <span className="font-semibold text-slate-900">{r.display}</span>
            {r.detail ? <span className="text-slate-500"> · {r.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One bar split into segments, with the legend (swatch, label, figures) below: each segment is also named in text. */
export function StackedShare({
  parts,
  total,
  ariaLabel,
}: {
  parts: Array<{ key: string; label: string; value: number; color: string; detail?: string }>;
  total?: number;
  ariaLabel: string;
}) {
  const sum = total ?? parts.reduce((n, p) => n + p.value, 0);
  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded bg-slate-100" role="img" aria-label={ariaLabel}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.key} title={`${p.label} : ${p.value}`} style={{ width: `${sum > 0 ? (p.value / sum) * 100 : 0}%`, background: p.color }} className="border-r border-white last:border-r-0" />
          ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2 text-sm">
            <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-700">{p.label}</span>
            <span className="shrink-0 text-right text-xs tabular-nums text-slate-600">
              <span className="font-semibold text-slate-900">{p.value.toLocaleString('fr-FR')}</span>
              {p.detail ? <span className="text-slate-500"> · {p.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
