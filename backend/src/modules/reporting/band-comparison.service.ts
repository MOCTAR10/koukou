import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { day1WeightKg } from '../../common/utils/species-day1-weight.js';
import { BandesService } from '../bandes/bandes.service.js';
import type { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import type { FormulaInForce } from '../indicators/official-indicators.js';
import { ParametersService } from '../programme/parameters.service.js';
import {
  formulaIndicator,
  isEligibleBand,
  pilotageRulesAt,
} from './pilotage-programme.js';
import { ageWeek, round } from './pilotage-rules.js';
import { PilotageScopeService } from './pilotage-scope.service.js';
import { todayLocal } from '../../common/utils/date.utils.js';

export interface ComparisonValues {
  /** Cumulative deaths / birds placed × 100, at the end of the age week. */
  mortalityPct: number | null;
  /** Feed / live weight produced (sorties + present − chicks), at the last weighing. */
  fcr: number | null;
  /** Average daily gain (g/j) from the opening weight to the last weighing. */
  gmqG: number | null;
}

export interface ComparisonWeek {
  week: number;
  ageFrom: number;
  ageTo: number;
  band: ComparisonValues | null;
  /** Programme average (other farms), or null when hidden. */
  programme: (ComparisonValues & { bands: number; farms: number }) | null;
  /** Fewer than `minGroupSize` other farms reached that week. */
  suppressed: boolean;
}

export interface BandComparison {
  batchId: string;
  code: string | null;
  species: string;
  type: string;
  ageDays: number | null;
  currentWeek: number | null;
  minGroupSize: number;
  /** The band's type counts in the programme (`BANDE_TYPES_ELIGIBLES`). */
  programmeEligible: boolean;
  weeks: ComparisonWeek[];
  method: readonly string[];
}

/** The programme's band types, for the farm screens' « hors programme » badge. */
export interface ProgrammePerimeter {
  eligibleBandTypes: { species: string; type: string }[];
  note: string;
}

export const OUT_OF_PROGRAMME_NOTE =
  'Les bandes d’un autre type restent suivies sur la ferme, mais sont « hors programme » : elles n’entrent ni dans le pilotage, ni dans l’objectif national, ni dans les rapports.';

const METHOD: readonly string[] = [
  "Moyenne du programme : bandes des autres fermes du programme, même espèce et même type, à la même semaine d'âge ; chaque bande compte pour une.",
  "Anonyme : aucune ferme n'est citée, et la moyenne n'est montrée que si au moins le nombre minimal de fermes (paramètre PILOTAGE_GROUPE_MIN_FERMES) a atteint cette semaine.",
  "Mortalité, IC et GMQ = formules officielles en vigueur (FORMULE_TAUX_MORTALITE, FORMULE_IC, FORMULE_GMQ_G_J), même calcul pour la bande et pour chaque bande de la moyenne.",
  "Mortalité : morts cumulés et mis en place à la fin de la semaine d'âge. IC et GMQ : au dernier jour pesé de la semaine, poids vif présent et sorti estimé au dernier poids moyen pesé, gain compté depuis le poids d’ouverture.",
  'Les indicateurs officiels complets de la bande restent ceux de « Indicateurs ».',
];

type Row = Record<string, unknown>;


/**
 * Mortality, FCR and GMQ of one band at the end of an age week, through the
 * formulas in force (`taux_mortalite`, `ic`, `gmq_g_j`). The base variables
 * come from `bande_daily_stats`; weights are only known on a weighing day of
 * the week (null otherwise). Exported for the unit tests.
 */
export function comparisonValues(
  formulas: readonly FormulaInForce[],
  r: Row,
): ComparisonValues {
  const placed = Number(r.quantity_at_start ?? 0);
  const w0 = Number(r.w0 ?? 0);
  const a0 = Number(r.a0 ?? 0);
  const weighed = r.lw_age != null && r.last_weight_g != null;
  const lastG = weighed ? Number(r.last_weight_g) : null;
  const days = weighed ? Number(r.lw_age) - a0 : null;
  const vars: Record<string, number | null> = {
    mis_en_place: placed,
    morts_cumules: Number(r.deaths_cumulative ?? 0),
    poids_moyen_g: lastG,
    poids_initial_g: w0,
    jours_elevage: days != null && days > 0 ? days : null,
    aliment_kg: weighed ? Number(r.feed_cumulative_kg ?? 0) : null,
    poids_presents_kg:
      lastG == null ? null : (Number(r.present ?? 0) * lastG) / 1000,
    poids_sortis_kg:
      lastG == null
        ? null
        : (Number(r.removals_cumulative ?? 0) * lastG) / 1000,
    poids_poussins_kg: (placed * w0) / 1000,
  };
  const fcr = formulaIndicator(formulas, 'ic', vars, 6);
  return {
    mortalityPct: formulaIndicator(formulas, 'taux_mortalite', vars, 6),
    // An FCR is positive: no growth yet gives no figure.
    fcr: fcr != null && fcr > 0 ? fcr : null,
    gmqG: formulaIndicator(formulas, 'gmq_g_j', vars, 6),
  };
}

/**
 * The farmer's comparison (CDC « Tableau de bord de l'éleveur », Proposé :
 * comparaison à la moyenne): for each age week of his band, the band's
 * mortality, FCR and GMQ next to the anonymous average of the other farms'
 * bands at the same age week. Read from `bande_daily_stats` in one query.
 */
@Injectable()
export class BandComparisonService {
  constructor(
    private readonly bandes: BandesService,
    private readonly scope: PilotageScopeService,
    private readonly parameters: ParametersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async compare(
    user: AuthUser,
    farmId: string,
    batchId: string,
  ): Promise<BandComparison> {
    const { farm, batch } = await this.bandes.load(user, farmId, batchId);
    return this.compareBand(farm.programId, batch);
  }

  /** POUFA lot A (F2): band types counted in the programme, seen from a farm. */
  async perimeter(user: AuthUser, farmId: string): Promise<ProgrammePerimeter> {
    const farm = await this.bandes.programmeFarm(user, farmId);
    const resolver = await this.parameters.resolver(farm.programId);
    const rules = pilotageRulesAt(resolver, todayLocal());
    return {
      eligibleBandTypes: rules.eligibleBandKeys.map((k) => {
        const [species, type] = k.split(':');
        return { species, type };
      }),
      note: OUT_OF_PROGRAMME_NOTE,
    };
  }

  /** Comparison of a band already authorized (reports call it too). */
  async compareBand(
    programId: string,
    batch: ProductionBatch,
  ): Promise<BandComparison> {
    const k = await this.scope.minGroupSize(programId);
    const resolver = await this.parameters.resolver(programId);
    const today = todayLocal();
    const rules = pilotageRulesAt(resolver, today);
    const last: { age_days: number }[] = await this.dataSource.query(
      `SELECT age_days FROM bande_daily_stats WHERE batch_id = $1 ORDER BY day DESC LIMIT 1`,
      [batch.id],
    );
    const ageDays = last[0] ? Number(last[0].age_days) : null;
    const currentWeek = ageDays == null ? null : ageWeek(ageDays);
    const base = {
      batchId: batch.id,
      code: batch.code,
      species: batch.species,
      type: batch.type,
      ageDays,
      currentWeek,
      minGroupSize: k,
      programmeEligible: isEligibleBand(batch, rules.eligibleBandKeys),
      method: METHOD,
    };
    if (currentWeek == null) return { ...base, weeks: [] };

    const rows: Row[] = await this.dataSource.query(
      `WITH target AS (
         SELECT b.id, b.farm_id, b.species, b.type FROM production_batches b WHERE b.id = $1
       ),
       w AS (
         SELECT DISTINCT ON (s.batch_id, s.age_days / 7)
                s.batch_id, s.farm_id, s.age_days / 7 AS week, s.age_days,
                s.deaths_cumulative, b.quantity_at_start,
                COALESCE(b.initial_avg_weight_g, $4::float) AS w0,
                CASE WHEN b.initial_avg_weight_g IS NOT NULL
                     THEN COALESCE(b.initial_age_days, 0) ELSE 0 END AS a0,
                (s.batch_id = t.id) AS own
           FROM bande_daily_stats s
           JOIN production_batches b ON b.id = s.batch_id
           JOIN target t ON b.species = t.species AND b.type = t.type
          WHERE s.program_id = $2
            AND (s.farm_id <> t.farm_id OR s.batch_id = t.id)
            AND s.age_days >= 0 AND s.age_days / 7 <= $3
          ORDER BY s.batch_id, s.age_days / 7, s.day DESC
       )
       SELECT w.week, w.batch_id, w.farm_id, w.own, w.deaths_cumulative,
              w.quantity_at_start, w.w0, w.a0,
              lw.age_days AS lw_age, lw.last_weight_g, lw.present,
              lw.removals_cumulative, lw.feed_cumulative_kg
         FROM w
         LEFT JOIN LATERAL (
           SELECT s2.age_days, s2.last_weight_g, s2.present,
                  s2.removals_cumulative, s2.feed_cumulative_kg
             FROM bande_daily_stats s2
            WHERE s2.batch_id = w.batch_id AND s2.weighed
              AND s2.age_days <= w.age_days AND s2.age_days / 7 = w.week
            ORDER BY s2.day DESC LIMIT 1
         ) lw ON TRUE
        ORDER BY w.week`,
      [batch.id, programId, currentWeek, day1WeightKg(batch.species) * 1000],
    );

    // POUFA lot A (n° 44): the indicators go through the FORMULE_* in force,
    // for the band and for each band of the average alike.
    const formulas = rules.formulas;
    const values = rows.map((r) => ({
      week: Number(r.week),
      own: r.own === true,
      farmId: String(r.farm_id),
      ...comparisonValues(formulas, r),
    }));

    const weeks: ComparisonWeek[] = [];
    for (let week = 0; week <= currentWeek; week++) {
      const own = values.find((v) => v.week === week && v.own);
      const others = values.filter((v) => v.week === week && !v.own);
      const farms = new Set(others.map((v) => v.farmId)).size;
      const visible = farms >= k;
      const mean = (
        pick: (v: ComparisonValues) => number | null,
        digits: number,
      ): number | null => {
        const known = others.filter((v) => pick(v) != null);
        if (new Set(known.map((v) => v.farmId)).size < k) return null;
        const sum = known.reduce((t, v) => t + pick(v)!, 0);
        return round(sum / known.length, digits);
      };
      weeks.push({
        week,
        ageFrom: week * 7,
        ageTo: week * 7 + 6,
        band: own
          ? {
              mortalityPct:
                own.mortalityPct == null ? null : round(own.mortalityPct, 2),
              fcr: own.fcr == null ? null : round(own.fcr, 2),
              gmqG: own.gmqG == null ? null : round(own.gmqG, 1),
            }
          : null,
        programme:
          visible && others.length > 0
            ? {
                bands: others.length,
                farms,
                mortalityPct: mean((v) => v.mortalityPct, 2),
                fcr: mean((v) => v.fcr, 2),
                gmqG: mean((v) => v.gmqG, 1),
              }
            : null,
        suppressed: !visible,
      });
    }
    return { ...base, weeks };
  }
}
