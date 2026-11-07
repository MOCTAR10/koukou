// POUFA visites techniques et contrôles de biosécurité (CDC n° 27, n° 45, §3.2).
// Shapes of `backend/src/modules/visits` (visits.service.ts, dto/visit.dto.ts).

export type VisitType = 'TECHNIQUE' | 'BIOSECURITE' | 'SANITAIRE';
export type BiosecurityAnswer = 'CONFORME' | 'NON_CONFORME' | 'NA';
export type BiosecurityClass = 'A' | 'B' | 'C';

export interface VisitAnswerView {
  criterionCode: string;
  label: string;
  category: string | null;
  weight: number;
  answer: BiosecurityAnswer;
  comment: string | null;
}

export interface VisitView {
  id: string;
  farmId: string;
  farmCode: string | null;
  farmName: string | null;
  provinceCode: string | null;
  batchId: string | null;
  batchCode: string | null;
  visitDate: string;
  type: VisitType;
  agent: { id: string; name: string };
  observations: string | null;
  recommendations: string | null;
  latitude: number | null;
  longitude: number | null;
  nextVisitDate: string | null;
  visaFrom: string | null;
  visaTo: string | null;
  scorePct: number | null;
  classification: BiosecurityClass | null;
  thresholds: { a: number; b: number } | null;
  capturedAt: string | null;
  createdAt: string;
  /** Empty in the lists; filled on the detail. */
  answers: VisitAnswerView[];
}

export interface GridCriterion {
  code: string;
  label: string;
  category: string | null;
  weight: number;
}

export interface VisitGrid {
  criteria: GridCriterion[];
  thresholds: { a: number; b: number };
}

export interface ProgrammeVisitsPage {
  total: number;
  page: number;
  pageSize: number;
  items: VisitView[];
}

/** Body of `POST /farms/:farmId/visits`. */
export interface CreateVisitBody {
  visitDate: string;
  type: VisitType;
  batchId?: string;
  observations?: string;
  recommendations?: string;
  latitude?: number;
  longitude?: number;
  nextVisitDate?: string;
  visaFrom?: string;
  visaTo?: string;
  answers?: Array<{ criterionCode: string; answer: BiosecurityAnswer; comment?: string }>;
  capturedAt?: string;
  idempotencyKey?: string;
}
