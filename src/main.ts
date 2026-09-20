import L from 'leaflet';
import QRCode from 'qrcode';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { distanceKm } from './data/jinju';
import { SOUTH_KOREA_BOUNDS } from './data/korea';
import { localPlaceMatches, parseNominatimResults, QUICK_PLACES, type PlaceResult } from './data/place-search';
import { contains, loadJinju, loadKoreaOverview, loadRemote } from './data/providers';
import { decodeSavedRoutes, encodeSavedRoutes, SAVED_ROUTES_KEY, type SavedRoute } from './data/saved-routes';
import { areaBounds, circleArea, cloneArea, polygonSelfIntersects, rectangleArea } from './data/selection-area';
import { dimensions } from './geometry/model';
import { createRouteImport } from './ui/route-import';
import { createPreview } from './ui/preview';
import type { Bounds, Landscape, Model, Point, SelectionArea, Settings } from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="./" aria-label="Ride Relief 홈"><span class="brand-symbol">↗</span>ride<span>relief</span><small>ROUTE TO OBJECT</small></a><div class="header-right"><span class="local">LOCAL STUDIO</span><button id="open-share" class="quiet">QR · 실행</button><button id="open-saves" class="quiet">저장 · 불러오기</button><button id="import-route" class="quiet">사진 · GPX 가져오기</button></div></header>
<main><div class="page-title"><div><span class="eyebrow">YOUR RIDE, IN A NEW DIMENSION</span><h1>달린 길을, 손에 담다.</h1></div><p>남한 어디서든 출발과 도착을 정하고<br>나만의 입체 지도를 만드세요.</p></div>
<div class="studio"><section class="workbench"><div class="panel map-panel"><div class="panel-head"><div><span class="step">01</span><h2>코스와 범위</h2></div><span class="meta">SOUTH KOREA</span></div><div class="map-wrap"><div id="map" aria-label="코스 편집 지도"></div><div class="map-toolbar" role="group" aria-label="지도 도구"><button id="open-place-search" class="place-search-trigger">⌕ 지역 찾기</button><button id="move">이동</button><button id="draw" class="active">＋ 출발·도착 그리기</button><select id="area-shape" aria-label="출력 범위 모양"><option value="rectangle">직사각형</option><option value="circle">원</option><option value="polygon">자유 영역</option></select><button id="area">▣ 범위 선택</button><button id="finish-area" hidden>영역 완성</button></div><div class="map-caption" id="map-caption">첫 번째 클릭이 출발점, 마지막 클릭이 도착점입니다</div></div><div class="map-footer"><span><i class="route-line"></i><b id="distance">0.0</b> km <span class="muted">· <span id="points">0</span>개 지점</span></span><div><button id="undo" class="text-button">한 점 취소</button><button id="clear" class="text-button">코스·범위 초기화</button><button id="fit" class="text-button">코스 맞춤</button></div></div></div>
<div class="panel preview-panel"><div class="panel-head"><div><span class="step">02</span><h2>3D 미리보기</h2></div><button id="camera" class="text-button">시점 초기화 ⤢</button></div><div id="preview"><div class="preview-label"><span class="micro">MY ROUTE / LIVE</span><strong>나의 코스</strong></div><div id="preview-empty" class="preview-empty">출발·도착과 출력 범위를 정하면<br>선택한 부분의 3D 모형이 만들어집니다.</div><div class="preview-hint">드래그하여 회전 · 스크롤하여 확대</div><div class="compass">N ↑</div></div><div class="preview-footer"><span id="model-size">코스와 범위를 기다리는 중</span><span id="mesh-info">LIVE PREVIEW</span></div></div></section>
<aside><div class="settings-head"><span class="step">03</span><h2>나만의 모형</h2></div><section class="control-section"><h3>출력 크기 <span>01 / SIZE</span></h3><label class="range-label" for="width">가장 긴 변 <output id="width-value">180 mm</output></label><input id="width" type="range" min="100" max="220" step="10" value="180"><div class="range-ends"><span>100 mm</span><span>220 mm</span></div><p class="helper" id="depth">범위를 선택하면 출력 비율이 계산됩니다.</p></section>
<section class="control-section"><h3>지형과 코스 <span>02 / RELIEF</span></h3><label class="range-label" for="exaggeration">지형 높이 강조 <output id="exaggeration-value">2.5×</output></label><input id="exaggeration" type="range" min="1" max="8" step=".5" value="2.5"><label class="range-label second" for="buildingExaggeration">건물 높이 강조 <output id="buildingExaggeration-value">1.5×</output></label><input id="buildingExaggeration" type="range" min="1" max="4" step=".5" value="1.5"><label class="range-label second" for="routeWidth">코스 선 두께 <output id="routeWidth-value">1.6 mm</output></label><input id="routeWidth" type="range" min=".8" max="4" step=".2" value="1.6"></section>
	<section class="control-section"><h3>레이어 <span>03 / LAYERS</span></h3><div class="layer"><span><span class="terrain-swatches"><i style="background:#c9dda2" title="해발 200m 이하"></i><i style="background:#4f7f45" title="해발 200m 초과"></i></span>지형 · 해발 200m 기준</span><span class="fixed">항상 표시</span></div><label class="layer"><span><i style="background:#e56542"></i>운동 코스</span><input id="route" type="checkbox" role="switch" checked></label><label class="layer"><span><i style="background:#e9e5db"></i>건물</span><input id="buildings" type="checkbox" role="switch" checked></label><label class="layer"><span><i style="background:#c9dda2"></i>공원 · 녹지</span><input id="parks" type="checkbox" role="switch" checked></label><label class="layer"><span><i style="background:#74b7c9"></i>강 · 호수 · 바다</span><input id="water" type="checkbox" role="switch" checked></label></section>
