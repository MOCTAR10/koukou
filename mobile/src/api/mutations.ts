import { apiFetch } from './client';
import type {
  AlertLevel,
  CareType,
  DiseaseSeverity,
  FeedEntryType,
  FeedLossReason,
  FeedPhase,
  HealthEventKind,
  ProphylaxisEvent,
  SlaughterDestination,
  SlaughterType,
  Species,
  StockTransferProductType,
} from './types';

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface DailyEntryPayload {
  entryDate: string;
  deaths?: number;
  feedBags?: number;
  feedQuantity?: number;
  feedUnit?: 'SAC' | 'KG';
  /** Poids d'un sac (kg) quand le mode sacs est choisi. */
  bagSizeKg?: number;
  feedPhase?: FeedPhase;
  customFeedPhaseName?: string;
  inputLotId?: string;
  /** Achat externe : consommation enregistrée sans décrémenter le stock suivi (exclusif avec inputLotId). */
  skipStockDeduction?: boolean;
  waterL?: number;
  avgWeightKg?: number;
  eggsCollected?: number;
  eggsSellable?: number;
  eggsCracked?: number;
  eggsSmall?: number;
  eggsDoubleYolk?: number;
  eggsDirty?: number;
  source?: 'MANUELLE';
}

export interface DailyEntryValues {
  deaths: number;
  feedKg: number;
  feedSacs: number;
  /** Poids d'un sac (kg) retenu pour la conversion sacs → kg. */
  bagSizeKg?: number;
  waterL: number;
  weightG: number;
  eggs: number;
  eggsCracked: number;
  eggsSmall: number;
  eggsDoubleYolk: number;
  eggsDirty: number;
  feedPhase: FeedPhase | null | undefined;
  inputLotId: string | null | undefined;
  /** Achat externe : ne pas décrémenter le stock suivi. */
  skipStockDeduction: boolean;
}

export interface DailyEntryBuildOptions {
  isLayer: boolean;
  feedMode: 'kg' | 'sacs';
  /** Date de la saisie (défaut : aujourd'hui) — le serveur upserte par date. */
  entryDate?: string;
}

export function buildDailyEntryPayload(values: DailyEntryValues, opts: DailyEntryBuildOptions): DailyEntryPayload {
  const p: DailyEntryPayload = { entryDate: opts.entryDate ?? todayStr() };
  if (values.deaths > 0) p.deaths = values.deaths;
  const hasFeed =
    (opts.feedMode === 'kg' && values.feedKg > 0) || (opts.feedMode === 'sacs' && values.feedSacs > 0);
  if (opts.feedMode === 'kg' && values.feedKg > 0) {
    p.feedUnit = 'KG';
    p.feedQuantity = values.feedKg;
  } else if (opts.feedMode === 'sacs' && values.feedSacs > 0) {
    p.feedUnit = 'SAC';
    p.feedBags = values.feedSacs;
    if (values.bagSizeKg != null && values.bagSizeKg > 0) p.bagSizeKg = values.bagSizeKg;
  }
  if (hasFeed) {
    if (values.feedPhase) p.feedPhase = values.feedPhase;
    if (values.skipStockDeduction) {
      p.skipStockDeduction = true;
    } else if (values.inputLotId) {
      p.inputLotId = values.inputLotId;
    }
  }
  if (values.waterL > 0) p.waterL = values.waterL;
  if (values.weightG > 0) p.avgWeightKg = values.weightG / 1000;
  if (values.eggs > 0) p.eggsCollected = values.eggs;
  if (values.eggs > 0)
    p.eggsSellable = Math.max(
      0,
      values.eggs -
        values.eggsCracked -
        values.eggsSmall -
        values.eggsDoubleYolk -
        values.eggsDirty,
    );
  if (values.eggsCracked > 0) p.eggsCracked = values.eggsCracked;
  if (values.eggsSmall > 0) p.eggsSmall = values.eggsSmall;
  if (values.eggsDoubleYolk > 0) p.eggsDoubleYolk = values.eggsDoubleYolk;
  if (values.eggsDirty > 0) p.eggsDirty = values.eggsDirty;
  return p;
}

export type PosProduct = 'PIECE' | 'KG' | 'OEUF' | 'AUTRE' | 'ABATTU_PIECE' | 'ABATTU_KG' | 'PROVENDE';

export type BuildSaleItemResult =
  | { item: SaleItemPayload }
  | { error: string };

