// 共用小工具
// 底圖：OSM 標準圖磚＋CSS 濾鏡做成深色（CARTO dark_all 現在要金鑰，會出現「API KEY REQUIRED」浮水印）
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const TILE_OPTS = { maxZoom: 19, attribution: TILE_ATTR, className: 'dark-tiles' };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const PING_M2 = 3.3058; // 1 坪 = 3.3058 ㎡

export const STATUS = {
  survey:   { label: '場勘／報價中', short: '場勘報價', emoji: '🟡', color: '#ffd60a' },
  building: { label: '施工中',       short: '施工中',   emoji: '🔵', color: '#0a84ff' },
  done:     { label: '完工',         short: '完工',     emoji: '🟢', color: '#30d158' },
  dropped:  { label: '放棄',         short: '放棄',     emoji: '⚪', color: '#8e8e93' },
};
export const STATUS_KEYS = Object.keys(STATUS);
export const STALE_DAYS = 7;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/** localStorage 一律包 try/catch（無痕模式、容量滿都不會炸） */
export const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ } },
};

export function toast(msg, isErr = false, ms = 2800) {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = 't' + (isErr ? ' err' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function fmt(n, d = 2) {
  const x = Number(n) || 0;
  return x.toLocaleString('zh-TW', { maximumFractionDigits: d });
}

export function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }

export function totalArea(buildings) {
  return (buildings || []).reduce((s, b) => s + num(b.length) * num(b.width) * num(b.count), 0);
}

export function isStale(c) {
  if (c.status !== 'survey' || !c.statusUpdatedAt) return false;
  return Date.now() - new Date(c.statusUpdatedAt).getTime() > STALE_DAYS * 864e5;
}

export function daysSince(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export const REPAIR_LABELS = { film: '更換農膜', net: '維修網子', sLine: '更換 S 線', winch: '更換捲揚', blackRope: '更換黑繩', other: '其他' };

// 新建材料（2026-11-23 第三版）：網在內（單選）＋兩側長邊膜、前後端面膜各自選（無／固定／捲揚）＋門位置；屋頂可複選。
// 存進 Cases 的 materials 欄（JSON：{ net, sideFilm, endFilm, door, roof: [...] }）
//   net：'' 未選／'none' 無／'blackNet'／'insectNet'
//   sideFilm／endFilm：'' 未選／'none' 無／'fixed' 固定／'winch' 捲揚
//   door：'front' 前端（預設）／'back' 後端／'both' 前後都有／'none' 無
export const NET_OPTS = { blackNet: '黑網', insectNet: '防蟲網', none: '無' };
export const FILM_OPTS = { none: '無', fixed: '固定', winch: '捲揚' };
export const DOOR_OPTS = { front: '前端', back: '後端', both: '前後都有', none: '無' };
export const WINCH_SIDES = ['兩側', '前後', '四周'];
export const ROOF_MATS = { film: '農膜', canvas: '帆布', knitNet: '針織網', shade: '遮陰網' };

/** 整理 materials：只留認得的值；舊格式自動轉成新格式
 *  - 最舊 { side: [...] }：有捲揚→兩側捲揚；有農膜→兩側＋前後固定
 *  - 第二版 { net, film, winchSide }：固定→兩側＋前後固定；無→兩側＋前後無；
 *    捲揚：兩側→兩側捲揚、前後→前後捲揚、四周→兩側＋前後捲揚（沒提到的那邊留「未選」）
 *  - 沒有門的資料→前端 */
export function normMaterials(m) {
  m = m || {};
  const roof = Object.keys(ROOF_MATS).filter(k => Array.isArray(m.roof) && m.roof.includes(k));
  let net = '', sideFilm = '', endFilm = '';
  if (Array.isArray(m.side)) {
    const sd = m.side;
    net = sd.includes('blackNet') ? 'blackNet' : sd.includes('insectNet') ? 'insectNet' : '';
    if (sd.includes('winch')) sideFilm = 'winch';
    else if (sd.includes('film')) { sideFilm = 'fixed'; endFilm = 'fixed'; }
  } else {
    net = NET_OPTS[m.net] ? m.net : '';
    if ('sideFilm' in m || 'endFilm' in m) {
      sideFilm = FILM_OPTS[m.sideFilm] ? m.sideFilm : '';
      endFilm = FILM_OPTS[m.endFilm] ? m.endFilm : '';
    } else if (m.film === 'fixed' || m.film === 'none') {
      sideFilm = endFilm = m.film;
    } else if (m.film === 'winch') {
      const ws = WINCH_SIDES.includes(m.winchSide) ? m.winchSide : '兩側';
      if (ws !== '前後') sideFilm = 'winch';
      if (ws !== '兩側') endFilm = 'winch';
    }
  }
  const door = DOOR_OPTS[m.door] ? m.door : 'front';
  return { net, sideFilm, endFilm, door, roof };
}

export function materialsEmpty(m) {
  const n = normMaterials(m);
  return !n.net && !n.sideFilm && !n.endFilm && !n.roof.length;
}

const filmText = v => v === 'none' ? '無膜' : v === 'fixed' ? '農膜固定' : v === 'winch' ? '捲揚' : '未選';
/** 材料文字：part＝'side'（四周網＋膜）、'roof'（屋頂）、'door'（門） */
export function materialsText(m, part) {
  const n = normMaterials(m);
  if (part === 'roof') return n.roof.map(k => ROOF_MATS[k]).join('＋');
  if (part === 'door') return DOOR_OPTS[n.door];
  const out = [];
  if (n.net) out.push(n.net === 'none' ? '無網' : NET_OPTS[n.net] + '（內）');
  if (n.sideFilm || n.endFilm) out.push(`兩側${filmText(n.sideFilm)}、前後${filmText(n.endFilm)}`);
  return out.join('＋');
}

/** 維修的「更換捲揚」位置：舊資料 true 視為「兩側」；沒勾回傳 '' */
export function winchSideOf(w) {
  if (!w) return '';
  if (typeof w === 'object' && WINCH_SIDES.includes(w.side)) return w.side;
  return '兩側';
}

/** 作業內容的一行摘要 */
export function workSummary(c) {
  if (c.workType === 'repair') {
    const r = c.repair || {};
    const parts = [];
    if (r.film) parts.push(r.film.notMeasured ? '換膜（尺寸待補）' : `換膜 弧長${fmt(r.film.arc)}米×長${fmt(r.film.length)}米`);
    if (r.net) parts.push(`網子（${r.net.side || '?'}）`);
    if (r.sLine) parts.push('S 線');
    if (r.winch) parts.push(`捲揚（${winchSideOf(r.winch)}）`);
    if (r.blackRope) parts.push('黑繩');
    if (r.other) parts.push(`其他：${r.other}`);
    return '維修：' + (parts.join('、') || '—');
  }
  const a = totalArea(c.buildings);
  return `新建 ${fmt(a)}㎡（${fmt(a / PING_M2)}坪）`;
}

export function buildingsText(list) {
  return (list || []).map(b => `${fmt(b.length)}米 × ${fmt(b.width)}米 × ${fmt(b.count, 0)}棟`).join('<br>');
}

/** 從 Google 地圖 / LINE 位置 / 一般文字裡挖出經緯度 */
export function parseLatLng(text) {
  if (!text) return null;
  let t = String(text);
  try { t = decodeURIComponent(t); } catch (e) { /* 保留原字串 */ }
  const pats = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,                       // 地點本身（優先於畫面中心）
    /[?&](?:q|query|ll|destination|daddr|center|sll)=(?:loc:)?\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,                                      // 畫面中心
    /(-?\d{1,2}\.\d{3,})\s*[,，]\s*(-?\d{1,3}\.\d{3,})/,                 // 純文字座標
  ];
  for (const p of pats) {
    const m = t.match(p);
    if (m) {
      const lat = +m[1], lng = +m[2];
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) return { lat, lng };
    }
  }
  return null;
}

export function needsResolve(text) {
  return /https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co)\//i.test(text || '');
}

export function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s]+/);
  return m ? m[0] : '';
}

/** 手機端壓縮：長邊 1600px 的 JPEG，回傳 dataURL */
export function compressImage(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('照片讀取失敗')); };
    img.src = url;
  });
}

export function newCaseId() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `C${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rand}`;
}

export function navUrl(lat, lng) { return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`; }
export function gmapUrl(lat, lng) { return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`; }