<div class="generate-area"><div class="live-preview-label"><i></i>자동 미리보기</div><button id="generate" class="primary" disabled>3D 미리보기 새로고침 <span>↗</span></button><p id="status" role="status" aria-live="polite">남한 지도를 준비하고 있습니다.</p></div><div class="export-area"><span class="eyebrow">READY FOR YOUR PRINTER</span><div class="export-buttons"><button id="stl" disabled>↓ STL <small>단색 출력</small></button><button id="3mf" disabled>↓ 3MF <small>레이어별 색상</small></button></div><p class="helper">Bambu Studio에서 mm 단위로 열어 주세요.<br>3MF는 부품별 필라멘트를 지정할 수 있습니다.</p></div></aside></div>
	<footer><span id="source">대한민국 지형 데이터 확인 중</span><span>3 mm 받침대 · 코스 돌출 1.2 mm</span></footer><details class="notes"><summary>데이터와 출력 안내</summary><p>처음에는 빈 남한 전체 지도가 열립니다. 출발·도착 그리기에서 첫 클릭은 출발점, 마지막 클릭은 도착점이며 중간 클릭은 경유점입니다. 각 점은 직선으로 연결되며 도로 자동 탐색은 하지 않습니다.</p><p>범위 선택에서 직사각형·원·자유 영역을 고를 수 있습니다. 선택 외곽선 그대로 지형 받침대와 모든 레이어가 잘립니다. 짧은 도시런부터 마라톤·자전거 종주까지 범위 크기에 맞춰 192×192~320×320 지형 셀과 최고 해상도의 지도 타일을 자동 선택합니다. 넓은 범위도 48×48 간략 모드로 낮추지 않으며 처리 중 진행 상황을 표시합니다.</p><p>지형은 실제 해발 200m를 기준으로 나뉩니다. 200m 이하는 연두색, 초과 구간은 초록색이며 3MF에서 각각 별도 부품으로 저장됩니다. STL은 두 지형 부품을 포함한 모든 레이어를 하나의 닫힌 입체로 합치며 파일 규격상 색상은 담지 않습니다. 실제 출력 전 슬라이서에서 크기와 레이어를 확인하세요.</p><p>Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors (ODbL)</a> · Elevation © <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Mapzen / source attribution</a>. 배경 지도와 도시 상세 지물에는 인터넷이 필요합니다. 새 영역은 남한 종주 범위를 포함해 가로·세로 750 km까지 선택할 수 있습니다.</p></details></main>
