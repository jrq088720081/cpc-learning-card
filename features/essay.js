/* 國文作文練習。預設關閉。關閉只隱藏畫面，不刪 essays，也不刪已寫入的 studySessions。
   每一次「開始→結束」且滿 1 分鐘，各寫一筆 studySessions（id 在按下開始時決定，科目國文、source=essay）。
   暫停後再開始仍是同一筆。同一個計時再按結束或重新整理不會再寫。離開頁面只存計時，不另開一筆。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EssayPractice = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MAX_VERSIONS = 20;
  const MAX_MINUTES = 24 * 60;
  const MAX_CLOCK_MS = MAX_MINUTES * 60 * 1000;
  const DISCLAIMER = '正式考試不考作文，練習時間會計入總學習時數，但不計入國文進度與分數。';

  let editorUnlisten = null;
  let draftTimer = null;
  let timerHandle = null;
  let decorateToken = 0;

  function finite(n) {
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
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
    return (prefix + '-' + Date.now().toString(36) + rnd).slice(0, 40);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function taipeiDate(ms) {
    const Stats = (typeof globalThis !== 'undefined' && globalThis.StudyStats) || null;
    if (Stats && Stats.taipeiDate) return Stats.taipeiDate(ms);
    const d = new Date(Number(ms) + 8 * 60 * 60 * 1000);
    const p = (x) => String(x).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  function formatTaipei(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n + 8 * 60 * 60 * 1000);
    const p = (x) => String(x).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }

  function formatDuration(ms) {
    const n = Math.max(0, Math.floor(Number(ms) || 0));
    const s = Math.floor(n / 1000);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const p = (x) => String(x).padStart(2, '0');
    return p(hh) + ':' + p(mm) + ':' + p(ss);
  }

  function wordCount(body) {
    return String(body || '').replace(/\s/g, '').length;
  }

  function normalizeEnabled(value) {
    return value === true;
  }

  function practiceEntryVisible(enabled) {
    return enabled === true;
  }

  function normalizeClock(raw) {
    const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const phase = c.phase === 'run' || c.phase === 'pause' || c.phase === 'done' ? c.phase : 'idle';
    let elapsedMs = Math.floor(Number(c.elapsedMs));
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) elapsedMs = 0;
    if (elapsedMs > MAX_CLOCK_MS) elapsedMs = MAX_CLOCK_MS;
    let anchorAt = Number(c.anchorAt);
    if (phase !== 'run' || !Number.isFinite(anchorAt)) anchorAt = null;
    const sessionId = c.sessionId ? String(c.sessionId).trim().slice(0, 80) : '';
    let endedAt = Number(c.endedAt);
    if (!Number.isFinite(endedAt) || endedAt <= 0) endedAt = null;
    return {
      phase,
      elapsedMs,
      anchorAt,
      sessionId: sessionId || null,
      sessionWritten: c.sessionWritten === true,
      endedAt: phase === 'done' ? endedAt : null
    };
  }

  function newSessionId(now) {
    let rnd = '';
    try {
      if (globalThis.crypto && crypto.getRandomValues) {
        const buf = new Uint8Array(4);
        crypto.getRandomValues(buf);
        rnd = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* 改用 Math.random */ }
    if (!rnd) rnd = Math.random().toString(16).slice(2, 10);
    const token = Math.floor(Number(now) || Date.now()).toString(36);
    return ('essay-' + token + '-' + rnd).slice(0, 80);
  }

  function clampTotal(n) {
    const x = Math.floor(Number(n));
    if (!Number.isFinite(x) || x < 0) return 0;
    return Math.min(100000, x);
  }

  function normalizeVersions(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    list.forEach((v) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return;
      const at = Number(v.at);
      if (!Number.isFinite(at)) return;
      out.push({ at, body: String(v.body == null ? '' : v.body).slice(0, 200000) });
    });
    out.sort((a, b) => a.at - b.at || 0);
    return out.slice(-MAX_VERSIONS);
  }

  function clampMinutes(n) {
    const x = Math.floor(Number(n));
    if (!Number.isFinite(x) || x < 0) return 0;
    return Math.min(MAX_MINUTES, x);
  }

  function normalizeEssay(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = String(raw.id || '').trim().slice(0, 80);
    if (!id) return null;
    return {
      id,
      title: String(raw.title || '').slice(0, 120),
      prompt: String(raw.prompt == null ? '' : raw.prompt).slice(0, 4000),
      body: String(raw.body == null ? '' : raw.body).slice(0, 200000),
      status: raw.status === 'done' ? 'done' : 'draft',
      versions: normalizeVersions(raw.versions),
      totalMinutes: clampTotal(raw.totalMinutes),
      clock: normalizeClock(raw.clock),
      createdAt: finite(raw.createdAt),
      updatedAt: finite(raw.updatedAt)
    };
  }

  function createEssay(input) {
    const now = finite(input && input.now) || Date.now();
    return normalizeEssay({
      id: input && input.id,
      title: input && input.title || '',
      prompt: input && input.prompt || '',
      body: input && input.body || '',
      status: 'draft',
      versions: [],
      totalMinutes: 0,
      clock: { phase: 'idle', elapsedMs: 0, anchorAt: null, sessionId: null, sessionWritten: false, endedAt: null },
      createdAt: input && input.createdAt || now,
      updatedAt: now
    });
  }

  function mergeEssays(local, incoming) {
    const map = new Map();
    const take = (raw) => {
      const n = normalizeEssay(raw);
      if (!n) return;
      const old = map.get(n.id);
      if (!old || (n.updatedAt || 0) > (old.updatedAt || 0)) map.set(n.id, n);
    };
    (local || []).forEach(take);
    (incoming || []).forEach(take);
    return [...map.values()];
  }

  function essaysFromBackup(local, data) {
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'essays') || !Array.isArray(data.essays)) {
      return (local || []).map(normalizeEssay).filter(Boolean);
    }
    return mergeEssays(local, data.essays);
  }

  /** 關開關只改顯示旗標。essays 原樣返回，removed 永遠是 0。 */
  function setEnabled(currentEnabled, essays, next) {
    return {
      enabled: normalizeEnabled(next),
      essays: (essays || []).map(normalizeEssay).filter(Boolean),
      removed: 0,
      wasEnabled: normalizeEnabled(currentEnabled)
    };
  }

  function elapsedMs(essay, now) {
    const base = normalizeEssay(essay);
    if (!base) return 0;
    const c = base.clock;
    if (c.phase === 'run' && c.anchorAt != null) {
      const extra = Math.max(0, Number(now) - c.anchorAt);
      return Math.min(MAX_CLOCK_MS, c.elapsedMs + extra);
    }
    return c.elapsedMs;
  }

  function withClock(essay, clock, now, extra) {
    return normalizeEssay(Object.assign({}, essay, extra || {}, {
      clock,
      updatedAt: now
    }));
  }

  function blankClock(now) {
    return {
      phase: 'run',
      elapsedMs: 0,
      anchorAt: now,
      sessionId: newSessionId(now),
      sessionWritten: false,
      endedAt: null
    };
  }

  function startClock(essay, now) {
    const base = normalizeEssay(essay);
    if (!base) return null;
    const clock = base.clock;
    if (clock.phase === 'run') {
      if (clock.sessionId) return base;
      return withClock(base, Object.assign({}, clock, { sessionId: newSessionId(now) }), now);
    }
    if (clock.phase === 'pause' && !clock.sessionWritten) {
      return withClock(base, {
        phase: 'run',
        elapsedMs: clock.elapsedMs,
        anchorAt: now,
        sessionId: clock.sessionId || newSessionId(now),
        sessionWritten: false,
        endedAt: null
      }, now);
    }
    return withClock(base, blankClock(now), now);
  }

  function pauseClock(essay, now) {
    const base = normalizeEssay(essay);
    if (!base) return null;
    const ms = elapsedMs(base, now);
    return withClock(base, {
      phase: 'pause',
      elapsedMs: ms,
      anchorAt: null,
      sessionId: base.clock.sessionId,
      sessionWritten: base.clock.sessionWritten,
      endedAt: null
    }, now);
  }

  function segmentMinutes(elapsed) {
    return Math.min(MAX_MINUTES, Math.floor((Number(elapsed) || 0) / 60000));
  }

  function sessionRecord(sessionId, endedAt, elapsedMs) {
    const minutes = segmentMinutes(elapsedMs);
    if (!sessionId || minutes < 1) return null;
    return {
      id: sessionId,
      date: taipeiDate(endedAt),
      startAt: endedAt - elapsedMs,
      endAt: endedAt,
      minutes,
      subject: 'zh',
      chapterId: null,
      source: 'essay',
      updatedAt: endedAt
    };
  }

  /** 已按結束、滿 1 分鐘、這一個計時還沒標成寫入。用來在離開頁面或重開時補寫，id 不變。 */
  function pendingSession(essay) {
    const base = normalizeEssay(essay);
    if (!base || base.clock.sessionWritten || base.clock.phase !== 'done' || !base.clock.sessionId) return null;
    const endedAt = base.clock.endedAt || base.updatedAt;
    if (!endedAt) return null;
    return sessionRecord(base.clock.sessionId, endedAt, base.clock.elapsedMs);
  }

  /**
   * 結束這一次計時。滿 1 分鐘就回傳一筆新的 session（id 是這次開始時的 sessionId）。
   * 同一個計時再結束，session 為 null。下一次按下開始才會換新 id。
   */
  function finishEssay(essay, now) {
    const base = normalizeEssay(essay);
    if (!base) return { essay: null, session: null };
    if (base.clock.phase === 'idle' && !base.clock.sessionId) return { essay: base, session: null };
    if (base.clock.sessionWritten && base.clock.phase === 'done') return { essay: base, session: null };
    const alreadyDone = base.clock.phase === 'done';
    const ms = alreadyDone ? base.clock.elapsedMs : elapsedMs(base, now);
    const endedAt = alreadyDone && base.clock.endedAt ? base.clock.endedAt : now;
    const sessionId = base.clock.sessionId || newSessionId(endedAt);
    const minutes = segmentMinutes(ms);
    const write = !base.clock.sessionWritten && minutes >= 1;
    const next = withClock(base, {
      phase: 'done',
      elapsedMs: ms,
      anchorAt: null,
      sessionId,
      sessionWritten: base.clock.sessionWritten || write,
      endedAt
    }, now, {
      status: 'done',
      totalMinutes: write ? clampTotal(base.totalMinutes + minutes) : base.totalMinutes
    });
    if (!write) return { essay: next, session: null };
    return { essay: next, session: sessionRecord(sessionId, endedAt, ms) };
  }

  function markSessionWritten(essay, now) {
    const base = normalizeEssay(essay);
    if (!base || base.clock.sessionWritten) return base;
    const minutes = segmentMinutes(base.clock.elapsedMs);
    if (base.clock.phase !== 'done' || minutes < 1 || !base.clock.sessionId) return base;
    return withClock(base, Object.assign({}, base.clock, { sessionWritten: true }), now || base.clock.endedAt || base.updatedAt, {
      status: 'done',
      totalMinutes: clampTotal(base.totalMinutes + minutes)
    });
  }

  function saveVersion(essay, now) {
    const base = normalizeEssay(essay);
    if (!base) return null;
    const versions = base.versions.slice();
    const last = versions[versions.length - 1];
    if (!last || last.body !== base.body) versions.push({ at: now, body: base.body });
    while (versions.length > MAX_VERSIONS) versions.shift();
    return normalizeEssay(Object.assign({}, base, { versions, updatedAt: now }));
  }

  function restoreVersion(essay, at, now) {
    const base = normalizeEssay(essay);
    if (!base) return null;
    const hit = base.versions.find((v) => v.at === at);
    if (!hit) return base;
    const kept = hit.body;
    const snapped = saveVersion(base, now) || base;
    return normalizeEssay(Object.assign({}, snapped, { body: kept, updatedAt: now + 1 }));
  }

  function setStatus(essay, status, now) {
    const base = normalizeEssay(essay);
    if (!base) return null;
    return normalizeEssay(Object.assign({}, base, { status: status === 'done' ? 'done' : 'draft', updatedAt: now }));
  }

  function sortEssays(list) {
    return (list || []).map(normalizeEssay).filter(Boolean).sort((a, b) => (b.updatedAt - a.updatedAt) || (b.createdAt - a.createdAt) || a.id.localeCompare(b.id));
  }

  function db() {
    return (typeof globalThis !== 'undefined' && globalThis.StudyDB) || null;
  }

  function isOn() {
    const s = (typeof window !== 'undefined' && window.settings) || null;
    return !!(s && s.essayEnabled === true);
  }

  function stashKey(id) { return 'cpc-essay-draft-' + id; }

  function stashEssay(essay) {
    try {
      sessionStorage.setItem(stashKey(essay.id), JSON.stringify({
        id: essay.id, title: essay.title, prompt: essay.prompt, body: essay.body, updatedAt: essay.updatedAt
      }));
    } catch (e) {}
  }

  function readStash(id) {
    try {
      const raw = sessionStorage.getItem(stashKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearStash(id) {
    try { sessionStorage.removeItem(stashKey(id)); } catch (e) {}
  }

  function clearTimer() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
  }

  function clearHooks() {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = null;
    clearTimer();
    if (editorUnlisten) editorUnlisten();
    editorUnlisten = null;
  }

  function statusLabel(status) {
    return status === 'done' ? '完成' : '草稿';
  }

  function listMarkup(rows) {
    if (!rows.length) {
      return `<div class="empty"><h2>還沒有作文</h2><p class="muted">先建立一題，再開始寫。寫到一半會自動留著。</p></div>`;
    }
    return rows.map((e) => {
      const title = e.title.trim() || '未命題目';
      const when = formatTaipei(e.updatedAt);
      return `<a class="item essay-item" href="#learn-zh/essay/${esc(encodeURIComponent(e.id))}">
        <div class="item-body">
          <div class="item-title">${esc(title)}</div>
          <div class="item-sub">${esc(preview(e.body) || '還沒有內文')}</div>
          <div class="item-tags"><span class="tag">${statusLabel(e.status)}</span><span class="tag">字數 ${wordCount(e.body)}</span>${e.totalMinutes ? `<span class="tag">已記 ${e.totalMinutes} 分鐘</span>` : ''}${when ? `<span class="tag">${esc(when)}</span>` : ''}</div>
        </div><span class="chev">›</span></a>`;
    }).join('');
  }

  function preview(body) {
    const lines = String(body || '').split(/\n/).map((s) => s.trim()).filter(Boolean);
    return lines.slice(0, 2).join(' ').slice(0, 80);
  }

  async function loadSorted() {
    const store = db();
    if (!store || !store.allEssays) return [];
    try { return sortEssays(await store.allEssays()); } catch (e) { return []; }
  }

  async function decorate(app) {
    if (!app) return;
    const token = ++decorateToken;
    if (!isOn()) {
      const old = app.querySelector('#essayBlock');
      if (old) old.remove();
      return;
    }
    const rows = await loadSorted();
    if (token !== decorateToken || !app.isConnected) return;
    let box = app.querySelector('#essayBlock');
    if (!box) {
      box = document.createElement('section');
      box.id = 'essayBlock';
      box.className = 'card essay-block';
      app.appendChild(box);
    }
    box.innerHTML = `
      <h2>作文練習</h2>
      <p class="muted small">${esc(DISCLAIMER)}</p>
      <div class="essay-list">${listMarkup(rows)}</div>
      <a class="btn btn-primary" href="#learn-zh/essay/new">建立題目</a>`;
  }

  async function mount(app, parts) {
    clearHooks();
    parts = parts || [];
    if (!isOn()) {
      app.innerHTML = '';
      location.replace('#learn-zh');
      return;
    }
    if (parts[0] === 'new') {
      location.replace('#learn-zh/essay/' + encodeURIComponent(newId('es')));
      return;
    }
    if (parts[0]) return mountEditor(app, parts[0]);
    return mountList(app);
  }

  async function mountList(app) {
    const rows = await loadSorted();
    const top = typeof zhTop === 'function' ? zhTop('essay') : '';
    app.innerHTML = `
      ${top}
      <section class="card essay-block" id="essayBlock">
        <h2>作文練習</h2>
        <p class="muted small">${esc(DISCLAIMER)}</p>
        <div class="essay-list">${listMarkup(rows)}</div>
        <a class="btn btn-primary" href="#learn-zh/essay/new">建立題目</a>
      </section>`;
  }

  async function mountEditor(app, id) {
    const store = db();
    let loaded = null;
    try { loaded = store ? await store.getEssay(id) : null; } catch (e) { loaded = null; }
    let essay = normalizeEssay(loaded);
    if (!essay) {
      essay = createEssay({ id, now: Date.now(), createdAt: Date.now() });
      essay.updatedAt = 0;
    }
    const stash = readStash(id);
    if (stash && (stash.updatedAt || 0) > (essay.updatedAt || 0)) {
      essay = normalizeEssay(Object.assign({}, essay, {
        title: stash.title, prompt: stash.prompt, body: stash.body, updatedAt: stash.updatedAt
      })) || essay;
    }
    let existed = !!loaded;
    const top = typeof zhTop === 'function' ? zhTop('essay') : '';
    app.innerHTML = `
      ${top}
      <form id="essayForm" class="essay-editor" autocomplete="off">
        <section class="card">
          <p class="muted small">${esc(DISCLAIMER)}</p>
          <label class="field"><span class="field-title">題目</span>
            <input type="text" id="essayTitle" maxlength="120" placeholder="例如：雨後的街道" value="${esc(essay.title)}">
          </label>
          <label class="field"><span class="field-title">題目說明 <small>可空</small></span>
            <textarea id="essayPrompt" rows="3" placeholder="想練的方向、限制或材料">${esc(essay.prompt)}</textarea>
          </label>
          <div class="essay-status-row">
            <span class="tag" id="essayStatus">${statusLabel(essay.status)}</span>
            <span id="essayCount"></span>
          </div>
        </section>
        <section class="card">
          <div class="essay-clock-row">
            <p class="essay-clock" id="essayClock" aria-live="polite">${formatDuration(elapsedMs(essay, Date.now()))}</p>
            <p class="hint" id="essayClockHint"></p>
          </div>
          <div class="timer-row">
            <button type="button" class="btn btn-primary" id="essayStart">開始</button>
            <button type="button" class="btn btn-soft" id="essayPause">暫停</button>
            <button type="button" class="btn btn-soft" id="essayEnd">結束</button>
          </div>
        </section>
        <section class="card">
          <label class="field"><span class="field-title">內容</span>
            <textarea id="essayBody" rows="12" placeholder="在這裡寫。輸入時會自動留下草稿。">${esc(essay.body)}</textarea>
          </label>
          <p class="hint">自動儲存不會另存一版。按「儲存這一版」才會留下可還原的修改紀錄，最多 20 版。</p>
        </section>
        <section class="card">
          <h3>修改紀錄</h3>
          <div id="essayVersions"></div>
        </section>
        <button type="submit" class="btn btn-primary" id="essaySave">儲存這一版</button>
        <button type="button" class="btn btn-soft" id="essayStatusBtn"></button>
        <a class="btn btn-soft" href="#learn-zh/essay">回作文列表</a>
        <button type="button" class="btn btn-text-bad" id="essayDelete"${existed ? '' : ' hidden'}>刪除這篇作文</button>
      </form>`;

    const readFields = () => {
      const title = document.getElementById('essayTitle');
      if (!title) return false;
      essay.title = title.value;
      essay.prompt = document.getElementById('essayPrompt').value;
      essay.body = document.getElementById('essayBody').value;
      essay = normalizeEssay(essay) || essay;
      return true;
    };
    const paintMeta = () => {
      const status = document.getElementById('essayStatus');
      if (status) status.textContent = statusLabel(essay.status);
      const count = document.getElementById('essayCount');
      if (count) count.textContent = '字數 ' + wordCount(document.getElementById('essayBody').value) + '（不含空白與換行）';
      const clock = document.getElementById('essayClock');
      if (clock) clock.textContent = formatDuration(elapsedMs(essay, Date.now()));
      const hint = document.getElementById('essayClockHint');
      if (hint) {
        if (essay.clock.phase === 'run') hint.textContent = '計時中。重新整理會接著算。';
        else if (essay.clock.phase === 'pause') hint.textContent = '已暫停。時間先停在這裡。';
        else if (essay.clock.phase === 'done') hint.textContent = essay.clock.sessionWritten ? '這一次已記入學習時數。再按開始會另外記一筆。' : '已結束。未滿 1 分鐘，這一次沒有記入。';
        else hint.textContent = '按開始才計時。休息或發呆可以先暫停。';
      }
      const start = document.getElementById('essayStart');
      const pause = document.getElementById('essayPause');
      if (start) start.disabled = essay.clock.phase === 'run';
      if (pause) pause.disabled = essay.clock.phase !== 'run';
      const statusBtn = document.getElementById('essayStatusBtn');
      if (statusBtn) statusBtn.textContent = essay.status === 'done' ? '改回草稿' : '標記完成';
    };
    const renderVersions = () => {
      const box = document.getElementById('essayVersions');
      if (!box) return;
      if (!essay.versions.length) {
        box.innerHTML = '<p class="muted small">還沒有手動存檔。寫一寫，再按「儲存這一版」。</p>';
        return;
      }
      const items = essay.versions.slice().reverse();
      box.innerHTML = items.map((v) => `<div class="essay-ver" data-at="${v.at}">
          <div class="essay-ver-head"><b>${esc(formatTaipei(v.at) || '較早的一版')}</b><span class="muted small">${wordCount(v.body)} 字</span></div>
          <div class="btn-row">
            <button type="button" class="btn btn-soft essay-ver-view">檢視</button>
            <button type="button" class="btn btn-soft essay-ver-restore">還原</button>
          </div>
          <pre class="ver-body" hidden></pre>
        </div>`).join('');
      box.querySelectorAll('.essay-ver').forEach((row) => {
        const at = Number(row.getAttribute('data-at'));
        const hit = essay.versions.find((v) => v.at === at);
        row.querySelector('.essay-ver-view').onclick = () => {
          const pre = row.querySelector('.ver-body');
          pre.hidden = !pre.hidden;
          if (!pre.hidden) pre.textContent = hit ? hit.body : '';
        };
        row.querySelector('.essay-ver-restore').onclick = async () => {
          if (typeof confirmBox === 'function') {
            const ok = await confirmBox('還原這個版本？', '<p>現在的內容會先留成一版，再換成你選的舊版。</p>', '還原');
            if (!ok) return;
          }
          readFields();
          essay = restoreVersion(essay, at, Date.now());
          document.getElementById('essayBody').value = essay.body;
          await persist(true);
          paintMeta();
          renderVersions();
          if (typeof toast === 'function') toast('已還原這個版本');
        };
      });
    };
    async function persist(force) {
      if (!readFields()) return;
      stashEssay(essay);
      const storeNow = db();
      if (!storeNow) return;
      const empty = !essay.title.trim() && !essay.body.trim() && !essay.prompt.trim() && essay.clock.phase === 'idle';
      if (empty && !force) {
        if (existed) {
          await storeNow.deleteEssay(essay.id);
          existed = false;
          clearStash(essay.id);
        }
        return;
      }
      if (!essay.updatedAt) essay.updatedAt = Date.now();
      await storeNow.putEssay(essay);
      existed = true;
      const del = document.getElementById('essayDelete');
      if (del) del.hidden = false;
    }
    function touch() {
      if (!readFields()) return;
      essay.updatedAt = Date.now();
      stashEssay(essay);
      paintMeta();
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(() => { persist(false).catch((e) => console.error(e)); }, 250);
    }
    function armTimer() {
      clearTimer();
      const tick = () => {
        const el = document.getElementById('essayClock');
        if (!el) { clearTimer(); return; }
        el.textContent = formatDuration(elapsedMs(essay, Date.now()));
      };
      tick();
      if (essay.clock.phase === 'run') timerHandle = setInterval(tick, 1000);
    }
    let committing = false;
    async function commitEnded(now) {
      if (committing) return null;
      committing = true;
      try {
        readFields();
        const prevTotal = essay.totalMinutes;
        const result = finishEssay(essay, now);
        const store = db();
        const writePromise = result.session && store && store.putSessionOnce ? store.putSessionOnce(result.session) : null;
        if (result.session && store && store.putEssay) {
          const recoverable = normalizeEssay(Object.assign({}, result.essay, {
            totalMinutes: prevTotal,
            clock: Object.assign({}, result.essay.clock, { sessionWritten: false })
          }));
          store.putEssay(recoverable);
        }
        essay = result.essay;
        stashEssay(essay);
        if (writePromise) await writePromise;
        if (store && store.putEssay) await store.putEssay(essay);
        existed = true;
        return result;
      } finally {
        committing = false;
      }
    }
    async function recoverPending() {
      const session = pendingSession(essay);
      if (!session) return;
      const store = db();
      if (!store || !store.putSessionOnce) {
        essay = markSessionWritten(essay, session.endAt);
        return;
      }
      await store.putSessionOnce(session);
      essay = markSessionWritten(essay, session.endAt);
      if (store.putEssay) await store.putEssay(essay);
      existed = true;
    }
    function armHooks() {
      const onLeave = () => {
        if (!readFields()) return;
        essay.updatedAt = Date.now();
        stashEssay(essay);
        const session = pendingSession(essay);
        const store = db();
        if (session && store && store.putSessionOnce) {
          store.putSessionOnce(session).then(() => {
            essay = markSessionWritten(essay, session.endAt);
            return store.putEssay(essay);
          }).catch((e) => console.error(e));
        }
        persist(essay.clock.phase !== 'idle').catch((e) => console.error(e));
      };
      const onHash = () => { onLeave(); clearHooks(); };
      const onHide = () => { if (document.visibilityState === 'hidden') onLeave(); };
      window.addEventListener('hashchange', onHash, true);
      window.addEventListener('pagehide', onLeave);
      document.addEventListener('visibilitychange', onHide);
      editorUnlisten = () => {
        window.removeEventListener('hashchange', onHash, true);
        window.removeEventListener('pagehide', onLeave);
        document.removeEventListener('visibilitychange', onHide);
      };
    }
    async function putClock(next) {
      if (draftTimer) clearTimeout(draftTimer);
      readFields();
      essay = next;
      essay.updatedAt = Date.now();
      stashEssay(essay);
      if (db()) await db().putEssay(essay);
      existed = true;
      paintMeta();
      armTimer();
    }

    await recoverPending();
    paintMeta();
    renderVersions();
    armTimer();
    armHooks();
    document.getElementById('essayTitle').addEventListener('input', touch);
    document.getElementById('essayPrompt').addEventListener('input', touch);
    document.getElementById('essayBody').addEventListener('input', touch);
    document.getElementById('essayStart').onclick = async () => {
      if (pendingSession(essay)) await recoverPending();
      await putClock(startClock(essay, Date.now()));
      if (typeof toast === 'function') toast('開始計時');
    };
    document.getElementById('essayPause').onclick = async () => {
      if (essay.clock.phase !== 'run') return;
      await putClock(pauseClock(essay, Date.now()));
      if (typeof toast === 'function') toast('已暫停');
    };
    document.getElementById('essayEnd').onclick = async () => {
      if (draftTimer) clearTimeout(draftTimer);
      const before = essay.clock.sessionId;
      const result = await commitEnded(Date.now());
      paintMeta();
      armTimer();
      if (typeof toast !== 'function' || !result) return;
      if (result.session) toast('已記下 ' + result.session.minutes + ' 分鐘，計入總學習時數');
      else if (essay.clock.sessionWritten && essay.clock.sessionId === before) toast('這一次已經記過。再按開始會另外記一筆');
      else toast('已結束。未滿 1 分鐘，這一次沒有記入');
    };
    document.getElementById('essayForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (draftTimer) clearTimeout(draftTimer);
      readFields();
      essay = saveVersion(essay, Date.now());
      await persist(true);
      renderVersions();
      if (typeof toast === 'function') toast(essay.versions.length ? '已儲存這一版' : '已儲存');
    });
    document.getElementById('essayStatusBtn').onclick = async () => {
      readFields();
      essay = setStatus(essay, essay.status === 'done' ? 'draft' : 'done', Date.now());
      await persist(true);
      paintMeta();
      if (typeof toast === 'function') toast(essay.status === 'done' ? '已標記完成' : '已改回草稿');
    };
    const delBtn = document.getElementById('essayDelete');
    if (delBtn) delBtn.onclick = async () => {
      if (typeof confirmBox !== 'function') return;
      const ok = await confirmBox('刪除這篇作文？', '<p>作文內容會從這台裝置移除。已經記入的學習時數會留下。</p>', '刪除', true);
      if (!ok) return;
      clearHooks();
      clearStash(essay.id);
      if (db()) await db().deleteEssay(essay.id);
      if (typeof toast === 'function') toast('已刪除作文');
      location.hash = '#learn-zh/essay';
    };
  }

  return {
    MAX_VERSIONS, DISCLAIMER,
    normalizeEnabled, practiceEntryVisible, normalizeEssay, createEssay,
    mergeEssays, essaysFromBackup, setEnabled,
    elapsedMs, startClock, pauseClock, finishEssay, pendingSession, markSessionWritten, saveVersion, restoreVersion, setStatus,
    wordCount, formatDuration, formatTaipei, sortEssays,
    decorate, mount
  };
});
