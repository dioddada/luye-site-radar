// 進入點：登入 → 地圖；畫面切換、離線佇列
import { $, store, toast } from './util.js';
import { sfx, isMuted, setMuted } from './sound.js';
import { MOCK, CONFIGURED, initAuth, call, flushQueue, queueAll } from './api.js';
import { initMap, setCases, setUsers, invalidate, closeSheet, openSheet } from './mapview.js';
import { openForm, hasDraft, next, back, closeForm, onPop, currentStep, setOnDone } from './form.js';
import { ICON } from './icons.js';

let me = null;
let cases = [];
let pendingDone = null;

// ───────── 畫面切換 ─────────
// 換頁動畫：進表單＝push（從右滑入）、回地圖＝pop、其他＝淡入
let curView = 'boot';
function showView(name) {
  if (name === curView) return;
  const anim = name === 'form' ? 'push-in' : (name === 'map' && curView === 'form') ? 'pop-in' : 'fade-in';
  ['boot', 'map', 'form', 'done'].forEach(v => $('#view-' + v).classList.toggle('hidden', v !== name));
  const el = $('#view-' + name);
  el.classList.remove('push-in', 'pop-in', 'fade-in');
  void el.offsetWidth;
  el.classList.add(anim);
  el.addEventListener('animationend', () => el.classList.remove(anim), { once: true });
  curView = name;
  if (name === 'map') invalidate();
}

// 靜態圖示
$('#queue-badge .qi').innerHTML = ICON.clock({ size: 15 });
$('#btn-refresh').innerHTML = ICON.refresh({ size: 20 });
$('#btn-mylocation').innerHTML = ICON.locate({ size: 22 });
$('#btn-new').innerHTML = ICON.plus({ size: 20 }) + '新增案件';
$('#form-close').innerHTML = ICON.close({ size: 22 });
$('.done-icon').innerHTML = ICON.check({ size: 40 });

function bootMsg(title, msg, retry) {
  showView('boot');
  $('#boot-title').textContent = title;
  $('#boot-msg').textContent = msg || '';
  const b = $('#boot-retry');
  b.classList.toggle('hidden', !retry);
  $('#boot-spin').classList.toggle('hidden', !!retry || title !== '連線中…');
  b.onclick = () => { sfx.confirm(); location.reload(); };
}

// ───────── 靜音鍵 ─────────
function drawMute() { $('#btn-mute').innerHTML = isMuted() ? ICON.mute({ size: 22 }) : ICON.speaker({ size: 22 }); }
$('#btn-mute').onclick = () => { setMuted(!isMuted()); drawMute(); sfx.beep(); };
drawMute();

// ───────── 開機 ─────────
async function boot() {
  if (MOCK) $('#mock-badge').classList.remove('hidden');
  if (!MOCK && !CONFIGURED) {
    bootMsg('尚未設定', '請照 README 填好 js/config.js 的 LIFF_ID 和 API_URL。想先看畫面，網址後面加 ?mock=1');
    return;
  }
  try {
    await initAuth();
    const { user } = await call('me');
    me = user;
    store.set('me_cache', me);
  } catch (e) {
    const cached = store.get('me_cache', null);
    if (e.network && cached && cached.status === '啟用') {
      me = cached;
      toast('沒有訊號：先用上次的資料，可以照常填案件', true, 4000);
    } else {
      bootMsg('連線失敗', e.message, true);
      return;
    }
  }
  if (me.status !== '啟用') {
    bootMsg('等待核准', `${me.name || ''} 你好！已收到你的申請，請管理員在試算表「Users」分頁把你的狀態改成「啟用」，再按下面的按鈕。`, true);
    return;
  }

  history.replaceState({ v: 'map' }, '');
  initMap(me, { onEdit, onChanged });
  cases = store.get('cases_cache', []);
  setCases(cases, true);
  showView('map');
  refresh(true);
  if (me.role === 'admin') call('listUsers').then(r => setUsers(r.users)).catch(() => {});
  drainQueue();
  setInterval(drainQueue, 30000);
  window.addEventListener('online', drainQueue);
}