export interface BuildSaleItemOptions {
  /** Poids moyen estimé (kg/oiseau) pour la vente au kilo. */
  avgWeightKg?: number;
  /** Source carcasse (abattage) pour ABATTU_PIECE/ABATTU_KG. */
  sourceSlaughterOrderId?: string;
  /** Réserve d'un transfert ferme → boutique (ABATTU, OEUFS ou PROVENDE). */
  stockTransferId?: string;
  /** Unité de vente proposée (PROVENDE réservée : SAC ou KG). */
  unit?: SaleUnit;
}

/** Poids moyen retenu faute de pesée (poulet de chair, Gabon). */
export const DEFAULT_AVG_WEIGHT_KG = 1.8;

export function buildSaleItem(
  product: PosProduct,
  quantity: number,
  unitPriceFcfa: number,
  batchId: string | null | undefined,
  opts?: BuildSaleItemOptions,
): BuildSaleItemResult {
  if (product === 'ABATTU_PIECE') {
      if (!batchId) return { error: 'Sélectionnez un lot abattu.' };
      return {
        item: {
          productType: 'ABATTU_PIECE',
          unit: 'PIECE',
          label: 'Abattu à la pièce',
          quantity,
          unitPriceFcfa,
          batchId,
          ...(opts?.sourceSlaughterOrderId ? { sourceSlaughterOrderId: opts.sourceSlaughterOrderId } : {}),
          ...(opts?.stockTransferId ? { stockTransferId: opts.stockTransferId } : {}),
        },
      };
    }
    if (product === 'ABATTU_KG') {
      if (!batchId) return { error: 'Sélectionnez un lot abattu.' };
      const avg = opts?.avgWeightKg ?? DEFAULT_AVG_WEIGHT_KG;
      const weightKg = Math.round(quantity * avg * 100) / 100;
      return {
        item: {
          productType: 'ABATTU_KG',
          unit: 'KG',
          label: 'Abattu au kilo',
          quantity: weightKg,
          unitPriceFcfa,
          batchId,
          pieceCount: quantity,
          ...(opts?.sourceSlaughterOrderId ? { sourceSlaughterOrderId: opts.sourceSlaughterOrderId } : {}),
          ...(opts?.stockTransferId ? { stockTransferId: opts.stockTransferId } : {}),
        },
      };
    }
  switch (product) {
    case 'PIECE': {
      if (!batchId) return { error: 'Sélectionnez un lot de poulets à décompter.' };
      return {
        item: { productType: 'POULET_PIECE', unit: 'PIECE', label: 'Poulet à la pièce', quantity, unitPriceFcfa, batchId },
      };
    }
    case 'KG': {
      if (!batchId) return { error: 'Sélectionnez un lot de poulets à décompter.' };
      const avg = opts?.avgWeightKg ?? DEFAULT_AVG_WEIGHT_KG;
      const weightKg = Math.round(quantity * avg * 100) / 100;
      return {
        item: {
          productType: 'POULET_KG',
          unit: 'KG',
          label: 'Poulet au kilo',
          quantity: weightKg,
          unitPriceFcfa,
          batchId,
          pieceCount: quantity,
        },
      };
    }
    case 'OEUF':
      return {
        item: {
          productType: 'OEUFS',
          unit: 'ALVEOLES',
          label: 'Œufs (alvéoles)',
          quantity,
          unitPriceFcfa,
          batchId: batchId ?? undefined,
          ...(opts?.stockTransferId ? { stockTransferId: opts.stockTransferId } : {}),
        },
      };
    case 'PROVENDE': {
      if (!opts?.stockTransferId) return { error: 'Sélectionnez une réserve de provende.' };
      const unit: SaleUnit = opts?.unit === 'KG' ? 'KG' : 'SAC';
      return {
        item: {
          productType: 'PROVENDE',
          unit,
          label: 'Provende',
          quantity,
          unitPriceFcfa,
          stockTransferId: opts.stockTransferId,
        },
      };
    }
    default:
      return { item: { productType: 'AUTRE', unit: 'UNITE', label: 'Autre', quantity, unitPriceFcfa } };
  }
}

