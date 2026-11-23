// 雷達主畫面：地圖、篩選、列表、底部案件卡片
import { $, $$, esc, store, toast, fmt, STATUS, STATUS_KEYS, isStale, daysSince, fmtDate,
  workSummary, buildingsText, totalArea, PING_M2, navUrl, materialsText, winchSideOf, TILE_URL, TILE_OPTS } from './util.js';
import { ICON } from './icons.js';
import { mountGreenhouse } from './greenhouse3d.js';
import { sfx } from './sound.js';
import { call } from './api.js';

const LUYE = [22.913, 121.135]; // 鹿野鄉中心

let map, layer;
let cases = [];
let users = [];
let me = null;
let filters = store.get('filters', { survey: true, building: true, done: true, dropped: false });
let listMode = false;
let currentId = null;
let gh = null; // 3D 爆炸圖
function killGh() { if (gh) { gh.dispose(); gh = null; } }
const photoCache = new Map();
let hooks = { onEdit: () => {}, onChanged: () => {} };

export function initMap(user, h) {
  me = user;
  hooks = { ...hooks, ...h };
  map = L.map('map', { zoomControl: true, attributionControl: true }).setView(LUYE, 13);
  map.zoomControl.setPosition('bottomright');
  L.tileLayer(TILE_URL, TILE_OPTS).addTo(map);
  layer = L.layerGroup().addTo(map);

  $('#btn-mylocation').onclick = locateMe;
  $('#btn-toggle-list').onclick = () => { sfx.beep(); setList(!listMode); };
  $('#sheet-backdrop').onclick = () => { sfx.back(); closeSheet(); };
  setList(false);
  bindSheetDrag();
  renderFilters();
}

