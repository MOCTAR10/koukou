export type CropCategory = 'TUBERCULE' | 'MARAICHAGE' | 'FRUIT' | 'CEREALE' | 'AUTRE';

/** Crop from the reference list: shared, or the farm's own. */
export interface Culture {
  id: string;
  name: string;
  category: CropCategory;
  defaultCycleDays: number | null;
  waterNeedsLPlantDay: number | null;
  notes: string | null;
}

export type ParcelleStatus = 'PREPARATION' | 'ACTIVE' | 'JACHERE' | 'CLOTURE';

export interface GeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][][] | number[][][];
}

export interface Parcelle {
  id: string;
  farmId: string;
  name: string;
  culture: Culture;
  cultureId: string;
  areaHa: number;
  areaM2: number | null;
  boundaryGeoJson: GeoJsonGeometry | null;
  plantedAt: string | null;
  status: ParcelleStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParcelleInput {
  name: string;
  cultureId: string;
  areaHa: number;
  status: ParcelleStatus;
  plantedAt: string | null;
}

export type RecolteUnit = 'KG' | 'PIECE' | 'SAC';

/** Harvest journal entry: the only source of sellable harvest stock. */
export interface Recolte {
  id: string;
  farmId: string;
  parcelleId: string;
  harvestDate: string;
  quantity: number;
  unit: RecolteUnit;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecolteInput {
  parcelleId: string;
  harvestDate: string;
  quantity: number;
  unit: RecolteUnit;
  notes?: string;
}

/** Sellable stock per (parcel, unit): harvested minus sold. */
export interface ParcelleStock {
  parcelleId: string;
  parcelleName: string;
  cultureName: string | null;
  unit: RecolteUnit;
  harvested: number;
  sold: number;
  available: number;
}
