import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { day1WeightKg } from '../../common/utils/species-day1-weight.js';
import { BandesService } from '../bandes/bandes.service.js';
import type { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { ageWeek, round } from './pilotage-rules.js';
import { PilotageScopeService } from './pilotage-scope.service.js';

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
  weeks: ComparisonWeek[];
  method: readonly string[];
}

const METHOD: readonly string[] = [
  "Moyenne du programme : bandes des autres fermes du programme, même espèce et même type, à la même semaine d'âge ; chaque bande compte pour une.",
  "Anonyme : aucune ferme n'est citée, et la moyenne n'est montrée que si au moins le nombre minimal de fermes (paramètre PILOTAGE_GROUPE_MIN_FERMES) a atteint cette semaine.",
  "Mortalité = morts cumulés / mis en place × 100 à la fin de la semaine d'âge.",
  'IC = aliment cumulé / (poids vif présent et sorti − poids des poussins), au dernier jour pesé de la semaine ; GMQ = gain de poids depuis le poids d’ouverture / jours, au même jour. Même calcul pour la bande et pour la moyenne.',
  'Les indicateurs officiels de la bande restent ceux de « Indicateurs » (formules en vigueur).',
];

type Row = Record<string, unknown>;

const num = (v: unknown): number | null => (v == null ? null : Number(v));

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

  /** Comparison of a band already authorized (reports call it too). */
  async compareBand(
    programId: string,
    batch: ProductionBatch,
  ): Promise<BandComparison> {
    const k = await this.scope.minGroupSize(programId);
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
       ),
       v AS (
         SELECT w.week, w.batch_id, w.farm_id, w.own,
                w.deaths_cumulative::float / NULLIF(w.quantity_at_start, 0) * 100 AS mortality,
                CASE WHEN lw.age_days IS NOT NULL AND lw.age_days > w.a0
                     THEN (lw.last_weight_g - w.w0) / (lw.age_days - w.a0) END AS gmq,
                CASE WHEN lw.age_days IS NOT NULL
                      AND ((lw.present + lw.removals_cumulative) * lw.last_weight_g
                           - w.quantity_at_start * w.w0) > 0
                     THEN lw.feed_cumulative_kg * 1000.0
                          / ((lw.present + lw.removals_cumulative) * lw.last_weight_g
                             - w.quantity_at_start * w.w0) END AS fcr
           FROM w
           LEFT JOIN LATERAL (
             SELECT s2.age_days, s2.last_weight_g, s2.present,
                    s2.removals_cumulative, s2.feed_cumulative_kg
               FROM bande_daily_stats s2
              WHERE s2.batch_id = w.batch_id AND s2.weighed
                AND s2.age_days <= w.age_days AND s2.age_days / 7 = w.week
              ORDER BY s2.day DESC LIMIT 1
           ) lw ON TRUE
       )
       SELECT week, own,
              COUNT(*) AS bands, COUNT(DISTINCT farm_id) AS farms,
              AVG(mortality) AS mortality,
              AVG(fcr) AS fcr, COUNT(DISTINCT farm_id) FILTER (WHERE fcr IS NOT NULL) AS fcr_farms,
              AVG(gmq) AS gmq, COUNT(DISTINCT farm_id) FILTER (WHERE gmq IS NOT NULL) AS gmq_farms
         FROM v GROUP BY week, own ORDER BY week`,
      [batch.id, programId, currentWeek, day1WeightKg(batch.species) * 1000],
    );

    const weeks: ComparisonWeek[] = [];
    for (let week = 0; week <= currentWeek; week++) {
      const own = rows.find((r) => Number(r.week) === week && r.own === true);
      const others = rows.find(
        (r) => Number(r.week) === week && r.own !== true,
      );
      const farms = others ? Number(others.farms) : 0;
      const visible = farms >= k;
      const gated = (value: unknown, metricFarms: unknown, digits: number) =>
        Number(metricFarms ?? 0) >= k && value != null
          ? round(Number(value), digits)
          : null;
      weeks.push({
        week,
        ageFrom: week * 7,
        ageTo: week * 7 + 6,
        band: own
          ? {
              mortalityPct:
                own.mortality == null ? null : round(Number(own.mortality), 2),
              fcr: num(own.fcr) == null ? null : round(Number(own.fcr), 2),
              gmqG: num(own.gmq) == null ? null : round(Number(own.gmq), 1),
            }
          : null,
        programme:
          visible && others
            ? {
                bands: Number(others.bands),
                farms,
                mortalityPct: gated(others.mortality, farms, 2),
                fcr: gated(others.fcr, others.fcr_farms, 2),
                gmqG: gated(others.gmq, others.gmq_farms, 1),
              }
            : null,
        suppressed: !visible,
      });
    }
    return { ...base, weeks };
  }
}