<dialog id="saved-dialog" class="saved-dialog" aria-labelledby="saved-title"><div class="saved-heading"><div><span class="eyebrow">LOCAL ROUTE LIBRARY</span><h2 id="saved-title">저장한 코스</h2></div><button id="close-saves" aria-label="닫기">✕</button></div><p>코스, 출력 범위와 현재 모형 설정을 이 Mac의 브라우저에 저장합니다.</p><div class="save-current"><input id="save-name" maxlength="40" placeholder="코스 이름"><button id="save-current" class="primary">현재 코스 저장</button></div><p id="save-message" role="status" aria-live="polite"></p><div id="saved-list" class="saved-list"></div></dialog>
<dialog id="share-dialog" class="share-dialog" aria-labelledby="share-title"><div class="saved-heading"><div><span class="eyebrow">RUN ANYWHERE</span><h2 id="share-title">QR · GitHub · VS Code 실행</h2></div><button id="close-share" aria-label="닫기">✕</button></div><div class="share-grid"><div class="qr-card"><canvas id="share-qr" width="240" height="240" aria-label="현재 Ride Relief 주소 QR 코드"></canvas><label for="share-url">QR에 넣을 주소</label><input id="share-url" type="url"><div><button id="refresh-qr">QR 새로 만들기</button><button id="copy-share-url">주소 복사</button></div><p id="share-message" role="status"></p></div><div class="run-guide"><h3>휴대폰</h3><p>같은 와이파이에서 <b>Start Ride Relief - QR.command</b>를 실행하면 Mac의 접속 주소로 열립니다. 그 화면의 QR을 휴대폰으로 스캔하세요.</p><h3>VS Code</h3><p>프로젝트를 열고 <b>터미널 → 작업 실행 → Ride Relief: 실행</b>을 선택하세요. 네트워크 실행 작업도 준비되어 있습니다.</p><h3>GitHub Pages</h3><p>이 폴더를 GitHub 저장소에 올리면 포함된 Actions 설정이 자동으로 빌드합니다. 저장소 설정에서 Pages 소스를 <b>GitHub Actions</b>로 선택하세요.</p></div></div></dialog>
<dialog id="place-dialog" class="place-dialog" aria-labelledby="place-title"><div class="saved-heading"><div><span class="eyebrow">FIND A PLACE</span><h2 id="place-title">어디로 이동할까요?</h2></div><button id="close-place-search" aria-label="닫기">✕</button></div><p>도시를 누르거나 동네·관광지·주소를 검색하면 지도에서 바로 확대합니다.</p><div id="quick-places" class="quick-places"></div><form id="place-form" class="place-form"><input id="place-query" autocomplete="off" maxlength="100" placeholder="예: 부산 태종대, 진주성, 광안리"><button class="primary">검색</button></form><p id="place-message" role="status" aria-live="polite">검색은 버튼을 누를 때 한 번만 실행됩니다.</p><div id="place-results" class="place-results"></div><small class="geocoder-credit">검색 결과 © OpenStreetMap contributors · Nominatim</small></dialog>`;

let routeLabel = '직접 그린 코스';
let route: Point[] = [];
let bounds: Bounds | undefined;
let area: SelectionArea | undefined;
let data: Landscape | undefined;
let jinjuData: Landscape | undefined;
const remoteDataCache: Landscape[] = [];
let model: Model | undefined;
let busy = false;
let dirty = true;
let mode = 'draw';
let corner: Point | undefined;
let areaPoints: Point[] = [];
let revision = 0;
let autoPreviewTimer = 0;
let generationController: AbortController | undefined;

const worker = new Worker(new URL('./geometry/worker.ts', import.meta.url), { type: 'module' });
let requestId = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
worker.onmessage = (event) => {
  const request = pending.get(event.data.id);
  if (!request) return;
  pending.delete(event.data.id);
  event.data.error ? request.reject(Error(event.data.error)) : request.resolve(event.data.result);
};
worker.onerror = () => {
  pending.forEach((request) => request.reject(Error('3D 엔진을 실행하지 못했습니다. 페이지를 새로고침해 주세요.')));
  pending.clear();
};
function job(type: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}

const map = L.map('map', { zoomControl: false }).fitBounds([[SOUTH_KOREA_BOUNDS.south, SOUTH_KOREA_BOUNDS.west], [SOUTH_KOREA_BOUNDS.north, SOUTH_KOREA_BOUNDS.east]], { padding: [18, 18] });
L.control.zoom({ position: 'bottomleft' }).addTo(map);
new ResizeObserver(() => map.invalidateSize()).observe($('map'));
const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
let tileFailures = 0;
tileLayer.on('tileerror', () => {
  if (++tileFailures === 3) $('map-caption').textContent = '배경 지도 연결을 확인해 주세요 · 지형 생성은 계속 사용할 수 있습니다';
});
const path = L.polyline(route, { color: '#df6241', weight: 4, opacity: 1 }).addTo(map);
const markers = L.layerGroup().addTo(map);
const featureLayer = L.layerGroup().addTo(map);
let areaLayer: L.Polygon | undefined;
let draftAreaLayer: L.Polyline | L.Polygon | undefined;

let preview: ReturnType<typeof createPreview> | undefined;
try {
  preview = createPreview($('preview'));
} catch {
  $('preview').insertAdjacentHTML('beforeend', '<p class="webgl-error">3D 미리보기에는 WebGL 지원이 필요합니다. 파일 생성과 내보내기는 계속 사용할 수 있습니다.</p>');
}

function settings(): Settings {
  return {
    width: +$<HTMLInputElement>('width').value,
    exaggeration: +$<HTMLInputElement>('exaggeration').value,
    buildingExaggeration: +$<HTMLInputElement>('buildingExaggeration').value,
    routeWidth: +$<HTMLInputElement>('routeWidth').value,
    buildings: $<HTMLInputElement>('buildings').checked,
    parks: $<HTMLInputElement>('parks').checked,
    water: $<HTMLInputElement>('water').checked,
    route: $<HTMLInputElement>('route').checked,
  };
}

let savedRoutes: SavedRoute[] = [];
try { savedRoutes = decodeSavedRoutes(localStorage.getItem(SAVED_ROUTES_KEY)); } catch { savedRoutes = []; }
const savedDialog = $<HTMLDialogElement>('saved-dialog');

function savedMessage(text: string, error = false) {
  $('save-message').textContent = text;
  $('save-message').classList.toggle('error', error);
}

function persistSavedRoutes() {
  try {
    localStorage.setItem(SAVED_ROUTES_KEY, encodeSavedRoutes(savedRoutes));
    return true;
  } catch {
    savedMessage('브라우저 저장 공간을 사용할 수 없습니다.', true);
    return false;
  }
}

function applySavedSettings(value: Settings) {
  for (const id of ['width', 'exaggeration', 'buildingExaggeration', 'routeWidth'] as const) {
    const input = $<HTMLInputElement>(id);
    const minimum = Number(input.min), maximum = Number(input.max);
    input.value = String(Math.max(minimum, Math.min(maximum, value[id])));
    $(`${id}-value`).textContent = id === 'exaggeration' || id === 'buildingExaggeration' ? `${input.value}×` : `${input.value} mm`;
  }
  for (const id of ['buildings', 'parks', 'water', 'route'] as const) $<HTMLInputElement>(id).checked = value[id];
}

function loadSavedRoute(saved: SavedRoute) {
  route = saved.route.map((point) => [...point] as Point);
  bounds = { ...saved.bounds };
  area = cloneArea(saved.area ?? rectangleArea(saved.bounds));
  routeLabel = saved.label;
  applySavedSettings(saved.settings);
  renderArea();
  updateRoute();
  map.fitBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]], { padding: [25, 25] });
  setMode('move');
  savedDialog.close();
  markDirty(50);
  status(`‘${saved.name}’ 코스와 범위를 불러왔습니다. 3D 미리보기를 다시 만듭니다.`);
}

function renderSavedRoutes() {
  const list = $('saved-list');
  list.replaceChildren();
  if (!savedRoutes.length) {
    const empty = document.createElement('p');
    empty.className = 'saved-empty';
    empty.textContent = '아직 저장한 코스가 없습니다.';
    list.append(empty);
    return;
  }
  for (const saved of savedRoutes) {
    const item = document.createElement('article');
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = saved.name;
    const detail = document.createElement('small');
    const date = new Date(saved.savedAt);
    detail.textContent = `${Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ko-KR')} · ${distanceKm(saved.route).toFixed(1)} km · ${saved.route.length}개 지점`;
    copy.append(title, detail);
    const actions = document.createElement('div');
    const load = document.createElement('button');
    load.textContent = '불러오기';
    load.onclick = () => loadSavedRoute(saved);
    const remove = document.createElement('button');
    remove.textContent = '삭제';
    remove.className = 'danger-text';
    remove.onclick = () => {
      savedRoutes = savedRoutes.filter((item) => item.id !== saved.id);
      if (persistSavedRoutes()) {
        renderSavedRoutes();
        savedMessage(`‘${saved.name}’을 삭제했습니다.`);
      }
    };
    actions.append(load, remove);
    item.append(copy, actions);
    list.append(item);
  }
}

