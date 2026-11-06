import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { addDays, utcDay } from '../batches/poufa/bande-rules.js';
import { ParametersService } from '../programme/parameters.service.js';
import { ProgrammeService } from '../programme/programme.service.js';
import { DAY_EXIT_KG, weighedSortiesCte } from './pilotage-data.service.js';
import {
  bandMortalityPct,
  eligibleBandSql,
  periodProduced,
  pilotageRulesAt,
} from './pilotage-programme.js';
import {
  pct,
  projectProduction,
  round,
  type ProjectedYear,
} from './pilotage-rules.js';
import {
  PilotageScopeService,
  SqlParams,
  type PilotageView,
  type RawFilters,
} from './pilotage-scope.service.js';

/** First year of the projection: the import ban starts on 1 January 2027 (CDC §1). */
export const PROJECTION_FIRST_YEAR = 2027;
/** Last year when the programme has no end date: follow-up until 2030 (CDC §1). */
export const PROJECTION_DEFAULT_LAST_YEAR = 2030;

export interface ProjectionInputView {
  key: string;
  label: string;
  value: number;
  unit: string;
  /** OBSERVE: measured on the programme's own bands; PARAMETRE: catalog value. */
  source: 'OBSERVE' | 'PARAMETRE';
  detail: string;
}

export interface PilotageObjective {
  generatedAt: string;
  scope: {
    kind: PilotageView['kind'];
    aggregateOnly: boolean;
    provinces: string[] | null;
  };
  objective: { tonnes: number; unit: string; parameterKey: string };
  /** Hidden for an aggregate-only view below the minimal group size. */
  suppressed: boolean;
  actual: {
    since: string;
    heads: number;
    tonnes: number;
    yearToDateTonnes: number;
    last12MonthsTonnes: number;
    /** Last 12 months as a share of the objective (one year of production). */
    last12MonthsSharePct: number | null;
  } | null;
  capacity: {
    farms: number;
    farmsWithoutCapacity: number;
    places: number;
  } | null;
  projection: {
    method: readonly string[];
    inputs: ProjectionInputView[];
    annualPotentialTonnes: number;
    years: ProjectedYear[];
  } | null;
  caveat: string;
}

export const OBJECTIVE_CAVEAT =
  "Les fermes du POUFA ne sont qu'une partie de la production nationale : l'objectif de 100 000 t concerne l'ensemble des producteurs du pays. Ces chiffres montrent la contribution du programme et sa projection, pas l'atteinte de l'objectif par les seules fermes du programme.";

const PROJECTION_METHOD: readonly string[] = [
  'Contribution réalisée = volumes produits (formules FORMULE_VOLUME_PRODUIT_TETES et FORMULE_VOLUME_PRODUIT_KG en vigueur ; par défaut le poids vif des animaux sortis vivants des bandes du programme, mesuré à la sortie, à défaut têtes sorties × dernier poids moyen pesé), depuis le début du programme.',
  'Potentiel annuel (t) = places des fermes non suspendues × taux d’occupation × bandes par an × (1 − mortalité) × poids vif de sortie / 1000.',
  'Places : capacité du registre, à défaut le plus grand effectif mis en place par la ferme.',
  'Mortalité et poids de sortie : valeurs observées sur les 12 derniers mois quand assez de fermes en donnent (nombre minimal de fermes), sinon les paramètres du programme.',
  'Année en cours : réalisé depuis le 1er janvier + potentiel pour le reste de l’année ; années suivantes : potentiel × (1 + croissance annuelle) par an.',
  'Valeurs en poids vif ; l’objectif national est lu dans le paramètre OBJECTIF_NATIONAL_T.',
];

const n = (v: unknown): number => (v == null ? 0 : Number(v));

/**
 * Contribution of the programme to the 100 000 t objective (CDC « Volumes
 * produits ») and its projection to 2027-2030, within the viewer's scope.
 */
