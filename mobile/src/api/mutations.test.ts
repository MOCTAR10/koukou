import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acknowledgeAlert,
  buildDailyEntryPayload,
  buildSaleItem,
  cancelStockTransfer,
  cancelProphylaxis,
  cancelSlaughterOrder,
  closeCaisse,
  completeProphylaxis,
  createCustomer,
  createStockTransfer,
  createDailyEntry,
  createFarmMember,
  createInput,
  createManualSchedule,
  createSale,
  createSlaughterOrder,
  createTreatment,
  deleteSchedule,
  ensureCashOpen,
  generateProphylaxis,
  generateVaccineProgram,
  openCaisse,
  processSlaughterOrder,
  rescheduleProphylaxis,
  sendSlaughterOrder,
  updateSchedule,
  type DailyEntryValues,
} from './mutations';
import { clearSession } from './token';
import { jsonResponse, readCall, stubFetch, stubFetchSequence } from './test-utils';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: '10.0.0.5:8081' } },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));
vi.mock('./index', () => ({
  isLive: () => true,
}));

const baseline: DailyEntryValues = {
  deaths: 0,
  feedKg: 0,
  feedSacs: 0,
  waterL: 0,
  weightG: 0,
  eggs: 0,
  eggsCracked: 0,
  eggsSmall: 0,
  eggsDoubleYolk: 0,
  eggsDirty: 0,
  feedPhase: null,
  inputLotId: null,
  skipStockDeduction: false,
};

beforeEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe('buildDailyEntryPayload', () => {
  it('mode kg : feedQuantity + feedUnit KG', () => {
    const p = buildDailyEntryPayload({ ...baseline, deaths: 3, feedKg: 180, waterL: 480 }, { isLayer: false, feedMode: 'kg' });
    expect(p).toMatchObject({ deaths: 3, feedUnit: 'KG', feedQuantity: 180, waterL: 480 });
    expect(p.entryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('mode sacs : feedBags + feedUnit SAC (poids du sac transmis)', () => {
    const p = buildDailyEntryPayload({ ...baseline, feedSacs: 5, bagSizeKg: 25 }, { isLayer: false, feedMode: 'sacs' });
    expect(p).toMatchObject({ feedUnit: 'SAC', feedBags: 5, bagSizeKg: 25 });
  });

  it('mode sacs : sans poids de sac, aucun bagSizeKg envoyé', () => {
    const p = buildDailyEntryPayload({ ...baseline, feedSacs: 5, bagSizeKg: undefined }, { isLayer: false, feedMode: 'sacs' });
    expect(p).toMatchObject({ feedUnit: 'SAC', feedBags: 5 });
    expect(p.bagSizeKg).toBeUndefined();
  });

  it('ne garde pas les deux modes simultanément', () => {
    const p = buildDailyEntryPayload({ ...baseline, feedKg: 10, feedSacs: 5 }, { isLayer: false, feedMode: 'kg' });
    expect(p.feedUnit).toBe('KG');
    expect(p.feedBags).toBeUndefined();
  });

  it('convertit le poids en kg', () => {
    const p = buildDailyEntryPayload({ ...baseline, weightG: 1820 }, { isLayer: false, feedMode: 'kg' });
    expect(p.avgWeightKg).toBe(1.82);
  });

  it('pondeuse : œufs collectés, vendables = collectés − fêlés, fêlés', () => {
    const p = buildDailyEntryPayload({ ...baseline, eggs: 400, eggsCracked: 12 }, { isLayer: true, feedMode: 'kg' });
    expect(p.eggsCollected).toBe(400);
    expect(p.eggsSellable).toBe(388);
    expect(p.eggsCracked).toBe(12);
  });

  it('répartition pro : vendables = collectés − fêlés − petits − double jaune − sales', () => {
    const p = buildDailyEntryPayload(
      { ...baseline, eggs: 400, eggsCracked: 12, eggsSmall: 4, eggsDoubleYolk: 3, eggsDirty: 2 },
      { isLayer: true, feedMode: 'kg' },
    );
    expect(p.eggsCollected).toBe(400);
    expect(p.eggsSellable).toBe(379);
    expect(p.eggsCracked).toBe(12);
    expect(p.eggsSmall).toBe(4);
    expect(p.eggsDoubleYolk).toBe(3);
    expect(p.eggsDirty).toBe(2);
  });

  it('répartition : ne se limite jamais en-dessous de zéro et ignore les catégories à zéro', () => {
    const p = buildDailyEntryPayload(
      { ...baseline, eggs: 10, eggsCracked: 10, eggsSmall: 0, eggsDoubleYolk: 5, eggsDirty: 5 },
      { isLayer: true, feedMode: 'kg' },
    );
    expect(p.eggsSellable).toBe(0);
    expect(p.eggsSmall).toBeUndefined();
    expect(p.eggsDoubleYolk).toBe(5);
  });

  it('toute bande peut déclarer des œufs — chair comme pondeuse', () => {
    const p = buildDailyEntryPayload({ ...baseline, eggs: 400, eggsCracked: 12 }, { isLayer: false, feedMode: 'kg' });
    expect(p.eggsCollected).toBe(400);
    expect(p.eggsSellable).toBe(388);
    expect(p.eggsCracked).toBe(12);
  });

  it('aucune saisie : seule la date', () => {
    const p = buildDailyEntryPayload(baseline, { isLayer: true, feedMode: 'kg' });
    expect(Object.keys(p)).toEqual(['entryDate']);
  });

  it('saisie aliment : type de provende + déduction par lot', () => {
    const p = buildDailyEntryPayload(
      { ...baseline, feedKg: 50, feedPhase: 'PONTE_PHASE_1', inputLotId: 'in-04' },
      { isLayer: true, feedMode: 'kg' },
    );
    expect(p).toMatchObject({ feedUnit: 'KG', feedQuantity: 50, feedPhase: 'PONTE_PHASE_1', inputLotId: 'in-04' });
  });

  it('saisie aliment : pas de réduction par lot (aucun lot fourni)', () => {
    const p = buildDailyEntryPayload(
      { ...baseline, feedSacs: 3, feedPhase: 'CROISSANCE', inputLotId: null },
      { isLayer: false, feedMode: 'sacs' },
    );
    expect(p).toMatchObject({ feedUnit: 'SAC', feedBags: 3, feedPhase: 'CROISSANCE' });
    expect(p.inputLotId).toBeUndefined();
  });

  it('achat externe : skipStockDeduction=true et jamais d’inputLotId', () => {
    const p = buildDailyEntryPayload(
      { ...baseline, feedSacs: 3, feedPhase: 'CROISSANCE', inputLotId: 'in-04', skipStockDeduction: true },
      { isLayer: false, feedMode: 'sacs' },
    );
    expect(p.skipStockDeduction).toBe(true);
    expect(p.inputLotId).toBeUndefined();
  });

  it('sans aliment : ni feedPhase ni inputLotId transmis', () => {
    const p = buildDailyEntryPayload(
      { ...baseline, feedPhase: 'PONTE_PHASE_1', inputLotId: 'in-04' },
      { isLayer: true, feedMode: 'kg' },
    );
    expect(p.feedPhase).toBeUndefined();
    expect(p.inputLotId).toBeUndefined();
  });
});

describe('buildSaleItem', () => {
  it('PIECE impose un lot', () => {
    const ok = buildSaleItem('PIECE', 4, 2500, 'lot-1');
    if ('item' in ok) {
      expect(ok.item).toMatchObject({ productType: 'POULET_PIECE', unit: 'PIECE', quantity: 4, unitPriceFcfa: 2500, batchId: 'lot-1' });
    } else {
      throw new Error('PIECE avec lot doit réussir');
    }
  });

  it('PIECE sans lot → erreur', () => {
    const r = buildSaleItem('PIECE', 4, 2500, null);
    if ('error' in r) {
      expect(r.error).toContain('lot');
    } else {
      throw new Error('PIECE sans lot doit échouer');
    }
  });

  it('KG sans lot → erreur', () => {
    const r = buildSaleItem('KG', 10, 2200, null);
    if ('error' in r) {
      expect(r.error).toContain('lot');
    } else {
      throw new Error('KG sans lot doit échouer');
    }
  });

  it('KG : oiseaux comptés → kilo estimé + pieceCount', () => {
    const r = buildSaleItem('KG', 10, 2200, 'lot-1');
    if ('item' in r) {
      expect(r.item).toMatchObject({
        productType: 'POULET_KG',
        unit: 'KG',
        quantity: 18,
        unitPriceFcfa: 2200,
        batchId: 'lot-1',
        pieceCount: 10,
      });
    } else {
      throw new Error('KG avec lot doit réussir');
    }
  });

  it('KG : poids moyen personnalisé modifie le kilo estimé', () => {
    const r = buildSaleItem('KG', 10, 2200, 'lot-1', { avgWeightKg: 2 });
    if ('item' in r) {
      expect(r.item.quantity).toBe(20);
      expect(r.item.pieceCount).toBe(10);
    } else {
      throw new Error('KG avec lot doit réussir');
    }
  });

  it('OEUF → alvéoles, batch optionnel', () => {
    const withLot = buildSaleItem('OEUF', 5, 2500, 'lot-p');
    if ('item' in withLot) {
      expect(withLot.item).toMatchObject({ productType: 'OEUFS', unit: 'ALVEOLES', batchId: 'lot-p' });
    } else {
      throw new Error('OEUF avec lot doit réussir');
    }
    const without = buildSaleItem('OEUF', 5, 2500, null);
    if ('item' in without) {
      expect(without.item.productType).toBe('OEUFS');
      expect(without.item.batchId).toBeUndefined();
    } else {
      throw new Error('OEUF sans lot doit réussir');
    }
  });

  it('AUTRE → libre, sans lot', () => {
    const r = buildSaleItem('AUTRE', 2, 1000, 'lot-1');
    if ('item' in r) {
      expect(r.item).toMatchObject({ productType: 'AUTRE', unit: 'UNITE' });
      expect(r.item.batchId).toBeUndefined();
    } else {
      throw new Error('AUTRE doit réussir');
    }
  });

  it('ABATTU_PIECE : source abattoir ou transfert boutique', () => {
    const pool = buildSaleItem('ABATTU_PIECE', 4, 3200, 'lot-1', { sourceSlaughterOrderId: 'ab-1' });
    if ('item' in pool) {
      expect(pool.item).toMatchObject({ productType: 'ABATTU_PIECE', sourceSlaughterOrderId: 'ab-1' });
      expect(pool.item.stockTransferId).toBeUndefined();
    } else {
      throw new Error('ABATTU pool doit réussir');
    }
    const transfer = buildSaleItem('ABATTU_PIECE', 4, 3200, 'lot-1', { stockTransferId: 'tr-1' });
    if ('item' in transfer) {
      expect(transfer.item).toMatchObject({ productType: 'ABATTU_PIECE', stockTransferId: 'tr-1' });
      expect(transfer.item.sourceSlaughterOrderId).toBeUndefined();
    } else {
      throw new Error('ABATTU transfert doit réussir');
    }
  });

  it('ABATTU_KG : pièces comptées, transfert boutique porté', () => {
    const r = buildSaleItem('ABATTU_KG', 6, 2800, 'lot-1', {
      avgWeightKg: 1.8,
      stockTransferId: 'tr-9',
    });
    if ('item' in r) {
      expect(r.item).toMatchObject({
        productType: 'ABATTU_KG',
        unit: 'KG',
        quantity: 10.8,
        pieceCount: 6,
        stockTransferId: 'tr-9',
      });
    } else {
      throw new Error('ABATTU_KG transfert doit réussir');
    }
  });

  it('OEUF : une réserve boutique porte le stockTransferId', () => {
    const r = buildSaleItem('OEUF', 10, 3000, 'lot-p', { stockTransferId: 'tr-7' });
    if ('item' in r) {
      expect(r.item).toMatchObject({ productType: 'OEUFS', unit: 'ALVEOLES', batchId: 'lot-p', stockTransferId: 'tr-7' });
    } else {
      throw new Error('OEUF réserve doit réussir');
    }
  });

  it('PROVENDE : exige une réserve et porte SAC/KG + stockTransferId', () => {
    const noReserve = buildSaleItem('PROVENDE', 2, 4500, null);
    expect('error' in noReserve).toBe(true);
    const sac = buildSaleItem('PROVENDE', 2, 4500, null, { stockTransferId: 'tr-3', unit: 'SAC' });
    if ('item' in sac) {
      expect(sac.item).toMatchObject({ productType: 'PROVENDE', unit: 'SAC', quantity: 2, stockTransferId: 'tr-3' });
      expect(sac.item.batchId).toBeUndefined();
    } else {
      throw new Error('PROVENDE sac doit réussir');
    }
    const kg = buildSaleItem('PROVENDE', 50, 500, null, { stockTransferId: 'tr-3', unit: 'KG' });
    if ('item' in kg) {
      expect(kg.item).toMatchObject({ productType: 'PROVENDE', unit: 'KG', quantity: 50 });
    } else {
      throw new Error('PROVENDE kg doit réussir');
    }
  });
});

describe('createDailyEntry', () => {
  it('POSTe sur le lot avec source MANUELLE', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { id: 'e-1' }));
    await createDailyEntry('f-1', 'b-2', { entryDate: '2026-08-28', deaths: 2 });
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/batches/b-2/daily-entries');
    expect(JSON.parse(call.init.body as string)).toEqual({ entryDate: '2026-08-28', deaths: 2, source: 'MANUELLE' });
    expect(call.init.method).toBe('POST');
  });
});

