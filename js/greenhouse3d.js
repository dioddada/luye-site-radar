// 溫室 3D 爆炸圖（案件卡片用）
// 風格：寫實產品爆炸圖——零件沿各自軸線拉開懸浮、金屬質感、攝影棚柔光、淺灰白背景、地面淡陰影。
// 結構尺寸照鹿野報價引擎（00_報價引擎/specs/drawing-sketchup.md，Oscar 提供）：
//   滴水高＝立柱 2.0＋(腳長−插入 0.10)，拱頂是真圓弧，拱距 0.75，固定壓板（S 線）位置、門 1.2×2.0。
// Three.js 用 CDN（index.html 的 importmap），打開卡片才載入；載不到或不支援 WebGL 就退回文字清單。
import { esc, fmt, num, normMaterials, NET_OPTS, ROOF_MATS, DOOR_OPTS, winchSideOf } from './util.js';
import { sfx } from './sound.js';

const POST_H = 2.0;      // 立柱高（常見）
const FILM_DROP = 0.3;   // 屋頂農膜包到滴水處下 0.3 米（DECISIONS 弧長更正）
const HOOP_GAP = 0.75;   // 拱距
const DEF = { length: 24, width: 8 };

// 跨距 → [滴水高比立柱多多少, 起拱高]（報價引擎定案值）
const SPAN_TABLE = [
  [5, 0.20, 0.876], [5.5, 0.05, 1.475], [6, 0.05, 1.455], [7, 0.20, 1.97],
  [7.5, 0.20, 2.039], [8, 0.19, 2.12], [9, 0.70, 1.78], [10, 0.20, 1.862],
];
export function spanGeo(W) {
  const T = SPAN_TABLE;
  if (W <= T[0][0]) return { eave: POST_H + T[0][1], rise: T[0][2] * W / T[0][0] };
  const last = T[T.length - 1];
  if (W >= last[0]) return { eave: POST_H + last[1], rise: last[2] * W / last[0] };
  for (let i = 0; i < T.length - 1; i++) {
    const a = T[i], b = T[i + 1];
    if (W >= a[0] && W <= b[0]) {
      // 落在表上的寬度用表值；中間的取最近的那一格（滴水高）＋線性內插（起拱高）
      const t = (W - a[0]) / (b[0] - a[0]);
      const near = t < 0.5 ? a : b;
      return { eave: POST_H + near[1], rise: a[2] + (b[2] - a[2]) * t };
    }
  }
  return { eave: 2.2, rise: W * 0.25 };
}

// 顏色／材質
const C = {
  steel: 0xa7aeb8,      // 鍍鋅鋼管
  alu: 0xe3e7ec,        // 鋁壓板
  hot: 0xff7a00,
  film: 0x8cc3ea, canvas: 0xd2c19c, knitNet: 0xe4e8e6, shade: 0x2f5a40,
  blackNet: 0x1c2025, insectNet: 0xaebdc8, winchFilm: 0x9fcdee,
  rope: 0x1d1f22, door: 0x9aa3ad, crank: 0x3a3f46,
};
const hex = n => '#' + n.toString(16).padStart(6, '0');

// ───────── 把案件資料轉成「要畫什麼」 ─────────
export function describe(c) {
  const list = (c.buildings || []).filter(b => num(b.length) > 0 && num(b.width) > 0);
  const big = list.slice().sort((a, b) => num(b.length) * num(b.width) - num(a.length) * num(a.width))[0];
  const sized = !!big;
  const W = sized ? num(big.width) : DEF.width;
  const Lreal = sized ? num(big.length) : DEF.length;
  const L = Math.min(Lreal, W * 2.5);               // 太長的溫室縮短顯示，不然手機上看不到細節
  const count = sized ? Math.max(1, Math.round(num(big.count)) || 1) : 1;
  const g = spanGeo(W);
  let note = sized ? `示意：${fmt(Lreal)}米 × ${fmt(W)}米${count > 1 ? `　×${count} 棟` : ''}` : '尺寸未填，示意';
  if (sized && list.length > 1) note += `（共 ${list.length} 種尺寸，畫最大的）`;
  if (L < Lreal) note += '・長度縮短顯示';
  note += `・滴水 ${fmt(g.eave)}米 棟高 ${fmt(g.eave + g.rise)}米`;

  if (c.workType === 'repair') {
    const r = c.repair || {};
    const net = r.net ? r.net.side : '';
    const ws = winchSideOf(r.winch);
    const hot = {
      roofFilm: !!r.film,
      netLong: net === '兩側' || net === '四周',
      netEnd: net === '前後' || net === '四周',
      winchLong: ws === '兩側' || ws === '四周',
      winchEnd: ws === '前後' || ws === '四周',
      sLine: !!r.sLine,
      rope: !!r.blackRope,
    };
    const items = [];
    if (hot.roofFilm) items.push('農膜（屋頂到滴水處下 0.3 米）');
    if (net) items.push(`網子（${net}）`);
    if (ws) items.push(`捲揚（${ws}）`);
    if (hot.sLine) items.push('S 線（固定壓板）');
    if (hot.rope) items.push('黑繩（壓膜繩）');
    return { mode: 'repair', W, L, note, g, hot, items, other: r.other || '' };
  }
  const m = normMaterials(c.materials);
  const items = [];
  m.roof.forEach(k => items.push({ key: k, label: '屋頂 ' + ROOF_MATS[k], color: C[k] }));
  if (m.net && m.net !== 'none') items.push({ key: m.net, label: '四周 ' + NET_OPTS[m.net] + '（內）', color: C[m.net] });
  const filmItem = (v, where) => {
    if (v === 'fixed') items.push({ key: 'film', label: `${where} 農膜（外，固定）`, color: C.film });
    if (v === 'winch') items.push({ key: 'winch', label: `${where} 捲揚`, color: C.winchFilm });
  };
  filmItem(m.sideFilm, '兩側');
  filmItem(m.endFilm, '前後');
  if (m.door !== 'none') items.push({ key: 'door', label: '門：' + DOOR_OPTS[m.door], color: C.door });
  return { mode: 'new', W, L, note, g, m, items, empty: !m.roof.length && !m.net && !m.sideFilm && !m.endFilm };
}