@Injectable()
export class PilotageObjectiveService {
  constructor(
    private readonly scope: PilotageScopeService,
    private readonly parameters: ParametersService,
    private readonly programme: ProgrammeService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async objective(
    view: PilotageView,
    raw: RawFilters,
    today: string = utcDay(),
  ): Promise<PilotageObjective> {
    const filters = await this.scope.filters(view, raw);
    const program = await this.programme.current();
    const resolver = await this.parameters.resolver(view.programId);
    const now = new Date();
    const value = (key: string) => Number(resolver.value(key, now));
    const k = value('PILOTAGE_GROUPE_MIN_FERMES');
    const objectiveTonnes = value('OBJECTIF_NATIONAL_T');
    const farms = this.scope.scopedFarms(view, filters);
    // POUFA lot A (F2): only the programme's bands count towards the objective.
    const rules = pilotageRulesAt(resolver, today);

    const p = new SqlParams(farms.params);
    const yearStart = p.add(`${today.slice(0, 4)}-01-01`);
    const since12 = p.add(addDays(today, -364));
    const origin = p.add('1900-01-01');
    const todayP = p.add(today);
    const eligibleP = p.add(rules.eligibleBandKeys);
    const [volumes]: Record<string, unknown>[] = await this.dataSource.query(
      `WITH sf AS (${farms.sql}),
       ${weighedSortiesCte(origin, todayP)},
       st AS (
         SELECT s.farm_id, s.day, s.removals, ${DAY_EXIT_KG} AS exit_kg
           FROM bande_daily_stats s JOIN sf ON sf.id = s.farm_id
           JOIN production_batches eb ON eb.id = s.batch_id
                AND ${eligibleBandSql('eb', eligibleP)}
           LEFT JOIN ws ON ws.batch_id = s.batch_id AND ws.day = s.day
       )
       SELECT COALESCE(SUM(removals), 0) AS heads,
              COALESCE(SUM(exit_kg), 0) / 1000.0 AS tonnes,
              COALESCE(SUM(exit_kg) FILTER (WHERE day >= ${yearStart}::date), 0) / 1000.0 AS ytd,
              COALESCE(SUM(removals) FILTER (WHERE day >= ${yearStart}::date), 0) AS heads_ytd,
              COALESCE(SUM(exit_kg) FILTER (WHERE day >= ${since12}::date), 0) / 1000.0 AS last12,
              COALESCE(SUM(removals) FILTER (WHERE day >= ${since12}::date), 0) AS heads12,
              COUNT(DISTINCT farm_id) FILTER (WHERE removals > 0 AND day >= ${since12}::date) AS farms12,
              COUNT(DISTINCT farm_id) AS farms_reporting
         FROM st`,
      p.values,
    );

    const q = new SqlParams(farms.params);
    const since = q.add(`${addDays(today, -364)}T00:00:00.000Z`);
    const eligibleQ = q.add(rules.eligibleBandKeys);
    const [closed]: Record<string, unknown>[] = await this.dataSource.query(
      `WITH sf AS (${farms.sql})
       SELECT COUNT(*) AS bands, COUNT(DISTINCT b.farm_id) AS farms,
              COALESCE(SUM(b.quantity_at_start), 0) AS placed,
              COALESCE(SUM(l.deaths_cumulative), 0) AS deaths
         FROM production_batches b
         JOIN sf ON sf.id = b.farm_id
         JOIN LATERAL (
           SELECT s.deaths_cumulative FROM bande_daily_stats s
            WHERE s.batch_id = b.id ORDER BY s.day DESC LIMIT 1
         ) l ON TRUE
        WHERE b.status = 'CLOTURE' AND b.closed_at >= ${since}::timestamptz
          AND ${eligibleBandSql('b', eligibleQ)}`,
      q.values,
    );

    const c = new SqlParams(farms.params);
    const eligibleC = c.add(rules.eligibleBandKeys);
    const [capacity]: Record<string, unknown>[] = await this.dataSource.query(
      `WITH sf AS (${farms.sql})
       SELECT COUNT(*) AS farms,
              COUNT(*) FILTER (WHERE sf.capacity_places IS NULL AND mb.max_start IS NULL) AS without_capacity,
              COALESCE(SUM(COALESCE(sf.capacity_places, mb.max_start, 0)), 0) AS places
         FROM sf
         LEFT JOIN (
           SELECT b.farm_id, MAX(b.quantity_at_start) AS max_start
             FROM production_batches b
            WHERE ${eligibleBandSql('b', eligibleC)}
            GROUP BY b.farm_id
         ) mb ON mb.farm_id = sf.id
        WHERE sf.active = true`,
      c.values,
    );

    // POUFA lot A2 dge: the volumes produced go through the formulas in force
    // (FORMULE_VOLUME_PRODUIT_TETES / _KG, CDC §7.3); an undefined one is 0.
    const volumeOf = (heads: unknown, tonnesSum: unknown) => {
      const v = periodProduced(rules.formulas, n(heads), n(tonnesSum) * 1000);
      return { heads: v.heads ?? 0, tonnes: (v.kg ?? 0) / 1000 };
    };
    const produced = volumeOf(volumes.heads, volumes.tonnes);
    const producedYtd = volumeOf(volumes.heads_ytd, volumes.ytd);
    const produced12 = volumeOf(volumes.heads12, volumes.last12);

    // Aggregate-only view: hidden when the volumes or the capacity come from
    // fewer than k farms (a zero is not a figure about anyone).
    const farmsReporting = n(volumes.farms_reporting);
    const capacityFarms = n(capacity.farms);
    const small = (count: number) => count > 0 && count < k;
    const suppressed =
      view.aggregateOnly && (small(farmsReporting) || small(capacityFarms));

    const inputs: ProjectionInputView[] = [];
    const param = (
      key: string,
      label: string,
      unit: string,
      detail = 'Paramètre du programme',
    ) => {
      const v = value(key);
      inputs.push({ key, label, value: v, unit, source: 'PARAMETRE', detail });
      return v;
    };
    const occupationPct = param(
      'PROJECTION_TAUX_OCCUPATION_PCT',
      'Taux d’occupation',
      '%',
    );
    const bandsPerYear = param(
      'PROJECTION_BANDES_PAR_AN',
      'Bandes par an',
      'bandes',
    );
    const growthPct = param(
      'PROJECTION_CROISSANCE_ANNUELLE_PCT',
      'Croissance annuelle',
      '%',
    );

    let mortalityPct: number;
    const closedFarms = n(closed.farms);
    // The band mortality formula in force, on the closed bands summed.
    const observedMortality =
      n(closed.placed) > 0
        ? bandMortalityPct(
            rules.formulas,
            n(closed.deaths),
            n(closed.placed),
            2,
          )
        : null;
    if (closedFarms >= k && observedMortality != null) {
      mortalityPct = observedMortality;
      inputs.push({
        key: 'PROJECTION_MORTALITE_PCT',
        label: 'Mortalité par bande',
        value: mortalityPct,
        unit: '%',
        source: 'OBSERVE',
        detail: `${n(closed.bands)} bandes clôturées de ${closedFarms} fermes sur 12 mois`,
      });
    } else {
      mortalityPct = param(
        'PROJECTION_MORTALITE_PCT',
        'Mortalité par bande',
        '%',
        `Paramètre du programme (moins de ${k} fermes avec une bande clôturée sur 12 mois)`,
      );
    }

    let exitWeightKg: number;
    const heads12 = produced12.heads;
    if (n(volumes.farms12) >= k && heads12 > 0) {
      exitWeightKg = round((produced12.tonnes * 1000) / heads12, 3);
      inputs.push({
        key: 'PROJECTION_POIDS_SORTIE_KG',
        label: 'Poids vif de sortie',
        value: exitWeightKg,
        unit: 'kg',
        source: 'OBSERVE',
        detail: `${heads12} animaux sortis de ${n(volumes.farms12)} fermes sur 12 mois`,
      });
    } else {
      exitWeightKg = param(
        'PROJECTION_POIDS_SORTIE_KG',
        'Poids vif de sortie',
        'kg',
        `Paramètre du programme (moins de ${k} fermes avec des sorties sur 12 mois)`,
      );
    }

    const places = n(capacity.places);
    const lastYear = program.endDate
      ? Math.max(PROJECTION_FIRST_YEAR, Number(program.endDate.slice(0, 4)))
      : PROJECTION_DEFAULT_LAST_YEAR;
    const tonnes = produced.tonnes;
    const projection = projectProduction({
      places,
      occupationPct,
      bandsPerYear,
      mortalityPct,
      exitWeightKg,
      growthPct,
      cumulativeTonnes: tonnes,
      yearToDateTonnes: producedYtd.tonnes,
      today,
      firstYear: PROJECTION_FIRST_YEAR,
      lastYear,
      objectiveTonnes,
    });
    const provinces = filters.provinceIds
      ? (
          await this.dataSource.query(
            `SELECT code FROM provinces WHERE id = ANY($1::uuid[]) ORDER BY sort, code`,
            [filters.provinceIds],
          )
        ).map((r: { code: string }) => r.code)
      : null;

    return {
      generatedAt: new Date().toISOString(),
      scope: { kind: view.kind, aggregateOnly: view.aggregateOnly, provinces },
      objective: {
        tonnes: objectiveTonnes,
        unit: 't (poids vif)',
        parameterKey: 'OBJECTIF_NATIONAL_T',
      },
      suppressed,
      actual: suppressed
        ? null
        : {
            since: program.startDate,
            heads: produced.heads,
            tonnes: round(tonnes, 3),
            yearToDateTonnes: round(producedYtd.tonnes, 3),
            last12MonthsTonnes: round(produced12.tonnes, 3),
            last12MonthsSharePct: pct(produced12.tonnes, objectiveTonnes),
          },
      capacity: suppressed
        ? null
        : {
            farms: n(capacity.farms),
            farmsWithoutCapacity: n(capacity.without_capacity),
            places,
          },
      projection: suppressed
        ? null
        : {
            method: PROJECTION_METHOD,
            inputs,
            annualPotentialTonnes: projection.annualPotentialTonnes,
            years: projection.years,
          },
      caveat: OBJECTIVE_CAVEAT,
    };
  }
}
