/**
 * 鹿野工地雷達 — Apps Script 後端
 *
 * Script Properties（專案設定 → 指令碼屬性）：
 *   LINE_CHANNEL_ID  ← LINE Login 頻道的 Channel ID（必填，你自己填）
 *   SHEET_ID         ← 跑 setup() 自動寫入
 *   PHOTO_FOLDER_ID  ← 跑 setup() 自動寫入
 *
 * 前端用 POST（Content-Type: text/plain）送 JSON：{ action, idToken, ...資料 }
 * 每次呼叫都會用 LINE verify API 驗證 idToken。
 */

var USERS_SHEET = 'Users';
var CASES_SHEET = 'Cases';
var USER_HEADERS = ['lineUserId', '姓名', '角色', '狀態', '建立時間'];
var CASE_HEADERS = [
  'caseId', 'createdAt', 'createdBy', 'createdByName', 'customerName', 'phone',
  'lat', 'lng', 'address', 'workType', 'buildings', 'repair', 'photos', 'notes',
  'status', 'statusUpdatedAt', 'nextAction', 'owner', 'dueDate',
  'materials' // 2026-11-23 新增（新建的四周／屋頂材料 JSON），放表尾；舊試算表重跑 setup() 會補上
];
var JSON_COLS = ['buildings', 'repair', 'photos', 'materials'];
var NET_OPTS = ['blackNet', 'insectNet', 'none'];   // 四周網（內層，單選）
var FILM_OPTS = ['none', 'fixed', 'winch'];         // 兩側長邊膜／前後端面膜（外層，單選）
var DOOR_OPTS = ['front', 'back', 'both', 'none'];   // 門
var WINCH_SIDES = ['兩側', '前後', '四周'];
var ROOF_MATS = ['film', 'canvas', 'knitNet', 'shade'];
var STATUSES = ['survey', 'building', 'done', 'dropped'];
var ACTIVE = '啟用';
var PENDING = '待審';

// ───────────────────────── 一次性設定 ─────────────────────────

