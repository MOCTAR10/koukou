import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, G, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';

import { AppText } from './AppText';
import { palette, semantic } from '@/constants/theme';

interface FCRGaugeProps {
  value: number | null;
  size?: number;
}

const MIN = 1.0;
const MAX = 3.5;
const TICKS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5];

/** Heatmap color stops along the arc. */
const HEATMAP_STOPS: { pct: number; color: string }[] = [
  { pct: 0.0, color: palette.green[600] },
  { pct: 0.32, color: palette.green[500] },
  { pct: 0.44, color: palette.amber[500] },
  { pct: 0.64, color: palette.accent[500] },
  { pct: 0.80, color: palette.red[400] },
  { pct: 1.0, color: palette.red[600] },
];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function valueToAngle(v: number): number {
  return ((clamp(v, MIN, MAX) - MIN) / (MAX - MIN)) * 180;
}

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (Math.PI * (180 - angleDeg)) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function fcrColor(v: number): string {
  if (v <= 1.8) return palette.green[600];
  if (v <= 2.2) return palette.amber[500];
  if (v <= 2.8) return palette.accent[500];
  return palette.red[500];
}

function fcrLabel(v: number): string {
  if (v <= 1.8) return 'Excellent';
  if (v <= 2.2) return 'Bon';
  if (v <= 2.8) return 'Moyen';
  return 'Élevé';
}

/** Draw a short arc segment between two angles. */
function arcSegment(cx: number, cy: number, r: number, fromAngle: number, toAngle: number): string {
  const start = polarToXY(cx, cy, r, fromAngle);
  const end = polarToXY(cx, cy, r, toAngle);
  const sweep = toAngle - fromAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function FCRGauge({ value, size = 110 }: FCRGaugeProps) {
  const vw = size;
  const vh = size * 0.72;
  const cx = vw / 2;
  const cy = vh * 0.62;
  const r = size * 0.34;
  const strokeW = size * 0.09;
  const outerR = r + strokeW / 2;

  const hasValue = value != null && value > 0;
  const angle = hasValue ? valueToAngle(value!) : 0;
  const needleColor = hasValue ? fcrColor(value!) : palette.ink[300];

  /** Background arc (gray). */
  const bgArc = (() => {
    const start = polarToXY(cx, cy, r, 0);
    const end = polarToXY(cx, cy, r, 180);
    return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
  })();

  /** Heatmap segments — draw colored arcs for each zone. */
  const segments = (() => {
    const STEPS = 40;
    const segAngle = 180 / STEPS;
    return Array.from({ length: STEPS }, (_, i) => {
      const from = i * segAngle;
      const to = (i + 1) * segAngle;
      const pct = i / STEPS;
      // Find the two surrounding stops for interpolation.
      let c = HEATMAP_STOPS[0].color;
      for (let s = 0; s < HEATMAP_STOPS.length - 1; s++) {
        const a = HEATMAP_STOPS[s];
        const b = HEATMAP_STOPS[s + 1];
        if (pct >= a.pct && pct <= b.pct) {
          c = a.color;
          break;
        }
        if (s === HEATMAP_STOPS.length - 2) c = b.color;
      }
      // Dim segments beyond the needle.
      const dimmed = hasValue && from >= angle;
      return { d: arcSegment(cx, cy, r, from, to), color: c, dimmed };
    });
  })();

  /** Needle. */
  const needleTip = hasValue ? polarToXY(cx, cy, r - strokeW * 0.6, angle) : { x: cx, y: cy - r + strokeW };

  return (
    <View style={[styles.container, { width: vw, height: vh }]}>
      <Svg width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`}>
        <Defs>
          <LinearGradient id="heatGrad" x1="0" y1="0" x2="1" y2="0">
            {HEATMAP_STOPS.map((s, i) => (
              <Stop key={i} offset={`${s.pct * 100}%`} stopColor={s.color} />
            ))}
          </LinearGradient>
        </Defs>

        {/* Background arc */}
        <Path d={bgArc} stroke={semantic.surfaceAlt} strokeWidth={strokeW} fill="none" strokeLinecap="butt" />

        {/* Heatmap colored segments */}
        {segments.map((seg, i) => (
          <Path
            key={i}
            d={seg.d}
            stroke={seg.color}
            strokeWidth={strokeW}
            fill="none"
            strokeLinecap="butt"
            opacity={seg.dimmed ? 0.25 : 1}
          />
        ))}

        {/* Tick marks */}
        {TICKS.map((t) => {
          const a = valueToAngle(t);
          const outerPt = polarToXY(cx, cy, outerR + 3, a);
          const innerPt = polarToXY(cx, cy, outerR + (size >= 100 ? 10 : 7), a);
          const labelPt = polarToXY(cx, cy, outerR + (size >= 100 ? 18 : 14), a);
          return (
            <G key={t}>
              <Line x1={outerPt.x} y1={outerPt.y} x2={innerPt.x} y2={innerPt.y} stroke={palette.ink[400]} strokeWidth={1.5} />
              <Circle cx={labelPt.x} cy={labelPt.y} r={size >= 100 ? 9 : 7} fill={semantic.surface} />
              <SvgText x={labelPt.x} y={labelPt.y + 3} textAnchor="middle" fontSize={size >= 100 ? 8 : 6.5} fill={palette.ink[500]} fontFamily="System">
                {t.toFixed(1)}
              </SvgText>
            </G>
          );
        })}

        {/* Needle */}
        {hasValue ? (
          <G>
            <Line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke={needleColor} strokeWidth={2} strokeLinecap="round" />
            <Circle cx={cx} cy={cy} r={3.5} fill={needleColor} />
            <Circle cx={cx} cy={cy} r={1.8} fill={semantic.surface} />
          </G>
        ) : null}
      </Svg>

      {/* Value */}
      <View style={[styles.valueWrap, { bottom: 0 }]}>
        <AppText size="bodyM" weight="bold" color={hasValue ? 'text' : 'faint'} align="center">
          {hasValue ? value!.toFixed(2) : '—'}
        </AppText>
        {hasValue ? (
          <AppText size="small" weight="semibold" color={needleColor as any} align="center">
            {fcrLabel(value!)}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  valueWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
