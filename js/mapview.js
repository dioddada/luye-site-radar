// 雷達主畫面：地圖、篩選、列表、底部案件卡片
import { $, $$, esc, store, toast, fmt, STATUS, STATUS_KEYS, isStale, daysSince, fmtDate,
  workSummary, buildingsText, totalArea, PING_M2, navUrl } from './util.js';
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
const photoCache = new Map();
let hooks = { onEdit: () => {}, onChanged: () => {} };

export function initMap(user, h) {
  me = user;
  hooks = { ...hooks, ...h };
  map = L.map('map', { zoomControl: true, attributionControl: true }).setView(LUYE, 13);
  map.zoomControl.setPosition('bottomright');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  layer = L.layerGroup().addTo(map);

  $('#btn-toggle-list').onclick = () => { sfx.beep(); setList(!listMode); };
  $('#sheet-backdrop').onclick = () => { sfx.back(); closeSheet(); };
  renderFilters();
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
      className: '', iconSize: [22, 22], iconAnchor: [11, 11],
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
  $('#btn-toggle-list').textContent = on ? '🗺 地圖' : '☰ 列表';
  if (!on) invalidate();
}

function renderList() {
  const order = { survey: 0, building: 1, done: 2, dropped: 3 };
  const list = visible().slice().sort((a, b) =>
    (isStale(b) - isStale(a)) || (order[a.status] - order[b.status]) ||
    (new Date(b.statusUpdatedAt) - new Date(a.statusUpdatedAt)));
  const box = $('#list');
  if (!list.length) { box.innerHTML = '<p class="muted" style="text-align:center;margin-top:40px">沒有符合篩選的案件</p>'; return; }
  box.innerHTML = list.map(c => `
    <div class="row-item" data-id="${esc(c.caseId)}" style="border-left-color:${STATUS[c.status].color}">
      <div class="grow">
        <div class="t">${esc(c.customerName)} <span class="status-tag" style="background:${STATUS[c.status].color}">${STATUS[c.status].short}</span></div>
        <div class="s">${esc(workSummary(c))}</div>
        <div class="s">${esc(c.address || '')}</div>
        ${isStale(c) ? `<div class="stale-tag">⚠ ${daysSince(c.statusUpdatedAt)} 天沒更新</div>` : ''}
      </div>
      <div class="muted">›</div>
    </div>`).join('');
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
    ${[r.sLine && '更換 S 線', r.winch && '更換捲揚', r.blackRope && '更換黑繩'].filter(Boolean).length
      ? `<dt>其他項目</dt><dd>${[r.sLine && '更換 S 線', r.winch && '更換捲揚', r.blackRope && '更換黑繩'].filter(Boolean).join('、')}</dd>` : ''}
    ${r.other ? `<dt>其他</dt><dd>${esc(r.other)}</dd>` : ''}` : `
    <dt>尺寸</dt><dd>${buildingsText(c.buildings) || '—'}</dd>
    <dt>總面積</dt><dd>${fmt(area)} ㎡（${fmt(area / PING_M2)} 坪）</dd>`;

  $('#sheet-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div>
        <h2 style="margin:0">${esc(c.customerName)}</h2>
        <span class="status-tag" style="background:${st.color}">${st.emoji} ${st.label}</span>
        ${isStale(c) ? `<span class="stale-tag" style="color:var(--red);font-weight:700;margin-left:6px">⚠ ${daysSince(c.statusUpdatedAt)} 天沒更新</span>` : ''}
      </div>
      <button class="icon-btn" id="sheet-close" aria-label="關閉">✕</button>
    </div>
    <div class="btn-row" style="margin-top:12px">
      <a class="btn primary" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="${navUrl(c.lat, c.lng)}" target="_blank" rel="noopener">🧭 導航</a>
      <a class="btn" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}">📞 撥打電話</a>
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
    <div class="lbl">照片（${(c.photos || []).length}）</div>
    <div class="photos">${(c.photos || []).map(id => `<div class="ph" data-photo="${esc(id)}">載入中…</div>`).join('') || '<span class="muted">沒有照片</span>'}</div>
    ${canEdit(c) ? `<button class="btn block" id="sheet-edit">✎ 修改案件資料</button>` : ''}
    ${isAdmin ? adminBox(c) : ''}
  `;
  $('#sheet-close').onclick = () => { sfx.back(); closeSheet(); };
  const editBtn = $('#sheet-edit');
  if (editBtn) editBtn.onclick = () => { sfx.confirm(); const cc = c; closeSheet(); hooks.onEdit(cc); };
  loadPhotos(c);
  if (isAdmin) bindAdmin(c);
}

function adminBox(c) {
  const opts = users.map(u => `<option ${u.name === c.owner ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  const ownerExtra = c.owner && !users.some(u => u.name === c.owner) ? `<option selected>${esc(c.owner)}</option>` : '';
  return `
    <div class="admin-box">
      <h3>◆ 管理員</h3>
      <div class="lbl">狀態</div>
      <div class="seg" id="adm-status">
        ${STATUS_KEYS.map(k => `<button class="btn ${c.status === k ? 'on' : ''}" data-k="${k}" style="border-left:5px solid ${STATUS[k].color}">${STATUS[k].short}</button>`).join('')}
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
