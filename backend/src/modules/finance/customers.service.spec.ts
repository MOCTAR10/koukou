import { describe, expect, it, vi } from 'vitest';
import {
  buildCustomerBalance,
  CustomersService,
} from './customers.service.js';

/** Chainable query-builder fake: every call returns itself, getRawMany pops rows. */
function fakeManager(results: unknown[][]) {
  const queue = [...results];
  const make = (): unknown => {
    const qb: Record<string, unknown> = {};
    const chain = new Proxy(qb, {
      get: (_t, prop) => {
        if (prop === 'getRawMany') return async () => queue.shift() ?? [];
        return () => chain;
      },
    });
    return chain;
  };
  return { createQueryBuilder: vi.fn(make) };
}

function service(manager: unknown, customers: { id: string; type?: string }[]) {
  const repo = { manager, find: vi.fn(async () => customers) };
  const constants = {
    get: vi.fn(async (_k: string, def: number) => def),
  };
  return new CustomersService(
    repo as never,
    { assertAccessible: vi.fn() } as never,
    constants as never,
    {} as never,
    {} as never,
  );
}

describe('buildCustomerBalance', () => {
  it('never reports a negative outstanding amount', () => {
    expect(buildCustomerBalance(1000, 400)).toEqual({
      totalInvoicedFcfa: 1000,
      paidFcfa: 400,
      outstandingFcfa: 600,
    });
    expect(buildCustomerBalance(100, 300).outstandingFcfa).toBe(0);
  });
});

describe('CustomersService.getFarmCustomerFinance', () => {
  it('merges the invoiced and paid GROUP BY rows per customer', async () => {
    const manager = fakeManager([
      [
        { customerId: 'a', total: '5000' },
        { customerId: 'b', total: '2000' },
      ],
      [
        { customerId: 'a', total: '1500' },
        { customerId: 'c', total: '300' },
      ],
    ]);
    const svc = service(manager, []);
    const map = await svc.getFarmCustomerFinance('farm');
    expect(map.get('a')).toEqual(buildCustomerBalance(5000, 1500));
    expect(map.get('b')).toEqual(buildCustomerBalance(2000, 0));
    expect(map.get('c')).toEqual(buildCustomerBalance(0, 300));
    expect(map.get('d')).toBeUndefined();
    // Two aggregated queries, whatever the number of customers.
    expect(manager.createQueryBuilder).toHaveBeenCalledTimes(2);
  });
});