// ───────── 掛到卡片上 ─────────
export function mountGreenhouse(box, c) {
  const d = describe(c);
  box.innerHTML = `
    <div class="gh3d">
      <div class="gh3d-head"><b>3D 爆炸圖</b><span class="muted">${esc(d.note)}</span></div>
      <div class="gh3d-stage">
        <div class="gh3d-msg">3D 載入中…</div>
        <div class="gh3d-labels"></div>
        <button class="btn small gh3d-toggle hidden" type="button">合起</button>
        <div class="gh3d-hint hidden">單指旋轉・雙指縮放</div>
      </div>
      <div class="gh3d-legend">${legendHtml(d)}</div>
    </div>`;
  const stage = box.querySelector('.gh3d-stage');
  let viewer = null, dead = false;

  if (!webglOk()) { fallback(stage, d, '這支手機不支援 3D，改用清單'); return { dispose() {} }; }
  const timer = setTimeout(() => { if (!viewer && !dead) fallback(stage, d, '3D 載入太久（訊號不好？），改用清單'); }, 12000);
  Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/environments/RoomEnvironment.js'),
  ])
    .then(([THREE, { OrbitControls }, { RoomEnvironment }]) => {
      clearTimeout(timer);
      if (dead || !stage.isConnected) return;
      try { viewer = createViewer(THREE, OrbitControls, RoomEnvironment, stage, d); }
      catch (e) { console.error(e); fallback(stage, d, '3D 畫不出來，改用清單'); }
    })
    .catch(e => { clearTimeout(timer); console.warn(e); if (!dead) fallback(stage, d, '3D 載入失敗（沒訊號？），改用清單'); });

  return { dispose() { dead = true; clearTimeout(timer); if (viewer) viewer.dispose(); viewer = null; } };
}

function webglOk() {
  try { const cv = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (cv.getContext('webgl2') || cv.getContext('webgl'))); }
  catch (e) { return false; }
}

function legendHtml(d) {
  if (d.mode === 'repair') {
    return `<div class="gh3d-li"><i style="background:${hex(C.hot)};box-shadow:0 0 8px ${hex(C.hot)}"></i>亮橘色＝要換／要修</div>
      <div class="gh3d-li"><i style="background:#9aa3ad;opacity:.6"></i>淡色＝現有，不動</div>
      <div class="gh3d-items">${d.items.map(t => `<span class="hot">${esc(t)}</span>`).join('') || '<span class="muted">沒有可畫的項目</span>'}
      ${d.other ? `<span class="hot">其他：${esc(d.other)}</span>` : ''}</div>`;
  }
  const base = `<div class="gh3d-li"><i style="background:${hex(C.steel)}"></i>鍍鋅骨架</div>
    <div class="gh3d-li"><i style="background:${hex(C.alu)};border:1px solid #889"></i>固定壓板（S 線）</div>`;
  if (d.empty) return base + '<div class="muted" style="width:100%">新建材料還沒選（修改案件資料可補）</div>';
  return d.items.map(p => `<div class="gh3d-li"><i style="background:${hex(p.color)};border:1px solid #556"></i>${esc(p.label)}</div>`).join('') + base;
}

function fallback(stage, d, why) {
  const items = d.mode === 'repair'
    ? d.items.concat(d.other ? ['其他：' + d.other] : [])
    : d.items.map(p => p.label);
  stage.classList.add('flat');
  stage.innerHTML = `<div class="gh3d-fallback"><div class="muted">${esc(why)}</div>
    <ul>${items.map(t => `<li>${esc(t)}</li>`).join('') || '<li class="muted">沒有項目</li>'}</ul></div>`;
}

