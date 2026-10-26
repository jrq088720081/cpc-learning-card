/* 中油學習卡｜阿電老師 v3 — 純前端、離線可用。錯題複習＋預留學習區。資料在 IndexedDB。 */
'use strict';

const APP_ID = 'mistake-notebook';
const DATA_VERSION = 7;
/** 考試時程（整條本地；自動爬官網＝下一階段）。首頁倒數／提醒與設定共用。 */
const DEFAULT_EXAM_LINKS = () => ([
  { id: 'cpc-jobs', name: '中油就業資訊', url: 'https://www.cpc.com.tw/News.aspx?n=32', note: '中油官網就業／甄試資訊', builtin: true },
  { id: 'exam-site', name: '當年甄試網站', url: '', note: '例如 cpc1xx.twrecruit.com.tw，簡章公布後填入', builtin: true }
]);
/** 歷屆對照（可增刪）；已知：113 筆試 2024-09-28、114 筆試 2025-12-13 */
const DEFAULT_EXAM_HISTORY = () => ([
  { id: 'y113', yearLabel: '113', prospectusDate: '', registerStart: '', registerEnd: '', writtenDate: '2024-09-28', secondStart: '', secondEnd: '', note: '已知筆試日' },
  { id: 'y114', yearLabel: '114', prospectusDate: '', registerStart: '', registerEnd: '', writtenDate: '2025-12-13', secondStart: '', secondEnd: '', note: '已知筆試日' }
]);
const DEFAULT_EXAM_SCHEDULE = () => ({
  title: '中油僱員甄試',
  prospectusDate: '',
  registerStart: '',
  registerEnd: '',
  writtenDate: '2027-12-11', // 第一試筆試；預設歷屆推估
  secondStart: '',
  secondEnd: '',
  certDeadline: '',
  status: 'estimate', // estimate | official | manual（整條狀態）
  note: '',
  links: DEFAULT_EXAM_LINKS(),
  history: DEFAULT_EXAM_HISTORY()
});
function normalizeExamLinks(list) {
  const raw = Array.isArray(list) && list.length ? list : DEFAULT_EXAM_LINKS();
  const mapped = raw.map((x, i) => ({
    id: x.id || ('elink-' + i),
    name: String(x.name || '連結').slice(0, 40),
    url: String(x.url || '').trim(),
    note: String(x.note || '').slice(0, 80),
    builtin: !!x.builtin
  }));
  // 確保至少有可點的中油就業資訊
  if (!mapped.some((l) => l.id === 'cpc-jobs')) {
    mapped.unshift(DEFAULT_EXAM_LINKS()[0]);
  } else {
    const j = mapped.find((l) => l.id === 'cpc-jobs');
    if (!j.url || j.url === 'https://www.cpc.com.tw/' || j.url === 'https://www.cpc.com.tw') {
      j.url = 'https://www.cpc.com.tw/News.aspx?n=32';
      j.name = j.name || '中油就業資訊';
    }
  }
  if (!mapped.some((l) => l.id === 'exam-site')) mapped.push(DEFAULT_EXAM_LINKS()[1]);
  return mapped;
}
function normalizeExamHistory(list) {
  const ok = (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
  const raw = Array.isArray(list) && list.length ? list : DEFAULT_EXAM_HISTORY();
  return raw.map((x, i) => {
    const row = Object.assign({ id: 'yh-' + i, yearLabel: '', prospectusDate: '', registerStart: '', registerEnd: '', writtenDate: '', secondStart: '', secondEnd: '', note: '' }, x || {});
    ['prospectusDate', 'registerStart', 'registerEnd', 'writtenDate', 'secondStart', 'secondEnd'].forEach((k) => { if (!ok(row[k])) row[k] = ''; });
    row.yearLabel = String(row.yearLabel || '').slice(0, 8);
    row.note = String(row.note || '').slice(0, 80);
    row.id = row.id || ('yh-' + i);
    return row;
  });
}
function normalizeExamSchedule(raw) {
  const d = DEFAULT_EXAM_SCHEDULE();
  const x = Object.assign({}, d, raw && typeof raw === 'object' ? raw : {});
  // 相容舊欄位 writtenSource
  if (!x.status && x.writtenSource) x.status = x.writtenSource;
  const ok = (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
  ['writtenDate', 'prospectusDate', 'registerStart', 'registerEnd', 'secondStart', 'secondEnd', 'certDeadline'].forEach((k) => {
    if (!ok(x[k])) x[k] = k === 'writtenDate' ? d.writtenDate : '';
  });
  if (!x.writtenDate) x.writtenDate = d.writtenDate;
  if (!['estimate', 'official', 'manual'].includes(x.status)) x.status = 'estimate';
  x.title = String(x.title || d.title).slice(0, 40);
  x.note = String(x.note || '').slice(0, 200);
  x.links = normalizeExamLinks(x.links);
  x.history = normalizeExamHistory(x.history);
  delete x.writtenSource;
  return x;
}
function writtenSourceLabel(src) {
  return ({ estimate: '歷屆推估', official: '官方簡章', manual: '手動設定' })[src] || src;
}
/** 筆試／時程備註：官方則不顯示「可能」 */
function writtenAside(ex) {
  if (!ex.writtenDate) return '尚未設定筆試日';
  if (ex.status === 'official') return '正式簡章時程';
  if (ex.status === 'manual') return '手動設定（請自行確認是否已正式公布）';
  return '可能為歷屆考試時間';
}
/** 推估／歷屆：固定免責；官方：已依簡章更新 */
function examDisclaimer(ex) {
  if (ex.status === 'official') return '已依中油簡章更新';
  return '時間以中油公布為準；此處僅為歷屆推估，僅供讀書規劃參考。';
}
function examDisclaimerShort(ex) {
  if (ex.status === 'official') return '已依中油簡章更新';
  return '以中油公布為準';
}
function applyExamEstimate(ex) {
  const base = normalizeExamSchedule(ex);
  base.writtenDate = '2027-12-11';
  base.status = 'estimate';
  base.note = (base.note && !/歷屆推估/.test(base.note)) ? base.note : '依歷屆節奏推估，正式簡章公布後請改成官方並更新日期';
  return base;
}
function daysUntil(dateStr, from = today()) {
  if (!dateStr) return null;
  return diffDays(from, dateStr);
}
function countdownText(dateStr, from = today()) {
  const n = daysUntil(dateStr, from);
  if (n === null) return '未設定';
  if (n > 0) return `還有 ${n} 天`;
  if (n === 0) return '就是今天';
  return `已過 ${-n} 天`;
}
/** 報名提醒：距開始≤7 天或距截止≤3 天（僅 App 打開時橫幅） */
function examRegAlerts(ex, t = today()) {
  const out = [];
  const toStart = daysUntil(ex.registerStart, t);
  const toEnd = daysUntil(ex.registerEnd, t);
  if (toStart !== null && toStart >= 0 && toStart <= 7) {
    out.push({ kind: 'reg-start', text: toStart === 0 ? '報名今天開始！' : `再 ${toStart} 天開始報名（${ex.registerStart}）` });
  }
  if (toEnd !== null && toEnd >= 0 && toEnd <= 3) {
    out.push({ kind: 'reg-end', text: toEnd === 0 ? '報名今天截止！' : `報名還有 ${toEnd} 天截止（${ex.registerEnd}）` });
  }
  return out;
}



const QUIZ_AFTER_DAYS = 60;                   // 已完成超過幾天，首頁提示可以抽考
const EBBINGHAUS = [1, 2, 4, 7, 15, 30];       // 預設：艾賓浩斯記憶曲線
const BACKUP_REMIND_DAYS = 7;
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.82;

const DEFAULT_CATEGORIES = [
  { id: 'lang', name: '語文類', reasons: ['單字不會', '片語或搭配不會', '文法不懂', '看不懂整句意思', '會話情境判斷錯', '被相似選項騙', '看漏關鍵字', '猜對的'] },
  { id: 'calc', name: '計算／理科類', reasons: ['觀念不懂', '公式忘了或用錯', '基礎數學不熟（分數/移項/次方/根號）', '看漏條件或關鍵字', '計算錯（抄錯/漏負號）', '單位換算錯（k、m、μ）', '不知道從哪裡開始', '時間不夠'] }
];
const DEFAULT_TABS = [
  { id: 'english', name: '英文', category: 'lang', intervals: null },
  { id: 'zh', name: '國文', category: 'lang', intervals: null },
  { id: 'ee', name: '電工原理', category: 'calc', intervals: null },
  { id: 'em', name: '電工機械', category: 'calc', intervals: null },
  { id: 'math', name: '數學基礎', category: 'calc', intervals: null }
];
const TAG_COLORS = 6;

/* 學習資源連結（可增刪改；builtin 預設可還原，但不鎖死） */
const LEARN_SUBJECTS = [
  { id: 'math', name: '數學基礎' },
  { id: 'en', name: '英文' },
  { id: 'zh', name: '國文' },
  { id: 'ee', name: '電工原理' },
  { id: 'em', name: '電工機械' }
];
const DEFAULT_LEARN_LINKS = () => ([
  { id: 'math-frac', subject: 'math', unit: '分數四則', name: '均一：分數四則（七上）', url: 'https://www.junyiacademy.org/topics/j-m7a', note: '均一版七年級含分數運算；App 內例題搞不懂再點進來', builtin: true },
  { id: 'math-frac-cloud', subject: 'math', unit: '分數四則', name: '教育百科（教育雲）', url: 'https://pedia.cloud.edu.tw/', note: '台灣免費資源入口，可搜「分數」', builtin: true },
  { id: 'math-linear1', subject: 'math', unit: '一元一次方程式', name: '均一：一元一次方程式', url: 'https://www.junyiacademy.org/topics/mjayy', note: '移項、等量公理、應用', builtin: true },
  { id: 'math-linear2', subject: 'math', unit: '二元一次聯立方程式', name: '均一：解二元一次聯立', url: 'https://www.junyiacademy.org/topics/mjaey7b', note: '代入法／加減消去法', builtin: true },
  { id: 'math-sign', subject: 'math', unit: '正負數', name: '均一：七年級數學總覽', url: 'https://www.junyiacademy.org/topics/math-7', note: '整數／正負數；電學常用，可之後擴充', builtin: true },
  { id: 'math-junior', subject: 'math', unit: '其他', name: '均一：國中數學', url: 'https://www.junyiacademy.org/topics/masc-juni-ma', note: '之後擴充次方、根號、比例、單位換算時可從此找單元', builtin: true },
  { id: 'ee-basic', subject: 'ee', unit: '基礎觀念', name: '均一首頁（電學自訂）', url: 'https://www.junyiacademy.org/', note: '可自行改成更精確的電學單元連結', builtin: true }
]);
function mergeLearnLinks(stored) {
  const defaults = DEFAULT_LEARN_LINKS();
  if (!Array.isArray(stored) || !stored.length) return defaults;
  const byId = new Map(stored.map((x) => [x.id, x]));
  // keep user list order; ensure each item has fields
  const out = stored.map((x) => ({
    id: x.id || ('link-' + Math.random().toString(36).slice(2, 9)),
    subject: x.subject || 'math',
    unit: x.unit || '',
    name: x.name || '未命名連結',
    url: x.url || '',
    note: x.note || '',
    builtin: !!x.builtin
  })).filter((x) => x.url || x.name);
  return out.length ? out : defaults;
}


/* ---------- 日期（一律用本地日期） ---------- */
const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dateStr(new Date());
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; }
function addDays(s, n) { const { y, m, d } = parseDate(s); return dateStr(new Date(y, m - 1, d + n)); }
function diffDays(a, b) { const A = parseDate(a), B = parseDate(b); return Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 86400000); }
function prettyDate(s) { const { m, d } = parseDate(s); return `${m}/${d}`; }

/* ---------- 小工具 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const shortId = (p) => p + '-' + uid().replace(/-/g, '').slice(0, 8);

let objectUrls = [];
function blobUrl(blob) { if (!blob) return ''; const u = URL.createObjectURL(blob); objectUrls.push(u); return u; }
function releaseUrls() { objectUrls.forEach((u) => URL.revokeObjectURL(u)); objectUrls = []; }

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; t.onclick = null; t.style.cursor = ''; }, 2600);
}
/** Toast with optional action link (e.g. 復原). */
function toastAction(msg, actionLabel, onAction, ms = 5000) {
  const el = $('#toast');
  el.innerHTML = `${esc(msg)} <button type="button" class="toast-action">${esc(actionLabel)}</button>`;
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  el.style.cursor = 'default';
  const btn = el.querySelector('.toast-action');
  const clear = () => { el.hidden = true; el.textContent = ''; el.onclick = null; el.style.cursor = ''; btn && (btn.onclick = null); };
  clearTimeout(toastTimer); toastTimer = setTimeout(clear, ms);
  if (btn) btn.onclick = (e) => { e.stopPropagation(); clearTimeout(toastTimer); clear(); onAction && onAction(); };
}

let _pendingUndo = null;
async function removeMistakesWithUndo(ids, { redirectList = false } = {}) {
  const idList = [...new Set((ids || []).filter(Boolean))];
  if (!idList.length) return false;
  const snaps = [];
  for (const id of idList) {
    const m = await DB.get(id);
    if (m) snaps.push(m);
  }
  if (!snaps.length) { toast('找不到要剔除的題'); return false; }
  await DB.delMany(snaps.map((m) => m.id));
  _pendingUndo = snaps;
  const label = snaps.length === 1 ? '已從錯題本剔除' : `已剔除 ${snaps.length} 題`;
  toastAction(label, '復原', async () => {
    if (!_pendingUndo) return;
    await DB.putMany(_pendingUndo);
    _pendingUndo = null;
    toast('已復原');
    if (typeof render === 'function') render();
  });
  if (redirectList) location.hash = '#list';
  else if (typeof render === 'function') render();
  return true;
}

async function confirmRemoveMistakes(ids) {
  const n = (ids || []).length;
  if (!n) return false;
  const ok = await confirmBox(
    '確定從錯題本剔除？',
    n === 1
      ? '<p>這題會從錯題本<strong>完全移除</strong>（含照片與複習排程），跟「已完成複習」不一樣。</p><p class="muted small">若是誤加或誤按，剔除後幾秒內可按「復原」。</p>'
      : `<p>將剔除 <b>${n}</b> 題，從錯題本<strong>完全移除</strong>（含照片與複習排程）。</p><p class="muted small">誤按可在提示出現時按「復原」。</p>`,
    n === 1 ? '剔除' : `剔除 ${n} 題`,
    true
  );
  if (!ok) return false;
  return removeMistakesWithUndo(ids, { redirectList: n === 1 && location.hash.startsWith('#detail') });
}

function modal({ title, html = '', okText = '確定', cancelText = '取消', danger = false, onOpen }) {
  return new Promise((resolve) => {
    const dlg = $('#modal');
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    const ok = $('#modalOk'), cancel = $('#modalCancel');
    ok.textContent = okText; cancel.textContent = cancelText || '';
    cancel.hidden = cancelText === null;
    ok.className = 'btn ' + (danger ? 'btn-bad' : 'btn-primary');
    dlg.returnValue = '';
    const done = () => { dlg.removeEventListener('close', done); resolve({ ok: dlg.returnValue === 'ok', body: $('#modalBody') }); };
    dlg.addEventListener('close', done);
    dlg.showModal();
    if (onOpen) onOpen($('#modalBody'));
  });
}
const confirmBox = async (title, html, okText = '確定', danger = false) => (await modal({ title, html, okText, danger })).ok;
const alertBox = (title, html) => modal({ title, html, okText: '知道了', cancelText: null });

/* ---------- IndexedDB ---------- */
let dbp;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(APP_ID, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('mistakes')) d.createObjectStore('mistakes', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    let result;
    Promise.resolve(fn(t.objectStore(store))).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('資料庫寫入失敗'));
  });
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const DB = {
  all: () => tx('mistakes', 'readonly', (s) => reqP(s.getAll())),
  get: (id) => tx('mistakes', 'readonly', (s) => reqP(s.get(id))),
  put: (m) => tx('mistakes', 'readwrite', (s) => { s.put(m); }),
  putMany: (list) => tx('mistakes', 'readwrite', (s) => { list.forEach((m) => s.put(m)); }),
  del: (id) => tx('mistakes', 'readwrite', (s) => { s.delete(id); }),
  delMany: (ids) => tx('mistakes', 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); }),
  clear: () => tx('mistakes', 'readwrite', (s) => { s.clear(); }),
  async meta(key, fallback) { const r = await tx('meta', 'readonly', (s) => reqP(s.get(key))); return r ? r.value : fallback; },
  setMeta: (key, value) => tx('meta', 'readwrite', (s) => { s.put({ key, value }); })
};

