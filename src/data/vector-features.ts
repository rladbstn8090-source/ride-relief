import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { Feature as GeoJSONFeature, MultiPolygon, Polygon } from 'geojson';
import type { Bounds, Feature, Point } from '../types';

const MAX_ZOOM = 14;
const MIN_ZOOM = 8;
const MAX_TILES = 640;
const FETCH_CONCURRENCY = 8;
const TILE_URL = 'https://vector.openstreetmap.org/shortbread_v1';
const PARK_KINDS = new Set(['park', 'garden', 'grass', 'recreation_ground', 'village_green', 'playground']);
const tileCache = new Map<string, Promise<ArrayBuffer>>();

function longitudeTile(longitude: number, zoom = MAX_ZOOM) {
  return Math.floor((longitude + 180) / 360 * 2 ** zoom);
}

function latitudeTile(latitude: number, zoom = MAX_ZOOM) {
  const radians = latitude * Math.PI / 180;
  return Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * 2 ** zoom);
}

export function vectorTileRange(bounds: Bounds, zoom = MAX_ZOOM) {
  return {
    west: longitudeTile(bounds.west, zoom),
    east: longitudeTile(bounds.east, zoom),
    north: latitudeTile(bounds.north, zoom),
    south: latitudeTile(bounds.south, zoom),
  };
}

function tileCount(bounds: Bounds, zoom: number) {
  const range = vectorTileRange(bounds, zoom);
  return (range.east - range.west + 1) * (range.south - range.north + 1);
}

export function vectorTileZoom(bounds: Bounds) {
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom--) if (tileCount(bounds, zoom) <= MAX_TILES) return zoom;
  return MIN_ZOOM;
}

function fetchTile(x: number, y: number, zoom: number, signal?: AbortSignal) {
  const key = `${zoom}/${x}/${y}`;
  let cached = tileCache.get(key);
  if (!cached) {
    cached = fetch(`${TILE_URL}/${key}.mvt`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000),
    }).then(response => {
      if (!response.ok) throw Error(`벡터 지도 타일 응답 ${response.status}`);
      return response.arrayBuffer();
    });
    tileCache.set(key, cached);
    cached.catch(() => tileCache.delete(key));
  }
  return cached;
}

function polygonRings(feature: GeoJSONFeature): Point[][][] {
  const geometry = feature.geometry;
  if (geometry.type === 'Polygon') return [(geometry as Polygon).coordinates.map(ring => ring.map(([lon, lat]) => [lat, lon] as Point))];
  if (geometry.type === 'MultiPolygon') return (geometry as MultiPolygon).coordinates.map(polygon => polygon.map(ring => ring.map(([lon, lat]) => [lat, lon] as Point)));
  return [];
}

function footprintArea(rings: Point[][]) {
  const ring = rings[0] ?? [];
  let area = 0;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current[1] * next[0] - next[1] * current[0];
  }
  return Math.abs(area) * 0.5;
}

function estimatedBuildingHeight(rings: Point[][], seed: number) {
  const area = footprintArea(rings);
  const sizeBonus = Math.min(18, Math.sqrt(area) * 1800);
  const variation = ((seed * 2654435761) >>> 0) % 17;
  return Math.round(8 + sizeBonus + variation);
}

function readLayer(tile: VectorTile, layerName: string, kind: Feature['kind'], x: number, y: number, zoom: number) {
  const layer = tile.layers[layerName];
  if (!layer) return [];
  const result: Feature[] = [];
  for (let index = 0; index < layer.length; index++) {
    const vectorFeature = layer.feature(index);
    if (vectorFeature.type !== 3) continue;
    if (layerName === 'land' && !PARK_KINDS.has(String(vectorFeature.properties.kind ?? ''))) continue;
    const polygons = polygonRings(vectorFeature.toGeoJSON(x, y, zoom));
    polygons.forEach((rings, polygonIndex) => {
      if (!rings[0] || rings[0].length < 4) return;
      const seed = vectorFeature.id ?? index + x * 37 + y * 101;
      result.push({
        id: `shortbread/${zoom}/${layerName}/${x}/${y}/${vectorFeature.id ?? index}/${polygonIndex}`,
        kind,
        rings,
        height: kind === 'building' ? estimatedBuildingHeight(rings, seed) : undefined,
      });
    });
  }
  return result;
}

export async function loadVectorFeatures(bounds: Bounds, progress: (message: string) => void, signal?: AbortSignal) {
  const zoom = vectorTileZoom(bounds);
  const range = vectorTileRange(bounds, zoom);
  const coordinates: Array<[number, number]> = [];
  for (let x = range.west; x <= range.east; x++) for (let y = range.north; y <= range.south; y++) coordinates.push([x, y]);
  progress(`고품질 지도 z${zoom} 타일 ${coordinates.length}장을 나누어 가져오는 중…`);
  const buffers = new Array<ArrayBuffer>(coordinates.length);
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (cursor < coordinates.length) {
      const index = cursor++;
      const [x, y] = coordinates[index];
      buffers[index] = await fetchTile(x, y, zoom, signal);
      completed++;
      if (completed === coordinates.length || completed % 16 === 0) progress(`고품질 지도 z${zoom} · ${completed}/${coordinates.length}장 조립 중…`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, coordinates.length) }, worker));
  const features: Feature[] = [];
  buffers.forEach((buffer, tileIndex) => {
    const [x, y] = coordinates[tileIndex];
    const tile = new VectorTile(new PbfReader(buffer));
    features.push(...readLayer(tile, 'buildings', 'building', x, y, zoom));
    features.push(...readLayer(tile, 'land', 'park', x, y, zoom));
    features.push(...readLayer(tile, 'water_polygons', 'water', x, y, zoom));
    features.push(...readLayer(tile, 'ocean', 'water', x, y, zoom));
  });
  return features;
}
