import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { BandComparisonService } from './band-comparison.service.js';

/**
 * The farmer's band next to the programme average (CDC « Tableau de bord de
 * l'éleveur », Proposé : comparaison à la moyenne). Same access as the band
 * sheet (domain TECHNIQUE for institutional accounts, within their scope);
 * the average is anonymous and hidden below the minimal group size.
 */
@ApiTags('Bandes POUFA')
@Domain('TECHNIQUE')
@Controller('farms/:farmId/bandes/:batchId/comparison')
export class BandComparisonController {
  constructor(private readonly comparisons: BandComparisonService) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Comparaison de la bande avec la moyenne anonyme du programme (mortalité, IC, GMQ à la même semaine d’âge)',
  })
  compare(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.comparisons.compare(user, farmId, batchId);
  }
}

/**
 * POUFA lot A (F2): the band types the programme counts, read from the farm
 * (same access as the band sheet) so its screens can mark the other bands
 * « hors programme ». `BANDE_TYPES_ELIGIBLES` itself stays a DGE parameter.
 */
@ApiTags('Bandes POUFA')
@Domain('TECHNIQUE')
@Controller('farms/:farmId/programme-perimeter')
export class ProgrammePerimeterController {
  constructor(private readonly comparisons: BandComparisonService) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Types de bandes comptés dans le programme (les autres sont « hors programme »)',
  })
  perimeter(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.comparisons.perimeter(user, farmId);
  }
}
