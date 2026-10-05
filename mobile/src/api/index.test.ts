import { describe, expect, it, vi } from 'vitest';

import {
  fetchAdvisory,
  fetchBatches,
  fetchCaisseCurrent,
  fetchCaisseSessions,
  fetchStockTransfers,
  fetchCustomerHistory,
  fetchCustomers,
  fetchExpenses,
  fetchFarmInputs,
  fetchFeedStock,
  fetchFarmMembers,
  fetchOrder,
  fetchOrders,
  fetchPromotions,
  fetchProtocols,
  fetchProphylaxis,
  fetchReferenceConstants,
  fetchRentabiliteBatch,
  fetchRentabiliteOverview,
  fetchSales,
  fetchSanitaryProgram,
  fetchSlaughterOrders,
  fetchTreatments,
  isLive,
} from './index';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: 'demo.local:8081' } },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('./live', () => ({
  LiveApi: class {
    fetchDashboard = vi.fn(async () => ({ src: 'live' }));
    fetchBatches = vi.fn(async () => [{ src: 'live' }]);
    fetchBatch = vi.fn(async () => ({ src: 'live' }));
    fetchCurve = vi.fn(async () => ({ src: 'live' }));
    fetchAdvisory = vi.fn(async () => ({ src: 'live' }));
    fetchFeedStock = vi.fn(async () => ({ src: 'live' }));
    fetchCaisseCurrent = vi.fn(async () => ({ src: 'live' }));
    fetchCaisseSessions = vi.fn(async () => [{ src: 'live' }]);
    fetchFarms = vi.fn(async () => [{ src: 'live' }]);
    fetchProtocols = vi.fn(async () => [{ src: 'live' }]);
    fetchSanitaryProgram = vi.fn(async () => ({ src: 'live' }));
    fetchFarmInputs = vi.fn(async () => [{ src: 'live' }]);
    fetchProphylaxis = vi.fn(async () => [{ src: 'live' }]);
    fetchTreatments = vi.fn(async () => [{ src: 'live' }]);
    fetchSlaughterOrders = vi.fn(async () => [{ src: 'live' }]);
    fetchCustomers = vi.fn(async () => [{ src: 'live' }]);
    fetchCustomer = vi.fn(async () => ({ src: 'live' }));
    fetchCustomerStats = vi.fn(async () => ({ src: 'live' }));
    fetchCustomerHistory = vi.fn(async () => [{ src: 'live' }]);
    fetchPromotions = vi.fn(async () => [{ src: 'live' }]);
    fetchRentabiliteOverview = vi.fn(async () => ({ src: 'live' }));
    fetchRentabiliteBatch = vi.fn(async () => ({ src: 'live' }));
    fetchSales = vi.fn(async () => [{ src: 'live' }]);
    fetchStockTransfers = vi.fn(async () => [{ src: 'live' }]);
    fetchExpenses = vi.fn(async () => [{ src: 'live' }]);
    fetchOrders = vi.fn(async () => [{ src: 'live' }]);
    fetchOrder = vi.fn(async () => ({ src: 'live' }));
    fetchFarmMembers = vi.fn(async () => [{ src: 'live' }]);
    fetchReferenceConstants = vi.fn(async () => [{ src: 'live' }]);
  },
}));

describe('facade @/api (100 % connecté)', () => {
  it('isLive retourne toujours true (plus de démo en local)', () => {
    expect(isLive()).toBe(true);
  });

  it('route vers live quelle que soit la session', async () => {
    const batches = await fetchBatches('f-demo');
    expect(batches).toEqual([{ src: 'live' }]);
    const adv = await fetchAdvisory('f-demo');
    expect(adv).toEqual({ src: 'live' });
  });

  it('route caisse / stock vers live', async () => {
    const feed = await fetchFeedStock('f-demo');
    expect(feed).toEqual({ src: 'live' });
    const cur = await fetchCaisseCurrent('f-demo');
    expect(cur).toEqual({ src: 'live' });
    const sessions = await fetchCaisseSessions('f-demo');
    expect(sessions).toEqual([{ src: 'live' }]);
  });

  it('route sanitaire / abattage / clients / rentabilité vers live', async () => {
    expect(await fetchProphylaxis('f-demo', 'b-1')).toEqual([{ src: 'live' }]);
    expect(await fetchTreatments('f-demo', 'b-1')).toEqual([{ src: 'live' }]);
    expect(await fetchProtocols('PINTADE', 'CHAIR')).toEqual([{ src: 'live' }]);
    expect(await fetchSanitaryProgram('vacc-1')).toEqual({ src: 'live' });
    expect(await fetchFarmInputs('f-demo')).toEqual([{ src: 'live' }]);
    expect(await fetchSlaughterOrders('f-demo')).toEqual([{ src: 'live' }]);
    expect(await fetchCustomers('f-demo')).toEqual([{ src: 'live' }]);
    expect(await fetchCustomerHistory('f-demo', 'c-1')).toEqual([{ src: 'live' }]);
    expect(await fetchPromotions('f-demo')).toEqual([{ src: 'live' }]);
    expect(await fetchRentabiliteOverview('f-demo')).toEqual({ src: 'live' });
    expect(await fetchRentabiliteBatch('f-demo', 'b-1')).toEqual({ src: 'live' });
    expect(await fetchSales('f-demo')).toEqual([{ src: 'live' }]);
    expect(await fetchStockTransfers('f-demo')).toEqual([{ src: 'live' }]);
    expect(await fetchExpenses('f-demo')).toEqual([{ src: 'live' }]);
    expect(await fetchOrders('f-demo')).toEqual([{ src: 'live' }]);
    expect(await fetchOrder('f-demo', 'ord-1')).toEqual({ src: 'live' });
    expect(await fetchFarmMembers('f-demo')).toEqual([{ src: 'live' }]);
    expect(await fetchReferenceConstants()).toEqual([{ src: 'live' }]);
  });
});