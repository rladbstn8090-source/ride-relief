import type { Bounds, Point } from '../types';
export const JINJU_BOUNDS: Bounds = { south: 35.165, west: 128.020, north: 35.202, east: 128.095 };
// Hand-drawn design route, not a recorded or road-snapped ride.
export const JINJU_ROUTE: Point[] = [
 [35.1870,128.0804],[35.1860,128.0772],[35.1844,128.0740],[35.1820,128.0708],
 [35.1807,128.0660],[35.1805,128.0600],[35.1794,128.0540],[35.1770,128.0485],
 [35.1738,128.0420],[35.1733,128.0365],[35.1760,128.0320],[35.1790,128.0305],
 [35.1812,128.0300],[35.1830,128.0290],[35.1827,128.0330],[35.1796,128.0350],
 [35.1775,128.0380],[35.1774,128.0425],[35.1798,128.0470],[35.1825,128.0520],
 [35.1840,128.0580],[35.1842,128.0640],[35.1847,128.0690],[35.1871,128.0730],
 [35.1890,128.0770],[35.1892,128.0800],[35.1870,128.0804]
];
export function distanceKm(route: Point[]) { let sum=0; for(let i=1;i<route.length;i++){ const [a,b]=route[i-1], [c,d]=route[i]; const r=Math.PI/180; const h=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2; sum+=6371*2*Math.asin(Math.sqrt(h)); } return sum; }
