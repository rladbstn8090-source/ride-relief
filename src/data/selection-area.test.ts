import test from 'node:test';
import assert from 'node:assert/strict';
import { areaBounds, circleArea, polygonSelfIntersects, rectangleArea } from './selection-area';

test('rectangle and circle areas produce printable bounds', () => {
  const bounds = { south: 35.1, west: 129, north: 35.2, east: 129.2 };
  assert.deepEqual(areaBounds(rectangleArea(bounds)), bounds);
  const circle = circleArea([35.15, 129.1], [35.17, 129.1]);
  assert.equal(circle.points.length, 64);
  const circleBounds = areaBounds(circle);
  assert(Math.abs(circleBounds.south - 35.13) < 1e-8);
  assert(Math.abs(circleBounds.north - 35.17) < 1e-8);
});

test('free area detects crossing edges but allows concave outlines', () => {
  assert.equal(polygonSelfIntersects([[0,0],[1,1],[0,1],[1,0]]), true);
  assert.equal(polygonSelfIntersects([[0,0],[0,2],[1,1],[2,2],[2,0]]), false);
});