$('open-saves').onclick = () => {
  $<HTMLInputElement>('save-name').value = routeLabel === '직접 그린 코스' ? '' : routeLabel;
  savedMessage(route.length >= 2 && bounds ? '현재 코스를 새 이름으로 저장하거나 목록에서 불러오세요.' : '저장하려면 먼저 코스와 범위를 정해 주세요.');
  renderSavedRoutes();
  savedDialog.showModal();
};
$('close-saves').onclick = () => savedDialog.close();
$('save-current').onclick = () => {
  if (route.length < 2 || !bounds) {
    savedMessage('코스와 출력 범위를 먼저 정해 주세요.', true);
    return;
  }
  const input = $<HTMLInputElement>('save-name');
  const name = input.value.trim() || `나의 코스 ${new Date().toLocaleDateString('ko-KR')}`;
  const previous = savedRoutes.find((item) => item.name === name);
  const saved: SavedRoute = {
    id: previous?.id ?? (globalThis.crypto?.randomUUID?.() ?? `route-${Date.now()}`),
    name,
    savedAt: new Date().toISOString(),
    label: routeLabel,
    route: route.map((point) => [...point] as Point),
    bounds: { ...bounds },
    area: cloneArea(area ?? rectangleArea(bounds)),
    settings: settings(),
  };
  savedRoutes = [saved, ...savedRoutes.filter((item) => item.id !== saved.id)].slice(0, 20);
  if (persistSavedRoutes()) {
    input.value = name;
    renderSavedRoutes();
    savedMessage(previous ? `‘${name}’을 최신 상태로 덮어썼습니다.` : `‘${name}’을 저장했습니다. 다음에 이 목록에서 다시 불러올 수 있습니다.`);
  }
};

const shareDialog = $<HTMLDialogElement>('share-dialog');
async function refreshShareQr() {
  const input = $<HTMLInputElement>('share-url');
  const message = $('share-message');
  try {
    const url = new URL(input.value);
    await QRCode.toCanvas($<HTMLCanvasElement>('share-qr'), url.href, { width: 240, margin: 1, color: { dark: '#214632', light: '#ffffff' } });
    message.textContent = ['127.0.0.1', 'localhost'].includes(url.hostname)
      ? '이 주소는 이 Mac에서만 열립니다. 휴대폰은 QR 실행 파일로 연 네트워크 주소를 사용하세요.'
      : '같은 와이파이의 휴대폰에서 이 QR을 스캔하세요.';
    message.classList.toggle('error', ['127.0.0.1', 'localhost'].includes(url.hostname));
  } catch {
    message.textContent = 'http:// 또는 https://로 시작하는 올바른 주소를 입력해 주세요.';
    message.classList.add('error');
  }
}
$('open-share').onclick = () => {
  $<HTMLInputElement>('share-url').value = location.href.split('#')[0];
  shareDialog.showModal();
  void refreshShareQr();
};
$('close-share').onclick = () => shareDialog.close();
$('refresh-qr').onclick = () => void refreshShareQr();
$('copy-share-url').onclick = async () => {
  try { await navigator.clipboard.writeText($<HTMLInputElement>('share-url').value); $('share-message').textContent = '주소를 복사했습니다.'; }
  catch { $<HTMLInputElement>('share-url').select(); $('share-message').textContent = '주소를 선택했습니다. Command+C로 복사하세요.'; }
};

function status(text: string, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}

function buttons() {
  for (const id of ['stl', '3mf']) $<HTMLButtonElement>(id).disabled = busy || dirty || !model;
  $<HTMLButtonElement>('generate').disabled = busy || !data || route.length < 2 || !bounds || !area;
  $('generate').innerHTML = busy ? '3D 미리보기 갱신 중…' : '3D 미리보기 새로고침 <span>↗</span>';
}

function resetPreview(message: string) {
  model = undefined;
  preview?.clear();
  $('preview-empty').hidden = false;
  $('preview-empty').innerHTML = message;
  $('model-size').textContent = '새 모형을 기다리는 중';
  $('mesh-info').textContent = 'LIVE PREVIEW';
}

function schedulePreview(delay = 450) {
  window.clearTimeout(autoPreviewTimer);
  if (!data || route.length < 2 || !bounds || !area) return;
  autoPreviewTimer = window.setTimeout(() => void generate(), delay);
}

