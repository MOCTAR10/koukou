import { describe, expect, it, vi } from 'vitest';
import { AlertKind } from '../../common/enums/alert-level.enum.js';
import { BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import {
  AdvisoryEngine,
  isWaterNormApplicable,
} from './advisory.engine.js';

const drop = (todayPerBird: number, dropPct = 0) => ({
  todayPerBird,
  baselinePerBird: todayPerBird,
  dropPct,
  baselineDays: 3,
});

function build() {
  const alerts = { raise: vi.fn(), clearKind: vi.fn() };
  const constants = {
    get: vi.fn(async (_key: string, def: number) => def),
  };
  const engine = new AdvisoryEngine(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    alerts as never,
    constants as never,
    {} as never,
  );
  return { engine, alerts };
}

const broiler = { type: BatchType.CHAIR, species: Species.POULET } as never;
const metrics = (ageDays: number) =>
  ({ ageDays, waterLPerBird: 0.05, mortalityPercent: 3 }) as never;

describe('isWaterNormApplicable', () => {
  it('only broiler chickens aged 21 days or more', () => {
    expect(isWaterNormApplicable(broiler, { ageDays: 21 })).toBe(true);
    expect(isWaterNormApplicable(broiler, { ageDays: 20 })).toBe(false);
    expect(
      isWaterNormApplicable(
        { type: BatchType.CHAIR, species: Species.CAILLE },
        { ageDays: 30 },
      ),
    ).toBe(false);
    expect(
      isWaterNormApplicable(
        { type: BatchType.PONDEUSE, species: Species.POULET },
        { ageDays: 30 },
      ),
    ).toBe(false);
  });
});

describe('AdvisoryEngine water evaluation', () => {
  it('raises the norm alert for a broiler of 21+ days far from the norm', async () => {
    const { engine, alerts } = build();
    await (engine as any).evaluateWater(broiler, metrics(25), 'f', 'b', drop(0.05));
    expect(alerts.raise).toHaveBeenCalledTimes(1);
    expect(alerts.raise.mock.calls[0][0].kind).toBe(AlertKind.EAU);
  });

  it('raises no norm alert on a young batch and clears a stale one', async () => {
    const { engine, alerts } = build();
    await (engine as any).evaluateWater(broiler, metrics(10), 'f', 'b', drop(0.05));
    expect(alerts.raise).not.toHaveBeenCalled();
    expect(alerts.clearKind).toHaveBeenCalledWith('f', 'b', AlertKind.EAU);
  });

  it('raises no norm alert on another species', async () => {
    const { engine, alerts } = build();
    const quail = { type: BatchType.CHAIR, species: Species.CAILLE } as never;
    await (engine as any).evaluateWater(quail, metrics(40), 'f', 'b', drop(0.05));
    expect(alerts.raise).not.toHaveBeenCalled();
  });

  it('still raises the water-drop alert on a young batch', async () => {
    const { engine, alerts } = build();
    await (engine as any).evaluateWater(broiler, metrics(10), 'f', 'b', drop(0.05, 30));
    expect(alerts.raise).toHaveBeenCalledTimes(1);
  });

  it('leaves alerts untouched when there is no water reading', async () => {
    const { engine, alerts } = build();
    await (engine as any).evaluateWater(broiler, metrics(25), 'f', 'b', null);
    await (engine as any).evaluateWaterHealth(broiler, metrics(25), 'f', 'b', null);
    expect(alerts.raise).not.toHaveBeenCalled();
    expect(alerts.clearKind).not.toHaveBeenCalled();
  });

  it('clears the disease alert when a reading shows the drop resolved', async () => {
    const { engine, alerts } = build();
    await (engine as any).evaluateWaterHealth(broiler, metrics(25), 'f', 'b', drop(0.2, 2));
    expect(alerts.clearKind).toHaveBeenCalledWith('f', 'b', AlertKind.MALADIE);
  });
});