// ───────── Three.js 場景 ─────────
function createViewer(THREE, OrbitControls, RoomEnvironment, stage, d) {
  const { W, L } = d;
  const H = d.g.eave, rise = d.g.rise;
  const R = (W * W) / (8 * rise) + rise / 2;       // 拱半徑
  const cy = H + rise - R;                          // 圓心高度
  const th0 = Math.asin(Math.min(1, (W / 2) / R));  // 半角
  const s = Math.max(W, L * 0.35, 5) / 7;           // 爆開距離跟著溫室大小走
  const isRepair = d.mode === 'repair';
  const hot = d.hot || {};
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── renderer：攝影棚風格 ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  stage.classList.add('studio');
  stage.prepend(canvas);
  stage.querySelector('.gh3d-msg').remove();

  const disposables = [];
  const keep = o => { disposables.push(o); return o; };

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  keep(envRT); pmrem.dispose();
  scene.environment = envRT.texture;              // 金屬反光靠環境貼圖
  const span = Math.max(W, L);
  scene.fog = new THREE.Fog(0x1a1a1c, span * 2.4, span * 6.5);   // 遠處淡入深灰背景，有景深感

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2000);

  // 打光：環境光＋柔和主光（投影）＋補光
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3e, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(W * 0.9 + 6, H + rise + span * 0.9, L * 0.5 + 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera, ext = span * 0.9 + 6;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.5; sc.far = span * 4 + 40;
  key.shadow.bias = -0.0005; key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe8f0ff, 0.45);
  fill.position.set(-W - 6, H + 4, -L * 0.4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7);   // 背光勾邊，深色背景上輪廓才清楚
  rim.position.set(-W * 0.5, H + rise + 6, -L - 8);
  scene.add(rim);

  // 地面：只接陰影（背景是 CSS 淺灰漸層）
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(span * 8, span * 8)), keep(new THREE.ShadowMaterial({ opacity: 0.38 })));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);

  // ── 材質 ──
  const hotMats = [];
  const netTex = (fine, dark) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 32, 32);
    g.fillStyle = dark ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.16)'; g.fillRect(0, 0, 32, 32);
    g.strokeStyle = '#fff'; g.lineWidth = fine ? 2 : 4; g.strokeRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
    return keep(t);
  };
  const TEX = { coarse: netTex(false, true), fine: netTex(true, false) };

  // isHot：維修要換的；dim：維修時現有、不動的（寫實但淡）
  function mat(kind, isHot = false) {
    const dim = isRepair && !isHot;
    let m;
    if (isHot) {
      m = new THREE.MeshStandardMaterial({ color: C.hot, emissive: C.hot, emissiveIntensity: 0.5, roughness: 0.45, metalness: 0.1,
        transparent: kind.surface, opacity: kind.surface ? 0.85 : 1, side: THREE.DoubleSide, depthWrite: !kind.surface });
      if (kind.net) { m.map = kind.net === 'fine' ? TEX.fine : TEX.coarse; }
      hotMats.push(m);
      return keep(m);
    }
    const p = { color: kind.color, roughness: kind.rough ?? 0.5, metalness: kind.metal ?? 0, side: THREE.DoubleSide };
    if (kind.surface) Object.assign(p, { transparent: true, opacity: kind.opacity ?? 0.6, depthWrite: false });
    if (kind.net) p.map = kind.net === 'fine' ? TEX.fine : TEX.coarse;
    m = new THREE.MeshStandardMaterial(p);
    if (dim) { m.transparent = true; m.opacity = (kind.surface ? (kind.opacity ?? 0.6) : 1) * 0.35; m.depthWrite = false; }
    return keep(m);
  }
  const K = {
    steel: { color: C.steel, metal: 0.9, rough: 0.32 },
    alu: { color: C.alu, metal: 0.85, rough: 0.22 },
    film: { color: C.film, surface: true, opacity: 0.42, rough: 0.08 },
    winchFilm: { color: C.winchFilm, surface: true, opacity: 0.4, rough: 0.1 },
    canvas: { color: C.canvas, surface: true, opacity: 0.92, rough: 0.9 },
    knitNet: { color: C.knitNet, surface: true, opacity: 0.85, rough: 0.85, net: 'coarse' },
    shade: { color: C.shade, surface: true, opacity: 0.88, rough: 0.85, net: 'fine' },
    blackNet: { color: C.blackNet, surface: true, opacity: 0.8, rough: 0.8, net: 'coarse' },
    insectNet: { color: C.insectNet, surface: true, opacity: 0.7, rough: 0.8, net: 'fine' },
    rope: { color: C.rope, rough: 0.7 },
    door: { color: C.door, metal: 0.7, rough: 0.35 },
    crank: { color: C.crank, metal: 0.5, rough: 0.4 },
  };
  const steelMat = mat(K.steel, false);
  // 骨架在維修模式也保持實色（是參考基準），只把「要換的」打亮
  steelMat.transparent = false; steelMat.opacity = 1; steelMat.depthWrite = true;

  // ── 幾何工具 ──
  // 拱上的點（往外偏移 off）：θ 從左到右
  const ARC_N = 28;
  const arcPts = (off = 0) => {
    const pts = [];
    for (let i = 0; i <= ARC_N; i++) {
      const t = -th0 + (2 * th0 * i) / ARC_N;
      pts.push([(R + off) * Math.sin(t), cy + (R + off) * Math.cos(t)]);
    }
    return pts;
  };
  const arcLen = 2 * th0 * R;
  // 屋頂膜剖面：左側滴水下 0.3 → 拱 → 右側滴水下 0.3
  const roofProfile = off => {
    const a = arcPts(off);
    return [[a[0][0], H - FILM_DROP], ...a, [a[a.length - 1][0], H - FILM_DROP]];
  };
  // 端面外形（地面 → 牆 → 拱）
  function endShape(dr) {
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0);
    arcPts(0).slice().reverse().forEach(p => sh.lineTo(p[0], p[1]));
    sh.lineTo(-W / 2, 0);
    if (dr) {
      const [x0, x1] = dr;
      const h = new THREE.Path();
      h.moveTo(x0, 0.1); h.lineTo(x1, 0.1); h.lineTo(x1, 2.1); h.lineTo(x0, 2.1); h.lineTo(x0, 0.1);
      sh.holes.push(h);
    }
    return sh;
  }
  // 沿長度方向掃出曲面；uv 以米計
  function sweep(pts, len, cell = 1) {
    const pos = [], uv = [], idx = [];
    let acc = 0;
    pts.forEach((p, i) => {
      if (i) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      pos.push(p[0], p[1], -len / 2, p[0], p[1], len / 2);
      uv.push(acc / cell, 0, acc / cell, len / cell);
    });
    for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return keep(g);
  }
  function scaleUV(g, su, sv) {
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv);
    return g;
  }
  function tubePath(pts3, r, radial = 8) {
    const path = new THREE.CurvePath();
    for (let i = 0; i < pts3.length - 1; i++) path.add(new THREE.LineCurve3(pts3[i], pts3[i + 1]));
    return keep(new THREE.TubeGeometry(path, Math.max(8, pts3.length * 2), r, radial, false));
  }
  const cylCache = {};
  function bar(a, b, r, m, parent) {
    const len = a.distanceTo(b);
    const k = r.toFixed(3);
    const g = cylCache[k] || (cylCache[k] = keep(new THREE.CylinderGeometry(r, r, 1, 8)));
    const mesh = new THREE.Mesh(g, m);
    mesh.scale.set(1, len, 1);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  // 面板加細邊線，零件輪廓才看得清楚（像產品爆炸圖）
  const edgeMat = keep(new THREE.LineBasicMaterial({ color: 0xa3acb6, transparent: true, opacity: isRepair ? 0.35 : 0.8 }));
  const edgeHot = keep(new THREE.LineBasicMaterial({ color: 0xff7a00 }));
  function outline(mesh, isHot) {
    const eg = keep(new THREE.EdgesGeometry(mesh.geometry, 25));
    mesh.add(new THREE.LineSegments(eg, isHot ? edgeHot : edgeMat));
    return mesh;
  }
  function plateBar(a, b, m, parent) {          // 壓板：扁長方條
    const len = a.distanceTo(b);
    const g = cylCache.plate || (cylCache.plate = keep(new THREE.BoxGeometry(0.06, 1, 0.025)));
    const mesh = new THREE.Mesh(g, m);
    mesh.scale.set(1, len, 1);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // 門：照報價引擎 6m 跨，門柱在離左邊 1.10／2.40（從外面看的左邊）。
  // 有門的端面＝doorOn；該面有做捲揚時，門靠到最左邊（捲揚膜畫在門右側到另一邊）。
  const mm = d.m || {};
  const hasEndWinch = isRepair ? !!hot.winchEnd : mm.endFilm === 'winch';
  const doorOn = isRepair ? { 1: true, '-1': false }
    : { 1: mm.door === 'front' || mm.door === 'both', '-1': mm.door === 'back' || mm.door === 'both' };
  // sz＝1 前端（+z，從外面看左邊是 -x）；sz＝-1 後端（-z，從外面看左邊是 +x）
  function doorRange(sz) {
    if (!doorOn[sz]) return null;
    const leftDir = sz > 0 ? -1 : 1;
    const edge = leftDir * W / 2;
    const [a, b] = W < 4 ? [W / 2 - 0.6, W / 2 + 0.6] : hasEndWinch ? [0.1, 1.3] : [1.15, 2.35];
    const xs = [edge - leftDir * a, edge - leftDir * b].sort((p, q) => p - q);
    return xs;
  }
  const DOOR = { 1: doorRange(1), '-1': doorRange(-1) };

  // 部件：{ obj, base, ex（爆開位移）, label, anchor（合起時標籤位置）, hot }
  const parts = [];
  function addPart(obj, ex, label, anchor, isHot) {
    scene.add(obj);
    parts.push({ obj, ex, label, anchor, hot: !!isHot, el: null });
  }

  // ── 骨架（居中不動）：彎管＋立柱、屋頂桁條、兩側滴水下 0.2 橫桿、裙桿、端面立柱、門楣 ──
  const hoopN = Math.max(4, Math.round(L / HOOP_GAP) + 1);
  const zAt = i => -L / 2 + (L * i) / (hoopN - 1);
  const hoopPath = [V(-W / 2, 0, 0), V(-W / 2, H, 0), ...arcPts(0).map(p => V(p[0], p[1], 0)), V(W / 2, H, 0), V(W / 2, 0, 0)];
  const hoops = new THREE.InstancedMesh(tubePath(hoopPath, 0.024, 8), steelMat, hoopN);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < hoopN; i++) { mtx.makeTranslation(0, 0, zAt(i)); hoops.setMatrixAt(i, mtx); }
  hoops.castShadow = true;
  scene.add(hoops);
  const frame = new THREE.Group();
  const purlinN = Math.max(3, Math.round(arcLen / 1.35));        // 8m 跨約 7 道
  for (let i = 0; i < purlinN; i++) {
    const t = -th0 + (2 * th0 * (i + 0.5)) / purlinN;
    const x = R * Math.sin(t), y = cy + R * Math.cos(t);
    bar(V(x, y, -L / 2), V(x, y, L / 2), 0.014, steelMat, frame);
  }
  [-1, 1].forEach(sg => {
    bar(V(sg * W / 2, H - 0.2, -L / 2), V(sg * W / 2, H - 0.2, L / 2), 0.014, steelMat, frame);   // 滴水下 0.2
    bar(V(sg * W / 2, 0.2, -L / 2), V(sg * W / 2, 0.2, L / 2), 0.014, steelMat, frame);           // 裙桿
  });
  // 端面：滴水高水平桿＋立柱（前面有門）
  const endPostsX = (dr) => {
    const xs = [];
    if (dr) {
      xs.push(dr[0] - 0.05, dr[1] + 0.05);
      for (let x = dr[1] + 1.8; x < W / 2 - 0.6; x += 1.8) xs.push(x);
      for (let x = dr[0] - 1.8; x > -W / 2 + 0.6; x -= 1.8) xs.push(x);
    } else {
      const n = Math.max(1, Math.round(W / 1.5) - 1);
      for (let i = 1; i <= n; i++) xs.push(-W / 2 + (W * i) / (n + 1));
    }
    return xs;
  };
  const archYAt = x => cy + Math.sqrt(Math.max(0, R * R - x * x));
  [-1, 1].forEach(sz => {
    const z = sz * L / 2;
    bar(V(-W / 2, H, z), V(W / 2, H, z), 0.016, steelMat, frame);
    const dr = DOOR[sz];
    endPostsX(dr).filter(x => Math.abs(x) < W / 2 - 0.05).forEach(x => bar(V(x, 0, z), V(x, archYAt(x), z), 0.02, steelMat, frame));
    if (dr) bar(V(dr[0] - 0.05, 2.12, z), V(dr[1] + 0.05, 2.12, z), 0.02, steelMat, frame);   // 門楣
  });
  scene.add(frame);

  // ── 固定壓板（S 線）：兩長邊滴水高＋離地 0.2；端面頭尾彎管外緣（拱＋兩側直段）＋橫向三道（遇門斷開） ──
  {
    const isHot = !!hot.sLine;
    const pm = mat(K.alu, isHot);
    const out = 0.05;
    [-1, 1].forEach(sg => {
      const grp = new THREE.Group();
      [H, 0.2].forEach(y => plateBar(V(sg * (W / 2 + out), y, -L / 2), V(sg * (W / 2 + out), y, L / 2), pm, grp));
      addPart(grp, V(sg * 1.0 * s, 0, 0), sg > 0 ? (isRepair ? 'S 線（壓板）' : '固定壓板') : '', V(sg * (W / 2 + out), H, L * 0.25), isHot);
    });
    [-1, 1].forEach(sz => {
      const grp = new THREE.Group();
      const z = sz * (L / 2 + out);
      const a = arcPts(0.03);
      const edge = [V(-W / 2 - 0.03, 0, z), V(-W / 2 - 0.03, H, z), ...a.map(p => V(p[0], p[1], z)), V(W / 2 + 0.03, H, z), V(W / 2 + 0.03, 0, z)];
      for (let i = 0; i < edge.length - 1; i++) plateBar(edge[i], edge[i + 1], pm, grp);
      const ys = [H - 0.2, (H - 0.2 + 0.2) / 2, 0.2];
      ys.forEach(y => {
        const dr = DOOR[sz];
        if (dr && y < 2.1) {   // 門洞斷開
          if (dr[0] - -W / 2 > 0.05) plateBar(V(-W / 2, y, z), V(dr[0], y, z), pm, grp);
          if (W / 2 - dr[1] > 0.05) plateBar(V(dr[1], y, z), V(W / 2, y, z), pm, grp);
        } else plateBar(V(-W / 2, y, z), V(W / 2, y, z), pm, grp);
      });
      addPart(grp, V(0, 0, sz * 1.0 * s), '', V(0, H, z), isHot);
    });
  }

  // ── 屋頂（往上爆開，越外層越高） ──
  const roofLayers = isRepair ? ['film'] : d.m.roof;
  roofLayers.forEach((k, i) => {
    const off = 0.06 + i * 0.05;
    const isHot = isRepair ? !!hot.roofFilm : false;
    const kind = K[k];
    const cell = kind.net === 'fine' ? 0.15 : kind.net ? 0.3 : 1;
    const mesh = outline(new THREE.Mesh(sweep(roofProfile(off), L, cell), mat(kind, isHot)), isHot);
    const exY = (2.2 + i * 1.7) * s;
    addPart(mesh, V(0, exY, 0), isRepair ? '農膜' : ROOF_MATS[k], V(-W * 0.12, H + rise + off, L * (0.25 - i * 0.22)), isHot);
  });

  // ── 黑繩（壓膜繩）：每兩支拱之間跨過屋頂（維修才畫） ──
  if (isRepair) {
    const rg = tubePath(roofProfile(0.12).map(p => V(p[0], p[1], 0)), 0.012, 5);
    const ropes = new THREE.InstancedMesh(rg, mat(K.rope, !!hot.rope), hoopN - 1);
    for (let i = 0; i < hoopN - 1; i++) { mtx.makeTranslation(0, 0, (zAt(i) + zAt(i + 1)) / 2); ropes.setMatrixAt(i, mtx); }
    addPart(ropes, V(0, 3.9 * s, 0), '黑繩', V(W * 0.15, H + rise + 0.12, -L * 0.25), !!hot.rope);
  }

  // ── 四周：網（內層，固定）／膜（外層，固定或捲揚） ──
  // layer：0＝網、1＝膜；爆開越外層越遠
  function longPanel(kind, isHot, layer, y0, y1, label, labelSide = 1) {
    const off = 0.08 + layer * 0.06;
    const cell = kind.net === 'fine' ? 0.15 : kind.net ? 0.3 : 1;
    [-1, 1].forEach(sg => {
      const g = scaleUV(keep(new THREE.PlaneGeometry(L, y1 - y0)), L / cell, (y1 - y0) / cell);
      g.rotateY(Math.PI / 2);
      const m = outline(new THREE.Mesh(g, mat(kind, isHot)), isHot);
      m.position.set(sg * (W / 2 + off), (y0 + y1) / 2, 0);
      addPart(m, V(sg * (2.0 + layer * 1.7) * s, 0, 0), sg === labelSide ? label : '', V(sg * (W / 2 + off), (y0 + y1) * 0.55, L * (0.32 - layer * 0.3)), isHot);
    });
  }
  function endPanel(kind, isHot, layer, label) {
    const off = 0.08 + layer * 0.06;
    const cell = kind.net === 'fine' ? 0.15 : kind.net ? 0.3 : 1;
    [-1, 1].forEach(sz => {
      const g = keep(new THREE.ShapeGeometry(endShape(DOOR[sz]), 6));
      scaleUV(g, 1 / cell, 1 / cell);
      const m = outline(new THREE.Mesh(g, mat(kind, isHot)), isHot);
      m.position.set(0, 0, sz * (L / 2 + off));
      addPart(m, V(0, 0, sz * (2.0 + layer * 1.7) * s), sz > 0 ? label : '', V(W * 0.22, H * 0.55, sz * (L / 2 + off)), isHot);
    });
  }
  // 捲揚：滴水處以下的捲揚膜＋底部捲揚管＋手搖器（長邊在前端、端面在右側）
  function winchSet(where, isHot, layer, label) {
    const off = 0.1 + layer * 0.06;
    const fm = mat(K.winchFilm, isHot), tm = mat(K.steel, isHot), cm = mat(K.crank, isHot);
    const y0 = 0.35, y1 = H - 0.05;
    if (where.long) [-1, 1].forEach(sg => {
      const grp = new THREE.Group();
      const g = keep(new THREE.PlaneGeometry(L, y1 - y0)); g.rotateY(Math.PI / 2);
      const film = outline(new THREE.Mesh(g, fm), isHot); film.position.set(0, (y0 + y1) / 2, 0); grp.add(film);
      bar(V(0.03, y0, -L / 2), V(0.03, y0, L / 2 + 0.25), 0.04, tm, grp);                  // 捲揚管
      const crank = new THREE.Mesh(keep(new THREE.BoxGeometry(0.14, 0.22, 0.14)), cm);   // 手搖器
      crank.position.set(0.08, 1.0, L / 2 + 0.25); crank.castShadow = true; grp.add(crank);
      bar(V(0.05, y0, L / 2 + 0.25), V(0.08, 0.9, L / 2 + 0.25), 0.015, tm, grp);
      grp.position.set(sg * (W / 2 + off), 0, 0);
      addPart(grp, V(sg * (2.0 + layer * 1.7) * s, 0, 0), sg > 0 ? label : '', V(sg * (W / 2 + off), H * 0.5, -L * 0.2), isHot);
    });
    if (where.end) [-1, 1].forEach(sz => {
      const grp = new THREE.Group();
      // 有門：捲揚膜從門的右側（門框外 0.1）到另一邊；沒門：整面
      const dr = DOOR[sz];
      let xa = -W / 2, xb = W / 2;
      if (dr) { if (sz > 0) xa = dr[1] + 0.1; else xb = dr[0] - 0.1; }
      const fw = xb - xa, xc = (xa + xb) / 2;
      const film = outline(new THREE.Mesh(keep(new THREE.PlaneGeometry(fw, y1 - y0)), fm), isHot);
      film.position.set(xc, (y0 + y1) / 2, 0); grp.add(film);
      const far = sz > 0 ? xb : xa, dir = sz > 0 ? 1 : -1;     // 手搖器放在離門遠的那一端
      bar(V(xa - (dir < 0 ? 0.25 : 0), y0, 0.03), V(xb + (dir > 0 ? 0.25 : 0), y0, 0.03), 0.04, tm, grp);
      const crank = new THREE.Mesh(keep(new THREE.BoxGeometry(0.14, 0.22, 0.14)), cm);
      crank.position.set(far + dir * 0.25, 1.0, 0.08); crank.castShadow = true; grp.add(crank);
      bar(V(far + dir * 0.25, y0, 0.05), V(far + dir * 0.25, 0.9, 0.08), 0.015, tm, grp);
      grp.position.set(0, 0, sz * (L / 2 + off));
      addPart(grp, V(0, 0, sz * (2.0 + layer * 1.7) * s), sz > 0 && where.endLabel !== false ? (where.endLabel || label) : '', V(xc, H * 0.5, sz * (L / 2 + off)), isHot);
    });
  }
  // 門片（往前／往後飄出）
  function doorPart(sz) {
    const dr = DOOR[sz];
    if (!dr) return;
    const grp = new THREE.Group();
    const dm = mat(K.door, false);
    const [x0, x1] = dr;
    [[V(x0, 0.1, 0), V(x0, 2.1, 0)], [V(x1, 0.1, 0), V(x1, 2.1, 0)], [V(x0, 0.1, 0), V(x1, 0.1, 0)], [V(x0, 2.1, 0), V(x1, 2.1, 0)], [V(x0, 1.1, 0), V(x1, 1.1, 0)]]
      .forEach(([a, b]) => bar(a, b, 0.02, dm, grp));
    const g = scaleUV(keep(new THREE.PlaneGeometry(x1 - x0, 2.0)), (x1 - x0) / 0.15, 2 / 0.15);
    const mesh = new THREE.Mesh(g, mat(K.insectNet, false));
    mesh.position.set((x0 + x1) / 2, 1.1, 0); grp.add(mesh);
    grp.position.set(0, 0, sz * (L / 2 + 0.02));
    addPart(grp, V(0, 0, sz * 4.4 * s), sz > 0 ? '門 1.2×2.0米' : '後門', V((x0 + x1) / 2, 2.1, sz * L / 2), false);
  }

  if (isRepair) {
    // 現有溫室：四周黑網（內）＋捲揚（兩側；選了前後／四周才畫端面捲揚）
    longPanel(K.blackNet, !!hot.netLong, 0, 0.05, H, hot.netLong ? '網子（兩側）' : '網子');
    endPanel(K.blackNet, !!hot.netEnd, 0, hot.netEnd ? '網子（前後）' : '');
    winchSet({ long: true, end: false }, !!hot.winchLong, 1, '捲揚（兩側）');
    if (hot.winchEnd) winchSet({ long: false, end: true }, true, 1, '捲揚（前後）');
    doorPart(1);
  } else {
    const m = d.m;
    if (m.net && m.net !== 'none') {
      longPanel(K[m.net], false, 0, 0.05, H, NET_OPTS[m.net] + '（內）');
      endPanel(K[m.net], false, 0, '');
    }
    if (m.sideFilm === 'fixed') longPanel(K.film, false, 1, 0.05, H, '兩側 農膜（固定）', -1);
    if (m.sideFilm === 'winch') winchSet({ long: true, end: false }, false, 1, '兩側 捲揚');
    if (m.endFilm === 'fixed') endPanel(K.film, false, 1, '前後 農膜（固定）');
    if (m.endFilm === 'winch') winchSet({ long: false, end: true, endLabel: '前後 捲揚' }, false, 1, '前後 捲揚');
    doorPart(1);
    doorPart(-1);
  }

  parts.forEach(p => { p.base = p.obj.position.clone(); p.obj.traverse(o => { if (o.isMesh && !o.material.transparent) o.castShadow = true; }); });

  // ── 引導線（細虛線，從原位連到飄出的零件） ──
  const guideParts = parts.filter(p => p.label);
  const gPos = new Float32Array(guideParts.length * 6);
  const gGeo = keep(new THREE.BufferGeometry());
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  const gMat = keep(new THREE.LineDashedMaterial({ color: 0xaeaeb2, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.7 }));
  const guides = new THREE.LineSegments(gGeo, gMat);
  guides.frustumCulled = false;
  scene.add(guides);

  // ── 標籤（HTML，跟著 3D 位置走） ──
  const labelBox = stage.querySelector('.gh3d-labels');
  parts.forEach(p => {
    if (!p.label) return;
    const el = document.createElement('div');
    el.className = 'gh3d-tag' + (p.hot ? ' hot' : '');
    el.textContent = p.hot ? '要換 ' + p.label : p.label;
    labelBox.appendChild(el);
    p.el = el;
  });

  // ── 相機 ──
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  const box3 = new THREE.Box3(V(-W / 2, 0, -L / 2), V(W / 2, H + rise, L / 2));
  parts.forEach(p => { p.obj.position.copy(p.base).add(p.ex); p.obj.updateMatrixWorld(true); box3.expandByObject(p.obj); p.obj.position.copy(p.base); });
  const ctr = box3.getCenter(new THREE.Vector3()), size = box3.getSize(new THREE.Vector3());
  const radius = size.length() / 2;
  controls.target.copy(ctr);
  const dir = V(1, 0.62, 1.15).normalize();
  camera.position.copy(ctr).addScaledVector(dir, radius / Math.sin((camera.fov / 2) * Math.PI / 180) * 0.86);
  controls.minDistance = radius * 0.5;
  controls.maxDistance = radius * 4;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  // ── 爆開動畫 ──
  let t = 0, goal = 1;
  const btn = stage.querySelector('.gh3d-toggle');
  const hint = stage.querySelector('.gh3d-hint');
  btn.classList.remove('hidden'); hint.classList.remove('hidden');
  btn.onclick = () => { sfx.beep(); goal = goal ? 0 : 1; btn.textContent = goal ? '合起' : '爆開'; };
  canvas.addEventListener('pointerdown', () => hint.classList.add('hidden'), { once: true });

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(stage); resize();

  const tmp = new THREE.Vector3();
  let raf = 0, alive = true, last = performance.now();
  function frameLoop(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frameLoop);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    t += Math.sign(goal - t) * Math.min(Math.abs(goal - t), dt * 1.4);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // easeInOut
    parts.forEach(p => p.obj.position.copy(p.base).addScaledVector(p.ex, e));
    guideParts.forEach((p, i) => {
      const a = p.anchor, b = tmp.copy(p.anchor).addScaledVector(p.ex, e);
      gPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    });
    gGeo.attributes.position.needsUpdate = true;
    guides.computeLineDistances();
    guides.visible = e > 0.05;
    const pulse = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(now / 300));
    hotMats.forEach(m => { m.emissiveIntensity = pulse; });
    controls.update();
    renderer.render(scene, camera);
    // 標籤
    const w = stage.clientWidth, h = stage.clientHeight;
    const placed = [];
    parts.forEach(p => {
      if (!p.el) return;
      tmp.copy(p.anchor).addScaledVector(p.ex, e).project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      p.el.style.display = vis ? '' : 'none';
      if (vis) {
        const ow = p.ow || (p.ow = p.el.offsetWidth), oh = p.oh || (p.oh = p.el.offsetHeight || 20);
        const x = Math.min(Math.max(((tmp.x + 1) / 2) * w, ow / 2 + 4), w - ow / 2 - 4);
        let y = Math.min(Math.max(((1 - tmp.y) / 2) * h, 14), h - 14);
        for (let k = 0; k < 6; k++) {
          const hit = placed.find(q => Math.abs(q.x - x) < (q.w + ow) / 2 + 2 && Math.abs(q.y - y) < (q.h + oh) / 2 + 2);
          if (!hit) break;
          y = hit.y + (hit.h + oh) / 2 + 3;
        }
        placed.push({ x, y, w: ow, h: oh });
        p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      }
    });
  }
  raf = requestAnimationFrame(frameLoop);

  return {
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
      disposables.forEach(o => { try { o.dispose(); } catch (e) { /* 忽略 */ } });
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* 忽略 */ }
      canvas.remove();
    },
  };
}
