import test from 'node:test';
import assert from 'node:assert/strict';
import { vectorTileRange } from './vector-features';
import { metropolitanCity } from './providers';

test('metropolitan city detail mode covers the seven target cities', () => {
  assert.equal(metropolitanCity({ south: 35.14, west: 129.02, north: 35.20, east: 129.12 }), '부산');
  assert.equal(metropolitanCity({ south: 37.50, west: 126.90, north: 37.60, east: 127.08 }), '서울');
  assert.equal(metropolitanCity({ south: 37.42, west: 126.65, north: 37.50, east: 126.75 }), '인천');
  assert.equal(metropolitanCity({ south: 35.83, west: 128.55, north: 35.91, east: 128.65 }), '대구');
  assert.equal(metropolitanCity({ south: 36.31, west: 127.34, north: 36.39, east: 127.43 }), '대전');
  assert.equal(metropolitanCity({ south: 35.12, west: 126.81, north: 35.20, east: 126.90 }), '광주');
  assert.equal(metropolitanCity({ south: 35.50, west: 129.27, north: 35.58, east: 129.35 }), '울산');
  assert.equal(metropolitanCity({ south: 35.14, west: 128.02, north: 35.20, east: 128.10 }), undefined);
});

test('vector tile range is finite and ordered', () => {
  const range = vectorTileRange({ south: 35.14, west: 129.02, north: 35.20, east: 129.12 });
  assert(Number.isInteger(range.west));
  assert(range.west <= range.east);
  assert(range.north <= range.south);
});