function markDirty(delay = 450) {
  revision++;
  generationController?.abort();
  dirty = true;
  if (route.length < 2) {
    resetPreview('지도에서 출발점과 도착점을<br>차례로 클릭해 주세요.');
    status('출발점과 도착점을 정해 주세요.');
  } else if (!bounds) {
    resetPreview('코스가 준비되었습니다.<br>이제 3D로 만들 범위를 선택해 주세요.');
    status('원하는 모양을 고르고 범위 선택을 눌러 주세요.');
  } else {
    resetPreview('선택한 코스와 범위로<br>3D 미리보기를 만드는 중…');
    status('선택한 범위를 3D 미리보기에 반영하는 중…');
  }
  buttons();
  updateDimensions();
  schedulePreview(delay);
}

function updateDimensions() {
  if (!bounds) {
    $('depth').textContent = '범위를 선택하면 출력 비율이 계산됩니다.';
    return;
  }
  const size = dimensions(bounds, settings().width);
  $('depth').textContent = `선택 범위 ${size.width.toFixed(0)} × ${size.depth.toFixed(1)} mm · 받침대 3 mm`;
}

function updateRoute() {
  path.setLatLngs(route);
  markers.clearLayers();
  route.forEach((point, index) => {
    if (index !== 0 && index !== route.length - 1) return;
    L.circleMarker(point, {
      radius: 7,
      color: '#fff',
      weight: 3,
      fillColor: index === 0 ? '#284d3e' : '#df6241',
      fillOpacity: 1,
    }).addTo(markers).bindTooltip(index === 0 ? '출발' : '도착', { permanent: true, direction: 'top', offset: [0, -8] });
  });
  $('distance').textContent = distanceKm(route).toFixed(1);
  $('points').textContent = String(route.length);
}

function drawingCaption() {
  if (!route.length) return '지도 첫 클릭 = 출발점 · 다음 클릭 = 도착점';
  if (route.length === 1) return '출발점 지정됨 · 다음 위치를 클릭하면 도착점';
  return '마지막 점이 도착점입니다 · 계속 클릭하면 경유점이 추가됩니다';
}

const areaShapeName = () => ({ rectangle: '직사각형', circle: '원', polygon: '자유 영역' }[$<HTMLSelectElement>('area-shape').value] ?? '출력 범위');

function areaCaption() {
  const shape = $<HTMLSelectElement>('area-shape').value;
  if (shape === 'circle') return corner ? '원의 가장자리를 클릭하세요' : '원의 중심을 클릭하세요';
  if (shape === 'polygon') return areaPoints.length < 3 ? `자유 영역 꼭짓점을 클릭하세요 · 현재 ${areaPoints.length}개` : `꼭짓점을 더 찍거나 ‘영역 완성’을 누르세요 · 현재 ${areaPoints.length}개`;
  return corner ? '직사각형의 반대쪽 모서리를 클릭하세요' : '직사각형의 첫 모서리를 클릭하세요';
}

function renderArea() {
  areaLayer?.remove();
  areaLayer = undefined;
  if (!area) return;
  areaLayer = L.polygon(area.points, { color: '#284d3e', weight: 2, dashArray: '7 5', fillOpacity: .035, interactive: false }).addTo(map);
  areaLayer.bringToFront();
  path.bringToFront();
}

function renderDraftArea() {
  draftAreaLayer?.remove();
  draftAreaLayer = undefined;
  if (!areaPoints.length) return;
  const options = { color: '#df6241', weight: 2, dashArray: '5 5', fillOpacity: .025, interactive: false };
  draftAreaLayer = areaPoints.length >= 3 ? L.polygon(areaPoints, options).addTo(map) : L.polyline(areaPoints, options).addTo(map);
}

function finalizeArea(nextArea: SelectionArea) {
  if (nextArea.kind === 'polygon' && polygonSelfIntersects(nextArea.points)) {
    status('자유 영역의 선이 서로 교차합니다. 한 점 취소 후 외곽선을 순서대로 다시 찍어 주세요.', true);
    return;
  }
  const nextBounds = areaBounds(nextArea);
  if (nextBounds.north - nextBounds.south < .001 || nextBounds.east - nextBounds.west < .001) {
    status('영역이 너무 작습니다. 조금 더 넓게 선택해 주세요.', true);
    return;
  }
  area = nextArea;
  bounds = nextBounds;
  renderArea();
  markDirty(50);
  setMode('move');
}

function setMode(next: string) {
  mode = next;
  corner = undefined;
  areaPoints = [];
  draftAreaLayer?.remove();
  draftAreaLayer = undefined;
  $<HTMLButtonElement>('finish-area').hidden = true;
  if (mode === 'draw' || mode === 'area') placeMarker.remove();
  for (const id of ['move', 'draw', 'area']) {
    $(id).classList.toggle('active', id === mode);
    $(id).setAttribute('aria-pressed', String(id === mode));
  }
  $('map').classList.toggle('crosshair', mode !== 'move');
  $('map-caption').textContent = mode === 'draw'
    ? drawingCaption()
    : mode === 'area'
      ? areaCaption()
      : routeLabel;
}

for (const id of ['move', 'draw', 'area']) $(id).onclick = () => setMode(id);
$<HTMLSelectElement>('area-shape').onchange = () => { if (mode === 'area') setMode('area'); };
$('finish-area').onclick = () => {
  if (mode !== 'area' || $<HTMLSelectElement>('area-shape').value !== 'polygon' || areaPoints.length < 3) return;
  finalizeArea({ kind: 'polygon', points: areaPoints.map(point => [...point] as Point) });
};

