// 引導式表單：一步一頁
import { $, $$, esc, store, toast, fmt, num, totalArea, PING_M2, parseLatLng, needsResolve, extractUrl,
  compressImage, newCaseId, gmapUrl, workSummary, buildingsText,
  NET_OPTS, FILM_OPTS, WINCH_SIDES, ROOF_MATS, normMaterials, materialsText, winchSideOf } from './util.js';
import { sfx } from './sound.js';
import { call, queueAdd } from './api.js';
import { photoUrl } from './mapview.js';

const DRAFT_KEY = 'draft_v1';
const STEPS = 3;
const LUYE = [22.913, 121.135];

let S = null;        // 表單狀態
let fmap = null, fmarker = null, fcircle = null;
let geoTimer = null, draftTimer = null, draftWarned = false;
let submitting = false;
let onDone = () => {};

function blank() {
  return {
    mode: 'new', caseId: newCaseId(), step: 1,
    lat: null, lng: null, acc: null, address: '',
    customerName: '', phone: '', photos: [], keepPhotos: [],
    workType: '', buildings: [{ length: '', width: '', count: '' }],
    materials: { net: '', film: '', winchSide: '', roof: [] },
    existing: { length: '', width: '', count: '' },
    repair: { film: { on: false, arc: '', length: '', notMeasured: false }, net: { on: false, side: '' },
      sLine: false, winch: false, winchSide: '', blackRope: false, other: { on: false, text: '' } },
    notes: '',
  };
}

function fromCase(c) {
  const s = blank();
  const r = c.repair || {};
  Object.assign(s, {
    mode: 'edit', caseId: c.caseId, lat: c.lat, lng: c.lng, address: c.address || '',
    customerName: c.customerName || '', phone: c.phone || '', keepPhotos: [...(c.photos || [])],
    workType: c.workType || 'new', notes: c.notes || '',
  });
  if (c.workType === 'repair') {
    const b = (c.buildings || [])[0];
    if (b) s.existing = { length: b.length || '', width: b.width || '', count: b.count || '' };
    s.repair = {
      film: { on: !!r.film, arc: r.film?.arc || '', length: r.film?.length || '', notMeasured: !!r.film?.notMeasured },
      net: { on: !!r.net, side: r.net?.side || '' },
      sLine: !!r.sLine, winch: !!r.winch, winchSide: winchSideOf(r.winch), blackRope: !!r.blackRope,
      other: { on: !!r.other, text: r.other || '' },
    };
  } else if (c.buildings && c.buildings.length) {
    s.buildings = c.buildings.map(b => ({ length: b.length, width: b.width, count: b.count }));
  }
  if (c.workType !== 'repair') s.materials = normMaterials(c.materials);
  return s;
}

// ───────── 對外 ─────────
export function setOnDone(fn) { onDone = fn; }

export function hasDraft() {
  const d = store.get(DRAFT_KEY, null);
  return d && (d.customerName || d.phone || d.lat || (d.photos && d.photos.length)) ? d : null;
}

/** 開啟表單：c = 要修改的案件；useDraft = 接續草稿 */
export function openForm(c = null, useDraft = false) {
  submitting = false;
  if (c) S = fromCase(c);
  else if (useDraft && hasDraft()) S = { ...blank(), ...hasDraft(), mode: 'new' };
  else { S = blank(); store.del(DRAFT_KEY); }
  // 舊草稿（舊材料格式、捲揚沒位置）轉成新格式
  S.materials = normMaterials(S.materials);
  if (S.repair && S.repair.winch && !WINCH_SIDES.includes(S.repair.winchSide)) S.repair.winchSide = '兩側';
  S.step = 1;
  history.pushState({ v: 'form', step: 1 }, '');
  render();
}

/** 瀏覽器返回鍵 */
export function onPop(state) {
  if (!S) return;
  if (state && state.v === 'form') { S.step = state.step || 1; render(); }
}

export function currentStep() { return S ? S.step : 0; }

export function closeForm() {
  // 回到地圖：退掉表單佔用的歷史紀錄
  const n = S ? S.step : 1;
  if (S && S.mode === 'new') saveDraftNow();
  S = null;
  history.go(-n);
}

