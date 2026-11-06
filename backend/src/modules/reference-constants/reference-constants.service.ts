import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { ReferenceConstant } from './entities/reference-constant.entity.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { mayChangeParameter } from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import {
  referenceGroup,
  referenceOwner,
  type ReferenceGroup,
} from './reference-owners.js';

/** A conduct threshold with its owner profile (POUFA audit F8). */
export type ReferenceConstantView = ReferenceConstant & {
  ownerProfile: string;
  group: ReferenceGroup;
};

@Injectable()
export class ReferenceConstantsService {
  constructor(
    @InjectRepository(ReferenceConstant)
    private readonly repo: Repository<ReferenceConstant>,
    private readonly scope: ScopeResolver,
  ) {}

  async get(key: string, fallback: number): Promise<number> {
    const row = await this.repo.findOne({ where: { key } });
    return row ? row.value : fallback;
  }

  async getMany(keys: ReferenceKey[]): Promise<Record<string, number>> {
    const rows = await this.repo.find({ where: keys.map((k) => ({ key: k })) });
    const out: Record<string, number> = {};
    for (const row of rows) {
      out[row.key] = row.value;
    }
    return out;
  }

  async set(key: string, value: number): Promise<ReferenceConstant> {
    const row = await this.repo.findOne({ where: { key } });
    if (row) {
      row.value = value;
      return this.repo.save(row);
    }
    return this.repo.save(this.repo.create({ key, value }));
  }

  /**
   * Mise à jour « réglages » : clé existante + constante éditable uniquement,
   * par son profil propriétaire (VETERINAIRE ou DGE) ou l'administrateur de
   * la plateforme (POUFA lot A droits, F8).
   */
  async update(
    key: string,
    value: number,
    actor: AuthUser | null = null,
  ): Promise<ReferenceConstantView> {
    const row = await this.repo.findOne({ where: { key } });
    if (!row) {
      throw new NotFoundException(
        `Constante de référence inconnue : « ${key} ».`,
      );
    }
    if (actor) {
      const owner = referenceOwner(key);
      const profileCode =
        actor.role === UserRole.INSTITUTION
          ? ((await this.scope.accessOf(actor.id))?.profileCode ?? null)
          : null;
      if (!mayChangeParameter(actor.role, profileCode, owner)) {
        throw new ForbiddenException(
          `Accès refusé : le seuil « ${row.description ?? key} » relève du profil « ${owner} ».`,
        );
      }
    }
    if (row.isEditable !== true) {
      throw new BadRequestException(
        `La constante « ${key} » n'est pas modifiable en réglages.`,
      );
    }
    row.value = value;
    return this.view(await this.repo.save(row));
  }

  async findAll(): Promise<ReferenceConstantView[]> {
    const rows = await this.repo.find({ order: { key: 'ASC' } });
    return rows.map((r) => this.view(r));
  }

  private view(row: ReferenceConstant): ReferenceConstantView {
    return Object.assign(row, {
      ownerProfile: referenceOwner(row.key),
      group: referenceGroup(row.key),
    });
  }
}
