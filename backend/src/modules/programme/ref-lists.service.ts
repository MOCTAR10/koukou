import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/utils/idempotency.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { RefItem } from './entities/ref-item.entity.js';
import { userNames } from '../../common/utils/user-names.js';
import { familyError } from './ref-list-families.js';
import {
  listHistoryEntry,
  type ListHistoryEntry,
  type RowChangeRecord,
} from './ref-list-history.js';
import { ProgrammeService } from './programme.service.js';
import type { CreateRefItemDto, UpdateRefItemDto } from './dto/ref-item.dto.js';

/**
 * Configurable lists of the current programme. Items are deactivated, never
 * deleted, and their code and family never change.
 */
@Injectable()
export class RefListsService {
  constructor(
    private readonly programme: ProgrammeService,
    @InjectRepository(RefItem) private readonly items: Repository<RefItem>,
  ) {}

  /** Items of a list, by `sort` then label; active ones only unless `includeInactive`. */
  async list(
    listType: ProgramListType,
    includeInactive = false,
  ): Promise<RefItem[]> {
    const program = await this.programme.current();
    return this.items.find({
      where: {
        programId: program.id,
        listType,
        ...(includeInactive ? {} : { active: true }),
      },
      order: { sort: 'ASC', label: 'ASC' },
    });
  }

  /**
   * The list's history from the row journal, newest first (500 at most):
   * creations and changes of its items with their author's name.
   */
  async history(listType: ProgramListType): Promise<ListHistoryEntry[]> {
    const program = await this.programme.current();
    const rows: RowChangeRecord[] = await this.items.manager.query(
      `SELECT r.id, r.at, r.op, r.before, r.after,
              r.actor_user_id AS "actorUserId", r.request_id AS "requestId"
         FROM audit_row_changes r
        WHERE r.table_name = 'ref_items'
          AND COALESCE(r.after ->> 'program_id', r.before ->> 'program_id') = $1
          AND COALESCE(r.after ->> 'list_type', r.before ->> 'list_type') = $2
        ORDER BY r.id DESC
        LIMIT 500`,
      [program.id, listType],
    );
    const names = await userNames(
      this.items.manager,
      rows.map((r) => r.actorUserId),
    );
    return rows.map((r) => listHistoryEntry(r, names));
  }

  /** One item by code (active or not). @throws NotFoundException */
  async getByCode(listType: ProgramListType, code: string): Promise<RefItem> {
    const program = await this.programme.current();
    const item = await this.items.findOne({
      where: { programId: program.id, listType, code },
    });
    if (!item) {
      throw new NotFoundException(
        `Élément « ${code} » introuvable dans la liste ${listType}.`,
      );
    }
    return item;
  }

  async create(
    listType: ProgramListType,
    dto: CreateRefItemDto,
  ): Promise<RefItem> {
    const program = await this.programme.current();
    const family = dto.family ?? null;
    const error = familyError(listType, family);
    if (error) throw new BadRequestException(error);
    if (dto.parentId) await this.assertParent(program.id, dto.parentId);
    const exists = await this.items.exists({
      where: { programId: program.id, listType, code: dto.code },
    });
    if (exists) throw this.duplicate(listType, dto.code);
    const sort = dto.sort ?? (await this.nextSort(program.id, listType));
    try {
      return await this.items.save(
        this.items.create({
          programId: program.id,
          listType,
          code: dto.code,
          label: dto.label.trim(),
          family,
          parentId: dto.parentId ?? null,
          meta: dto.meta ?? {},
          sort,
          active: dto.active ?? true,
        }),
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw this.duplicate(listType, dto.code);
      }
      throw e;
    }
  }

  /** Relabel, reorder, (de)activate, re-parent or change `meta`. */
  async update(
    listType: ProgramListType,
    code: string,
    dto: UpdateRefItemDto,
  ): Promise<RefItem> {
    const item = await this.getByCode(listType, code);
    if (dto.label !== undefined) item.label = dto.label.trim();
    if (dto.sort !== undefined) item.sort = dto.sort;
    if (dto.active !== undefined) item.active = dto.active;
    if (dto.meta !== undefined) item.meta = dto.meta;
    if (dto.parentId !== undefined) {
      if (dto.parentId === item.id) {
        throw new BadRequestException(
          'Un élément ne peut pas être son propre parent.',
        );
      }
      if (dto.parentId) await this.assertParent(item.programId, dto.parentId);
      item.parentId = dto.parentId;
    }
    return this.items.save(item);
  }

  private async assertParent(
    programId: string,
    parentId: string,
  ): Promise<void> {
    const ok = await this.items.exists({ where: { id: parentId, programId } });
    if (!ok) throw new BadRequestException('Élément parent introuvable.');
  }

  private async nextSort(
    programId: string,
    listType: ProgramListType,
  ): Promise<number> {
    const row: { max: number | null } | undefined = await this.items
      .createQueryBuilder('i')
      .select('MAX(i.sort)', 'max')
      .where('i.program_id = :programId AND i.list_type = :listType', {
        programId,
        listType,
      })
      .getRawOne();
    return (row?.max ?? 0) + 10;
  }

  private duplicate(
    listType: ProgramListType,
    code: string,
  ): ConflictException {
    return new ConflictException(
      `Le code « ${code} » existe déjà dans la liste ${listType}.`,
    );
  }
}