export function createDailyEntry(
  farmId: string,
  batchId: string,
  payload: DailyEntryPayload,
): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/batches/${batchId}/daily-entries`, {
    method: 'POST',
    body: { ...payload, source: 'MANUELLE' },
  });
}

export async function ensureCashOpen(farmId: string): Promise<void> {
  interface OpenSession {
    session: unknown;
  }
  const current = await apiFetch<OpenSession | null>(`/farms/${farmId}/caisse/current`);
  if (current) return;
  await apiFetch(`/farms/${farmId}/caisse/open`, {
    method: 'POST',
    body: { openingBalanceFcfa: 0 },
  });
}

export type SaleProductType = 'POULET_PIECE' | 'POULET_KG' | 'OEUFS' | 'PROVENDE' | 'AUTRE' | 'ABATTU_PIECE' | 'ABATTU_KG';
export type SaleUnit = 'PIECE' | 'KG' | 'ALVEOLES' | 'UNITE' | 'SAC';

export interface SaleItemPayload {
  productType: SaleProductType;
  unit: SaleUnit;
  label?: string;
  quantity: number;
  unitPriceFcfa: number;
  batchId?: string;
  pieceCount?: number;
  /** Carcasse pool (abattage) — requise pour ABATTU_PIECE/ABATTU_KG. */
  sourceSlaughterOrderId?: string;
  /** Réserve d'un transfert ferme → boutique (vente ABATTU, OEUFS ou PROVENDE). */
  stockTransferId?: string;
}

export interface SalePayload {
  saleDate: string;
  items: SaleItemPayload[];
  idempotencyKey?: string;
  payments: { method: 'CASH'; amountFcfa: number; idempotencyKey?: string }[];
  customerName?: string;
  customerPhone?: string;
  promoCode?: string;
  pointOfSaleId?: string;
}

/** Zone client (non bloquante) + coupon au POS : tout est optionnel. */
export interface InvoiceFields {
  customerName?: string;
  customerPhone?: string;
  promoCode?: string;
}

interface CreateSaleResponse {
  sale: { referenceNumber: string };
}

export function createSale(
  farmId: string,
  payload: SalePayload,
): Promise<CreateSaleResponse> {
  return apiFetch<CreateSaleResponse>(`/farms/${farmId}/sales`, {
    method: 'POST',
    body: payload,
  });
}

/** Acquitte une alerte (PROPRIETAIRE + ELEVEUR) : ACTIVE → ACQUITTEE. */
export function acknowledgeAlert(farmId: string, alertId: string): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/alerts/${alertId}/acknowledge`, { method: 'POST' });
}

/** Ouvre la caisse journalière (PROPRIETAIRE) avec un fonds de caisse initial. */
export function openCaisse(farmId: string, openingBalanceFcfa: number): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/caisse/open`, {
    method: 'POST',
    body: { openingBalanceFcfa },
  });
}

/** Clôture la caisse (PROPRIETAIRE) ; l'écart (déclaré − attendu) est tracé. */
export function closeCaisse(farmId: string, declaredBalanceFcfa: number): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/caisse/close`, {
    method: 'POST',
    body: { declaredBalanceFcfa },
  });
}

/** Génère le calendrier prophylaxie du lot (protocole par défaut si non précisé). */
export function generateProphylaxis(farmId: string, batchId: string, protocolId?: string): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/batches/${batchId}/prophylaxis/generate`, {
    method: 'POST',
    body: protocolId ? { protocolId } : {},
  });
}

export function completeProphylaxis(
  farmId: string,
  batchId: string,
  eventId: string,
  extra?: { completedAt?: string; notes?: string },
): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/batches/${batchId}/prophylaxis/${eventId}/complete`, {
    method: 'POST',
    body: extra ?? {},
  });
}

export function cancelProphylaxis(farmId: string, batchId: string, eventId: string, reason?: string): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/batches/${batchId}/prophylaxis/${eventId}/cancel`, {
    method: 'POST',
    body: reason ? { reason } : {},
  });
}

export function rescheduleProphylaxis(farmId: string, batchId: string, eventId: string, scheduledDate: string): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/batches/${batchId}/prophylaxis/${eventId}`, {
    method: 'PATCH',
    body: { scheduledDate },
  });
}

export interface CreateTreatmentInput {
  careType: CareType;
  productName: string;
  dosage?: string;
  route?: string;
  administeredAt?: string;
  withdrawalDays?: number;
  notes?: string;
}

