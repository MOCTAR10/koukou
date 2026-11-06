import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { describe, expect, it } from 'vitest';
import {
  bandeCode,
  bandeCounterScope,
  farmCode,
  localiteCode,
} from './codes.js';
import { GABON_PROVINCES } from './data/gabon-provinces.js';
import type { Program } from './entities/program.entity.js';
import {
  PROGRAM_CODE_MISSING_MESSAGE,
  requireProgramCode,
} from './program-code.js';
import { ProgrammeService } from './programme.service.js';

describe('bandeCode', () => {
  it('appends the 2-digit rank to the farm code', () => {
    expect(bandeCode('G1-0012', 7)).toBe('G1-0012-B07');
    expect(bandeCode('G1-0012', 100)).toBe('G1-0012-B100');
    expect(bandeCounterScope('G1-0012')).toBe('BANDE:G1-0012');
  });

  it('refuses a non-positive or non-integer rank', () => {
    expect(() => bandeCode('G1-0012', 0)).toThrow(RangeError);
    expect(() => bandeCode('G1-0012', 2.5)).toThrow(RangeError);
  });
});

describe('farmCode', () => {
  it('pads to 4 digits after the province code', () => {
    expect(farmCode('G1', 12)).toBe('G1-0012');
    expect(farmCode('G9', 1)).toBe('G9-0001');
    expect(farmCode('G4', 9999)).toBe('G4-9999');
  });

  it('widens instead of truncating past 9999', () => {
    expect(farmCode('G1', 10000)).toBe('G1-10000');
  });

  it('refuses a non-positive or non-integer number', () => {
    expect(() => farmCode('G1', 0)).toThrow(RangeError);
    expect(() => farmCode('G1', -3)).toThrow(RangeError);
    expect(() => farmCode('G1', 1.5)).toThrow(RangeError);
  });

  it('locality codes pad to 2 digits', () => {
    expect(localiteCode('G2', 3)).toBe('G2-03');
    expect(localiteCode('G2', 120)).toBe('G2-120');
  });
});

describe('Gabon seed data', () => {
  it('has G1…G9 and 49 localities (48 departments + Libreville)', () => {
    expect(GABON_PROVINCES.map((p) => p.code)).toEqual([
      'G1',
      'G2',
      'G3',
      'G4',
      'G5',
      'G6',
      'G7',
      'G8',
      'G9',
    ]);
    const all = GABON_PROVINCES.flatMap((p) => p.localites);
    expect(all).toHaveLength(49);
    expect(all.filter((l) => l.kind === 'DEPARTEMENT')).toHaveLength(48);
  });
});

describe('ProgrammeService', () => {
  const program = { id: 'p1', code: 'POUFA' } as Program;
  const make = (code: string | undefined, found: Program | null) =>
    new ProgrammeService(
      { get: () => code } as unknown as ConfigService,
      {
        findOne: () => Promise.resolve(found),
      } as unknown as Repository<Program>,
    );

  it('refuses to start without PROGRAM_CODE', () => {
    expect(() => make(undefined, program)).toThrow(
      PROGRAM_CODE_MISSING_MESSAGE,
    );
    expect(() => make('  ', program)).toThrow(PROGRAM_CODE_MISSING_MESSAGE);
  });

  it('serves the configured programme', async () => {
    const svc = make(' POUFA ', program);
    expect(svc.configuredCode()).toBe('POUFA');
    expect(await svc.current()).toBe(program);
    await expect(make('POUFA', null).current()).rejects.toThrow(
      /Programme POUFA absent/,
    );
  });
});

describe('requireProgramCode', () => {
  it('returns the trimmed code', () => {
    expect(requireProgramCode(' POUFA ')).toBe('POUFA');
  });

  it('stops the boot with a clear message when unset or blank', () => {
    for (const raw of [undefined, null, '', '   ', 42]) {
      expect(() => requireProgramCode(raw)).toThrow(
        PROGRAM_CODE_MISSING_MESSAGE,
      );
    }
    expect(PROGRAM_CODE_MISSING_MESSAGE).toMatch(/PROGRAM_CODE=POUFA/);
  });
});