const placeDialog = $<HTMLDialogElement>('place-dialog');
const placeMarker = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 3, fillColor: '#2e6fa3', fillOpacity: 1 });
const PLACE_CACHE_KEY = 'ride-relief.place-search-cache.v1';
let lastPlaceRequest = 0;
let placeCache: Record<string, PlaceResult[]> = {};
try { placeCache = JSON.parse(localStorage.getItem(PLACE_CACHE_KEY) || '{}'); } catch { placeCache = {}; }

function placeMessage(text: string, error = false) {
  $('place-message').textContent = text;
  $('place-message').classList.toggle('error', error);
}

function moveToPlace(place: PlaceResult) {
  if (place.bounds && place.bounds.north - place.bounds.south < 2 && place.bounds.east - place.bounds.west < 2) {
    map.fitBounds([[place.bounds.south, place.bounds.west], [place.bounds.north, place.bounds.east]], { padding: [35, 35], maxZoom: 16 });
  } else map.setView(place.coordinate, 14);
  placeMarker.unbindTooltip();
  placeMarker.setLatLng(place.coordinate).addTo(map);
  setMode('move');
  placeDialog.close();
  $('map-caption').textContent = `${place.name} 위치로 이동했습니다 · 출발·도착 그리기를 눌러 코스를 시작하세요`;
}

function renderPlaceResults(results: PlaceResult[]) {
  const list = $('place-results');
  list.replaceChildren();
  for (const place of results) {
    const button = document.createElement('button');
    const title = document.createElement('strong');
    title.textContent = place.name;
    const detail = document.createElement('small');
    detail.textContent = place.subtitle;
    button.append(title, detail);
    button.onclick = () => moveToPlace(place);
    list.append(button);
  }
}

const koreaButton = document.createElement('button');
koreaButton.type = 'button';
koreaButton.textContent = '남한 전체';
koreaButton.onclick = () => {
  map.fitBounds([[SOUTH_KOREA_BOUNDS.south, SOUTH_KOREA_BOUNDS.west], [SOUTH_KOREA_BOUNDS.north, SOUTH_KOREA_BOUNDS.east]], { padding: [18, 18] });
  placeMarker.remove();
  setMode('move');
  placeDialog.close();
  $('map-caption').textContent = '남한 전체로 이동했습니다 · 지역 찾기에서 원하는 곳을 선택하세요';
};
$('quick-places').append(koreaButton);
for (const place of QUICK_PLACES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = place.name;
  button.onclick = () => moveToPlace({ name: place.name, subtitle: '빠른 지역 이동 · 로컬', coordinate: place.coordinate, source: 'local' });
  $('quick-places').append(button);
}

$('open-place-search').onclick = () => {
  $<HTMLInputElement>('place-query').value = '';
  $('place-results').replaceChildren();
  placeMessage('주요 도시는 인터넷 없이 바로 이동할 수 있습니다.');
  placeDialog.showModal();
  $<HTMLInputElement>('place-query').focus();
};
$('close-place-search').onclick = () => placeDialog.close();
$<HTMLFormElement>('place-form').onsubmit = async (event) => {
  event.preventDefault();
  const query = $<HTMLInputElement>('place-query').value.trim();
  if (!query) {
    placeMessage('찾을 지역이나 주소를 입력하세요.', true);
    return;
  }
  const local = localPlaceMatches(query);
  if (local.length) {
    renderPlaceResults(local);
    placeMessage(`${local.length}개 빠른 이동 결과를 찾았습니다.`);
    return;
  }
  if (placeCache[query]?.length) {
    renderPlaceResults(placeCache[query]);
    placeMessage(`${placeCache[query].length}개 저장된 검색 결과를 찾았습니다.`);
    return;
  }
  const submit = placeDialog.querySelector<HTMLButtonElement>('#place-form button')!;
  submit.disabled = true;
  placeMessage('OpenStreetMap에서 지역을 찾는 중…');
  try {
    const wait = Math.max(0, 1000 - (Date.now() - lastPlaceRequest));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastPlaceRequest = Date.now();
    const endpoint = localStorage.getItem('ride-relief.geocoder-endpoint') || 'https://nominatim.openstreetmap.org/search';
    const url = new URL(endpoint);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('countrycodes', 'kr');
    url.searchParams.set('limit', '5');
    url.searchParams.set('accept-language', 'ko');
    const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!response.ok) throw Error('검색 서버가 응답하지 않습니다.');
    const results = parseNominatimResults(await response.json());
    if (!results.length) {
      renderPlaceResults([]);
      placeMessage('검색 결과가 없습니다. 지역 이름이나 주소를 조금 다르게 입력해 보세요.', true);
      return;
    }
    placeCache[query] = results;
    const entries = Object.entries(placeCache).slice(-30);
    placeCache = Object.fromEntries(entries);
    try { localStorage.setItem(PLACE_CACHE_KEY, JSON.stringify(placeCache)); } catch { /* Search still works without cache. */ }
    renderPlaceResults(results);
    placeMessage(`${results.length}개 검색 결과를 찾았습니다.`);
  } catch {
    renderPlaceResults([]);
    placeMessage('온라인 검색에 연결하지 못했습니다. 위의 빠른 도시 버튼은 계속 사용할 수 있습니다.', true);
  } finally {
    submit.disabled = false;
  }
};