export function createTreatment(farmId: string, batchId: string, input: CreateTreatmentInput): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/batches/${batchId}/treatments`, {
    method: 'POST',
    body: input,
  });
}

export interface GenerateProgramResult {
  protocolId: string;
  programName: string;
  planned: number;
  skipped: number;
  perLot: {
    batchId: string;
    batchName: string;
    planned: number;
    skipped: number;
    skippedSteps: { step: string; date: string; reason: string }[];
  }[];
  events: ProphylaxisEvent[];
}

/** Applique un programme pré-chargé à plusieurs lots — non bloquant (étapes passées/déjà faites sautées). */
export function generateVaccineProgram(
  farmId: string,
  protocolId: string,
  lotIds: string[],
): Promise<GenerateProgramResult> {
  return apiFetch(`/farms/${farmId}/vaccine-schedules/programs/generate`, {
    method: 'POST',
    body: { protocolId, lotIds },
  });
}

export interface CreateManualScheduleInput {
  lotIds: string[];
  careType: CareType;
  name: string;
  scheduledDate: string;
  route?: string;
  dosage?: string;
  withdrawalDays?: number;
  notes?: string;
  decrementStock?: boolean;
  medicationLotId?: string;
  medicationQty?: number;
  medicationUnit?: string;
}

/** Planifie un soin unique (vaccin ou médicament) sur un ou plusieurs lots. */
export function createManualSchedule(
  farmId: string,
  input: CreateManualScheduleInput,
): Promise<ProphylaxisEvent[]> {
  return apiFetch(`/farms/${farmId}/vaccine-schedules/manual`, {
    method: 'POST',
    body: input,
  });
}

export interface UpdateScheduleInput {
  careType?: CareType;
  name?: string;
  route?: string;
  dosage?: string;
  withdrawalDays?: number;
  notes?: string;
  scheduledDate?: string;
}

export function updateSchedule(
  farmId: string,
  batchId: string,
  eventId: string,
  input: UpdateScheduleInput,
): Promise<ProphylaxisEvent> {
  return apiFetch(
    `/farms/${farmId}/batches/${batchId}/vaccine-schedules/${eventId}`,
    { method: 'PATCH', body: input },
  );
}

export function deleteSchedule(
  farmId: string,
  batchId: string,
  eventId: string,
): Promise<{ deleted: boolean }> {
  return apiFetch(
    `/farms/${farmId}/batches/${batchId}/vaccine-schedules/${eventId}`,
    { method: 'DELETE' },
  );
}

export interface CreateHealthEventInput {
  kind: HealthEventKind;
  occurredAt: string;
  severity: AlertLevel;
  quantity?: number;
  title: string;
  description?: string;
  symptoms?: string;
  notes?: string;
  disease?: string;
  diseaseSeverity?: DiseaseSeverity;
  treatmentGiven?: string;
  vetConsulted?: boolean;
  vetName?: string;
  resolved?: boolean;
}

export function createHealthEvent(
  farmId: string,
  batchId: string,
  input: CreateHealthEventInput,
): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/batches/${batchId}/health-events`, {
    method: 'POST',
    body: input,
  });
}

export function resolveHealthEvent(
  farmId: string,
  batchId: string,
  eventId: string,
): Promise<unknown> {
  return apiFetch(
    `/farms/${farmId}/batches/${batchId}/health-events/${eventId}/resolve`,
    { method: 'PATCH' },
  );
}

export function deleteHealthEvent(
  farmId: string,
  batchId: string,
  eventId: string,
): Promise<unknown> {
  return apiFetch(
    `/farms/${farmId}/batches/${batchId}/health-events/${eventId}`,
    { method: 'DELETE' },
  );
}


export interface CreateSlaughterOrderInput {
  batchId: string;
  slaughterType: SlaughterType;
  destination: SlaughterDestination;
  plannedDate: string;
  birdCount: number;
  totalWeightKg?: number;
  carcassWeightKg?: number;
  abattoirLotCode?: string;
  abattoirNotes?: string;
}

export function createSlaughterOrder(farmId: string, input: CreateSlaughterOrderInput): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/slaughter-orders`, {
    method: 'POST',
    body: input,
  });
}

export function sendSlaughterOrder(
  farmId: string,
  orderId: string,
  extra?: { internalBatchCode?: string; abattoirLotCode?: string; abattoirNotes?: string },
): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/slaughter-orders/${orderId}/send`, {
    method: 'POST',
    body: extra ?? {},
  });
}

export function processSlaughterOrder(
  farmId: string,
  orderId: string,
  extra?: { carcassWeightKg?: number; abattoirLotCode?: string; abattoirNotes?: string },
): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/slaughter-orders/${orderId}/process`, {
    method: 'POST',
    body: extra ?? {},
  });
}

export function cancelSlaughterOrder(farmId: string, orderId: string, reason: string): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/slaughter-orders/${orderId}/cancel`, {
    method: 'POST',
    body: { reason },
  });
}

