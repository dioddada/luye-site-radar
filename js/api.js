// 登入（LIFF）、呼叫 Apps Script、離線佇列、測試模式
import { store, newCaseId } from './util.js';

const cfg = window.APP_CONFIG || {};
const params = new URLSearchParams(location.search);
export const MOCK = params.has('mock');
export const CONFIGURED = !!(cfg.LIFF_ID && cfg.API_URL);

// ───────── 登入 ─────────
export async function initAuth() {
  if (MOCK) return;
  if (!window.liff) throw new Error('LINE 登入元件載入失敗，請檢查網路');
  await liff.init({ liffId: cfg.LIFF_ID });
  if (!liff.isLoggedIn() || tokenExpired()) {
    relogin();
    return new Promise(() => {}); // 正在跳轉
  }
}

function tokenExpired() {
  try {
    const d = liff.getDecodedIDToken();
    return !d || d.exp * 1000 < Date.now() + 60 * 1000;
  } catch (e) { return true; }
}

function relogin() {
  // 避免無限跳轉：30 秒內最多一次
  const last = Number(sessionStorage.getItem('relogin') || 0);
  if (Date.now() - last < 30000) throw new Error('登入失敗，請關掉重開');
  sessionStorage.setItem('relogin', String(Date.now()));
  try { if (liff.isLoggedIn()) liff.logout(); } catch (e) { /* 忽略 */ }
  const url = location.href.replace(/[?&](code|state|liffClientId|liffRedirectUri)=[^&]*/g, '');
  liff.login({ redirectUri: url });
}

// ───────── API ─────────
export async function call(action, data = {}) {
  if (MOCK) return mockCall(action, data);
  if (tokenExpired()) { relogin(); throw Object.assign(new Error('登入過期，重新登入中'), { code: 'AUTH' }); }
  let res;
  try {
    res = await fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain 避開 CORS 預檢
      body: JSON.stringify({ action, idToken: liff.getIDToken(), ...data }),
    });
  } catch (e) {
    throw Object.assign(new Error('沒有網路訊號'), { network: true });
  }
  let j;
  try { j = await res.json(); } catch (e) { throw Object.assign(new Error('伺服器回應異常'), { network: !res.ok }); }
  if (!j.ok) {
    if (j.error === 'AUTH') relogin();
    throw Object.assign(new Error(j.message || j.error), { code: j.error });
  }
  return j;
}

// ───────── 離線佇列（IndexedDB，失敗就退回 localStorage） ─────────
const DBN = 'luye-radar', ST = 'queue';
function idb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('no idb'));
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(ST, mode);
    const out = fn(t.objectStore(ST));
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
  });
}
export async function queueAdd(item) {
  item.id = item.id || newCaseId();
  try { await tx('readwrite', s => s.put(item)); }
  catch (e) {
    const q = store.get('queue', []);
    q.push(item);
    if (!store.set('queue', q)) throw new Error('手機空間不足，無法暫存');
  }
}
export async function queueAll() {
  let list = [];
  try { list = (await tx('readonly', s => s.getAll())) || []; } catch (e) { /* 無 IDB */ }
  return list.concat(store.get('queue', []));
}
async function queueDel(id) {
  try { await tx('readwrite', s => s.delete(id)); } catch (e) { /* 忽略 */ }
  const q = store.get('queue', []);
  if (q.some(i => i.id === id)) store.set('queue', q.filter(i => i.id !== id));
}
async function queuePut(item) {
  try { await tx('readwrite', s => s.put(item)); } catch (e) {
    store.set('queue', store.get('queue', []).map(i => (i.id === item.id ? item : i)));
  }
}

let flushing = false;
/** 把佇列裡的送出去；回傳 { sent, left, errors } */
export async function flushQueue() {
  if (flushing) return { sent: 0, left: (await queueAll()).length, errors: [] };
  flushing = true;
  let sent = 0;
  const errors = [];
  try {
    for (const item of await queueAll()) {
      try {
        await call(item.action, item.data);
        await queueDel(item.id);
        sent++;
      } catch (e) {
        if (e.network || e.code === 'AUTH') break; // 還沒訊號，下次再試
        item.lastError = e.message;
        await queuePut(item);
        errors.push({ item, message: e.message });
      }
    }
  } finally { flushing = false; }
  return { sent, left: (await queueAll()).length, errors };
}

export async function queueRemove(id) { await queueDel(id); }

