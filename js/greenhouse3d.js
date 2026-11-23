// 溫室 3D 爆炸圖（案件卡片用）
// Three.js 用 CDN（index.html 的 importmap），打開卡片時才載入；載不到或不支援 WebGL 就退回文字清單。
import { esc, fmt, num, normMaterials, SIDE_MATS, ROOF_MATS } from './util.js';
import { sfx } from './sound.js';

const SHOULDER_H = 2.5;   // 滴水處（肩部）高度，米（示意）
const FILM_DROP = 0.3;    // 農膜包到滴水處下 0.3 米（DECISIONS 弧長更正）
const DEF = { length: 24, width: 8 };

// 顏色
const C = {
  frame: 0x9fb3cc,
  ghost: 0x5b6b86,
  hot: 0xffb020,
  roof: { film: 0xbfe9ff, canvas: 0xf5c26b, knitNet: 0xc39bff, shade: 0x35c47a },
  side: { blackNet: 0x9aa3b5, insectNet: 0xe6f4ff, film: 0xbfe9ff, winch: 0x6fc8ff },
  sLine: 0xff8a3d, rope: 0xd0d6e0, tube: 0xffd43b,
};
const hex = n => '#' + n.toString(16).padStart(6, '0');

// ───────── 把案件資料轉成「要畫什麼」 ─────────
export function describe(c) {
  const list = (c.buildings || []).filter(b => num(b.length) > 0 && num(b.width) > 0);
  const big = list.slice().sort((a, b) => num(b.length) * num(b.width) - num(a.length) * num(a.width))[0];
  const sized = !!big;
  const W = sized ? num(big.width) : DEF.width;
  const Lreal = sized ? num(big.length) : DEF.length;
  const L = Math.min(Lreal, W * 5);               // 太長的溫室縮短顯示，不然手機上看不到細節
  const count = sized ? Math.max(1, Math.round(num(big.count)) || 1) : 1;
  let note = sized ? `示意：${fmt(Lreal)}米 × ${fmt(W)}米${count > 1 ? `　×${count} 棟` : ''}` : '尺寸未填，示意';
  if (sized && list.length > 1) note += `（共 ${list.length} 種尺寸，畫最大的）`;
  if (L < Lreal) note += '・長度縮短顯示';

  const parts = [];      // { key, label, kind, hot }
  if (c.workType === 'repair') {
    const r = c.repair || {};
    const net = r.net ? r.net.side : '';
    parts.push({ key: 'roof:film', label: '農膜', hot: !!r.film });
    parts.push({ key: 'net:long', label: '網子（兩側）', hot: net === '兩側' || net === '四周' });
    parts.push({ key: 'net:end', label: '網子（前後）', hot: net === '前後' || net === '四周' });
    parts.push({ key: 'winch', label: '捲揚', hot: !!r.winch });
    parts.push({ key: 'sLine', label: 'S 線（卡膜槽）', hot: !!r.sLine });
    parts.push({ key: 'rope', label: '黑繩（壓膜繩）', hot: !!r.blackRope });
    return { mode: 'repair', W, L, note, parts, other: r.other || '' };
  }
  const m = normMaterials(c.materials);
  m.roof.forEach(k => parts.push({ key: 'roof:' + k, label: '屋頂 ' + ROOF_MATS[k], hot: true }));
  m.side.forEach(k => parts.push({ key: 'side:' + k, label: '四周 ' + SIDE_MATS[k], hot: true }));
  return { mode: 'new', W, L, note, parts, empty: !m.roof.length && !m.side.length };
}

