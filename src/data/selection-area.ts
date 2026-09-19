import type { Bounds, Point, SelectionArea } from '../types';

export function rectangleArea(bounds: Bounds): SelectionArea {
  return { kind: 'rectangle', points: [
    [bounds.south, bounds.west], [bounds.south, bounds.east],
    [bounds.north, bounds.east], [bounds.north, bounds.west],
  ] };
}

export function circleArea(center: Point, edge: Point, segments = 64): SelectionArea {
  const cosine = Math.max(.1, Math.cos(center[0] * Math.PI / 180));
  const dx = (edge[1] - center[1]) * cosine;
  const dy = edge[0] - center[0];
  const radius = Math.hypot(dx, dy);
  const points: Point[] = [];
  for (let index = 0; index < segments; index++) {
    const angle = index / segments * Math.PI * 2;
    points.push([center[0] + Math.sin(angle) * radius, center[1] + Math.cos(angle) * radius / cosine]);
  }
  return { kind: 'circle', points };
}

export function areaBounds(area: SelectionArea): Bounds {
  if (area.points.length < 3) throw Error('출력 영역에는 세 점 이상이 필요합니다.');
  const latitudes = area.points.map(point => point[0]);
  const longitudes = area.points.map(point => point[1]);
  return {
    south: Math.min(...latitudes), north: Math.max(...latitudes),
    west: Math.min(...longitudes), east: Math.max(...longitudes),
  };
}

export function cloneArea(area: SelectionArea): SelectionArea {
  return { kind: area.kind, points: area.points.map(point => [...point] as Point) };
}

export function polygonSelfIntersects(points: Point[]) {
  const cross = (a: Point, b: Point, c: Point) => (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
  const intersects = (a: Point, b: Point, c: Point, d: Point) => {
    const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
    return abC * abD < 0 && cdA * cdB < 0;
  };
  for (let first = 0; first < points.length; first++) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second++) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (intersects(points[first], points[firstNext], points[second], points[secondNext])) return true;
    }
  }
  return false;
}