describe('ensureCashOpen', () => {
  it('ouvre la caisse si aucune session', async () => {
    const fetchMock = stubFetchSequence([jsonResponse(200, null), jsonResponse(201, { session: { id: 's-1' } })]);
    await ensureCashOpen('f-1');
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(readCall(fetchMock, 0).url).toContain('/caisse/current');
    const open = readCall(fetchMock, 1);
    expect(open.url).toContain('/caisse/open');
    expect(open.init.method).toBe('POST');
    expect(JSON.parse(open.init.body as string)).toEqual({ openingBalanceFcfa: 0 });
  });

  it('n’ouvre pas si une session existe déjà', async () => {
    const fetchMock = stubFetchSequence([jsonResponse(200, { session: { id: 's-1' } })]);
    await ensureCashOpen('f-1');
    expect(fetchMock.mock.calls).toHaveLength(1);
  });
});

describe('createSale', () => {
  it('POSTe la vente espèces et renvoie la référence', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { sale: { referenceNumber: 'VTE-20260828-123456' } }));
    const item = buildSaleItem('PIECE', 4, 2500, 'lot-1');
    if (!('item' in item)) throw new Error('attendu un item');
    const res = await createSale('f-1', {
      saleDate: '2026-08-28',
      items: [item.item],
      payments: [{ method: 'CASH', amountFcfa: 10000 }],
    });
    expect(res.sale.referenceNumber).toBe('VTE-20260828-123456');
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/sales');
    const body = JSON.parse(call.init.body as string);
    expect(body.items[0].productType).toBe('POULET_PIECE');
    expect(body.payments[0]).toMatchObject({ method: 'CASH', amountFcfa: 10000 });
  });
});

