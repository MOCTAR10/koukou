import { BadRequestException, Injectable } from '@nestjs/common';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import type {
  CreateRefItemDto,
  UpdateRefItemDto,
} from '../programme/dto/ref-item.dto.js';
import type { RefItem } from '../programme/entities/ref-item.entity.js';
import { RefListsService } from '../programme/ref-lists.service.js';
import { criterionMetaError } from '../visits/visit-rules.js';

/**
 * Programme lists the veterinary services maintain (CDC: « signes
 * paramétrables par les services vétérinaires », « liste des produits
 * paramétrable », « statuts paramétrables »). Same rules as every list
 * (codes and families never change, items are deactivated, never deleted).
 */
export const SANITARY_LIST_TYPES: readonly ProgramListType[] = [
  ProgramListType.SIGNE_CLINIQUE,
  ProgramListType.PRODUIT_TRAITEMENT,
  ProgramListType.STATUT_ALERTE,
  // Biosecurity grid (CDC n° 27): the veterinary services own the criteria.
  ProgramListType.CRITERE_BIOSECURITE,
];

@Injectable()
export class SanitaryListsService {
  constructor(private readonly lists: RefListsService) {}

  create(listType: ProgramListType, dto: CreateRefItemDto): Promise<RefItem> {
    this.assertSanitary(listType);
    this.assertCriterionMeta(listType, dto.meta);
    return this.lists.create(listType, dto);
  }

  async update(
    listType: ProgramListType,
    code: string,
    dto: UpdateRefItemDto,
  ): Promise<RefItem> {
    this.assertSanitary(listType);
    this.assertCriterionMeta(listType, dto.meta);
    if (listType === ProgramListType.STATUT_ALERTE && dto.active === false) {
      // The circuit needs at least one active status per family.
      const item = await this.lists.getByCode(listType, code);
      const sameFamily = (await this.lists.list(listType)).filter(
        (i) => i.family === item.family && i.code !== code,
      );
      if (item.active && sameFamily.length === 0) {
        throw new BadRequestException(
          `Dernier statut actif de la famille ${item.family ?? ''} : le circuit des alertes en a besoin.`,
        );
      }
    }
    return this.lists.update(listType, code, dto);
  }

  /** A biosecurity criterion's weight is an integer 1-10 (`meta.weight`). */
  private assertCriterionMeta(
    listType: ProgramListType,
    meta: Record<string, unknown> | undefined,
  ): void {
    if (listType !== ProgramListType.CRITERE_BIOSECURITE) return;
    const error = criterionMetaError(meta);
    if (error) throw new BadRequestException(error);
  }

  private assertSanitary(listType: ProgramListType): void {
    if (!SANITARY_LIST_TYPES.includes(listType)) {
      throw new BadRequestException(
        `Liste non sanitaire : ${listType} se modifie dans l’administration du programme (listes sanitaires : ${SANITARY_LIST_TYPES.join(', ')}).`,
      );
    }
  }
}
