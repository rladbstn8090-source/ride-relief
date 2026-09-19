import L from 'leaflet';
import { extractNaverRoute, extractRoute, georeference, type Calibration, type Pixel } from '../data/image-route';
import type { Bounds, Point } from '../types';

type EditTool = 'color' | 'crop' | 'trace';
type AlignStage = 'idle' | 'photo-a' | 'map-a' | 'photo-b' | 'map-b' | 'review';

export function createRouteImport(
  onImport: (points: Point[], bounds: Bounds, label: string) => void,
  initialBounds: () => Bounds,
) {
  const dialog = document.createElement('dialog');
  dialog.className = 'import-dialog';
  dialog.setAttribute('aria-labelledby', 'import-title');
  dialog.innerHTML = `
    <div class="import-heading">
      <div><span class="eyebrow">RUN / RIDE / WALK</span><h2 id="import-title">내 운동 코스 가져오기</h2></div>
      <button data-id="close" aria-label="닫기">✕</button>
    </div>
    <p>네이버 지도 길찾기나 나이키 런 클럽 등 운동 앱의 <b>지도가 보이는 스크린샷</b> 또는 GPX 파일을 선택하세요. 사진은 이 Mac 안에서만 분석합니다.</p>
    <label class="file-zone">사진 또는 GPX 선택<input data-id="file" type="file" accept="image/png,image/jpeg,image/webp,.gpx"></label>
    <p data-id="message" role="status" aria-live="polite">PNG · JPG · WebP · GPX / 최대 15 MB. 사진에서 실제 GPS 기록·페이스·시간은 복원하지 않습니다.</p>
    <div data-id="gpx" hidden><label>가져올 기록 구간 <select data-id="segment"></select></label></div>
    <div data-id="photo" hidden>
      <section class="import-step">
        <div class="import-step-title"><span>1</span><div><strong>사진에서 코스 찾기</strong><small data-id="detect-state">선 색상을 선택해 주세요</small></div></div>
        <div class="import-controls">
          <button data-id="naver" class="emphasis">네이버 파란 경로 자동 인식</button>
          <button data-tool="color">선 색상 선택</button>
          <button data-tool="crop">지도만 자르기</button>
          <label>색상 범위 <input data-id="tolerance" type="range" min="15" max="180" value="70"></label>
          <input data-id="color" type="color" value="#20cfd2" aria-label="코스 색상">
          <button data-id="analyze" class="emphasis">코스 분석</button>
          <button data-tool="trace">직접 따라 그리기</button>
          <button data-id="undo">한 점 취소</button>
        </div>
        <p class="import-help">네이버 길찾기 사진은 파란 경로를 자동으로 인식합니다. 다른 앱은 선 가운데를 클릭해 색상을 고른 뒤 코스 분석을 누르세요. 숫자나 아이콘이 선을 많이 가리면 직접 따라 그릴 수 있습니다.</p>
      </section>
      <div class="import-grid">
        <div>
          <h3>사진 속 코스</h3>
          <div class="canvas-wrap"><canvas data-id="canvas" aria-label="업로드한 사진과 추출 코스"></canvas><span data-id="canvas-action" hidden></span></div>
          <p data-id="photo-hint">코스 선의 가운데를 클릭해 색상을 선택하세요.</p>
        </div>
        <div>
          <h3>실제 지도</h3>
          <div data-id="map" class="calibration-map"></div>
          <div class="coordinate-jump">
            <label>위도<input data-id="lat" type="number" step="any" value="35.184"></label>
            <label>경도<input data-id="lon" type="number" step="any" value="128.057"></label>
            <button data-id="jump">이동</button>
          </div>
          <p>지도를 드래그하거나 위도·경도로 코스가 있는 도시까지 이동하세요.</p>
        </div>
      </div>
      <section class="import-step align-step">
        <div class="import-step-title"><span>2</span><div><strong>사진과 실제 지도 맞추기</strong><small>같은 장소 두 곳을 차례로 짝지으면 위치·크기·회전을 계산합니다</small></div></div>
        <div class="align-progress" data-id="align-progress">
          <span data-stage="photo-a">A 사진</span><b>→</b><span data-stage="map-a">A 지도</span><b>→</b><span data-stage="photo-b">B 사진</span><b>→</b><span data-stage="map-b">B 지도</span>
        </div>
        <div class="align-actions">
          <button data-id="start-align" class="primary" disabled>위치 맞추기 시작</button>
          <button data-id="reset-align" hidden>기준점 다시 찍기</button>
          <button data-id="edit-route" hidden>지도에서 코스 세밀하게 수정</button>
          <button data-id="undo-map" hidden>지도 수정 취소</button>
          <strong data-id="align-instruction">먼저 코스를 분석하거나 직접 따라 그리세요.</strong>
        </div>
        <p class="align-tip">네이버 길찾기는 출발점과 도착점, 또는 멀리 떨어진 교차로 두 곳을 A와 B로 고르세요. 사진 → 실제 지도 → 사진 → 실제 지도 순서로 같은 장소를 클릭하면 경로 전체가 정확한 위치로 이동합니다.</p>
        <label class="review-check"><input data-id="review" type="checkbox" disabled> 지도 위 주황색 코스의 위치를 확인했습니다.</label>
      </section>
    </div>
    <div class="import-bottom"><span>사진 복원 경로와 거리는 추정값입니다.</span><button data-id="apply" class="primary" disabled>이 코스를 지도에 적용</button></div>`;
  document.body.append(dialog);

  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    dialog.querySelector(`[data-id="${id}"]`) as T;
  const canvas = get<HTMLCanvasElement>('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let bitmap: ImageBitmap | undefined;
  let pixels: ImageData | undefined;
  let path: Pixel[] = [];
  let coords: Point[] = [];
  let crop: [number, number, number, number] = [0, 0, 0, 0];
  let cropStart: Pixel | undefined;
  let editTool: EditTool = 'color';
  let alignStage: AlignStage = 'idle';
  let a: Calibration | undefined;
  let b: Calibration | undefined;
  let map: L.Map | undefined;
  let overlay: L.Polyline | undefined;
  let pins: L.LayerGroup | undefined;
  let correctionLayer: L.LayerGroup | undefined;
  let correcting = false;
  const correctionHistory: Point[][] = [];
  let kind = 'photo';
  let photoSource: 'generic' | 'naver' = 'generic';
  let fileName = '';
  let segments: Point[][] = [];
  let loadId = 0;

  const message = (text: string, error = false) => {
    get('message').textContent = text;
    get('message').classList.toggle('error', error);
  };

  const updateApply = () => {
    get<HTMLButtonElement>('apply').disabled =
      coords.length < 2 || (kind === 'photo' && !get<HTMLInputElement>('review').checked);
  };

  const stageCopy: Record<AlignStage, string> = {
    idle: '코스가 준비되면 위치 맞추기 시작을 누르세요.',
    'photo-a': '① 사진에서 기준점 A를 클릭하세요.',
    'map-a': '② 오른쪽 실제 지도에서 같은 장소 A를 클릭하세요.',
    'photo-b': '③ 사진에서 A와 멀리 떨어진 기준점 B를 클릭하세요.',
    'map-b': '④ 실제 지도에서 같은 장소 B를 클릭하세요.',
    review: '위치 계산 완료. 지도 위 주황색 코스를 확인하고 체크하세요.',
  };

  function updateAlignUI() {
    get('align-instruction').textContent = stageCopy[alignStage];
    get('canvas-action').hidden = alignStage !== 'photo-a' && alignStage !== 'photo-b';
    get('canvas-action').textContent = alignStage === 'photo-a' ? '사진에서 A 클릭' : '사진에서 B 클릭';
    dialog.querySelectorAll<HTMLElement>('[data-stage]').forEach((element) => {
      const stages: AlignStage[] = ['photo-a', 'map-a', 'photo-b', 'map-b'];
      const current = stages.indexOf(alignStage);
      element.classList.toggle('active', element.dataset.stage === alignStage);
      element.classList.toggle('done', current > stages.indexOf(element.dataset.stage as AlignStage) || alignStage === 'review');
    });
    get<HTMLButtonElement>('start-align').disabled = path.length < 2;
    get<HTMLButtonElement>('start-align').hidden = alignStage !== 'idle' && alignStage !== 'review';
    get<HTMLButtonElement>('start-align').textContent = alignStage === 'review' ? '위치 다시 맞추기' : '위치 맞추기 시작';
    get<HTMLButtonElement>('reset-align').hidden = alignStage === 'idle';
    get<HTMLInputElement>('review').disabled = alignStage !== 'review';
    get<HTMLButtonElement>('edit-route').hidden = alignStage !== 'review';
    get<HTMLButtonElement>('edit-route').textContent = correcting ? '세밀한 수정 끝내기' : '지도에서 코스 세밀하게 수정';
    get<HTMLButtonElement>('undo-map').hidden = !correctionHistory.length;
    updateApply();
  }

  function draw() {
    if (!bitmap) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#20d9e1';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(crop[0], crop[1], crop[2] - crop[0], crop[3] - crop[1]);
    ctx.setLineDash([]);
    if (path.length) {
      ctx.beginPath();
      path.forEach((point, index) => (index ? ctx.lineTo(...point) : ctx.moveTo(...point)));
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#44fff0';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (const [label, anchor] of [['A', a], ['B', b]] as const) {
      if (!anchor) continue;
      ctx.fillStyle = label === 'A' ? '#c15283' : '#416fc1';
      ctx.beginPath();
      ctx.arc(...anchor.pixel, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(label, anchor.pixel[0] - 4, anchor.pixel[1] + 5);
    }
  }

  function resetAlignment(nextStage: AlignStage = 'idle') {
    a = undefined;
    b = undefined;
    coords = [];
    overlay?.remove();
    overlay = undefined;
    pins?.clearLayers();
    correctionLayer?.clearLayers();
    correcting = false;
    correctionHistory.length = 0;
    get<HTMLInputElement>('review').checked = false;
    alignStage = nextStage;
    draw();
    updateAlignUI();
  }

  function addPin(label: 'A' | 'B', anchor: Calibration) {
    const pin = L.marker(anchor.coordinate, {
      draggable: true,
      icon: L.divIcon({ className: `calibration-pin pin-${label.toLowerCase()}`, html: label, iconSize: [28, 28], iconAnchor: [14, 14] }),
    }).addTo(pins!);
    pin.on('dragend', () => {
      const position = pin.getLatLng();
      anchor.coordinate = [position.lat, position.lng];
      calculateAlignment(false);
    });
  }

  function calculateAlignment(fit = true) {
    coords = [];
    overlay?.remove();
    pins?.clearLayers();
    if (!a || !b || path.length < 2) return;
    try {
      coords = georeference(path, a, b);
      overlay = L.polyline(coords, { color: '#ed6342', weight: 5, opacity: 0.95 }).addTo(map!);
      addPin('A', a);
      addPin('B', b);
      overlay.bringToFront();
      if (correcting) renderCorrectionHandles();
      if (fit && overlay.getBounds().isValid()) map!.fitBounds(overlay.getBounds(), { padding: [45, 45], maxZoom: 17 });
      get<HTMLInputElement>('review').checked = false;
      updateApply();
    } catch (error) {
      message((error as Error).message, true);
    }
  }

  function renderCorrectionHandles() {
    correctionLayer?.clearLayers();
    if (!correcting || coords.length < 2) return;
    const stride = Math.max(1, Math.ceil(coords.length / 60));
    const indices = Array.from(new Set([
      0,
      ...coords.map((_, index) => index).filter((index) => index % stride === 0),
      coords.length - 1,
    ]));
    for (const index of indices) {
      let before: Point[] = [];
      const handle = L.marker(coords[index], {
        draggable: true,
        keyboard: true,
        title: `코스 지점 ${index + 1}`,
        icon: L.divIcon({ className: 'route-edit-pin', html: '', iconSize: [16, 16], iconAnchor: [8, 8] }),
      }).addTo(correctionLayer!);
      handle.on('dragstart', () => {
        before = coords.map((point) => [...point] as Point);
        correctionHistory.push(before.map((point) => [...point] as Point));
      });
      handle.on('drag', () => {
        const position = handle.getLatLng();
        const deltaLat = position.lat - before[index][0];
        const deltaLon = position.lng - before[index][1];
        const radius = Math.max(1, stride * 1.5);
        coords = before.map((point, pointIndex) => {
          const distance = Math.abs(pointIndex - index);
          const weight = distance > radius ? 0 : (Math.cos(Math.PI * distance / radius) + 1) / 2;
          return [point[0] + deltaLat * weight, point[1] + deltaLon * weight] as Point;
        });
        overlay?.setLatLngs(coords);
      });
      handle.on('dragend', () => {
        get<HTMLInputElement>('review').checked = false;
        renderCorrectionHandles();
        updateAlignUI();
        message('코스를 수정했습니다. 필요한 점을 더 움직인 뒤 위치 확인란을 체크하세요.');
      });
    }
  }

  function setEditTool(value: EditTool) {
    editTool = value;
    cropStart = undefined;
    dialog.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((element) =>
      element.setAttribute('aria-pressed', String(element.dataset.tool === editTool)),
    );
    get('photo-hint').textContent = editTool === 'color'
      ? '코스 선의 가운데를 클릭하면 색상이 자동으로 선택됩니다.'
      : editTool === 'crop'
        ? '지도 부분의 왼쪽 위와 오른쪽 아래를 차례로 클릭하세요.'
        : '출발점부터 실제 진행 순서대로 클릭하세요. 순환 코스는 마지막에 출발점을 다시 찍으세요.';
  }

  dialog.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((element) => {
    element.onclick = () => {
      if (element.dataset.tool === 'trace' && editTool !== 'trace') {
        path = [];
        get('detect-state').textContent = '직접 그리는 중';
        resetAlignment();
      }
      setEditTool(element.dataset.tool as EditTool);
    };
  });

  canvas.onclick = (event) => {
    if (!pixels) return;
    const rect = canvas.getBoundingClientRect();
    const point: Pixel = [
      Math.max(0, Math.min(canvas.width - 1, Math.round((event.clientX - rect.left) * canvas.width / rect.width))),
      Math.max(0, Math.min(canvas.height - 1, Math.round((event.clientY - rect.top) * canvas.height / rect.height))),
    ];
    if (alignStage === 'photo-a' || alignStage === 'photo-b') {
      const calibration = { pixel: point, coordinate: [0, 0] as Point };
      if (alignStage === 'photo-a') {
        a = calibration;
        alignStage = 'map-a';
      } else {
        b = calibration;
        alignStage = 'map-b';
      }
      draw();
      updateAlignUI();
      return;
    }
    if (alignStage === 'map-a' || alignStage === 'map-b') {
      message('지금은 오른쪽 실제 지도에서 같은 장소를 클릭할 차례입니다.', true);
      return;
    }
    if (editTool === 'color') {
      const index = (point[1] * canvas.width + point[0]) * 4;
      get<HTMLInputElement>('color').value = `#${Array.from(pixels.data.slice(index, index + 3))
        .map((value) => value.toString(16).padStart(2, '0')).join('')}`;
      get('photo-hint').textContent = '색상을 골랐습니다. 이제 코스 분석을 누르세요.';
    } else if (editTool === 'crop') {
      if (!cropStart) {
        cropStart = point;
        get('photo-hint').textContent = '반대쪽 모서리를 클릭하세요.';
      } else {
        crop = [
          Math.min(point[0], cropStart[0]), Math.min(point[1], cropStart[1]),
          Math.max(point[0], cropStart[0]), Math.max(point[1], cropStart[1]),
        ];
        cropStart = undefined;
        path = [];
        get('detect-state').textContent = '잘라낸 영역에서 다시 분석해 주세요';
        resetAlignment();
        setEditTool('color');
      }
    } else {
      if (path.length >= 500) {
        message('최대 500개 점까지 추가할 수 있습니다.', true);
        return;
      }
      path.push(point);
      get('detect-state').textContent = `${path.length}개 지점 직접 지정됨`;
      resetAlignment();
      draw();
    }
  };

  function acceptDetectedPath(nextPath: Pixel[], source: 'generic' | 'naver', note: string) {
    path = nextPath;
    photoSource = source;
    if (path.length > 500) throw Error('코스가 너무 복잡합니다. 지도만 보이게 자르거나 직접 따라 그려 주세요.');
    resetAlignment();
    get('detect-state').textContent = `${source === 'naver' ? '네이버 경로' : '코스'} 분석됨 · ${path.length}개 지점`;
    message(note);
    setEditTool('color');
  }

  function analyzeNaver(silent = false) {
    if (!pixels) return false;
    try {
      const result = extractNaverRoute(pixels.data, canvas.width, canvas.height, crop);
      acceptDetectedPath(
        result.path,
        'naver',
        `네이버 파란 경로 ${result.path.length}개 지점을 찾았습니다. 청록색 확인선이 원래 길을 따라가는지 보고 위치 맞추기를 시작하세요.`,
      );
      return true;
    } catch (error) {
      path = [];
      photoSource = 'generic';
      resetAlignment();
      if (!silent) {
        get('detect-state').textContent = '네이버 경로 자동 인식 실패';
        message((error as Error).message, true);
      }
      return false;
    }
  }

  get('naver').onclick = () => analyzeNaver(false);
  get('analyze').onclick = () => {
    if (!pixels) return;
    try {
      const hex = get<HTMLInputElement>('color').value;
      const color = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
      const result = extractRoute(
        pixels.data,
        canvas.width,
        canvas.height,
        color,
        +get<HTMLInputElement>('tolerance').value,
        crop,
      );
      const partial = result.components > 1 && result.coverage < 0.72;
      acceptDetectedPath(result.path, 'generic', partial
        ? '코스 일부만 연결되어 보입니다. 사진의 청록색 선이 전체 코스를 덮는지 확인하고, 빠진 부분이 있으면 지도만 자르거나 직접 따라 그리세요.'
        : `코스 ${result.path.length}개 지점을 찾았습니다. 청록색 선이 전체 코스를 따라가는지 확인한 뒤 위치 맞추기를 시작하세요.`);
      if (partial) message('코스 일부만 연결되어 보입니다. 지도만 자르거나 직접 따라 그려 빠진 부분을 보정하세요.', true);
    } catch (error) {
      path = [];
      resetAlignment();
      get('detect-state').textContent = '자동 분석 실패';
      message((error as Error).message, true);
    }
  };

  get('undo').onclick = () => {
    path.pop();
    get('detect-state').textContent = path.length ? `${path.length}개 지점 직접 지정됨` : '코스가 비어 있습니다';
    resetAlignment();
    draw();
  };
  get('review').onchange = updateApply;
  get('start-align').onclick = () => {
    resetAlignment('photo-a');
    message('위치 맞추기를 시작했습니다. 화면 아래 안내에 따라 사진과 지도를 번갈아 클릭하세요.');
  };
  get('reset-align').onclick = () => resetAlignment('photo-a');
  get('edit-route').onclick = () => {
    correcting = !correcting;
    renderCorrectionHandles();
    updateAlignUI();
    message(correcting
      ? '지도 위의 작은 원을 드래그해 코스를 실제 도로에 맞추세요. 주변 선도 부드럽게 함께 이동합니다.'
      : '세밀한 수정을 마쳤습니다. 코스 위치를 확인하고 체크하세요.');
  };
  get('undo-map').onclick = () => {
    const previous = correctionHistory.pop();
    if (!previous) return;
    coords = previous;
    overlay?.setLatLngs(coords);
    renderCorrectionHandles();
    get<HTMLInputElement>('review').checked = false;
    updateAlignUI();
  };
  get('jump').onclick = () => {
    const lat = +get<HTMLInputElement>('lat').value;
    const lon = +get<HTMLInputElement>('lon').value;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
      message('올바른 위도와 경도를 입력하세요.', true);
      return;
    }
    map!.setView([lat, lon], 14);
  };

  function initMap() {
    if (map) {
      map.invalidateSize();
      return;
    }
    map = L.map(get('map')).fitBounds([
      [initialBounds().south, initialBounds().west],
      [initialBounds().north, initialBounds().east],
    ]);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    pins = L.layerGroup().addTo(map);
    correctionLayer = L.layerGroup().addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (alignStage !== 'map-a' && alignStage !== 'map-b') {
        if (alignStage === 'photo-a' || alignStage === 'photo-b') message('먼저 왼쪽 사진에서 기준점을 클릭하세요.', true);
        return;
      }
      const coordinate: Point = [event.latlng.lat, event.latlng.lng];
      if (alignStage === 'map-a' && a) {
        a.coordinate = coordinate;
        alignStage = 'photo-b';
      } else if (alignStage === 'map-b' && b) {
        b.coordinate = coordinate;
        alignStage = 'review';
        calculateAlignment(true);
        message('위치를 계산했습니다. 주황색 코스가 실제 길과 맞는지 확인하세요. A·B 핀을 드래그해 미세 조정할 수 있습니다.');
      }
      draw();
      updateAlignUI();
    });
  }

  async function loadFile(file: File) {
    const id = ++loadId;
    coords = [];
    path = [];
    resetAlignment();
    get('photo').hidden = true;
    get('gpx').hidden = true;
    updateApply();
    if (file.size > 15 * 1024 * 1024) {
      message('파일은 15 MB 이하로 선택하세요.', true);
      return;
    }
    fileName = file.name;
    try {
      if (/\.gpx$/i.test(file.name)) {
        kind = 'gpx';
        const xml = new DOMParser().parseFromString(await file.text(), 'application/xml');
        if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'gpx') throw Error('올바른 GPX 파일이 아닙니다.');
        if (id !== loadId) return;
        const groups = Array.from(xml.getElementsByTagNameNS('*', 'trkseg'));
        const routes = Array.from(xml.getElementsByTagNameNS('*', 'rte'));
        segments = [...groups, ...routes].map((group) => Array.from(group.children)
          .filter((element) => element.localName === 'trkpt' || element.localName === 'rtept')
          .map((element) => {
            const lat = element.getAttribute('lat');
            const lon = element.getAttribute('lon');
            const point: Point = [Number(lat), Number(lon)];
            if (!lat?.trim() || !lon?.trim() || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) >= 85 || Math.abs(point[1]) > 180) {
              throw Error('GPX에 잘못된 좌표가 있습니다. 원본 앱에서 다시 내보내 주세요.');
            }
            return point;
          })).filter((segment) => segment.length >= 2);
        if (!segments.length) throw Error('GPX에 유효한 경로 좌표가 없습니다.');
        const select = get<HTMLSelectElement>('segment');
        select.replaceChildren(...segments.map((segment, index) => {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent = `구간 ${index + 1} · ${segment.length}개 좌표`;
          return option;
        }));
        get('gpx').hidden = false;
        chooseSegment();
        message(`${segments.length}개 GPX 구간을 읽었습니다. 가져올 구간을 선택하세요.`);
      } else {
        kind = 'photo';
        photoSource = 'generic';
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw Error('PNG, JPG, WebP 또는 GPX 파일을 선택하세요.');
        const image = await createImageBitmap(file);
        if (id !== loadId) {
          image.close();
          return;
        }
        if (image.width * image.height > 40_000_000) {
          image.close();
          throw Error('이미지가 너무 큽니다. 4천만 픽셀 이하로 줄여 주세요.');
        }
        bitmap?.close();
        bitmap = image;
        const scale = Math.min(1, 900 / Math.max(image.width, image.height));
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        crop = [0, 0, canvas.width, canvas.height];
        get('photo').hidden = false;
        get('detect-state').textContent = '선 색상을 선택해 주세요';
        initMap();
        setEditTool('color');
        resetAlignment();
        if (!analyzeNaver(true)) message('사진을 열었습니다. 네이버 사진이면 자동 인식 버튼을, 다른 앱이면 코스 선의 색상을 선택한 뒤 코스 분석을 누르세요.');
      }
    } catch (error) {
      message((error as Error).message, true);
    }
  }

  get<HTMLInputElement>('file').onchange = () => {
    const file = get<HTMLInputElement>('file').files?.[0];
    if (file) void loadFile(file);
  };

  function chooseSegment() {
    const segment = segments[+get<HTMLSelectElement>('segment').value];
    coords = segment.length <= 500
      ? segment
      : segment.filter((_, index) => index % Math.ceil(segment.length / 499) === 0 || index === segment.length - 1);
    updateApply();
  }

  get('segment').onchange = chooseSegment;
  get('apply').onclick = () => {
    if (coords.length < 2) return;
    const lats = coords.map((point) => point[0]);
    const lons = coords.map((point) => point[1]);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const west = Math.min(...lons);
    const east = Math.max(...lons);
    const padLat = Math.max(0.001, (north - south) * 0.08);
    const padLon = Math.max(0.001, (east - west) * 0.08);
    if (lats.some((value) => !Number.isFinite(value) || Math.abs(value) > 85) || lons.some((value) => !Number.isFinite(value) || Math.abs(value) > 180)) {
      message('위치 보정 결과가 유효하지 않습니다. 기준점을 다시 지정하세요.', true);
      return;
    }
    onImport(
      coords,
      { south: south - padLat, north: north + padLat, west: west - padLon, east: east + padLon },
      kind === 'photo'
        ? (photoSource === 'naver' ? '네이버 지도 사진에서 복원한 코스' : '사진에서 복원한 추정 코스')
        : `GPX 코스 · ${fileName}`,
    );
    dialog.close();
  };

  get('close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { loadId++; });
  return {
    open(file?: File) {
      dialog.showModal();
      if (map && !get('photo').hidden) map.invalidateSize();
      if (file) void loadFile(file);
    },
  };
}