describe('acknowledgeAlert', () => {
  it('POSTe l’acquittement de l’alerte', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { id: 'a-1', status: 'ACQUITTEE' }));
    await acknowledgeAlert('f-1', 'a-1');
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/alerts/a-1/acknowledge');
    expect(call.init.method).toBe('POST');
  });
});

describe('openCaisse', () => {
  it('POSTe l’ouverture avec le fonds de caisse initial', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { session: { id: 's-1' } }));
    await openCaisse('f-1', 50000);
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/caisse/open');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual({ openingBalanceFcfa: 50000 });
  });
});

describe('closeCaisse', () => {
  it('POSTe la clôture avec le solde déclaré', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { session: { id: 's-1', status: 'CLOSED' } }));
    await closeCaisse('f-1', 186500);
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/caisse/close');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual({ declaredBalanceFcfa: 186500 });
  });
});

describe('prophylaxie', () => {
  it('generate : sans protocole → corps vide', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { events: [] }));
    await generateProphylaxis('f-1', 'b-2');
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/batches/b-2/prophylaxis/generate');
    expect(call.init.method).toBe('POST');
    expect(call.init.body).toBe('{}');
  });

  it('generate : avec protocole → body { protocolId }', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { events: [] }));
    await generateProphylaxis('f-1', 'b-2', 'proto-1');
    const call = readCall(fetchMock);
    expect(JSON.parse(call.init.body as string)).toEqual({ protocolId: 'proto-1' });
  });

  it('complete : POSTe sur l’événement avec date', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, {}));
    await completeProphylaxis('f-1', 'b-2', 'e-9', { completedAt: '2026-08-28' });
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/batches/b-2/prophylaxis/e-9/complete');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual({ completedAt: '2026-08-28' });
  });

  it('cancel : raison envoyée', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, {}));
    await cancelProphylaxis('f-1', 'b-2', 'e-9', 'Fin de bande');
    const call = readCall(fetchMock);
    expect(call.url).toContain('/prophylaxis/e-9/cancel');
    expect(JSON.parse(call.init.body as string)).toEqual({ reason: 'Fin de bande' });
  });

  it('cancel : sans raison → corps vide', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, {}));
    await cancelProphylaxis('f-1', 'b-2', 'e-9');
    expect(JSON.parse(readCall(fetchMock).init.body as string)).toEqual({});
  });

  it('reschedule : PATCH avec la nouvelle date', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, {}));
    await rescheduleProphylaxis('f-1', 'b-2', 'e-9', '2026-08-29');
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/batches/b-2/prophylaxis/e-9');
    expect(call.init.method).toBe('PATCH');
    expect(JSON.parse(call.init.body as string)).toEqual({ scheduledDate: '2026-08-29' });
  });
});