/** Find-or-create : le téléphone est normalisé côté serveur, la capture reste optionnelle. */
export function createCustomer(
  farmId: string,
  input: { fullName: string; phone?: string; city?: string; notes?: string },
): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/customers`, {
    method: 'POST',
    body: input,
  });
}

/** Crée un compte Éleveur et le lie à la ferme (PROPRIETAIRE). */
export interface CreateFarmMemberInput {
  fullName: string;
  phone: string;
  code: string;
  buildingAssignment?: string;
}

export function createFarmMember(farmId: string, input: CreateFarmMemberInput): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/eleveurs`, {
    method: 'POST',
    body: input,
  });
}

/** Intrant aliment (provende) — HACCP : fournisseur + n° de lot + péremption obligatoire. */
export interface CreateInputLotInput {
  batchId?: string;
  foodType?: string;
  entryType: FeedEntryType;
  feedPhase?: FeedPhase;
  customFeedPhaseName?: string;
  /** Produit du catalogue provende : pré-remplit phase fournisseur sac et prix. */
  productId?: string;
  productName: string;
  supplier: string;
  supplierLotNumber: string;
  expirationDate?: string;
  receivedDate?: string;
  quantity?: number;
  unitPriceFcfa?: number;
  unit?: 'SAC' | 'KG';
  bagSizeKg?: number;
  numberOfBags?: number;
  tonnageMt?: number;
  costPerMtFcfa?: number;
  totalCostFcfa?: number;
  doseQuantity?: number;
  doseUnit?: string;
  additiveName?: string;
  notes?: string;
}

export function createInput(farmId: string, input: CreateInputLotInput): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/inputs`, {
    method: 'POST',
    body: { ...input, kind: 'ALIMENT' },
  });
}

export interface RecordFeedLossInput {
  inputLotId: string;
  quantity: number;
  unit: 'SAC' | 'KG';
  reason: FeedLossReason;
  occurrenceDate?: string;
  notes?: string;
}

export function recordFeedLoss(farmId: string, input: RecordFeedLossInput): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/feed-stock/losses`, {
    method: 'POST',
    body: {
      inputLotId: input.inputLotId,
      quantity: input.quantity,
      unit: input.unit,
      reason: input.reason,
      occurredAt: input.occurrenceDate,
      notes: input.notes ?? null,
    },
  });
}

export interface CreateFeedProductInput {
  name: string;
  entryType: FeedEntryType;
  feedPhase?: FeedPhase;
  customFeedPhaseName?: string;
  defaultSacKg?: number;
  defaultBagSizeKg?: number;
  defaultUnitPriceFcfa?: number;
  defaultCostPerMtFcfa?: number;
  defaultCostPerBagFcfa?: number;
  supplier?: string;
}

export function createFeedProduct(farmId: string, input: CreateFeedProductInput): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/feed-products`, {
    method: 'POST',
    body: input,
  });
}

// ── Lot / Bande ──────────────────────────────────────────────

export interface CreateBatchInput {
  batchName: string;
  integrationDate: string;
  quantityAtStart: number;
  type: 'CHAIR' | 'PONDEUSE';
  species?: Species;
  breedId?: string;
  /** Espèce libre (texte) — quand species = AUTRE */
  customSpecies?: string;
  /** Souche / race libre (texte) — quand species = AUTRE */
  customBreed?: string;
  buildingId?: string;
  buildingAreaM2?: number;
  couvoirSupplier?: string;
  chickLotNumber?: string;
  hatchDate?: string;
  chickUnitPriceFcfa?: number;
  /** Effectif vivant actuel (lot en cours) — sinon quantityAtStart */
  quantityAlive?: number;
}

export function createBatch(farmId: string, input: CreateBatchInput): Promise<{ id: string }> {
  return apiFetch(`/farms/${farmId}/batches`, {
    method: 'POST',
    body: input,
  });
}

// ── Bâtiment / Site ──────────────────────────────────────────

export interface CreateBuildingInput {
  name: string;
  buildingAreaM2?: number;
  capacity?: number;
  lastVideSanitaireAt?: string;
}

export function createBuilding(farmId: string, input: CreateBuildingInput): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/buildings`, {
    method: 'POST',
    body: input,
  });
}

// ── Point de vente (boutique / ferme) ────────────────────────

