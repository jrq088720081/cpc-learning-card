/* 學習時數：台北時間、週一起算、連續天數、手動補登、備份去重。不碰 IndexedDB。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StudyStats = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
  const SUBJECTS = [
    { id: 'zh', name: '國文' },
    { id: 'en', name: '英文' },
    { id: 'ee', name: '電工原理' },
    { id: 'em', name: '電工機械' },
    { id: 'math', name: '數學基礎' }
  ];
  const SUBJECT_IDS = new Set(SUBJECTS.map((s) => s.id));

  function pad(n) { return String(n).padStart(2, '0'); }

  /** Asia/Taipei（UTC+8、無日光節約）的 YYYY-MM-DD。 */
  function taipeiDate(ms) {
    const d = new Date(Number(ms) + TAIPEI_OFFSET_MS);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function taipeiDateTimeMs(dateStr, hour, minute) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    return Date.UTC(y, m - 1, d, hour, minute) - TAIPEI_OFFSET_MS;
  }

  function addDays(dateStr, n) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }

  /** 該日所在週的週一（字串比較即可，因為是 YYYY-MM-DD）。 */
  function weekStartMonday(dateStr) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return addDays(dateStr, -((wd + 6) % 7));
  }

  function subjectName(id) {
    const s = SUBJECTS.find((x) => x.id === id);
    return s ? s.name : '';
  }

  function chaptersFor(subjectId, catalog) {
    const list = (catalog && catalog.chapters) || [];
    return list
      .filter((c) => c && c.subject === subjectId && c.role !== 'link' && c.id && c.name)
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id)));
  }

  function chapterName(id, catalog) {
    if (!id) return '';
    const list = (catalog && catalog.chapters) || [];
    const c = list.find((x) => x && x.id === id);
    return c ? c.name : '';
  }

  function normalizeSession(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = String(raw.id || '').trim().slice(0, 80);
    if (!id) return null;
    const date = String(raw.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const source = raw.source === 'manual' || raw.source === 'pomodoro' || raw.source === 'essay' ? raw.source : '';
    if (!source) return null;
    if (!SUBJECT_IDS.has(raw.subject)) return null;
    const minutes = Math.floor(Number(raw.minutes));
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) return null;
    const startAt = Number(raw.startAt);
    const endAt = Number(raw.endAt);
    const updatedAt = Number(raw.updatedAt);
    const chapterId = raw.chapterId ? String(raw.chapterId).slice(0, 40) : null;
    return {
      id,
      date,
      startAt: Number.isFinite(startAt) ? startAt : null,
      endAt: Number.isFinite(endAt) ? endAt : null,
      minutes,
      subject: raw.subject,
      chapterId,
      source,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0
    };
  }

  /** 匯入：同 id 只留 updatedAt 較新的一筆。舊檔沒有這個欄位時，呼叫端應傳空陣列，本地紀錄會留下。 */
  function mergeSessions(local, incoming) {
    const map = new Map();
    const take = (raw) => {
      const n = normalizeSession(raw);
      if (!n) return;
      const old = map.get(n.id);
      if (!old || (n.updatedAt || 0) > (old.updatedAt || 0)) map.set(n.id, n);
    };
    (local || []).forEach(take);
    (incoming || []).forEach(take);
    return [...map.values()];
  }

  function sessionsFromBackup(local, data) {
    const incoming = data && Array.isArray(data.studySessions) ? data.studySessions : [];
    return mergeSessions(local, incoming);
  }

  /** 番茄鐘結算：同一個 sessionId 已存在就不再寫，即使後來的 updatedAt 比較新。 */
  function keepFirstSession(existing, incoming) {
    if (existing && existing.id) return { wrote: false, session: existing };
    const next = normalizeSession(incoming);
    if (!next) return { wrote: false, session: null };
    return { wrote: true, session: next };
  }

  function summarize(sessions, nowMs) {
    const today = taipeiDate(nowMs);
    const weekStart = weekStartMonday(today);
    const month = today.slice(0, 7);
    let todayMin = 0, weekMin = 0, monthMin = 0, totalMin = 0;
    const days = new Set();
    (sessions || []).forEach((raw) => {
      const s = normalizeSession(raw);
      if (!s || s.date > today) return;
      totalMin += s.minutes;
      if (s.date === today) todayMin += s.minutes;
      if (s.date >= weekStart && s.date <= today) weekMin += s.minutes;
      if (s.date.slice(0, 7) === month) monthMin += s.minutes;
      if (s.minutes > 0) days.add(s.date);
    });
    return {
      today, weekStart, month,
      todayMin, weekMin, monthMin, totalMin,
      streak: streakEnding(days, today),
      hasStudy: totalMin > 0
    };
  }

  /** 有紀錄的連續日：今天有紀錄就從今天往回，否則從昨天往回；中間斷一天就是 0。 */
  function streakEnding(daySet, today) {
    const set = daySet instanceof Set ? daySet : new Set(daySet || []);
    let cursor = set.has(today) ? today : addDays(today, -1);
    if (!set.has(cursor)) return 0;
    let n = 0;
    while (set.has(cursor)) {
      n += 1;
      cursor = addDays(cursor, -1);
    }
    return n;
  }

  function formatStat(min) {
    const n = Math.max(0, Math.floor(Number(min) || 0));
    if (n <= 0) return { value: '0', unit: '小時' };
    const h = Math.floor(n / 60);
    const m = n % 60;
    if (h === 0) return { value: String(m), unit: '分鐘' };
    if (m === 0) return { value: String(h), unit: '小時' };
    return { value: h + ':' + pad(m), unit: '小時' };
  }

  function formatLong(min) {
    const n = Math.max(0, Math.floor(Number(min) || 0));
    if (n <= 0) return '0 分鐘';
    const h = Math.floor(n / 60);
    const m = n % 60;
    if (h === 0) return m + ' 分鐘';
    if (m === 0) return h + ' 小時';
    return h + ' 小時 ' + m + ' 分';
  }

  function buildManual(input) {
    const now = Number(input && input.now);
    const date = String((input && input.date) || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: '請選擇日期' };
    if (!Number.isFinite(now)) return { ok: false, error: '現在時間不正確' };
    const today = taipeiDate(now);
    if (date > today) return { ok: false, error: '不能補登未來的日期' };
    const minutes = Math.floor(Number(input.minutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720) return { ok: false, error: '請填 1 到 720 的分鐘數' };
    if (!SUBJECT_IDS.has(input.subject)) return { ok: false, error: '請選科目' };
    let chapterId = input.chapterId ? String(input.chapterId).slice(0, 40) : null;
    if (chapterId) {
      const allowed = chaptersFor(input.subject, input.catalog);
      if (input.catalog && !allowed.some((c) => c.id === chapterId)) {
        return { ok: false, error: '這個章節不屬於所選科目' };
      }
    }
    let startAt;
    if (input.hasStart) {
      const h = Number(input.startH);
      const m = Number(input.startM);
      if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) {
        return { ok: false, error: '開始時間請用 24 小時制' };
      }
      startAt = taipeiDateTimeMs(date, h, m);
      const endAt = startAt + minutes * 60000;
      if (endAt > now) return { ok: false, error: '結束時間還沒到，請改分鐘數或開始時間' };
    } else {
      startAt = taipeiDateTimeMs(date, 0, 0);
    }
    const endAt = startAt + minutes * 60000;
    const id = String(input.id || '').trim().slice(0, 80);
    if (!id) return { ok: false, error: '缺少紀錄編號' };
    return {
      ok: true,
      session: {
        id,
        date,
        startAt,
        endAt,
        minutes,
        subject: input.subject,
        chapterId,
        source: 'manual',
        updatedAt: now
      }
    };
  }

  return {
    SUBJECTS, TAIPEI_OFFSET_MS,
    taipeiDate, taipeiDateTimeMs, addDays, weekStartMonday,
    subjectName, chaptersFor, chapterName,
    normalizeSession, mergeSessions, sessionsFromBackup, keepFirstSession,
    summarize, streakEnding, formatStat, formatLong, buildManual
  };
});
