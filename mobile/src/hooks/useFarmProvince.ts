import { useQuery } from '@tanstack/react-query';

import { fetchProvinces } from '@/api';
import { provinceName } from '@/api/format';
import type { Farm } from '@/api/types';

/** Province name of a programme farm (GET /farms carries only `provinceId`). */
export function useFarmProvince(farm: Pick<Farm, 'provinceId'> | undefined): string | null {
  const provinceId = farm?.provinceId ?? null;
  const query = useQuery({
    queryKey: ['programme-provinces'],
    queryFn: fetchProvinces,
    enabled: Boolean(provinceId),
    // Reference data: changes only when the registry adds a province.
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  return provinceName(query.data, provinceId);
}
