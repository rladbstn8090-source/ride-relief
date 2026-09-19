import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {Model} from '../types';
export function createPreview(container:HTMLElement){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e9ede7');
 const camera=new THREE.PerspectiveCamera(37,1,.1,3000);camera.up.set(0,0,1);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor('#e9ede7');container.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D 모형: 드래그하여 회전, 스크롤하여 확대');
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=50;controls.maxDistance=700;
 scene.add(new THREE.HemisphereLight('#ffffff','#71806b',2.7));const sun=new THREE.DirectionalLight('#ffffff',3.3);sun.position.set(-80,-120,220);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-200;sun.shadow.camera.right=200;sun.shadow.camera.top=200;sun.shadow.camera.bottom=-200;sun.shadow.normalBias=.3;scene.add(sun);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.ShadowMaterial({opacity:.13}));floor.position.z=-.1;floor.receiveShadow=true;scene.add(floor);
 let group=new THREE.Group();scene.add(group);let current:Model|undefined;
 const resize=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe(container);
 renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
 const reset=()=>{if(!current)return;const size=Math.max(current.width,current.depth);camera.position.set(size*1.08,-size*1.45,size*1.4);controls.target.set(0,0,current.height*.25);controls.update();};
 const clear=()=>{for(const child of [...group.children]){const mesh=child as THREE.Mesh;mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}scene.remove(group);group=new THREE.Group();scene.add(group);current=undefined;};
 return {show(model:Model){clear();for(const part of model.parts){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(part.mesh.vertices,3));geometry.setIndex(new THREE.BufferAttribute(part.mesh.triangles,1));geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:part.color,roughness:.85,metalness:0,flatShading:true,polygonOffset:true,polygonOffsetFactor:part.name==='Route'?-3:part.name==='Water'?-1:0}));mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}group.position.set(-model.width/2,-model.depth/2,0);current=model;reset();},clear,reset};
}