export interface PointOfSaleInput {
  name: string;
  kind: 'FERME' | 'BOUTIQUE';
  address?: string;
  city?: string;
  province?: string;
  latitude?: number;
  longitude?: number;
  isActive?: boolean;
}

export function createPointOfSale(farmId: string, input: PointOfSaleInput): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/points-of-sale`, {
    method: 'POST',
    body: input,
  });
}

export function updatePointOfSale(farmId: string, pointOfSaleId: string, input: Partial<PointOfSaleInput>): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/points-of-sale/${pointOfSaleId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deletePointOfSale(farmId: string, pointOfSaleId: string): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/points-of-sale/${pointOfSaleId}`, {
    method: 'DELETE',
  });
}

// ── Transferts de stock ferme → boutique ─────────────────────

export interface StockTransferInput {
  productType: StockTransferProductType;
  slaughterOrderId?: string;
  pointOfSaleId: string;
  batchId?: string;
  inputLotId?: string;
  unit?: string;
  quantity: number;
}

export function createStockTransfer(farmId: string, input: StockTransferInput): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/stock-transfers`, {
    method: 'POST',
    body: input,
  });
}

export function cancelStockTransfer(farmId: string, transferId: string): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/stock-transfers/${transferId}/cancel`, {
    method: 'POST',
  });
}

// ── Commandes / bons de commande ─────────────────────────────

export interface CreateOrderInput {
  customerName?: string;
  customerPhone?: string;
  /** Clé d'idempotence : le serveur renvoie la commande existante pour une même
   *  clé (rejeu offline / double envoi sans doublon). */
  idempotencyKey?: string;
  canal: 'FERME' | 'PRECOMMANDE';
  expectedDate?: string;
  address?: string;
  pointOfSaleId?: string;
  items: {
    productType: SaleProductType;
    label?: string;
    quantity: number;
    unitPriceFcfa: number;
    batchId?: string;
    pieceCount?: number;
    unit?: SaleUnit;
  }[];
  deposit?: { amountFcfa: number };
}

export function createOrder(farmId: string, input: CreateOrderInput): Promise<{ id: string }> {
  return apiFetch(`/farms/${farmId}/orders`, {
    method: 'POST',
    body: input,
  });
}

/** Encaissement d’acompte sur une commande (caisse ouverte requise). */
export function recordOrderPayment(
  farmId: string,
  orderId: string,
  amountFcfa: number,
  opts?: { idempotencyKey?: string },
): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/orders/${orderId}/deposit`, {
    method: 'POST',
    body: {
      amountFcfa,
      ...(opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
    },
  });
}

/** Livre la commande : décrémente le cheptel, fige le snapshot, génère le bon de commande PDF. */
export function deliverOrder(farmId: string, orderId: string): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/orders/${orderId}/livrer`, {
    method: 'POST',
    body: {},
  });
}

export function cancelOrder(farmId: string, orderId: string, reason: string): Promise<unknown> {
  const qs = reason ? `?reason=${encodeURIComponent(reason)}` : '';
  return apiFetch(`/farms/${farmId}/orders/${orderId}${qs}`, {
    method: 'DELETE',
  });
}

// ── Tâches d'équipe ──────────────────────────────────────────

export type TaskStatusValue = 'A_FAIRE' | 'EN_COURS' | 'FAIT' | 'ANNULEE';

export interface CreateTaskInput {
  title: string;
  dueDate: string;
  assigneeId?: string;
  batchId?: string;
  notes?: string;
}

/** Crée une tâche d'équipe (PROPRIETAIRE) — statut initial A_FAIRE côté serveur. */
export function createTask(farmId: string, input: CreateTaskInput): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/tasks`, {
    method: 'POST',
    body: input,
  });
}

export interface UpdateTaskInput {
  title?: string;
  dueDate?: string;
  assigneeId?: string | null;
  batchId?: string | null;
  notes?: string | null;
  status?: TaskStatusValue;
}

/** Met à jour une tâche — ELEVEUR limité au statut de ses propres tâches (403 sinon). */
export function updateTask(
  farmId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<unknown> {
  return apiFetch(`/farms/${farmId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: input,
  });
}

/** Supprime une tâche (PROPRIETAIRE uniquement). */
export function deleteTask(farmId: string, taskId: string): Promise<void> {
  return apiFetch<void>(`/farms/${farmId}/tasks/${taskId}`, {
    method: 'DELETE',
  });
}