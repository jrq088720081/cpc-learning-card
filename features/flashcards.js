/* 翻卡複習。不複製單字庫、公式庫。只有使用者按「加入複習」或新增自訂卡才寫一筆 flashcards。
   正面是單字或公式名稱；背面再去靜態庫查詞性、中文、例句、式子。間隔沿用艾賓浩斯 [1, 2, 4, 7, 15, 30]。
   會升一階，模糊留在原階，不會回到第一階。天數用結果那一階，從今天重算，所以同一張不會在同一輪連續出現。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Flashcards = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const INTERVALS = Object.freeze([1, 2, 4, 7, 15, 30]);
  const REF_TYPES = ['vocab', 'formula', 'custom'];
  const GRADES = { know: '會', fuzzy: '模糊', miss: '不會' };
  const POS_LONG = {
    'n.': '名詞', 'v.': '動詞', 'adj.': '形容詞', 'adv.': '副詞', 'prep.': '介系詞',
    'conj.': '連接詞', 'pron.': '代名詞', 'interj.': '感嘆詞', 'num.': '數詞'
  };
  const FORMULA_SUBJECT = { ee: '電工原理', em: '電工機械', math: '數學' };

  let addBound = false;
  let quizCache = null;
  let bankCache = null;
  let tally = null;

  function finite(n) {
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function addDays(dateStr, n) {
    const Stats = (typeof globalThis !== 'undefined' && globalThis.StudyStats) || null;
    if (Stats && Stats.addDays) return Stats.addDays(dateStr, n);
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + Number(n)));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }

  function taipeiToday(now) {
    const Stats = (typeof globalThis !== 'undefined' && globalThis.StudyStats) || null;
    const ms = now == null ? Date.now() : now;
    if (Stats && Stats.taipeiDate) return Stats.taipeiDate(ms);
    const d = new Date(Number(ms) + 8 * 60 * 60 * 1000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function newId(prefix) {
    let rnd = '';
    try {
      if (globalThis.crypto && crypto.getRandomValues) {
        const buf = new Uint8Array(6);
        crypto.getRandomValues(buf);
        rnd = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* 改用 Math.random */ }
    if (!rnd) rnd = Math.random().toString(16).slice(2, 14);
    return (prefix + '-' + Date.now().toString(36) + rnd).slice(0, 80);
  }

  function refCardId(refType, refId) {
    return ('fc-' + refType + '-' + String(refId || '')).slice(0, 80);
  }

  function clampStage(stage) {
    const n = Math.floor(Number(stage));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, INTERVALS.length - 1);
  }

  function nextStage(stage, grade) {
    const st = clampStage(stage);
    if (grade === 'know') return Math.min(st + 1, INTERVALS.length - 1);
    if (grade === 'fuzzy') return st;
    if (grade === 'miss') return 0;
    return st;
  }

  function schedule(stage, grade, today) {
    const next = nextStage(stage, grade);
    const days = INTERVALS[next];
    return { stage: next, days, nextDue: addDays(today, days) };
  }

  function normalizeHistory(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    list.forEach((h) => {
      if (!h || typeof h !== 'object') return;
      const date = String(h.date || '');
      const result = h.result === 'know' || h.result === 'fuzzy' || h.result === 'miss' ? h.result : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !result) return;
      out.push({ date, result, stage: clampStage(h.stage) });
    });
    return out.slice(-400);
  }

  function normalizeCard(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = String(raw.id || '').trim().slice(0, 80);
    if (!id) return null;
    const refType = REF_TYPES.includes(raw.refType) ? raw.refType : '';
    if (!refType) return null;
    const refId = raw.refId ? String(raw.refId).trim().slice(0, 120) : '';
    if (refType !== 'custom' && !refId) return null;
    let front = null;
    let back = null;
    if (refType === 'custom') {
      front = String(raw.front || '').trim().slice(0, 500);
      back = String(raw.back || '').trim().slice(0, 2000);
      if (!front || !back) return null;
    }
    const nextDue = String(raw.nextDue || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) return null;
    return {
      id,
      refType,
      refId: refType === 'custom' ? (refId || null) : refId,
      front,
      back,
      stage: clampStage(raw.stage),
      nextDue,
      history: normalizeHistory(raw.history),
      createdAt: finite(raw.createdAt),
      updatedAt: finite(raw.updatedAt)
    };
  }

  function createRefCard({ refType, refId, today, now, id }) {
    if (refType !== 'vocab' && refType !== 'formula') return null;
    const key = String(refId || '').trim();
    if (!key || !today) return null;
    return normalizeCard({
      id: id || refCardId(refType, key),
      refType,
      refId: key,
      front: null,
      back: null,
      stage: 0,
      nextDue: today,
      history: [],
      createdAt: finite(now),
      updatedAt: finite(now)
    });
  }

  function createCustom({ front, back, today, now, id }) {
    return normalizeCard({
      id: id || newId('fc'),
      refType: 'custom',
      refId: null,
      front,
      back,
      stage: 0,
      nextDue: today,
      history: [],
      createdAt: finite(now),
      updatedAt: finite(now)
    });
  }

  function applyGrade(card, grade, today, now) {
    const cur = normalizeCard(card);
    if (!cur || !GRADES[grade] || !/^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))) return null;
    const plan = schedule(cur.stage, grade, today);
    const history = cur.history.concat([{ date: today, result: grade, stage: cur.stage }]).slice(-400);
    return normalizeCard(Object.assign({}, cur, {
      stage: plan.stage,
      nextDue: plan.nextDue,
      history,
      updatedAt: finite(now) || cur.updatedAt
    }));
  }

  function isDue(card, today) {
    const c = normalizeCard(card);
    if (!c || !today) return false;
    return c.nextDue <= today;
  }

  function dueCards(list, today, refType) {
    return (list || []).map(normalizeCard).filter(Boolean).filter((c) => {
      if (refType && c.refType !== refType) return false;
      return c.nextDue <= today;
    }).sort((a, b) => a.nextDue.localeCompare(b.nextDue) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  function dueCount(list, today) {
    return dueCards(list, today).length;
  }

  function mergeCards(local, incoming) {
    const map = new Map();
    const take = (raw) => {
      const n = normalizeCard(raw);
      if (!n) return;
      const old = map.get(n.id);
      if (!old || (n.updatedAt || 0) > (old.updatedAt || 0)) map.set(n.id, n);
    };
    (local || []).forEach(take);
    (incoming || []).forEach(take);
    return [...map.values()];
  }

  function cardsFromBackup(local, data) {
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'flashcards') || !Array.isArray(data.flashcards)) {
      return (local || []).map(normalizeCard).filter(Boolean);
    }
    return mergeCards(local, data.flashcards);
  }

  function formulaSymbols(tex) {
    const stripped = String(tex || '').replace(/\\[a-zA-Z]+/g, ' ');
    const found = stripped.match(/[A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?/g) || [];
    const out = [];
    found.forEach((tok) => {
      const norm = tok.replace(/[{}]/g, '');
      if (norm && !out.includes(norm)) out.push(norm);
    });
    return out;
  }

  function choiceBody(choice, letter) {
    return String(choice || '').replace(new RegExp('^\\s*' + letter + '\\s*[.．、)\\]]\\s*', 'i'), '').trim();
  }

  function wordRe(word) {
    const safe = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^A-Za-z])' + safe + '([^A-Za-z]|$)', 'i');
  }

  /** 例句從這個字的考古出處抽出。庫裡沒有獨立例句欄時不另編。 */
  function vocabExample(item, byId) {
    const word = String((item && (item.w || item.word)) || '').trim();
    if (!word || !byId) return null;
    const re = wordRe(word);
    const src = (item && item.src) || [];
    let fallback = null;
    for (let i = 0; i < src.length; i++) {
      const id = src[i] && src[i].id;
      const q = byId.get ? byId.get(id) : byId[id];
      if (!q) continue;
      const letter = String(q.answer || '').trim();
      const hit = (q.choices || []).find((c) => new RegExp('^\\s*' + letter + '\\b', 'i').test(String(c)));
      const body = hit ? choiceBody(hit, letter) : '';
      const stem = String(q.stem || '').trim();
      const zh = String(q.translation || '').trim();
      const blank = /_{2,}|＿{2,}/;
      if (body && re.test(body) && blank.test(stem)) return { en: stem.replace(blank, body), zh };
      if (re.test(stem) && !blank.test(stem)) return { en: stem, zh };
      if (!fallback && re.test(stem)) fallback = { en: stem, zh };
      else if (!fallback && re.test(String(q.explain || ''))) {
        const line = String(q.explain).split('\n').map((ln) => ln.trim()).find((ln) => re.test(ln) && /[A-Za-z]/.test(ln) && ln.length < 180);
        if (line) fallback = { en: line, zh };
      }
    }
    return fallback;
  }

  function presentCard(card, catalogs) {
    const c = normalizeCard(card);
    if (!c) return null;
    const cat = catalogs || {};
    if (c.refType === 'custom') {
      return { refType: 'custom', missing: false, front: c.front, backText: c.back };
    }
    if (c.refType === 'vocab') {
      const item = (cat.vocab || []).find((w) => w && w.id === c.refId);
      if (!item) return { refType: 'vocab', missing: true, front: '找不到這個單字', refId: c.refId };
      return {
        refType: 'vocab',
        missing: false,
        front: item.w || '',
        pos: item.pos || '',
        posLong: POS_LONG[item.pos] || item.pos || '',
        zh: item.zh || '',
        kk: item.kk || '',
        speak: item.w || '',
        example: vocabExample(item, cat.questions || new Map())
      };
    }
    const formula = (cat.formulas || []).find((f) => f && f.id === c.refId);
    if (!formula) return { refType: 'formula', missing: true, front: '找不到這條公式', refId: c.refId };
    return {
      refType: 'formula',
      missing: false,
      front: formula.name || '',
      tex: formula.tex || '',
      symbols: formulaSymbols(formula.tex),
      condition: formula.blurb || '',
      explain: formula.plain || '',
      subject: formula.subject || '',
      subjectName: FORMULA_SUBJECT[formula.subject] || '',
      questionIds: Array.isArray(formula.questionIds) ? formula.questionIds.slice() : []
    };
  }

  function dbApi() {
    const api = (typeof globalThis !== 'undefined' && globalThis.StudyDB) || null;
    if (!api || !api.allFlashcards) throw new Error('資料庫尚未接上');
    return api;
  }

  function quizMap() {
    if (quizCache) return quizCache;
    quizCache = new Map();
    const q = (typeof window !== 'undefined' && window.__EN_QUIZ__) || null;
    if (!q) return quizCache;
    Object.keys(q).forEach((k) => {
      const arr = q[k];
      if (!Array.isArray(arr)) return;
      arr.forEach((item) => { if (item && item.id && !quizCache.has(item.id)) quizCache.set(item.id, item); });
    });
    return quizCache;
  }

  function bankQuestion(id) {
    if (!bankCache) {
      bankCache = new Map();
      const bank = (typeof window !== 'undefined' && window.__EXAM_BANK__) || {};
      (bank.questions || []).forEach((q) => { if (q && q.id && !bankCache.has(q.id)) bankCache.set(q.id, q); });
    }
    return bankCache.get(id) || null;
  }

  function liveCatalogs() {
    const vocabBank = (typeof window !== 'undefined' && window.__EN_VOCAB__) || {};
    const formulas = (typeof window !== 'undefined' && window.__EXAM_FORMULAS__) || {};
    return {
      vocab: [...(vocabBank.words || []), ...(vocabBank.phrases || [])],
      formulas: formulas.formulas || [],
      questions: quizMap()
    };
  }

  function renderTex(tex) {
    const t = String(tex || '').trim();
    if (!t) return '';
    try {
      if (typeof katex !== 'undefined' && katex.renderToString) {
        return katex.renderToString(t, { throwOnError: false, displayMode: true });
      }
    } catch (e) { /* 改顯示原式 */ }
    return '<span class="flip-tex-raw">' + esc(t) + '</span>';
  }

  function addButtonHtml(refType, refId) {
    return '<button type="button" class="btn btn-soft btn-sm" data-flash-add="' + esc(refType) + '" data-ref="' + esc(refId) + '">加入複習</button>';
  }

  function modeLinkHtml(kind) {
    const href = kind === 'formula' ? '#flash/formula' : '#flash/vocab';
    return '<a class="btn btn-primary btn-sm" href="' + href + '">翻卡複習</a>';
  }

  async function addRef(refType, refId) {
    const api = dbApi();
    const id = refCardId(refType, refId);
    const existing = normalizeCard(await api.getFlashcard(id));
    if (existing) return { created: false, card: existing };
    const card = createRefCard({ refType, refId, today: taipeiToday(), now: Date.now(), id });
    if (!card) throw new Error('這個項目不能加入複習');
    await api.putFlashcard(card);
    return { created: true, card };
  }

  async function onAddClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest('[data-flash-add]') : null;
    if (!btn) return;
    e.preventDefault();
    const refType = btn.getAttribute('data-flash-add');
    const refId = btn.getAttribute('data-ref');
    try {
      const res = await addRef(refType, refId);
      btn.textContent = '已在複習';
      btn.setAttribute('aria-pressed', 'true');
      if (typeof toast === 'function') toast(res.created ? '已加入複習，今天就可以翻' : '這張已經在複習裡');
    } catch (err) {
      if (typeof toast === 'function') toast('沒有寫入：' + (err && err.message ? err.message : '請稍後再試'));
    }
  }

  async function refreshAddLabels(root) {
    const buttons = [...root.querySelectorAll('[data-flash-add]')];
    if (!buttons.length) return;
    let ids = new Set();
    try {
      const rows = await dbApi().allFlashcards();
      ids = new Set((rows || []).map((c) => c && c.id).filter(Boolean));
    } catch (e) { ids = new Set(); }
    buttons.forEach((btn) => {
      const id = refCardId(btn.getAttribute('data-flash-add'), btn.getAttribute('data-ref'));
      const on = ids.has(id);
      btn.textContent = on ? '已在複習' : '加入複習';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function bindAdds(root) {
    if (!root || typeof root.addEventListener !== 'function') return;
    if (!addBound) {
      addBound = true;
      root.addEventListener('click', onAddClick);
    }
    refreshAddLabels(root);
  }

  function kindName(kind) {
    if (kind === 'vocab') return '單字';
    if (kind === 'formula') return '公式';
    if (kind === 'custom') return '自訂卡';
    return '今日';
  }

  function todaySectionHtml(count) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    return '<section class="card today-due flash-today"><h3>待複習卡片 ' + n + ' 張</h3><p class="muted small">'
      + (n ? '點下去直接開始翻卡。單字、公式和自訂卡一起算。' : '今天沒有到期的卡片。到單字庫或公式庫加入後，會出現在這裡。')
      + '</p><a class="btn ' + (n ? 'btn-primary' : 'btn-soft') + '" href="#flash/due">' + (n ? '開始翻卡' : '打開翻卡') + '</a></section>';
  }

  async function mountToday(el) {
    if (!el) return;
    let n = 0;
    try { n = dueCount(await dbApi().allFlashcards(), taipeiToday()); } catch (e) { n = 0; }
    el.innerHTML = todaySectionHtml(n);
  }

  function extraLinks() {
    return '<div class="btn-row flash-links"><a class="btn btn-soft" href="#flash/new">新增自訂卡</a><a class="btn btn-soft" href="#home">回今日</a></div>';
  }

  function emptySessionHtml(kind) {
    const name = kindName(kind);
    const where = kind === 'formula'
      ? '<a class="btn btn-primary" href="#learn-ee/formulas">到公式庫加入</a>'
      : '<a class="btn btn-primary" href="#learn-en/vocab">到單字庫加入</a>';
    return '<section class="card"><h2>' + name + '今天沒有要翻的卡</h2><p class="muted">加入複習的項目才會出現。間隔是 1、2、4、7、15、30 天，還沒到期的不會提前抽出來。</p><div class="btn-row">'
      + where + '<a class="btn btn-soft" href="#flash/new">新增自訂卡</a></div></section>';
  }

  function doneSessionHtml(snapshot) {
    const s = snapshot || { know: 0, fuzzy: 0, miss: 0 };
    return '<section class="card center"><h2>這輪翻完了</h2><p>會 <b class="c-ok">' + s.know + '</b>　模糊 <b>' + s.fuzzy + '</b>　不會 <b class="c-bad">' + s.miss + '</b></p><p class="muted small">下次日期已依 1、2、4、7、15、30 天排好。</p></section>' + extraLinks();
  }

  function questionLinksHtml(face) {
    const ids = (face && face.questionIds) || [];
    if (!ids.length) return '<p class="muted small">這條公式還沒有對上的歷屆題。</p>';
    return '<div class="formula-related">' + ids.map((qid) => {
      const q = bankQuestion(qid);
      const track = (q && q.track === 'em') || face.subject === 'em' ? 'em' : 'ee';
      const label = q ? (q.year + ' 年第 ' + q.qnum + ' 題') : String(qid || '').replace(/^cpc-/, '');
      return '<a class="formula-q" href="#learn-' + track + '/q/' + encodeURIComponent(qid) + '"><b>相關歷屆　' + esc(label) + '</b></a>';
    }).join('') + '</div>';
  }

  function backHtml(face) {
    if (!face || face.missing) {
      return '<p class="muted">庫裡已經找不到這筆，可以移出複習。</p>';
    }
    if (face.refType === 'custom') {
      return '<p class="kicker">背面</p><p class="flip-back-text">' + esc(face.backText) + '</p>';
    }
    if (face.refType === 'vocab') {
      const ex = face.example;
      const example = ex
        ? '<p class="kicker">例句</p><p class="flip-example">' + esc(ex.en) + '</p>' + (ex.zh ? '<p class="muted">' + esc(ex.zh) + '</p>' : '')
        : '<p class="muted small">這筆單字沒有可抽出的例句。</p>';
      return '<p class="flip-word flip-word-back">' + esc(face.front) + '</p>'
        + '<p class="vocab-meta"><span class="tag">' + esc(face.posLong || '詞性') + '</span> ' + esc(face.zh || '') + '</p>'
        + (face.kk ? '<p class="vocab-kk"><span>KK</span> <b>' + esc(face.kk) + '</b></p>' : '')
        + example
        + '<button type="button" class="btn btn-soft" data-speak="' + esc(face.speak || face.front) + '">發音</button>';
    }
    const symbols = (face.symbols || []).length
      ? (face.symbols || []).map(esc).join('、')
      : '式子裡沒有可拆的變數符號';
    return '<p class="kicker">' + esc(face.subjectName || '公式') + '</p><h2>' + esc(face.front) + '</h2>'
      + '<div class="formula-eq">' + renderTex(face.tex) + '</div>'
      + '<p><b>變數</b>　' + symbols + '</p>'
      + '<p><b>適用條件</b>　' + esc(face.condition || '沒有另寫適用條件') + '</p>'
      + (face.explain ? '<p class="muted small">' + esc(face.explain) + '</p>' : '')
      + '<h3>歷屆題</h3>' + questionLinksHtml(face);
  }

  function sessionHtml(card, face, left) {
    const stageNo = card.stage + 1;
    const label = face.refType === 'vocab' ? '單字' : face.refType === 'formula' ? '公式' : '自訂';
    return '<section class="card flip-shell"><p class="kicker">' + label + '　第 ' + stageNo + ' / ' + INTERVALS.length + ' 關</p>'
      + '<p class="muted small">今天還有 ' + left + ' 張。點正面翻開，再選會、模糊或不會。</p>'
      + '<button type="button" class="flip-stage" id="flipShow" aria-pressed="false"><span class="flip-word">' + esc(face.front || '') + '</span><span class="muted small">正面　點一下翻面</span></button>'
      + '<div id="flipAnswer" class="flip-answer" hidden>' + backHtml(face)
      + '<div class="grade-row" role="group" aria-label="記得程度"><button type="button" class="btn btn-bad" data-grade="miss">不會</button><button type="button" class="btn btn-fuzzy" data-grade="fuzzy">模糊</button><button type="button" class="btn btn-ok" data-grade="know">會</button></div>'
      + '<button type="button" class="btn btn-text-bad" id="flashDrop">移出複習</button></div></section>' + extraLinks();
  }

  function speak(text) {
    const t = String(text || '').trim();
    if (!t) return;
    if (typeof speakEnglishQueued === 'function') speakEnglishQueued(t, 1);
    else if (typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'en-US';
      try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch (e) { /* 這台沒有語音 */ }
    } else if (typeof toast === 'function') toast('這台裝置沒有英文發音');
  }

  async function paintSession(app, kind, reset) {
    if (reset) tally = null;
    const title = kind === 'vocab' ? '單字翻卡' : kind === 'formula' ? '公式翻卡' : kind === 'custom' ? '自訂卡' : '今日翻卡';
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = title;
    let rows = [];
    try { rows = await dbApi().allFlashcards(); }
    catch (err) {
      app.innerHTML = '<section class="card"><h2>卡片還沒準備好</h2><p class="muted">' + esc(err.message || '') + '</p></section>';
      return;
    }
    const today = taipeiToday();
    const due = dueCards(rows, today, kind === 'due' ? '' : kind);
    if (!due.length) {
      app.innerHTML = tally ? doneSessionHtml(tally) : emptySessionHtml(kind);
      tally = null;
      return;
    }
    const card = due[0];
    const face = presentCard(card, liveCatalogs());
    app.innerHTML = sessionHtml(card, face, due.length);
    const show = app.querySelector('#flipShow');
    const answer = app.querySelector('#flipAnswer');
    if (show && answer) {
      show.onclick = () => {
        show.hidden = true;
        answer.hidden = false;
        show.setAttribute('aria-pressed', 'true');
      };
    }
    app.querySelectorAll('[data-speak]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        speak(btn.getAttribute('data-speak'));
      });
    });
    app.querySelectorAll('[data-grade]').forEach((btn) => {
      btn.onclick = async () => {
        app.querySelectorAll('[data-grade]').forEach((b) => { b.disabled = true; });
        const grade = btn.getAttribute('data-grade');
        const next = applyGrade(card, grade, today, Date.now());
        if (!next) return;
        try { await dbApi().putFlashcard(next); }
        catch (err) {
          if (typeof toast === 'function') toast('沒有寫入：' + err.message);
          app.querySelectorAll('[data-grade]').forEach((b) => { b.disabled = false; });
          return;
        }
        tally = tally || { know: 0, fuzzy: 0, miss: 0 };
        tally[grade] += 1;
        const plan = schedule(card.stage, grade, today);
        if (typeof toast === 'function') toast(GRADES[grade] + '　' + plan.days + ' 天後再翻');
        paintSession(app, kind, false);
      };
    });
    const drop = app.querySelector('#flashDrop');
    if (drop) {
      drop.onclick = async () => {
        const ok = typeof confirmBox === 'function'
          ? await confirmBox('移出複習', '<p>這張卡會從翻卡清單拿掉，單字庫和公式庫的原文還在。</p>', '移出', true)
          : window.confirm('移出這張卡？');
        if (!ok) return;
        await dbApi().deleteFlashcard(card.id);
        if (typeof toast === 'function') toast('已移出複習');
        paintSession(app, kind, false);
      };
    }
  }

  function paintCustomForm(app) {
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = '新增自訂卡';
    app.innerHTML = '<section class="card"><h2>新增自訂卡</h2><p class="muted small">正面先看到題目，翻面才是答案。存進去之後排進今天的翻卡。</p>'
      + '<form id="customCardForm" autocomplete="off"><label class="field"><span class="field-title">正面</span><textarea id="cardFront" rows="3" maxlength="500" required placeholder="要先想起的那一面"></textarea></label>'
      + '<label class="field"><span class="field-title">背面</span><textarea id="cardBack" rows="4" maxlength="2000" required placeholder="翻開後要看到的答案"></textarea></label>'
      + '<div class="btn-row"><button type="submit" class="btn btn-primary">加入今天的翻卡</button><a class="btn btn-soft" href="#flash/due">取消</a></div></form></section>';
    const form = app.querySelector('#customCardForm');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const card = createCustom({
        front: app.querySelector('#cardFront').value,
        back: app.querySelector('#cardBack').value,
        today: taipeiToday(),
        now: Date.now()
      });
      if (!card) {
        if (typeof toast === 'function') toast('正面和背面都要填');
        return;
      }
      try { await dbApi().putFlashcard(card); }
      catch (err) {
        if (typeof toast === 'function') toast('沒有寫入：' + err.message);
        return;
      }
      if (typeof toast === 'function') toast('已加入今天的翻卡');
      location.hash = '#flash/due';
    };
  }

  async function mount(app, parts) {
    if (!app) return;
    const kind = (parts && parts[0]) || 'due';
    if (kind === 'new') return paintCustomForm(app);
    if (!['due', 'vocab', 'formula', 'custom'].includes(kind)) {
      location.replace('#flash/due');
      return;
    }
    await paintSession(app, kind, true);
  }

  return {
    INTERVALS, GRADES, POS_LONG,
    addDays, taipeiToday, clampStage, nextStage, schedule,
    normalizeCard, createRefCard, createCustom, applyGrade,
    isDue, dueCards, dueCount, mergeCards, cardsFromBackup,
    formulaSymbols, vocabExample, presentCard, refCardId,
    addButtonHtml, modeLinkHtml, todaySectionHtml,
    bindAdds, mountToday, mount, addRef
  };
});
