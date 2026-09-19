export type Point = [number, number]; // latitude, longitude; GPX adapters return this format.
export interface Bounds { south: number; west: number; north: number; east: number }
export interface SelectionArea { kind: 'rectangle' | 'circle' | 'polygon'; points: Point[] }
export interface Feature { id: string; kind: 'building' | 'water' | 'park'; rings: Point[][]; height?: number }
export interface Landscape { bounds: Bounds; resolution: number; elevations: number[]; features: Feature[]; source: string; detail?: 'detailed' | 'overview' }
export interface Settings { width: number; exaggeration: number; buildingExaggeration: number; routeWidth: number; buildings: boolean; parks: boolean; water: boolean; route: boolean }
export interface MeshData { vertices: Float32Array; triangles: Uint32Array }
export interface Part { name: string; color: string; mesh: MeshData }
export interface Model { parts: Part[]; width: number; depth: number; height: number; triangles: number; source: string }
