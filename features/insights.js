/* 進度頁的智慧分析。只讀本機紀錄，不呼叫 AI、不改錯題原因、不另開「已掌握」欄位。
   已掌握＝既有的已完成複習（status === 'done'）。
   國文作文（source === 'essay'）計入總時間，不計入國文正式進度與成績判斷。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Insights = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MIN_RECORDS = 3;
  const INSUFFICIENT_COPY = '資料還不夠，先累積幾筆紀錄';
  const STALE_DAYS = 14;
  const WEAK_AVG = 60;
  const SUBJECTS = [
    { id: 'zh', name: '國文' },
    { id: 'en', name: '英文' },
    { id: 'ee', name: '電工原理' },
    { id: 'em', name: '電工機械' },
    { id: 'math', name: '數學基礎' }
  ];
  const SUBJECT_IDS = new Set(SUBJECTS.map((s) => s.id));

  /** 6 類只在統計時合併。每一列都是既有 2 類、各 8 個原因裡的原文，不取代清單。 */
  const REASON_GROUPS = [
    {
      id: 'concept',
      name: '觀念不清楚',
      reasons: [
        { category: 'lang', reason: '文法不懂' },
        { category: 'lang', reason: '看不懂整句意思' },
        { category: 'lang', reason: '會話情境判斷錯' },
        { category: 'calc', reason: '觀念不懂' },
        { category: 'calc', reason: '不知道從哪裡開始' }
      ]
    },
    {
      id: 'arithmetic',
      name: '計算錯誤',
      reasons: [
        { category: 'calc', reason: '計算錯（抄錯/漏負號）' },
        { category: 'calc', reason: '基礎數學不熟（分數/移項/次方/根號）' },
        { category: 'calc', reason: '單位換算錯（k、m、μ）' }
      ]
    },
    {
      id: 'memory',
      name: '記憶錯誤',
      reasons: [
        { category: 'lang', reason: '單字不會' },
        { category: 'lang', reason: '片語或搭配不會' },
        { category: 'lang', reason: '猜對的' }
      ]
    },
    {
      id: 'misread',
      name: '看錯題目',
      reasons: [
        { category: 'lang', reason: '被相似選項騙' },
        { category: 'lang', reason: '看漏關鍵字' },
        { category: 'calc', reason: '看漏條件或關鍵字' }
      ]
    },
    {
      id: 'formula',
      name: '公式不熟',
      reasons: [
        { category: 'calc', reason: '公式忘了或用錯' }
      ]
    },
    {
      id: 'time',
      name: '時間不足',
      reasons: [
        { category: 'calc', reason: '時間不夠' }
      ]
    }
  ];

  const FORMULA_TEXT = '優先分＝錯題量分＋未完成分＋弱科分＋天數分。'
    + '錯題量分＝min(40, 尚未完成複習的錯題數×4)。'
    + '未完成分＝四捨五入((100−章節完成度)×0.3)，完成度是該科學習路徑裡已學會或已標記完成的題數占比。'
    + '弱科分：該科模擬考平均低於 60 為 20、低於 80 為 10、其餘為 0；沒有該科成績就是 0。'
    + '天數分：距離考試 7 天內為 20、8–21 天為 12、22–45 天為 6、更遠或已過考試日為 0。'
    + '國文只看正式章節、正式錯題和國文模擬考；作文時數不進入這條公式。';

  const REVIEW_RESULTS = new Set(['correct', 'wrong', 'done', 'auto-done', 'relearn']);

  function pad(n) { return String(n).padStart(2, '0'); }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function round1(n) {
    return Math.round(Number(n) * 10) / 10;
  }

  function fmt1(n) {
    if (n == null || !Number.isFinite(Number(n))) return '';
    const r = round1(n);
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  function isDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  function dateUtc(value) {
    const [y, m, d] = String(value).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function addDays(dateStr, n) {
    const dt = new Date(dateUtc(dateStr) + n * 86400000);
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }

  function diffDays(from, to) {
    if (!isDate(from) || !isDate(to)) return null;
    return Math.round((dateUtc(to) - dateUtc(from)) / 86400000);
  }

  function taipeiDate(ms) {
    const Stats = (typeof globalThis !== 'undefined' && globalThis.StudyStats) || null;
    if (Stats && Stats.taipeiDate) return Stats.taipeiDate(ms);
    const d = new Date(Number(ms) + 8 * 60 * 60 * 1000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function todayOf(input) {
    if (isDate(input && input.today)) return input.today;
    return taipeiDate(Number(input && input.now) || Date.now());
  }

  function canonSubject(id) {
    if (id === 'english') return 'en';
    return SUBJECT_IDS.has(id) ? id : '';
  }

  function subjectName(id) {
    const row = SUBJECTS.find((s) => s.id === id);
    return row ? row.name : '';
  }

  function validSession(raw) {
    const Stats = (typeof globalThis !== 'undefined' && globalThis.StudyStats) || null;
    if (Stats && Stats.normalizeSession) return Stats.normalizeSession(raw);
    if (!raw || !raw.id || !isDate(raw.date)) return null;
    const minutes = Math.floor(Number(raw.minutes));
    if (!Number.isFinite(minutes) || minutes < 0) return null;
    return {
      id: String(raw.id),
      date: String(raw.date),
      minutes,
      subject: canonSubject(raw.subject) || raw.subject,
      chapterId: raw.chapterId ? String(raw.chapterId) : null,
      source: raw.source === 'essay' ? 'essay' : (raw.source || '')
    };
  }

  function validExam(raw) {
    if (!raw || !raw.id || !isDate(raw.date)) return null;
    const subject = canonSubject(raw.subject) || ((raw.subject === 'pro' || raw.subject === 'mixed') ? raw.subject : '');
    if (!subject) return null;
    if (raw.fullScore == null && raw.score == null && raw.pct != null) {
      const pct = Number(raw.pct);
      if (!Number.isFinite(pct)) return null;
      return { id: String(raw.id), subject, date: String(raw.date), pct, name: String(raw.name || '') };
    }
    const full = Number(raw.fullScore);
    const score = Number(raw.score);
    if (!(full > 0) || !Number.isFinite(score) || score < 0 || score > full) return null;
    return {
      id: String(raw.id),
      subject,
      date: String(raw.date),
      pct: score / full * 100,
      name: String(raw.name || '')
    };
  }

  function validMistake(raw) {
    if (!raw || !raw.id) return null;
    return raw;
  }

  function validTask(raw) {
    const Tasks = (typeof globalThis !== 'undefined' && globalThis.StudyTasks) || null;
    const row = Tasks && Tasks.normalizeTask ? Tasks.normalizeTask(raw) : raw;
    if (!row || !row.id || !row.title) return null;
    if (row.status === 'done') return null;
    return {
      id: String(row.id),
      title: String(row.title),
      subject: canonSubject(row.subject),
      dueDate: isDate(row.dueDate) ? row.dueDate : '',
      status: row.status || 'todo'
    };
  }

  /** 學習時數、模擬考、錯題合計少於 3 筆，就不做統計。任務不算在這 3 筆裡。 */
  function countRecords(input) {
    const src = input || {};
    const sessions = (src.sessions || []).map(validSession).filter(Boolean);
    const exams = (src.exams || []).map(validExam).filter(Boolean);
    const mistakes = (src.mistakes || []).map(validMistake).filter(Boolean);
    return { sessions, exams, mistakes, total: sessions.length + exams.length + mistakes.length };
  }

  function isInsufficient(input) {
    return countRecords(input).total < MIN_RECORDS;
  }

  /** 有設定才用。歷屆推估（estimate）或空日期都不產生天數。 */
  function resolveExamDate(input) {
    const src = input || {};
    const schedule = src.examSchedule && typeof src.examSchedule === 'object' && !Array.isArray(src.examSchedule)
      ? src.examSchedule : null;
    const status = src.examStatus || (schedule && schedule.status) || '';
    let date = '';
    if (src.examDate != null && src.examDate !== '') date = String(src.examDate);
    else if (schedule && schedule.writtenDate) date = String(schedule.writtenDate);
    if (status !== 'official' && status !== 'manual') return null;
    if (!isDate(date)) return null;
    return date;
  }

  function dayScore(days) {
    if (days == null || !Number.isFinite(Number(days))) return null;
    const n = Number(days);
    if (n < 0) return 0;
    if (n <= 7) return 20;
    if (n <= 21) return 12;
    if (n <= 45) return 6;
    return 0;
  }

  function clampPct(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    if (x < 0) return 0;
    if (x > 100) return 100;
    return x;
  }

  /** completion 是 0–100。沒有完成度時未完成分記 0，不把空資料當成 0%。 */
  function subjectPriority(input) {
    const src = input || {};
    const active = Math.max(0, Math.floor(Number(src.activeMistakes) || 0));
    const mistakePts = Math.min(40, active * 4);
    const hasCompletion = src.completion != null && src.completion !== '' && Number.isFinite(Number(src.completion));
    const incompletePts = hasCompletion ? Math.round((100 - clampPct(src.completion)) * 0.3) : 0;
    let weakPts = 0;
    if (src.examAvg != null && Number.isFinite(Number(src.examAvg))) {
      const avg = Number(src.examAvg);
      if (avg < 60) weakPts = 20;
      else if (avg < 80) weakPts = 10;
    }
    const days = src.dayScore == null ? 0 : Number(src.dayScore);
    const dayPts = Number.isFinite(days) ? days : 0;
    return {
      mistakePts, incompletePts, weakPts, dayScore: dayPts,
      total: mistakePts + incompletePts + weakPts + dayPts,
      completionKnown: hasCompletion
    };
  }

  /** 該科可計分章節：已標記完成的章以全部題數計，其餘用已學會題數。作文不在章節裡。 */
  function subjectCompletion(chapters, subjectId) {
    const rows = (chapters || []).filter((c) => c && c.subject === subjectId && c.role !== 'link' && Number(c.total) > 0);
    if (!rows.length) return null;
    let credit = 0;
    let total = 0;
    rows.forEach((c) => {
      const n = Number(c.total) || 0;
      total += n;
      if (c.done) credit += n;
      else credit += Math.min(n, Math.max(0, Number(c.learned) || 0));
    });
    if (!total) return null;
    return credit / total * 100;
  }

  function timeShare(sessions) {
    const rows = (sessions || []).map(validSession).filter(Boolean);
    const formal = { zh: 0, en: 0, ee: 0, em: 0, math: 0 };
    let essay = 0;
    let total = 0;
    rows.forEach((s) => {
      total += s.minutes;
      if (s.source === 'essay') essay += s.minutes;
      else if (Object.prototype.hasOwnProperty.call(formal, s.subject)) formal[s.subject] += s.minutes;
    });
    const parts = SUBJECTS.map((s) => ({ id: s.id, name: s.name, minutes: formal[s.id], essay: false }));
    parts.push({ id: 'essay', name: '國文作文', minutes: essay, essay: true });
    const shown = parts.filter((p) => p.minutes > 0).map((p) => Object.assign({}, p, {
      percent: total ? round1(p.minutes / total * 100) : 0
    }));
    return { total, essay, formal, rows: shown, count: rows.length };
  }

  function examStats(exams) {
    const rows = (exams || []).map(validExam).filter(Boolean)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
    const by = new Map();
    rows.forEach((e) => {
      if (!by.has(e.subject)) by.set(e.subject, []);
      by.get(e.subject).push(e);
    });
    const subjects = [];
    by.forEach((points, id) => {
      const avg = points.reduce((sum, p) => sum + p.pct, 0) / points.length;
      let trend = null;
      if (points.length >= 2) {
        const prev = points[points.length - 2].pct;
        const last = points[points.length - 1].pct;
        const delta = round1(last - prev);
        const dir = delta > 0.5 ? 'up' : (delta < -0.5 ? 'down' : 'flat');
        trend = {
          dir,
          text: dir === 'up' ? '上升' : (dir === 'down' ? '下降' : '持平'),
          delta,
          from: round1(prev),
          to: round1(last)
        };
      }
      subjects.push({
        id, name: subjectName(id) || id, count: points.length, avg: round1(avg), trend,
        points: points.map((p) => ({ date: p.date, pct: round1(p.pct) }))
      });
    });
    subjects.sort((a, b) => a.avg - b.avg || a.name.localeCompare(b.name, 'zh-Hant'));
    return { count: rows.length, subjects };
  }

  function countReasons(mistakes) {
    const groups = REASON_GROUPS.map((g) => ({
      id: g.id,
      name: g.name,
      count: 0,
      reasons: g.reasons.map((r) => ({ category: r.category, reason: r.reason, count: 0 }))
    }));
    const index = new Map();
    groups.forEach((g) => g.reasons.forEach((r) => index.set(r.reason, { group: g, row: r })));
    const otherMap = new Map();
    (mistakes || []).forEach((m) => {
      (m && m.reasons || []).forEach((reason) => {
        const hit = index.get(reason);
        if (hit) {
          hit.group.count += 1;
          hit.row.count += 1;
        } else {
          otherMap.set(reason, (otherMap.get(reason) || 0) + 1);
        }
      });
    });
    const otherReasons = [...otherMap.entries()].map(([reason, count]) => ({ reason, count, category: '' }));
    const otherCount = otherReasons.reduce((sum, r) => sum + r.count, 0);
    const ticks = groups.reduce((sum, g) => sum + g.count, 0) + otherCount;
    return {
      groups,
      other: { id: 'other', name: '其他（未對應）', count: otherCount, reasons: otherReasons },
      ticks
    };
  }

  function wrongTimes(m) {
    return (m.history || []).filter((h) => h && h.result === 'wrong').length;
  }

  function lastReviewDate(mistakes) {
    let best = '';
    (mistakes || []).forEach((m) => {
      (m.history || []).forEach((h) => {
        if (!h || !isDate(h.date) || !REVIEW_RESULTS.has(h.result)) return;
        if (h.date > best) best = h.date;
      });
    });
    return best || null;
  }

  function chapterActivity(sessions, mistakes, chapters) {
    const names = new Map();
    (chapters || []).forEach((c) => { if (c && c.id) names.set(c.id, c.name || c.id); });
    const by = new Map();
    function touch(key, name, subject, date, kind) {
      if (!isDate(date) || !name) return;
      const cur = by.get(key);
      if (!cur || date > cur.date) by.set(key, { key, name, subject, date, kind });
    }
    (sessions || []).forEach((raw) => {
      const s = validSession(raw);
      if (!s) return;
      if (s.source === 'essay') touch('essay', '國文作文', 'essay', s.date, 'essay');
      else if (s.chapterId) {
        const name = names.get(s.chapterId) || s.chapterId;
        const subject = canonSubject(s.subject);
        touch(subject + '\n' + name, name, subject, s.date, 'session');
      }
    });
    (mistakes || []).forEach((m) => {
      if (!m || !m.chapter) return;
      let best = '';
      (m.history || []).forEach((h) => {
        if (!h || !isDate(h.date)) return;
        if (h.result !== 'correct' && h.result !== 'wrong') return;
        if (h.date > best) best = h.date;
      });
      if (!best) return;
      const subject = canonSubject(m.subject);
      const name = String(m.chapter);
      touch(subject + '\n' + name, name, subject, best, 'review');
    });
    return [...by.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'zh-Hant'));
  }

  function activeBySubject(mistakes) {
    const counts = { zh: 0, en: 0, ee: 0, em: 0, math: 0 };
    (mistakes || []).forEach((m) => {
      if (!m || m.status === 'done') return;
      const id = canonSubject(m.subject);
      if (id) counts[id] += 1;
    });
    return counts;
  }

  function masteredCount(mistakes) {
    return (mistakes || []).filter((m) => m && m.status === 'done').length;
  }

  function analyze(input) {
    const src = input || {};
    const today = todayOf(src);
    const counted = countRecords(src);
    if (counted.total < MIN_RECORDS) {
      return {
        insufficient: true,
        copy: INSUFFICIENT_COPY,
        recordCount: counted.total,
        today,
        priority: { omitted: true, days: null, rows: [] }
      };
    }
    const sessions = counted.sessions;
    const exams = counted.exams;
    const mistakes = counted.mistakes;
    const tasks = (src.tasks || []).map(validTask).filter(Boolean);
    const chapters = src.chapters || [];
    const share = timeShare(sessions);
    const examModel = examStats(exams);
    const reasons = countReasons(mistakes);
    const activity = chapterActivity(sessions, mistakes, chapters);
    const reviewOn = lastReviewDate(mistakes);
    const active = activeBySubject(mistakes);
    const examDate = resolveExamDate(src);
    const days = examDate ? diffDays(today, examDate) : null;
    const daysPts = examDate ? dayScore(days) : null;
    const avgOf = {};
    examModel.subjects.forEach((s) => { if (SUBJECT_IDS.has(s.id)) avgOf[s.id] = s.avg; });
    const completionOf = {};
    SUBJECTS.forEach((s) => { completionOf[s.id] = subjectCompletion(chapters, s.id); });

    let priority;
    if (!examDate) {
      priority = { omitted: true, days: null, examDate: null, rows: [], formula: FORMULA_TEXT };
    } else {
      const rows = SUBJECTS.map((s) => {
        const part = subjectPriority({
          activeMistakes: active[s.id],
          completion: completionOf[s.id],
          examAvg: Object.prototype.hasOwnProperty.call(avgOf, s.id) ? avgOf[s.id] : null,
          dayScore: daysPts
        });
        return Object.assign({ id: s.id, name: s.name, active: active[s.id], completion: completionOf[s.id], examAvg: Object.prototype.hasOwnProperty.call(avgOf, s.id) ? avgOf[s.id] : null }, part);
      });
      rows.sort((a, b) => b.total - a.total || b.active - a.active || a.name.localeCompare(b.name, 'zh-Hant'));
      priority = { omitted: false, days, examDate, dayScore: daysPts, rows, formula: FORMULA_TEXT };
    }

    const stale = activity.filter((row) => row.kind !== 'essay' && diffDays(row.date, today) >= STALE_DAYS);
    const repeated = mistakes
      .map((m) => ({ mistake: m, times: wrongTimes(m) }))
      .filter((row) => row.times >= 2)
      .sort((a, b) => b.times - a.times || String(a.mistake.chapter || '').localeCompare(String(b.mistake.chapter || ''), 'zh-Hant'));

    return {
      insufficient: false,
      copy: '',
      recordCount: counted.total,
      mistakeCount: mistakes.length,
      today,
      mastered: masteredCount(mistakes),
      reviewOn,
      activity,
      tasks,
      share,
      exams: examModel,
      reasons,
      repeated,
      stale,
      active,
      completionOf,
      priority,
      formula: FORMULA_TEXT
    };
  }

  function taskLine(task, today) {
    const when = task.dueDate ? task.dueDate : '沒有到期日';
    const late = task.dueDate && task.dueDate < today ? '，已過到期日' : '';
    return '可考慮先處理「' + task.title + '」。依據：這項任務尚未完成，到期 ' + when + late + '。';
  }

  function advice(model) {
    const stale = (model.stale || []).slice(0, 3).map((row) => {
      const days = diffDays(row.date, model.today);
      return '可考慮再看「' + row.name + '」。依據：最近學習日 ' + row.date + '，距今 ' + days + ' 天（門檻 ' + STALE_DAYS + ' 天）。';
    });
    const weak = [];
    if (model.exams.count < MIN_RECORDS) {
      weak.push(INSUFFICIENT_COPY);
    } else {
      const lows = model.exams.subjects.filter((s) => SUBJECT_IDS.has(s.id) && s.avg < WEAK_AVG);
      if (!lows.length) weak.push('目前沒有平均低於 60% 的科目。依據：已有成績的科目平均都在 60% 以上。');
      else lows.forEach((s) => {
        weak.push('可考慮加強' + s.name + '。依據：模擬考平均 ' + fmt1(s.avg) + '%（' + s.count + ' 筆），低於 60%。作文時數沒有拿來判斷成績。');
      });
    }
    const week = [];
    const soon = (model.tasks || []).filter((t) => t.dueDate && t.dueDate <= addDays(model.today, 7)).slice(0, 3);
    soon.forEach((t) => week.push(taskLine(t, model.today)));
    if (model.share.count >= MIN_RECORDS) {
      const formalTotal = SUBJECTS.reduce((sum, s) => sum + (model.share.formal[s.id] || 0), 0);
      if (formalTotal === 0 && model.share.essay > 0) {
        week.push('可考慮下週排一點國文正式題。依據：這段學習時數 ' + model.share.essay + ' 分鐘都是國文作文。作文計入總時間，但不計入國文正式進度。');
      } else if (formalTotal > 0) {
        const lows = SUBJECTS.map((s) => ({
          id: s.id,
          name: s.name,
          minutes: model.share.formal[s.id] || 0
        })).filter((s) => s.minutes / formalTotal < 0.2);
        lows.sort((a, b) => a.minutes - b.minutes || SUBJECTS.findIndex((s) => s.id === a.id) - SUBJECTS.findIndex((s) => s.id === b.id));
        const pick = lows[0];
        if (pick) {
          const avg = model.exams.subjects.find((s) => s.id === pick.id);
          const extra = avg ? '，模擬考平均 ' + fmt1(avg.avg) + '%（' + avg.count + ' 筆）' : '';
          week.push('可考慮下週多排' + pick.name + '。依據：正式讀書 ' + formalTotal + ' 分鐘裡，' + pick.name + ' ' + pick.minutes + ' 分鐘' + extra + '。國文作文另計 ' + model.share.essay + ' 分鐘，沒有算進國文。');
        }
      }
    }
    if (!week.length) week.push('還沒有未來 7 天內要做的未完成任務，時數也還不足以建議科目。');
    return { stale, weak, week };
  }

  function shareHtml(share) {
    if (share.count < MIN_RECORDS) return '<p class="insight-empty">' + INSUFFICIENT_COPY + '</p>';
    if (!share.total) return '<p class="muted small">有學習紀錄，但分鐘數是 0。</p>';
    const bars = share.rows.map((row) => (
      '<div class="share-row"><span>' + esc(row.name) + '</span>'
      + '<span class="share-bar" aria-hidden="true"><i style="--w:' + row.percent + '%"></i></span>'
      + '<b>' + row.minutes + ' 分　' + fmt1(row.percent) + '%</b></div>'
    )).join('');
    return '<p class="muted small">總時間 ' + share.total + ' 分鐘，含國文作文 ' + share.essay + ' 分鐘。作文計入總時間，下面的國文只算正式讀書，不含作文。</p>' + bars;
  }

  function examHtml(exams) {
    if (exams.count < MIN_RECORDS) return '<p class="insight-empty">' + INSUFFICIENT_COPY + '</p>';
    const blocks = exams.subjects.map((s) => {
      const trend = s.trend
        ? '趨勢：' + s.trend.text + '（' + fmt1(s.trend.from) + '% → ' + fmt1(s.trend.to) + '%）'
        : '還不到兩筆，不畫趨勢線。';
      const points = s.points.map((p) => p.date + ' ' + fmt1(p.pct) + '%').join('、');
      return '<p><b>' + esc(s.name) + '</b>　平均 ' + fmt1(s.avg) + '%（' + s.count + ' 筆）　' + esc(trend)
        + '<span class="muted small">　' + esc(points) + '</span></p>';
    }).join('');
    return '<p class="muted small">平均是得分除以滿分。只列出真的有成績的科目，不補 0、不畫折線。</p>' + blocks;
  }

  function reasonHtml(reasons) {
    if (reasons.ticks < MIN_RECORDS) return '<p class="insight-empty">' + INSUFFICIENT_COPY + '</p>';
    const block = (g) => {
      const items = g.reasons.filter((r) => r.count > 0).map((r) => '<li>' + esc(r.reason) + '　' + r.count + '</li>').join('');
      return '<details class="insight-reason"><summary>' + esc(g.name) + '　' + g.count + '</summary>'
        + (items ? '<ul>' + items + '</ul>' : '<p class="muted small">這一類目前是 0。</p>')
        + '</details>';
    };
    const extra = reasons.other.count ? block(reasons.other) : '';
    const shown = reasons.groups.filter((g) => g.count > 0);
    return '<p class="muted small">6 類只在這裡合併計算。原本 2 類各 8 個原因沒有改，點開可看原始原因。0 次的類別不列出。</p>'
      + shown.map(block).join('') + extra;
  }

  function repeatedHtml(repeated, mistakeCount) {
    if ((mistakeCount || 0) < MIN_RECORDS) return '<p class="insight-empty">' + INSUFFICIENT_COPY + '</p>';
    if (!repeated.length) return '<p class="muted small">還沒有重複答錯的題目。只加入一次、紀錄裡沒有兩次答錯的，不算經常答錯。</p>';
    return '<ul class="insight-links">' + repeated.slice(0, 5).map((row) => {
      const m = row.mistake;
      const title = m.chapter || m.qText || '未填章節';
      const done = m.status === 'done' ? '　已掌握' : '';
      return '<li><a href="#detail/' + esc(m.id) + '">' + esc(title) + '</a>　答錯 ' + row.times + ' 次' + done + '</li>';
    }).join('') + '</ul>';
  }

  function recordHtml(model) {
    const review = model.reviewOn ? model.reviewOn : '還沒有複習紀錄';
    const chapters = model.activity.length
      ? '<ul>' + model.activity.map((row) => {
        const note = row.kind === 'essay' ? '（作文，不計入國文正式進度）' : '';
        return '<li>' + esc(row.name) + '　' + esc(row.date) + esc(note) + '</li>';
      }).join('') + '</ul>'
      : '<p class="muted small">還沒有章節學習日。</p>';
    const tasks = model.tasks.length
      ? '<ul>' + model.tasks.map((t) => '<li>' + esc(t.title) + (t.dueDate ? '　到期 ' + esc(t.dueDate) : '　沒有到期日') + '</li>').join('') + '</ul>'
      : '<p class="muted small">沒有尚未完成的任務。</p>';
    return '<p>最近一次複習日期：' + esc(review) + '</p>'
      + '<p>已掌握 ' + model.mastered + ' 題。已掌握就是「已完成複習」，狀態為 done，沒有另外開欄位。</p>'
      + '<h4>各章最近學習日</h4>' + chapters
      + '<h4>尚未完成的任務</h4>' + tasks;
  }

  function adviceHtml(model) {
    const lines = advice(model);
    const list = (items) => items.length ? '<ul>' + items.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '';
    let priority = '<p>考前複習優先級先拿掉：尚未設定考試日期，不自行推算距離考試天數。歷屆推估的日期也不拿來算。</p>';
    if (!model.priority.omitted) {
      const rows = model.priority.rows.map((row, i) => {
        const completion = row.completion == null ? '沒有章節完成度，未完成分記 0' : '章節完成度 ' + fmt1(row.completion) + '%';
        const avg = row.examAvg == null ? '沒有該科模擬考' : '模擬考平均 ' + fmt1(row.examAvg) + '%';
        return '<li>' + (i + 1) + '. ' + esc(row.name) + '　優先分 ' + row.total
          + '（錯題 ' + row.mistakePts + '、未完成 ' + row.incompletePts + '、弱科 ' + row.weakPts + '、天數 ' + row.dayScore + '）'
          + '<span class="muted small">　依據：尚未完成複習 ' + row.active + ' 題、' + esc(completion) + '、' + esc(avg)
          + '、距離考試 ' + model.priority.days + ' 天。</span></li>';
      }).join('');
      priority = '<p class="insight-formula">' + esc(model.formula) + '</p><ol class="insight-rank">' + rows + '</ol>';
    } else {
      priority += '<p class="insight-formula">' + esc(FORMULA_TEXT) + '</p>';
    }
    const staleLead = model.activity.some((row) => row.kind !== 'essay')
      ? (lines.stale.length ? list(lines.stale) : '<p>目前沒有超過 ' + STALE_DAYS + ' 天沒再學習的章節。依據：有學習日的章節都在 ' + STALE_DAYS + ' 天內。</p>')
      : '<p>還沒有章節學習日，這項先不判斷。</p>';
    return '<h4>長期未複習章節</h4>' + staleLead
      + '<h4>模擬考弱科</h4>' + list(lines.weak)
      + '<h4>下週學習建議</h4>' + list(lines.week)
      + '<h4>考前複習優先級</h4>' + priority;
  }

  function panelHtml(model) {
    const head = '<details class="card insight-fold" id="insightFold">'
      + '<summary><span class="insight-sum-title">智慧分析</span><span class="muted small">本機規則・預設收合</span></summary>';
    if (!model || model.insufficient) {
      return head + '<p class="insight-empty">' + INSUFFICIENT_COPY + '</p></details>';
    }
    return head
      + '<p class="muted small">日期用 Asia/Taipei。這裡不連線、也不補沒有的數字。</p>'
      + '<section class="insight-block" id="insightActual"><h3>實際紀錄</h3>' + recordHtml(model) + '</section>'
      + '<section class="insight-block" id="insightStats"><h3>系統統計</h3>'
      + '<h4>各科時間比例</h4>' + shareHtml(model.share)
      + '<h4>模擬考平均與趨勢</h4>' + examHtml(model.exams)
      + '<h4>各錯因次數</h4>' + reasonHtml(model.reasons)
      + '<h4>經常答錯的題目</h4>' + repeatedHtml(model.repeated, model.mistakeCount)
      + '</section>'
      + '<section class="insight-block" id="insightAdvice"><h3>系統建議</h3>' + adviceHtml(model) + '</section>'
      + '</details>';
  }

  function place(app) {
    let host = app.querySelector('#insightOs');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'insightOs';
    const hero = app.querySelector('.progress-hero');
    if (hero && hero.parentNode) hero.parentNode.insertBefore(host, hero.nextSibling);
    else app.insertBefore(host, app.firstChild);
    return host;
  }

  async function mount(app, mistakes) {
    if (!app || typeof document === 'undefined') return;
    const host = place(app);
    let sessions = [];
    let tasks = [];
    let exams = [];
    let chapters = [];
    try {
      if (globalThis.StudyDB) {
        sessions = await StudyDB.allSessions();
        tasks = StudyDB.allTasks ? await StudyDB.allTasks() : [];
        exams = StudyDB.allExams ? await StudyDB.allExams() : [];
      }
    } catch (err) { console.error(err); }
    try {
      if (typeof LearnUI !== 'undefined' && LearnUI && LearnUI.pathModel) {
        const path = await LearnUI.pathModel();
        chapters = (path.chapters || []).filter((ch) => ch && ch.role !== 'link').map((ch) => ({
          id: ch.id,
          name: ch.name,
          subject: ch.subject === 'english' ? 'en' : ch.subject,
          role: ch.role,
          learned: ch.stats ? ch.stats.learned : 0,
          total: ch.stats ? ch.stats.total : 0,
          done: !!(ch.stats && ch.stats.done)
        }));
      }
    } catch (err) { console.error(err); }
    const schedule = globalThis.settings && settings.examSchedule;
    const list = Array.isArray(mistakes) ? mistakes : [];
    const model = analyze({
      now: Date.now(),
      sessions, tasks, exams, mistakes: list, chapters,
      examSchedule: schedule || null
    });
    host.innerHTML = panelHtml(model);
  }

  return {
    MIN_RECORDS, INSUFFICIENT_COPY, STALE_DAYS, REASON_GROUPS, FORMULA_TEXT, SUBJECTS,
    countRecords, isInsufficient, resolveExamDate, dayScore, subjectPriority, subjectCompletion,
    timeShare, examStats, countReasons, analyze, advice, panelHtml, mount
  };
});