// ───────── 草稿 ─────────
function saveDraft() {
  if (!S || S.mode !== 'new') return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, 400);
}
function saveDraftNow() {
  if (!S || S.mode !== 'new') return;
  if (store.set(DRAFT_KEY, S)) return;
  // 容量不夠（照片太大）→ 只存文字
  store.set(DRAFT_KEY, { ...S, photos: [] });
  if (!draftWarned) { draftWarned = true; toast('手機暫存空間不足，草稿只保留文字，照片請送出前確認', true, 4000); }
}

// ───────── 繪製 ─────────
function render() {
  $('#progress-bar').style.width = `${(S.step / STEPS) * 100}%`;
  $('#step-label').textContent = `${S.step} / ${STEPS}`;
  $('#form-back').textContent = S.step === 1 ? '✕ 取消' : '◀ 返回';
  $('#form-next').textContent = S.step === STEPS ? (S.mode === 'edit' ? '儲存修改 ✔' : '送出 ✔') : '下一步 ▶';
  $('#form-next').disabled = false;
  const body = $('#form-body');
  body.scrollTop = 0;
  if (S.step === 1) renderStep1(body);
  if (S.step === 2) renderStep2(body);
  if (S.step === 3) renderStep3(body);
}

function errBox() { return '<div id="form-err" class="err-msg"></div>'; }
function showErr(msg) {
  const el = $('#form-err');
  if (el) { el.textContent = msg; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  toast(msg, true);
  sfx.back();
}

// 步驟 1：定位與基本資料
function renderStep1(body) {
  body.innerHTML = `
    <div class="sec-title">步驟 1　定位與基本資料</div>
    <div id="form-map"></div>
    <div id="loc-info" class="loc-info"></div>
    <div class="btn-row" style="margin-bottom:10px">
      <button class="btn small" id="btn-locate">◎ 重新定位</button>
      <a class="btn small" id="btn-gmap" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;text-decoration:none">在 Google 地圖開啟</a>
    </div>
    <div class="field">
      <label>貼上 Google 地圖或 LINE 位置的連結</label>
      <div class="paste-row">
        <input type="url" id="paste-link" placeholder="https://maps.app.goo.gl/…" inputmode="url">
        <button class="btn small" id="btn-parse">解析</button>
      </div>
    </div>
    <div class="field"><label>地址（自動帶入，可修改）</label><input type="text" id="f-address" value="${esc(S.address)}"></div>
    <div class="field"><label>客戶姓名 <span class="req">*必填</span></label><input type="text" id="f-name" value="${esc(S.customerName)}" autocomplete="off"></div>
    <div class="field"><label>電話 <span class="req">*必填</span></label><input type="tel" id="f-phone" inputmode="tel" value="${esc(S.phone)}" autocomplete="off"></div>
    <div class="field">
      <label>照片 <span class="req">*至少 1 張</span></label>
      <div class="btn-row">
        <label class="btn file-btn">📷 拍照<input type="file" accept="image/*" capture="environment" id="f-cam"></label>
        <label class="btn file-btn">🖼 相簿<input type="file" accept="image/*" multiple id="f-album"></label>
      </div>
      <div class="photo-grid" id="photo-grid"></div>
    </div>
    ${errBox()}`;

  if (fmap) { fmap.remove(); fmap = null; }
  fmap = L.map('form-map', { attributionControl: false }).setView(S.lat ? [S.lat, S.lng] : LUYE, S.lat ? 17 : 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(fmap);
  fmarker = null; fcircle = null;
  fmap.on('click', e => { sfx.beep(); setPos(e.latlng.lat, e.latlng.lng, null, true); });
  setTimeout(() => fmap && fmap.invalidateSize(), 60);
  if (S.lat) drawPos(); else locate();

  $('#btn-locate').onclick = () => { sfx.beep(); locate(); };
  $('#btn-parse').onclick = parseLink;
  $('#paste-link').addEventListener('paste', () => setTimeout(parseLink, 50));
  $('#f-address').oninput = e => { S.address = e.target.value; saveDraft(); };
  $('#f-name').oninput = e => { S.customerName = e.target.value; saveDraft(); };
  $('#f-phone').oninput = e => { S.phone = e.target.value; saveDraft(); };
  $('#f-cam').onchange = addPhotos;
  $('#f-album').onchange = addPhotos;
  renderPhotos();
  updateGmapBtn();
}

function locate() {
  const info = $('#loc-info');
  if (!navigator.geolocation) { info.textContent = '這支手機不支援定位，請點地圖或貼連結'; info.className = 'loc-info err'; return; }
  info.textContent = '定位中…（請允許位置權限）'; info.className = 'loc-info';
  navigator.geolocation.getCurrentPosition(
    p => setPos(p.coords.latitude, p.coords.longitude, p.coords.accuracy, true),
    err => {
      const el = $('#loc-info');
      if (!el) return;
      el.textContent = err.code === 1 ? '沒有位置權限：請到設定允許，或點地圖／貼連結' : '定位失敗，請按重新定位，或點地圖／貼連結';
      el.className = 'loc-info err';
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}

function setPos(lat, lng, acc, geocode) {
  S.lat = Math.round(lat * 1e6) / 1e6;
  S.lng = Math.round(lng * 1e6) / 1e6;
  S.acc = acc;
  drawPos(true);
  saveDraft();
  if (geocode) reverseGeocode();
}

function drawPos(pan) {
  if (!fmap || !S.lat) return;
  const ll = [S.lat, S.lng];
  if (!fmarker) {
    fmarker = L.marker(ll, { draggable: true, autoPan: true }).addTo(fmap);
    fmarker.on('dragend', () => { const p = fmarker.getLatLng(); sfx.beep(); setPos(p.lat, p.lng, null, true); });
  } else fmarker.setLatLng(ll);
  if (fcircle) { fcircle.remove(); fcircle = null; }
  if (S.acc) fcircle = L.circle(ll, { radius: S.acc, color: '#22e3ff', weight: 1, fillOpacity: 0.12 }).addTo(fmap);
  if (pan !== false) fmap.setView(ll, Math.max(fmap.getZoom(), 17));
  const info = $('#loc-info');
  if (info) {
    info.className = 'loc-info';
    info.textContent = `📍 ${S.lat.toFixed(6)}, ${S.lng.toFixed(6)}` + (S.acc ? `　精度約 ±${Math.round(S.acc)} 米` : '　（手動調整）') + '　大頭針可拖曳修正';
  }
  updateGmapBtn();
}

function updateGmapBtn() {
  const a = $('#btn-gmap');
  if (!a) return;
  if (S.lat) { a.href = gmapUrl(S.lat, S.lng); a.style.opacity = 1; a.style.pointerEvents = ''; }
  else { a.removeAttribute('href'); a.style.opacity = .4; a.style.pointerEvents = 'none'; }
}

function reverseGeocode() {
  clearTimeout(geoTimer);
  geoTimer = setTimeout(async () => {
    const lat = S && S.lat, lng = S && S.lng;
    if (!lat) return;
    try {
      const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=zh-TW`;
      const j = await (await fetch(u)).json();
      if (!S || S.lat !== lat) return;
      const a = j.address || {};
      const parts = [a.state, a.county || a.city, a.town || a.suburb || a.city_district, a.village || a.hamlet, a.road, a.house_number && (/號$/.test(a.house_number) ? a.house_number : a.house_number + '號')];
      let addr = parts.filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join('');
      if (!addr) addr = (j.display_name || '').split(',').map(s => s.trim()).reverse().join('');
      S.address = addr;
      const el = $('#f-address');
      if (el) el.value = addr;
      saveDraft();
    } catch (e) { /* 沒網路就讓他手打 */ }
  }, 800);
}

async function parseLink() {
  const raw = $('#paste-link').value.trim();
  if (!raw) return;
  let p = parseLatLng(raw);
  if (!p && needsResolve(raw)) {
    toast('解析短網址中…');
    try {
      const { url } = await call('resolveUrl', { url: extractUrl(raw) });
      p = parseLatLng(url);
    } catch (e) { toast('短網址解析失敗：' + e.message, true); return; }
  }
  if (!p) { sfx.back(); toast('連結裡找不到經緯度，請換一個連結或直接點地圖', true); return; }
  sfx.confirm();
  setPos(p.lat, p.lng, null, true);
  toast('已定位到連結位置');
}

async function addPhotos(e) {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  toast(`處理 ${files.length} 張照片中…`);
  for (const f of files) {
    try { S.photos.push(await compressImage(f)); }
    catch (err) { toast(err.message, true); }
  }
  sfx.beep();
  renderPhotos();
  saveDraft();
}

function renderPhotos() {
  const g = $('#photo-grid');
  if (!g) return;
  const kept = S.keepPhotos.map((id, i) => `<div class="ph" data-keep="${esc(id)}"><button data-rk="${i}" aria-label="刪除">✕</button></div>`);
  const fresh = S.photos.map((src, i) => `<div class="ph" style="background-image:url('${src}')"><button data-rn="${i}" aria-label="刪除">✕</button></div>`);
  g.innerHTML = kept.concat(fresh).join('');
  $$('[data-keep]', g).forEach(async el => {
    try { el.style.backgroundImage = `url("${await photoUrl(el.dataset.keep)}")`; } catch (e) { /* 留空 */ }
  });
  $$('[data-rk]', g).forEach(b => b.onclick = () => { sfx.back(); S.keepPhotos.splice(+b.dataset.rk, 1); renderPhotos(); });
  $$('[data-rn]', g).forEach(b => b.onclick = () => { sfx.back(); S.photos.splice(+b.dataset.rn, 1); renderPhotos(); saveDraft(); });
}

function validate1() {
  if (!S.lat || !S.lng) return '還沒定位：請按重新定位、點地圖或貼連結';
  if (!S.customerName.trim()) return '請填客戶姓名';
  if (!S.phone.trim()) return '請填電話';
  if (!/[0-9]{6,}/.test(S.phone.replace(/[^0-9]/g, ''))) return '電話號碼看起來不完整';
  if (S.photos.length + S.keepPhotos.length < 1) return '至少要 1 張照片';
  return '';
}

// 步驟 2：作業類型
const ARC_SVG = `
<svg class="arc-svg" viewBox="0 0 360 230" role="img" aria-label="弧長量法示意圖：從滴水處往下 0.3 米跨過頂部到另一側">
  <line x1="20" y1="175" x2="340" y2="175" stroke="#4a5d80" stroke-width="2"/>
  <path d="M60 175 L60 92 Q180 -8 300 92 L300 175 Z" fill="rgba(34,227,255,.06)" stroke="none"/>
  <line x1="60" y1="114" x2="60" y2="175" stroke="#8a97b0" stroke-width="4" stroke-dasharray="6 5"/>
  <line x1="300" y1="114" x2="300" y2="175" stroke="#8a97b0" stroke-width="4" stroke-dasharray="6 5"/>
  <path d="M60 114 L60 92 Q180 -8 300 92 L300 114" fill="none" stroke="#ff4d5e" stroke-width="5"/>
  <line x1="48" y1="92" x2="72" y2="92" stroke="#ffd166" stroke-width="2"/>
  <line x1="288" y1="92" x2="312" y2="92" stroke="#ffd166" stroke-width="2"/>
  <line x1="50" y1="114" x2="70" y2="114" stroke="#ff4d5e" stroke-width="2"/>
  <line x1="290" y1="114" x2="310" y2="114" stroke="#ff4d5e" stroke-width="2"/>
  <text x="44" y="96" fill="#ffd166" font-size="11" text-anchor="end">滴水處</text>
  <text x="44" y="118" fill="#ff8a95" font-size="11" text-anchor="end">下0.3米</text>
  <text x="316" y="96" fill="#ffd166" font-size="11">滴水處</text>
  <text x="316" y="118" fill="#ff8a95" font-size="11">下0.3米</text>
  <text x="180" y="78" fill="#ff4d5e" font-size="18" font-weight="700" text-anchor="middle">弧長＝紅線全長</text>
  <text x="180" y="100" fill="#ff8a95" font-size="11" text-anchor="middle">滴水處下0.3米 → 跨過頂部 → 另一側</text>
  <text x="180" y="146" fill="#8a97b0" font-size="12" text-anchor="middle">灰色虛線＝捲揚範圍（不算）</text>
  <line x1="60" y1="195" x2="300" y2="195" stroke="#22e3ff" stroke-width="2"/>
  <path d="M60 195 l10 -6 v12 z M300 195 l-10 -6 v12 z" fill="#22e3ff"/>
  <text x="180" y="219" fill="#22e3ff" font-size="14" text-anchor="middle">寬度（不是這個）</text>
</svg>`;

function unitInput(id, val, ph = '') {
  return `<div class="unit-wrap"><input type="number" inputmode="decimal" step="any" min="0" id="${id}" value="${esc(val)}" placeholder="${ph}"><span class="unit">米</span></div>`;
}

function renderStep2(body) {
  const r = S.repair;
  body.innerHTML = `
    <div class="sec-title">步驟 2　作業類型 <small>單位一律：米</small></div>
    <div class="big-choice">
      <button class="btn ${S.workType === 'new' ? 'on' : ''}" data-wt="new">🏗 新建<small>蓋新溫室</small></button>
      <button class="btn ${S.workType === 'repair' ? 'on' : ''}" data-wt="repair">🔧 維修<small>現有溫室</small></button>
    </div>
    <div id="wt-body"></div>
    ${errBox()}`;
  $$('[data-wt]', body).forEach(b => b.onclick = () => {
    sfx.beep();
    S.workType = b.dataset.wt;
    $$('[data-wt]', body).forEach(x => x.classList.toggle('on', x === b));
    renderWorkBody();
    saveDraft();
  });
  renderWorkBody();
}

function renderWorkBody() {
  const box = $('#wt-body');
  if (S.workType === 'new') renderNew(box);
  else if (S.workType === 'repair') renderRepair(box);
  else box.innerHTML = '<p class="muted" style="text-align:center">請先選「新建」或「維修」</p>';
}

function renderNew(box) {
  box.innerHTML = `
    <div class="lbl">溫室尺寸（每一種尺寸一列）</div>
    <div id="dim-rows"></div>
    <button class="btn block" id="add-row">＋ 再新增一種尺寸</button>
    <div class="total" id="total"></div>
    <div class="lbl" style="margin-top:18px">四周材料（選填）</div>
    <div class="muted" style="font-size:14px;margin-bottom:6px">通常兩層：網在內（固定）＋膜在外。再按一次可取消</div>
    <div class="lbl">網（內層，單選）</div>
    <div class="radio-row">${Object.entries(NET_OPTS).map(([k, v]) => optBtn('net', k, v, S.materials.net === k)).join('')}</div>
    <div class="lbl" style="margin-top:10px">膜（外層，單選）</div>
    <div class="radio-row">${Object.entries(FILM_OPTS).map(([k, v]) => optBtn('film', k, v, S.materials.film === k)).join('')}</div>
    <div class="sub ${S.materials.film === 'winch' ? '' : 'hidden'}" id="sub-mwinch">
      <div class="lbl">捲揚位置</div>
      <div class="radio-row">${WINCH_SIDES.map(v => optBtn('winchSide', v, v, S.materials.winchSide === v)).join('')}</div>
    </div>
    <div class="lbl" style="margin-top:14px">屋頂材料（可複選）</div>
    <div class="mat-grid">${Object.entries(ROOF_MATS).map(([k, v]) => matCheck(k, v)).join('')}</div>`;
  $$('[data-opt]', box).forEach(b => b.onclick = () => {
    sfx.beep();
    const [g, v] = b.dataset.opt.split(':');
    if (g === 'winchSide') S.materials.winchSide = v;
    else S.materials[g] = S.materials[g] === v ? '' : v;   // 再按一次同一顆＝取消（材料是選填）
    if (g === 'film') S.materials.winchSide = S.materials.film === 'winch' ? (S.materials.winchSide || '兩側') : '';
    ['net', 'film', 'winchSide'].forEach(gr => $$(`[data-opt^="${gr}:"]`, box).forEach(x => x.classList.toggle('on', x.dataset.opt === `${gr}:${S.materials[gr]}`)));
    $('#sub-mwinch').classList.toggle('hidden', S.materials.film !== 'winch');
    saveDraft();
  });
  $$('[data-mat]', box).forEach(cb => cb.onchange = () => {
    sfx.beep();
    const k = cb.dataset.mat;
    const list = S.materials.roof = (S.materials.roof || []).filter(x => x !== k);
    if (cb.checked) list.push(k);
    cb.parentElement.classList.toggle('on', cb.checked);
    saveDraft();
  });
  const rows = $('#dim-rows');
  const draw = () => {
    rows.innerHTML = S.buildings.map((b, i) => `
      <div class="dim-row" data-i="${i}">
        <div><div class="lbl">長度(米)</div><input type="number" inputmode="decimal" step="any" min="0" data-k="length" value="${esc(b.length)}"></div>
        <div><div class="lbl">寬度(米)</div><input type="number" inputmode="decimal" step="any" min="0" data-k="width" value="${esc(b.width)}"></div>
        <div><div class="lbl">棟數</div><input type="number" inputmode="numeric" step="1" min="1" data-k="count" value="${esc(b.count)}"></div>
        <button class="del" aria-label="刪除這列" ${S.buildings.length === 1 ? 'disabled style="opacity:.3"' : ''}>✕</button>
      </div>`).join('');
    $$('.dim-row', rows).forEach(row => {
      const i = +row.dataset.i;
      $$('input', row).forEach(inp => inp.oninput = () => { S.buildings[i][inp.dataset.k] = inp.value; updateTotal(); saveDraft(); });
      $('.del', row).onclick = () => { if (S.buildings.length > 1) { sfx.back(); S.buildings.splice(i, 1); draw(); updateTotal(); saveDraft(); } };
    });
  };
  const updateTotal = () => {
    const a = totalArea(S.buildings);
    $('#total').innerHTML = `總面積　<b>${fmt(a)}</b> 平方米（㎡）<br>　　　　<b>${fmt(a / PING_M2)}</b> 坪`;
  };
  $('#add-row').onclick = () => { sfx.beep(); S.buildings.push({ length: '', width: '', count: '' }); draw(); saveDraft(); };
  draw(); updateTotal();
}

function matCheck(k, label) {
  const on = (S.materials?.roof || []).includes(k);
  return `<label class="check ${on ? 'on' : ''}"><input type="checkbox" data-mat="${k}" ${on ? 'checked' : ''}>${label}</label>`;
}

function optBtn(group, val, label, on) {
  return `<button type="button" class="btn ${on ? 'on' : ''}" data-opt="${group}:${val}">${label}</button>`;
}

function renderRepair(box) {
  const r = S.repair;
  box.innerHTML = `
    <div class="lbl">現有溫室（選填）</div>
    <div class="three" style="margin-bottom:16px">
      <div><div class="lbl">長度</div>${unitInput('ex-length', S.existing.length)}</div>
      <div><div class="lbl">寬度</div>${unitInput('ex-width', S.existing.width)}</div>
      <div><div class="lbl">棟數</div><input type="number" inputmode="numeric" min="1" id="ex-count" value="${esc(S.existing.count)}"></div>
    </div>
    <div class="lbl">維修項目（可複選）</div>

    <label class="check ${r.film.on ? 'on' : ''}"><input type="checkbox" data-item="film" ${r.film.on ? 'checked' : ''}>更換農膜</label>
    <div class="sub ${r.film.on ? '' : 'hidden'}" id="sub-film">
      <div class="field">
        <label>弧長（米）</label>
        <div class="warn-red">請填弧長：從一側滴水處往下 0.3 米（30 公分），跨過頂部量到另一側同樣位置。不是溫室寬度；滴水處以下屬於「更換捲揚」</div>
        ${ARC_SVG}
        ${unitInput('film-arc', r.film.arc)}
      </div>
      <div class="field"><label>長度（米）</label>${unitInput('film-length', r.film.length)}</div>
      <label class="check ${r.film.notMeasured ? 'on' : ''}"><input type="checkbox" id="film-nm" ${r.film.notMeasured ? 'checked' : ''}>現場沒量到，之後補</label>
    </div>

    <label class="check ${r.net.on ? 'on' : ''}"><input type="checkbox" data-item="net" ${r.net.on ? 'checked' : ''}>維修網子</label>
    <div class="sub ${r.net.on ? '' : 'hidden'}" id="sub-net">
      <div class="radio-row">${['兩側', '前後', '四周'].map(s => `<button class="btn ${r.net.side === s ? 'on' : ''}" data-side="${s}">${s}</button>`).join('')}</div>
    </div>

    <label class="check ${r.sLine ? 'on' : ''}"><input type="checkbox" data-flag="sLine" ${r.sLine ? 'checked' : ''}>更換 S 線</label>
    <label class="check ${r.winch ? 'on' : ''}"><input type="checkbox" data-flag="winch" ${r.winch ? 'checked' : ''}>更換捲揚</label>
    <div class="sub ${r.winch ? '' : 'hidden'}" id="sub-winch">
      <div class="lbl">捲揚位置（滴水處以下）</div>
      <div class="radio-row">${WINCH_SIDES.map(v => `<button type="button" class="btn ${r.winchSide === v ? 'on' : ''}" data-wside="${v}">${v}</button>`).join('')}</div>
    </div>
    <label class="check ${r.blackRope ? 'on' : ''}"><input type="checkbox" data-flag="blackRope" ${r.blackRope ? 'checked' : ''}>更換黑繩</label>

    <label class="check ${r.other.on ? 'on' : ''}"><input type="checkbox" data-item="other" ${r.other.on ? 'checked' : ''}>其他</label>
    <div class="sub ${r.other.on ? '' : 'hidden'}" id="sub-other">
      <input type="text" id="other-text" value="${esc(r.other.text)}" placeholder="請描述要修什麼">
    </div>`;

  const bindNum = (id, set) => { $('#' + id).oninput = e => { set(e.target.value); saveDraft(); }; };
  bindNum('ex-length', v => S.existing.length = v);
  bindNum('ex-width', v => S.existing.width = v);
  bindNum('ex-count', v => S.existing.count = v);
  bindNum('film-arc', v => r.film.arc = v);
  bindNum('film-length', v => r.film.length = v);
  $('#other-text').oninput = e => { r.other.text = e.target.value; saveDraft(); };

  $$('[data-item]', box).forEach(cb => cb.onchange = () => {
    sfx.beep();
    const k = cb.dataset.item;
    r[k].on = cb.checked;
    cb.parentElement.classList.toggle('on', cb.checked);
    $('#sub-' + k).classList.toggle('hidden', !cb.checked);
    saveDraft();
  });
  $$('[data-flag]', box).forEach(cb => cb.onchange = () => {
    sfx.beep();
    r[cb.dataset.flag] = cb.checked;
    cb.parentElement.classList.toggle('on', cb.checked);
    if (cb.dataset.flag === 'winch') {
      if (cb.checked && !r.winchSide) r.winchSide = '兩側';
      $$('[data-wside]', box).forEach(x => x.classList.toggle('on', x.dataset.wside === r.winchSide));
      $('#sub-winch').classList.toggle('hidden', !cb.checked);
    }
    saveDraft();
  });
  $$('[data-wside]', box).forEach(b => b.onclick = () => {
    sfx.beep();
    r.winchSide = b.dataset.wside;
    $$('[data-wside]', box).forEach(x => x.classList.toggle('on', x === b));
    saveDraft();
  });
  $('#film-nm').onchange = e => { sfx.beep(); r.film.notMeasured = e.target.checked; e.target.parentElement.classList.toggle('on', e.target.checked); saveDraft(); };
  $$('[data-side]', box).forEach(b => b.onclick = () => {
    sfx.beep();
    r.net.side = b.dataset.side;
    $$('[data-side]', box).forEach(x => x.classList.toggle('on', x === b));
    saveDraft();
  });
}

function validate2() {
  if (!S.workType) return '請選「新建」或「維修」';
  if (S.workType === 'new') {
    for (const [i, b] of S.buildings.entries()) {
      if (!(num(b.length) > 0) || !(num(b.width) > 0) || !(num(b.count) > 0)) return `第 ${i + 1} 列的長度、寬度、棟數都要填（大於 0）`;
    }
    return '';
  }
  const r = S.repair;
  if (!r.film.on && !r.net.on && !r.sLine && !r.winch && !r.blackRope && !r.other.on) return '請至少勾一個維修項目';
  if (r.film.on && !r.film.notMeasured && (!(num(r.film.arc) > 0) || !(num(r.film.length) > 0)))
    return '更換農膜：請填弧長和長度；現場沒量到就勾「之後補」';
  if (r.net.on && !r.net.side) return '維修網子：請選兩側／前後／四周';
  if (r.other.on && !r.other.text.trim()) return '「其他」請寫要修什麼';
  return '';
}

// 步驟 3：確認與送出
function buildCase() {
  const c = {
    customerName: S.customerName.trim(), phone: S.phone.trim(), lat: S.lat, lng: S.lng, address: S.address.trim(),
    workType: S.workType, notes: S.notes.trim(), buildings: [], repair: null,
  };
  if (S.workType === 'new') {
    c.buildings = S.buildings.map(b => ({ length: num(b.length), width: num(b.width), count: num(b.count) }));
    c.materials = normMaterials(S.materials);
  } else {
    c.materials = null;
    const e = S.existing;
    if (num(e.length) || num(e.width) || num(e.count)) c.buildings = [{ length: num(e.length), width: num(e.width), count: num(e.count) }];
    const r = S.repair, out = {};
    if (r.film.on) out.film = r.film.notMeasured ? { arc: num(r.film.arc), length: num(r.film.length), notMeasured: true } : { arc: num(r.film.arc), length: num(r.film.length), notMeasured: false };
    if (r.net.on) out.net = { side: r.net.side };
    if (r.sLine) out.sLine = true;
    if (r.winch) out.winch = { side: WINCH_SIDES.includes(r.winchSide) ? r.winchSide : '兩側' };
    if (r.blackRope) out.blackRope = true;
    if (r.other.on) out.other = r.other.text.trim();
    c.repair = out;
  }
  return c;
}

function renderStep3(body) {
  const c = buildCase();
  const r = c.repair || {};
  const area = totalArea(c.buildings);
  body.innerHTML = `
    <div class="sec-title">步驟 3　確認與送出</div>
    <div class="field"><label>備註</label><textarea id="f-notes" placeholder="現場狀況、客戶需求…">${esc(S.notes)}</textarea></div>
    <div class="summary">
      <h3>◆ 案件摘要</h3>
      <dl class="kv">
        <dt>客戶</dt><dd>${esc(c.customerName)}</dd>
        <dt>電話</dt><dd>${esc(c.phone)}</dd>
        <dt>地址</dt><dd>${esc(c.address || '—')}</dd>
        <dt>座標</dt><dd>${c.lat}, ${c.lng}</dd>
        <dt>照片</dt><dd>${S.photos.length + S.keepPhotos.length} 張</dd>
        <dt>作業</dt><dd>${c.workType === 'new' ? '新建' : '維修'}</dd>
        ${c.workType === 'new'
          ? `<dt>尺寸</dt><dd>${buildingsText(c.buildings)}</dd><dt>總面積</dt><dd>${fmt(area)} ㎡（${fmt(area / PING_M2)} 坪）</dd>
             <dt>四周材料</dt><dd>${materialsText(c.materials, 'side') || '未選'}</dd>
             <dt>屋頂材料</dt><dd>${materialsText(c.materials, 'roof') || '未選'}</dd>`
          : `${c.buildings.length ? `<dt>現有溫室</dt><dd>${buildingsText(c.buildings)}</dd>` : ''}<dt>維修項目</dt><dd>${esc(workSummary(c).replace(/^維修：/, ''))}</dd>`}
      </dl>
      <div class="muted" style="font-size:14px">所有尺寸單位：米</div>
    </div>
    ${errBox()}`;
  $('#f-notes').oninput = e => { S.notes = e.target.value; saveDraft(); };
}

// ───────── 按鈕 ─────────
export function next() {
  if (!S || submitting) return;
  const err = S.step === 1 ? validate1() : S.step === 2 ? validate2() : '';
  if (err) return showErr(err);
  if (S.step < STEPS) {
    sfx.confirm();
    S.step++;
    history.pushState({ v: 'form', step: S.step }, '');
    saveDraft();
    render();
  } else submit();
}

export function back() {
  if (!S) return;
  sfx.back();
  if (S.step === 1) closeForm();
  else history.back();
}

async function submit() {
  submitting = true;
  const btn = $('#form-next');
  btn.disabled = true; btn.textContent = '送出中…';
  const isEdit = S.mode === 'edit';
  const payload = {
    action: isEdit ? 'updateCase' : 'createCase',
    data: { caseId: S.caseId, case: buildCase(), photos: S.photos.map(p => p.replace(/^data:image\/\w+;base64,/, '')), keepPhotos: S.keepPhotos },
  };
  const steps = S.step;
  try {
    const res = await call(payload.action, payload.data);
    finish(steps, isEdit, false, res.case);
  } catch (e) {
    if (e.network && !isEdit) {
      try {
        await queueAdd({ id: S.caseId, action: payload.action, data: payload.data, label: S.customerName, at: Date.now() });
        finish(steps, isEdit, true);
        return;
      } catch (qe) { e = qe; }
    }
    submitting = false;
    btn.disabled = false; btn.textContent = isEdit ? '儲存修改 ✔' : '送出 ✔';
    showErr((e.network ? '沒有訊號，修改沒送出，請有訊號再按一次' : '送出失敗：') + (e.network ? '' : e.message));
  }
}

function finish(steps, isEdit, queued, saved) {
  if (!isEdit) store.del(DRAFT_KEY);
  const name = S.customerName;
  S = null;
  if (fmap) { fmap.remove(); fmap = null; }
  sfx.success();
  onDone({ steps, isEdit, queued, name, saved });
}