/* ---------- 設定：分頁、分類、間隔 ---------- */
let settings = null;
let currentTab = ''; // '' = 全部
async function loadSettings() {
  settings = {
    tabs: await DB.meta('tabs', null) || structuredClone(DEFAULT_TABS),
    categories: await DB.meta('categories', null) || structuredClone(DEFAULT_CATEGORIES),
    intervals: await DB.meta('intervals', null) || [...EBBINGHAUS],
    chapters: await DB.meta('chapters', {}),
    sources: await DB.meta('sources', []),
    lastBackup: await DB.meta('lastBackup', null),
    driveBackup: Object.assign(DriveBackup.DEFAULT_DRIVE(), await DB.meta('driveBackup', null) || {}),
    learnLinks: mergeLearnLinks(await DB.meta('learnLinks', null)),
    dailyGoal: Math.max(1, Math.min(50, Number(await DB.meta('dailyGoal', 10)) || 10)),
    examSchedule: normalizeExamSchedule(await DB.meta('examSchedule', null))
  };
  currentTab = await DB.meta('currentTab', '');
  if (currentTab && !settings.tabs.some((t) => t.id === currentTab)) currentTab = '';
}
async function saveSettings(...keys) { for (const k of keys) await DB.setMeta(k, settings[k]); }
const tabOf = (id) => settings.tabs.find((t) => t.id === id) || { id, name: '（已刪除的分頁）', category: settings.categories[0]?.id, intervals: null };
const categoryOf = (id) => settings.categories.find((c) => c.id === id) || { id, name: '（未知分類）', reasons: [] };
const intervalsFor = (tabId) => { const t = tabOf(tabId); return t.intervals && t.intervals.length ? t.intervals : settings.intervals; };
const isEbb = (arr) => arr.join(',') === EBBINGHAUS.join(',');
function tabTag(id) {
  const i = settings.tabs.findIndex((t) => t.id === id);
  return `<span class="tag tag-c${(i < 0 ? 0 : i) % TAG_COLORS}">${esc(tabOf(id).name)}</span>`;
}
function parseIntervals(str) {
  const parts = String(str).split(/[,，、\s]+/).filter(Boolean);
  if (!parts.length) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 3650)) return null;
  return nums;
}
const ivText = (arr) => arr.join(', ');
const ivChips = (arr) => `<div class="iv-chips">${arr.map((d, i) => `<span>第${i + 1}關 ${d}天</span>`).join('')}</div>`;
function remember(kind, value, tabId) {
  const v = (value || '').trim(); if (!v) return;
  if (kind === 'chapters') settings.chapters[tabId] = [v, ...(settings.chapters[tabId] || []).filter((x) => x !== v)].slice(0, 40);
  else settings.sources = [v, ...settings.sources.filter((x) => x !== v)].slice(0, 40);
}
async function setCurrentTab(id) { currentTab = id; await DB.setMeta('currentTab', id); }

/* ---------- 複習規則 ---------- */
function stageLabel(m) {
  if (m.status === 'done') return '已完成複習';
  const iv = intervalsFor(m.subject); const st = Math.min(m.stage, iv.length - 1);
  return `第 ${st + 1}/${iv.length} 關`;
}
const isDue = (m, t = today()) => m.status === 'active' && m.nextDue && m.nextDue <= t;
function applyResult(m, correct) {
  const t = today(); const iv = intervalsFor(m.subject);
  const st = Math.min(m.stage, iv.length - 1);
  m.history = m.history || [];
  m.history.push({ date: t, result: correct ? 'correct' : 'wrong', stage: st });
  if (correct) {
    if (st >= iv.length - 1) { m.stage = st; markDone(m, 'auto'); }
    else { m.stage = st + 1; m.nextDue = addDays(t, iv[m.stage]); }
  } else { m.stage = 0; m.nextDue = addDays(t, iv[0]); }
  m.updatedAt = Date.now();
  return m;
}
/* 已完成複習：手動標記、最後一關答對自動移入、重新複習 */
function normalize(m) {
  if (m.status === 'mastered') { m.status = 'done'; m.doneAt = m.doneAt || m.masteredAt || null; m.doneBy = m.doneBy || 'auto'; }
  delete m.masteredAt;
  if (m.status !== 'done' && m.status !== 'active') m.status = 'active';
  m.history = Array.isArray(m.history) ? m.history : [];
  m.relearnCount = m.relearnCount || 0;
  m.relearnDates = Array.isArray(m.relearnDates) ? m.relearnDates : [];
  m.starred = !!m.starred;
  m.note = m.note || ''; // 逐題小筆記（進備份）
  return m;
}
const reviewCount = (m) => (m.history || []).filter((h) => h.result === 'correct' || h.result === 'wrong').length;
const doneDays = (m, t = today()) => (m.status === 'done' && m.doneAt ? diffDays(m.doneAt, t) : 0);
const isQuizzable = (m, t = today()) => m.status === 'done' && !!m.doneAt && doneDays(m, t) > QUIZ_AFTER_DAYS;
function markDone(m, how) {
  const t = today();
  m.status = 'done'; m.nextDue = null; m.doneAt = t; m.doneBy = how;
  m.history = m.history || []; m.history.push({ date: t, result: how === 'manual' ? 'done' : 'auto-done', stage: m.stage });
  m.updatedAt = Date.now(); return m;
}
function relearn(m) {
  const t = today();
  m.status = 'active'; m.stage = 0; m.nextDue = addDays(t, 1); m.doneAt = null; m.doneBy = null;
  m.relearnCount = (m.relearnCount || 0) + 1; m.relearnDates = [...(m.relearnDates || []), t];
  m.history = m.history || []; m.history.push({ date: t, result: 'relearn', stage: 0 });
  m.updatedAt = Date.now(); return m;
}
const inTab = (m) => !currentTab || m.subject === currentTab;
const reviewedToday = (m, t) => (m.history || []).some((h) => h.date === t && (h.result === 'correct' || h.result === 'wrong'));

/* ---------- 照片壓縮 ---------- */
function loadImage(url) { return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('讀不到這張照片')); img.src = url; }); }
async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(img, 0, 0, cw, ch);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('照片壓縮失敗'))), 'image/jpeg', JPEG_QUALITY));
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- 英文發音（瀏覽器內建 speechSynthesis，不用網路也常可用） ---------- */
const canSpeak = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
function pickVoice() {
  const vs = canSpeak() ? speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)) : [];
  return vs.find((v) => /en[-_]US/i.test(v.lang) && v.localService) || vs.find((v) => /en[-_]US/i.test(v.lang)) || vs[0] || null;
}
function speak(text, rate = 1) {
  if (!canSpeak()) { toast('這個瀏覽器不支援發音'); return; }
  const t = String(text || '').trim(); if (!t) { toast('沒有可以念的文字'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t); const v = pickVoice();
  if (v) u.voice = v; u.lang = v ? v.lang : 'en-US'; u.rate = rate;
  speechSynthesis.speak(u);
}
function pickZhVoice() {
  const vs = canSpeak() ? speechSynthesis.getVoices().filter((v) => /^zh/i.test(v.lang) || /chinese/i.test(v.name || '')) : [];
  return vs.find((v) => /zh[-_]TW/i.test(v.lang) && v.localService)
    || vs.find((v) => /zh[-_]TW/i.test(v.lang))
    || vs.find((v) => /zh[-_]HK/i.test(v.lang))
    || vs.find((v) => /zh[-_]CN/i.test(v.lang) && v.localService)
    || vs.find((v) => /zh[-_]CN/i.test(v.lang))
    || vs[0] || null;
}
/** 國文發音：優先 zh-TW，其次 zh-CN；不依賴網路 TTS API */
function speakZh(text, rate = 0.9) {
  if (!canSpeak()) { toast('這個瀏覽器不支援發音'); return; }
  const t = String(text || '').trim(); if (!t) { toast('沒有可以念的文字'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  const v = pickZhVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'zh-TW'; }
  u.rate = rate;
  speechSynthesis.speak(u);
}
const isLangTab = (tabId) => tabOf(tabId).category === 'lang';
const speakBtns = (prefix = '') => `<div class="speak-row"><button type="button" class="btn btn-soft btn-sm speak" data-rate="1" id="${prefix}speak">🔊 發音</button><button type="button" class="btn btn-soft btn-sm speak" data-rate="0.7" id="${prefix}speakSlow">🐢 慢速</button></div>`;
function wireSpeak(root, getText) { $$('.speak', root).forEach((b) => { b.onclick = (e) => { e.preventDefault(); speak(getText(), +b.dataset.rate); }; }); }

function rareCharMap() {
  const raw = (typeof window.__CHINESE_RARE_CHARS__ !== 'undefined' && window.__CHINESE_RARE_CHARS__) || null;
  return (raw && raw.chars) || {};
}
/** 生僻字旁加注音小標，可點擊單字發音；常見字保持純文字 */
function annotateZhText(text, { annotate = true } = {}) {
  const s = String(text ?? '');
  if (!s) return '—';
  const map = annotate ? rareCharMap() : {};
  let out = '';
  for (const ch of s) {
    const info = map[ch];
    if (info && info.zhuyin) {
      out += `<button type="button" class="zh-rubyc" data-speak="${esc(ch)}" title="${esc(ch)} ${esc(info.zhuyin)}"><span class="zh-han">${esc(ch)}</span><span class="zh-zy" aria-hidden="true">${esc(info.zhuyin)}</span></button>`;
    } else {
      out += esc(ch);
    }
  }
  return out;
}
function zhSpeakBtn(text, label = '🔊') {
  const t = String(text || '').replace(/（[^）]*）|\([^)]*\)/g, '').trim();
  if (!t) return '';
  return `<button type="button" class="btn btn-soft btn-sm zh-speak" data-speak="${esc(t)}" aria-label="發音">${label}</button>`;
}
function wireZhSpeak(root) {
  if (!root) return;
  root.querySelectorAll('[data-speak]').forEach((b) => {
    if (b._zhSpeakWired) return;
    b._zhSpeakWired = true;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      speakZh(b.getAttribute('data-speak') || '');
    });
  });
}