// ───────── 回到我的位置 ─────────
let meLayer = null;
let locating = false;
function locateMe() {
  sfx.beep();
  if (locating) return;
  const btn = $('#btn-mylocation');
  if (!navigator.geolocation) { toast('這台裝置不支援定位', true); return; }
  locating = true;
  btn.classList.add('busy');
  const done = () => { locating = false; btn.classList.remove('busy'); };
  navigator.geolocation.getCurrentPosition(pos => {
    done();
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    if (!meLayer) meLayer = L.layerGroup().addTo(map);
    meLayer.clearLayers();
    L.circle([lat, lng], { radius: accuracy, color: '#0a84ff', weight: 1, fillColor: '#0a84ff', fillOpacity: .14, interactive: false }).addTo(meLayer);
    L.marker([lat, lng], { icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="me-dot"></div>' }),
      interactive: false, keyboard: false, zIndexOffset: -100 }).addTo(meLayer);
    if (listMode) setList(false);
    map.flyTo([lat, lng], Math.max(16, Math.min(map.getZoom(), 18)), { duration: .8 });
    if (accuracy > 200) toast(`定位誤差約 ${Math.round(accuracy)} 米，位置可能不準`);
  }, err => {
    done();
    toast(err.code === 1 ? '沒有定位權限，請到設定允許定位' : err.code === 3 ? '定位逾時，請到空曠處再試' : '抓不到位置，請稍後再試', true);
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

export function invalidate() { if (map) setTimeout(() => map.invalidateSize(), 50); }

export function setCases(list, fit = false) {
  cases = list || [];
  renderFilters();
  renderMarkers();
  renderList();
  if (fit) fitAll();
  if (currentId) {
    const c = cases.find(x => x.caseId === currentId);
    if (c) renderSheet(c); else closeSheet();
  }
}

export function setUsers(list) { users = list || []; }

function visible() { return cases.filter(c => filters[c.status] !== false && STATUS[c.status]); }

function fitAll() {
  const pts = visible().filter(c => c.lat && c.lng).map(c => [c.lat, c.lng]);
  if (pts.length === 1) map.setView(pts[0], 15);
  else if (pts.length > 1) map.fitBounds(pts, { padding: [50, 50], maxZoom: 15 });
}

function renderFilters() {
  const box = $('#filters');
  box.innerHTML = STATUS_KEYS.map(k => {
    const n = cases.filter(c => c.status === k).length;
    return `<button class="chip ${filters[k] ? '' : 'off'}" data-k="${k}">
      <span class="dot" style="background:${STATUS[k].color}"></span>${STATUS[k].short}<span class="n">${n}</span></button>`;
  }).join('');
  $$('.chip', box).forEach(b => b.onclick = () => {
    sfx.beep();
    const k = b.dataset.k;
    filters[k] = !filters[k];
    store.set('filters', filters);
    renderFilters(); renderMarkers(); renderList();
  });
}

function renderMarkers() {
  layer.clearLayers();
  visible().forEach(c => {
    if (!c.lat || !c.lng) return;
    const icon = L.divIcon({
      className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<div class="pin ${c.status} ${isStale(c) ? 'stale' : ''}"></div>`,
    });
    L.marker([c.lat, c.lng], { icon, title: c.customerName })
      .on('click', () => { sfx.pop(); openSheet(c.caseId); })
      .addTo(layer);
  });
}

function setList(on) {
  listMode = on;
  $('#list').classList.toggle('hidden', !on);
  $('#btn-toggle-list').innerHTML = on ? ICON.map({ size: 18 }) + '地圖' : ICON.list({ size: 18 }) + '列表';
  if (!on) invalidate();
}

function renderList() {
  const order = { survey: 0, building: 1, done: 2, dropped: 3 };
  const list = visible().slice().sort((a, b) =>
    (isStale(b) - isStale(a)) || (order[a.status] - order[b.status]) ||
    (new Date(b.statusUpdatedAt) - new Date(a.statusUpdatedAt)));
  const box = $('#list');
  if (!list.length) { box.innerHTML = '<p class="muted" style="text-align:center;margin-top:40px">沒有符合篩選的案件</p>'; return; }
  box.innerHTML = '<div class="group">' + list.map(c => `
    <div class="row-item" data-id="${esc(c.caseId)}">
      <span class="sdot" style="background:${STATUS[c.status].color}"></span>
      <div class="grow">
        <div class="t">${esc(c.customerName)} <span class="status-tag">${STATUS[c.status].short}</span></div>
        <div class="s">${esc(workSummary(c))}</div>
        <div class="s">${esc(c.address || '')}</div>
        ${isStale(c) ? `<div class="stale-tag">${ICON.warn({ size: 14 })} ${daysSince(c.statusUpdatedAt)} 天沒更新</div>` : ''}
      </div>
      <span class="chev">${ICON.chevron({ size: 16 })}</span>
    </div>`).join('') + '</div>';
  $$('.row-item', box).forEach(el => el.onclick = () => {
    sfx.pop();
    const c = cases.find(x => x.caseId === el.dataset.id);
    setList(false);
    if (c && c.lat) map.setView([c.lat, c.lng], Math.max(map.getZoom(), 15));
    openSheet(el.dataset.id);
  });
}

// ───────── 案件卡片 ─────────
export function openSheet(id) {
  const c = cases.find(x => x.caseId === id);
  if (!c) return;
  currentId = id;
  renderSheet(c);
  $('#sheet-backdrop').classList.remove('hidden');
  $('#sheet').classList.add('open');
  $('#sheet').scrollTop = 0;
}

export function closeSheet() {
  currentId = null;
  killGh();
  $('#sheet').classList.remove('open');
  $('#sheet-backdrop').classList.add('hidden');
}

export function sheetOpen() { return !!currentId; }

function canEdit(c) {
  if (me.role === 'admin') return true;
  return c.createdBy === me.lineUserId && c.status === 'survey';
}

function renderSheet(c) {
  const st = STATUS[c.status] || STATUS.survey;
  const isAdmin = me.role === 'admin';
  const area = totalArea(c.buildings);
  const r = c.repair || {};
  const repairRows = c.workType === 'repair' ? `
    ${c.buildings && c.buildings.length ? `<dt>現有溫室</dt><dd>${buildingsText(c.buildings)}</dd>` : ''}
    ${r.film ? `<dt>更換農膜</dt><dd>${r.film.notMeasured ? '<span style="color:var(--red)">現場沒量到，之後補</span>' : `弧長 ${fmt(r.film.arc)} 米 × 長度 ${fmt(r.film.length)} 米`}</dd>` : ''}
    ${r.net ? `<dt>維修網子</dt><dd>${esc(r.net.side)}</dd>` : ''}
    ${r.winch ? `<dt>更換捲揚</dt><dd>${esc(winchSideOf(r.winch))}</dd>` : ''}
    ${[r.sLine && '更換 S 線', r.blackRope && '更換黑繩'].filter(Boolean).length
      ? `<dt>其他項目</dt><dd>${[r.sLine && '更換 S 線', r.blackRope && '更換黑繩'].filter(Boolean).join('、')}</dd>` : ''}
    ${r.other ? `<dt>其他</dt><dd>${esc(r.other)}</dd>` : ''}` : `
    <dt>尺寸</dt><dd>${buildingsText(c.buildings) || '—'}</dd>
    <dt>總面積</dt><dd>${fmt(area)} ㎡（${fmt(area / PING_M2)} 坪）</dd>
    <dt>四周材料</dt><dd>${materialsText(c.materials, 'side') || '—'}</dd>
    <dt>屋頂材料</dt><dd>${materialsText(c.materials, 'roof') || '—'}</dd>
    <dt>門</dt><dd>${materialsText(c.materials, 'door')}</dd>`;

  killGh();
  $('#sheet-body').innerHTML = `
    <div class="sheet-head">
      <div>
        <h2>${esc(c.customerName)}</h2>
        <span class="status-tag"><i style="background:${st.color}"></i>${st.label}</span>
        ${isStale(c) ? `<span class="stale-tag" style="margin-left:6px">${ICON.warn({ size: 14 })} ${daysSince(c.statusUpdatedAt)} 天沒更新</span>` : ''}
      </div>
      <button class="icon-btn round-btn" id="sheet-close" aria-label="關閉">${ICON.close({ size: 14 })}</button>
    </div>
    <div class="btn-row" style="margin-top:14px">
      <a class="btn primary" href="${navUrl(c.lat, c.lng)}" target="_blank" rel="noopener">${ICON.nav({ size: 18 })}導航</a>
      <a class="btn" href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}">${ICON.phone({ size: 18 })}撥打電話</a>
    </div>
    <dl class="kv">
      <dt>電話</dt><dd>${esc(c.phone)}</dd>
      <dt>地址</dt><dd>${esc(c.address || '—')}</dd>
      <dt>作業</dt><dd>${c.workType === 'repair' ? '維修' : '新建'}</dd>
      ${repairRows}
      ${c.notes ? `<dt>備註</dt><dd>${esc(c.notes).replace(/\n/g, '<br>')}</dd>` : ''}
      <dt>下一步</dt><dd>${esc(c.nextAction || '—')}</dd>
      <dt>負責人</dt><dd>${esc(c.owner || '—')}</dd>
      <dt>期限</dt><dd>${esc(c.dueDate || '—')}</dd>
      <dt>填寫人</dt><dd>${esc(c.createdByName || '')}・${fmtDate(c.createdAt)}</dd>
      <dt>狀態更新</dt><dd>${fmtDate(c.statusUpdatedAt)}</dd>
    </dl>
    <div id="gh3d-box"></div>
    <div class="lbl">照片（${(c.photos || []).length}）</div>
    <div class="photos">${(c.photos || []).map(id => `<div class="ph" data-photo="${esc(id)}">載入中…</div>`).join('') || '<span class="muted">沒有照片</span>'}</div>
    ${canEdit(c) ? `<button class="btn block" id="sheet-edit">${ICON.pencil({ size: 18 })}修改案件資料</button>` : ''}
    ${isAdmin ? adminBox(c) : ''}
  `;
  $('#sheet-close').onclick = () => { sfx.back(); closeSheet(); };
  const editBtn = $('#sheet-edit');
  if (editBtn) editBtn.onclick = () => { sfx.confirm(); const cc = c; closeSheet(); hooks.onEdit(cc); };
  loadPhotos(c);
  gh = mountGreenhouse($('#gh3d-box'), c);
  if (isAdmin) bindAdmin(c);
}

function adminBox(c) {
  const opts = users.map(u => `<option ${u.name === c.owner ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  const ownerExtra = c.owner && !users.some(u => u.name === c.owner) ? `<option selected>${esc(c.owner)}</option>` : '';
  return `
    <div class="admin-box">
      <h3>管理員</h3>
      <div class="lbl">狀態</div>
      <div class="seg" id="adm-status">
        ${STATUS_KEYS.map(k => `<button class="btn ${c.status === k ? 'on' : ''}" data-k="${k}"><span class="sdot" style="background:${STATUS[k].color}"></span>${STATUS[k].short}</button>`).join('')}
      </div>
      <div class="field"><label>下一步</label><input type="text" id="adm-next" value="${esc(c.nextAction)}" placeholder="例如：週五前送報價"></div>
      <div class="two">
        <div class="field"><label>負責人</label><select id="adm-owner"><option value="">（未指定）</option>${ownerExtra}${opts}</select></div>
        <div class="field"><label>期限</label><input type="date" id="adm-due" value="${esc(c.dueDate)}"></div>
      </div>
      <button class="btn primary block" id="adm-save">儲存</button>
      <button class="btn danger block" id="adm-del">刪除案件</button>
    </div>`;
}

function bindAdmin(c) {
  let status = c.status;
  $$('#adm-status .btn').forEach(b => b.onclick = () => {
    sfx.beep();
    status = b.dataset.k;
    $$('#adm-status .btn').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#adm-save').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = '儲存中…';
    try {
      const { case: upd } = await call('adminUpdate', {
        caseId: c.caseId, status, nextAction: $('#adm-next').value, owner: $('#adm-owner').value, dueDate: $('#adm-due').value,
      });
      sfx.confirm();
      toast('已儲存');
      hooks.onChanged(upd);
    } catch (err) {
      toast('儲存失敗：' + err.message, true);
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
  $('#adm-del').onclick = async () => {
    if (!confirm(`確定刪除「${c.customerName}」這個案件？照片也會一起移到垃圾桶。`)) return;
    try {
      await call('deleteCase', { caseId: c.caseId });
      sfx.back();
      toast('已刪除');
      closeSheet();
      hooks.onChanged(null, c.caseId);
    } catch (err) { toast('刪除失敗：' + err.message, true); }
  };
}

export async function photoUrl(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const { mime, data } = await call('getPhoto', { fileId: id });
  const url = `data:${mime || 'image/jpeg'};base64,${data}`;
  photoCache.set(id, url);
  return url;
}

function loadPhotos(c) {
  $$('#sheet-body [data-photo]').forEach(async el => {
    const id = el.dataset.photo;
    try {
      const url = await photoUrl(id);
      el.textContent = '';
      el.style.backgroundImage = `url("${url}")`;
      el.onclick = () => showLightbox(url);
    } catch (e) { el.textContent = '載入失敗'; }
  });
}

function showLightbox(url) {
  const lb = document.createElement('div');
  lb.id = 'lightbox';
  lb.innerHTML = `<img src="${url}" alt="照片">`;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
}

// ───────── 底部卡片：拖曳 grabber／在頂端往下滑就關閉 ─────────
function bindSheetDrag() {
  const sheet = $('#sheet');
  let y0 = 0, dy = 0, dragging = false, startedOnGrip = false;
  sheet.addEventListener('touchstart', e => {
    if (!sheet.classList.contains('open')) return;
    if (e.target.closest('.gh3d-stage, input, select, textarea, .photos')) return;   // 3D 要拿來轉，不搶
    startedOnGrip = !!e.target.closest('.grip, .sheet-head');
    if (!startedOnGrip && sheet.scrollTop > 0) return;
    y0 = e.touches[0].clientY; dy = 0; dragging = true;
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (!dragging) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0 || (!startedOnGrip && sheet.scrollTop > 0)) { if (dy < 0) { dragging = false; sheet.classList.remove('dragging'); sheet.style.transform = ''; } return; }
    sheet.classList.add('dragging');
    sheet.style.transform = `translateY(${dy}px)`;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('dragging');
    sheet.style.transform = '';
    if (dy > 110) { sfx.back(); closeSheet(); }
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}
