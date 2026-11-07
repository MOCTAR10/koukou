/** Types of the public guide data (the JSON modules in ./data are typed through ./data.ts). */

export type Statut = '✅' | '🟡' | '🟠' | '❌';

export interface Marker {
  /** Position on the 1440 x 900 screenshot, in pixels. */
  x: number;
  y: number;
  title: string;
  desc: string;
}

export interface Figure {
  /** File name (without extension) in /guide. */
  k: string;
  alt: string;
  cap: string;
  m: Marker[];
}

export interface Chapter {
  part: string;
  id: string;
  t: string;
  /** Routes whose CDC requirements this chapter reports. */
  keys: string[];
  who?: string;
  why?: string;
  how?: string[];
  figs: Figure[];
  key?: boolean;
  bonus?: boolean;
}

export interface CdcRef {
  num: string;
  intitule: string;
  priorite: string;
  statut: Statut;
}

export interface RouteMapping {
  route: string;
  titre: string;
  roles: string[];
  resume: string;
  cdc: CdcRef[];
  bonus?: string[];
  aSavoir?: string;
}

export interface Requirement {
  num: number;
  /** Label in the CDC: the number, or T1..T16 for the traceability lines. */
  ref: string;
  titre: string;
  priorite: string;
  statut: Statut;
  note?: string;
}

export interface Summary {
  source: string;
  decomptes: { colonnes: string[]; lignes: Record<string, number[]> };
  transverses: Record<string, number[] | string[]>;
  frictions: string;
  mvpPartiels: Array<{ num: string; intitule: string; texte: string }>;
  reservesHonnetes: string[];
  changesV6: string[];
}

/** Rich text blocks for chapters that carry more than the who / why / how frame. */
export type Block =
  | { kind: 'lead'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'callout'; title: string; text: string[]; tone?: 'info' | 'warn' }
  | { kind: 'table'; head: string[]; rows: string[][] };

export interface Fact {
  title: string;
  text: string;
}