map.on('click', (event: L.LeafletMouseEvent) => {
  const point: Point = [event.latlng.lat, event.latlng.lng];
  if (mode === 'draw') {
    if (route.length >= 500) {
      status('코스는 최대 500개 지점까지 그릴 수 있습니다.', true);
      return;
    }
    placeMarker.remove();
    route.push(point);
    routeLabel = '직접 그린 코스';
    updateRoute();
    $('map-caption').textContent = drawingCaption();
    markDirty(650);
    return;
  }
  if (mode !== 'area') return;
  const shape = $<HTMLSelectElement>('area-shape').value;
  if (shape === 'polygon') {
    if (areaPoints.length >= 64) {
      status('자유 영역은 최대 64개 꼭짓점까지 사용할 수 있습니다.', true);
      return;
    }
    areaPoints.push(point);
    renderDraftArea();
    $<HTMLButtonElement>('finish-area').hidden = areaPoints.length < 3;
    $('map-caption').textContent = areaCaption();
    return;
  }
  if (!corner) {
    corner = point;
    areaPoints = [point];
    renderDraftArea();
    $('map-caption').textContent = areaCaption();
    return;
  }
  if (shape === 'circle') finalizeArea(circleArea(corner, point));
  else {
    const next: Bounds = { south: Math.min(corner[0], point[0]), north: Math.max(corner[0], point[0]), west: Math.min(corner[1], point[1]), east: Math.max(corner[1], point[1]) };
    finalizeArea(rectangleArea(next));
  }
});

$('undo').onclick = () => {
  if (mode === 'area' && $<HTMLSelectElement>('area-shape').value === 'polygon' && areaPoints.length) {
    areaPoints.pop();
    renderDraftArea();
    $<HTMLButtonElement>('finish-area').hidden = areaPoints.length < 3;
    $('map-caption').textContent = areaCaption();
    status('자유 영역의 마지막 꼭짓점을 취소했습니다.');
    return;
  }
  route.pop();
  updateRoute();
  markDirty();
  if (mode === 'draw') $('map-caption').textContent = drawingCaption();
};
$('clear').onclick = () => {
  route = [];
  bounds = undefined;
  area = undefined;
  placeMarker.remove();
  routeLabel = '직접 그린 코스';
  areaLayer?.remove();
  areaLayer = undefined;
  draftAreaLayer?.remove();
  draftAreaLayer = undefined;
  updateRoute();
  markDirty();
  setMode('draw');
};
$('fit').onclick = () => {
  if (route.length > 1) map.fitBounds(path.getBounds(), { padding: [40, 40] });
  else map.fitBounds([[SOUTH_KOREA_BOUNDS.south, SOUTH_KOREA_BOUNDS.west], [SOUTH_KOREA_BOUNDS.north, SOUTH_KOREA_BOUNDS.east]], { padding: [18, 18] });
};
$('camera').onclick = () => preview?.reset();

for (const id of ['width', 'exaggeration', 'buildingExaggeration', 'routeWidth']) {
  $<HTMLInputElement>(id).oninput = () => {
    const value = $<HTMLInputElement>(id).value;
    $(`${id}-value`).textContent = id === 'exaggeration' || id === 'buildingExaggeration' ? `${value}×` : `${value} mm`;
    markDirty(300);
  };
}
for (const id of ['buildings', 'parks', 'water', 'route']) $(id).onchange = () => markDirty(100);

function showFeatures() {
  featureLayer.clearLayers();
  if (!data) return;
  const buildings = data.features.filter((feature) => feature.kind === 'building');
  const mapFeatures = buildings.length > 3000
    ? [...data.features.filter((feature) => feature.kind !== 'building'), ...buildings.slice(0, 3000)]
    : data.features;
  for (const feature of mapFeatures) {
    L.polygon(feature.rings, {
      stroke: false,
      fillColor: feature.kind === 'water' ? '#74b7c9' : feature.kind === 'park' ? '#c9dda2' : '#777c69',
      fillOpacity: feature.kind === 'water' ? .4 : feature.kind === 'park' ? .3 : .2,
      interactive: false,
    }).addTo(featureLayer);
  }
  path.bringToFront();
  areaLayer?.bringToFront();
}

function cachedLandscape(selectedBounds: Bounds) {
  const closeEnough = (landscape: Landscape) => {
    if (!contains(landscape.bounds, selectedBounds)) return false;
    const latRatio = (landscape.bounds.north - landscape.bounds.south) / Math.max(1e-9, selectedBounds.north - selectedBounds.south);
    const lonRatio = (landscape.bounds.east - landscape.bounds.west) / Math.max(1e-9, selectedBounds.east - selectedBounds.west);
    return Math.max(latRatio, lonRatio) <= 1.25;
  };
  if (jinjuData && closeEnough(jinjuData)) return jinjuData;
  return remoteDataCache.find(closeEnough);
}

function generationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/timed out|timeout|signal timed out/i.test(message)) {
    return '고품질 지도 서버 연결 시간이 초과되었습니다. 잠시 뒤 3D 미리보기 새로고침을 눌러 다시 시도해 주세요.';
  }
  return message || '모형 생성에 실패했습니다.';
}

