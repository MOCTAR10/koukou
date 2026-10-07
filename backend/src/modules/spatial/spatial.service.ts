import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  GeoJsonGeometry,
  geoJsonAreaHaFallback,
} from '../../common/geo/geo-geometry.js';

/**
 * Couche géospatiale partagée (aviculture + agriculture).
 *
 * PostGIS est utilisé comme *couche de calcul* (jamais comme dépendance de
 * schéma) : on stocke les contours en `jsonb` GeoJSON et on fait appel aux
 * fonctions ST_* à la volée via des requêtes SQL brutes quand l'extension est
 * disponible. Sinon (installation sans PostGIS), on retombe sur le calcul
 * JavaScript (`geoJsonAreaHaFallback`). La découverte de l'extension est
 * faite une seule fois au démarrage (cache), avec dégradation gracieuse.
 */
@Injectable()
export class SpatialService {
  private readonly logger = new Logger(SpatialService.name);
  private postgisAvailable: boolean | null = null;
  private postgisCheck: Promise<boolean> | null = null;

  constructor(private readonly dataSource: DataSource) {}

  /** L'extension PostgreSQL est-elle présente et utilisable ? (découverte paresseuse + cache). */
  async isPostGisAvailable(): Promise<boolean> {
    if (this.postgisAvailable !== null) return this.postgisAvailable;
    if (this.postgisCheck === null) {
      this.postgisCheck = this.detectPostGis().then((ok) => {
        this.postgisAvailable = ok;
        this.logger.log(
          ok
            ? 'PostGIS détecté — calculs de surface géospatiaux activés.'
            : 'PostGIS absent — repli sur le calcul de surface JavaScript.',
        );
        return ok;
      });
    }
    return this.postgisCheck;
  }

  private async detectPostGis(): Promise<boolean> {
    try {
      const rows: unknown[] = await this.dataSource.query(
        'SELECT postgis_version() AS version',
      );
      const first = rows?.[0] as { version?: string } | undefined;
      return Boolean(first && typeof first.version === 'string');
    } catch {
      return false;
    }
  }

  /**
   * Surface (ha) d'un contour GeoJSON. Priorité : calcul PostGIS (ST_Area sur
   * une géométrie projetée en 3857 depuis 4326) ; sinon repli JavaScript.
   * Renvoie null si aucun contour exploitable.
   */
  async areaHa(
    geometry: GeoJsonGeometry | null | undefined,
  ): Promise<number | null> {
    if (!geometry) return null;
    if (await this.isPostGisAvailable()) {
      try {
        const rows: { area_m2: string }[] = await this.dataSource.query(
          `SELECT ST_Area(
             ST_Transform(
               ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
               3857
             )
           ) AS area_m2`,
          [JSON.stringify(geometry)],
        );
        const areaM2 = Number(rows[0]?.area_m2);
        if (Number.isFinite(areaM2) && areaM2 > 0) return areaM2 / 10_000;
      } catch (err) {
        this.logger.warn(`Calcul PostGIS échoué — repli JS : ${String(err)}`);
      }
    }
    return geoJsonAreaHaFallback(geometry);
  }
}