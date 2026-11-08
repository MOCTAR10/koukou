import { BadRequestException } from '@nestjs/common';

/** Largest page a client can ask for on an opt-in paginated list. */
export const MAX_PAGE_SIZE = 500;

/**
 * Optional `?limit=&offset=` of list endpoints. Without them (older clients)
 * the list stays whole: `{}` is spread into the TypeORM options. Invalid
 * values answer 400 instead of reaching SQL.
 */
export function pageOptions(
  limit?: string,
  offset?: string,
): { take?: number; skip?: number } {
  if (limit === undefined && offset === undefined) return {};
  const parse = (raw: string | undefined, name: string, min: number) => {
    if (raw === undefined || raw === '') return undefined;
    if (!/^\d{1,9}$/.test(raw) || Number(raw) < min) {
      throw new BadRequestException(
        `Paramètre « ${name} » invalide : entier ${min === 1 ? 'positif' : 'positif ou nul'} attendu.`,
      );
    }
    return Number(raw);
  };
  const take = parse(limit, 'limit', 1);
  const skip = parse(offset, 'offset', 0);
  if (take === undefined) {
    // An offset alone still needs a bound.
    return skip === undefined ? {} : { take: MAX_PAGE_SIZE, skip };
  }
  return { take: Math.min(take, MAX_PAGE_SIZE), ...(skip ? { skip } : {}) };
}
