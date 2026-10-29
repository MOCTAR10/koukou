import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertsService } from '../alerts/alerts.service.js';
import { AlertKind, AlertLevel } from '../../common/enums/alert-level.enum.js';
import { Farm } from '../farms/entities/farm.entity.js';
import {
  WEATHER_ZONES,
  WeatherObservation,
  WeatherZone,
} from './entities/weather-observation.entity.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FETCH_TIMEOUT_MS = 4500;

const THI_ZONES: Array<{ max: number; zone: WeatherZone }> = [
  { max: 75, zone: WEATHER_ZONES.CONFORT },
  { max: 79, zone: WEATHER_ZONES.PRUDENCE },
  { max: 84, zone: WEATHER_ZONES.MODERE },
  { max: 88, zone: WEATHER_ZONES.SEVERE },
  { max: Infinity, zone: WEATHER_ZONES.DANGER },
];

const ZONE_LABELS_FR: Record<WeatherZone, string> = {
  CONFORT: 'confort thermique',
  PRUDENCE: 'prudence',
  MODERE: 'stress modéré',
  SEVERE: 'stress sévère',
  DANGER: 'danger',
};

export interface WeatherDay {
  date: string;
  tempC: number;
  humidityPct: number;
  thi: number;
  zone: WeatherZone;
  level: AlertLevel | null;
}

export interface FarmWeather {
  farmId: string;
  available: boolean;
  reason?: string;
  latitude: number | null;
  longitude: number | null;
  source: string;
  generatedAt: string;
  today: WeatherDay | null;
  forecast: WeatherDay[];
}

/** Indice température-humidité (THI, échelle Hahn) : confort des oiseaux. */
export function computeThi(tempC: number, humidityPct: number): number {
  const f = (tempC * 9) / 5 + 32;
  const rh = humidityPct / 100;
  return f - (0.55 - 0.55 * rh) * (f - 58);
}

export function thiZone(thi: number): WeatherZone {
  for (const t of THI_ZONES) {
    if (thi < t.max) return t.zone;
  }
  return WEATHER_ZONES.DANGER;
}

