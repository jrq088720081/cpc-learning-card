/* 番茄鐘：剩餘時間只用現在時間與 endAt 相減，不用每秒遞減的計數器。
   休息不寫入學習時數。專注結束以 sessionId 當 studySessions 的 id，同一次只記一筆。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.Pomo = api;
    root.StudyOS = api.StudyOS;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SUBJECT_IDS = ['zh', 'en', 'ee', 'em', 'math'];
  const ALARMS = ['focus', 'focus-caught-up', 'short', 'long'];
  const ALARM_TEXT = {
    focus: '專注結束，這一輪已記入學習時數。接下來是休息，休息不計時數。',
    'focus-caught-up': '專注結束時沒有即時提醒，已補記時數。休息也過了，可以開始下一輪。',
    short: '短休息結束，可以開始下一輪專注。',
    long: '長休息結束，可以開始下一輪專注。'
  };

  function statsApi() {
    return (typeof globalThis !== 'undefined' && globalThis.StudyStats) || null;
  }

  function clampInt(v, min, max, fallback) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function normalizeSettings(raw) {
    const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      focusMin: clampInt(s.focusMin, 1, 180, 25),
      shortMin: clampInt(s.shortMin, 1, 60, 5),
      longMin: clampInt(s.longMin, 1, 90, 15),
      longEvery: clampInt(s.longEvery, 2, 12, 4),
      notify: s.notify === true || s.notify === 1 || s.notify === '1' || s.notify === 'true'
    };
  }

  function msOr(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1000 || n > 12 * 3600000) return fallback;
    return Math.round(n);
  }

  /** override 只給測試網址用，不會寫進 pomodoroSettings。 */
  function durationsFrom(settings, override) {
    const s = normalizeSettings(settings);
    const o = override || {};
    return {
      focus: msOr(o.focusMs, s.focusMin * 60000),
      short: msOr(o.shortMs, s.shortMin * 60000),
      long: msOr(o.longMs, s.longMin * 60000),
      longEvery: s.longEvery
    };
  }

  function idleState() {
    return {
      id: 'current',
      status: 'idle',
      phase: 'focus',
      endAt: null,
      pausedRemainingMs: null,
      subject: '',
      chapterId: null,
      round: 0,
      sessionId: null,
      startAt: null,
      phaseDurationMs: null,
      pendingAlarm: null,
      alarmToken: null,
      updatedAt: 0
    };
  }

  function numOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeState(raw) {
    const base = idleState();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    const status = raw.status === 'running' || raw.status === 'paused' || raw.status === 'idle' ? raw.status : 'idle';
    const phase = raw.phase === 'short' || raw.phase === 'long' || raw.phase === 'focus' ? raw.phase : 'focus';
    const subject = SUBJECT_IDS.indexOf(raw.subject) >= 0 ? raw.subject : '';
    const pending = ALARMS.indexOf(raw.pendingAlarm) >= 0 ? raw.pendingAlarm : null;
    const state = {
      id: 'current',
      status,
      phase,
      endAt: numOrNull(raw.endAt),
      pausedRemainingMs: numOrNull(raw.pausedRemainingMs),
      subject,
      chapterId: raw.chapterId ? String(raw.chapterId).slice(0, 40) : null,
      round: Math.max(0, clampInt(raw.round, 0, 10000, 0)),
      sessionId: raw.sessionId ? String(raw.sessionId).slice(0, 80) : null,
      startAt: numOrNull(raw.startAt),
      phaseDurationMs: numOrNull(raw.phaseDurationMs),
      pendingAlarm: pending,
      alarmToken: raw.alarmToken ? String(raw.alarmToken).slice(0, 80) : null,
      updatedAt: numOrNull(raw.updatedAt) || 0
    };
    if (state.status === 'running' && state.endAt == null) state.status = 'idle';
    if (state.status === 'paused' && (state.pausedRemainingMs == null || state.pausedRemainingMs < 0)) state.status = 'idle';
    if (state.status === 'idle') {
      state.endAt = null;
      state.pausedRemainingMs = null;
      state.sessionId = null;
      state.phaseDurationMs = null;
      state.phase = 'focus';
    }
    return state;
  }

  /** 計時中：endAt - now。暫停：停住的剩餘毫秒，不隨 now 減少。 */
  function remainingMs(state, now) {
    if (!state || state.status === 'idle') return 0;
    if (state.status === 'paused') return Math.max(0, Number(state.pausedRemainingMs) || 0);
    if (state.status === 'running') return Math.max(0, Number(state.endAt) - Number(now));
    return 0;
  }

  function displayRemainingMs(state, durations, now) {
    if (!state || state.status === 'idle') return (durations && durations.focus) || 0;
    return remainingMs(state, now);
  }

  function formatClock(ms) {
    const n = Number(ms);
    const total = !Number.isFinite(n) || n <= 0 ? 0 : Math.ceil(n / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function minutesFromMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n / 60000);
  }

  function focusedMs(state, now) {
    if (!state || state.phase !== 'focus' || state.status === 'idle') return 0;
    const budget = Number(state.phaseDurationMs) || 0;
    if (budget <= 0) return 0;
    return Math.max(0, Math.min(budget, budget - remainingMs(state, now)));
  }

  function dateOf(ms) {
    const Stats = statsApi();
    if (!Stats) throw new Error('StudyStats 尚未載入');
    return Stats.taipeiDate(ms);
  }

  function copyIdle(from, now, round) {
    return {
      id: 'current',
      status: 'idle',
      phase: 'focus',
      endAt: null,
      pausedRemainingMs: null,
      subject: (from && from.subject) || '',
      chapterId: (from && from.chapterId) || null,
      round: round,
      sessionId: null,
      startAt: null,
      phaseDurationMs: null,
      pendingAlarm: null,
      alarmToken: null,
      updatedAt: now
    };
  }

  function start(state, opts) {
    const base = normalizeState(state);
    if (base.status !== 'idle') return { error: '這一輪還沒結束' };
    const subject = opts && opts.subject;
    if (SUBJECT_IDS.indexOf(subject) < 0) return { error: '請先選科目' };
    const now = Number(opts.now);
    const dur = opts.durations && Number(opts.durations.focus);
    if (!Number.isFinite(now) || !Number.isFinite(dur) || dur <= 0) return { error: '計時長度不正確' };
    const sessionId = String((opts && opts.sessionId) || '').slice(0, 80);
    if (!sessionId) return { error: '缺少這一輪的編號' };
    return {
      state: {
        id: 'current',
        status: 'running',
        phase: 'focus',
        endAt: now + dur,
        pausedRemainingMs: null,
        subject,
        chapterId: opts.chapterId ? String(opts.chapterId).slice(0, 40) : null,
        round: (base.round || 0) + 1,
        sessionId,
        startAt: now,
        phaseDurationMs: dur,
        pendingAlarm: null,
        alarmToken: null,
        updatedAt: now
      }
    };
  }

  function pause(state, now) {
    const base = normalizeState(state);
    if (base.status !== 'running') return { error: '現在沒有在計時' };
    const left = Math.max(0, base.endAt - now);
    return {
      state: Object.assign({}, base, {
        status: 'paused',
        endAt: null,
        pausedRemainingMs: left,
        updatedAt: now
      })
    };
  }

  function resume(state, now) {
    const base = normalizeState(state);
    if (base.status !== 'paused') return { error: '現在不是暫停' };
    const left = Math.max(0, base.pausedRemainingMs || 0);
    return {
      state: Object.assign({}, base, {
        status: 'running',
        pausedRemainingMs: null,
        endAt: now + left,
        updatedAt: now
      })
    };
  }

  function skipBreak(state, now) {
    const base = normalizeState(state);
    if (base.status === 'idle' || base.phase === 'focus') return { error: '現在不是休息' };
    return { state: copyIdle(base, now, base.round || 0) };
  }

  function resetPlan(state, now) {
    const base = normalizeState(state);
    if (base.status === 'idle' || base.phase !== 'focus') return { needsConfirm: false, minutes: 0 };
    const ms = focusedMs(base, now);
    const minutes = minutesFromMs(ms);
    return { needsConfirm: ms >= 60000 && minutes >= 1, minutes, focusedMs: ms };
  }

  function partialSession(state, now) {
    const base = normalizeState(state);
    if (base.phase !== 'focus' || !base.sessionId) return null;
    const ms = focusedMs(base, now);
    const minutes = minutesFromMs(ms);
    if (minutes < 1) return null;
    const startAt = base.startAt || now;
    return {
      id: base.sessionId,
      date: dateOf(startAt),
      startAt,
      endAt: now,
      minutes,
      subject: base.subject,
      chapterId: base.chapterId || null,
      source: 'pomodoro',
      updatedAt: now
    };
  }

  /** keepRound：有把已專注的時間記下來，輪數算完成。否則專注中重設，這一輪不算。 */
  function discardToIdle(state, now, keepRound) {
    const base = normalizeState(state);
    const round = keepRound || base.phase !== 'focus'
      ? (base.round || 0)
      : Math.max(0, (base.round || 1) - 1);
    return copyIdle(base, now, round);
  }

  function focusRecord(state) {
    if (!state.sessionId || !state.endAt) return null;
    const startAt = state.startAt || state.endAt;
    const minutes = minutesFromMs(state.phaseDurationMs || 0);
    return {
      id: state.sessionId,
      date: dateOf(startAt),
      startAt,
      endAt: state.endAt,
      minutes,
      subject: state.subject,
      chapterId: state.chapterId || null,
      source: 'pomodoro',
      updatedAt: state.endAt
    };
  }

  function settle(state, now, durations) {
    const base = normalizeState(state);
    if (base.status !== 'running' || base.endAt == null || now < base.endAt) {
      return { state: base, records: [], changed: false, alarm: null, alarmToken: null };
    }
    const token = base.phase + ':' + base.endAt;
    if (base.phase === 'focus') {
      const record = focusRecord(base);
      const every = (durations && durations.longEvery) || 4;
      const long = (base.round || 0) % every === 0;
      const phase = long ? 'long' : 'short';
      const rawDur = long ? Number(durations && durations.long) : Number(durations && durations.short);
      const dur = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 5 * 60000;
      const breakEnd = base.endAt + dur;
      let next = Object.assign({}, base, {
        status: 'running',
        phase,
        startAt: null,
        sessionId: null,
        phaseDurationMs: dur,
        endAt: breakEnd,
        pausedRemainingMs: null,
        pendingAlarm: null,
        alarmToken: token,
        updatedAt: now
      });
      let alarm = 'focus';
      if (now >= breakEnd) {
        next = copyIdle(base, now, base.round || 0);
        next.alarmToken = token;
        alarm = 'focus-caught-up';
      }
      return { state: next, records: record ? [record] : [], changed: true, alarm, alarmToken: token };
    }
    const next = copyIdle(base, now, base.round || 0);
    next.alarmToken = token;
    return { state: next, records: [], changed: true, alarm: base.phase, alarmToken: token };
  }

  function phaseLabel(state) {
    const s = normalizeState(state);
    const n = s.round || 0;
    if (s.status === 'idle') return '準備開始 · 下一輪第 ' + (n + 1) + ' 輪';
    if (s.phase === 'focus' && s.status === 'paused') return '專注已暫停 · 第 ' + n + ' 輪';
    if (s.phase === 'focus') return '專注中 · 第 ' + n + ' 輪';
    if (s.phase === 'long' && s.status === 'paused') return '長休息已暫停 · 第 ' + n + ' 輪之後';
    if (s.phase === 'long') return '長休息 · 第 ' + n + ' 輪之後';
    if (s.status === 'paused') return '短休息已暫停 · 第 ' + n + ' 輪之後';
    return '短休息 · 第 ' + n + ' 輪之後';
  }

  function readTestOverride() {
    try {
      if (typeof location === 'undefined') return null;
      const raw = new URLSearchParams(location.search).get('pomoTest');
      if (raw == null || raw === '') return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1000 || n > 120000) return null;
      const ms = Math.round(n);
      return { focusMs: ms, shortMs: Math.min(5000, ms), longMs: Math.min(8000, ms) };
    } catch (e) {
      return null;
    }
  }

  const StudyOS = createUI();

  function createUI() {
    let live = null;
    let busy = false;
    let pending = false;
    let armed = false;
    let lastAlarmToken = '';
    let audioCtx = null;
    let bannerText = '';

    function durationsNow() {
      const settings = (typeof window !== 'undefined' && window.settings && window.settings.pomodoroSettings) || null;
      return durationsFrom(settings, readTestOverride());
    }

    function claimAlarm(token) {
      if (!token || token === lastAlarmToken) return false;
      lastAlarmToken = token;
      return true;
    }

    function primeAudio() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        if (audioCtx.state === 'suspended') audioCtx.resume();
      } catch (e) { /* 沒有音效就略過 */ }
    }

    function beep() {
      try {
        primeAudio();
        if (!audioCtx) return;
        const t0 = audioCtx.currentTime;
        const tone = (freq, at, len) => {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.type = 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, t0 + at);
          g.gain.exponentialRampToValueAtTime(0.06, t0 + at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
          o.connect(g);
          g.connect(audioCtx.destination);
          o.start(t0 + at);
          o.stop(t0 + at + len + 0.02);
        };
        tone(880, 0, 0.18);
        tone(1175, 0.2, 0.22);
      } catch (e) { /* 瀏覽器不給聲音 */ }
      try { if (navigator.vibrate) navigator.vibrate([80, 40, 80]); } catch (e) { /* 沒有震動 */ }
    }

    function maybeSystemNotify(alarm) {
      const cfg = window.settings && window.settings.pomodoroSettings;
      if (!cfg || !cfg.notify) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        new Notification('番茄鐘', { body: ALARM_TEXT[alarm] || '時間到了' });
      } catch (e) { /* 通知失敗不影響計時 */ }
    }

    function notify(alarm, token) {
      if (!alarm || !claimAlarm(token || alarm)) return;
      bannerText = ALARM_TEXT[alarm] || '';
      beep();
      if (typeof toast === 'function') toast(bannerText);
      const card = document.getElementById('pomoCard');
      if (card) {
        card.classList.remove('pomo-flash');
        void card.offsetWidth;
        card.classList.add('pomo-flash');
      }
      paintPomo();
    }

    async function writeRecords(records) {
      for (const rec of records || []) {
        if (window.StudyDB) await StudyDB.putSessionOnce(rec);
      }
    }

    async function refresh() {
      if (busy) { pending = true; return; }
      if (!window.StudyDB || !window.Pomo) return;
      busy = true;
      try {
        do {
          pending = false;
          const stored = normalizeState(await StudyDB.getPomo());
          const now = Date.now();
          const settled = settle(stored, now, durationsNow());
          let state = stored;
          let alarmNow = null;
          let token = null;
          if (settled.changed) {
            await writeRecords(settled.records);
            state = settled.state;
            if (settled.alarm) {
              token = settled.alarmToken;
              if (typeof document !== 'undefined' && document.hidden) {
                state = Object.assign({}, state, { pendingAlarm: settled.alarm, alarmToken: token });
                maybeSystemNotify(settled.alarm);
              } else {
                alarmNow = settled.alarm;
                state = Object.assign({}, state, { pendingAlarm: null, alarmToken: token });
              }
            }
            await StudyDB.putPomo(state);
          }
          if (!alarmNow && typeof document !== 'undefined' && !document.hidden && state.pendingAlarm) {
            token = state.alarmToken || state.pendingAlarm;
            alarmNow = state.pendingAlarm;
            state = Object.assign({}, state, { pendingAlarm: null, updatedAt: Date.now() });
            await StudyDB.putPomo(state);
          }
          live = state;
          paintAll();
          if (alarmNow) notify(alarmNow, token);
        } while (pending);
      } finally {
        busy = false;
      }
    }

    async function mutate(fn) {
      while (busy) await new Promise((r) => setTimeout(r, 30));
      busy = true;
      try {
        await fn();
      } finally {
        busy = false;
        if (pending) {
          pending = false;
          await refresh();
        }
      }
    }

    function catalog() {
      return (typeof window !== 'undefined' && window.__PATH_CHAPTERS__) || { chapters: [] };
    }

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function hourOptions(selected) {
      let html = '';
      for (let i = 0; i < 24; i++) {
        const v = String(i).padStart(2, '0');
        html += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + v + '</option>';
      }
      return html;
    }

    function minuteOptions(selected) {
      let html = '';
      for (let i = 0; i < 60; i++) {
        const v = String(i).padStart(2, '0');
        html += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + v + '</option>';
      }
      return html;
    }

    function subjectOptions(selected) {
      const Stats = statsApi();
      const list = (Stats && Stats.SUBJECTS) || [];
      return '<option value="">請選科目</option>' + list.map((s) => (
        '<option value="' + esc(s.id) + '"' + (s.id === selected ? ' selected' : '') + '>' + esc(s.name) + '</option>'
      )).join('');
    }

    function chapterOptions(subjectId, selected) {
      const Stats = statsApi();
      const list = Stats ? Stats.chaptersFor(subjectId, catalog()) : [];
      const opts = ['<option value="">不指定</option>'].concat(list.map((c) => (
        '<option value="' + esc(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>'
      )));
      return opts.join('');
    }

    function homeHtml() {
      const clock = formatClock(durationsNow().focus);
      const test = readTestOverride();
      const today = statsApi() ? statsApi().taipeiDate(Date.now()) : '';
      return `
        <section class="card study-card" id="studyCard" aria-label="學習時數">
          <h2>學習時數</h2>
          <div class="study-stats">
            <div class="study-stat"><b id="statTodayVal">0</b><small id="statTodayUnit">小時</small><span>今日</span></div>
            <div class="study-stat"><b id="statWeekVal">0</b><small id="statWeekUnit">小時</small><span>本週</span></div>
            <div class="study-stat"><b id="statStreakVal">0</b><small>天</small><span>連續</span></div>
          </div>
          <p class="muted small">本週從週一算到今天（台北時間）。連續天數從今天或昨天往回算，中間斷了就重新計。沒有紀錄就是 0，不會用答題數來推算。</p>
          <p class="study-empty" id="studyEmpty">還沒有學習紀錄。開始一輪番茄鐘，或手動補登一筆。</p>
          <details class="study-more">
            <summary>本月與累計</summary>
            <p id="studyMonthLine" class="small">本月 0 分鐘，累計 0 分鐘。</p>
            <ul class="study-log" id="studyLog"></ul>
          </details>
          <button type="button" class="btn btn-soft" id="studyToggle">手動補登</button>
          <form class="study-form" id="studyForm" hidden>
            <label class="field"><span class="field-title">日期</span>
              <input type="date" id="studyDate" required value="${esc(today)}" max="${esc(today)}"></label>
            <label class="field"><span class="field-title">分鐘數</span>
              <input type="number" id="studyMinutes" min="1" max="720" inputmode="numeric" required placeholder="例如 40"></label>
            <label class="chk"><input type="checkbox" id="studyHasStart"> 另外填開始時間（24 小時制，可不填）</label>
            <div class="study-time" id="studyTimeRow" hidden>
              <select id="studyStartH" aria-label="開始小時（00 到 23）">${hourOptions(19)}</select>
              <span aria-hidden="true">:</span>
              <select id="studyStartM" aria-label="開始分鐘（00 到 59）">${minuteOptions(0)}</select>
            </div>
            <label class="field"><span class="field-title">科目</span>
              <select id="studySubject">${subjectOptions('')}</select></label>
            <label class="field"><span class="field-title">章節 <small>可不選</small></span>
              <select id="studyChapter">${chapterOptions('', '')}</select></label>
            <div class="pomo-actions">
              <button type="submit" class="btn btn-primary">儲存這一筆</button>
              <button type="button" class="btn btn-soft" id="studyCancel">取消</button>
            </div>
          </form>
        </section>
        <section class="card pomo-card" id="pomoCard" aria-label="番茄鐘">
          <h2>番茄鐘</h2>
          <p class="pomo-phase" id="pomoPhase">準備開始 · 下一輪第 1 輪</p>
          <p class="pomo-clock" id="pomoClock" aria-live="off">${clock}</p>
          <p class="pomo-banner" id="pomoBanner" hidden></p>
          <p class="pomo-test-note" id="pomoTestNote" ${test ? '' : 'hidden'}>測試計時：專注 ${Math.round(test ? test.focusMs / 1000 : 0)} 秒。這只跟網址有關，不會寫進設定。</p>
          <label class="field"><span class="field-title">科目</span>
            <select id="pomoSubject">${subjectOptions('')}</select></label>
          <label class="field"><span class="field-title">章節 <small>可不選</small></span>
            <select id="pomoChapter">${chapterOptions('', '')}</select></label>
          <div class="pomo-actions">
            <button type="button" class="btn btn-primary" id="pomoStart">開始</button>
            <button type="button" class="btn btn-soft" id="pomoPause" hidden>暫停</button>
            <button type="button" class="btn btn-primary" id="pomoResume" hidden>繼續</button>
            <button type="button" class="btn btn-soft" id="pomoReset" hidden>重設</button>
            <button type="button" class="btn btn-soft" id="pomoSkip" hidden>跳過休息</button>
          </div>
          <p class="hint">休息不計入學習時數。頁面開著時，結束會有短提示音、震動（手機有支援才會）和畫面上的提示。<a href="#settings">時間長短在設定裡調整</a>（預設專注 25、短休 5、長休 15 分鐘，每 4 輪一次長休）。App 在背景或關閉時可能無法準時提醒。</p>
        </section>`;
    }

    function fillSelect(id, html, value) {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = html;
      el.value = value || '';
      if (el.value !== (value || '')) el.value = '';
    }

    function paintClock() {
      const el = document.getElementById('pomoClock');
      if (!el) return;
      const ms = displayRemainingMs(live || idleState(), durationsNow(), Date.now());
      el.textContent = formatClock(ms);
    }

    function paintPomo() {
      const phase = document.getElementById('pomoPhase');
      if (!phase) return;
      const state = live || idleState();
      phase.textContent = phaseLabel(state);
      paintClock();
      const banner = document.getElementById('pomoBanner');
      if (banner) {
        banner.hidden = !bannerText;
        banner.textContent = bannerText;
      }
      const idle = state.status === 'idle';
      const running = state.status === 'running';
      const paused = state.status === 'paused';
      const onBreak = state.phase !== 'focus' && !idle;
      const show = (id, on) => { const b = document.getElementById(id); if (b) b.hidden = !on; };
      show('pomoStart', idle);
      show('pomoPause', running);
      show('pomoResume', paused);
      show('pomoReset', !idle);
      show('pomoSkip', onBreak);
      const subject = document.getElementById('pomoSubject');
      const chapter = document.getElementById('pomoChapter');
      if (subject) subject.disabled = !idle;
      if (chapter) chapter.disabled = !idle;
      const changed = paintPomo.last !== state.status;
      if (subject && (changed || !idle)) {
        if (state.subject) subject.value = state.subject;
        const selectedChapter = (changed || !idle) ? (state.chapterId || '') : (chapter ? chapter.value : '');
        fillSelect('pomoChapter', chapterOptions(subject.value, selectedChapter), selectedChapter);
      }
      paintPomo.last = state.status;
    }

    async function paintStats() {
      const todayEl = document.getElementById('statTodayVal');
      if (!todayEl || !window.StudyDB || !statsApi()) return;
      const Stats = statsApi();
      const sessions = await StudyDB.allSessions();
      const sum = Stats.summarize(sessions, Date.now());
      const today = Stats.formatStat(sum.todayMin);
      const week = Stats.formatStat(sum.weekMin);
      const unitEl = document.getElementById('statTodayUnit');
      const weekEl = document.getElementById('statWeekVal');
      const weekUnitEl = document.getElementById('statWeekUnit');
      const streakEl = document.getElementById('statStreakVal');
      if (!document.getElementById('statTodayVal') || !unitEl || !weekEl || !weekUnitEl || !streakEl) return;
      todayEl.textContent = today.value;
      unitEl.textContent = today.unit;
      weekEl.textContent = week.value;
      weekUnitEl.textContent = week.unit;
      streakEl.textContent = String(sum.streak);
      const empty = document.getElementById('studyEmpty');
      if (empty) empty.hidden = !!sum.hasStudy;
      const line = document.getElementById('studyMonthLine');
      if (line) line.textContent = '本月 ' + Stats.formatLong(sum.monthMin) + '，累計 ' + Stats.formatLong(sum.totalMin) + '。';
      const log = document.getElementById('studyLog');
      if (!log) return;
      const rows = (sessions || [])
        .map((s) => Stats.normalizeSession(s))
        .filter(Boolean)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.updatedAt || 0) - (a.updatedAt || 0)))
        .slice(0, 20);
      if (!rows.length) {
        log.innerHTML = '<li class="muted small">還沒有明細。</li>';
        return;
      }
      log.innerHTML = rows.map((s) => {
        const name = Stats.displaySubjectName(s);
        const ch = Stats.chapterName(s.chapterId, catalog());
        const src = s.source === 'manual' ? '手動' : (s.source === 'essay' ? '作文' : '番茄鐘');
        const del = s.source === 'manual'
          ? '<button type="button" class="btn btn-text-bad btn-sm" data-del-session="' + esc(s.id) + '">刪除</button>'
          : '';
        return '<li><div class="grow"><b>' + esc(s.date.slice(5).replace('-', '/')) + '</b>　' +
          esc(Stats.formatLong(s.minutes)) + '　' + esc(name) +
          (ch ? '　' + esc(ch) : '') + '　<span class="muted">' + src + '</span></div>' + del + '</li>';
      }).join('');
    }

    function paintAll() {
      paintPomo();
      paintStats().catch((e) => console.error(e));
    }

    function bindHome(rootEl) {
      const subject = rootEl.querySelector('#pomoSubject');
      if (subject) subject.onchange = () => fillSelect('pomoChapter', chapterOptions(subject.value, ''), '');
      const studySubject = rootEl.querySelector('#studySubject');
      if (studySubject) studySubject.onchange = () => fillSelect('studyChapter', chapterOptions(studySubject.value, ''), '');
      const toggle = rootEl.querySelector('#studyToggle');
      const form = rootEl.querySelector('#studyForm');
      const timeRow = rootEl.querySelector('#studyTimeRow');
      const hasStart = rootEl.querySelector('#studyHasStart');
      if (toggle && form) toggle.onclick = () => {
        form.hidden = !form.hidden;
        toggle.textContent = form.hidden ? '手動補登' : '收合補登';
        if (!form.hidden) {
          const date = rootEl.querySelector('#studyDate');
          const today = statsApi().taipeiDate(Date.now());
          if (date) { date.max = today; if (!date.value) date.value = today; }
        }
      };
      if (hasStart && timeRow) hasStart.onchange = () => { timeRow.hidden = !hasStart.checked; };
      const cancel = rootEl.querySelector('#studyCancel');
      if (cancel && form && toggle) cancel.onclick = () => { form.hidden = true; toggle.textContent = '手動補登'; };
      if (form) form.onsubmit = (e) => { e.preventDefault(); saveManual(form); };
      const log = rootEl.querySelector('#studyLog');
      if (log) log.onclick = (e) => {
        const btn = e.target.closest('[data-del-session]');
        if (!btn) return;
        removeManual(btn.getAttribute('data-del-session'));
      };
      const startBtn = rootEl.querySelector('#pomoStart');
      if (startBtn) startBtn.onclick = () => onStart();
      const pauseBtn = rootEl.querySelector('#pomoPause');
      if (pauseBtn) pauseBtn.onclick = () => onPause();
      const resumeBtn = rootEl.querySelector('#pomoResume');
      if (resumeBtn) resumeBtn.onclick = () => onResume();
      const resetBtn = rootEl.querySelector('#pomoReset');
      if (resetBtn) resetBtn.onclick = () => onReset();
      const skipBtn = rootEl.querySelector('#pomoSkip');
      if (skipBtn) skipBtn.onclick = () => onSkip();
    }

    async function saveManual() {
      const Stats = statsApi();
      const built = Stats.buildManual({
        date: document.getElementById('studyDate').value,
        minutes: document.getElementById('studyMinutes').value,
        subject: document.getElementById('studySubject').value,
        chapterId: document.getElementById('studyChapter').value,
        hasStart: document.getElementById('studyHasStart').checked,
        startH: Number(document.getElementById('studyStartH').value),
        startM: Number(document.getElementById('studyStartM').value),
        now: Date.now(),
        id: (typeof uid === 'function' ? uid() : ('manual-' + Date.now())),
        catalog: catalog()
      });
      if (!built.ok) { if (typeof toast === 'function') toast(built.error); return; }
      await StudyDB.putSessions([built.session]);
      if (typeof toast === 'function') toast('已補登 ' + Stats.formatLong(built.session.minutes));
      const form = document.getElementById('studyForm');
      const toggle = document.getElementById('studyToggle');
      if (form) form.hidden = true;
      if (toggle) toggle.textContent = '手動補登';
      const minutes = document.getElementById('studyMinutes');
      if (minutes) minutes.value = '';
      await paintStats();
    }

    async function removeManual(id) {
      const Stats = statsApi();
      const all = await StudyDB.allSessions();
      const row = (all || []).map((s) => Stats.normalizeSession(s)).find((s) => s && s.id === id);
      if (!row || row.source !== 'manual') { if (typeof toast === 'function') toast('只能刪除自己補登的紀錄'); return; }
      const label = row.date + '　' + Stats.formatLong(row.minutes) + '　' + Stats.displaySubjectName(row);
      const ok = typeof confirmBox === 'function'
        ? await confirmBox('刪除這筆補登？', '<p>' + esc(label) + '</p><p class="muted small">刪了就不會算進今日、本週和連續天數。</p>', '刪除', true)
        : false;
      if (!ok) return;
      await StudyDB.deleteSession(id);
      if (typeof toast === 'function') toast('已刪除這筆補登');
      await paintStats();
    }

    async function onStart() {
      primeAudio();
      await mutate(async () => {
        const now = Date.now();
        const stored = normalizeState(await StudyDB.getPomo());
        const settled = settle(stored, now, durationsNow());
        let base = stored;
        if (settled.changed) {
          await writeRecords(settled.records);
          base = settled.state;
          await StudyDB.putPomo(base);
          live = base;
          if (settled.alarm && !(typeof document !== 'undefined' && document.hidden)) notify(settled.alarm, settled.alarmToken);
        }
        if (base.status !== 'idle') { paintAll(); if (typeof toast === 'function') toast('這一輪還沒結束'); return; }
        const subject = document.getElementById('pomoSubject').value;
        let chapterId = document.getElementById('pomoChapter').value || null;
        const Stats = statsApi();
        if (chapterId && Stats && !Stats.chaptersFor(subject, catalog()).some((c) => c.id === chapterId)) chapterId = null;
        const out = start(base, {
          subject,
          chapterId,
          now,
          sessionId: (typeof uid === 'function' ? uid() : ('pomo-' + now)),
          durations: durationsNow()
        });
        if (out.error) { if (typeof toast === 'function') toast(out.error); return; }
        live = out.state;
        await StudyDB.putPomo(live);
        paintAll();
      });
    }

    async function onPause() {
      primeAudio();
      await mutate(async () => {
        const now = Date.now();
        const base = normalizeState(await StudyDB.getPomo());
        const out = pause(base, now);
        if (out.error) { if (typeof toast === 'function') toast(out.error); return; }
        live = out.state;
        await StudyDB.putPomo(live);
        paintAll();
      });
    }

    async function onResume() {
      primeAudio();
      await mutate(async () => {
        const now = Date.now();
        const base = normalizeState(await StudyDB.getPomo());
        const out = resume(base, now);
        if (out.error) { if (typeof toast === 'function') toast(out.error); return; }
        live = out.state;
        await StudyDB.putPomo(live);
        paintAll();
      });
    }

    async function onSkip() {
      await mutate(async () => {
        const now = Date.now();
        const base = normalizeState(await StudyDB.getPomo());
        const out = skipBreak(base, now);
        if (out.error) { if (typeof toast === 'function') toast(out.error); return; }
        live = out.state;
        await StudyDB.putPomo(live);
        paintAll();
      });
    }

    async function onReset() {
      primeAudio();
      let ask = null;
      await mutate(async () => {
        const now = Date.now();
        const stored = normalizeState(await StudyDB.getPomo());
        const settled = settle(stored, now, durationsNow());
        let base = stored;
        if (settled.changed) {
          await writeRecords(settled.records);
          base = settled.state;
          await StudyDB.putPomo(base);
          live = base;
          paintAll();
          if (settled.alarm) notify(settled.alarm, settled.alarmToken);
          if (base.status !== 'running' && base.status !== 'paused') return;
        }
        const plan = resetPlan(base, now);
        if (plan.needsConfirm && base.phase === 'focus' && base.status !== 'idle') {
          const paused = base.status === 'paused' ? { state: base } : pause(base, now);
          live = paused.state;
          await StudyDB.putPomo(live);
          paintAll();
          ask = plan;
          return;
        }
        live = discardToIdle(base, now, false);
        await StudyDB.putPomo(live);
        paintAll();
      });
      if (!ask) return;
      const res = typeof modal === 'function'
        ? await modal({
          title: '重設番茄鐘',
          html: '<p>這一輪已專注 ' + ask.minutes + ' 分鐘（未滿 1 分鐘的零頭不計）。要記入學習時數嗎？</p>',
          okText: '記入時數',
          cancelText: '不記錄'
        })
        : { ok: false };
      await mutate(async () => {
        const cur = normalizeState(await StudyDB.getPomo());
        if (res.ok) {
          const partial = partialSession(cur, Date.now());
          if (partial) await StudyDB.putSessionOnce(partial);
          live = discardToIdle(cur, Date.now(), true);
        } else {
          live = discardToIdle(cur, Date.now(), false);
        }
        await StudyDB.putPomo(live);
        paintAll();
      });
    }

    function mountHome(el) {
      if (!el || typeof document === 'undefined') return;
      el.innerHTML = homeHtml();
      bindHome(el);
      paintPomo.last = undefined;
      if (live) paintPomo();
      refresh().catch((e) => console.error(e));
    }

    function settingsHtml() {
      const s = normalizeSettings(window.settings && window.settings.pomodoroSettings);
      const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
      const permText = perm === 'granted' ? '這台瀏覽器已允許通知。' : perm === 'denied' ? '這台瀏覽器已封鎖通知，勾選也不會跳出系統通知。' : '尚未詢問通知權限。';
      return `
        <section class="card" id="pomoSettingsCard">
          <h2>番茄鐘</h2>
          <p class="muted small">預設專注 25 分鐘、短休 5、長休 15，每 4 輪一次長休。休息不計入學習時數。</p>
          <div class="pomo-settings-grid">
            <label class="field"><span class="field-title">專注（分鐘）</span>
              <input type="number" id="pomoFocus" min="1" max="180" inputmode="numeric" value="${s.focusMin}"></label>
            <label class="field"><span class="field-title">短休（分鐘）</span>
              <input type="number" id="pomoShort" min="1" max="60" inputmode="numeric" value="${s.shortMin}"></label>
            <label class="field"><span class="field-title">長休（分鐘）</span>
              <input type="number" id="pomoLong" min="1" max="90" inputmode="numeric" value="${s.longMin}"></label>
            <label class="field"><span class="field-title">幾輪後長休</span>
              <input type="number" id="pomoEvery" min="2" max="12" inputmode="numeric" value="${s.longEvery}"></label>
          </div>
          <button type="button" class="btn btn-primary" id="pomoSaveSettings">儲存番茄鐘</button>
          <label class="chk" style="margin-top:12px"><input type="checkbox" id="pomoNotify" ${s.notify ? 'checked' : ''}> 結束時用系統通知</label>
          <p class="hint">只有在這裡主動打開，而且瀏覽器已允許，才會用系統通知。${esc(permText)} 頁面開著時本來就會用短提示音、震動（手機有支援才會）和畫面上的提示。App 在背景或關閉時可能無法準時提醒。</p>
        </section>`;
    }

    function mountSettings(el) {
      if (!el || typeof document === 'undefined') return;
      el.innerHTML = settingsHtml();
      const save = el.querySelector('#pomoSaveSettings');
      if (save) save.onclick = async () => {
        const next = normalizeSettings({
          focusMin: el.querySelector('#pomoFocus').value,
          shortMin: el.querySelector('#pomoShort').value,
          longMin: el.querySelector('#pomoLong').value,
          longEvery: el.querySelector('#pomoEvery').value,
          notify: window.settings.pomodoroSettings && window.settings.pomodoroSettings.notify
        });
        window.settings.pomodoroSettings = next;
        el.querySelector('#pomoFocus').value = next.focusMin;
        el.querySelector('#pomoShort').value = next.shortMin;
        el.querySelector('#pomoLong').value = next.longMin;
        el.querySelector('#pomoEvery').value = next.longEvery;
        if (typeof saveSettings === 'function') await saveSettings('pomodoroSettings');
        if (typeof toast === 'function') toast('已儲存番茄鐘時間');
      };
      const box = el.querySelector('#pomoNotify');
      if (box) box.onchange = async () => {
        if (box.checked) {
          if (typeof Notification === 'undefined') {
            box.checked = false;
            if (typeof toast === 'function') toast('這台瀏覽器沒有系統通知');
            return;
          }
          let perm = Notification.permission;
          if (perm === 'default') {
            try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; }
          }
          if (perm !== 'granted') {
            box.checked = false;
            window.settings.pomodoroSettings.notify = false;
            if (typeof saveSettings === 'function') await saveSettings('pomodoroSettings');
            if (typeof toast === 'function') toast(perm === 'denied' ? '瀏覽器已封鎖通知，不會使用系統通知' : '未允許通知，不會使用系統通知');
            return;
          }
        }
        window.settings.pomodoroSettings.notify = !!box.checked;
        if (typeof saveSettings === 'function') await saveSettings('pomodoroSettings');
        if (typeof toast === 'function') toast(box.checked ? '已開啟系統通知' : '已關閉系統通知');
      };
    }

    function tick() {
      if (!live) return;
      paintClock();
      if (live.status === 'running' && remainingMs(live, Date.now()) <= 0) {
        refresh().catch((e) => console.error(e));
      }
    }

    function startLoop() {
      if (armed || typeof window === 'undefined') return;
      armed = true;
      setInterval(tick, 500);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refresh().catch((e) => console.error(e));
      });
      window.addEventListener('pageshow', () => { refresh().catch((e) => console.error(e)); });
      refresh().catch((e) => console.error(e));
    }

    return { mountHome, mountSettings, start: startLoop, refresh };
  }

  return {
    ALARM_TEXT,
    normalizeSettings, durationsFrom, idleState, normalizeState,
    remainingMs, displayRemainingMs, formatClock, minutesFromMs, focusedMs,
    start, pause, resume, skipBreak, resetPlan, partialSession, discardToIdle,
    settle, phaseLabel, readTestOverride,
    StudyOS
  };
});