async function generate() {
  if (busy || !data || route.length < 2 || !bounds || !area) {
    if (busy && dirty) schedulePreview(350);
    return;
  }
  window.clearTimeout(autoPreviewTimer);
  busy = true;
  buttons();
  const version = revision;
  const controller = new AbortController();
  generationController = controller;
  const selectedBounds = { ...bounds };
  const selectedArea = cloneArea(area);
  const selectedRoute = route.map((point) => [...point] as Point);
  const selectedSettings = settings();
  try {
    let selectedData = cachedLandscape(selectedBounds);
    if (!selectedData) {
      status('범위 크기에 맞춘 고품질 지형과 지도 데이터를 준비하는 중…');
      try {
        selectedData = await loadRemote(selectedBounds, status, controller.signal);
        remoteDataCache.unshift(selectedData);
        remoteDataCache.splice(4);
      } catch (error) {
        if (controller.signal.aborted || !contains(SOUTH_KOREA_BOUNDS, selectedBounds)) throw error;
        status('외부 지도 서버를 사용할 수 없어 남한 로컬 고도를 고해상도로 만드는 중…');
        selectedData = await loadKoreaOverview(selectedBounds, controller.signal);
      }
    }
    if (!selectedData) throw Error('선택한 범위의 지형을 준비하지 못했습니다.');
    if (revision !== version) return;
    data = selectedData;
    showFeatures();
    status(`선택한 ${areaShapeName()} 범위를 고품질 3D 모형으로 만드는 중…`);
    const result = await job('generate', { data: selectedData, bounds: selectedBounds, area: selectedArea, route: selectedRoute, settings: selectedSettings }) as Model;
    if (revision !== version) return;
    model = result;
    preview?.show(result);
    $('preview-empty').hidden = true;
    dirty = false;
    $('model-size').textContent = `${result.width.toFixed(0)} × ${result.depth.toFixed(1)} × ${result.height.toFixed(1)} mm`;
    $('mesh-info').textContent = `${(result.triangles / 1000).toFixed(1)}K TRIANGLES`;
    $('source').textContent = selectedData.source;
    status('선택한 코스와 범위를 고품질 3D 미리보기에 반영했습니다.');
  } catch (error) {
    if (revision === version) {
      dirty = true;
      resetPreview('3D 미리보기를 만들지 못했습니다.<br>아래 안내를 확인해 주세요.');
      status(generationError(error), true);
    }
  } finally {
    if (generationController === controller) generationController = undefined;
    busy = false;
    buttons();
    if (dirty && revision !== version) schedulePreview(250);
  }
}

$('generate').onclick = generate;
for (const type of ['stl', '3mf']) {
  $(type).onclick = async () => {
    if (!model || busy || dirty) return;
    busy = true;
    buttons();
    status(type === 'stl' ? '닫힌 입체로 합쳐 STL을 만드는 중…' : '겹치지 않는 부품으로 3MF를 만드는 중…');
    try {
      const bytes = await job(type, model) as BlobPart;
      const blob = new Blob([bytes], { type: type === 'stl' ? 'model/stl' : 'model/3mf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ride-relief-${Math.round(model.width)}mm.${type}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      status(`${type.toUpperCase()} 파일을 저장했습니다.`);
    } catch (error) {
      status(error instanceof Error ? error.message : '내보내기에 실패했습니다.', true);
    } finally {
      busy = false;
      buttons();
    }
  };
}

updateRoute();
updateDimensions();
setMode('draw');
resetPreview('지도에서 출발점과 도착점을 정하고<br>3D로 만들 범위를 선택해 주세요.');
buttons();
loadJinju().then((landscape) => {
  jinjuData = landscape;
  data = landscape;
  showFeatures();
  $('source').textContent = '대한민국 실제 고도 · 남한 전역 로컬 지원';
  status('남한 지도가 준비되었습니다. 원하는 지역을 확대하고 출발점을 클릭해 주세요.');
  buttons();
}).catch((error) => status(String(error), true));

// Optional browser-agent integration. No effect in browsers without WebMCP.
const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: unknown) => void | Promise<void> } }).modelContext;
const lifecycle = new AbortController();
if (context?.registerTool) {
  const read = () => ({ busy, dirty, points: route.length, distanceKm: distanceKm(route), bounds: bounds ?? null, area: area ? { kind: area.kind, points: area.points.length } : null, settings: settings(), model: model ? { width: model.width, depth: model.depth, height: model.height, layers: model.parts.map((part) => part.name) } : null });
  for (const tool of [
    { name: 'read_route_model', description: 'Read the current route, output bounds, settings and generated model dimensions.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: read },
    { name: 'generate_route_model', description: 'Generate the 3D model from the current visible route and controls. Does not download files.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, async execute(input: unknown) { if (!input || typeof input !== 'object' || Object.keys(input).length) throw Error('Expected an empty object'); if (busy || !data || route.length < 2 || !bounds || !area) throw Error('Model is not ready for generation'); await generate(); if (dirty) throw Error($('status').textContent || 'Generation failed'); return read(); } },
  ]) {
    try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(console.warn); } catch (error) { console.warn(error); }
  }
}
window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });

const importer = createRouteImport((points, importedBounds, label) => {
  route = points;
  bounds = importedBounds;
  area = rectangleArea(importedBounds);
  routeLabel = label;
  renderArea();
  updateRoute();
  map.fitBounds([[importedBounds.south, importedBounds.west], [importedBounds.north, importedBounds.east]], { padding: [25, 25] });
  setMode('move');
  markDirty(50);
  status(`${label}와 범위를 적용했습니다. 선택 영역의 3D 미리보기를 생성합니다.`);
}, () => bounds ?? SOUTH_KOREA_BOUNDS);
$('import-route').onclick = () => { if (!busy) importer.open(); };

let dragDepth = 0;
document.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  dragDepth++;
  document.body.classList.add('route-drop-active');
});
document.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
document.addEventListener('dragleave', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  if (--dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove('route-drop-active');
  }
});
document.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('route-drop-active');
  const file = event.dataTransfer?.files[0];
  if (file && !busy) importer.open(file);
});
