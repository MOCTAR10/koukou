// Filled, colourful pictograms of the SIMPLE experience. Hand-built with
// react-native-svg (no downloads): one 64 x 64 grid, one outline colour and
// width, fills from the theme palette, so they read as one family.
import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { palette } from '@/constants/theme';

export interface PictoProps {
  /** Side in dp (default 72). */
  size?: number;
}

const LINE = palette.ink[800];
const W = 2.5;
const WHITE = palette.surface;

function Frame({ size = 72, children }: PictoProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      {children}
    </Svg>
  );
}

/** Hen on its back, legs up, crossed eye: « Morts ». */
export function DeadBirdPicto(props: PictoProps) {
  return (
    <Frame {...props}>
      <Path d="M24 26 L21 10 M38 26 L41 10" stroke={palette.amber[700]} strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M17 10 H25 M37 10 H45" stroke={palette.amber[700]} strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M50 38 L62 30 L60 48 Z" fill={palette.accent[500]} stroke={LINE} strokeWidth={W} strokeLinejoin="round" />
      <Ellipse cx={32} cy={40} rx={21} ry={14} fill={palette.accent[300]} stroke={LINE} strokeWidth={W} />
      <Path d="M30 38 Q42 33 49 42 Q39 48 30 38 Z" fill={palette.accent[400]} stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
      <Circle cx={14} cy={40} r={9} fill={palette.accent[300]} stroke={LINE} strokeWidth={W} />
      <Path d="M9 32 Q11 25 14 30 Q17 24 19 32 Z" fill={palette.red[500]} stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M5 41 L0 44 L6 46 Z" fill={palette.amber[400]} stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M11 37 L16 42 M16 37 L11 42" stroke={LINE} strokeWidth={3} strokeLinecap="round" />
    </Frame>
  );
}

/** Sack of feed with an ear of grain: « Aliment ». */
export function FeedSackPicto(props: PictoProps) {
  return (
    <Frame {...props}>
      <Path
        d="M15 23 Q10 34 12 52 Q12 60 20 60 H44 Q52 60 52 52 Q54 34 49 23 Z"
        fill={palette.amber[300]}
        stroke={LINE}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <Path d="M19 23 L22 8 H42 L45 23 Z" fill={palette.amber[400]} stroke={LINE} strokeWidth={W} strokeLinejoin="round" />
      <Path d="M20 17 H44" stroke={LINE} strokeWidth={W} strokeLinecap="round" />
      <Rect x={20} y={30} width={24} height={22} rx={5} fill={WHITE} stroke={LINE} strokeWidth={2} />
      <Path d="M32 49 V34" stroke={palette.green[700]} strokeWidth={2.5} strokeLinecap="round" />
      <Ellipse cx={28} cy={38} rx={3} ry={4.5} fill={palette.green[500]} transform="rotate(-30 28 38)" />
      <Ellipse cx={36} cy={38} rx={3} ry={4.5} fill={palette.green[500]} transform="rotate(30 36 38)" />
      <Ellipse cx={28} cy={45} rx={3} ry={4.5} fill={palette.green[500]} transform="rotate(-30 28 45)" />
      <Ellipse cx={36} cy={45} rx={3} ry={4.5} fill={palette.green[500]} transform="rotate(30 36 45)" />
    </Frame>
  );
}

/** Drop of water: « Eau ». */
export function WaterDropPicto(props: PictoProps) {
  return (
    <Frame {...props}>
      <Path
        d="M32 4 C32 4 11 27 11 40 A21 21 0 0 0 53 40 C53 27 32 4 32 4 Z"
        fill={palette.brand[400]}
        stroke={LINE}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <Path d="M21 41 A11 11 0 0 0 30 52" stroke={WHITE} strokeWidth={4} strokeLinecap="round" fill="none" />
      <Ellipse cx={24} cy={33} rx={3} ry={5} fill={WHITE} opacity={0.7} transform="rotate(25 24 33)" />
    </Frame>
  );
}

/** Egg: « Œufs ». */
export function EggPicto(props: PictoProps) {
  return (
    <Frame {...props}>
      <Path
        d="M32 5 C20 5 11 27 11 40 A21 19 0 0 0 53 40 C53 27 44 5 32 5 Z"
        fill={palette.amber[100]}
        stroke={LINE}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <Ellipse cx={24} cy={30} rx={4} ry={7} fill={WHITE} opacity={0.8} transform="rotate(20 24 30)" />
      <Path d="M18 48 Q32 58 46 48" stroke={palette.amber[300]} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Frame>
  );
}

