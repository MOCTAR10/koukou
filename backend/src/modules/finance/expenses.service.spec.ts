import { describe, expect, it, vi } from 'vitest';
import { ExpenseCategory } from '../../common/enums/expense-category.enum.js';
import { ExpensesService } from './expenses.service.js';

const user = { id: 'u1' } as never;

function build(existing: unknown) {
  const expenseRepo = { findOne: vi.fn().mockResolvedValue(existing) };
  const transaction = vi.fn().mockResolvedValue({ id: 'new' });
  const farmsService = { assertAccessible: vi.fn().mockResolvedValue(undefined) };
  const service = new ExpensesService(
    expenseRepo as never,
    {} as never,
    {} as never,
    farmsService as never,
    { transaction } as never,
    {} as never,
  );
  return { service, expenseRepo, transaction };
}

const dto = {
  category: ExpenseCategory.AUTRE,
  amountFcfa: 5000,
  paidByCaisse: true,
  idempotencyKey: 'k1',
};

describe('ExpensesService.create idempotency', () => {
  it('replay with the same key returns the stored expense, no transaction', async () => {
    const stored = { id: 'e1', idempotencyKey: 'k1' };
    const { service, transaction } = build(stored);
    await expect(service.create(user, 'f1', dto)).resolves.toBe(stored);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('first call with a key creates the expense', async () => {
    const { service, expenseRepo, transaction } = build(null);
    await expect(service.create(user, 'f1', dto)).resolves.toEqual({
      id: 'new',
    });
    expect(expenseRepo.findOne).toHaveBeenCalledWith({
      where: { farmId: 'f1', idempotencyKey: 'k1' },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('without a key it always creates', async () => {
    const { service, expenseRepo, transaction } = build({ id: 'e1' });
    await service.create(user, 'f1', { ...dto, idempotencyKey: undefined });
    expect(expenseRepo.findOne).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('a concurrent duplicate (unique violation) returns the winner', async () => {
    const winner = { id: 'w' };
    const { service, expenseRepo, transaction } = build(null);
    expenseRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    transaction.mockRejectedValueOnce({ code: '23505' });
    await expect(service.create(user, 'f1', dto)).resolves.toBe(winner);
  });
});