describe('createTreatment', () => {
  it('POSTe le soin sur le lot', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { id: 't-1' }));
    await createTreatment('f-1', 'b-2', { careType: 'VITAMINE', productName: 'Vitamines', dosage: '100 g / 100 L' });
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/batches/b-2/treatments');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual({ careType: 'VITAMINE', productName: 'Vitamines', dosage: '100 g / 100 L' });
  });
});

describe('vaccination / médecine (schedules)', () => {
  it('generateVaccineProgram : applique un programme pré-chargé à plusieurs lots', async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(201, { protocolId: 'vacc-poulet-chair-gabon', planned: 6, skipped: 0, perLot: [], events: [] }),
    );
    const res = await generateVaccineProgram('f-1', 'vacc-poulet-chair-gabon', ['b-2', 'b-3']);
    const call = readCall(fetchMock);
    expect(res.planned).toBe(6);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/vaccine-schedules/programs/generate');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual({
      protocolId: 'vacc-poulet-chair-gabon',
      lotIds: ['b-2', 'b-3'],
    });
  });

  it('createManualSchedule : vaccin multi-lots', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, []));
    await createManualSchedule('f-1', {
      lotIds: ['b-2', 'b-3'],
      careType: 'VACCIN',
      name: 'Rappel Newcastle',
      scheduledDate: '2026-09-01',
      route: 'Eau de boisson',
    });
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/vaccine-schedules/manual');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual({
      lotIds: ['b-2', 'b-3'],
      careType: 'VACCIN',
      name: 'Rappel Newcastle',
      scheduledDate: '2026-09-01',
      route: 'Eau de boisson',
    });
  });

  it('createManualSchedule : médicament « Sortir du stock » avec lot + quantité', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, []));
    await createManualSchedule('f-1', {
      lotIds: ['b-2'],
      careType: 'MEDICAMENT',
      name: 'Antibiotique respiratoire',
      scheduledDate: '2026-09-02',
      decrementStock: true,
      medicationLotId: 'in-med-01',
      medicationQty: 3,
      medicationUnit: 'dose',
      withdrawalDays: 5,
    });
    const call = readCall(fetchMock);
    const body = JSON.parse(call.init.body as string);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/vaccine-schedules/manual');
    expect(body).toMatchObject({
      careType: 'MEDICAMENT',
      decrementStock: true,
      medicationLotId: 'in-med-01',
      medicationQty: 3,
      medicationUnit: 'dose',
      withdrawalDays: 5,
    });
  });

  it('updateSchedule : PATCH édition d’un soin planifié', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { id: 'e-9' }));
    await updateSchedule('f-1', 'b-2', 'e-9', {
      name: 'Renommé',
      careType: 'MEDICAMENT',
      route: 'Goutte oculaire',
    });
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/batches/b-2/vaccine-schedules/e-9');
    expect(call.init.method).toBe('PATCH');
    expect(JSON.parse(call.init.body as string)).toEqual({
      name: 'Renommé',
      careType: 'MEDICAMENT',
      route: 'Goutte oculaire',
    });
  });

  it('deleteSchedule : DELETE Propriétaire, restaure le stock au backend', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { deleted: true }));
    const res = await deleteSchedule('f-1', 'b-2', 'e-9');
    const call = readCall(fetchMock);
    expect(res.deleted).toBe(true);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/batches/b-2/vaccine-schedules/e-9');
    expect(call.init.method).toBe('DELETE');
  });
});