/** Kitchen scale with a dial: « Pesée ». */
export function ScalePicto(props: PictoProps) {
  return (
    <Frame {...props}>
      <Ellipse cx={32} cy={14} rx={18} ry={6} fill={palette.ink[300]} stroke={LINE} strokeWidth={W} />
      <Path d="M32 20 V26" stroke={LINE} strokeWidth={W} strokeLinecap="round" />
      <Path d="M10 60 V34 Q10 26 18 26 H46 Q54 26 54 34 V60 Z" fill={palette.green[500]} stroke={LINE} strokeWidth={W} strokeLinejoin="round" />
      <Circle cx={32} cy={42} r={12} fill={WHITE} stroke={LINE} strokeWidth={2} />
      <Path d="M32 42 L39 35" stroke={palette.red[500]} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={32} cy={42} r={2.5} fill={LINE} />
      <Path d="M23 42 H25 M32 33 V35 M41 42 H39" stroke={LINE} strokeWidth={2} strokeLinecap="round" />
    </Frame>
  );
}

/** Syringe with a green dose: « Vaccin ». */
export function SyringePicto(props: PictoProps) {
  return (
    <Frame {...props}>
      <G transform="rotate(45 32 32)">
        <Path d="M32 46 V62" stroke={LINE} strokeWidth={3} strokeLinecap="round" />
        <Rect x={25} y={14} width={14} height={32} rx={3} fill={WHITE} stroke={LINE} strokeWidth={W} />
        <Rect x={27.5} y={28} width={9} height={15} rx={1.5} fill={palette.green[400]} />
        <Path d="M25 20 H29 M25 25 H29" stroke={LINE} strokeWidth={2} strokeLinecap="round" />
        <Rect x={18} y={44} width={28} height={4.5} rx={2} fill={palette.brand[500]} stroke={LINE} strokeWidth={2} />
        <Rect x={29} y={4} width={6} height={11} fill={palette.ink[300]} stroke={LINE} strokeWidth={2} />
        <Rect x={21} y={1} width={22} height={5} rx={2.5} fill={palette.brand[500]} stroke={LINE} strokeWidth={2} />
      </G>
    </Frame>
  );
}

export type WarningTone = 'amber' | 'red';

/** Warning triangle: « Problème » and alerts. */
export function WarningPicto({ size, tone = 'amber' }: PictoProps & { tone?: WarningTone }) {
  return (
    <Frame size={size}>
      <Path
        d="M32 5 L61 56 H3 Z"
        fill={tone === 'red' ? palette.red[500] : palette.amber[400]}
        stroke={LINE}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <Path d="M32 22 V40" stroke={tone === 'red' ? WHITE : LINE} strokeWidth={6} strokeLinecap="round" />
      <Circle cx={32} cy={48} r={3.5} fill={tone === 'red' ? WHITE : LINE} />
    </Frame>
  );
}

/** Stack of coins: « Vendre ». */
export function CoinsPicto(props: PictoProps) {
  return (
    <Frame {...props}>
      {[44, 34, 24].map((y) => (
        <G key={y}>
          <Path d={`M10 ${y} V${y + 9} A22 8 0 0 0 54 ${y + 9} V${y}`} fill={palette.amber[500]} stroke={LINE} strokeWidth={W} />
          <Ellipse cx={32} cy={y} rx={22} ry={8} fill={palette.amber[300]} stroke={LINE} strokeWidth={W} />
        </G>
      ))}
      <Path d="M32 18 V30 M27 21 H35 M27 27 H35" stroke={palette.amber[800]} strokeWidth={2.5} strokeLinecap="round" />
    </Frame>
  );
}

/** Bird that does not look well, with a red cross: a clinical sign card. */
export function SickBirdPicto(props: PictoProps) {
  return (
    <Frame {...props}>
      <Path d="M44 36 L58 26 L58 46 Z" fill={palette.accent[500]} stroke={LINE} strokeWidth={W} strokeLinejoin="round" />
      <Ellipse cx={32} cy={40} rx={19} ry={14} fill={palette.accent[300]} stroke={LINE} strokeWidth={W} />
      <Path d="M28 42 Q40 36 46 46 Q36 52 28 42 Z" fill={palette.accent[400]} stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M22 54 V60 M32 54 V60" stroke={palette.amber[700]} strokeWidth={3.5} strokeLinecap="round" />
      <Circle cx={18} cy={26} r={9} fill={palette.accent[300]} stroke={LINE} strokeWidth={W} />
      <Path d="M13 19 Q15 12 18 17 Q21 11 23 19 Z" fill={palette.red[500]} stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M9 27 L3 30 L10 32 Z" fill={palette.amber[400]} stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M15 24 Q17 26 19 24" stroke={LINE} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <Circle cx={50} cy={14} r={11} fill={palette.red[500]} stroke={LINE} strokeWidth={2} />
      <Path d="M50 8 V20 M44 14 H56" stroke={WHITE} strokeWidth={4} strokeLinecap="round" />
    </Frame>
  );
}

/** Big green disc with a check: validate, « done » and « saved ». */
export function CheckPicto({ size, tone = 'green' }: PictoProps & { tone?: 'green' | 'white' }) {
  return (
    <Frame size={size}>
      <Circle cx={32} cy={32} r={29} fill={tone === 'white' ? WHITE : palette.green[600]} />
      <Path
        d="M17 33 L28 44 L47 21"
        stroke={tone === 'white' ? palette.green[700] : WHITE}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Frame>
  );
}
