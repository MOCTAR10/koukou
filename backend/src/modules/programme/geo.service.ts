import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  isGeoJsonGeometry,
  type GeoJsonGeometry,
} from '../../common/geo/geo-geometry.js';
import {
  pointInGeometry,
  ringsAreClosed,
} from '../../common/geo/point-in-polygon.js';
import { Province } from './entities/province.entity.js';
import { ProgrammeService } from './programme.service.js';
import { TerritoryService } from './territory.service.js';

export interface GeoCheckResult {
  readonly provinceCode: string;
  /** Null when that province has no boundary loaded yet (cannot tell). */
  readonly inside: boolean | null;
  /** Province whose loaded boundary contains the point, if any. */
  readonly foundProvinceCode: string | null;
  /** French warning to show, null when consistent or unknown. */
  readonly warning: string | null;
}

/**
 * GPS ↔ province consistency. Always a WARNING, never a block: a phone GPS can
 * be wrong and the boundaries are coarse (see poufa-data/SOURCES.md).
 */
@Injectable()
export class GeoService {
  constructor(
    private readonly programme: ProgrammeService,
    private readonly territory: TerritoryService,
    @InjectRepository(Province)
    private readonly provinces: Repository<Province>,
  ) {}

  /** Code of the province whose loaded boundary contains the point, or null. */
  async provinceOf(
    latitude: number,
    longitude: number,
  ): Promise<string | null> {
    const shapes = await this.loadedShapes();
    return this.find(shapes, latitude, longitude);
  }

  /** Is the point inside `provinceCode`? @throws NotFoundException on an unknown province */
  async checkPoint(
    latitude: number,
    longitude: number,
    provinceCode: string,
  ): Promise<GeoCheckResult> {
    const province = await this.territory.provinceByCode(provinceCode);
    const shapes = await this.loadedShapes();
    const own = shapes.find((s) => s.code === province.code);
    const inside = own
      ? pointInGeometry(latitude, longitude, own.geometry)
      : null;
    const foundProvinceCode = inside
      ? province.code
      : this.find(shapes, latitude, longitude);
    let warning: string | null = null;
    if (inside === false) {
      const found = shapes.find((s) => s.code === foundProvinceCode);
      warning = found
        ? `Le point GPS se trouve dans la province ${found.code} (${found.name}), pas dans ${province.code} (${province.name}). Vérifiez la position ou la province.`
        : `Le point GPS se trouve hors de la province ${province.code} (${province.name}). Vérifiez la position.`;
    }
    return { provinceCode: province.code, inside, foundProvinceCode, warning };
  }

  /** Stores a province boundary. @throws BadRequestException on an invalid GeoJSON */
  async setGeometry(
    provinceCode: string,
    geometry: unknown,
  ): Promise<{ code: string; hasGeometry: true }> {
    if (!isGeoJsonGeometry(geometry)) {
      throw new BadRequestException(
        'Contour invalide : un GeoJSON Polygon ou MultiPolygon est attendu (positions [longitude, latitude], anneaux d’au moins 4 points).',
      );
    }
    if (!ringsAreClosed(geometry)) {
      throw new BadRequestException(
        'Contour invalide : chaque anneau doit être fermé (premier point = dernier point).',
      );
    }
    const province = await this.territory.provinceByCode(provinceCode);
    await this.provinces.update(province.id, {
      geometry: {
        type: geometry.type,
        coordinates: geometry.coordinates,
      } as GeoJsonGeometry,
    });
    return { code: province.code, hasGeometry: true };
  }

  private async loadedShapes(): Promise<
    { code: string; name: string; geometry: GeoJsonGeometry }[]
  > {
    const program = await this.programme.current();
    const rows = await this.provinces
      .createQueryBuilder('p')
      .select(['p.id', 'p.code', 'p.name', 'p.sort'])
      .addSelect('p.geometry')
      .where('p.program_id = :id AND p.geometry IS NOT NULL', {
        id: program.id,
      })
      .orderBy('p.sort', 'ASC')
      .getMany();
    return rows.map((p) => ({
      code: p.code,
      name: p.name,
      geometry: p.geometry as GeoJsonGeometry,
    }));
  }

  private find(
    shapes: { code: string; geometry: GeoJsonGeometry }[],
    latitude: number,
    longitude: number,
  ): string | null {
    return (
      shapes.find((s) => pointInGeometry(latitude, longitude, s.geometry))
        ?.code ?? null
    );
  }
}