/** 按一次：建立試算表（Users、Cases）＋照片資料夾，ID 存進 Script Properties。重跑不會重建。 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss;
  var sheetId = props.getProperty('SHEET_ID');
  if (sheetId) {
    ss = SpreadsheetApp.openById(sheetId);
  } else {
    ss = SpreadsheetApp.create('鹿野工地雷達 資料庫');
    props.setProperty('SHEET_ID', ss.getId());
  }

  var users = ss.getSheetByName(USERS_SHEET) || ss.insertSheet(USERS_SHEET);
  if (users.getLastRow() === 0) {
    users.appendRow(USER_HEADERS);
    users.setFrozenRows(1);
    users.getRange(1, 1, 1, USER_HEADERS.length).setFontWeight('bold');
  }
  // 角色、狀態欄做成下拉選單，方便在手機上核准
  users.getRange('C2:C').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['staff', 'admin'], true).build());
  users.getRange('D2:D').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList([PENDING, ACTIVE], true).build());

  var cases = ss.getSheetByName(CASES_SHEET) || ss.insertSheet(CASES_SHEET);
  if (cases.getLastRow() === 0) {
    cases.appendRow(CASE_HEADERS);
    cases.setFrozenRows(1);
    cases.getRange(1, 1, 1, CASE_HEADERS.length).setFontWeight('bold');
  } else {
    // 舊版試算表：表尾補上新欄位（只補不刪，不動既有資料）
    var have = cases.getRange(1, 1, 1, Math.max(cases.getLastColumn(), 1)).getValues()[0].map(String);
    CASE_HEADERS.forEach(function (h, i) {
      if (have[i] === h) return;
      if (have[i]) throw new Error('Cases 第 ' + (i + 1) + ' 欄應該是「' + h + '」，現在是「' + have[i] + '」，請檢查表頭');
      cases.getRange(1, i + 1).setValue(h).setFontWeight('bold');
      Logger.log('Cases 補上欄位：' + h);
    });
  }

  var def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  var folderId = props.getProperty('PHOTO_FOLDER_ID');
  var folder;
  if (folderId) {
    folder = DriveApp.getFolderById(folderId);
  } else {
    folder = DriveApp.createFolder('鹿野工地雷達 照片');
    props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  }

  Logger.log('試算表：' + ss.getUrl());
  Logger.log('照片資料夾：' + folder.getUrl());
  if (!props.getProperty('LINE_CHANNEL_ID')) {
    Logger.log('⚠️ 還沒填 LINE_CHANNEL_ID，請到「專案設定 → 指令碼屬性」新增。');
  }
}

/** 插入 3 筆測試資料（假名假電話，鹿野鄉附近）。重跑會略過已存在的。 */
function seedTestData() {
  var sheet = casesSheet_();
  var now = new Date();
  var day = 24 * 3600 * 1000;
  var rows = [
    {
      caseId: 'TEST-001', createdAt: new Date(now - 12 * day), createdBy: 'seed', createdByName: '測試資料',
      customerName: '測試王小明', phone: '0900-000-001', lat: 22.9105, lng: 121.1352,
      address: '臺東縣鹿野鄉龍田村（測試）', workType: 'new',
      buildings: [{ length: 30, width: 6, count: 2 }, { length: 20, width: 8, count: 1 }], repair: null,
      materials: { net: 'blackNet', sideFilm: 'winch', endFilm: 'fixed', door: 'both', roof: ['canvas', 'knitNet'] },
      photos: [], notes: '測試：場勘中，超過 7 天沒動，應出現紅框',
      status: 'survey', statusUpdatedAt: new Date(now - 10 * day), nextAction: '補報價單', owner: '', dueDate: ''
    },
    {
      caseId: 'TEST-002', createdAt: new Date(now - 20 * day), createdBy: 'seed', createdByName: '測試資料',
      customerName: '測試李大華', phone: '0900-000-002', lat: 22.9262, lng: 121.1158,
      address: '臺東縣鹿野鄉永安村（測試）', workType: 'repair',
      buildings: [{ length: 40, width: 7, count: 1 }],
      repair: { film: { arc: 9.5, length: 40, notMeasured: false }, net: { side: '兩側' }, sLine: true, winch: { side: '兩側' }, other: '' },
      materials: null,
      photos: [], notes: '測試：施工中',
      status: 'building', statusUpdatedAt: new Date(now - 3 * day), nextAction: '換膜收尾', owner: '', dueDate: ''
    },
    {
      caseId: 'TEST-003', createdAt: new Date(now - 45 * day), createdBy: 'seed', createdByName: '測試資料',
      customerName: '測試陳美玲', phone: '0900-000-003', lat: 22.9568, lng: 121.1531,
      address: '臺東縣鹿野鄉瑞源村（測試）', workType: 'new',
      buildings: [{ length: 50, width: 8, count: 3 }], repair: null,
      materials: { net: 'insectNet', sideFilm: 'fixed', endFilm: 'fixed', door: 'front', roof: ['film', 'shade'] },
      photos: [], notes: '測試：已完工',
      status: 'done', statusUpdatedAt: new Date(now - 5 * day), nextAction: '', owner: '', dueDate: ''
    }
  ];
  rows.forEach(function (c) {
    var row = findCaseRow_(sheet, c.caseId);
    if (row > 0) {
      // 已存在：材料欄改成新格式（之前插入的是舊格式或空的）；只動測試資料
      var col = CASE_HEADERS.indexOf('materials') + 1;
      if (c.materials) sheet.getRange(row, col).setValue(JSON.stringify(c.materials));
      if (c.repair && c.repair.winch) sheet.getRange(row, CASE_HEADERS.indexOf('repair') + 1).setValue(JSON.stringify(c.repair));
      return;
    }
    sheet.appendRow(caseToRow_(c));
  });
  Logger.log('測試資料完成');
}

// ───────────────────────── Web App 入口 ─────────────────────────

function doGet() {
  return json_({ ok: true, service: 'luye-site-radar' });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var out = handle_(req) || {};
    out.ok = true;
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: err.code || 'ERROR', message: String(err.message || err) });
  }
}

function handle_(req) {
  var who = verifyToken_(req.idToken);
  var user = getOrCreateUser_(who.sub, who.name);
  if (req.action === 'me') return { user: user };
  if (user.status !== ACTIVE) throw fail_('PENDING', '帳號待審核，請等管理員核准');

  switch (req.action) {
    case 'listCases': return { cases: listCases_() };
    case 'listUsers': return { users: listActiveUsers_() };
    case 'createCase': return { case: createCase_(user, req) };
    case 'updateCase': return { case: updateCase_(user, req) };
    case 'adminUpdate': return { case: adminUpdate_(user, req) };
    case 'deleteCase': return deleteCase_(user, req);
    case 'getPhoto': return getPhoto_(req);
    case 'resolveUrl': return { url: resolveUrl_(req.url) };
    default: throw fail_('BAD_ACTION', '未知的動作：' + req.action);
  }
}

// ───────────────────────── 驗證與使用者 ─────────────────────────

