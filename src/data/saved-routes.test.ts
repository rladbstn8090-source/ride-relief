import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSavedRoutes, encodeSavedRoutes, type SavedRoute } from './saved-routes';
import { rectangleArea } from './selection-area';

const saved: SavedRoute = {
  id: 'route-1', name: '부산 해안 코스', savedAt: '2026-09-18T12:00:00.000Z', label: '직접 그린 코스',
  route: [[35.05, 129.02], [35.08, 129.06]], bounds: { south: 35.04, west: 129.01, north: 35.09, east: 129.08 },
  area: rectangleArea({ south: 35.04, west: 129.01, north: 35.09, east: 129.08 }),
  settings: { width: 180, exaggeration: 2.5, buildingExaggeration: 1.5, routeWidth: 1.6, buildings: true, parks: true, water: true, route: true },
};

test('saved routes round-trip and malformed browser data is ignored', () => {
  assert.deepEqual(decodeSavedRoutes(encodeSavedRoutes([saved])), [saved]);
  const oldSettings = { ...saved, settings: { width: 180, exaggeration: 2.5, routeWidth: 1.6, buildings: true, water: true, route: true } };
  assert.deepEqual(decodeSavedRoutes(JSON.stringify([oldSettings]))[0].settings, saved.settings);
  const oldArea = { ...saved } as Partial<SavedRoute>; delete oldArea.area;
  assert.equal(decodeSavedRoutes(JSON.stringify([oldArea]))[0].area.kind, 'rectangle');
  assert.deepEqual(decodeSavedRoutes('{broken'), []);
  assert.deepEqual(decodeSavedRoutes(JSON.stringify([{ ...saved, route: [[999, 999]] }])), []);
});