describe('abattage', () => {
  it('crée un ordre ABATTU/EXTERNE', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { id: 'ab-1' }));
    await createSlaughterOrder('f-1', {
      batchId: 'b-2',
      slaughterType: 'ABATTU',
      destination: 'EXTERNE',
      plannedDate: '2026-08-29',
      birdCount: 500,
      abattoirLotCode: 'A-FR-7789',
    });
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/slaughter-orders');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toMatchObject({
      batchId: 'b-2',
      slaughterType: 'ABATTU',
      destination: 'EXTERNE',
      birdCount: 500,
      abattoirLotCode: 'A-FR-7789',
    });
  });

  it('send : POSTe sur l’ordre', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { status: 'SENT' }));
    await sendSlaughterOrder('f-1', 'ab-1');
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/slaughter-orders/ab-1/send');
    expect(call.init.method).toBe('POST');
  });

  it('process : POSTe sur l’ordre', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { status: 'PROCESSED' }));
    await processSlaughterOrder('f-1', 'ab-1', { abattoirLotCode: 'X-1' });
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/slaughter-orders/ab-1/process');
    expect(JSON.parse(call.init.body as string)).toEqual({ abattoirLotCode: 'X-1' });
  });

  it('cancel : raison obligatoire', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { status: 'CANCELLED' }));
    await cancelSlaughterOrder('f-1', 'ab-1', 'Retard de planification');
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/slaughter-orders/ab-1/cancel');
    expect(JSON.parse(call.init.body as string)).toEqual({ reason: 'Retard de planification' });
  });
});

describe('createCustomer', () => {
  it('crée la fiche client (phone optionnel)', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { id: 'c-1' }));
    await createCustomer('f-1', { fullName: 'Restaurant Coco', phone: '074112233' });
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/customers');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual({ fullName: 'Restaurant Coco', phone: '074112233' });
  });
});

describe('createFarmMember', () => {
  it('crée un compte Éleveur et le lie à la ferme', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { user: { id: 'u-9' }, employment: { id: 'emp-9' } }));
    await createFarmMember('f-1', {
      fullName: 'Jean-Marc Ondo',
      phone: '+24174123457',
      code: 'secret6',
      buildingAssignment: 'Bâtiment A',
    });
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/eleveurs');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual({
      fullName: 'Jean-Marc Ondo',
      phone: '+24174123457',
      code: 'secret6',
      buildingAssignment: 'Bâtiment A',
    });
  });
});

describe('createInput', () => {
  it('enregistre un intrant provende (kind ALIMENT, HACCP)', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { id: 'in-1' }));
    await createInput('f-1', {
      batchId: 'b-2',
      entryType: 'BAG',
      feedPhase: 'CROISSANCE',
      productName: 'Provende Croissance',
      supplier: 'CEAG',
      supplierLotNumber: 'CEAG-2026-88',
      expirationDate: '2026-12-31',
      receivedDate: '2026-08-29',
      quantity: 10,
      unitPriceFcfa: 18500,
      unit: 'SAC',
      bagSizeKg: 50,
      numberOfBags: 10,
    });
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/inputs');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual({
      batchId: 'b-2',
      productName: 'Provende Croissance',
      supplier: 'CEAG',
      supplierLotNumber: 'CEAG-2026-88',
      expirationDate: '2026-12-31',
      receivedDate: '2026-08-29',
      quantity: 10,
      unitPriceFcfa: 18500,
      unit: 'SAC',
      entryType: 'BAG',
      feedPhase: 'CROISSANCE',
      bagSizeKg: 50,
      numberOfBags: 10,
      kind: 'ALIMENT',
    });
  });
});

describe('transferts de stock ferme → boutique', () => {
  it('createStockTransfer POSTe le transfert', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { id: 'tr-1' }));
    await createStockTransfer('f-1', { productType: 'ABATTU', slaughterOrderId: 'ab-1', pointOfSaleId: 'pdv-2', quantity: 12 });
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/stock-transfers');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual({ productType: 'ABATTU', slaughterOrderId: 'ab-1', pointOfSaleId: 'pdv-2', quantity: 12 });
  });

  it('cancelStockTransfer POSTe l’annulation sur le transfert', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { id: 'tr-1', status: 'CANCELLED' }));
    await cancelStockTransfer('f-1', 'tr-1');
    const call = readCall(fetchMock);
    expect(call.url).toBe('http://10.0.0.5:3000/farms/f-1/stock-transfers/tr-1/cancel');
    expect(call.init.method).toBe('POST');
  });
});