// ───────── 測試模式（?mock=1，資料只存在這支手機） ─────────
function mockDb() {
  let db = store.get('mock_db', null);
  if (!db) {
    const now = Date.now(), day = 864e5;
    db = {
      users: [
        { lineUserId: 'Umock-admin', name: '測試管理員', role: 'admin', status: '啟用' },
        { lineUserId: 'Umock-staff', name: '測試員工阿明', role: 'staff', status: '啟用' },
      ],
      cases: [
        { caseId: 'TEST-001', createdAt: new Date(now - 12 * day).toISOString(), createdBy: 'Umock-staff', createdByName: '測試員工阿明',
          customerName: '測試王小明', phone: '0900-000-001', lat: 22.9105, lng: 121.1352, address: '臺東縣鹿野鄉龍田村（測試）',
          workType: 'new', buildings: [{ length: 30, width: 6, count: 2 }, { length: 20, width: 8, count: 1 }], repair: null, photos: [],
          materials: { net: 'blackNet', sideFilm: 'winch', endFilm: 'fixed', door: 'both', roof: ['canvas', 'knitNet'] },
          notes: '測試：場勘中，超過 7 天沒動', status: 'survey', statusUpdatedAt: new Date(now - 10 * day).toISOString(), nextAction: '補報價單', owner: '', dueDate: '' },
        { caseId: 'TEST-002', createdAt: new Date(now - 20 * day).toISOString(), createdBy: 'Umock-admin', createdByName: '測試管理員',
          customerName: '測試李大華', phone: '0900-000-002', lat: 22.9262, lng: 121.1158, address: '臺東縣鹿野鄉永安村（測試）',
          workType: 'repair', buildings: [{ length: 40, width: 7, count: 1 }],
          repair: { film: { arc: 9.5, length: 40, notMeasured: false }, net: { side: '兩側' }, sLine: true, winch: { side: '兩側' } }, photos: [], materials: null,
          notes: '測試：施工中', status: 'building', statusUpdatedAt: new Date(now - 3 * day).toISOString(), nextAction: '換膜收尾', owner: '測試員工阿明', dueDate: '' },
        { caseId: 'TEST-003', createdAt: new Date(now - 45 * day).toISOString(), createdBy: 'Umock-staff', createdByName: '測試員工阿明',
          customerName: '測試陳美玲', phone: '0900-000-003', lat: 22.9568, lng: 121.1531, address: '臺東縣鹿野鄉瑞源村（測試）',
          workType: 'new', buildings: [{ length: 50, width: 8, count: 3 }], repair: null, photos: [],
          materials: { net: 'insectNet', sideFilm: 'fixed', endFilm: 'fixed', door: 'front', roof: ['film', 'shade'] },
          notes: '測試：已完工', status: 'done', statusUpdatedAt: new Date(now - 5 * day).toISOString(), nextAction: '', owner: '', dueDate: '' },
      ],
      photos: {},
      v: 4,
    };
    store.set('mock_db', db);
  }
  if (db.v !== 4) {
    // 舊的測試資料改成新材料格式（2026-11-23：兩側／前後膜分開＋門）
    const add = { 'TEST-001': { net: 'blackNet', sideFilm: 'winch', endFilm: 'fixed', door: 'both', roof: ['canvas', 'knitNet'] }, 'TEST-003': { net: 'insectNet', sideFilm: 'fixed', endFilm: 'fixed', door: 'front', roof: ['film', 'shade'] } };
    db.cases.forEach(c => {
      if (add[c.caseId]) c.materials = add[c.caseId];
      if (c.caseId === 'TEST-002' && c.repair && !c.repair.winch?.side) c.repair.winch = { side: '兩側' };
    });
    db.v = 4;
    store.set('mock_db', db);
  }
  return db;
}

async function mockCall(action, d) {
  await new Promise(r => setTimeout(r, 250));
  if (params.has('offline') && action !== 'me' && action !== 'listCases' && action !== 'listUsers') {
    throw Object.assign(new Error('沒有網路訊號（模擬）'), { network: true });
  }
  const db = mockDb();
  const role = params.get('role') === 'staff' ? 'staff' : 'admin';
  const me = params.has('pending')
    ? { lineUserId: 'Umock-new', name: '新來的', role: 'staff', status: '待審' }
    : db.users.find(u => u.role === role);
  const save = () => { if (!store.set('mock_db', db)) { db.photos = {}; store.set('mock_db', db); } };
  const fail = (code, m) => { throw Object.assign(new Error(m), { code }); };
  const find = id => db.cases.find(c => c.caseId === id) || fail('NOT_FOUND', '找不到這個案件');
  const savePhotos = list => (list || []).map(p => { const id = 'mockphoto-' + Math.random().toString(36).slice(2); db.photos[id] = p; return id; });

  if (action === 'me') return { user: me };
  if (me.status !== '啟用') fail('PENDING', '帳號待審核');
  switch (action) {
    case 'listCases': return { cases: db.cases };
    case 'listUsers': return { users: db.users.filter(u => u.status === '啟用') };
    case 'createCase': {
      if (db.cases.some(c => c.caseId === d.caseId)) return { case: find(d.caseId) };
      const now = new Date().toISOString();
      const c = { ...d.case, caseId: d.caseId, createdAt: now, createdBy: me.lineUserId, createdByName: me.name,
        photos: savePhotos(d.photos), status: 'survey', statusUpdatedAt: now, nextAction: '', owner: '', dueDate: '' };
      db.cases.push(c); save();
      return { case: c };
    }
    case 'updateCase': {
      const c = find(d.caseId);
      if (me.role !== 'admin' && (c.createdBy !== me.lineUserId || c.status !== 'survey')) fail('FORBIDDEN', '沒有權限修改');
      Object.assign(c, d.case, { photos: (d.keepPhotos || []).concat(savePhotos(d.photos)) });
      save();
      return { case: c };
    }
    case 'adminUpdate': {
      if (me.role !== 'admin') fail('FORBIDDEN', '只有管理員能改');
      const c = find(d.caseId);
      if (d.status && d.status !== c.status) { c.status = d.status; c.statusUpdatedAt = new Date().toISOString(); }
      ['nextAction', 'owner', 'dueDate'].forEach(k => { if (d[k] !== undefined) c[k] = d[k]; });
      save();
      return { case: c };
    }
    case 'deleteCase': {
      if (me.role !== 'admin') fail('FORBIDDEN', '只有管理員能刪除');
      db.cases = db.cases.filter(c => c.caseId !== d.caseId); save();
      return { deleted: d.caseId };
    }
    case 'getPhoto': {
      const p = db.photos[d.fileId];
      if (!p) fail('NOT_FOUND', '照片不在這支手機（測試模式）');
      return { mime: 'image/jpeg', data: p.replace(/^data:image\/\w+;base64,/, '') };
    }
    case 'resolveUrl': return { url: d.url };
    default: fail('BAD_ACTION', action);
  }
}