function verifyToken_(idToken) {
  if (!idToken) throw fail_('AUTH', '缺少登入憑證');
  var channelId = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ID');
  if (!channelId) throw fail_('CONFIG', '後端尚未設定 LINE_CHANNEL_ID');

  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: channelId },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw fail_('AUTH', '登入已過期，請重新登入');
  var body = JSON.parse(res.getContentText());
  var who = { sub: body.sub, name: body.name || '' };
  var ttl = Math.min(600, Math.max(0, Math.floor(body.exp - Date.now() / 1000) - 30));
  if (ttl > 0) cache.put(key, JSON.stringify(who), ttl);
  return who;
}

function getOrCreateUser_(sub, name) {
  var sheet = sheet_(USERS_SHEET);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === sub) {
      return { lineUserId: sub, name: String(values[i][1] || name), role: String(values[i][2] || 'staff'), status: String(values[i][3] || PENDING) };
    }
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet.appendRow([sub, safeText_(name), 'staff', PENDING, new Date()]);
  } finally {
    lock.releaseLock();
  }
  return { lineUserId: sub, name: name, role: 'staff', status: PENDING };
}

function listActiveUsers_() {
  var values = sheet_(USERS_SHEET).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][3]) === ACTIVE) out.push({ lineUserId: String(values[i][0]), name: String(values[i][1]) });
  }
  return out;
}

// ───────────────────────── 案件 ─────────────────────────

function listCases_() {
  var values = casesSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) continue;
    out.push(rowToCase_(values[i]));
  }
  return out;
}

function createCase_(user, req) {
  var c = req.case || {};
  var caseId = String(req.caseId || '');
  if (!/^[A-Za-z0-9-]{6,40}$/.test(caseId)) throw fail_('BAD_INPUT', '案件編號格式不對');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = casesSheet_();
    var existing = findCaseRow_(sheet, caseId);
    if (existing > 0) return rowToCase_(sheet.getRange(existing, 1, 1, CASE_HEADERS.length).getValues()[0]); // 重送：當作成功
    var now = new Date();
    var data = cleanCase_(c);
    data.caseId = caseId;
    data.createdAt = now;
    data.createdBy = user.lineUserId;
    data.createdByName = user.name;
    data.photos = (req.photos || []).map(function () { return 'pending'; });
    data.status = 'survey';
    data.statusUpdatedAt = now;
    data.nextAction = '';
    data.owner = '';
    data.dueDate = '';
    validateCase_(data); // 先檢查再存照片，避免留下孤兒檔案
    data.photos = savePhotos_(caseId, req.photos || []);
    sheet.appendRow(caseToRow_(data));
    return data;
  } finally {
    lock.releaseLock();
  }
}

function updateCase_(user, req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = casesSheet_();
    var row = findCaseRow_(sheet, req.caseId);
    if (row < 0) throw fail_('NOT_FOUND', '找不到這個案件');
    var cur = rowToCase_(sheet.getRange(row, 1, 1, CASE_HEADERS.length).getValues()[0]);
    var isAdmin = user.role === 'admin';
    if (!isAdmin) {
      if (cur.createdBy !== user.lineUserId) throw fail_('FORBIDDEN', '只能修改自己填的案件');
      if (cur.status !== 'survey') throw fail_('FORBIDDEN', '案件已不在場勘／報價中，請找管理員修改');
    }
    var data = cleanCase_(req.case || {});
    var keep = (req.keepPhotos || []).filter(function (id) { return cur.photos.indexOf(id) >= 0; });
    var removed = cur.photos.filter(function (id) { return keep.indexOf(id) < 0; });
    var oldCount = cur.photos.length;
    ['customerName', 'phone', 'lat', 'lng', 'address', 'workType', 'buildings', 'repair', 'materials', 'notes'].forEach(function (k) {
      cur[k] = data[k];
    });
    cur.photos = keep.concat((req.photos || []).map(function () { return 'pending'; }));
    validateCase_(cur); // 先檢查再動照片
    cur.photos = keep.concat(savePhotos_(cur.caseId, req.photos || [], oldCount));
    removed.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} });
    sheet.getRange(row, 1, 1, CASE_HEADERS.length).setValues([caseToRow_(cur)]);
    return cur;
  } finally {
    lock.releaseLock();
  }
}