export function zoneLevel(zone: WeatherZone): AlertLevel | null {
  if (zone === WEATHER_ZONES.DANGER || zone === WEATHER_ZONES.SEVERE) {
    return AlertLevel.ROUGE;
  }
  if (zone === WEATHER_ZONES.MODERE) return AlertLevel.JAUNE;
  return null;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(
    @InjectRepository(WeatherObservation)
    private readonly obsRepo: Repository<WeatherObservation>,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    private readonly alertsService: AlertsService,
  ) {}

  /**
   * Météo (THI) d'une ferme : cache quotidien via Open-Meteo (gratuit, sans
   * clé). Ne recharge qu'une fois par jour ; en cas d'échec réseau revient à
   * la dernière prévision en cache (jamais bloquant).
   */
  async forecastForFarm(farmId: string): Promise<FarmWeather> {
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    if (!farm) throw new NotFoundException('Ferme introuvable.');

    let latitude = farm.latitude;
    let longitude = farm.longitude;
    if (latitude == null || longitude == null) {
      const geo = await this.geocode(farm.administrativeCity);
      if (geo) {
        latitude = geo.latitude;
        longitude = geo.longitude;
      }
    }

    const today = todayStr();
    let rows = await this.loadRows(farmId, today);

    const hasToday = rows.some((o) => o.forecastDate === today);
    let justRefreshed = false;
    if (!hasToday && latitude != null && longitude != null) {
      try {
        await this.refreshForecast(farmId, latitude, longitude);
        justRefreshed = true;
        rows = await this.loadRows(farmId, today);
      } catch (err) {
        this.logger.warn(
          `Prévision météo indisponible (ferme ${farmId}) : ${String(err)}`,
        );
      }
    }

    const result = this.buildResponse(
      farm,
      rows,
      today,
      justRefreshed ? 'PREVISION' : 'CACHE',
      latitude,
      longitude,
    );
    if (result.available) {
      await this.evaluateHeatAlerts(farmId, result.today);
    } else {
      // No coordinates, or no forecast for today (fetch failed, empty
      // cache): an old day's heat alert must not stay active.
      await this.alertsService.clearKind(farmId, null, AlertKind.HEAT);
    }
    return result;
  }

  private async loadRows(
    farmId: string,
    today: string,
  ): Promise<WeatherObservation[]> {
    const all = await this.obsRepo.find({
      where: { farmId },
      order: { forecastDate: 'ASC' },
    });
    // On ne conserve que les jours du jour (inclus) vers le futur.
    return all.filter((o) => o.forecastDate >= today);
  }

  private async refreshForecast(
    farmId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    const url =
      `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}` +
      '&daily=temperature_2m_max,relative_humidity_2m_max&forecast_days=7&timezone=auto';
    const data = await fetchJson(url);
    const daily = (data.daily ?? {}) as {
      time?: string[];
      temperature_2m_max?: number[];
      relative_humidity_2m_max?: number[];
    };
    const dates = daily.time ?? [];
    const temps = daily.temperature_2m_max ?? [];
    const hums = daily.relative_humidity_2m_max ?? [];
    if (dates.length === 0) throw new Error('Réponse Open-Meteo vide.');

    const rows = dates.map((date, i) => {
      const tempC = temps[i] ?? 0;
      const humidityPct = hums[i] ?? 0;
      const thi = computeThi(tempC, humidityPct);
      const zone = thiZone(thi);
      return {
        farmId,
        forecastDate: date,
        tempC: round1(tempC),
        humidityPct: round1(humidityPct),
        thi: round1(thi),
        zone,
        level: zoneLevel(zone) ?? null,
        source: 'PREVISION',
        generatedAt: new Date(),
      };
    });
    await this.obsRepo.upsert(rows, ['farmId', 'forecastDate']);
  }

  private buildResponse(
    farm: Farm,
    rows: WeatherObservation[],
    today: string,
    source: string,
    latitude: number | null,
    longitude: number | null,
  ): FarmWeather {
    const base: FarmWeather = {
      farmId: farm.id,
      available: rows.length > 0,
      reason:
        rows.length > 0 ? undefined : 'Coordonnées de la ferme manquantes.',
      latitude,
      longitude,
      source: rows.length > 0 ? source : 'INDISPONIBLE',
      generatedAt: new Date().toISOString(),
      today: null,
      forecast: [],
    };
    if (rows.length === 0) return base;

    const forecast: WeatherDay[] = rows.map((o) => ({
      date: o.forecastDate,
      tempC: o.tempC,
      humidityPct: o.humidityPct,
      thi: o.thi,
      zone: o.zone,
      level: o.level == null ? null : (o.level as AlertLevel),
    }));
    const todayRow = forecast.find((d) => d.date === today) ?? forecast[0]!;
    return {
      ...base,
      available: true,
      reason: undefined,
      source,
      today: todayRow,
      forecast,
    };
  }

  /** Alerte heat-stress (niveau ferme) selon le THI du jour. */
  private async evaluateHeatAlerts(
    farmId: string,
    today: WeatherDay | null,
  ): Promise<void> {
    if (!today || today.level == null) {
      await this.alertsService.clearKind(farmId, null, AlertKind.HEAT);
      return;
    }
    const zoneLabel = ZONE_LABELS_FR[today.zone];
    const recommendations: Record<string, string> = {
      [WEATHER_ZONES.MODERE]:
        'Hydrater davantage (eau fraîche), ventiler et repousser l’alimentation aux heures fraîches du matin puis de la soirée.',
      [WEATHER_ZONES.SEVERE]:
        'Renforcer ventilation et brumisation, réduire la densité, surveiller la consommation d’eau et repousser le pic alimentaire aux heures fraîches.',
      [WEATHER_ZONES.DANGER]:
        'Mettre en place une ventilation maximale avec brumisation, réduire le stress (lumière, manipulation) et surveiller étroitement la mortalité : chaleur dangereuse.',
    };
    await this.alertsService.raise(
      {
        kind: AlertKind.HEAT,
        level: today.level,
        message: `Stress thermique (${zoneLabel}) : THI ${today.thi.toFixed(0)} prévu ${today.date} (température max ${today.tempC}°C, humidité ${today.humidityPct}%).`,
        recommendation: recommendations[today.zone],
        // Single key (jsonb reorders keys): an acknowledged alert stays
        // acknowledged until the day or the THI zone changes.
        context: { heat: `${today.date}:${today.zone}` },
      },
      { farmId },
      { keepAcknowledgedIfUnchanged: true },
    );
  }

  /** Géocodage best-effort (ville → lat/lon), jamais bloquant. */
  private async geocode(
    city: string,
  ): Promise<{ latitude: number; longitude: number } | null> {
    if (!city) return null;
    const url =
      `${GEOCODE_URL}?name=${encodeURIComponent(city)}` +
      '&count=1&country=GA&format=json&language=fr';
    try {
      const data = await fetchJson(url);
      const first = (
        data.results as
          | Array<{
              latitude: number;
              longitude: number;
            }>
          | undefined
      )?.[0];
      if (!first) return null;
      return { latitude: first.latitude, longitude: first.longitude };
    } catch {
      return null;
    }
  }
}
