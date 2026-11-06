import { Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { AccessScopeKind } from '../enums/access-scope-kind.enum.js';
import { UserRole } from '../enums/role.enum.js';
import {
  Action,
  Domain,
  InstitutionReadOnly,
} from '../decorators/domain.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import type { InstitutionAccess } from '../../modules/access/access-rules.js';
import type { ScopeResolver } from '../../modules/access/scope-resolver.service.js';
import { ProgramAccessGuard } from './program-access.guard.js';

@Controller('none')
class NoDomainController {
  @Get()
  list() {}
}

@Domain('REGISTRE')
@Controller('farms')
class RegistryController {
  @Get(':farmId')
  read() {}

  @Post()
  create() {}

  @Post('check')
  @Action('CONSULTER')
  check() {}

  @Get('team')
  @Domain('EQUIPE')
  team() {}

  @Get('open')
  @Public()
  open() {}
}

// POUFA lot A2 droits: a Fermia bonus stored under a programme domain.
@Domain('ECONOMIQUE')
@InstitutionReadOnly('Dépenses')
@Controller('farms/:farmId/expenses')
class ExpensesController {
  @Get()
  list() {}

  @Post()
  create() {}

  @Post('check')
  @Action('CONSULTER')
  check() {}
}

@Domain('VENTES')
@Controller('farms/:farmId/caisse')
class CaisseController {
  @Get()
  read() {}

  @Post('open')
  open() {}
}

const ACCESS: InstitutionAccess = {
  membershipId: 'm',
  userId: 'u',
  programId: 'p',
  profileId: 'pp',
  profileCode: 'AGENT_TECHNIQUE',
  profileLabel: 'Agent technique',
  scopeKind: AccessScopeKind.FARMS,
  matrix: { REGISTRE: ['CONSULTER'] },
  provinceIds: [],
  farmIds: ['in-scope'],
  operatorId: null,
};

function guardWith(access: InstitutionAccess | null) {
  const assertFarmId = vi.fn((_a: InstitutionAccess, farmId: string) =>
    farmId === 'in-scope'
      ? Promise.resolve()
      : Promise.reject(new ForbiddenException('hors périmètre')),
  );
  const scope = {
    accessOf: vi.fn(() => Promise.resolve(access)),
    assertFarmId,
  } as unknown as ScopeResolver;
  return {
    guard: new ProgramAccessGuard(new Reflector(), scope),
    assertFarmId,
  };
}

function ctx(
  cls: object,
  handler: string,
  method: string,
  role: string,
  params: Record<string, string> = {},
): ExecutionContext {
  const proto = (cls as { prototype: Record<string, unknown> }).prototype;
  return {
    getType: () => 'http',
    getClass: () => cls,
    getHandler: () => proto[handler],
    switchToHttp: () => ({
      getRequest: () => ({ method, params, user: { id: 'u', role } }),
    }),
  } as unknown as ExecutionContext;
}

describe('ProgramAccessGuard', () => {
  it('leaves non-institutional accounts to the usual guards', async () => {
    const { guard } = guardWith(null);
    for (const role of [
      UserRole.PROPRIETAIRE,
      UserRole.ELEVEUR,
      UserRole.ACHETEUR,
      UserRole.PLATFORM_ADMIN,
    ]) {
      await expect(
        guard.canActivate(ctx(NoDomainController, 'list', 'GET', role)),
      ).resolves.toBe(true);
    }
  });

  it('refuses an institution on a controller without @Domain', async () => {
    const { guard } = guardWith(ACCESS);
    await expect(
      guard.canActivate(
        ctx(NoDomainController, 'list', 'GET', UserRole.INSTITUTION),
      ),
    ).rejects.toThrow(/pas ouverte aux comptes institutionnels/);
  });

  it('checks the action of the HTTP method, or @Action', async () => {
    const { guard } = guardWith(ACCESS);
    await expect(
      guard.canActivate(
        ctx(RegistryController, 'create', 'POST', UserRole.INSTITUTION),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      guard.canActivate(
        ctx(RegistryController, 'check', 'POST', UserRole.INSTITUTION),
      ),
    ).resolves.toBe(true);
  });

  it('lets a route override its controller domain', async () => {
    const { guard } = guardWith(ACCESS);
    await expect(
      guard.canActivate(
        ctx(RegistryController, 'team', 'GET', UserRole.INSTITUTION),
      ),
    ).rejects.toThrow(/Équipe/);
  });

  it('checks the :farmId against the scope', async () => {
    const { guard, assertFarmId } = guardWith(ACCESS);
    await expect(
      guard.canActivate(
        ctx(RegistryController, 'read', 'GET', UserRole.INSTITUTION, {
          farmId: 'in-scope',
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        ctx(RegistryController, 'read', 'GET', UserRole.INSTITUTION, {
          farmId: 'other',
        }),
      ),
    ).rejects.toThrow(/hors périmètre/);
    expect(assertFarmId).toHaveBeenCalledTimes(2);
  });

  it('refuses an institution without membership, and operators', async () => {
    const { guard } = guardWith(null);
    await expect(
      guard.canActivate(
        ctx(RegistryController, 'check', 'POST', UserRole.INSTITUTION),
      ),
    ).rejects.toThrow(/aucun rattachement/);
    await expect(
      guard.canActivate(
        ctx(RegistryController, 'check', 'POST', UserRole.OPERATEUR),
      ),
    ).rejects.toThrow(/opérateurs/);
  });

  it('keeps a Fermia bonus read-only whatever the matrix grants', async () => {
    const { guard } = guardWith({
      ...ACCESS,
      matrix: {
        ECONOMIQUE: ['CONSULTER', 'CREER', 'MODIFIER'],
        VENTES: ['CONSULTER'],
      },
    });
    const params = { farmId: 'in-scope' };
    await expect(
      guard.canActivate(
        ctx(ExpensesController, 'list', 'GET', UserRole.INSTITUTION, params),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        ctx(ExpensesController, 'check', 'POST', UserRole.INSTITUTION, params),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        ctx(ExpensesController, 'create', 'POST', UserRole.INSTITUTION, params),
      ),
    ).rejects.toThrow(/« Dépenses » est un module de gestion propre à la ferme/);
    await expect(
      guard.canActivate(
        ctx(CaisseController, 'open', 'POST', UserRole.INSTITUTION, params),
      ),
    ).rejects.toThrow(/« Caisse et ventes ».*consultation seule/);
    // The farm's own accounts are not concerned.
    await expect(
      guard.canActivate(
        ctx(ExpensesController, 'create', 'POST', UserRole.PROPRIETAIRE, params),
      ),
    ).resolves.toBe(true);
  });

  it('lets public routes through', async () => {
    const { guard } = guardWith(null);
    await expect(
      guard.canActivate(
        ctx(RegistryController, 'open', 'GET', UserRole.INSTITUTION),
      ),
    ).resolves.toBe(true);
  });
});