function adminUpdate_(user, req) {
  if (user.role !== 'admin') throw fail_('FORBIDDEN', '只有管理員能改狀態與下一步');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = casesSheet_();
    var row = findCaseRow_(sheet, req.caseId);
    if (row < 0) throw fail_('NOT_FOUND', '找不到這個案件');
    var cur = rowToCase_(sheet.getRange(row, 1, 1, CASE_HEADERS.length).getValues()[0]);
    if (req.status !== undefined) {
      if (STATUSES.indexOf(req.status) < 0) throw fail_('BAD_INPUT', '狀態不對');
      if (req.status !== cur.status) {
        cur.status = req.status;
        cur.statusUpdatedAt = new Date();
      }
    }
    if (req.nextAction !== undefined) cur.nextAction = str_(req.nextAction, 500);
    if (req.owner !== undefined) cur.owner = str_(req.owner, 50);
    if (req.dueDate !== undefined) {
      var d = str_(req.dueDate, 10);
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw fail_('BAD_INPUT', '期限格式不對');
      cur.dueDate = d;
    }
    sheet.getRange(row, 1, 1, CASE_HEADERS.length).setValues([caseToRow_(cur)]);
    return cur;
  } finally {
    lock.releaseLock();
  }
}

function deleteCase_(user, req) {
  if (user.role !== 'admin') throw fail_('FORBIDDEN', '只有管理員能刪除案件');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = casesSheet_();
    var row = findCaseRow_(sheet, req.caseId);
    if (row < 0) throw fail_('NOT_FOUND', '找不到這個案件');
    var cur = rowToCase_(sheet.getRange(row, 1, 1, CASE_HEADERS.length).getValues()[0]);
    cur.photos.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} });
    sheet.deleteRow(row);
    return { deleted: cur.caseId };
  } finally {
    lock.releaseLock();
  }
}

/** 只回傳「屬於某個案件」的照片，避免被拿來讀雲端硬碟其他檔案 */
function getPhoto_(req) {
  var id = String(req.fileId || '');
  var cases = listCases_();
  var ok = cases.some(function (c) { return c.photos.indexOf(id) >= 0; });
  if (!ok) throw fail_('NOT_FOUND', '找不到照片');
  var blob = DriveApp.getFileById(id).getBlob();
  return { mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/** 解析 Google 地圖短網址（maps.app.goo.gl 等），只允許 Google 網域 */
function resolveUrl_(url) {
  url = String(url || '');
  var allowed = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.google\.[a-z.]+|www\.google\.[a-z.]+|google\.[a-z.]+)\//i;
  for (var i = 0; i < 6; i++) {
    if (!allowed.test(url)) break;
    var res = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code < 300 || code >= 400) break;
    var headers = res.getAllHeaders();
    var loc = headers.Location || headers.location;
    if (!loc) break;
    url = String(loc);
  }
  return url;
}

// ───────────────────────── 工具 ─────────────────────────

function savePhotos_(caseId, photos, startIndex) {
  if (photos.length > 20) throw fail_('BAD_INPUT', '照片太多（最多 20 張）');
  var folder = DriveApp.getFolderById(prop_('PHOTO_FOLDER_ID'));
  var stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');
  return photos.map(function (b64, i) {
    var clean = String(b64).replace(/^data:image\/\w+;base64,/, '');
    var blob = Utilities.newBlob(Utilities.base64Decode(clean), 'image/jpeg',
      caseId + '_' + stamp + '_' + ((startIndex || 0) + i + 1) + '.jpg');
    return folder.createFile(blob).getId();
  });
}

function cleanCase_(c) {
  var workType = c.workType === 'repair' ? 'repair' : 'new';
  var buildings = (Array.isArray(c.buildings) ? c.buildings : []).slice(0, 30).map(function (b) {
    return { length: num_(b.length), width: num_(b.width), count: num_(b.count) };
  }).filter(function (b) { return b.length || b.width || b.count; });
  var repair = null;
  if (workType === 'repair' && c.repair) {
    var r = c.repair;
    repair = {};
    if (r.film) repair.film = { arc: num_(r.film.arc), length: num_(r.film.length), notMeasured: !!r.film.notMeasured };
    if (r.net) repair.net = { side: ['兩側', '前後', '四周'].indexOf(r.net.side) >= 0 ? r.net.side : '' };
    if (r.sLine) repair.sLine = true;
    if (r.winch) repair.winch = { side: (r.winch && WINCH_SIDES.indexOf(r.winch.side) >= 0) ? r.winch.side : '兩側' };
    if (r.blackRope) repair.blackRope = true;
    if (r.other) repair.other = str_(r.other, 500);
  }
  var materials = null;
  if (workType === 'new') {
    materials = normMaterials_(c.materials);
  }
  return {
    customerName: str_(c.customerName, 50),
    phone: str_(c.phone, 30),
    lat: num_(c.lat),
    lng: num_(c.lng),
    address: str_(c.address, 200),
    workType: workType,
    buildings: buildings,
    repair: repair,
    materials: materials,
    notes: str_(c.notes, 2000)
  };
}

