import type { Bounds, Point } from '../types';

export interface PlaceResult {
  name: string;
  subtitle: string;
  coordinate: Point;
  bounds?: Bounds;
  source: 'local' | 'openstreetmap';
}

const places: Array<[string, number, number, number]> = [
  ['서울',37.5665,126.978,13],['부산',35.1796,129.0756,13],['인천',37.4563,126.7052,13],['대구',35.8714,128.6014,13],
  ['대전',36.3504,127.3845,13],['광주',35.1595,126.8526,13],['울산',35.5384,129.3114,13],['세종',36.4801,127.289,13],
  ['제주',33.4996,126.5312,13],['수원',37.2636,127.0286,14],['성남',37.4200,127.1265,14],['고양',37.6584,126.8320,14],
  ['용인',37.2411,127.1776,14],['춘천',37.8813,127.7298,14],['강릉',37.7519,128.8761,14],['원주',37.3422,127.9202,14],
  ['청주',36.6424,127.4890,14],['천안',36.8151,127.1139,14],['전주',35.8242,127.1480,14],['군산',35.9677,126.7366,14],
  ['목포',34.8118,126.3922,14],['여수',34.7604,127.6622,14],['순천',34.9506,127.4872,14],['포항',36.0190,129.3435,14],
  ['경주',35.8562,129.2247,14],['창원',35.2279,128.6811,14],['진주',35.1799,128.1076,14],['김해',35.2285,128.8894,14],
  ['거제',34.8806,128.6211,14],['통영',34.8544,128.4331,14],['태종대',35.0527,129.0872,15],['해운대',35.1631,129.1635,15],
  ['영도',35.0912,129.0680,14],['진주성',35.1891,128.0779,16],['한라산',33.3617,126.5292,14],['설악산',38.1195,128.4656,14],
];

export const QUICK_PLACES = places.slice(0, 9).map(([name,lat,lon,zoom])=>({name,coordinate:[lat,lon] as Point,zoom}));

function normalized(value:string){return value.toLocaleLowerCase('ko-KR').replace(/\s+/g,'');}

export function localPlaceMatches(query:string):PlaceResult[]{
  const q=normalized(query);if(!q)return [];
  return places.filter(([name])=>q.includes(normalized(name))||normalized(name).includes(q)).slice(0,5).map(([name,lat,lon])=>({name,subtitle:'빠른 지역 이동 · 로컬',coordinate:[lat,lon],source:'local'}));
}

export function parseNominatimResults(data:unknown):PlaceResult[]{
  if(!Array.isArray(data))return [];
  return data.flatMap((item:any)=>{const lat=Number(item?.lat),lon=Number(item?.lon),box=item?.boundingbox?.map(Number);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)return [];const bounds=Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)?{south:box[0],north:box[1],west:box[2],east:box[3]}:undefined;const display=String(item?.display_name??'검색 결과');return [{name:display.split(',')[0],subtitle:display,coordinate:[lat,lon] as Point,bounds,source:'openstreetmap' as const}];});
}