async function refresh(fit = false) {
  try {
    const r = await call('listCases');
    cases = r.cases || [];
    store.set('cases_cache', cases);
    setCases(cases, fit);
  } catch (e) {
    toast(e.network ? '沒有訊號，顯示的是上次的資料' : '讀取失敗：' + e.message, true);
  }
}

// ───────── 離線佇列 ─────────
async function drawQueue() {
  const n = (await queueAll()).length;
  const b = $('#queue-badge');
  b.classList.toggle('hidden', n === 0);
  b.querySelector('b').textContent = n;
  return n;
}
async function drainQueue() {
  if ((await drawQueue()) === 0) return;
  if (navigator.onLine === false) return;
  const { sent, errors } = await flushQueue();
  if (sent) { sfx.success(); toast(`已補送 ${sent} 筆案件`); refresh(); }
  errors.forEach(er => toast(`「${er.item.label || ''}」送不出去：${er.message}`, true, 6000));
  drawQueue();
}
$('#queue-badge').onclick = async () => {
  const list = await queueAll();
  toast(`還有 ${list.length} 筆等訊號送出：` + list.map(i => i.label).join('、'), false, 4000);
  drainQueue();
};

// ───────── 地圖頁事件 ─────────
$('#btn-refresh').onclick = () => { sfx.beep(); refresh(); };
$('#btn-new').onclick = () => {
  sfx.confirm();
  closeSheet();
  const d = hasDraft();
  const useDraft = d ? confirm(`有一份還沒送出的草稿（客戶：${d.customerName || '未填'}），要接著填嗎？\n\n按「取消」會清掉草稿、開新的一份。`) : false;
  showView('form');
  openForm(null, useDraft);
};

function onEdit(c) {
  showView('form');
  openForm(c);
}

function onChanged(upd, deletedId) {
  if (deletedId) cases = cases.filter(c => c.caseId !== deletedId);
  else if (upd) cases = cases.map(c => (c.caseId === upd.caseId ? upd : c));
  store.set('cases_cache', cases);
  setCases(cases);
}

// ───────── 表單事件 ─────────
$('#form-next').onclick = () => next();
$('#form-back').onclick = () => back();
$('#form-close').onclick = () => { sfx.back(); closeForm(); };

setOnDone(({ steps, isEdit, queued, name, saved }) => {
  pendingDone = { isEdit, queued, name, saved };
  history.go(-steps); // 退掉表單的歷史紀錄，popstate 會顯示完成畫面
});

function showDone(d) {
  $('#done-title').textContent = d.queued ? '已排入佇列' : (d.isEdit ? '修改完成' : '送出完成');
  $('#done-msg').textContent = d.queued
    ? `現在沒有訊號。「${d.name}」已存在手機裡，有訊號會自動送出（右上角時鐘圖示會顯示筆數）。`
    : `「${d.name}」已${d.isEdit ? '更新' : '建立'}，地圖上看得到了。`;
  showView('done');
  drawQueue();
  if (d.saved) {
    cases = cases.filter(c => c.caseId !== d.saved.caseId).concat([d.saved]);
    store.set('cases_cache', cases);
    setCases(cases);
  }
}
$('#done-home').onclick = () => {
  sfx.confirm();
  showView('map');
  refresh();
  const id = pendingDone && pendingDone.saved && pendingDone.saved.caseId;
  pendingDone = null;
  if (id) setTimeout(() => openSheet(id), 300);
};

window.addEventListener('popstate', e => {
  const s = e.state || {};
  if (s.v === 'form') {
    if (currentStep()) { showView('form'); onPop(s); }
    else history.go(-(s.step || 1)); // 已關閉的表單紀錄，直接跳回地圖
    return;
  }
  if (!me) return;
  if (pendingDone) showDone(pendingDone);
  else showView('map');
});

boot();
