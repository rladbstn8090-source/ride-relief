import type { Bounds, Feature, Landscape, Point } from '../types';
import { JINJU_BOUNDS } from './jinju';
import { SOUTH_KOREA_BOUNDS } from './korea';
import { loadVectorFeatures } from './vector-features';
const LOCAL_BASE=(import.meta as ImportMeta & {env?:{BASE_URL?:string}}).env?.BASE_URL??'/';
export function contains(outer: Bounds, inner: Bounds) { return inner.south>=outer.south && inner.north<=outer.north && inner.west>=outer.west && inner.east<=outer.east; }
export function rangeKilometers(bounds:Bounds){return {width:(bounds.east-bounds.west)*111.32*Math.cos((bounds.north+bounds.south)*Math.PI/360),height:(bounds.north-bounds.south)*111.32};}
export const MAX_RANGE_KM = 750;
export function terrainQuality(bounds:Bounds){const size=rangeKilometers(bounds),longest=Math.max(size.width,size.height);if(longest<=15)return {resolution:192,zoom:14};if(longest<=60)return {resolution:256,zoom:13};if(longest<=200)return {resolution:288,zoom:11};return {resolution:320,zoom:10};}
function sample(data:Landscape,lat:number,lon:number){const r=data.resolution;const fx=Math.max(0,Math.min(r,(lon-data.bounds.west)/(data.bounds.east-data.bounds.west)*r)),fy=Math.max(0,Math.min(r,(lat-data.bounds.south)/(data.bounds.north-data.bounds.south)*r));const x=Math.min(r-1,Math.floor(fx)),y=Math.min(r-1,Math.floor(fy)),u=fx-x,v=fy-y;const at=(a:number,b:number)=>data.elevations[b*(r+1)+a];return at(x,y)*(1-u)*(1-v)+at(x+1,y)*u*(1-v)+at(x,y+1)*(1-u)*v+at(x+1,y+1)*u*v;}
export function createOverviewLandscape(bounds:Bounds,base?:Landscape):Landscape{const resolution=Math.max(160,terrainQuality(bounds).resolution);const elevations:number[]=[];for(let y=0;y<=resolution;y++)for(let x=0;x<=resolution;x++){const lat=bounds.south+(bounds.north-bounds.south)*y/resolution,lon=bounds.west+(bounds.east-bounds.west)*x/resolution;elevations.push(base?sample(base,lat,lon):80+12*Math.sin(lat*31)*Math.cos(lon*27)+6*Math.sin((lat+lon)*53));}const features=base?base.features.filter(feature=>feature.rings.some(ring=>ring.some(point=>point[0]>=bounds.south&&point[0]<=bounds.north&&point[1]>=bounds.west&&point[1]<=bounds.east))):[];return {bounds,resolution,elevations,features,detail:'detailed',source:`고해상도 대체 지형 · ${resolution}×${resolution} 셀`};}
export async function loadJinju(): Promise<Landscape> { const r=await fetch(`${LOCAL_BASE}data/jinju.json`); if(!r.ok) throw Error('진주 지형 데이터를 읽지 못했습니다.'); return r.json(); }
const tileCache = new Map<string, Promise<ImageData>>();
function requestSignal(signal:AbortSignal|undefined,timeout:number){return signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);}
function tile(z:number,x:number,y:number,signal?:AbortSignal,local=false):Promise<ImageData>{ const key=`${local?'local':'remote'}/${z}/${x}/${y}`; let p=tileCache.get(key); if(!p){ p=(async()=>{const url=local?`${LOCAL_BASE}data/terrain/${z}/${x}/${y}.png`:`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;const r=await fetch(url,{signal:local?signal:requestSignal(signal,60000)});if(!r.ok)throw Error('고도 타일을 가져오지 못했습니다.');const bmp=await createImageBitmap(await r.blob()); const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;ctx.drawImage(bmp,0,0);bmp.close();return ctx.getImageData(0,0,256,256);})(); tileCache.set(key,p);p.catch(()=>tileCache.delete(key)); }return p; }
async function elevationLandscape(bounds:Bounds,resolution:number,z:number,signal:AbortSignal|undefined,local:boolean){const scale=2**z;const coords=(lat:number,lon:number)=>[(lon+180)/360*scale,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*scale];const nw=coords(bounds.north,bounds.west),se=coords(bounds.south,bounds.east);const tiles=new Map<string,ImageData>();const jobs:Promise<void>[]=[];for(let x=Math.floor(nw[0]);x<=Math.floor(se[0]);x++)for(let y=Math.floor(nw[1]);y<=Math.floor(se[1]);y++)jobs.push(tile(z,x,y,signal,local).then(value=>{tiles.set(`${x}/${y}`,value);}));await Promise.all(jobs);const elevations:number[]=[];for(let y=0;y<=resolution;y++)for(let x=0;x<=resolution;x++){const p=coords(bounds.south+(bounds.north-bounds.south)*y/resolution,bounds.west+(bounds.east-bounds.west)*x/resolution),tx=Math.floor(p[0]),ty=Math.floor(p[1]);const image=tiles.get(`${tx}/${ty}`);if(!image)throw Error('선택 범위의 고도 타일이 없습니다.');const i=(Math.min(255,Math.floor((p[1]-ty)*256))*256+Math.min(255,Math.floor((p[0]-tx)*256)))*4;elevations.push(image.data[i]*256+image.data[i+1]+image.data[i+2]/256-32768);}return elevations;}
export async function loadKoreaOverview(bounds:Bounds,signal?:AbortSignal):Promise<Landscape>{if(!contains(SOUTH_KOREA_BOUNDS,bounds))throw Error('남한 로컬 고도 범위를 벗어났습니다.');const {resolution}=terrainQuality(bounds);const elevations=await elevationLandscape(bounds,resolution,9,signal,true);return {bounds,resolution,elevations,features:[],detail:'detailed',source:`대한민국 실제 고도 · 로컬 고해상도 ${resolution}×${resolution} 셀`};}
const OVERPASS_ENDPOINTS = [
 'https://overpass.kumi.systems/api/interpreter',
 'https://overpass-api.de/api/interpreter',
 'https://overpass.private.coffee/api/interpreter',
];

const METROPOLITAN_CITIES = [
 ['서울',37.5665,126.9780,.36,.46],
 ['부산',35.1796,129.0756,.31,.42],
 ['인천',37.4563,126.7052,.38,.55],
 ['대구',35.8714,128.6014,.29,.37],
 ['대전',36.3504,127.3845,.27,.34],
 ['광주',35.1595,126.8526,.27,.34],
 ['울산',35.5384,129.3114,.34,.43],
] as const;

export function metropolitanCity(bounds:Bounds){
 const lat=(bounds.south+bounds.north)/2,lon=(bounds.west+bounds.east)/2;
 return METROPOLITAN_CITIES
  .map(city=>({city,distance:((lat-city[1])/city[3])**2+((lon-city[2])/city[4])**2}))
  .filter(({distance})=>distance<=1)
  .sort((a,b)=>a.distance-b.distance)[0]?.city[0];
}

async function overpass(query:string,signal:AbortSignal|undefined,progress:(s:string)=>void,label:string,accept:(data:any)=>boolean){
 let lastError:unknown;
 for(let index=0;index<OVERPASS_ENDPOINTS.length;index++){
  try{
   if(index)progress(`${label} 서버 ${index+1}/${OVERPASS_ENDPOINTS.length}로 다시 연결하는 중…`);
   const response=await fetch(OVERPASS_ENDPOINTS[index],{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:`data=${encodeURIComponent(query)}`,signal:requestSignal(signal,22000)});
   if(!response.ok)throw Error(`지도 데이터 서버 응답 ${response.status}`);
   const payload=await response.json();
   if(!accept(payload))throw Error(`${label} 응답에 필요한 상세 지물이 없습니다.`);
   return payload;
  }catch(error){if(signal?.aborted)throw error;lastError=error;}
 }
 throw lastError instanceof Error?lastError:Error(`${label} 서버에 연결하지 못했습니다.`);
}

async function osmFeatures(bounds:Bounds,signal:AbortSignal|undefined,progress:(s:string)=>void){
 const bbox=`${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
 const city=metropolitanCity(bounds);
 try{const vectorFeatures=await loadVectorFeatures(bounds,progress,signal);if(vectorFeatures.length)return vectorFeatures;}
 catch(error){if(signal?.aborted)throw error;progress('공식 지도 타일이 지연되어 상세 지도 서버로 전환하는 중…');}
 const urbanQuery=`[out:json][timeout:40];(
way["building"](${bbox});relation["building"](${bbox});
way["leisure"~"^(park|garden)$"](${bbox});relation["leisure"~"^(park|garden)$"](${bbox});
way["landuse"~"^(grass|recreation_ground)$"](${bbox});relation["landuse"~"^(grass|recreation_ground)$"](${bbox});
);out body geom;`;
 const waterQuery=`[out:json][timeout:35];(
way["natural"="water"](${bbox});relation["natural"="water"](${bbox});
way["water"](${bbox});relation["water"](${bbox});
way["waterway"="riverbank"](${bbox});relation["waterway"="riverbank"](${bbox});
);out body geom;`;
 progress(`${city??'선택 지역'} 건물 높이와 공원을 가져오는 중…`);
 const urbanPayload=await overpass(urbanQuery,signal,progress,'건물·공원',(payload)=>{const features=parseOSM(payload);return city?features.some(feature=>feature.kind==='building'):features.length>0;});
 const urban=parseOSM(urbanPayload).filter(feature=>feature.kind!=='water');
 progress('강·호수 경계를 가져오는 중…');
 let water:Feature[]=[];
 try{const waterPayload=await overpass(waterQuery,signal,progress,'수변',()=>true);water=parseOSM(waterPayload).filter(feature=>feature.kind==='water');}
 catch(error){if(signal?.aborted)throw error;progress('수변 서버가 지연되어 고도에서 바다를 판별합니다.');}
 return [...urban,...water];
}

export async function loadRemote(bounds: Bounds, progress:(s:string)=>void,signal?:AbortSignal):Promise<Landscape>{
 const {width:kmWide,height:kmDeep}=rangeKilometers(bounds);
 if(bounds.south < -85 || bounds.north > 85 || bounds.west < -180 || bounds.east > 180 || kmWide>MAX_RANGE_KM || kmDeep>MAX_RANGE_KM)throw Error(`현재는 가로·세로 ${MAX_RANGE_KM} km 이내의 영역을 지원합니다.`);
 const {resolution:n,zoom:z}=terrainQuality(bounds);
 progress(`고해상도 고도 ${n}×${n} 셀을 가져오는 중…`);
 let elevations:number[];
 try{elevations=await elevationLandscape(bounds,n,z,signal,false);}
 catch(error){if(signal?.aborted||!contains(SOUTH_KOREA_BOUNDS,bounds))throw error;progress('온라인 고도가 지연되어 남한 로컬 고도를 고해상도로 보간하는 중…');elevations=await elevationLandscape(bounds,n,9,signal,true);}
 progress('건물 높이·공원·수변을 가져오는 중…');
 const features=await osmFeatures(bounds,signal,progress);
 const buildings=features.filter(feature=>feature.kind==='building').length;
 const parks=features.filter(feature=>feature.kind==='park').length;
 const waters=features.filter(feature=>feature.kind==='water').length;
 const city=metropolitanCity(bounds);
 return {bounds,resolution:n,elevations,features,detail:'detailed',source:`${city?`${city} `:''}고해상도 ${n}×${n} · 건물 ${buildings.toLocaleString('ko-KR')}개 · 공원 ${parks.toLocaleString('ko-KR')}개 · 수변 ${waters.toLocaleString('ko-KR')}개 · OpenStreetMap`};
}
// Kept separate from route ingestion so future GPX files only need a Point[] adapter.
export function parseOSM(data:any):Feature[]{
 const features:Feature[]=[];
 const loose:{water:Point[][];park:Point[][]}={water:[],park:[]};
 const convert=(g:any[])=>g.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>[p.lat,p.lon] as Point);
 const same=(a:Point,b:Point)=>Math.abs(a[0]-b[0])<1e-7&&Math.abs(a[1]-b[1])<1e-7;
 const kindOf=(tags:any):Feature['kind']=>tags?.building?'building':tags?.leisure==='park'||tags?.leisure==='garden'||['grass','recreation_ground'].includes(tags?.landuse)?'park':'water';
 const buildingHeight=(tags:any)=>{const height=parseFloat(tags?.height);const levels=parseFloat(tags?.['building:levels']);const roof=parseFloat(tags?.['roof:height']);return Number.isFinite(height)&&height>0?height:Number.isFinite(levels)&&levels>0?levels*3+(Number.isFinite(roof)?roof:0):9;};
 for(const el of data.elements??[]){ const kind=kindOf(el.tags); const raw:Point[][]=[];
 if(el.geometry)raw.push(convert(el.geometry));
 else if(el.members){const chains:Point[][]=el.members.filter((m:any)=>m.geometry).map((m:any)=>convert(m.geometry));
 while(chains.length){const chain=chains.pop()!;if(chain.length<2)continue;let changed=true;while(changed){changed=false;for(let i=0;i<chains.length;i++){const c=chains[i];if(c.length<2)continue;if(same(chain.at(-1)!,c[0]))chain.push(...c.slice(1));else if(same(chain.at(-1)!,c.at(-1)!))chain.push(...c.slice(0,-1).reverse());else if(same(chain[0],c.at(-1)!))chain.unshift(...c.slice(0,-1));else if(same(chain[0],c[0]))chain.unshift(...c.slice(1).reverse());else continue;chains.splice(i,1);changed=true;break;}}if(chain.length>3&&same(chain[0],chain.at(-1)!))raw.push(chain);}
 if(raw.length){features.push({id:`${el.type}/${el.id}`,kind,rings:raw,height:kind==='building'?buildingHeight(el.tags):undefined});continue;}}

 for(let i=0;i<raw.length;i++){const ring=raw[i];if(ring.length<4||!same(ring[0],ring.at(-1)!)){if(kind!=='building'&&ring.length>1)loose[kind].push(ring);continue;}features.push({id:`${el.type}/${el.id}/${i}`,kind,rings:[ring],height:kind==='building'?buildingHeight(el.tags):undefined});}
 }
 for(const kind of ['water','park'] as const){const chains=loose[kind].map(chain=>[...chain]);let serial=0;while(chains.length){const chain=chains.pop()!;let changed=true;while(changed){changed=false;for(let i=0;i<chains.length;i++){const other=chains[i];if(same(chain.at(-1)!,other[0]))chain.push(...other.slice(1));else if(same(chain.at(-1)!,other.at(-1)!))chain.push(...other.slice(0,-1).reverse());else if(same(chain[0],other.at(-1)!))chain.unshift(...other.slice(0,-1));else if(same(chain[0],other[0]))chain.unshift(...other.slice(1).reverse());else continue;chains.splice(i,1);changed=true;break;}}if(chain.length>3&&same(chain[0],chain.at(-1)!))features.push({id:`stitched/${kind}/${serial++}`,kind,rings:[chain]});}}
 return features;
}
export {JINJU_BOUNDS};
