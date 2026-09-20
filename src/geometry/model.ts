import type { Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d';
import type { Bounds, Landscape, MeshData, Model, Point, SelectionArea, Settings } from '../types';
export const ELEVATION_COLOR_THRESHOLD = 200;
export const LOW_TERRAIN_COLOR = '#c9dda2';
export const HIGH_TERRAIN_COLOR = '#4f7f45';
export function dimensions(bounds:Bounds,longestSide:number){const metersWide=(bounds.east-bounds.west)*111320*Math.cos((bounds.south+bounds.north)*Math.PI/360);const metersDeep=(bounds.north-bounds.south)*111320;const scale=longestSide/Math.max(metersWide,metersDeep);return {width:metersWide*scale,depth:metersDeep*scale,scale};}
export function coastalOceanCells(elevations:number[],n:number){const candidate=new Uint8Array(n*n),result=new Uint8Array(n*n);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*(n+1)+x,corners=[elevations[i],elevations[i+1],elevations[i+n+1],elevations[i+n+2]];if(corners.filter(value=>value<=0).length>=3||corners.reduce((sum,value)=>sum+value,0)/4<-.5)candidate[y*n+x]=1;}const seen=new Uint8Array(candidate.length),minimum=Math.max(3,Math.ceil(n*n*.0015));for(let i=0;i<candidate.length;i++)if(candidate[i]&&!seen[i]){const group=[i];let edge=false;seen[i]=1;for(let k=0;k<group.length;k++){const cell=group[k],x=cell%n,y=Math.floor(cell/n);if(x===0||y===0||x===n-1||y===n-1)edge=true;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*n+xx;if(xx>=0&&yy>=0&&xx<n&&yy<n&&candidate[j]&&!seen[j]){seen[j]=1;group.push(j);}}}if(edge&&group.length>=minimum)group.forEach(cell=>result[cell]=1);}return result;}
export function meshOf(solid:Manifold):MeshData {if(solid.status()!=='NoError')throw Error(`Mesh: ${solid.status()}`);const m=solid.getMesh(); const vertices=new Float32Array(m.numVert*3);for(let i=0;i<m.numVert;i++)vertices.set(m.vertProperties.subarray(i*m.numProp,i*m.numProp+3),i*3);return {vertices,triangles:new Uint32Array(m.triVerts)};}
export function fromMesh(api:ManifoldToplevel,m:MeshData){const mesh=new api.Mesh({numProp:3,vertProperties:m.vertices,triVerts:m.triangles});mesh.merge();return new api.Manifold(mesh);}
export function generateModel(api:ManifoldToplevel,data:Landscape,bounds:Bounds,route:Point[],settings:Settings,area?:SelectionArea):Model {
 if(route.length<2)throw Error('코스를 두 점 이상 그려 주세요.');
 const {width,depth,scale}=dimensions(bounds,settings.width);
 if(!Number.isFinite(depth)||Math.min(width,depth)<12||Math.max(width,depth)>240)throw Error('선택 범위가 너무 가늘거나 출력 크기가 너무 큽니다. 범위를 조금 조정해 주세요.');
 const objects:{delete():void}[]=[]; const keep=<T extends {delete():void}>(x:T):T=>{objects.push(x);return x;};
 try{
 const n=Math.min(320,Math.max(96,data.resolution));const sampled:number[]=[];
 function sample(lat:number,lon:number){const r=data.resolution;const fx=Math.max(0,Math.min(r,(lon-data.bounds.west)/(data.bounds.east-data.bounds.west)*r)),fy=Math.max(0,Math.min(r,(lat-data.bounds.south)/(data.bounds.north-data.bounds.south)*r));const x=Math.min(r-1,Math.floor(fx)),y=Math.min(r-1,Math.floor(fy)),u=fx-x,v=fy-y;const at=(a:number,b:number)=>data.elevations[b*(r+1)+a];return at(x,y)*(1-u)*(1-v)+at(x+1,y)*u*(1-v)+at(x,y+1)*(1-u)*v+at(x+1,y+1)*u*v;}
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)sampled.push(sample(bounds.south+(bounds.north-bounds.south)*y/n,bounds.west+(bounds.east-bounds.west)*x/n));
 // Terrarium tiles include negative bathymetry. Treat it as sea, and keep the
 // printable terrain surface at sea level instead of turning ocean depth into mountains.
 const seaCells=coastalOceanCells(sampled,n),hasSea=seaCells.some(Boolean);const raw=sampled.map(value=>Math.max(0,value));
 const min=Math.min(...raw);const vertices:number[]=[]; const tri:number[]=[];
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)vertices.push(x/n*width,y/n*depth,3+(raw[y*(n+1)+x]-min)*scale*settings.exaggeration);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x,b=a+1,c=a+n+1,d=c+1;tri.push(a,b,d,a,d,c);}
 const border:number[]=[];for(let x=0;x<=n;x++)border.push(x);for(let y=1;y<=n;y++)border.push(y*(n+1)+n);for(let x=n-1;x>=0;x--)border.push(n*(n+1)+x);for(let y=n-1;y>0;y--)border.push(y*(n+1));
 const bottoms=border.map(i=>{const index=vertices.length/3;vertices.push(vertices[i*3],vertices[i*3+1],0);return index;});const center=vertices.length/3;vertices.push(width/2,depth/2,0);
 for(let i=0;i<border.length;i++){const j=(i+1)%border.length;tri.push(border[i],bottoms[i],bottoms[j],border[i],bottoms[j],border[j],center,bottoms[j],bottoms[i]);}
 const maxZ=Math.max(...vertices.filter((_,i)=>i%3===2))+15;
 const project=(p:Point):Vec2=>[(p[1]-bounds.west)/(bounds.east-bounds.west)*width,(p[0]-bounds.south)/(bounds.north-bounds.south)*depth];
 const cropPoints=area?.points?.length&&area.points.length>=3?area.points:[[bounds.south,bounds.west],[bounds.south,bounds.east],[bounds.north,bounds.east],[bounds.north,bounds.west]] as Point[];
 const cropSection=keep(new api.CrossSection([cropPoints.map(project)],'EvenOdd'));
 const baseTerrain=keep(fromMesh(api,{vertices:new Float32Array(vertices),triangles:new Uint32Array(tri)}));
 const cropPrism=keep(cropSection.extrude(maxZ));
 const terrain=keep(baseTerrain.intersect(cropPrism));
 if(terrain.isEmpty())throw Error('선택한 출력 영역이 비어 있습니다. 범위를 다시 선택해 주세요.');
 const parts:Model['parts']=[];const maxElevation=Math.max(...raw);
 if(maxElevation<=ELEVATION_COLOR_THRESHOLD){parts.push({name:'Terrain 0-200m',color:LOW_TERRAIN_COLOR,mesh:meshOf(terrain)});}
 else if(min>=ELEVATION_COLOR_THRESHOLD){parts.push({name:'Terrain Above 200m',color:HIGH_TERRAIN_COLOR,mesh:meshOf(terrain)});}
 else {const thresholdZ=3+(ELEVATION_COLOR_THRESHOLD-min)*scale*settings.exaggeration;const lowVolume=keep(cropSection.extrude(thresholdZ));const lowTerrain=keep(terrain.intersect(lowVolume));const highTerrain=keep(terrain.subtract(lowVolume));if(!lowTerrain.isEmpty())parts.push({name:'Terrain 0-200m',color:LOW_TERRAIN_COLOR,mesh:meshOf(lowTerrain)});if(!highTerrain.isEmpty())parts.push({name:'Terrain Above 200m',color:HIGH_TERRAIN_COLOR,mesh:meshOf(highTerrain)});}
 const features=data.features;
 if(settings.parks!==false){const sections=[];for(const feature of features.filter(f=>f.kind==='park')){const section=keep(new api.CrossSection(feature.rings.map(r=>r.map(project)),'EvenOdd'));if(section.area()>=.08)sections.push(section);}if(sections.length){const union=keep(api.CrossSection.union(sections));const clipped=keep(union.intersect(cropSection));const prism=keep(clipped.extrude(maxZ));const raised=keep(terrain.translate([0,0,.28]));const parks=keep(prism.intersect(raised));if(!parks.isEmpty())parts.push({name:'Parks',color:'#7f9f69',mesh:meshOf(parks)});}}
 if(settings.water){const waterSolids:Manifold[]=[];const sections=[];for(const feature of features.filter(f=>f.kind==='water')){const section=keep(new api.CrossSection(feature.rings.map(r=>r.map(project)),'EvenOdd'));sections.push(section);}if(sections.length){const union=keep(api.CrossSection.union(sections));const clipped=keep(union.intersect(cropSection));const prism=keep(clipped.extrude(maxZ));const raised=keep(terrain.translate([0,0,.45]));const inlandWater=keep(prism.intersect(raised));if(!inlandWater.isEmpty())waterSolids.push(inlandWater);}
 if(hasSea){const seaSections=[];const cellWidth=width/n,cellDepth=depth/n;for(let y=0;y<n;y++){let start=-1;for(let x=0;x<=n;x++){const ocean=x<n&&Boolean(seaCells[y*n+x]);if(ocean&&start<0)start=x;if((!ocean||x===n)&&start>=0){const end=x;const strip=keep(api.CrossSection.square([(end-start)*cellWidth,cellDepth]).translate([start*cellWidth,y*cellDepth]));seaSections.push(strip);start=-1;}}}
  if(seaSections.length){const seaShape=keep(api.CrossSection.union(seaSections));const seaLevel=3.45;const sea=keep(seaShape.extrude(seaLevel));if(!sea.isEmpty())waterSolids.push(sea);}}
 if(waterSolids.length){const water=waterSolids.length===1?waterSolids[0]:keep(api.Manifold.union(waterSolids));parts.push({name:'Water',color:'#74b7c9',mesh:meshOf(water)});}}
 if(settings.buildings){const solids:Manifold[]=[];const buildingFactor=Number.isFinite(settings.buildingExaggeration)?Math.max(1,settings.buildingExaggeration):1.5;for(const feature of features.filter(f=>f.kind==='building')){const ring=feature.rings[0];if(!ring.some(p=>p[0]>=bounds.south&&p[0]<=bounds.north&&p[1]>=bounds.west&&p[1]<=bounds.east))continue;const projectedRings=feature.rings.map(r=>r.map(project));const outer=projectedRings[0];const xs=outer.map(p=>p[0]),ys=outer.map(p=>p[1]);if((Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys))<.12)continue;const section=keep(new api.CrossSection(projectedRings,'EvenOdd'));const clipped=keep(section.intersect(cropSection));if(clipped.area()<.12)continue;const roof=3+(Math.max(...ring.map(p=>sample(...p)))-min)*scale*settings.exaggeration+Math.max(.8,(feature.height??9)*scale*buildingFactor);const solid=keep(clipped.extrude(roof));solids.push(solid);}
 if(solids.length){const buildings=keep(api.Manifold.union(solids));parts.push({name:'Buildings',color:'#e9e5db',mesh:meshOf(buildings)});}}
 if(settings.route){const sections=[];const radius=settings.routeWidth/2;const points=route.map(project);
 for(let i=0;i<points.length;i++){const p=points[i];const circle=keep(api.CrossSection.circle(radius,12));sections.push(keep(circle.translate(p)));if(i===0)continue;const a=points[i-1],dx=p[0]-a[0],dy=p[1]-a[1],len=Math.hypot(dx,dy);if(len<1e-6)continue;const nx=-dy/len*radius,ny=dx/len*radius;sections.push(keep(new api.CrossSection([[[a[0]+nx,a[1]+ny],[a[0]-nx,a[1]-ny],[p[0]-nx,p[1]-ny],[p[0]+nx,p[1]+ny]]])));}
 const union=keep(api.CrossSection.union(sections));const clipped=keep(union.intersect(cropSection));const prism=keep(clipped.extrude(maxZ));const raised=keep(terrain.translate([0,0,1.2]));const path=keep(prism.intersect(raised));if(path.isEmpty())throw Error('선택한 영역에 코스가 없습니다. 영역을 넓혀 주세요.');parts.push({name:'Route',color:'#e56542',mesh:meshOf(path)});}
 let height=0;for(const part of parts)for(let i=2;i<part.mesh.vertices.length;i+=3)height=Math.max(height,part.mesh.vertices[i]);
 return {parts,width,depth,height,triangles:parts.reduce((s,p)=>s+p.mesh.triangles.length/3,0),source:data.source};
 }finally{for(const obj of objects.reverse())obj.delete();}
}
export function fusedMesh(api:ManifoldToplevel,model:Model):MeshData {const solids=model.parts.map(p=>fromMesh(api,p.mesh));let union:Manifold|undefined;try{union=api.Manifold.union(solids);if(union.status()!=='NoError'||union.volume()<=0)throw Error('출력 모델을 합치지 못했습니다.');return meshOf(union);}finally{union?.delete();solids.forEach(s=>s.delete());}}
export function partitionParts(api:ManifoldToplevel,model:Model){const solids=model.parts.map(p=>fromMesh(api,p.mesh));const result:Model['parts']=[];try{for(let i=0;i<solids.length;i++){let part=solids[i];let cut:Manifold|undefined;if(i<solids.length-1){cut=api.Manifold.union(solids.slice(i+1));part=solids[i].subtract(cut);}if(!part.isEmpty())result.push({...model.parts[i],mesh:meshOf(part)});if(part!==solids[i])part.delete();cut?.delete();}return result;}finally{solids.forEach(s=>s.delete());}}