function validateCase_(c) {
  if (!c.customerName) throw fail_('BAD_INPUT', '客戶姓名必填');
  if (!c.phone) throw fail_('BAD_INPUT', '電話必填');
  if (!c.lat || !c.lng) throw fail_('BAD_INPUT', '缺少位置');
  if (!c.photos || !c.photos.length) throw fail_('BAD_INPUT', '至少要 1 張照片');
}

function caseToRow_(c) {
  return CASE_HEADERS.map(function (h) {
    var v = c[h];
    if (JSON_COLS.indexOf(h) >= 0) return v ? JSON.stringify(v) : '';
    if (v instanceof Date) return v;
    if (h === 'createdAt' || h === 'statusUpdatedAt') return v ? new Date(v) : '';
    if (typeof v === 'number') return v;
    return safeText_(v == null ? '' : String(v));
  });
}

function rowToCase_(row) {
  var c = {};
  CASE_HEADERS.forEach(function (h, i) {
    var v = row[i];
    if (JSON_COLS.indexOf(h) >= 0) {
      var empty = (h === 'repair' || h === 'materials') ? null : [];
      try { v = v ? JSON.parse(v) : empty; } catch (e) { v = empty; }
    } else if (v instanceof Date) {
      v = h === 'dueDate' ? Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd') : v.toISOString();
    } else if (h === 'lat' || h === 'lng') {
      v = Number(v);
    } else {
      v = v == null ? '' : String(v);
    }
    c[h] = v;
  });
  return c;
}

/** 防止被試算表當成公式或數字（電話開頭 0 會不見） */
function safeText_(s) {
  s = String(s);
  if (/^[=+\-@]/.test(s) || /^[\d\s()-]+$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return "'" + s;
  return s;
}

function findCaseRow_(sheet, caseId) {
  if (!caseId) return -1;
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(caseId)) return i + 2;
  return -1;
}

function casesSheet_() { return sheet_(CASES_SHEET); }

function sheet_(name) {
  var s = SpreadsheetApp.openById(prop_('SHEET_ID')).getSheetByName(name);
  if (!s) throw fail_('CONFIG', '找不到分頁 ' + name + '，請先跑 setup()');
  return s;
}

function prop_(k) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw fail_('CONFIG', '後端尚未設定 ' + k + '，請先跑 setup()');
  return v;
}

function str_(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }
function num_(v) { var n = parseFloat(v); return isFinite(n) ? Math.round(n * 1e6) / 1e6 : 0; }
function fail_(code, msg) { var e = new Error(msg); e.code = code; return e; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** 新建材料整理：{ net, sideFilm, endFilm, door, roof:[] }
 *  舊格式自動轉換：{ side:[...] }（最舊）、{ net, film, winchSide }（第二版）；沒有門→前端 */
function normMaterials_(m) {
  m = m || {};
  var roof = ROOF_MATS.filter(function (k) { return Array.isArray(m.roof) && m.roof.indexOf(k) >= 0; });
  var net = '', sideFilm = '', endFilm = '';
  if (Array.isArray(m.side)) {
    net = m.side.indexOf('blackNet') >= 0 ? 'blackNet' : m.side.indexOf('insectNet') >= 0 ? 'insectNet' : '';
    if (m.side.indexOf('winch') >= 0) sideFilm = 'winch';
    else if (m.side.indexOf('film') >= 0) { sideFilm = 'fixed'; endFilm = 'fixed'; }
  } else {
    net = NET_OPTS.indexOf(m.net) >= 0 ? m.net : '';
    if (m.hasOwnProperty('sideFilm') || m.hasOwnProperty('endFilm')) {
      sideFilm = FILM_OPTS.indexOf(m.sideFilm) >= 0 ? m.sideFilm : '';
      endFilm = FILM_OPTS.indexOf(m.endFilm) >= 0 ? m.endFilm : '';
    } else if (m.film === 'fixed' || m.film === 'none') {
      sideFilm = endFilm = m.film;
    } else if (m.film === 'winch') {
      var ws = WINCH_SIDES.indexOf(m.winchSide) >= 0 ? m.winchSide : '兩側';
      if (ws !== '前後') sideFilm = 'winch';
      if (ws !== '兩側') endFilm = 'winch';
    }
  }
  var door = DOOR_OPTS.indexOf(m.door) >= 0 ? m.door : 'front';
  return { net: net, sideFilm: sideFilm, endFilm: endFilm, door: door, roof: roof };
}