// ───────── 掛到卡片上 ─────────
export function mountGreenhouse(box, c) {
  const d = describe(c);
  box.innerHTML = `
    <div class="gh3d">
      <div class="gh3d-head"><b>◆ 3D 爆炸圖</b><span class="muted">${esc(d.note)}</span></div>
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
  Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')])
    .then(([THREE, { OrbitControls }]) => {
      clearTimeout(timer);
      if (dead || !stage.isConnected) return;
      try { viewer = createViewer(THREE, OrbitControls, stage, d); }
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
    const hot = d.parts.filter(p => p.hot);
    return `<div class="gh3d-li"><i style="background:${hex(C.hot)};box-shadow:0 0 8px ${hex(C.hot)}"></i>亮起來＝要換／要修</div>
      <div class="gh3d-li"><i style="background:${hex(C.ghost)}"></i>灰色＝現有，不動</div>
      <div class="gh3d-items">${hot.map(p => `<span class="hot">${esc(p.label)}</span>`).join('') || '<span class="muted">沒有可畫的項目</span>'}
      ${d.other ? `<span class="hot">其他：${esc(d.other)}</span>` : ''}</div>`;
  }
  if (d.empty) return '<div class="muted">新建材料還沒選（修改案件資料可補）</div>';
  return d.parts.map(p => {
    const [g, k] = p.key.split(':');
    const col = g === 'roof' ? C.roof[k] : C.side[k];
    return `<div class="gh3d-li"><i style="background:${hex(col)}"></i>${esc(p.label)}</div>`;
  }).join('') + `<div class="gh3d-li"><i style="background:${hex(C.frame)}"></i>骨架</div>`;
}

function fallback(stage, d, why) {
  const items = d.mode === 'repair'
    ? d.parts.filter(p => p.hot).map(p => p.label).concat(d.other ? ['其他：' + d.other] : [])
    : d.parts.map(p => p.label);
  stage.classList.add('flat');
  stage.innerHTML = `<div class="gh3d-fallback"><div class="muted">${esc(why)}</div>
    <ul>${items.map(t => `<li>${esc(t)}</li>`).join('') || '<li class="muted">沒有項目</li>'}</ul></div>`;
}

// ───────── Three.js 場景 ─────────
function createViewer(THREE, OrbitControls, stage, d) {
  const { W, L } = d;
  const H = SHOULDER_H;
  const rise = Math.min(Math.max(W * 0.22, 1), 2.2);   // 拱高
  const s = Math.max(W, L * 0.35, 5) / 7;              // 爆開距離跟著溫室大小走

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  stage.prepend(canvas);
  stage.querySelector('.gh3d-msg').remove();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x0b1220, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(W, H + 12, L * 0.6);
  scene.add(sun);

  const disposables = [];
  const keep = o => { disposables.push(o); return o; };

  // 地面格線
  const grid = new THREE.GridHelper(Math.max(W, L) * 2.2, 22, 0x1f6f8b, 0x16304a);
  grid.material.transparent = true; grid.material.opacity = 0.5;
  keep(grid.geometry); keep(grid.material);
  scene.add(grid);

  // 網子用的格紋貼圖
  const gridTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, 32, 32);
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return keep(t);
  })();

  const isRepair = d.mode === 'repair';
  const hotSet = new Set(d.parts.filter(p => p.hot).map(p => p.key));
  const hotMats = [];

  function surfMat(color, opacity, net, hot) {
    let m;
    if (isRepair) {
      m = new THREE.MeshStandardMaterial({
        color: hot ? C.hot : C.ghost, emissive: hot ? C.hot : 0x000000, emissiveIntensity: hot ? 0.6 : 0,
        transparent: true, opacity: hot ? 0.75 : 0.1, side: THREE.DoubleSide, depthWrite: false,
        roughness: 0.6, metalness: 0,
      });
      if (hot) hotMats.push(m);
    } else {
      m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, roughness: 0.7, metalness: 0 });
    }
    if (net) { m.map = gridTex; m.alphaMap = null; }
    return keep(m);
  }
  function lineMat(color, hot) {
    const m = new THREE.MeshStandardMaterial(isRepair
      ? { color: hot ? C.hot : C.ghost, emissive: hot ? C.hot : 0, emissiveIntensity: hot ? 0.8 : 0, transparent: !hot, opacity: hot ? 1 : 0.25 }
      : { color, roughness: 0.5, metalness: 0.3 });
    if (isRepair && hot) hotMats.push(m);
    return keep(m);
  }

  // 拱形剖面：x 從 -W/2 到 W/2，d＝往外偏移
  const ARC_N = 24;
  const archPts = (off = 0) => {
    const a = W / 2 + off, b = rise + off, pts = [];
    for (let i = 0; i <= ARC_N; i++) { const t = Math.PI - (i / ARC_N) * Math.PI; pts.push([a * Math.cos(t), H + b * Math.sin(t)]); }
    return pts;
  };
  // 屋頂膜剖面：一側滴水處下 0.3 米 → 拱 → 另一側
  const roofProfile = off => {
    const arc = archPts(off);
    return [[arc[0][0], H - FILM_DROP], ...arc, [arc[arc.length - 1][0], H - FILM_DROP]];
  };
  // 沿長度方向掃出曲面，uv 用米（網格貼圖密度才對）
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
  // 沿折線的管子
  function tubeAlong(pts3, r) {
    const path = new THREE.CurvePath();
    for (let i = 0; i < pts3.length - 1; i++) path.add(new THREE.LineCurve3(pts3[i], pts3[i + 1]));
    return keep(new THREE.TubeGeometry(path, Math.max(8, pts3.length * 2), r, 6, false));
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // 部件：{ obj, base, ex（爆開位移）, label, anchor（標籤位置，相對 obj） }
  const parts = [];
  function addPart(obj, ex, label, anchor, hot) {
    scene.add(obj);
    parts.push({ obj, ex, label, anchor, hot, el: null });
  }

  // ── 骨架（固定不動） ──
  const hoopN = Math.min(31, Math.max(4, Math.round(L / 2) + 1));
  const hoopPath = [V(-W / 2, 0, 0), ...archPts(0).map(p => V(p[0], p[1], 0)), V(W / 2, 0, 0)];
  const hoopGeo = tubeAlong(hoopPath, 0.05);
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: isRepair ? 0x8796ad : C.frame, roughness: 0.4, metalness: 0.6 }));
  const hoops = new THREE.InstancedMesh(hoopGeo, frameMat, hoopN);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < hoopN; i++) { mtx.makeTranslation(0, 0, -L / 2 + (L * i) / (hoopN - 1)); hoops.setMatrixAt(i, mtx); }
  scene.add(hoops);
  const frame = new THREE.Group();
  const purlinGeo = keep(new THREE.CylinderGeometry(0.04, 0.04, L, 6));
  purlinGeo.rotateX(Math.PI / 2);
  [0, 6, 12, 18, 24].map(i => archPts(0)[i]).concat([[-W / 2, 0], [W / 2, 0]]).forEach(p => {
    const m = new THREE.Mesh(purlinGeo, frameMat); m.position.set(p[0], p[1], 0); frame.add(m);
  });
  scene.add(frame);

  // ── 屋頂 ──
  let roofTop = H + rise;
  const roofLayers = isRepair ? ['film'] : d.parts.filter(p => p.key.startsWith('roof:')).map(p => p.key.slice(5));
  roofLayers.forEach((k, i) => {
    const net = k === 'knitNet' || k === 'shade';
    const off = 0.06 + i * 0.05;
    const hot = isRepair ? hotSet.has('roof:film') : true;
    const g = sweep(roofProfile(off), L, net ? (k === 'shade' ? 0.2 : 0.3) : 1);
    const mesh = new THREE.Mesh(g, surfMat(C.roof[k], k === 'film' ? 0.35 : net ? 0.85 : 0.8, net, hot));
    const exY = (1.6 + i * 1.6) * s;
    roofTop = H + rise + exY;
    addPart(mesh, V(0, exY, 0), isRepair ? '農膜' : '屋頂 ' + ROOF_MATS[k], V(0, H + rise + off, L * (0.2 - i * 0.3)), hot);
  });

  // ── 四周 ──
  const sideLayers = isRepair ? [] : d.parts.filter(p => p.key.startsWith('side:')).map(p => p.key.slice(5));
  // 網／膜由內往外排：黑網、防蟲網、農膜、捲揚
  const order = ['blackNet', 'insectNet', 'film', 'winch'];
  sideLayers.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  function sidePanels(kind, color, net, cell, hot, opts) {
    // opts: { long: true/false, end: true/false, top: 滴水處以下多高, layer }
    const out = [];
    const top = opts.top;
    const off = 0.08 + opts.layer * 0.06;
    const exOut = (1.5 + opts.layer * 1.3) * s;
    if (opts.long) {
      [-1, 1].forEach(sgn => {
        const g = scaleUV(new THREE.PlaneGeometry(L, top), L / cell, top / cell);
        keep(g); g.rotateY(Math.PI / 2);
        const m = new THREE.Mesh(g, surfMat(color, net ? 0.9 : 0.4, net, hot));
        m.position.set(sgn * (W / 2 + off), top / 2, 0);
        out.push({ obj: m, ex: V(sgn * exOut, 0, 0), anchor: V(sgn * (W / 2 + off), top * 0.55, L * (0.3 - opts.layer * 0.25)), side: sgn });
      });
    }
    if (opts.end) {
      const shape = new THREE.Shape();
      const arc = archPts(0);
      shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0);
      arc.slice().reverse().forEach(p => shape.lineTo(p[0], p[1]));
      shape.lineTo(-W / 2, 0);
      const g = keep(new THREE.ShapeGeometry(shape, 8));
      scaleUV(g, 1 / cell, 1 / cell);
      [-1, 1].forEach(sgn => {
        const m = new THREE.Mesh(g, surfMat(color, net ? 0.9 : 0.4, net, hot));
        m.position.set(0, 0, sgn * (L / 2 + off));
        out.push({ obj: m, ex: V(0, 0, sgn * exOut), anchor: V(W * 0.2, H * 0.6, sgn * (L / 2 + off)), side: sgn, end: true });
      });
    }
    return out;
  }

  // 捲揚：側邊捲揚膜（滴水處以下）＋捲揚管＋手搖器
  function winchGroup(sgn, hot, layer) {
    const grp = new THREE.Group();
    const off = 0.1 + layer * 0.06;
    const top = H - 0.15;
    const g = scaleUV(new THREE.PlaneGeometry(L, top - 0.5), 1, 1); keep(g); g.rotateY(Math.PI / 2);
    const film = new THREE.Mesh(g, surfMat(C.side.winch, 0.45, false, hot));
    film.position.set(0, 0.5 + (top - 0.5) / 2, 0);
    grp.add(film);
    const tg = keep(new THREE.CylinderGeometry(0.07, 0.07, L + 0.6, 10)); tg.rotateX(Math.PI / 2);
    const tube = new THREE.Mesh(tg, lineMat(C.tube, hot));
    tube.position.set(0.05, 0.5, 0.3);
    grp.add(tube);
    const crank = new THREE.Mesh(keep(new THREE.BoxGeometry(0.25, 0.35, 0.25)), lineMat(C.tube, hot));
    crank.position.set(0.1, 0.9, L / 2 + 0.5);
    const rod = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6)), lineMat(C.tube, hot));
    rod.position.set(0.1, 0.65, L / 2 + 0.5);
    grp.add(crank, rod);
    grp.position.set(sgn * (W / 2 + off), 0, 0);
    return grp;
  }

  if (isRepair) {
    // 網子：兩側／前後
    const hl = hotSet.has('net:long'), he = hotSet.has('net:end');
    sidePanels('net', C.side.blackNet, true, 0.3, hl, { long: true, end: false, top: H - FILM_DROP, layer: 0 })
      .forEach((p, i) => addPart(p.obj, p.ex, i === 1 ? '網子（兩側）' : '', p.anchor, hl));
    sidePanels('net', C.side.blackNet, true, 0.3, he, { long: false, end: true, top: H, layer: 0 })
      .forEach((p, i) => addPart(p.obj, p.ex, i === 1 ? '網子（前後）' : '', p.anchor, he));
    const hw = hotSet.has('winch');
    [-1, 1].forEach(sgn => addPart(winchGroup(sgn, hw, 1), V(sgn * 2.8 * s, 0, 0), sgn > 0 ? '捲揚' : '', V(sgn * W / 2, 1.2, -L * 0.15), hw));
  } else {
    sideLayers.forEach((k, i) => {
      if (k === 'winch') {
        [-1, 1].forEach(sgn => addPart(winchGroup(sgn, true, i), V(sgn * (1.5 + i * 1.3) * s, 0, 0), sgn > 0 ? '四周 捲揚' : '', V(sgn * W / 2, 1.2, L * (0.3 - i * 0.25)), true));
        return;
      }
      const net = k !== 'film';
      const cell = k === 'insectNet' ? 0.12 : 0.3;
      sidePanels(k, C.side[k], net, cell, true, { long: true, end: true, top: H - FILM_DROP + 0.05, layer: i })
        .forEach(p => addPart(p.obj, p.ex, (p.side > 0 && !p.end) ? '四周 ' + SIDE_MATS[k] : '', p.anchor, true));
    });
  }

  // ── S 線（卡膜槽）：兩側滴水處下 0.3 米的縱向線＋前後拱線 ──
  if (isRepair) {
    const hot = hotSet.has('sLine');
    const grp = new THREE.Group();
    const m = lineMat(C.sLine, hot);
    const lg = keep(new THREE.CylinderGeometry(0.06, 0.06, L, 6)); lg.rotateX(Math.PI / 2);
    [-1, 1].forEach(sgn => { const t = new THREE.Mesh(lg, m); t.position.set(sgn * (W / 2 + 0.07), H - FILM_DROP, 0); grp.add(t); });
    const eg = tubeAlong(roofProfile(0.07).map(p => V(p[0], p[1], 0)), 0.06);
    [-1, 1].forEach(sgn => { const t = new THREE.Mesh(eg, m); t.position.z = sgn * L / 2; grp.add(t); });
    addPart(grp, V(0, 0.8 * s, 0), 'S 線（卡膜槽）', V(W / 2, H - FILM_DROP, -L * 0.3), hot);

    // ── 黑繩（壓膜繩）：每兩支拱之間跨過屋頂 ──
    const hr = hotSet.has('rope');
    const rg = tubeAlong(roofProfile(0.14).map(p => V(p[0], p[1], 0)), 0.035);
    const ropes = new THREE.InstancedMesh(rg, lineMat(C.rope, hr), hoopN - 1);
    for (let i = 0; i < hoopN - 1; i++) { mtx.makeTranslation(0, 0, -L / 2 + (L * (i + 0.5)) / (hoopN - 1)); ropes.setMatrixAt(i, mtx); }
    addPart(ropes, V(0, 3.2 * s, 0), '黑繩（壓膜繩）', V(0, H + rise + 0.14, -L * 0.25), hr);
  }

  parts.forEach(p => { p.base = p.obj.position.clone(); });

  // ── 標籤（HTML，跟著 3D 位置走） ──
  const labelBox = stage.querySelector('.gh3d-labels');
  parts.forEach(p => {
    if (!p.label) return;
    const el = document.createElement('div');
    el.className = 'gh3d-tag' + (isRepair && p.hot ? ' hot' : '') + (isRepair && !p.hot ? ' dim' : '');
    el.textContent = isRepair && p.hot ? '要換 ' + p.label : p.label;
    labelBox.appendChild(el);
    p.el = el;
  });

  // ── 相機 ──
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  // 依「爆開後」的範圍取景
  const box3 = new THREE.Box3(V(-W / 2, 0, -L / 2), V(W / 2, H + rise, L / 2));
  parts.forEach(p => { box3.expandByPoint(p.anchor.clone().add(p.ex)); });
  const ctr = box3.getCenter(new THREE.Vector3()), size = box3.getSize(new THREE.Vector3());
  const radius = size.length() / 2;
  controls.target.copy(ctr);
  const dir = V(1, 0.62, 0.78).normalize();
  camera.position.copy(ctr).addScaledVector(dir, radius / Math.sin((camera.fov / 2) * Math.PI / 180) * 0.78);
  controls.minDistance = radius * 0.6;
  controls.maxDistance = radius * 5;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  // ── 爆開動畫 ──
  let t = 0, goal = 1;           // 打開時從合起動畫到爆開
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
    t += Math.sign(goal - t) * Math.min(Math.abs(goal - t), dt * 1.6);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // easeInOut
    parts.forEach(p => p.obj.position.copy(p.base).addScaledVector(p.ex, e));
    const pulse = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(now / 280));
    hotMats.forEach(m => { m.emissiveIntensity = pulse; });
    controls.update();
    renderer.render(scene, camera);
    // 標籤
    const w = stage.clientWidth, h = stage.clientHeight;
    const placed = [];
    parts.forEach(p => {
      if (!p.el) return;
      tmp.copy(p.anchor).addScaledVector(p.ex, e).project(camera);   // anchor 是合起時的世界座標
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      p.el.style.display = vis ? '' : 'none';
      if (vis) {
        const ow = p.ow || (p.ow = p.el.offsetWidth), oh = p.oh || (p.oh = p.el.offsetHeight || 20);
        const x = Math.min(Math.max(((tmp.x + 1) / 2) * w, ow / 2 + 4), w - ow / 2 - 4);
        let y = Math.min(Math.max(((1 - tmp.y) / 2) * h, 14), h - 14);
        // 標籤互相重疊就往下挪
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
      disposables.forEach(o => { try { o.dispose(); } catch (e) { /* 忽略 */ } });
      hoops.dispose && hoops.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* 忽略 */ }
      canvas.remove();
    },
  };
}
