/* 模擬考成績。計時交卷另寫一筆 exams，不把 practiceStats.history 當成成績。
   同一次交卷的 id 只寫第一筆。外部成績可手動新增、修改、刪除。
   折線只畫真的有分數的科目，縱軸是得分除以滿分的百分比。沒有紀錄就不畫。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Exams = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SUBJECTS = [
    { id: 'zh', name: '國文' },
    { id: 'en', name: '英文' },
    { id: 'ee', name: '電工原理' },
    { id: 'em', name: '電工機械' },
    { id: 'math', name: '數學基礎' },
    { id: 'pro', name: '專業混合' },
    { id: 'mixed', name: '綜合' }
  ];
  const SUBJECT_IDS = new Set(SUBJECTS.map((s) => s.id));
  const TARGET_IDS = ['zh', 'en', 'ee', 'em', 'math'];
  const COLORS = {
    zh: '#1f7a68', en: '#3d8f9e', ee: '#c8893b', em: '#7d6bb5',
    math: '#2f8a5b', pro: '#b86b8a', mixed: '#8a6230'
  };
  const EMPTY_COPY = '還沒有成績。交卷或新增一筆外部成績之後，這裡才會畫折線。';

  function finite(n) {
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function round1(n) {
    return Math.round(Number(n) * 10) / 10;
  }

  function fmtNum(n) {
    if (n == null || !Number.isFinite(Number(n))) return '';
    const r = round1(n);
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  function newId(prefix) {
    let rnd = '';
    try {
      if (globalThis.crypto && crypto.getRandomValues) {
        const buf = new Uint8Array(4);
        crypto.getRandomValues(buf);
        rnd = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* 改用 Math.random */ }
    if (!rnd) rnd = Math.random().toString(16).slice(2, 10);
    return (prefix + '-' + Date.now().toString(36) + rnd).slice(0, 80);
  }

  function newSubmissionId() {
    return newId('mock');
  }

  function taipeiDate(ms) {
    const Stats = (typeof globalThis !== 'undefined' && globalThis.StudyStats) || null;
    if (Stats && Stats.taipeiDate) return Stats.taipeiDate(ms);
    const d = new Date(Number(ms) + 8 * 60 * 60 * 1000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function formatTaipei(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n + 8 * 60 * 60 * 1000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
      + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  function subjectName(id) {
    if (id === 'english') return '英文';
    const row = SUBJECTS.find((s) => s.id === id);
    return row ? row.name : '';
  }

  function canonSubject(id) {
    if (id === 'english') return 'en';
    return SUBJECT_IDS.has(id) ? id : '';
  }

  function scoreNum(n, max) {
    const x = Number(n);
    if (!Number.isFinite(x) || x < 0 || x > max) return null;
    return round1(x);
  }

  function intIn(n, max) {
    const x = Number(n);
    if (!Number.isFinite(x) || x < 0 || x > max || Math.floor(x) !== x) return null;
    return x;
  }

  function usedMinutes(startedAt, endedAt, plannedSec) {
    const ms = Number(endedAt) - Number(startedAt);
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    let mins = Math.round(ms / 60000);
    const cap = Math.round(Number(plannedSec) / 60);
    if (Number.isFinite(cap) && cap > 0) mins = Math.min(mins, cap);
    if (mins < 0) mins = 0;
    if (mins > 24 * 60) mins = 24 * 60;
    return mins;
  }

  function normalizeExam(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = String(raw.id || '').trim().slice(0, 80);
    if (!id) return null;
    const name = String(raw.name || '').trim().slice(0, 80);
    if (!name) return null;
    const date = String(raw.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const subject = canonSubject(raw.subject);
    if (!subject) return null;
    const source = raw.source === 'mock' || raw.source === 'manual' ? raw.source : '';
    if (!source) return null;
    const fullScore = scoreNum(raw.fullScore, 1000);
    if (fullScore == null || fullScore <= 0) return null;
    const score = scoreNum(raw.score, fullScore);
    if (score == null) return null;
    const correct = intIn(raw.correct, 10000);
    const wrong = intIn(raw.wrong, 10000);
    const minutes = intIn(raw.usedMinutes, 24 * 60);
    if (correct == null || wrong == null || minutes == null) return null;
    return {
      id, name, date, subject, fullScore, score, correct, wrong,
      usedMinutes: minutes, source, updatedAt: finite(raw.updatedAt)
    };
  }

  function buildMockExam(input) {
    const src = input || {};
    const ended = Number(src.endedAt) || Number(src.now) || 0;
    return normalizeExam({
      id: src.id,
      name: src.name || '計時模擬考',
      date: src.date || (ended ? taipeiDate(ended) : ''),
      subject: src.subject,
      fullScore: src.graded != null ? src.graded : src.fullScore,
      score: src.score != null ? src.score : src.correct,
      correct: src.correct,
      wrong: src.wrong,
      usedMinutes: src.usedMinutes != null ? src.usedMinutes : usedMinutes(src.startedAt, ended, src.plannedSec),
      source: 'mock',
      updatedAt: src.now || ended
    });
  }

  function buildManual(input) {
    const src = input || {};
    if (!String(src.name || '').trim()) return { ok: false, error: '請填考試名稱' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(src.date || ''))) return { ok: false, error: '請選日期' };
    if (!canonSubject(src.subject)) return { ok: false, error: '請選科目' };
    const full = scoreNum(src.fullScore, 1000);
    if (full == null || full <= 0) return { ok: false, error: '滿分要大於 0' };
    const score = scoreNum(src.score, 1000);
    if (score == null) return { ok: false, error: '請填得分' };
    if (score > full) return { ok: false, error: '得分不能高於滿分' };
    if (intIn(src.correct, 10000) == null || intIn(src.wrong, 10000) == null) return { ok: false, error: '答對和答錯請填 0 以上的整數' };
    if (intIn(src.usedMinutes, 24 * 60) == null) return { ok: false, error: '用時請填 0 以上的分鐘' };
    const exam = normalizeExam({
      id: src.id || newId('manual'),
      name: src.name,
      date: src.date,
      subject: src.subject,
      fullScore: full,
      score,
      correct: src.correct,
      wrong: src.wrong,
      usedMinutes: src.usedMinutes,
      source: 'manual',
      updatedAt: src.now || Date.now()
    });
    if (!exam) return { ok: false, error: '這筆成績不完整' };
    return { ok: true, exam };
  }

  function applyEdit(existing, patch, now) {
    const prev = normalizeExam(existing);
    if (!prev) return { ok: false, error: '找不到這筆成績' };
    const src = patch || {};
    const built = buildManual({
      id: prev.id,
      name: src.name != null ? src.name : prev.name,
      date: src.date != null ? src.date : prev.date,
      subject: src.subject != null ? src.subject : prev.subject,
      fullScore: src.fullScore != null ? src.fullScore : prev.fullScore,
      score: src.score != null ? src.score : prev.score,
      correct: src.correct != null ? src.correct : prev.correct,
      wrong: src.wrong != null ? src.wrong : prev.wrong,
      usedMinutes: src.usedMinutes != null ? src.usedMinutes : prev.usedMinutes,
      now: now || Date.now()
    });
    if (!built.ok) return built;
    built.exam.source = prev.source;
    const exam = normalizeExam(built.exam);
    if (!exam) return { ok: false, error: '這筆成績不完整' };
    return { ok: true, exam };
  }

  function keepFirstExam(existing, incoming) {
    const prev = existing ? normalizeExam(existing) : null;
    if (prev) return { wrote: false, exam: prev };
    const next = normalizeExam(incoming);
    if (!next) return { wrote: false, exam: null, reason: 'invalid' };
    return { wrote: true, exam: next };
  }

  function shouldRecordExam(state) {
    return !!(state && state.mode === 'mock' && state.examRecordId && !state.examWritten);
  }

  function percent(exam) {
    if (!exam || !exam.fullScore) return null;
    return round1((exam.score / exam.fullScore) * 100);
  }

  function gapLabel(gap, hasTarget) {
    if (!hasTarget || gap == null) return '尚未設定目標';
    if (gap === 0) return '與目標相同';
    if (gap > 0) return '高於目標 ' + fmtNum(gap) + ' 分';
    return '低於目標 ' + fmtNum(Math.abs(gap)) + ' 分';
  }

  function subjectStat(rows, subject, targets) {
    const list = rows.filter((r) => r.subject === subject).slice().sort((a, b) => (
      a.date.localeCompare(b.date) || (a.updatedAt - b.updatedAt) || a.id.localeCompare(b.id)
    ));
    if (!list.length) return null;
    const points = list.map((r) => ({ date: r.date, y: percent(r), id: r.id }));
    const ys = points.map((p) => p.y);
    const avg = round1(ys.reduce((sum, n) => sum + n, 0) / ys.length);
    const max = round1(Math.max.apply(null, ys));
    const min = round1(Math.min.apply(null, ys));
    const hasTarget = !!(targets && targets[subject] != null && targets[subject] !== '');
    const target = hasTarget ? Number(targets[subject]) : null;
    const gap = target == null || !Number.isFinite(target) ? null : round1(avg - target);
    return {
      id: subject,
      name: subjectName(subject),
      count: list.length,
      avg, max, min, gap,
      target: target == null ? null : target,
      points,
      gapText: gapLabel(gap, hasTarget)
    };
  }

  function weakOrder(subjects) {
    return (subjects || []).slice().sort((a, b) => a.avg - b.avg || a.name.localeCompare(b.name, 'zh-Hant'));
  }

  function practiceRows(stats) {
    const hist = stats && Array.isArray(stats.history) ? stats.history : [];
    return hist.slice(0, 30).map((h) => ({
      at: Number(h && h.at) || 0,
      subject: String((h && h.subject) || ''),
      correct: Number(h && h.correct) || 0,
      total: Number(h && h.total) || 0,
      source: String((h && h.source) || '')
    }));
  }

  function progressModel(exams, practice, targets) {
    const rows = (exams || []).map(normalizeExam).filter(Boolean);
    const t = normalizeTargetScores(targets);
    const subjects = SUBJECTS.map((s) => subjectStat(rows, s.id, t)).filter(Boolean);
    const weak = weakOrder(subjects);
    return {
      empty: subjects.length === 0,
      subjects,
      weak,
      svg: subjects.length ? lineSvg(subjects) : '',
      practice: practiceRows(practice)
    };
  }

  function lineSvg(series) {
    if (!series || !series.length) return '';
    const W = 360;
    const H = 200;
    const padL = 36;
    const padR = 12;
    const padT = 16;
    const padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const dates = [];
    series.forEach((s) => s.points.forEach((p) => { if (p && !dates.includes(p.date)) dates.push(p.date); }));
    dates.sort();
    if (!dates.length) return '';
    const yOf = (v) => padT + ((100 - v) / 100) * innerH;
    const xOf = (date) => {
      if (dates.length === 1) return padL + innerW / 2;
      const i = dates.indexOf(date);
      return padL + (i / (dates.length - 1)) * innerW;
    };
    const grid = [0, 50, 100].map((v) => {
      const y = yOf(v).toFixed(1);
      return '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" class="exam-grid"></line>'
        + '<text x="' + (padL - 6) + '" y="' + (Number(y) + 4).toFixed(1) + '" text-anchor="end" class="exam-axis">' + v + '</text>';
    }).join('');
    const lines = series.map((s) => {
      const color = COLORS[s.id] || '#1f7a68';
      const pts = s.points.map((p) => xOf(p.date).toFixed(1) + ',' + yOf(p.y).toFixed(1));
      const poly = pts.length >= 2
        ? '<polyline fill="none" stroke="' + color + '" stroke-width="2.5" points="' + pts.join(' ') + '"></polyline>'
        : '';
      const dots = s.points.map((p) => (
        '<circle cx="' + xOf(p.date).toFixed(1) + '" cy="' + yOf(p.y).toFixed(1) + '" r="3.5" fill="' + color + '"><title>'
        + esc(s.name) + ' ' + esc(p.date) + ' ' + fmtNum(p.y) + '</title></circle>'
      )).join('');
      return poly + dots;
    }).join('');
    const first = dates[0].slice(5);
    const last = dates[dates.length - 1].slice(5);
    const labels = '<text x="' + xOf(dates[0]).toFixed(1) + '" y="' + (H - 8) + '" class="exam-axis">' + esc(first) + '</text>'
      + (dates.length > 1
        ? '<text x="' + xOf(dates[dates.length - 1]).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="end" class="exam-axis">' + esc(last) + '</text>'
        : '');
    return '<svg class="exam-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="各科成績折線">' + grid + lines + labels + '</svg>';
  }

  function normalizeTargetScores(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    SUBJECTS.forEach((s) => {
      if (raw[s.id] == null || raw[s.id] === '') return;
      const n = Number(raw[s.id]);
      if (!Number.isFinite(n) || n < 0 || n > 100) return;
      out[s.id] = round1(n);
    });
    return out;
  }

  function targetScoresFromBackup(local, settingsSlice, mode) {
    const cur = normalizeTargetScores(local);
    const slice = settingsSlice && typeof settingsSlice === 'object' ? settingsSlice : null;
    if (!slice || !Object.prototype.hasOwnProperty.call(slice, 'targetScores')) return cur;
    const incoming = normalizeTargetScores(slice.targetScores);
    if (mode === 'overwrite') return incoming;
    return Object.assign({}, cur, incoming);
  }

  function mergeExams(local, incoming) {
    const map = new Map();
    const take = (raw) => {
      const n = normalizeExam(raw);
      if (!n) return;
      const old = map.get(n.id);
      if (!old || (n.updatedAt || 0) > (old.updatedAt || 0)) map.set(n.id, n);
    };
    (local || []).forEach(take);
    (incoming || []).forEach(take);
    return [...map.values()];
  }

  function examsFromBackup(local, data) {
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'exams') || !Array.isArray(data.exams)) {
      return (local || []).map(normalizeExam).filter(Boolean);
    }
    return mergeExams(local, data.exams);
  }

  function subjectOptions(selected) {
    return SUBJECTS.map((s) => (
      '<option value="' + s.id + '"' + (s.id === selected ? ' selected' : '') + '>' + esc(s.name) + '</option>'
    )).join('');
  }

  function formHtml(exam) {
    const e = exam || {};
    const today = taipeiDate(Date.now());
    return '<form id="examScoreForm" class="exam-form" autocomplete="off" data-id="' + esc(e.id || '') + '">'
      + '<label class="field"><span class="field-title">考試名稱</span><input id="examName" maxlength="80" required value="' + esc(e.name || '') + '" placeholder="例如校內模考"></label>'
      + '<label class="field"><span class="field-title">日期</span><input id="examDate" type="date" required value="' + esc(e.date || today) + '"></label>'
      + '<label class="field"><span class="field-title">科目</span><select id="examSubject">' + subjectOptions(e.subject || 'ee') + '</select></label>'
      + '<div class="exam-form-grid"><label class="field"><span class="field-title">滿分</span><input id="examFull" inputmode="decimal" value="' + (e.fullScore != null ? esc(String(e.fullScore)) : '') + '"></label>'
      + '<label class="field"><span class="field-title">得分</span><input id="examScore" inputmode="decimal" value="' + (e.score != null ? esc(String(e.score)) : '') + '"></label>'
      + '<label class="field"><span class="field-title">答對題數</span><input id="examCorrect" inputmode="numeric" value="' + (e.correct != null ? esc(String(e.correct)) : '') + '"></label>'
      + '<label class="field"><span class="field-title">答錯題數</span><input id="examWrong" inputmode="numeric" value="' + (e.wrong != null ? esc(String(e.wrong)) : '') + '"></label></div>'
      + '<label class="field"><span class="field-title">用時（分鐘）</span><input id="examMinutes" inputmode="numeric" value="' + (e.usedMinutes != null ? esc(String(e.usedMinutes)) : '') + '"></label>'
      + '<div class="btn-row"><button type="submit" class="btn btn-primary">' + (e.id ? '儲存修改' : '儲存成績') + '</button>'
      + '<button type="button" class="btn btn-soft" id="examFormCancel">取消</button></div></form>';
  }

  function readForm(root, id, now) {
    return buildManual({
      id: id || undefined,
      name: root.querySelector('#examName').value,
      date: root.querySelector('#examDate').value,
      subject: root.querySelector('#examSubject').value,
      fullScore: root.querySelector('#examFull').value,
      score: root.querySelector('#examScore').value,
      correct: root.querySelector('#examCorrect').value,
      wrong: root.querySelector('#examWrong').value,
      usedMinutes: root.querySelector('#examMinutes').value,
      now
    });
  }

  function practiceHtml(rows) {
    if (!rows.length) return '<p class="muted small">還沒有練習紀錄。</p>';
    return '<ul class="exam-history">' + rows.map((h) => {
      const name = subjectName(h.subject) || h.subject || '練習';
      const when = formatTaipei(h.at) || '';
      return '<li><b>' + esc(name) + '</b> ' + esc(String(h.correct)) + ' / ' + esc(String(h.total))
        + (h.source ? '　' + esc(h.source) : '')
        + (when ? '<span class="muted small">　' + esc(when) + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  function statsHtml(model) {
    if (model.empty) {
      return '<div class="empty exam-empty"><h3>還沒有成績</h3><p>' + EMPTY_COPY + '</p></div>';
    }
    const legend = model.subjects.map((s) => (
      '<span class="exam-legend"><i style="background:' + (COLORS[s.id] || '#1f7a68') + '"></i>' + esc(s.name) + '</span>'
    )).join('');
    const blocks = model.subjects.map((s) => (
      '<article class="exam-subject"><h3>' + esc(s.name) + '</h3><div class="exam-stats">'
      + '<div><b>' + fmtNum(s.avg) + '</b><span>平均</span></div>'
      + '<div><b>' + fmtNum(s.max) + '</b><span>最高</span></div>'
      + '<div><b>' + fmtNum(s.min) + '</b><span>最低</span></div>'
      + '<div class="exam-gap"><b>' + esc(s.gapText) + '</b><span>和目標的差距</span></div>'
      + '</div><p class="muted small">' + s.count + ' 筆　縱軸百分比，平均 ' + fmtNum(s.avg) + '</p></article>'
    )).join('');
    const weak = model.weak.length
      ? '<p class="exam-weak"><b>弱科</b>　' + model.weak.map((s, i) => (i + 1) + '. ' + esc(s.name) + '（平均 ' + fmtNum(s.avg) + '）').join('、') + '</p>'
      : '';
    return '<p class="muted small">折線是得分除以滿分，換成 100 分來比。沒有考過的科目不畫、也不補 0。</p>'
      + model.svg
      + '<div class="exam-legend-row">' + legend + '</div>'
      + weak
      + blocks;
  }

  function listHtml(exams) {
    const rows = (exams || []).map(normalizeExam).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
    if (!rows.length) return '';
    return '<h3>成績紀錄</h3><div class="exam-list">' + rows.map((e) => (
      '<article class="exam-row"><div><b>' + esc(e.name) + '</b><div class="muted small">'
      + esc(e.date) + '　' + esc(subjectName(e.subject)) + '　' + fmtNum(e.score) + ' / ' + fmtNum(e.fullScore)
      + '　對 ' + e.correct + '　錯 ' + e.wrong + '　' + e.usedMinutes + ' 分　' + (e.source === 'mock' ? '模擬考' : '外部')
      + '</div></div><div class="exam-row-actions"><button type="button" class="btn btn-soft btn-sm" data-exam-edit="' + esc(e.id) + '">編輯</button>'
      + '<button type="button" class="btn btn-text-bad btn-sm" data-exam-del="' + esc(e.id) + '">刪除</button></div></article>'
    )).join('') + '</div>';
  }

  function progressHtml(exams, practice, targets) {
    const model = progressModel(exams, practice, targets);
    return '<section class="card" id="examScores"><h2>模擬考成績</h2>'
      + statsHtml(model)
      + '<div class="btn-row"><button type="button" class="btn btn-primary" id="examAdd">新增外部成績</button></div>'
      + '<div id="examFormCard" hidden></div>'
      + listHtml(exams)
      + '<h3>歷史練習</h3><p class="muted small">這裡是刷題和練習的作答紀錄，不是模擬考成績，也不會畫進上面的折線。</p>'
      + practiceHtml(model.practice)
      + '</section>';
  }

  function dbApi() {
    const api = (typeof globalThis !== 'undefined' && globalThis.StudyDB) || null;
    if (!api || !api.allExams) throw new Error('資料庫尚未接上');
    return api;
  }

  function place(app) {
    let host = app.querySelector('#examOs');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'examOs';
    const grid = app.querySelector('.subj-grid');
    if (grid && grid.parentNode) grid.parentNode.insertBefore(host, grid.nextSibling);
    else app.appendChild(host);
    return host;
  }

  async function loadPractice() {
    try {
      if (typeof window !== 'undefined' && window.LearnUI && LearnUI.getStats) return await LearnUI.getStats();
    } catch (e) { /* 練習統計讀不到時，成績區仍可畫 */ }
    return { history: [] };
  }

  function targetsNow() {
    return normalizeTargetScores(typeof window !== 'undefined' && window.settings && window.settings.targetScores);
  }

  async function mount(app) {
    if (!app || typeof document === 'undefined') return;
    const host = place(app);
    const exams = await dbApi().allExams();
    const practice = await loadPractice();
    host.innerHTML = progressHtml(exams, practice, targetsNow());
    const openForm = (exam) => {
      const card = host.querySelector('#examFormCard');
      card.hidden = false;
      card.innerHTML = formHtml(exam);
      const form = card.querySelector('#examScoreForm');
      card.querySelector('#examFormCancel').onclick = () => { card.hidden = true; card.innerHTML = ''; };
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const existingId = form.getAttribute('data-id');
        let result;
        if (existingId) {
          const current = normalizeExam((exams || []).find((row) => row && row.id === existingId));
          result = applyEdit(current, {
            name: form.querySelector('#examName').value,
            date: form.querySelector('#examDate').value,
            subject: form.querySelector('#examSubject').value,
            fullScore: form.querySelector('#examFull').value,
            score: form.querySelector('#examScore').value,
            correct: form.querySelector('#examCorrect').value,
            wrong: form.querySelector('#examWrong').value,
            usedMinutes: form.querySelector('#examMinutes').value
          }, Date.now());
        } else result = readForm(form, '', Date.now());
        if (!result.ok) {
          if (typeof toast === 'function') toast(result.error);
          return;
        }
        try { await dbApi().putExam(result.exam); }
        catch (err) {
          if (typeof toast === 'function') toast('沒有寫入：' + err.message);
          return;
        }
        if (typeof toast === 'function') toast(existingId ? '已更新成績' : '已新增成績');
        mount(app);
      };
      const name = card.querySelector('#examName');
      if (name) name.focus();
    };
    const add = host.querySelector('#examAdd');
    if (add) add.onclick = () => openForm(null);
    host.querySelectorAll('[data-exam-edit]').forEach((btn) => {
      btn.onclick = () => {
        const row = (exams || []).find((item) => item && item.id === btn.getAttribute('data-exam-edit'));
        if (row) openForm(normalizeExam(row));
      };
    });
    host.querySelectorAll('[data-exam-del]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-exam-del');
        const ok = typeof confirmBox === 'function'
          ? await confirmBox('刪除這筆成績', '<p>刪除後進度頁不再把這一筆算進平均和折線。</p>', '刪除', true)
          : window.confirm('刪除這筆成績？');
        if (!ok) return;
        await dbApi().deleteExam(id);
        if (typeof toast === 'function') toast('已刪除成績');
        mount(app);
      };
    });
  }

  function mountSettings(el) {
    if (!el) return;
    const targets = normalizeTargetScores(window.settings && window.settings.targetScores);
    const fields = TARGET_IDS.map((id) => {
      const name = subjectName(id);
      const value = targets[id] == null ? '' : String(targets[id]);
      return '<label class="field"><span class="field-title">' + esc(name) + '目標分數</span>'
        + '<input type="number" min="0" max="100" step="0.1" inputmode="decimal" data-target="' + id + '" placeholder="未設定" value="' + esc(value) + '"></label>';
    }).join('');
    el.innerHTML = '<section class="card" id="targetScoreCard"><h2>各科目標分數</h2>'
      + '<p class="muted small">進度頁用這個分數和平均成績比差距。留空表示還沒設定，不會拿 0 分來比較。</p>'
      + fields
      + '<button type="button" class="btn btn-primary" id="targetScoreSave">儲存目標分數</button></section>';
    el.querySelector('#targetScoreSave').onclick = async () => {
      if (!window.settings) return;
      const prev = normalizeTargetScores(window.settings.targetScores);
      const next = Object.assign({}, prev);
      let bad = false;
      el.querySelectorAll('[data-target]').forEach((input) => {
        const id = input.getAttribute('data-target');
        const v = input.value.trim();
        if (v === '') { delete next[id]; return; }
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 100) bad = true;
        else next[id] = n;
      });
      if (bad) {
        if (typeof toast === 'function') toast('目標分數請填 0 到 100，或留空');
        return;
      }
      window.settings.targetScores = normalizeTargetScores(next);
      if (typeof saveSettings === 'function') await saveSettings('targetScores');
      if (typeof toast === 'function') toast('已儲存各科目標分數');
    };
  }

  async function commitMock(input) {
    const exam = buildMockExam(input || {});
    if (!exam) return { wrote: false, reason: 'invalid' };
    const api = (typeof globalThis !== 'undefined' && globalThis.StudyDB) || null;
    if (!api || !api.putExamOnce) return { wrote: false, reason: 'no-db', exam };
    return api.putExamOnce(exam);
  }

  return {
    SUBJECTS, TARGET_IDS, COLORS, EMPTY_COPY,
    subjectName, canonSubject, usedMinutes, percent, round1, fmtNum,
    normalizeExam, buildMockExam, buildManual, applyEdit, keepFirstExam, shouldRecordExam,
    normalizeTargetScores, targetScoresFromBackup, mergeExams, examsFromBackup,
    subjectStat, weakOrder, practiceRows, progressModel, lineSvg, progressHtml, formHtml,
    newSubmissionId, formatTaipei, taipeiDate,
    mount, mountSettings, commitMock
  };
});