/* ---------- 分頁列 ---------- */
async function renderTabstrip(show) {
  const strip = $('#tabstrip');
  strip.hidden = !show; if (!show) return;
  const all = await DB.all(); const t = today();
  const due = (id) => all.filter((m) => isDue(m, t) && (!id || m.subject === id)).length;
  const btn = (id, name) => { const n = due(id); return `<button type="button" role="tab" data-tab="${esc(id)}" class="${currentTab === id ? 'on' : ''}" aria-selected="${currentTab === id}">${esc(name)}${n ? `<span class="cnt">${n}</span>` : ''}</button>`; };
  strip.innerHTML = btn('', '全部') + settings.tabs.map((x) => btn(x.id, x.name)).join('') + '<button type="button" class="add-tab" id="addTabBtn" aria-label="新增分頁">＋ 分頁</button>';
  strip.onclick = async (e) => {
    if (e.target.closest('#addTabBtn')) { if (await tabDialog(null)) render(); return; }
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    await setCurrentTab(b.dataset.tab); render();
  };
  const on = $('button.on', strip); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/* ---------- 路由 ---------- */
const TITLES = { learn: '學習', home: '中油學習卡', review: '今天要複習', session: '複習中', add: '新增錯題', 'add-done': '新增錯題', edit: '編輯錯題', list: '錯題列表', detail: '錯題內容', practice: '自由練習', settings: '設定', 'learn-en': '英文', 'learn-zh': '國文', 'learn-ee': '電工原理', 'learn-em': '電工機械', 'learn-math': '數學基礎', 'learn-tips': '備考技巧', 'learn-mock': '計時模擬考', 'learn-favs': '我的最愛', favs: '我的最愛' };
function parseHash() {
  const parts = (location.hash.replace(/^#/, '') || 'home').split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch (_) { return p; }
  });
  return { view: parts[0] || 'home', id: parts[1], parts };
}
async function render() {
  releaseUrls();
  // 離開刷題／模擬考時清掉計時器（同頁 paint 不走 render）
  try {
    const v = (location.hash.replace(/^#/,'').split('/')[0]||'');
    const inQuiz = /^(learn-(ee|em|en|zh|math|tips|mock|favs)|favs)/.test(v);
    if (!inQuiz && window.LearnUI && LearnUI.stopRunner) LearnUI.stopRunner();
  } catch (_) {}
  const { view, id } = parseHash();
  const tab = view === 'add-done' ? 'add' : view === 'session' ? 'review' : view === 'edit' || view === 'detail' || view === 'practice' ? 'list' : view.startsWith('learn') ? 'learn' : view;
  $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  $('#pageTitle').textContent = TITLES[view] || TITLES.home;
  $('#backBtn').hidden = !['session', 'edit', 'detail', 'practice', 'learn-en', 'learn-zh', 'learn-ee', 'learn-em', 'learn-math', 'learn-tips', 'learn-mock', 'learn-favs'].includes(view);
  const app = $('#app');
  app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter');
  await renderTabstrip(['home', 'review', 'list'].includes(view));
  try {
    switch (view) {
      case 'learn': await LearnUI.viewLearn(app); break;
      case 'learn-en': await LearnUI.viewEn(app, parseHash().parts.slice(1)); break;
      case 'learn-zh': await viewLearnZh(app, parseHash().parts.slice(1)); break;
      case 'learn-ee': await LearnUI.viewPro(app, 'ee', parseHash().parts.slice(1)); break;
      case 'learn-em': await LearnUI.viewPro(app, 'em', parseHash().parts.slice(1)); break;
      case 'learn-math': await LearnUI.viewMath(app, parseHash().parts.slice(1)); break;
      case 'learn-tips': await LearnUI.viewTips(app, parseHash().parts.slice(1)); break;
      case 'learn-favs': case 'favs': await LearnUI.viewFavs(app, parseHash().parts.slice(1)); break;
      case 'learn-mock': await LearnUI.viewMock(app, parseHash().parts.slice(1)); break;
      case 'review': await viewReview(app); break;
      case 'session': await viewSession(app); break;
      case 'add': await viewForm(app, null); break;
      case 'add-done': await viewAddDone(app); break;
      case 'edit': await viewForm(app, id); break;
      case 'list': await viewList(app); break;
      case 'detail': await viewDetail(app, id); break;
      case 'practice': await viewPractice(app, id); break;
      case 'settings': await viewSettings(app); break;
      default: await viewHome(app);
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="card"><h2>出了點問題</h2><p>${esc(err.message)}</p><a class="btn btn-primary" href="#home">回首頁</a></div>`;
  }
  window.scrollTo(0, 0);
  updateBadge();
}
async function updateBadge() {
  const n = (await DB.all()).filter((m) => isDue(m)).length;
  const b = $('#dueBadge'); b.hidden = n === 0; b.textContent = n > 99 ? '99+' : n;
}

/* ---------- 首頁 ---------- */
function backupAgeDays() { return settings.lastBackup ? diffDays(settings.lastBackup, today()) : null; }
function ring(done, total, centerBig, centerSmall) {
  const r = 52, c = 2 * Math.PI * r, pct = total ? done / total : 1;
  return `<svg class="ring" viewBox="0 0 128 128" role="img" aria-label="今天進度 ${done}/${total}">
    <circle cx="64" cy="64" r="${r}" class="ring-bg"/>
    <circle cx="64" cy="64" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}" style="--c:${c.toFixed(1)}"/>
    <text x="64" y="62" class="ring-big">${centerBig}</text><text x="64" y="86" class="ring-small">${centerSmall}</text></svg>`;
}

/* ---------- 國文學習區（常識總表＋刷題） ---------- */
let _zhKnowledge = null;
async function loadZhKnowledge() {
  if (_zhKnowledge) return _zhKnowledge;
  if (typeof window.__CHINESE_KNOWLEDGE__ !== 'undefined' && window.__CHINESE_KNOWLEDGE__) {
    _zhKnowledge = window.__CHINESE_KNOWLEDGE__;
    return _zhKnowledge;
  }
  try {
    const r = await fetch('./data/chinese/knowledge.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _zhKnowledge = await r.json();
  } catch (err) {
    console.warn('國文常識表載入失敗', err);
    _zhKnowledge = { totals: { rows: 0, categories: 0, sections: 0 }, categories: [] };
  }
  return _zhKnowledge;
}

function zhFindCat(data, catId) {
  return (data.categories || []).find((c) => c.id === catId);
}
function zhFindSec(cat, secId) {
  return cat && (cat.sections || []).find((s) => s.id === secId);
}

function zhSeg(active) {
  return `<div class="mode-seg zh-seg" role="tablist" aria-label="國文分段">
    <a href="#learn-zh/quiz" role="tab" class="${active === 'quiz' ? 'on' : ''}" aria-selected="${active === 'quiz'}">刷題</a>
    <a href="#learn-zh" role="tab" class="${active === 'kb' ? 'on' : ''}" aria-selected="${active === 'kb'}">常識總表</a>
  </div>`;
}

function zhNoteTag(tag, note) {
  if (tag === 'exam') return `<span class="tag tag-exam">考古</span>`;
  if (tag === 'extension') return `<span class="tag tag-ext">延伸補充</span>`;
  return note ? `<span class="tag">備註</span>` : '';
}

function zhBreadcrumb(parts) {
  const crumbs = [{ href: '#learn-zh', label: '國文' }];
  if (parts[0] === 'quiz') crumbs.push({ href: '#learn-zh/quiz', label: '刷題' });
  else if (parts[0] === 'kb' || !parts[0]) {
    if (parts[0] === 'kb' || parts.length === 0) crumbs.push({ href: '#learn-zh', label: '常識總表' });
  }
  return `<nav class="zh-bc" aria-label="目前位置">${crumbs.map((c, i) =>
    i < crumbs.length - 1 ? `<a href="${c.href}">${esc(c.label)}</a><span class="zh-bc-sep">›</span>` : `<span>${esc(c.label)}</span>`
  ).join('')}</nav>`;
}

async function viewLearnZh(app, parts) {
  const data = await loadZhKnowledge();
  const totals = data.totals || {};
  const mode = parts[0] === 'quiz' ? 'quiz' : 'kb';

  // Deep: #learn-zh/kb/:cat/:sec
  if (parts[0] === 'kb' && parts[1] && parts[2]) {
    const cat = zhFindCat(data, parts[1]);
    const sec = zhFindSec(cat, parts[2]);
    $('#pageTitle').textContent = sec ? sec.name.replace(/^[\(（][^）\)]+[）\)]\s*/, '').slice(0, 12) : '常識表';
    if (!cat || !sec) {
      app.innerHTML = `<section class="card"><h2>找不到這一表</h2><p class="muted">可能是舊連結。</p><a class="btn btn-primary" href="#learn-zh">回國文</a></section>`;
      return;
    }
    await viewZhTable(app, data, cat, sec);
    return;
  }

  // Category sections: #learn-zh/kb/:cat
  if (parts[0] === 'kb' && parts[1]) {
    const cat = zhFindCat(data, parts[1]);
    $('#pageTitle').textContent = cat ? cat.name : '常識總表';
    if (!cat) {
      app.innerHTML = `<section class="card"><h2>找不到分類</h2><a class="btn btn-primary" href="#learn-zh">回國文</a></section>`;
      return;
    }
    const list = (cat.sections || []).map((s) => `
      <a class="overview-tab learn-card zh-sec-card" href="#learn-zh/kb/${esc(cat.id)}/${esc(s.id)}">
        <b>${esc(s.name)}</b>
        <span class="muted small">${s.rowCount} 筆</span>
      </a>`).join('');
    app.innerHTML = `
      <nav class="zh-bc" aria-label="目前位置">
        <a href="#learn-zh">國文</a><span class="zh-bc-sep">›</span>
        <a href="#learn-zh">常識總表</a><span class="zh-bc-sep">›</span>
        <span>${esc(cat.name)}</span>
      </nav>
      <section class="card learn-shell">
        <h2>${esc(cat.name)}</h2>
        <p class="muted small">${esc(cat.blurb || '')}・共 ${cat.rowCount} 筆</p>
      </section>
      <div class="learn-subjects zh-sec-list">${list}</div>
      <div class="btn-row"><a class="btn btn-soft" href="#learn-zh">回常識總表</a></div>`;
    return;
  }

  // Hub: quiz or knowledge home
  $('#pageTitle').textContent = '國文';
  if (mode === 'quiz') {
    await LearnUI.viewZhQuizHub(app);
    return;
  }

  const cats = (data.categories || []).map((c) => `
    <a class="overview-tab learn-card" href="#learn-zh/kb/${esc(c.id)}">
      <b>${esc(c.name)}</b>
      <span class="muted small">${esc(c.blurb || '')}</span>
      <span class="tag">${c.sectionCount} 表・${c.rowCount} 筆</span>
    </a>`).join('');

  app.innerHTML = `
    ${zhSeg('kb')}
    <section class="card learn-shell">
      <h2>常識總表 <span class="tag tag-ok">第一批</span></h2>
      <p>依字音字形、古典文學、國學常識、應用文、現代文學分類查表複習。標「考古」者附年份；「延伸補充」為考卷未直接出、但常考的補強。</p>
      <p class="muted small">本批共 <b>${totals.rows || 0}</b> 筆（考古約 ${totals.exam || 0}、延伸 ${totals.extension || 0}）。離線可讀。刷題區已可用（114＋常識自出）。</p>
    </section>
    <div class="learn-subjects">${cats || '<p class="muted">尚未載入資料。</p>'}</div>
    <div class="btn-row"><a class="btn btn-soft" href="#learn">回學習</a></div>`;
}

async function viewZhTable(app, data, cat, sec) {
  const cols = sec.columns || [];
  const noteIdx = cols.findIndex((c) => String(c).includes('備註'));
  const rows = sec.rows || [];
  const doAnnotate = cat.id === 'chars' || cat.id === 'classic' || cat.id === 'culture';
  // columns that are "headword / sentence" get ruby + speak
  const headCols = cols.map((c, i) => ({ c, i })).filter(({ c }) =>
    /字[\/／]詞|正確寫法|成語|詞語|句子|名句|修辭|項目|稱謂|用語|作家|篇名|花木|人物|稱號|部類|書|流派|詩句/.test(c)
  ).map((x) => x.i);
  const readingIdx = cols.findIndex((c) => /正確讀音|讀音/.test(c));

  const renderVal = (col, i, cells) => {
    const val = cells[i] || '—';
    if (i === noteIdx) return '';
    const isHead = headCols.includes(i);
    const body = (isHead && doAnnotate) ? annotateZhText(val, { annotate: true }) : esc(val);
    const speak = isHead ? zhSpeakBtn(val) : '';
    // 字音表：讀音欄已是注音，加發音（念頭詞）
    if (i === readingIdx) {
      const head = headCols.length ? cells[headCols[0]] : '';
      return `<div class="zh-field"><span class="zh-k">${esc(col)}</span><span class="zh-v zh-reading">${esc(val)} ${zhSpeakBtn(head || val, '🔊 念')}</span></div>`;
    }
    return `<div class="zh-field"><span class="zh-k">${esc(col)}</span><span class="zh-v">${body}${speak ? ` ${speak}` : ''}</span></div>`;
  };

  const cards = rows.map((r, idx) => {
    const cells = r.cells || r;
    const note = r.note != null ? r.note : (noteIdx >= 0 ? cells[noteIdx] : '');
    const tag = r.tag || 'other';
    const fields = cols.map((col, i) => renderVal(col, i, cells)).join('');
    const head = headCols.length ? cells[headCols[0]] : (cells[0] || '');
    return `<article class="card soft-card zh-row" data-idx="${idx}" data-q="${esc((cells || []).join(' ').toLowerCase())}">
      ${fields}
      <div class="zh-note-row">${zhNoteTag(tag, note)}${note ? `<span class="zh-note">${esc(note)}</span>` : '<span class="muted small">—</span>'}${zhSpeakBtn(head, '🔊 整詞')}</div>
    </article>`;
  }).join('');

  const thead = `<tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}<th class="zh-th-speak">發音</th></tr>`;
  const tbody = rows.map((r, idx) => {
    const cells = r.cells || r;
    const note = r.note != null ? r.note : '';
    const tag = r.tag || 'other';
    const head = headCols.length ? cells[headCols[0]] : (cells[0] || '');
    const tds = cols.map((col, i) => {
      const val = cells[i] || '—';
      if (String(col).includes('備註')) {
        return `<td class="zh-td-note">${zhNoteTag(tag, note)} <span>${esc(val)}</span></td>`;
      }
      if (headCols.includes(i) && doAnnotate) {
        return `<td>${annotateZhText(val)} ${zhSpeakBtn(val)}</td>`;
      }
      if (i === readingIdx) {
        return `<td class="zh-reading">${esc(val)}</td>`;
      }
      return `<td>${esc(val)}</td>`;
    }).join('');
    return `<tr class="zh-tr" data-idx="${idx}" data-q="${esc((cells || []).join(' ').toLowerCase())}">${tds}<td>${zhSpeakBtn(head, '🔊')}</td></tr>`;
  }).join('');

  const tip = doAnnotate
    ? '<p class="muted small">生僻字旁有注音（如 慍<span class="zh-zy-inline">ㄩㄣˋ</span>），可點字或按 🔊；使用手機／電腦內建語音（zh-TW／zh-CN），不需網路語音 API。</p>'
    : '<p class="muted small">可按 🔊 念整詞（內建語音）。</p>';

  app.innerHTML = `
    <nav class="zh-bc" aria-label="目前位置">
      <a href="#learn-zh">國文</a><span class="zh-bc-sep">›</span>
      <a href="#learn-zh">常識總表</a><span class="zh-bc-sep">›</span>
      <a href="#learn-zh/kb/${esc(cat.id)}">${esc(cat.name)}</a><span class="zh-bc-sep">›</span>
      <span>${esc(sec.name)}</span>
    </nav>
    <section class="card learn-shell">
      <h2>${esc(sec.name)}</h2>
      <p class="muted small">${rows.length} 筆・可搜尋過濾</p>
      ${tip}
      <label class="field zh-search-field">
        <span class="field-title">搜尋</span>
        <input type="search" id="zhSearch" placeholder="過濾字詞、讀音、備註…" autocomplete="off">
      </label>
      <p class="muted small" id="zhFilterMeta">顯示 ${rows.length} / ${rows.length}</p>
    </section>
    <div class="zh-cards" id="zhCards">${cards || '<p class="muted">此表沒有資料。</p>'}</div>
    <div class="zh-table-wrap" id="zhTableWrap">
      <table class="zh-table" id="zhTable">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    <div class="btn-row" style="margin:14px 0 8px">
      <a class="btn btn-soft" href="#learn-zh/kb/${esc(cat.id)}">回${esc(cat.name)}</a>
      <a class="btn btn-soft" href="#learn-zh">常識總表</a>
    </div>`;

  const input = $('#zhSearch');
  const meta = $('#zhFilterMeta');
  const apply = () => {
    const q = (input.value || '').trim().toLowerCase();
    let n = 0;
    $$('.zh-row').forEach((el) => {
      const ok = !q || (el.dataset.q || '').includes(q);
      el.hidden = !ok;
      if (ok) n++;
    });
    $$('.zh-tr').forEach((el) => {
      const ok = !q || (el.dataset.q || '').includes(q);
      el.hidden = !ok;
    });
    meta.textContent = q ? `顯示 ${n} / ${rows.length}（「${input.value.trim()}」）` : `顯示 ${rows.length} / ${rows.length}`;
  };
  if (input) input.oninput = apply;
  wireZhSpeak(app);
}



async function viewLearn(app) { return LearnUI.viewLearn(app); }
async function viewLearnSubject(app, subject) {
  if (subject === 'math') return LearnUI.viewMath(app, []);
  if (subject === 'en') return LearnUI.viewEn(app, []);
  if (subject === 'ee' || subject === 'em') return LearnUI.viewPro(app, subject, []);
  return LearnUI.viewLearn(app);
}


async function viewHome(app) {
  const t = today();
  const everything = await DB.all();
  const all = everything.filter(inTab);
  const due = all.filter((m) => isDue(m, t));
  const doneToday = all.filter((m) => reviewedToday(m, t) && !isDue(m, t)).length;
  const doneN = all.filter((m) => m.status === 'done').length;
  const quizN = all.filter((m) => isQuizzable(m, t)).length;
  const age = backupAgeDays();
  const canCloud = DriveBackup.online() && DriveBackup.hasClientId(settings) && settings.driveBackup.connected;
  const backupHtml = everything.length > 0 && (age === null || age > BACKUP_REMIND_DAYS)
    ? `<div class="alert alert-warn" id="backupAlert"><div><b>${age === null ? '你還沒有備份過' : `已經 ${age} 天沒有備份了`}</b><br><span class="small">手機壞掉或清除資料，錯題就會不見。${canCloud ? '可以一鍵備份到 Google 雲端硬碟。' : '建議先下載備份，或到設定連接雲端硬碟。'}</span></div>
       <button class="btn btn-primary btn-sm" id="homeBackup">${canCloud ? '☁ 備份到雲端硬碟' : '立刻備份'}</button></div>` : '';
  const counts = {};
  all.forEach((m) => (m.reasons || []).forEach((r) => { counts[r] = (counts[r] || 0) + 1; }));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = sorted.length ? sorted[0][1] : 1;
  const statHtml = sorted.length
    ? `<p class="lead">最常錯的是 <b class="hl">${esc(sorted[0][0])}</b>，共 ${sorted[0][1]} 次</p>` +
      sorted.slice(0, 6).map(([r, n], i) => `<div class="bar-row ${i === 0 ? 'top' : ''}"><div class="bar-label"><span>${esc(r)}</span><b>${n}</b></div><div class="bar"><i style="--w:${Math.round(n / max * 100)}%"></i></div></div>`).join('')
    : '<p class="muted">還沒有資料。新增錯題時勾選錯誤原因，這裡會統計你最常犯哪一種錯。</p>';
  const tabName = currentTab ? tabOf(currentTab).name : '全部科目';
  const iv = currentTab ? intervalsFor(currentTab) : settings.intervals;
  const totalToday = due.length + doneToday;
  const donePct = all.length ? Math.round(doneN / all.length * 100) : 0;
  const goal = settings.dailyGoal || 10;
  const reviewedN = doneToday + due.filter((m) => reviewedToday(m, t)).length; // 今日已判過的 due 也算
  // 今日該做：以「今天要複習」為主，目標約 goal 題（可在設定改）
  const todayPlanN = Math.min(due.length, goal);
  const starN = all.filter((m) => m.starred).length;
  const ex = settings.examSchedule || DEFAULT_EXAM_SCHEDULE();
  const cd = countdownText(ex.writtenDate, t);
  const aside = writtenAside(ex);
  const regAlerts = examRegAlerts(ex, t);
  const regAlertHtml = regAlerts.map((a) => `<div class="alert alert-warn exam-reg-alert" role="status"><div><b>報名提醒</b><br><span class="small">${esc(a.text)}（以中油公布為準）</span></div><a class="btn btn-soft btn-sm" href="#settings">看時程</a></div>`).join('');
  const todaySug = await LearnUI.todaySuggestions();
  const weakHtml = await LearnUI.weaknessHtml();
  const sugBtns = todaySug.tips.slice(0, 5).map((x) => `<a class="btn ${x.primary ? 'btn-primary' : 'btn-soft'} btn-sm" href="${x.href}">${esc(x.text)}</a>`).join('');

  app.innerHTML = `
    ${backupHtml}
    <section class="hero card">
      ${ring(doneToday, totalToday, due.length, due.length ? '題待複習' : '今天完成')}
      <div class="hero-text">
        <div class="eyebrow">${esc(tabName)}・${prettyDate(t)}</div>
        <h2>${due.length ? `今天還有 ${due.length} 題` : totalToday ? '今天的複習都完成了' : '今天沒有要複習的題目'}</h2>
        <p class="muted small">${totalToday ? `今天做完 ${doneToday} / ${totalToday}` : '新增的錯題會在明天出現'}</p>
        ${due.length ? `<a class="btn btn-primary" href="#session" id="homeStart">開始複習</a>` : `<a class="btn btn-soft" href="#add">新增錯題</a>`}
      </div>
    </section>
    ${regAlertHtml}
    <section class="card exam-countdown" id="examCountdown">
      <div class="bar-label">
        <div>
          <div class="eyebrow">考試倒數・${esc(ex.title || '甄試')}</div>
          <h3>${ex.writtenDate ? `${prettyDate(ex.writtenDate)}　${cd}` : '尚未設定筆試日期'}</h3>
          ${ex.status !== 'official' && ex.writtenDate ? `<span class="tag tag-est">可能為歷屆考試時間</span>` : ''}
        </div>
        <a class="btn btn-soft btn-sm" href="#settings">編輯時程</a>
      </div>
      <p class="muted small">${esc(aside)}　·　${esc(writtenSourceLabel(ex.status))}　·　${esc(examDisclaimerShort(ex))}</p>
      <p class="exam-disc muted small">${esc(examDisclaimer(ex))}</p>
      <ul class="exam-meta muted small">
        ${ex.prospectusDate ? `<li>簡章公告：${prettyDate(ex.prospectusDate)}</li>` : ''}
        ${(ex.registerStart || ex.registerEnd) ? `<li>報名：${ex.registerStart ? prettyDate(ex.registerStart) : '？'}${ex.registerEnd ? '～' + prettyDate(ex.registerEnd) : ''}</li>` : ''}
        ${ex.secondStart ? `<li>第二試：${prettyDate(ex.secondStart)}${ex.secondEnd ? '～' + prettyDate(ex.secondEnd) : ''}</li>` : ''}
        ${ex.certDeadline ? `<li>證書繳交截止：${prettyDate(ex.certDeadline)}</li>` : ''}
      </ul>
      <div class="exam-links btn-row" style="margin-top:8px;flex-wrap:wrap">
        ${(ex.links || []).filter((l) => l.url).map((l) => `<a class="btn btn-soft btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join('') || `<a class="btn btn-soft btn-sm" href="https://www.cpc.com.tw/News.aspx?n=32" target="_blank" rel="noopener">中油就業資訊</a>`}
      </div>
      ${ex.note ? `<p class="muted small">備註：${esc(ex.note)}</p>` : ''}
    </section>
    <section class="card today-plan" id="todayPlan">
      <div class="eyebrow">今日該做</div>
      <h3>複習 ${due.length} 題${due.length > goal ? `（建議先做 ${goal} 題）` : ''}　·　學習建議</h3>
      <p class="muted small">一次大約 ${goal} 題（設定可改）。今日已複習進度：${Math.min(doneToday, goal)} / ${goal}</p>
      <div class="bar bar-lg" style="margin:8px 0 12px"><i class="ok" style="--w:${Math.min(100, Math.round(doneToday / goal * 100))}%"></i></div>
      <div class="btn-row" style="flex-wrap:wrap">
        ${due.length ? `<a class="btn btn-primary" href="#session">開始今日複習</a>` : `<a class="btn btn-soft" href="#add">沒有待複習・去新增</a>`}
        ${sugBtns}
        ${starN ? `<a class="btn btn-soft" href="#list">★ 收藏 ${starN}</a>` : ''}<a class="btn btn-soft" href="#favs">★ 我的最愛 ${Object.keys(settings.learnFavs || {}).length}</a>
      </div>
    </section>
    <div class="stats">
      <div class="stat"><b id="statDue" class="c-bad">${due.length}</b><span>今天要複習</span></div>
      <div class="stat"><b id="statTotal">${all.length}</b><span>總題數</span></div>
      <button type="button" class="stat stat-link" id="statDoneBtn"><b id="statDone" class="c-ok">${doneN}</b><span>已完成複習</span></button>
    </div>
    ${quizN ? `<button type="button" class="quiz-hint" id="quizHint"><span class="quiz-ico">🎯</span><span><b>有 ${quizN} 題可以抽考</b><br><span class="small">完成複習已超過 ${QUIZ_AFTER_DAYS} 天，有空可以抽幾題看看還記不記得（不會自動排進複習）。</span></span><span class="chev">›</span></button>` : ''}
    <div class="card">
      <div class="bar-label"><h3>完成進度</h3><b>${donePct}%</b></div>
      <div class="bar bar-lg"><i class="ok" style="--w:${donePct}%"></i></div>
      <p class="muted small" style="margin-top:8px">複習間隔：${iv.map((d) => d + ' 天').join(' → ')}${isEbb(iv) ? '（預設：艾賓浩斯記憶曲線）' : '（自訂）'}</p>
    </div>
    ${!currentTab && settings.tabs.length ? `<div class="card"><h3>各分頁</h3>${settings.tabs.map((x) => {
      const items = everything.filter((m) => m.subject === x.id); const d = items.filter((m) => isDue(m, t)).length;
      return `<button type="button" class="overview-tab" data-tab="${esc(x.id)}"><span><b>${esc(x.name)}</b><br><span class="muted small">${items.length} 題・${esc(categoryOf(x.category).name)}</span></span><span class="${d ? 'pill-bad' : 'pill-ok'}">${d ? `${d} 題要複習` : '今天已清空'}</span></button>`;
    }).join('')}</div>` : ''}
    <div class="card" id="weakBoard"><div class="bar-label"><h3>弱點看板</h3></div>
      <p class="muted small">依科目分頁＋錯因；學習區練習正確率一併顯示。</p>
      ${weakHtml}</div>
    <p class="muted small center">上次備份：${age === null ? '從沒備份過' : age === 0 ? '今天' : `${age} 天前`}</p>`;
  const hb = $('#homeBackup'); if (hb) hb.onclick = async () => {
    if (DriveBackup.online() && DriveBackup.hasClientId(settings) && settings.driveBackup.connected) await uploadBackupToDrive();
    else await exportBackup();
  };
  $('#statDoneBtn').onclick = () => { Object.assign(filters, { status: 'done', quiz: false, onlyDue: false }); location.hash = '#list'; };
  const qh = $('#quizHint'); if (qh) qh.onclick = () => { Object.assign(filters, { status: 'done', quiz: true, onlyDue: false }); location.hash = '#list'; };
  $$('.overview-tab', app).forEach((b) => { b.onclick = async () => { await setCurrentTab(b.dataset.tab); render(); }; });
}

/* ---------- 今天要複習 ---------- */
const dueSorted = async (t) => (await DB.all()).filter((m) => isDue(m, t) && inTab(m)).sort((a, b) => a.nextDue.localeCompare(b.nextDue) || a.createdAt - b.createdAt);
async function viewReview(app) {
  const t = today();
  const due = await dueSorted(t);
  if (!due.length) {
    app.innerHTML = `<div class="empty"><div class="empty-ico">✓</div><h2>今天沒有要複習的題目</h2><p class="muted">${currentTab ? `「${esc(tabOf(currentTab).name)}」` : ''}都完成了，明天再來！</p></div><a class="btn btn-soft" href="#add">新增錯題</a>`;
    return;
  }
  app.innerHTML = `<a class="btn btn-primary btn-big" href="#session" id="startReview">開始複習（${due.length} 題）</a>
    <p class="muted small" style="margin:10px 4px 14px">複習時先只看題目，自己在紙上重做一次，再按「看答案」。</p>
    <div id="dueList">${due.map((m) => itemHtml(m, t)).join('')}</div>`;
}
function itemHtml(m, t = today()) {
  const dueTxt = m.status === 'done' ? `<span class="tag tag-done">${prettyDate(m.doneAt || t)} 完成</span>${isQuizzable(m, t) ? '<span class="tag tag-quiz">可以抽考</span>' : ''}`
    : m.nextDue < t ? `<span class="tag tag-over">逾期 ${diffDays(m.nextDue, t)} 天</span>`
    : m.nextDue === t ? '<span class="tag tag-over">今天</span>' : `<span class="tag">下次 ${prettyDate(m.nextDue)}</span>`;
  return `<a class="item" href="#detail/${esc(m.id)}" data-id="${esc(m.id)}">
    <img class="thumb" src="${blobUrl(m.questionImg)}" alt="題目照片">
    <div class="item-body">
      <div class="item-title">${m.starred ? '<span class="star-mark" title="已收藏">★</span> ' : ''}${esc(m.chapter || m.qText || '未填章節')}</div>
      <div class="item-sub">${esc((m.reasons || []).join('、') || '沒勾錯誤原因')}</div>
      <div class="item-tags">${currentTab ? '' : tabTag(m.subject)}${dueTxt}${m.status === 'done' ? '' : `<span class="tag">${stageLabel(m)}</span>`}<span class="tag tag-count">複習 ${reviewCount(m)} 次</span>${m.relearnCount ? `<span class="tag">重新複習 ${m.relearnCount} 次</span>` : ''}</div>
    </div><span class="chev">›</span></a>`;
}

/* ---------- 複習流程 ---------- */
let session = null;
async function viewSession(app) {
  if (session && session.tab !== currentTab) session = null;
  if (!session) {
    const due = await dueSorted(today());
    if (!due.length) { location.replace('#review'); return; }
    session = { tab: currentTab, ids: due.map((m) => m.id), index: 0, correct: 0, wrong: 0 };
  }
  if (session.index >= session.ids.length) {
    const s = session; session = null;
    app.innerHTML = `<div class="card center done-card"><div class="done-ico">🎉</div><h2>今天的複習完成了！</h2>
      ${ring(s.correct, s.correct + s.wrong, s.correct, '題答對')}
      <p>答對 <b class="c-ok">${s.correct}</b> 題，答錯 <b class="c-bad">${s.wrong}</b> 題</p>
      <p class="muted small">答錯的題目會回到第 1 關，${intervalsFor(currentTab || settings.tabs[0]?.id)[0]} 天後再出現。</p></div>
      <a class="btn btn-primary btn-big" href="#home" id="sessionDone">回首頁</a>`;
    return;
  }
  const m = await DB.get(session.ids[session.index]);
  if (!m || m.status !== 'active') { session.index++; return viewSession(app); }
  const total = session.ids.length, n = session.index + 1;
  app.innerHTML = `
    <div class="progress"><span>第 ${n} / ${total} 題</span>${tabTag(m.subject)}</div>
    <div class="progress-bar"><i style="--w:${Math.round((n - 1) / total * 100)}%"></i></div>
    <div class="review-layout">
    <div class="card review-q">
      <div class="small muted">${esc(m.chapter || '未填章節')}${m.source ? '・' + esc(m.source) : ''}・${stageLabel(m)}・已複習 ${reviewCount(m)} 次</div>
      ${m.qText ? `<p class="q-text" id="qText">${esc(m.qText)}</p>${isLangTab(m.subject) ? speakBtns() : ''}` : ''}
      <img class="review-img zoomable" id="qImg" src="${blobUrl(m.questionImg)}" alt="題目照片">
      <p class="muted small center" style="margin:6px 0 0">點照片可以放大</p>
    </div>
    <div id="answerArea" class="reveal review-a" hidden>
      <div class="card">
        <h3>答案／解法</h3>
        ${m.answerImg ? `<img class="review-img zoomable" id="aImg" src="${blobUrl(m.answerImg)}" alt="答案照片">` : '<p class="muted">這題沒有放答案照片。</p>'}
        <div class="note-box"><span class="note-label">小筆記</span>${esc(m.note || '（沒有寫）')}</div>
        <div class="small muted">當時的錯誤原因：${esc((m.reasons || []).join('、') || '沒勾')}</div>
      </div>
    </div>
    </div>
    <div class="sticky-actions">
      <button class="btn btn-primary btn-big" id="showAnswer">看答案</button>
      <div class="btn-row" id="judge" hidden>
        <button class="btn btn-bad btn-big" id="btnWrong">✗ 答錯</button>
        <button class="btn btn-ok btn-big" id="btnRight">✓ 答對</button>
      </div>
      <button type="button" class="btn btn-link" id="sessMarkDone">這題已經很熟了：標記為完成</button>
    </div>`;
  $('#showAnswer').onclick = () => { $('#answerArea').hidden = false; $('#showAnswer').hidden = true; $('#judge').hidden = false; $('#answerArea').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const answer = async (correct) => {
    $('#btnWrong').disabled = $('#btnRight').disabled = true;
    applyResult(m, correct); await DB.put(m);
    if (correct) session.correct++; else session.wrong++;
    session.index++;
    toast(correct ? (m.status === 'done' ? '太好了！最後一關也答對，移到「已完成複習」' : `答對！${intervalsFor(m.subject)[m.stage]} 天後再複習`) : `沒關係，${intervalsFor(m.subject)[0]} 天後再練一次`);
    render();
  };
  wireSpeak(app, () => m.qText);
  $('#btnRight').onclick = () => answer(true);
  $('#btnWrong').onclick = () => answer(false);
  $('#sessMarkDone').onclick = async () => {
    markDone(m, 'manual'); await DB.put(m); session.index++;
    toast('已標記為完成，不會再出現在今天要複習'); render();
  };
}

/* ---------- 新增／編輯 ---------- */
async function viewForm(app, id) {
  let m = null;
  if (id) { m = await DB.get(id); if (!m) { app.innerHTML = '<p>找不到這題。</p>'; return; } }
  if (!settings.tabs.length) { app.innerHTML = '<div class="empty"><h2>還沒有分頁</h2><p class="muted">請先到設定新增一個分頁（科目）。</p></div><a class="btn btn-primary" href="#settings">去設定</a>'; return; }
  const lastSubject = await DB.meta('lastSubject', '');
  const pick = [currentTab, lastSubject].find((x) => x && settings.tabs.some((t) => t.id === x)) || settings.tabs[0].id;
  const f = { subject: m ? m.subject : pick, q: m ? m.questionImg : null, a: m ? m.answerImg : null, reasons: new Set(m ? m.reasons : []) };
  const tabsForSeg = [...settings.tabs]; if (m && !settings.tabs.some((t) => t.id === m.subject)) tabsForSeg.push(tabOf(m.subject));
  app.innerHTML = `
    <form id="mForm" autocomplete="off" novalidate class="form-grid">
      <div class="card">
        <span class="field-title">題目照片 <small>必填</small></span>
        <div class="photo-box">
          <img id="qPreview" alt="題目照片預覽" hidden>
          <div class="btn-row">
            <label class="btn btn-primary">📷 拍照<input class="file-hidden" type="file" accept="image/*" capture="environment" id="qCam"></label>
            <label class="btn btn-soft">🖼️ 相簿<input class="file-hidden" type="file" accept="image/*" id="qPick"></label>
          </div>
        </div>
      </div>
      <div class="card">
        <span class="field-title">答案／解法照片 <small>選填</small></span>
        <div class="photo-box">
          <img id="aPreview" alt="答案照片預覽" hidden>
          <div class="btn-row">
            <label class="btn btn-soft">📷 拍照<input class="file-hidden" type="file" accept="image/*" capture="environment" id="aCam"></label>
            <label class="btn btn-soft">🖼️ 相簿<input class="file-hidden" type="file" accept="image/*" id="aPick"></label>
          </div>
          <button type="button" class="btn btn-text-bad" id="aRemove" hidden>移除答案照片</button>
        </div>
      </div>
      <div class="card">
        <span class="field-title">分頁（科目）</span>
        <div class="seg" id="subjectSeg">${tabsForSeg.map((s) => `<button type="button" data-id="${esc(s.id)}">${esc(s.name)}</button>`).join('')}</div>
        <label class="field" style="margin-top:18px"><span class="field-title">章節</span>
          <input type="text" id="chapter" placeholder="例如：克希荷夫定律" value="${esc(m?.chapter || '')}" enterkeyhint="next"></label>
        <div class="chips" id="chapterChips"></div>
        <label class="field" style="margin-top:18px"><span class="field-title">題目來源</span>
          <input type="text" id="source" placeholder="例如：113 中油、均一" value="${esc(m?.source || '')}" enterkeyhint="next"></label>
        <div class="chips" id="sourceChips"></div>
      </div>
      <div class="card">
        <label class="field" style="margin:0"><span class="field-title">題目文字／句子 <small>選填，英文分頁可以按發音</small></span>
          <textarea id="qText" rows="2" placeholder="例如：The meeting has been put off until next week.">${esc(m?.qText || '')}</textarea></label>
        <div id="qTextSpeak"></div>
      </div>
      <div class="card">
        <span class="field-title">為什麼錯？ <small>可複選，建議勾 1～2 個</small></span>
        <div class="reasons" id="reasonList"></div>
        <div class="hint" id="reasonHint"></div>
      </div>
      <div class="card">
        <label class="field" style="margin:0"><span class="field-title">小筆記 <small>選填，進備份</small></span>
          <input type="text" id="note" placeholder="例如：先把 kΩ 換成 Ω 再算（會進備份）" value="${esc(m?.note || '')}"></label>
      </div>
      <button type="submit" class="btn btn-primary btn-big" id="saveBtn">${m ? '儲存修改' : '存起來'}</button>
      ${m ? `<a class="btn btn-soft" style="margin-top:10px" href="#detail/${esc(m.id)}">取消</a>` : ''}
    </form>`;

  const showPreview = (which) => {
    const blob = which === 'q' ? f.q : f.a; const img = $(which === 'q' ? '#qPreview' : '#aPreview');
    if (blob) { img.src = blobUrl(blob); img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); }
    if (which === 'a') $('#aRemove').hidden = !blob;
  };
  const onFile = (which) => async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    try { toast('照片處理中…'); const blob = await compressImage(file); f[which] = blob; showPreview(which); toast(`照片已加入（${Math.round(blob.size / 1024)} KB）`); }
    catch (err) { console.warn(err); toast('這張照片讀不到，請換一張或改用拍照'); }
  };
  $('#qCam').onchange = onFile('q'); $('#qPick').onchange = onFile('q');
  $('#aCam').onchange = onFile('a'); $('#aPick').onchange = onFile('a');
  $('#aRemove').onclick = () => { f.a = null; showPreview('a'); };
  showPreview('q'); showPreview('a');

  const renderChapterChips = () => {
    const list = settings.chapters[f.subject] || [];
    $('#chapterChips').innerHTML = list.length ? list.slice(0, 12).map((c) => `<button type="button" class="chip" data-v="${esc(c)}">${esc(c)}</button>`).join('') : '<span class="hint">用過的章節會出現在這裡，下次點一下就能選。</span>';
  };
  const renderSourceChips = () => { $('#sourceChips').innerHTML = settings.sources.slice(0, 10).map((c) => `<button type="button" class="chip" data-v="${esc(c)}">${esc(c)}</button>`).join(''); };
  const renderReasons = () => {
    const cat = categoryOf(tabOf(f.subject).category);
    const options = [...cat.reasons]; f.reasons.forEach((r) => { if (!options.includes(r)) options.push(r); });
    $('#reasonList').innerHTML = options.length ? options.map((r) => `<button type="button" class="reason ${f.reasons.has(r) ? 'on' : ''}" data-v="${esc(r)}"><span class="box">${f.reasons.has(r) ? '✓' : ''}</span><span>${esc(r)}</span></button>`).join('')
      : '<p class="muted small">這個分類還沒有錯誤原因，可以到設定新增。</p>';
    const n = f.reasons.size, hint = $('#reasonHint');
    hint.className = 'hint' + (n > 2 ? ' warn' : '');
    hint.textContent = `分類：${cat.name}。` + (n === 0 ? '至少勾一個，統計才知道你常錯在哪。' : n > 2 ? `已勾 ${n} 個，建議只勾最主要的 1～2 個。` : `已勾 ${n} 個。`);
  };
  const renderSpeak = () => { const box = $('#qTextSpeak'); box.innerHTML = isLangTab(f.subject) ? speakBtns('f') : ''; wireSpeak(box, () => $('#qText').value); };
  const renderSubject = () => { $$('#subjectSeg button').forEach((b) => b.classList.toggle('on', b.dataset.id === f.subject)); renderChapterChips(); renderReasons(); renderSpeak(); };
  $('#subjectSeg').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const oldCat = tabOf(f.subject).category; f.subject = b.dataset.id;
    if (tabOf(f.subject).category !== oldCat) f.reasons.clear();
    renderSubject();
  };
  $('#chapterChips').onclick = (e) => { const b = e.target.closest('.chip'); if (b) $('#chapter').value = b.dataset.v; };
  $('#sourceChips').onclick = (e) => { const b = e.target.closest('.chip'); if (b) $('#source').value = b.dataset.v; };
  $('#reasonList').onclick = (e) => { const b = e.target.closest('.reason'); if (!b) return; const v = b.dataset.v; f.reasons.has(v) ? f.reasons.delete(v) : f.reasons.add(v); renderReasons(); };
  renderSubject(); renderSourceChips();

  $('#mForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!f.q) { toast('請先拍或選一張題目照片'); $('#qCam').closest('.card').scrollIntoView({ behavior: 'smooth' }); return; }
    const chapter = $('#chapter').value.trim(), source = $('#source').value.trim(), note = $('#note').value.trim(), qText = $('#qText').value.trim();
    const now = Date.now(), t = today();
    let rec;
    if (m) {
      const moved = m.subject !== f.subject;
      rec = Object.assign(m, { subject: f.subject, chapter, source, note, qText, reasons: [...f.reasons], questionImg: f.q, answerImg: f.a, updatedAt: now });
      if (moved && rec.status === 'active') rec.stage = Math.min(rec.stage, intervalsFor(f.subject).length - 1);
    } else {
      rec = { id: uid(), subject: f.subject, chapter, source, note, qText, reasons: [...f.reasons], questionImg: f.q, answerImg: f.a, starred: false,
        createdAt: now, createdDate: t, updatedAt: now, stage: 0, status: 'active', nextDue: addDays(t, intervalsFor(f.subject)[0]), history: [], relearnCount: 0, relearnDates: [] };
    }
    $('#saveBtn').disabled = true;
    try {
      await DB.put(rec);
      remember('chapters', chapter, f.subject); remember('sources', source);
      await saveSettings('chapters', 'sources'); await DB.setMeta('lastSubject', f.subject);
      toast(m ? '已儲存修改' : '已存起來！');
      location.hash = m ? `#detail/${rec.id}` : '#add-done/' + rec.id;
    } catch (err) {
      console.error(err); $('#saveBtn').disabled = false;
      toast('儲存失敗：' + (err.name === 'QuotaExceededError' ? '手機空間不夠' : err.message));
    }
  };
}
async function viewAddDone(app) {
  const m = await DB.get(parseHash().id);
  app.innerHTML = `<div class="card center done-card"><div class="done-ico">✓</div><h2>存好了！</h2>
    <p class="muted">${m ? `這題會在 ${prettyDate(m.nextDue)}（${diffDays(today(), m.nextDue)} 天後）出現在「今天要複習」。` : ''}</p></div>
    <div class="stack"><a class="btn btn-primary btn-big" href="#add" id="addAnother">＋ 再新增一題</a><a class="btn btn-soft" href="#home">回首頁</a></div>`;
}

/* ---------- 錯題列表 ---------- */
const filters = { reason: '', status: '', onlyDue: false, quiz: false, starred: false };
async function viewList(app) {
  let all = (await DB.all()).filter(inTab).sort((a, b) => b.createdAt - a.createdAt);
  const reasonSet = new Set();
  (currentTab ? [categoryOf(tabOf(currentTab).category)] : settings.categories).forEach((c) => c.reasons.forEach((r) => reasonSet.add(r)));
  all.forEach((m) => (m.reasons || []).forEach((r) => reasonSet.add(r)));
  if (filters.reason && !reasonSet.has(filters.reason)) filters.reason = '';
  if (!['', 'active', 'done'].includes(filters.status)) filters.status = '';
  let selectMode = false;
  const selected = new Set();
  app.innerHTML = `
    <div class="mode-seg" id="modeSeg" role="tablist" aria-label="複習中或已完成">
      <button type="button" data-mode="active" id="modeActive"></button>
      <button type="button" data-mode="done" id="modeDone"></button>
      <button type="button" data-mode="" id="modeAll"></button>
    </div>
    <div id="doneHead"></div>
    <div class="filters">
      <select id="fReason" aria-label="錯誤原因"><option value="">全部錯誤原因</option>${[...reasonSet].map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select>
      <label class="chk" id="onlyDueWrap"><input type="checkbox" id="onlyDue"> 只看今天要複習</label>
      <label class="chk" id="onlyQuizWrap"><input type="checkbox" id="onlyQuiz"> 只看可以抽考</label>
      <label class="chk"><input type="checkbox" id="onlyStar"> 只看收藏 ★</label>
    </div>
    <div class="list-toolbar btn-row" style="flex-wrap:wrap;margin:8px 0">
      <button type="button" class="btn btn-soft btn-sm" id="btnToggleSelect">選取剔除</button>
      <button type="button" class="btn btn-text-bad btn-sm" id="btnBulkRemove" hidden>剔除所選（0）</button>
      <button type="button" class="btn btn-soft btn-sm" id="btnSelectAll" hidden>全選目前列表</button>
    </div>
    <p class="muted small" id="listCount"></p>
    <div id="listBox"></div>`;
  $('#fReason').value = filters.reason;
  const draw = () => {
    releaseUrls(); const t = today();
    const nAct = all.filter((m) => m.status === 'active').length, nDone = all.length - nAct;
    const quizList = all.filter((m) => isQuizzable(m, t));
    $('#modeActive').innerHTML = `複習中<span>${nAct}</span>`; $('#modeDone').innerHTML = `已完成<span>${nDone}</span>`; $('#modeAll').innerHTML = `全部<span>${all.length}</span>`;
    $$('#modeSeg button').forEach((b) => { const on = b.dataset.mode === filters.status; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    const showDue = filters.status !== 'done', showQuiz = filters.status === 'done';
    if (!showDue) filters.onlyDue = false; if (!showQuiz) filters.quiz = false;
    $('#onlyDueWrap').hidden = !showDue; $('#onlyQuizWrap').hidden = !showQuiz;
    $('#onlyDue').checked = filters.onlyDue; $('#onlyQuiz').checked = filters.quiz;
    $('#doneHead').innerHTML = filters.status === 'done' ? `<div class="card done-head">
        <div class="done-head-top"><div><div class="eyebrow">${esc(currentTab ? tabOf(currentTab).name : '全部科目')}</div><h3>已完成複習 ${nDone} 題</h3>
        <p class="muted small">這些題目不會出現在「今天要複習」。可以打開來自由練習，不會影響排程；忘了就按「重新複習」。</p></div></div>
        ${quizList.length ? `<p class="quiz-line">🎯 其中 <b>${quizList.length}</b> 題完成超過 ${QUIZ_AFTER_DAYS} 天，可以抽考</p>` : ''}
        ${nDone ? '<button type="button" class="btn btn-primary" id="randomPractice">🎲 隨機抽一題練習</button>' : ''}</div>` : '';
    const rp = $('#randomPractice');
    if (rp) rp.onclick = () => { const pool = quizList.length ? quizList : all.filter((m) => m.status === 'done'); location.hash = '#practice/' + pool[Math.floor(Math.random() * pool.length)].id; };
    const list = all.filter((m) => (!filters.reason || (m.reasons || []).includes(filters.reason)) &&
      (!filters.status || m.status === filters.status) && (!filters.onlyDue || isDue(m, t)) && (!filters.quiz || isQuizzable(m, t)) && (!filters.starred || m.starred))
      .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || b.createdAt - a.createdAt);
    const total = filters.status ? (filters.status === 'done' ? nDone : nAct) : all.length;
    $('#listCount').textContent = `共 ${list.length} 題${list.length !== total ? `（這一類全部 ${total} 題）` : ''}${selectMode ? '・選取模式：勾選後可批次剔除' : ''}`;
    $('#btnToggleSelect').textContent = selectMode ? '取消選取' : '選取剔除';
    $('#btnBulkRemove').hidden = !selectMode;
    $('#btnSelectAll').hidden = !selectMode;
    $('#btnBulkRemove').textContent = `剔除所選（${selected.size}）`;
    $('#listBox').innerHTML = list.length ? list.map((m) => {
      if (!selectMode) {
        return `<div class="item-row">
          ${itemHtml(m, t)}
          <button type="button" class="btn btn-text-bad btn-sm btn-remove-one" data-id="${esc(m.id)}" title="剔除">剔除</button>
        </div>`;
      }
      const on = selected.has(m.id);
      return `<label class="item item-select ${on ? 'is-selected' : ''}">
        <input type="checkbox" class="sel-box" data-id="${esc(m.id)}" ${on ? 'checked' : ''}>
        <img class="thumb" src="${blobUrl(m.questionImg)}" alt="">
        <div class="item-body">
          <div class="item-title">${m.starred ? '★ ' : ''}${esc(m.chapter || m.qText || '未填章節')}</div>
          <div class="item-sub">${esc((m.reasons || []).join('、') || '沒勾錯誤原因')}</div>
        </div>
      </label>`;
    }).join('')
      : `<div class="empty"><div class="empty-ico">∅</div><p class="muted">${!all.length ? '還沒有錯題，按下面的「＋」新增第一題吧！' : filters.status === 'done' && !nDone ? '還沒有完成複習的題目。最後一關答對，或在題目裡按「標記為完成」，就會出現在這裡。' : '沒有符合條件的題目'}</p></div>`;
    $$('.btn-remove-one', app).forEach((b) => {
      b.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const ok = await confirmRemoveMistakes([b.dataset.id]);
        if (ok) {
          all = all.filter((m) => m.id !== b.dataset.id);
          selected.delete(b.dataset.id);
          draw();
        }
      };
    });
    $$('.sel-box', app).forEach((c) => {
      c.onchange = () => {
        if (c.checked) selected.add(c.dataset.id); else selected.delete(c.dataset.id);
        $('#btnBulkRemove').textContent = `剔除所選（${selected.size}）`;
        c.closest('.item-select')?.classList.toggle('is-selected', c.checked);
      };
    });
  };
  $('#btnToggleSelect').onclick = () => { selectMode = !selectMode; selected.clear(); draw(); };
  $('#btnSelectAll').onclick = () => {
    $$('.sel-box', app).forEach((c) => { c.checked = true; selected.add(c.dataset.id); });
    $('#btnBulkRemove').textContent = `剔除所選（${selected.size}）`;
  };
  $('#btnBulkRemove').onclick = async () => {
    const ids = [...selected];
    if (!ids.length) { toast('請先勾選要剔除的題'); return; }
    const ok = await confirmRemoveMistakes(ids);
    if (ok) {
      all = all.filter((m) => !selected.has(m.id));
      selected.clear();
      selectMode = false;
      draw();
    }
  };
  $$('#modeSeg button').forEach((b) => { b.onclick = () => { filters.status = b.dataset.mode; draw(); }; });
  $('#fReason').onchange = (e) => { filters.reason = e.target.value; draw(); };
  $('#onlyDue').onchange = (e) => { filters.onlyDue = e.target.checked; draw(); };
  $('#onlyQuiz').onchange = (e) => { filters.quiz = e.target.checked; draw(); };
  $('#onlyStar').checked = filters.starred;
  $('#onlyStar').onchange = (e) => { filters.starred = e.target.checked; draw(); };
  draw();
}

/* ---------- 單題內容 ---------- */
async function viewDetail(app, id) {
  const m = await DB.get(id);
  if (!m) { app.innerHTML = '<div class="empty"><p>找不到這題，可能已經刪除了。</p></div><a class="btn btn-primary" href="#list">回列表</a>'; return; }
  const t = today(); const iv = intervalsFor(m.subject);
  const hLabel = { correct: '✓ 答對', wrong: '✗ 答錯', revive: '↩︎ 重新複習', relearn: '↩︎ 重新複習（第 1 關，1 天後）', manual: '📅 手動改日期', done: '🏁 標記為完成', 'auto-done': '🏁 最後一關答對，完成複習' };
  app.innerHTML = `
    <div class="card">
      <div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">${tabTag(m.subject)}<span class="tag ${m.status === 'done' ? 'tag-done' : ''}">${stageLabel(m)}</span>${isQuizzable(m, t) ? '<span class="tag tag-quiz">可以抽考</span>' : ''}${m.starred ? '<span class="tag tag-star">★ 收藏</span>' : ''}
        <button type="button" class="btn btn-soft btn-sm" id="btnStar" style="margin-left:auto">${m.starred ? '★ 取消收藏' : '☆ 收藏'}</button></div>
      ${m.qText ? `<p class="q-text">${esc(m.qText)}</p>${isLangTab(m.subject) ? speakBtns('d') : ''}` : ''}
      <img class="review-img zoomable" src="${blobUrl(m.questionImg)}" alt="題目照片">
    </div>
    ${m.answerImg ? `<div class="card"><h3>答案／解法</h3><img class="review-img zoomable" src="${blobUrl(m.answerImg)}" alt="答案照片"></div>` : ''}
    <div class="card">
      <dl class="kv">
        <dt>章節</dt><dd>${esc(m.chapter || '—')}</dd>
        <dt>來源</dt><dd>${esc(m.source || '—')}</dd>
        <dt>錯誤原因</dt><dd>${esc((m.reasons || []).join('、') || '—')}</dd>
        <dt>小筆記</dt><dd>${esc(m.note || '—')}</dd>
        <dt>新增日期</dt><dd>${esc(m.createdDate || '')}</dd>
        <dt>複習間隔</dt><dd>${iv.join('、')} 天</dd>
        <dt>複習次數</dt><dd id="reviewCount">${reviewCount(m)} 次</dd>
        ${m.status === 'done' ? `<dt>完成日期</dt><dd id="doneAt">${esc(m.doneAt || '—')}${m.doneAt ? `（${doneDays(m, t)} 天前，${m.doneBy === 'manual' ? '手動標記' : '最後一關答對'}）` : ''}</dd>` : ''}
        ${m.relearnCount ? `<dt>重新複習</dt><dd id="relearnInfo">${m.relearnCount} 次（${(m.relearnDates || []).map(esc).join('、')}）</dd>` : ''}
      </dl>
    </div>
    ${m.status === 'active' ? `<div class="card">
      <h3>下次複習日期</h3>
      <p class="muted small">${m.nextDue < t ? `已逾期 ${diffDays(m.nextDue, t)} 天` : m.nextDue === t ? '就是今天' : `${diffDays(t, m.nextDue)} 天後`}。想提早或延後，可以自己改。</p>
      <div class="inline"><input type="date" id="dueDate" value="${esc(m.nextDue)}" min="${t}"><button type="button" class="btn btn-primary" id="btnDue">改日期</button></div>
    </div>` : ''}
    ${(m.history || []).length ? `<div class="card"><h3>複習紀錄</h3><ul class="history">${m.history.slice().reverse().map((h) => `<li><span>${esc(h.date)}</span>${hLabel[h.result] || ''}</li>`).join('')}</ul></div>` : ''}
    <div class="stack">
      ${m.status === 'done' ? `<a class="btn btn-primary" href="#practice/${esc(m.id)}" id="btnPractice">✎ 自由練習（不影響排程）</a>
        <button class="btn btn-soft" id="btnRelearn">↩︎ 重新複習（回到第 1 關，1 天後）</button>`
        : '<button class="btn btn-ok-soft" id="btnMarkDone">🏁 標記為完成</button>'}
      <a class="btn btn-soft" href="#edit/${esc(m.id)}" id="btnEdit">編輯</a>
      <button class="btn btn-text-bad" id="btnDelete">剔除／刪除</button>
      <p class="muted small" style="margin-top:6px">「剔除」＝誤加或不該留在錯題本，整題拿掉；「標記為完成」＝複習完了仍保留可抽考。</p>
    </div>`;
  wireSpeak(app, () => m.qText);
  const rv = $('#btnRelearn');
  if (rv) rv.onclick = async () => { relearn(m); await DB.put(m); toast(`已回到複習中，${prettyDate(m.nextDue)}（1 天後）再複習`); render(); };
  const md = $('#btnMarkDone');
  if (md) md.onclick = async () => { markDone(m, 'manual'); await DB.put(m); toast('已移到「已完成複習」'); render(); };
  const bd = $('#btnDue');
  if (bd) bd.onclick = async () => {
    const v = $('#dueDate').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('請選一個日期'); return; }
    if (v < today()) { toast('不能選今天以前的日期'); return; }
    m.nextDue = v; m.updatedAt = Date.now(); m.history = m.history || []; m.history.push({ date: today(), result: 'manual', stage: m.stage, to: v });
    await DB.put(m); toast(`下次複習改成 ${prettyDate(v)}`); render();
  };
  const bs = $('#btnStar');
  if (bs) bs.onclick = async () => {
    m.starred = !m.starred; m.updatedAt = Date.now();
    await DB.put(m); toast(m.starred ? '已收藏' : '已取消收藏'); render();
  };
  $('#btnDelete').onclick = async () => { await confirmRemoveMistakes([m.id]); };
}

/* ---------- 自由練習（已完成的題目，不影響排程） ---------- */
async function viewPractice(app, id) {
  const m = await DB.get(id);
  if (!m) { app.innerHTML = '<div class="empty"><p>找不到這題。</p></div><a class="btn btn-primary" href="#list">回列表</a>'; return; }
  if (m.status !== 'done') { location.replace('#detail/' + m.id); return; }
  const t = today();
  app.innerHTML = `
    <div class="practice-banner"><b>自由練習</b>・不會改變複習排程</div>
    <div class="card">
      <div style="margin-bottom:8px">${tabTag(m.subject)}<span class="tag tag-done">${prettyDate(m.doneAt || t)} 完成</span><span class="tag tag-count">複習 ${reviewCount(m)} 次</span>${isQuizzable(m, t) ? '<span class="tag tag-quiz">可以抽考</span>' : ''}</div>
      <div class="small muted">${esc(m.chapter || '未填章節')}${m.source ? '・' + esc(m.source) : ''}</div>
      ${m.qText ? `<p class="q-text" id="qText">${esc(m.qText)}</p>${isLangTab(m.subject) ? speakBtns('p') : ''}` : ''}
      <img class="review-img zoomable" src="${blobUrl(m.questionImg)}" alt="題目照片">
    </div>
    <div id="pAnswer" class="reveal" hidden><div class="card"><h3>答案／解法</h3>
      ${m.answerImg ? `<img class="review-img zoomable" src="${blobUrl(m.answerImg)}" alt="答案照片">` : '<p class="muted">這題沒有放答案照片。</p>'}
      <div class="note-box"><span class="note-label">小筆記</span>${esc(m.note || '（沒有寫）')}</div></div></div>
    <div class="sticky-actions">
      <button class="btn btn-primary btn-big" id="pShow">看答案</button>
      <div id="pAfter" hidden>
        <div class="btn-row">
          <button class="btn btn-soft btn-big" id="pRelearn">↩︎ 重新複習</button>
          <button class="btn btn-ok btn-big" id="pKeep">✓ 還記得</button>
        </div>
        <p class="muted small center" style="margin:8px 0 0">「重新複習」會回到第 1 關，1 天後出現在今天要複習。</p>
      </div>
    </div>`;
  wireSpeak(app, () => m.qText);
  $('#pShow').onclick = () => { $('#pAnswer').hidden = false; $('#pShow').hidden = true; $('#pAfter').hidden = false; $('#pAnswer').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $('#pRelearn').onclick = async () => { relearn(m); await DB.put(m); toast(`這題回到複習中，${prettyDate(m.nextDue)}（1 天後）再複習`); location.hash = '#detail/' + m.id; };
  $('#pKeep').onclick = () => { toast('很好！這題維持「已完成」'); Object.assign(filters, { status: 'done' }); location.hash = '#list'; };
}

/* ---------- 分頁編輯視窗 ---------- */
async function examDialog() {
  const cur = normalizeExamSchedule(settings.examSchedule);
  const jobs = cur.links.find((l) => l.id === 'cpc-jobs') || { name: '中油就業資訊', url: 'https://www.cpc.com.tw/News.aspx?n=32' };
  const site = cur.links.find((l) => l.id === 'exam-site') || { name: '當年甄試網站', url: '' };
  const histRows = (cur.history || []).map((h) => `
    <div class="hist-row">
      <input type="text" class="h-year" value="${esc(h.yearLabel)}" placeholder="年（如 114）" style="width:4.5rem">
      <input type="date" class="h-written" value="${esc(h.writtenDate)}" title="筆試日">
      <input type="text" class="h-note" value="${esc(h.note)}" placeholder="備註" style="flex:1;min-width:5rem">
      <button type="button" class="btn btn-text-bad btn-sm h-del">刪</button>
    </div>`).join('') || '<p class="muted small hist-empty">尚無歷屆列</p>';
  const r = await modal({
    title: '編輯考試時程（整條）',
    okText: '儲存',
    html: `
      <p class="muted small exam-disc" id="exDiscPreview">${esc(examDisclaimer(cur))}</p>
      <label class="field"><span class="field-title">名稱</span>
        <input type="text" id="exTitle" value="${esc(cur.title)}" placeholder="例如：中油僱員甄試"></label>
      <label class="field"><span class="field-title">時程狀態</span>
        <select id="exStatus">
          <option value="estimate" ${cur.status === 'estimate' ? 'selected' : ''}>歷屆推估（顯示「可能為歷屆考試時間」）</option>
          <option value="official" ${cur.status === 'official' ? 'selected' : ''}>官方簡章（去掉「可能」）</option>
          <option value="manual" ${cur.status === 'manual' ? 'selected' : ''}>手動設定</option>
        </select></label>
      <div class="btn-row" style="margin:0 0 10px">
        <button type="button" class="btn btn-soft btn-sm" id="exApplyEst">套用歷屆推估（筆試 2027-12-11）</button>
      </div>
      <label class="field"><span class="field-title">簡章公告日</span>
        <input type="date" id="exProspectus" value="${esc(cur.prospectusDate)}"></label>
      <div class="form-grid-2">
        <label class="field"><span class="field-title">報名起</span>
          <input type="date" id="exRegS" value="${esc(cur.registerStart)}"></label>
        <label class="field"><span class="field-title">報名迄</span>
          <input type="date" id="exRegE" value="${esc(cur.registerEnd)}"></label>
      </div>
      <label class="field"><span class="field-title">第一試筆試日</span>
        <input type="date" id="exWritten" value="${esc(cur.writtenDate)}"></label>
      <div class="form-grid-2">
        <label class="field"><span class="field-title">第二試起 <small>選填</small></span>
          <input type="date" id="exSecS" value="${esc(cur.secondStart)}"></label>
        <label class="field"><span class="field-title">第二試迄 <small>選填</small></span>
          <input type="date" id="exSecE" value="${esc(cur.secondEnd)}"></label>
      </div>
      <label class="field"><span class="field-title">證書繳交截止 <small>選填</small></span>
        <input type="date" id="exCert" value="${esc(cur.certDeadline)}"></label>
      <label class="field"><span class="field-title">備註</span>
        <input type="text" id="exNote" value="${esc(cur.note)}" placeholder="讀書規劃備註"></label>
      <h3 class="small" style="margin:12px 0 6px">官方連結（可點、可編輯）</h3>
      <p class="muted small"><a href="https://www.cpc.com.tw/News.aspx?n=32" target="_blank" rel="noopener">開啟中油就業資訊</a></p>
      <label class="field"><span class="field-title">中油就業資訊 URL</span>
        <input type="url" id="exLinkJobs" value="${esc(jobs.url || 'https://www.cpc.com.tw/News.aspx?n=32')}" placeholder="https://www.cpc.com.tw/News.aspx?n=32"></label>
      <label class="field"><span class="field-title">當年甄試網站 URL</span>
        <input type="url" id="exLinkSite" value="${esc(site.url)}" placeholder="https://cpc1xx.twrecruit.com.tw/"></label>
      <h3 class="small" style="margin:12px 0 6px">歷屆對照（可增刪；已預填 113／114 筆試日）</h3>
      <div id="exHistBox" class="hist-box">${histRows}</div>
      <button type="button" class="btn btn-soft btn-sm" id="exHistAdd" style="margin-top:6px">＋ 新增歷屆列</button>
      <p class="muted small" style="margin-top:10px">首頁倒數以第一試筆試日為準。資料進本機／雲端備份。自動爬官網＝下一階段。</p>`,
    onOpen: (body) => {
      const syncDisc = () => {
        const st = $('#exStatus', body).value;
        $('#exDiscPreview', body).textContent = examDisclaimer({ status: st });
      };
      $('#exStatus', body).onchange = syncDisc;
      $('#exApplyEst', body).onclick = (e) => {
        e.preventDefault();
        $('#exWritten', body).value = '2027-12-11';
        $('#exStatus', body).value = 'estimate';
        syncDisc();
        toast('已套用推估筆試日 2027-12-11');
      };
      const wireDel = (root) => {
        $$('.h-del', root).forEach((b) => { b.onclick = () => b.closest('.hist-row').remove(); });
      };
      wireDel(body);
      $('#exHistAdd', body).onclick = (e) => {
        e.preventDefault();
        const box = $('#exHistBox', body);
        const empty = box.querySelector('.hist-empty'); if (empty) empty.remove();
        const div = document.createElement('div');
        div.className = 'hist-row';
        div.innerHTML = `<input type="text" class="h-year" placeholder="年" style="width:4.5rem">
          <input type="date" class="h-written" title="筆試日">
          <input type="text" class="h-note" placeholder="備註" style="flex:1;min-width:5rem">
          <button type="button" class="btn btn-text-bad btn-sm h-del">刪</button>`;
        box.appendChild(div);
        wireDel(div);
      };
    }
  });
  if (!r.ok) return false;
  const body = r.body;
  const history = $$('.hist-row', body).map((row) => ({
    id: shortId('yh'),
    yearLabel: $('.h-year', row).value.trim(),
    writtenDate: $('.h-written', row).value,
    note: $('.h-note', row).value.trim(),
    prospectusDate: '', registerStart: '', registerEnd: '', secondStart: '', secondEnd: ''
  })).filter((h) => h.yearLabel || h.writtenDate);
  const next = normalizeExamSchedule({
    title: $('#exTitle', body).value.trim(),
    status: $('#exStatus', body).value,
    prospectusDate: $('#exProspectus', body).value,
    registerStart: $('#exRegS', body).value,
    registerEnd: $('#exRegE', body).value,
    writtenDate: $('#exWritten', body).value,
    secondStart: $('#exSecS', body).value,
    secondEnd: $('#exSecE', body).value,
    certDeadline: $('#exCert', body).value,
    note: $('#exNote', body).value.trim(),
    links: [
      { id: 'cpc-jobs', name: '中油就業資訊', url: $('#exLinkJobs', body).value.trim() || 'https://www.cpc.com.tw/News.aspx?n=32', note: '中油官網就業／甄試資訊', builtin: true },
      { id: 'exam-site', name: '當年甄試網站', url: $('#exLinkSite', body).value.trim(), note: '例如 cpc1xx.twrecruit.com.tw', builtin: true }
    ],
    history: history.length ? history : DEFAULT_EXAM_HISTORY()
  });
  settings.examSchedule = next;
  await saveSettings('examSchedule');
  toast(next.status === 'official' ? '已存成官方簡章時程' : '已儲存考試時程');
  return true;
}

async function linkDialog(link) {
  const isNew = !link;
  const cur = link || { id: shortId('link'), subject: 'math', unit: '分數四則', name: '', url: 'https://', note: '', builtin: false };
  const r = await modal({
    title: isNew ? '新增學習連結' : '編輯學習連結',
    okText: '儲存',
    html: `
      <label class="field"><span class="field-title">科目</span>
        <select id="dlgLinkSub">${LEARN_SUBJECTS.map((x) => `<option value="${esc(x.id)}" ${cur.subject === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="field-title">單元</span>
        <input type="text" id="dlgLinkUnit" value="${esc(cur.unit || '')}" placeholder="例如：分數四則" list="dlgUnitHints">
        <datalist id="dlgUnitHints"><option value="分數四則"><option value="一元一次方程式"><option value="二元一次聯立方程式"><option value="正負數"><option value="次方"><option value="根號"><option value="比例"><option value="單位換算"></datalist>
      </label>
      <label class="field"><span class="field-title">名稱</span><input type="text" id="dlgLinkName" value="${esc(cur.name || '')}" placeholder="例如：均一：分數"></label>
      <label class="field"><span class="field-title">網址 URL</span><input type="url" id="dlgLinkUrl" value="${esc(cur.url || '')}" placeholder="https://"></label>
      <label class="field"><span class="field-title">備註 <small>選填</small></span><input type="text" id="dlgLinkNote" value="${esc(cur.note || '')}" placeholder="搞不懂再點進來"></label>`
  });
  if (!r.ok) return false;
  const name = $('#dlgLinkName', r.body).value.trim();
  const url = $('#dlgLinkUrl', r.body).value.trim();
  const subject = $('#dlgLinkSub', r.body).value;
  const unit = $('#dlgLinkUnit', r.body).value.trim();
  const note = $('#dlgLinkNote', r.body).value.trim();
  if (!name || !url) { toast('請填名稱和網址'); return false; }
  try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch { toast('網址格式不對，要 https:// 開頭'); return false; }
  const next = { id: cur.id, subject, unit, name, url, note, builtin: !!cur.builtin };
  const i = settings.learnLinks.findIndex((x) => x.id === cur.id);
  if (i >= 0) settings.learnLinks[i] = next; else settings.learnLinks.push(next);
  toast(isNew ? '已新增連結' : '已儲存連結');
  return true;
}

async function tabDialog(existing) {
  const t = existing || { name: '', category: settings.categories[0]?.id, intervals: null };
  if (!settings.categories.length) { await alertBox('還沒有分類', '<p>請先在設定新增一個分類。</p>'); return false; }
  const res = await modal({
    title: existing ? `編輯分頁「${existing.name}」` : '新增分頁',
    okText: existing ? '儲存' : '新增',
    html: `
      <label class="field"><span class="field-title">分頁名稱</span><input type="text" id="dlgTabName" value="${esc(t.name)}" placeholder="例如：數學、國文"></label>
      <span class="field-title">屬於哪一個分類？<small>決定錯誤原因的選項</small></span>
      ${settings.categories.map((c) => `<label class="radio-line"><input type="radio" name="dlgCat" value="${esc(c.id)}" ${c.id === t.category ? 'checked' : ''}><span><b>${esc(c.name)}</b><br><span class="muted small">${esc(c.reasons.slice(0, 3).join('、'))}${c.reasons.length > 3 ? '…' : ''}</span></span></label>`).join('')}
      <span class="field-title" style="margin-top:10px">複習間隔</span>
      <label class="radio-line"><input type="radio" name="dlgIvMode" value="default" ${t.intervals ? '' : 'checked'}><span>沿用預設（${ivText(settings.intervals)} 天）</span></label>
      <label class="radio-line"><input type="radio" name="dlgIvMode" value="custom" ${t.intervals ? 'checked' : ''}><span>這個分頁自訂</span></label>
      <div class="inline"><input type="text" id="dlgIv" inputmode="numeric" value="${esc(ivText(t.intervals || settings.intervals))}" aria-label="自訂間隔"><button type="button" class="btn btn-soft btn-sm" id="dlgEbb">艾賓浩斯</button></div>
      <p class="hint">用逗號分隔天數，例如 1, 2, 4, 7, 15, 30</p>`,
    onOpen: (body) => {
      $('#dlgEbb', body).onclick = () => { $('#dlgIv', body).value = ivText(EBBINGHAUS); $('input[name=dlgIvMode][value=custom]', body).checked = true; };
      $('#dlgIv', body).oninput = () => { $('input[name=dlgIvMode][value=custom]', body).checked = true; };
    }
  });
  if (!res.ok) return false;
  const body = res.body;
  const name = $('#dlgTabName', body).value.trim();
  const category = ($('input[name=dlgCat]:checked', body) || {}).value;
  const custom = $('input[name=dlgIvMode]:checked', body).value === 'custom';
  const iv = custom ? parseIntervals($('#dlgIv', body).value) : null;
  if (!name) { toast('請輸入分頁名稱'); return false; }
  if (settings.tabs.some((x) => x.name === name && x !== existing)) { toast('已經有同名的分頁了'); return false; }
  if (!category) { toast('請選一個分類'); return false; }
  if (custom && !iv) { toast('間隔格式不對：請用逗號分隔 1 以上的整數天數'); return false; }
  if (existing) Object.assign(existing, { name, category, intervals: iv });
  else { const nt = { id: shortId('tab'), name, category, intervals: iv }; settings.tabs.push(nt); await setCurrentTab(nt.id); }
  await saveSettings('tabs');
  toast(existing ? '分頁已更新' : `已新增分頁「${name}」`);
  return true;
}

/* ---------- 備份與還原 ---------- */
function blobToDataURL(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
function dataURLToBlob(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('data:')) return null;
  const [head, data] = url.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(data); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
async function buildBackupBlob() {
  const all = await DB.all();
  const drivePublic = settings.driveBackup ? {
    folderId: settings.driveBackup.folderId || '',
    folderName: settings.driveBackup.folderName || '',
    scheduleEnabled: !!settings.driveBackup.scheduleEnabled,
    scheduleKind: settings.driveBackup.scheduleKind || 'weekly',
    scheduleTime: settings.driveBackup.scheduleTime || '21:00',
    scheduleWeekday: settings.driveBackup.scheduleWeekday ?? 0,
    lastCloudBackupAt: settings.driveBackup.lastCloudBackupAt || null,
    lastCloudBackupDate: settings.driveBackup.lastCloudBackupDate || null
  } : null;
  const header = { app: APP_ID, version: DATA_VERSION, exportedAt: new Date().toISOString(), exportedDate: today(),
    settings: { tabs: settings.tabs, categories: settings.categories, intervals: settings.intervals, chapters: settings.chapters, sources: settings.sources, driveBackup: drivePublic, learnLinks: settings.learnLinks || [], dailyGoal: settings.dailyGoal || 10, examSchedule: settings.examSchedule || DEFAULT_EXAM_SCHEDULE() } };
  const parts = [JSON.stringify(header).slice(0, -1), ',"mistakes":['];
  for (let i = 0; i < all.length; i++) {
    const m = all[i];
    parts.push((i ? ',' : '') + JSON.stringify(Object.assign({}, m, {
      questionImg: m.questionImg ? await blobToDataURL(m.questionImg) : null,
      answerImg: m.answerImg ? await blobToDataURL(m.answerImg) : null
    })));
  }
  parts.push(']}');
  return new Blob(parts, { type: 'application/json' });
}
async function markBackupDone({ cloud = false, fileId = '', fileName = '' } = {}) {
  settings.lastBackup = today();
  const keys = ['lastBackup'];
  if (cloud) {
    settings.driveBackup.lastCloudBackupAt = new Date().toISOString();
    settings.driveBackup.lastCloudBackupDate = today();
    if (fileId) settings.driveBackup.lastCloudFileId = fileId;
    if (fileName) settings.driveBackup.lastCloudFileName = fileName;
    keys.push('driveBackup');
  }
  await saveSettings(...keys);
  const al = $('#backupAlert'); if (al) al.remove();
}
async function exportBackup() {
  try {
    toast('正在準備備份檔…');
    const blob = await buildBackupBlob();
    const name = `錯題本備份_${today()}.json`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    await markBackupDone({ cloud: false });
    toast(`已下載 ${name}（${(blob.size / 1048576).toFixed(1)} MB）`);
    if (parseHash().view === 'settings') render();
  } catch (err) { console.error(err); toast('備份失敗：' + err.message); }
}
async function uploadBackupToDrive({ interactive = true, silent = false } = {}) {
  if (!DriveBackup.online()) { if (!silent) toast('目前沒有網路，改用本機下載備份'); if (!silent) await exportBackup(); return { ok: false, reason: 'offline' }; }
  if (!DriveBackup.hasClientId(settings)) { if (!silent) toast('還沒設定 Google Client ID，請到設定 → 備份填寫'); return { ok: false, reason: 'no-client' }; }
  try {
    if (!silent) toast('正在準備備份並上傳到雲端硬碟…');
    if (!settings.driveBackup.connected) await DriveBackup.connect(settings);
    else {
      await DriveBackup.requestToken(settings, { interactive });
      await DriveBackup.ensureBackupFolder(settings);
    }
    const blob = await buildBackupBlob();
    const name = DriveBackup.cloudFileName(today());
    const meta = { name, parents: [settings.driveBackup.folderId], mimeType: 'application/json' };
    const file = await DriveBackup.resumableUpload(blob, meta);
    await markBackupDone({ cloud: true, fileId: file.id, fileName: file.name || name });
    await saveSettings('driveBackup');
    if (!silent) toast(`已上傳到雲端硬碟：${file.name || name}（${(blob.size / 1048576).toFixed(1)} MB）`);
    if (parseHash().view === 'settings' || parseHash().view === 'home') render();
    return { ok: true, file };
  } catch (err) {
    console.error(err);
    if (!silent) toast('雲端備份失敗：' + err.message);
    return { ok: false, reason: 'error', error: err };
  }
}
let autoCloudBusy = false;
async function maybeAutoCloudBackup() {
  if (autoCloudBusy) return;
  if (!DriveBackup.online()) return;
  if (!DriveBackup.hasClientId(settings) || !settings.driveBackup.connected) return;
  if (!DriveBackup.isScheduleDue(settings.driveBackup)) return;
  autoCloudBusy = true;
  try {
    toast('排程備份時間到了，正在上傳到雲端硬碟…');
    await uploadBackupToDrive({ interactive: true, silent: false });
  } finally { autoCloudBusy = false; }
}
async function importBackup(file, mode) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('這個檔案打不開，請選「錯題本備份_日期.json」'); return; }
  if (!data || data.app !== APP_ID || !Array.isArray(data.mistakes)) { toast('這不是錯題本的備份檔'); return; }
  const incoming = data.mistakes.filter((m) => m && m.id).map((m) => normalize(Object.assign({}, m, { questionImg: dataURLToBlob(m.questionImg), answerImg: dataURLToBlob(m.answerImg) })));
  const s = data.settings || {};
  if (mode === 'overwrite') {
    await DB.clear(); await DB.putMany(incoming);
    if (Array.isArray(s.tabs)) settings.tabs = s.tabs;
    if (Array.isArray(s.categories) && s.categories.length) settings.categories = s.categories;
    if (Array.isArray(s.intervals) && s.intervals.length) settings.intervals = s.intervals;
    settings.chapters = s.chapters || {}; settings.sources = s.sources || [];
    if (Array.isArray(s.learnLinks)) settings.learnLinks = mergeLearnLinks(s.learnLinks);
    if (s.dailyGoal) settings.dailyGoal = Math.max(1, Math.min(50, Number(s.dailyGoal) || 10));
    if (s.examSchedule) settings.examSchedule = normalizeExamSchedule(s.examSchedule);
    if (s.driveBackup && typeof s.driveBackup === 'object') {
      settings.driveBackup = Object.assign(DriveBackup.DEFAULT_DRIVE(), settings.driveBackup, {
        folderId: s.driveBackup.folderId || settings.driveBackup.folderId,
        folderName: s.driveBackup.folderName || settings.driveBackup.folderName,
        scheduleEnabled: !!s.driveBackup.scheduleEnabled,
        scheduleKind: s.driveBackup.scheduleKind || settings.driveBackup.scheduleKind,
        scheduleTime: s.driveBackup.scheduleTime || settings.driveBackup.scheduleTime,
        scheduleWeekday: s.driveBackup.scheduleWeekday ?? settings.driveBackup.scheduleWeekday,
        lastCloudBackupAt: s.driveBackup.lastCloudBackupAt || null,
        lastCloudBackupDate: s.driveBackup.lastCloudBackupDate || null
      });
    }
  } else {
    const existing = new Map((await DB.all()).map((m) => [m.id, m]));
    await DB.putMany(incoming.filter((m) => { const old = existing.get(m.id); return !old || (m.updatedAt || 0) > (old.updatedAt || 0); }));
    (s.categories || []).forEach((c) => {
      const mine = settings.categories.find((x) => x.id === c.id);
      if (!mine) settings.categories.push(c); else (c.reasons || []).forEach((r) => { if (!mine.reasons.includes(r)) mine.reasons.push(r); });
    });
    (s.tabs || []).forEach((t) => { if (!settings.tabs.some((x) => x.id === t.id)) settings.tabs.push(t); });
    for (const [k, list] of Object.entries(s.chapters || {})) settings.chapters[k] = [...new Set([...(settings.chapters[k] || []), ...list])].slice(0, 40);
    settings.sources = [...new Set([...settings.sources, ...(s.sources || [])])].slice(0, 40);
    if (Array.isArray(s.learnLinks) && s.learnLinks.length) {
      const map = new Map((settings.learnLinks || []).map((x) => [x.id, x]));
      s.learnLinks.forEach((x) => { if (x && x.id) map.set(x.id, Object.assign({}, map.get(x.id) || {}, x)); });
      settings.learnLinks = mergeLearnLinks([...map.values()]);
    }
    if (s.examSchedule && (s.examSchedule.writtenDate || s.examSchedule.prospectusDate || s.examSchedule.registerStart)) {
      settings.examSchedule = normalizeExamSchedule(Object.assign({}, settings.examSchedule, s.examSchedule));
    }
    if (s.dailyGoal) settings.dailyGoal = Math.max(1, Math.min(50, Number(s.dailyGoal) || settings.dailyGoal || 10));
    // 合併時保留這支手機自己的全域間隔設定
  }
  await saveSettings('tabs', 'categories', 'intervals', 'chapters', 'sources', 'driveBackup', 'learnLinks', 'dailyGoal', 'examSchedule');
  if (currentTab && !settings.tabs.some((t) => t.id === currentTab)) await setCurrentTab('');
  toast(`還原完成，匯入 ${incoming.length} 題`);
  location.hash = '#home'; render();
}

/* ---------- 設定 ---------- */
async function viewSettings(app) {
  const all = await DB.all();
  const age = backupAgeDays();
  let persisted = null, estimate = null;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch {}
  try { estimate = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch {}
  const countIn = (tabId) => all.filter((m) => m.subject === tabId).length;

  const db = settings.driveBackup;
  const online = DriveBackup.online();
  const hasCid = DriveBackup.hasClientId(settings);
  const cloudOn = !!(db.connected && db.folderId);
  const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
  const folderLink = db.folderId ? (db.folderUrl || DriveBackup.folderOpenUrl(db.folderId)) : '';
  app.innerHTML = `
    <section class="card" id="gateCard">
      <h2>通行碼</h2>
      <p class="muted small">開 App 要輸入通行碼（只存雜湊在這台裝置）。網址請勿公開張貼。</p>
      <div class="btn-row" style="flex-wrap:wrap">
        <button type="button" class="btn btn-soft" id="gateChange">變更通行碼</button>
        <button type="button" class="btn btn-soft" id="gateLock">立即上鎖</button>
        <label class="chk"><input type="checkbox" id="gateOn" ${window.CpcGate && CpcGate.isOn() ? 'checked' : ''}> 開啟通行碼（建議）</label>
      </div>
    </section>
    <section class="card" id="backupCard">
      <h2>備份與還原</h2>
      <p class="small">${age === null ? '⚠️ 還沒有備份過。' : `上次備份：${esc(settings.lastBackup)}（${age === 0 ? '今天' : age + ' 天前'}）`}</p>
      <p class="muted small">資料只存在這台裝置的瀏覽器裡。可下載到本機，或連上 Google 雲端硬碟自動／手動上傳（含照片、分頁、分類、間隔與雲端設定）。</p>

      <div class="settings-grid">
        <div class="stack">
          <h3>本機備份</h3>
          <button class="btn btn-soft" id="btnExport">⬇ 下載備份（含照片）</button>
          <div class="radio-group">
            <label class="radio-line"><input type="radio" name="importMode" value="merge" checked><span><b>合併</b>：保留現有題目，再加入備份裡的題目</span></label>
            <label class="radio-line"><input type="radio" name="importMode" value="overwrite"><span><b>覆蓋</b>：先清空，整個換成備份的內容</span></label>
          </div>
          <label class="btn btn-soft">⬆ 選備份檔來還原<input class="file-hidden" type="file" accept=".json,application/json" id="importFile"></label>
        </div>

        <div class="stack cloud-panel" id="cloudPanel">
          <h3>Google 雲端硬碟</h3>
          <p class="muted small warn-note">⚠ 自動備份只在 App <b>打開、回到前景或重新連上網路</b>時檢查；App 完全關閉時無法在背景上傳。</p>
          ${!online ? '<p class="alert alert-warn" id="cloudOffline">目前沒有網路，雲端功能暫時隱藏。本機下載備份仍可用。</p>' : ''}
          <div id="cloudOnlineBlock" ${online ? '' : 'hidden'}>
            <p class="muted small">會用你自己的 Google 帳號；別人用同一網址也會登入他們自己的帳號，備份互不相通。</p>
            <div class="btn-row">
              ${cloudOn
                ? '<button type="button" class="btn btn-text-bad" id="btnDisconnect">中斷連接</button>'
                : '<button type="button" class="btn btn-primary btn-big" id="btnConnect">☁ 備份到 Google 雲端硬碟</button>'}
            </div>
            <details class="adv-cid" ${hasCid ? '' : 'open'}>
              <summary class="muted small">進階：自行填 Client ID</summary>
              <label class="field"><span class="field-title">Google Client ID <small>只存在這台裝置</small></span>
                <input type="text" id="clientIdInput" placeholder="xxxxx.apps.googleusercontent.com" value="${esc(db.clientIdOverride || '')}" autocomplete="off" spellcheck="false">
              </label>
              <p class="hint" id="clientIdHint">${hasCid ? '已內建 Client ID，一般不用填。' : '尚未設定 Client ID：請在這裡填入。沒填也能用本機下載備份。'}</p>
              <button type="button" class="btn btn-soft" id="btnSaveClientId">儲存 Client ID</button>
            </details>
            <div class="cloud-status" id="cloudStatus">
              ${cloudOn
                ? `<p class="small">✅ 已連接${db.accountHint ? '・' + esc(db.accountHint) : ''}<br>資料夾：<b id="folderNameLabel">${esc(db.folderName || '中油錯題本備份')}</b>
                   ${folderLink ? ` · <a href="${esc(folderLink)}" target="_blank" rel="noopener" id="folderOpenLink">在雲端硬碟開啟資料夾</a>` : ''}</p>
                   <p class="muted small">上次雲端備份：${db.lastCloudBackupDate ? esc(db.lastCloudBackupDate) + (db.lastCloudFileName ? '・' + esc(db.lastCloudFileName) : '') : '還沒有'}</p>`
                : '<p class="muted small">尚未連接。連接後會在雲端硬碟建立或使用「中油錯題本備份」資料夾。</p>'}
            </div>
            <div class="btn-row" ${cloudOn ? '' : 'hidden'} id="cloudActions">
              <button type="button" class="btn btn-primary" id="btnCloudUpload">☁ 立刻備份</button>
              <button type="button" class="btn btn-soft" id="btnPickFolder">選擇資料夾</button>
            </div>
            <div class="card soft-card" id="scheduleCard" ${cloudOn ? '' : 'hidden'}>
              <h3>自動備份時間</h3>
              <label class="chk"><input type="checkbox" id="schedEnabled" ${db.scheduleEnabled ? 'checked' : ''}> 開啟排程（僅 App 開啟時檢查）</label>
              <div class="inline schedule-row">
                <label class="field grow"><span class="field-title">頻率</span>
                  <select id="schedKind">
                    <option value="daily" ${db.scheduleKind === 'daily' ? 'selected' : ''}>每天</option>
                    <option value="weekly" ${db.scheduleKind === 'weekly' ? 'selected' : ''}>每週</option>
                    <option value="monthly30" ${db.scheduleKind === 'monthly30' ? 'selected' : ''}>每 30 天</option>
                  </select>
                </label>
                <label class="field" id="schedWdWrap" ${db.scheduleKind === 'weekly' ? '' : 'hidden'}><span class="field-title">星期</span>
                  <select id="schedWeekday">${weekNames.map((n, i) => `<option value="${i}" ${(+db.scheduleWeekday === i) ? 'selected' : ''}>週${n}</option>`).join('')}</select>
                </label>
                <label class="field"><span class="field-title">本地時間</span>
                  <input type="time" id="schedTime" value="${esc(db.scheduleTime || '21:00')}">
                </label>
              </div>
              <button type="button" class="btn btn-soft" id="btnSaveSched">儲存排程</button>
              <p class="hint" id="schedHint">${esc(DriveBackup.nextDueLabel(db))}</p>
            </div>
            <div id="cloudRestore" ${cloudOn ? '' : 'hidden'}>
              <h3>從雲端硬碟還原</h3>
              <button type="button" class="btn btn-soft" id="btnListCloud">列出備份檔</button>
              <div id="cloudFileList" class="cloud-files"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="card" id="examCard">
      <h2>考試時程</h2>
      <p class="muted small">整條時程（簡章／報名／第一試／第二試）與首頁倒數共用。推估時會標「可能為歷屆考試時間」並顯示免責；官方確認後改狀態即可。一定保留可點的中油就業資訊連結。自動爬官網＝下一階段。</p>
      <div id="examSummary" class="exam-summary"></div>
      <button type="button" class="btn btn-primary" id="btnEditExam" style="margin-top:10px">編輯考試時程</button>
    </section>

    <section class="card" id="goalCard">
      <h2>今日該做</h2>
      <p class="muted small">首頁「今日該做」建議一次複習題數（預設 10）。學習入口與之後課表會掛在同一區塊。</p>
      <label class="field"><span class="field-title">一次大約幾題</span>
        <input type="number" id="dailyGoalInput" min="1" max="50" value="${settings.dailyGoal || 10}">
      </label>
      <button type="button" class="btn btn-primary" id="btnSaveGoal" style="margin-top:8px">儲存</button>
    </section>

    <section class="card" id="linksCard">
      <h2>學習資源連結</h2>
      <p class="muted small">給學習區各科「搞不懂再點進去」的網站。預設含均一教育平台等；可新增、修改、刪除，也可還原預設（不會鎖死）。這些連結會進本機與雲端備份。</p>
      <label class="field"><span class="field-title">篩選科目</span>
        <select id="linkFilter">
          <option value="">全部</option>
          ${LEARN_SUBJECTS.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}
        </select>
      </label>
      <div id="linkList" class="link-admin"></div>
      <div class="btn-row" style="margin-top:12px">
        <button type="button" class="btn btn-primary" id="btnAddLink">＋ 新增連結</button>
        <button type="button" class="btn btn-soft" id="btnResetLinks">還原預設連結</button>
      </div>
    </section>

    <section class="card" id="tabCard">
      <h2>分頁（科目）</h2>
      <p class="muted small">每個分頁只顯示自己的題目。分類決定錯誤原因的選項。</p>
      ${settings.tabs.map((x, i) => `<div class="tab-row" data-i="${i}">
        <div class="grow"><b>${esc(x.name)}</b><div class="muted small">${esc(categoryOf(x.category).name)}・${countIn(x.id)} 題・${x.intervals ? '自訂間隔 ' + ivText(x.intervals) : '沿用預設間隔'}</div></div>
        <button type="button" class="btn btn-soft tab-edit">編輯</button>
        <button type="button" class="btn btn-text-bad tab-del" aria-label="刪除 ${esc(x.name)}">刪除</button>
      </div>`).join('') || '<p class="muted">目前沒有分頁。</p>'}
      <button type="button" class="btn btn-primary" id="btnAddTab" style="margin-top:12px">＋ 新增分頁</button>
    </section>

    <section class="card" id="ivCard">
      <h2>複習間隔（全部分頁的預設）</h2>
      <p class="muted small"><b>預設：艾賓浩斯記憶曲線</b>（1、2、4、7、15、30 天）。答對就進到下一關，答錯回到第 1 關，最後一關也答對就自動移到「已完成複習」（也可以在題目裡手動按「標記為完成」）。</p>
      ${ivChips(settings.intervals)}
      <label class="field" style="margin-top:10px"><span class="field-title">自訂天數 <small>用逗號分隔</small></span>
        <input type="text" id="ivInput" inputmode="numeric" value="${esc(ivText(settings.intervals))}"></label>
      <div class="btn-row"><button type="button" class="btn btn-soft" id="btnIvReset">還原成艾賓浩斯預設</button><button type="button" class="btn btn-primary" id="btnIvSave">儲存間隔</button></div>
      <p class="hint">改間隔只影響之後的排程，已經排好的下次複習日期不會變。</p>
    </section>

    <section class="card" id="catCard">
      <h2>分類與錯誤原因</h2>
      <p class="muted small">點選項上的 ✕ 可以刪除；已經勾過的舊題目不會改變。</p>
      ${settings.categories.map((c, ci) => `<div class="cat-block" data-ci="${ci}">
        <div class="bar-label"><h3>${esc(c.name)}</h3><span><button type="button" class="link cat-rename">改名</button><button type="button" class="link link-bad cat-del">刪除</button></span></div>
        <p class="muted small">用這個分類的分頁：${esc(settings.tabs.filter((x) => x.category === c.id).map((x) => x.name).join('、') || '（沒有）')}</p>
        <div class="chips">${c.reasons.map((r, i) => `<button type="button" class="chip chip-del reason-del" data-i="${i}" aria-label="刪除 ${esc(r)}">${esc(r)} <b>✕</b></button>`).join('')}</div>
        <div class="inline" style="margin-top:10px"><input type="text" class="new-reason" placeholder="新增一個錯誤原因"><button type="button" class="btn btn-primary add-reason">新增</button></div>
      </div>`).join('')}
      <button type="button" class="btn btn-soft" id="btnAddCat" style="margin-top:14px">＋ 新增分類</button>
    </section>

    <section class="card">
      <h2>記住的章節和來源</h2>
      <p class="muted small">點一下可以從清單移除（不會影響已經存的題目）。</p>
      ${settings.tabs.map((s) => (settings.chapters[s.id] || []).length ? `<h3 style="margin-top:10px">${esc(s.name)}</h3><div class="chips">${settings.chapters[s.id].map((c, i) => `<button type="button" class="chip chip-del ch-del" data-s="${esc(s.id)}" data-i="${i}">${esc(c)} <b>✕</b></button>`).join('')}</div>` : '').join('')}
      ${settings.sources.length ? `<h3 style="margin-top:10px">題目來源</h3><div class="chips">${settings.sources.map((c, i) => `<button type="button" class="chip chip-del src-del" data-i="${i}">${esc(c)} <b>✕</b></button>`).join('')}</div>` : ''}
    </section>

    <div class="card small muted">
      <p>共 ${all.length} 題。${estimate ? `目前用掉約 ${(estimate.usage / 1048576).toFixed(1)} MB。` : ''}</p>
      <p>資料保護：${persisted === true ? '✅ 已設為「不會被自動清除」' : persisted === false ? '⚠️ 瀏覽器還沒同意永久保存，記得定期備份（加到主畫面後通常會同意）' : '無法檢查'}</p>
      <p>外觀會跟著手機的深色／淺色模式自動切換。</p>
      <p>中油學習卡｜阿電老師・錯題複習＋學習區（國英數電機）・手機與電腦都能用</p>
    </div>`;
  if (window.CpcGate) {
    $('#gateChange').onclick = () => CpcGate.change();
    $('#gateLock').onclick = () => CpcGate.lock();
    $('#gateOn').onchange = async (ev) => { const ok = await CpcGate.toggleOff(!ev.target.checked); if (!ok) ev.target.checked = !ev.target.checked; };
  }

  $('#btnExport').onclick = exportBackup;
  $('#importFile').onchange = async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    const mode = $('input[name=importMode]:checked').value;
    const ok = await confirmBox(mode === 'overwrite' ? '確定要覆蓋嗎？' : '確定要合併嗎？',
      mode === 'overwrite' ? `<p>這台裝置上現在的 <b>${all.length} 題和所有設定會全部換掉</b>，換成「${esc(file.name)}」裡的內容。</p>`
        : `<p>會把「${esc(file.name)}」裡的題目、分頁和分類加進來，原本的資料會保留。</p>`,
      mode === 'overwrite' ? '覆蓋' : '合併', mode === 'overwrite');
    if (ok) await importBackup(file, mode);
  };

  const saveDrive = async () => { await saveSettings('driveBackup'); };
  $('#btnSaveClientId').onclick = async () => {
    settings.driveBackup.clientIdOverride = ($('#clientIdInput').value || '').trim();
    await saveDrive(); toast(settings.driveBackup.clientIdOverride ? '已儲存 Client ID（只在這台裝置）' : '已清除本機 Client ID'); render();
  };
  const bc = $('#btnConnect');
  if (bc) bc.onclick = async () => {
    const typed = ($('#clientIdInput').value || '').trim();
    if (typed) { settings.driveBackup.clientIdOverride = typed; await saveDrive(); }
    if (!DriveBackup.hasClientId(settings)) { toast('請先在「進階」填寫 Google Client ID'); return; }
    bc.disabled = true;
    try { await uploadBackupToDrive({ interactive: true, silent: false }); await saveDrive(); }
    catch (err) { toast('備份失敗：' + err.message); }
    render();
  };
  const bd = $('#btnDisconnect');
  if (bd) bd.onclick = async () => {
    DriveBackup.disconnect(settings); await saveDrive(); toast('已中斷 Google 連接'); render();
  };
  const bu = $('#btnCloudUpload');
  if (bu) bu.onclick = () => uploadBackupToDrive();
  const bp = $('#btnPickFolder');
  if (bp) bp.onclick = async () => {
    try {
      const picked = await DriveBackup.pickFolder(settings);
      if (!picked) { toast('沒有選擇資料夾'); return; }
      await saveDrive(); toast('已改用資料夾：' + picked.name); render();
    } catch (err) { toast('選擇資料夾失敗：' + err.message); }
  };
  const sk = $('#schedKind');
  if (sk) sk.onchange = () => { $('#schedWdWrap').hidden = sk.value !== 'weekly'; };
  const bs = $('#btnSaveSched');
  if (bs) bs.onclick = async () => {
    settings.driveBackup.scheduleEnabled = $('#schedEnabled').checked;
    settings.driveBackup.scheduleKind = $('#schedKind').value;
    settings.driveBackup.scheduleTime = $('#schedTime').value || '21:00';
    settings.driveBackup.scheduleWeekday = +$('#schedWeekday').value;
    await saveDrive();
    toast('已儲存排程'); $('#schedHint').textContent = DriveBackup.nextDueLabel(settings.driveBackup);
  };
  const bl = $('#btnListCloud');
  if (bl) bl.onclick = async () => {
    const box = $('#cloudFileList'); box.innerHTML = '<p class="muted small">讀取中…</p>';
    try {
      const files = await DriveBackup.listBackupFiles(settings);
      if (!files.length) { box.innerHTML = '<p class="muted small">這個資料夾還沒有備份檔。</p>'; return; }
      box.innerHTML = files.map((f) => `<div class="cloud-file" data-id="${esc(f.id)}" data-name="${esc(f.name)}">
        <div class="grow"><b>${esc(f.name)}</b><div class="muted small">${esc((f.modifiedTime || '').slice(0, 19).replace('T', ' '))}${f.size ? '・' + (f.size / 1048576).toFixed(1) + ' MB' : ''}</div></div>
        <button type="button" class="btn btn-soft btn-sm cloud-restore-btn">還原</button></div>`).join('');
      $$('.cloud-restore-btn', box).forEach((btn) => {
        btn.onclick = async () => {
          const row = btn.closest('.cloud-file');
          const mode = $('input[name=importMode]:checked').value;
          const ok = await confirmBox(mode === 'overwrite' ? '用雲端備份覆蓋？' : '合併雲端備份？',
            `<p>檔案：<b>${esc(row.dataset.name)}</b></p><p class="muted small">會用上面選的「${mode === 'overwrite' ? '覆蓋' : '合併'}」方式匯入。</p>`,
            mode === 'overwrite' ? '覆蓋' : '合併', mode === 'overwrite');
          if (!ok) return;
          try {
            toast('正在從雲端下載…');
            await DriveBackup.requestToken(settings, { interactive: true });
            const file = await DriveBackup.downloadFile(row.dataset.id);
            await importBackup(file, mode);
          } catch (err) { toast('還原失敗：' + err.message); }
        };
      });
    } catch (err) { box.innerHTML = ''; toast('無法列出檔案：' + err.message); }
  };

  // 分頁
  const renderExamSummary = () => {
    const box = $('#examSummary'); if (!box) return;
    const ex = settings.examSchedule || DEFAULT_EXAM_SCHEDULE();
    const cd = countdownText(ex.writtenDate);
    const linkBtns = (ex.links || []).filter((l) => l.url).map((l) => `<a class="btn btn-soft btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join(' ')
      || `<a class="btn btn-soft btn-sm" href="https://www.cpc.com.tw/News.aspx?n=32" target="_blank" rel="noopener">中油就業資訊</a>`;
    const hist = (ex.history || []).slice(0, 4).map((h) => `${esc(h.yearLabel || '?')}筆試 ${esc(h.writtenDate || '—')}`).join('；');
    box.innerHTML = `
      <p class="exam-disc muted small">${esc(examDisclaimer(ex))}</p>
      <p><b>${esc(ex.title)}</b>　<span class="tag">${esc(writtenSourceLabel(ex.status))}</span>
        ${ex.status !== 'official' ? '<span class="tag tag-est">可能為歷屆考試時間</span>' : ''}</p>
      <p>第一試筆試：${ex.writtenDate ? `${esc(ex.writtenDate)}（${esc(cd)}）` : '未設定'}　·　${esc(writtenAside(ex))}</p>
      <p class="muted small">簡章 ${ex.prospectusDate || '—'}　·　報名 ${ex.registerStart || '—'}～${ex.registerEnd || '—'}
        ${ex.secondStart ? `　·　第二試 ${ex.secondStart}${ex.secondEnd ? '～' + ex.secondEnd : ''}` : ''}
        ${ex.certDeadline ? `　·　證書截止 ${ex.certDeadline}` : ''}</p>
      <div class="btn-row" style="margin:8px 0;flex-wrap:wrap">${linkBtns}</div>
      ${hist ? `<p class="muted small">歷屆：${hist}</p>` : ''}
      ${ex.note ? `<p class="muted small">備註：${esc(ex.note)}</p>` : ''}`;
  };
  renderExamSummary();
  const be = $('#btnEditExam');
  if (be) be.onclick = async () => { if (await examDialog()) render(); };

  const bg = $('#btnSaveGoal');
  if (bg) bg.onclick = async () => {
    const n = Math.max(1, Math.min(50, parseInt($('#dailyGoalInput').value, 10) || 10));
    settings.dailyGoal = n; await saveSettings('dailyGoal'); toast(`已設成一次約 ${n} 題`); render();
  };

  // 學習資源連結
  const renderLinkList = () => {
    const filt = $('#linkFilter') ? $('#linkFilter').value : '';
    const box = $('#linkList'); if (!box) return;
    const list = (settings.learnLinks || []).filter((l) => !filt || l.subject === filt);
    if (!list.length) { box.innerHTML = '<p class="muted small">沒有連結。可按「新增」或「還原預設」。</p>'; return; }
    const subName = (id) => (LEARN_SUBJECTS.find((x) => x.id === id) || {}).name || id;
    box.innerHTML = list.map((l) => `<div class="link-admin-row" data-id="${esc(l.id)}">
      <div class="grow">
        <b>${esc(l.name)}</b> ${l.builtin ? '<span class="tag">預設</span>' : ''}
        <div class="muted small">${esc(subName(l.subject))}${l.unit ? '・' + esc(l.unit) : ''}</div>
        <div class="muted small"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a></div>
        ${l.note ? `<div class="muted small">${esc(l.note)}</div>` : ''}
      </div>
      <div class="btn-col">
        <button type="button" class="btn btn-soft btn-sm link-edit">編輯</button>
        <button type="button" class="btn btn-text-bad btn-sm link-del">刪除</button>
      </div>
    </div>`).join('');
    $$('.link-edit', box).forEach((b) => {
      b.onclick = async () => {
        const id = b.closest('.link-admin-row').dataset.id;
        const cur = settings.learnLinks.find((x) => x.id === id);
        if (cur && await linkDialog(cur)) { await saveSettings('learnLinks'); render(); }
      };
    });
    $$('.link-del', box).forEach((b) => {
      b.onclick = async () => {
        const id = b.closest('.link-admin-row').dataset.id;
        const cur = settings.learnLinks.find((x) => x.id === id);
        if (!cur) return;
        if (!(await confirmBox('刪除這個連結？', `<p>「${esc(cur.name)}」刪掉後，若是預設項仍可用「還原預設」加回。</p>`, '刪除', true))) return;
        settings.learnLinks = settings.learnLinks.filter((x) => x.id !== id);
        await saveSettings('learnLinks'); toast('已刪除'); render();
      };
    });
  };
  if ($('#linkFilter')) {
    $('#linkFilter').onchange = () => renderLinkList();
    renderLinkList();
  }
  const ba = $('#btnAddLink');
  if (ba) ba.onclick = async () => { if (await linkDialog(null)) { await saveSettings('learnLinks'); render(); } };
  const br = $('#btnResetLinks');
  if (br) br.onclick = async () => {
    if (!(await confirmBox('還原預設學習連結？', '<p>會把清單換成內建預設（均一等）。你自己新增的連結會被清掉。</p>', '還原'))) return;
    settings.learnLinks = DEFAULT_LEARN_LINKS();
    await saveSettings('learnLinks'); toast('已還原預設連結'); render();
  };

  $('#btnAddTab').onclick = async () => { if (await tabDialog(null)) render(); };
  $$('.tab-row').forEach((row) => {
    const x = settings.tabs[+row.dataset.i];
    $('.tab-edit', row).onclick = async () => { if (await tabDialog(x)) render(); };
    $('.tab-del', row).onclick = async () => {
      const n = countIn(x.id);
      const ok = await confirmBox(`刪除分頁「${x.name}」？`, n
        ? `<p class="warn-text">⚠️ 這個分頁裡還有 <b>${n} 題</b>。刪除分頁會把這 ${n} 題（含照片）一起刪掉，刪了救不回來。</p><p class="muted small">建議先到上面「下載備份」。</p>`
        : '<p>這個分頁裡沒有題目，可以放心刪除。</p>', n ? `連同 ${n} 題一起刪除` : '刪除', true);
      if (!ok) return;
      if (n) await DB.delMany(all.filter((m) => m.subject === x.id).map((m) => m.id));
      settings.tabs = settings.tabs.filter((t) => t !== x); delete settings.chapters[x.id];
      await saveSettings('tabs', 'chapters');
      if (currentTab === x.id) await setCurrentTab('');
      toast(`已刪除分頁「${x.name}」`); render();
    };
  });

  // 間隔
  $('#btnIvSave').onclick = async () => {
    const iv = parseIntervals($('#ivInput').value);
    if (!iv) { toast('格式不對：請用逗號分隔 1 以上的整數天數'); return; }
    settings.intervals = iv; await saveSettings('intervals'); toast('已儲存複習間隔'); render();
  };
  $('#btnIvReset').onclick = async () => { settings.intervals = [...EBBINGHAUS]; await saveSettings('intervals'); toast('已還原成艾賓浩斯預設'); render(); };

  // 分類
  $$('.cat-block').forEach((block) => {
    const c = settings.categories[+block.dataset.ci];
    $('.cat-rename', block).onclick = async () => {
      const r = await modal({ title: '分類改名', html: `<label class="field"><span class="field-title">新名稱</span><input type="text" id="dlgCatName" value="${esc(c.name)}"></label>`, okText: '儲存' });
      if (!r.ok) return; const v = $('#dlgCatName', r.body).value.trim();
      if (!v) { toast('名稱不能空白'); return; }
      c.name = v; await saveSettings('categories'); render();
    };
    $('.cat-del', block).onclick = async () => {
      const used = settings.tabs.filter((x) => x.category === c.id);
      if (used.length) { await alertBox('不能刪除這個分類', `<p>還有分頁在用「${esc(c.name)}」：${esc(used.map((x) => x.name).join('、'))}。請先把這些分頁改成別的分類。</p>`); return; }
      if (await confirmBox(`刪除分類「${c.name}」？`, '<p>這個分類和它的錯誤原因選項會刪掉。</p>', '刪除', true)) {
        settings.categories = settings.categories.filter((x) => x !== c); await saveSettings('categories'); render();
      }
    };
    $$('.reason-del', block).forEach((b) => {
      b.onclick = async () => {
        const r = c.reasons[+b.dataset.i];
        if (await confirmBox('刪除錯誤原因？', `<p>確定要從「${esc(c.name)}」移除「${esc(r)}」嗎？</p><p class="muted small">已經勾過這個原因的舊題目不會改變。</p>`, '刪除', true)) {
          c.reasons.splice(+b.dataset.i, 1); await saveSettings('categories'); toast('已刪除'); render();
        }
      };
    });
    const add = async () => {
      const input = $('.new-reason', block); const v = input.value.trim();
      if (!v) { toast('請先輸入內容'); return; }
      if (c.reasons.includes(v)) { toast('已經有這個原因了'); return; }
      c.reasons.push(v); await saveSettings('categories'); toast(`已新增「${v}」`); render();
    };
    $('.add-reason', block).onclick = add;
    $('.new-reason', block).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  });
  $('#btnAddCat').onclick = async () => {
    const r = await modal({ title: '新增分類', okText: '新增', html: `
      <label class="field"><span class="field-title">分類名稱</span><input type="text" id="dlgNewCat" placeholder="例如：記憶類"></label>
      <label class="field"><span class="field-title">錯誤原因要從哪裡開始？</span>
        <select id="dlgCopy"><option value="">空白，自己新增</option>${settings.categories.map((c) => `<option value="${esc(c.id)}">複製「${esc(c.name)}」的選項</option>`).join('')}</select></label>` });
    if (!r.ok) return;
    const name = $('#dlgNewCat', r.body).value.trim(); const copy = $('#dlgCopy', r.body).value;
    if (!name) { toast('請輸入分類名稱'); return; }
    settings.categories.push({ id: shortId('cat'), name, reasons: copy ? [...categoryOf(copy).reasons] : [] });
    await saveSettings('categories'); toast(`已新增分類「${name}」`); render();
  };
  $$('.ch-del').forEach((b) => { b.onclick = async () => { settings.chapters[b.dataset.s].splice(+b.dataset.i, 1); await saveSettings('chapters'); render(); }; });
  $$('.src-del').forEach((b) => { b.onclick = async () => { settings.sources.splice(+b.dataset.i, 1); await saveSettings('sources'); render(); }; });
}

/* ---------- 放大看照片 ---------- */
document.addEventListener('click', (e) => {
  const img = e.target.closest('img.zoomable'); if (!img) return;
  $('#viewerImg').src = img.src; $('#viewer').hidden = false;
});
$('#viewerClose').onclick = () => { $('#viewer').hidden = true; };
$('#viewer').onclick = (e) => { if (e.target.id === 'viewer') $('#viewer').hidden = true; };
$('#backBtn').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#home'; };

/* ---------- 啟動 ---------- */
async function start() {
  try {
    await loadSettings();
    const old = (await DB.all()).filter((m) => m.status === 'mastered' || m.relearnCount === undefined);
    if (old.length) await DB.putMany(old.map(normalize));
    if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then((p) => (p ? true : navigator.storage.persist())).catch(() => {});
  } catch (err) {
    console.error(err);
    $('#app').innerHTML = `<div class="card"><h2>無法開啟資料庫</h2><p>${esc(err.message)}</p><p class="muted small">如果你在「無痕模式」，請改用一般模式開啟。</p></div>`;
    return;
  }
  window.addEventListener('hashchange', () => render());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (['home', 'review', ''].includes(parseHash().view)) render();
      maybeAutoCloudBackup();
    }
  });
  window.addEventListener('online', () => { maybeAutoCloudBackup(); if (parseHash().view === 'settings') render(); });
  window.addEventListener('offline', () => { if (parseHash().view === 'settings') render(); });
  if (canSpeak()) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; }
  render();
  setTimeout(() => maybeAutoCloudBackup(), 800);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => console.warn('離線功能啟用失敗', err));
  }
}
start();
