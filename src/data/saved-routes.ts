import { rectangleArea } from './selection-area';
import type { Bounds, Point, SelectionArea, Settings } from '../types';

export const SAVED_ROUTES_KEY = 'ride-relief.saved-routes.v1';

export interface SavedRoute {
  id: string;
  name: string;
  savedAt: string;
  label: string;
  route: Point[];
  bounds: Bounds;
  area: SelectionArea;
  settings: Settings;
}

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const point = (value: unknown): value is Point => Array.isArray(value) && value.length === 2 && finite(value[0]) && finite(value[1]) && Math.abs(value[0]) <= 85 && Math.abs(value[1]) <= 180;

function normalize(entry: unknown): SavedRoute | undefined {
  if (!entry || typeof entry !== 'object') return undefined;
  const item = entry as Record<string, unknown>;
  const bounds = item.bounds as Record<string, unknown> | undefined;
  const settings = item.settings as Record<string, unknown> | undefined;
  const rawArea = item.area as Record<string, unknown> | undefined;
  const valid = typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim().length > 0
    && typeof item.savedAt === 'string' && typeof item.label === 'string'
    && Array.isArray(item.route) && item.route.length >= 2 && item.route.length <= 500 && item.route.every(point)
    && Boolean(bounds) && finite(bounds!.south) && finite(bounds!.north) && finite(bounds!.west) && finite(bounds!.east)
    && (bounds!.south as number) < (bounds!.north as number) && (bounds!.west as number) < (bounds!.east as number)
    && Boolean(settings) && finite(settings!.width) && finite(settings!.exaggeration) && finite(settings!.routeWidth)
    && typeof settings!.buildings === 'boolean' && typeof settings!.water === 'boolean' && typeof settings!.route === 'boolean';
  if (!valid) return undefined;
  const normalizedBounds = bounds as unknown as Bounds;
  const validArea = rawArea && ['rectangle','circle','polygon'].includes(String(rawArea.kind))
    && Array.isArray(rawArea.points) && rawArea.points.length >= 3 && rawArea.points.length <= 128 && rawArea.points.every(point);
  return {
    ...(item as unknown as SavedRoute),
    area: validArea ? { kind: rawArea.kind as SelectionArea['kind'], points: (rawArea.points as Point[]).map(value => [...value] as Point) } : rectangleArea(normalizedBounds),
    settings: {
      ...(settings as unknown as Settings),
      buildingExaggeration: finite(settings!.buildingExaggeration) ? settings!.buildingExaggeration as number : 1.5,
      parks: typeof settings!.parks === 'boolean' ? settings!.parks : true,
    },
  };
}

export function decodeSavedRoutes(raw: string | null): SavedRoute[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalize).filter((item): item is SavedRoute => Boolean(item)).slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function encodeSavedRoutes(routes: SavedRoute[]) {
  return JSON.stringify(routes.slice(0, 20));
}
