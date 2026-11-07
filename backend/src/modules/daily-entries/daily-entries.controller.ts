import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { BatchesService } from '../batches/batches.service.js';
import { FeedStockService } from '../feed-stock/feed-stock.service.js';
import { DailyEntriesService } from './daily-entries.service.js';
import { CreateDailyEntryDto } from './dto/create-daily-entry.dto.js';
import { Domain } from '../../common/decorators/domain.decorator.js';

@ApiTags('Saisie journalière (Ouvrier)')
@Domain('TECHNIQUE')
@Controller('farms/:farmId/batches/:batchId/daily-entries')
export class DailyEntriesController {
  constructor(
    private readonly entriesService: DailyEntriesService,
    private readonly batchesService: BatchesService,
    private readonly feedStockService: FeedStockService,
  ) {}

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('saisie:creer')
  @ApiOperation({
    summary:
      'Saisie journalière (< 1 min) — morts, aliments (sacs/kg), eau, poids, œufs',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  async create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Body() dto: CreateDailyEntryDto,
  ) {
    const entry = await this.entriesService.create(user, farmId, batchId, dto);
    await this.batchesService.runAdvisoryForBatch(batchId);
    await this.feedStockService.evaluateStockAlerts(farmId);
    // Alerte stock négatif : la saisie est conservée (terrain hors ligne) mais
    // le client doit afficher l'avertissement.
    let stockWarning: string | null = null;
    if (
      entry.feedQuantity > 0 &&
      !entry.skipStockDeduction &&
      entry.inputLotId == null
    ) {
      const deficit = await this.feedStockService.uncoveredKg(farmId);
      if (deficit > 0)
        stockWarning = `Stock d’aliment négatif : ${deficit} kg consommés sans stock enregistré. Enregistrez une entrée de provende pour régulariser.`;
    }
    return Object.assign(entry, { stockWarning });
  }

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Lister les saisies journalières du lot' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.entriesService.listForBatch(user, farmId, batchId);
  }
}
