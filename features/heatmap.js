/* 讀書熱力圖與時數統計。分鐘只加總 studySessions，不用答題數推算。不碰 IndexedDB 升級。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StudyHeat = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SPANS = [
    { id: '12w', name: '近 12 週' },
    { id: '6m', name: '近 6 個月' },
    { id: '1y', name: '近一年' }
  ];
  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
  const HEAT_LABELS = ['0 分', '1–29 分', '30–59 分', '60–119 分', '120 分以上'];

  function stats() {
    const s = (typeof globalThis !== 'undefined' && globalThis.StudyStats) || null;
    if (!s) throw new Error('StudyStats 尚未載入');
    return s;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtDate(y, m, d) {
    return y + '-' + pad(m) + '-' + pad(d);
  }

  function addMonths(dateStr, n) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const day = Math.min(d, last);
    return fmtDate(first.getUTCFullYear(), first.getUTCMonth() + 1, day);
  }

  /** 0 分為空格。其餘四階：1–29、30–59、60–119、120+。 */
  function heatLevel(minutes) {
    const n = Math.floor(Number(minutes));
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n <= 29) return 1;
    if (n <= 59) return 2;
    if (n <= 119) return 3;
    return 4;
  }

  function normalizeWeeklyGoal(raw) {
    if (raw == null || raw === '') return null;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1 || n > 10080) return null;
    return n;
  }

  function weeklyGoalRate(weekMin, goal) {
    const g = normalizeWeeklyGoal(goal);
    const week = Math.max(0, Math.floor(Number(weekMin) || 0));
    if (g == null) return { set: false, rate: null, percent: null, goal: null, weekMin: week };
    return { set: true, rate: week / g, percent: Math.round(week / g * 100), goal: g, weekMin: week };
  }

  function goalText(goal) {
    if (!goal || !goal.set || goal.percent == null) return '尚未設定每週目標';
    return goal.percent + '%';
  }

  function weeklyGoalFromBackup(localGoal, settingsSlice, mode) {
    const local = normalizeWeeklyGoal(localGoal);
    if (!settingsSlice || typeof settingsSlice !== 'object' || Array.isArray(settingsSlice)) return local;
    if (!Object.prototype.hasOwnProperty.call(settingsSlice, 'weeklyGoalMinutes')) return local;
    const incoming = normalizeWeeklyGoal(settingsSlice.weeklyGoalMinutes);
    if (mode === 'overwrite') return incoming;
    return incoming == null ? local : incoming;
  }

  function eachSession(sessions, today, fn) {
    (sessions || []).forEach((raw) => {
      const s = stats().normalizeSession(raw);
      if (!s || s.minutes <= 0) return;
      if (today && s.date > today) return;
      fn(s);
    });
  }

  function minutesByDate(sessions, today) {
    const map = new Map();
    eachSession(sessions, today, (s) => {
      map.set(s.date, (map.get(s.date) || 0) + s.minutes);
    });
    return map;
  }

  function dayMinutes(sessions, date, today) {
    if (today && date > today) return 0;
    return minutesByDate(sessions, today).get(date) || 0;
  }

  function longestStreak(sessions, today) {
    const set = new Set();
    eachSession(sessions, today, (s) => set.add(s.date));
    const days = [...set].sort();
    if (!days.length) return 0;
    let best = 1;
    let cur = 1;
    for (let i = 1; i < days.length; i++) {
      if (stats().addDays(days[i - 1], 1) === days[i]) cur += 1;
      else cur = 1;
      if (cur > best) best = cur;
    }
    return best;
  }

  function summarizeStudy(sessions, nowMs, weeklyGoal) {
    const base = stats().summarize(sessions, nowMs);
    return {
      today: base.today,
      todayMin: base.todayMin,
      weekMin: base.weekMin,
      monthMin: base.monthMin,
      totalMin: base.totalMin,
      streak: base.streak,
      longest: longestStreak(sessions, base.today),
      goal: weeklyGoalRate(base.weekMin, weeklyGoal),
      hasStudy: base.hasStudy
    };
  }

  function heatRange(today, span) {
    const endMonday = stats().weekStartMonday(today);
    let startMonday;
    if (span === '6m') startMonday = stats().weekStartMonday(addMonths(today, -6));
    else if (span === '1y') startMonday = stats().weekStartMonday(addMonths(today, -12));
    else startMonday = stats().addDays(endMonday, -7 * 11);
    if (startMonday > endMonday) startMonday = endMonday;
    const weeks = [];
    let cursor = startMonday;
    let guard = 0;
    while (cursor <= endMonday && guard < 60) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const date = stats().addDays(cursor, i);
        days.push(date);
      }
      weeks.push({ start: cursor, days });
      cursor = stats().addDays(cursor, 7);
      guard += 1;
    }
    return { span: span === '6m' || span === '1y' ? span : '12w', start: startMonday, end: stats().addDays(endMonday, 6), weeks };
  }

  function heatCells(sessions, today, span) {
    const range = heatRange(today, span);
    const byDate = minutesByDate(sessions, today);
    const weeks = range.weeks.map((week) => ({
      start: week.start,
      month: week.days[0].slice(0, 7),
      days: week.days.map((date) => {
        const future = date > today;
        const minutes = future ? 0 : (byDate.get(date) || 0);
        return { date, minutes, level: heatLevel(minutes), future };
      })
    }));
    return { span: range.span, start: range.start, end: range.end, weeks };
  }

  function dailySeries(sessions, today, days) {
    const n = days || 14;
    const byDate = minutesByDate(sessions, today);
    const rows = [];
    for (let i = n - 1; i >= 0; i--) {
      const date = stats().addDays(today, -i);
      const minutes = byDate.get(date) || 0;
      rows.push({ date, label: date, short: String(Number(date.slice(8))), minutes });
    }
    return rows;
  }

  function weeklySeries(sessions, today, weeks) {
    const n = weeks || 8;
    const end = stats().weekStartMonday(today);
    const byDate = minutesByDate(sessions, today);
    const rows = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = stats().addDays(end, -7 * i);
      let minutes = 0;
      for (let d = 0; d < 7; d++) {
        const date = stats().addDays(start, d);
        if (date <= today) minutes += byDate.get(date) || 0;
      }
      rows.push({
        start,
        label: start,
        short: Number(start.slice(5, 7)) + '/' + Number(start.slice(8)),
        minutes
      });
    }
    return rows;
  }

  function monthlySeries(sessions, today, months) {
    const n = months || 6;
    const keys = [];
    for (let i = n - 1; i >= 0; i--) keys.push(addMonths(today, -i).slice(0, 7));
    const totals = new Map(keys.map((k) => [k, 0]));
    eachSession(sessions, today, (s) => {
      const key = s.date.slice(0, 7);
      if (totals.has(key)) totals.set(key, totals.get(key) + s.minutes);
    });
    return keys.map((key, i) => {
      const prev = i ? keys[i - 1] : '';
      const month = Number(key.slice(5));
      const short = !prev || prev.slice(0, 4) !== key.slice(0, 4) ? key.slice(2, 4) + '/' + month : month + '月';
      return { key, label: key, short, minutes: totals.get(key) || 0 };
    });
  }

  function subjectSeries(sessions, today) {
    return stats().subjectMinuteShares(sessions, today).rows;
  }

  function chartHasMinutes(rows) {
    return (rows || []).some((r) => r && r.minutes > 0);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function yTicks(max) {
    if (max <= 0) return [];
    const mid = Math.round(max / 2);
    if (mid <= 0 || mid === max) return [max];
    return [mid, max];
  }

  function barSvg(rows, aria) {
    if (!chartHasMinutes(rows)) return '';
    const w = 320;
    const h = 168;
    const padL = 36;
    const padR = 8;
    const padT = 10;
    const padB = 28;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const max = Math.max(...rows.map((r) => r.minutes));
    const n = rows.length;
    const gap = n > 10 ? 3 : 6;
    const bw = Math.max(1, (innerW - gap * (n - 1)) / n);
    let body = '';
    yTicks(max).forEach((t) => {
      const y = padT + innerH - (t / max) * innerH;
      body += '<line class="chart-axis" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + y.toFixed(1) + '"></line>';
      body += '<text class="chart-label" x="' + (padL - 4) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + t + '</text>';
    });
    const base = padT + innerH;
    body += '<line class="chart-axis" x1="' + padL + '" y1="' + base + '" x2="' + (w - padR) + '" y2="' + base + '"></line>';
    rows.forEach((r, i) => {
      const bh = (r.minutes / max) * innerH;
      const x = padL + i * (bw + gap);
      const y = base - bh;
      body += '<rect class="chart-bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, bh).toFixed(1) + '" rx="2"><title>' + esc(r.label) + ' ' + r.minutes + ' 分鐘</title></rect>';
      const show = n <= 8 || i % 2 === 0 || i === n - 1;
      if (show) {
        body += '<text class="chart-label" x="' + (x + bw / 2).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle">' + esc(r.short || r.label) + '</text>';
      }
    });
    return '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(aria) + '">' + body + '</svg>';
  }

  function subjectSvg(rows, aria) {
    const shown = (rows || []).filter((r) => r.minutes > 0);
    if (!shown.length) return '';
    const w = 320;
    const rowH = 32;
    const h = 8 + shown.length * rowH;
    const max = Math.max(...shown.map((r) => r.minutes));
    const labelW = 78;
    const barX = labelW;
    const barMax = w - labelW - 100;
    let body = '';
    shown.forEach((r, i) => {
      const y = 8 + i * rowH;
      const bw = Math.max(2, (r.minutes / max) * barMax);
      body += '<text class="chart-label chart-name" x="0" y="' + (y + 16) + '">' + esc(r.name) + '</text>';
      body += '<rect class="chart-track" x="' + barX + '" y="' + (y + 6) + '" width="' + barMax + '" height="12" rx="6"></rect>';
      body += '<rect class="chart-bar tone-' + esc(r.id) + '" x="' + barX + '" y="' + (y + 6) + '" width="' + bw.toFixed(1) + '" height="12" rx="6"><title>' + esc(r.name) + ' ' + r.minutes + ' 分鐘</title></rect>';
      body += '<text class="chart-label" x="' + (w - 2) + '" y="' + (y + 16) + '" text-anchor="end">' + r.minutes + '分 ' + r.percent + '%</text>';
    });
    return '<svg class="chart-svg chart-svg-rows" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(aria) + '">' + body + '</svg>';
  }

  function seriesAria(title, rows) {
    const bits = rows.filter((r) => r.minutes > 0).map((r) => (r.label || r.short) + ' ' + r.minutes + ' 分鐘');
    if (!bits.length) return title + '，沒有學習紀錄';
    return title + '。' + bits.join('，');
  }

  function chartBlock(title, rows, svg) {
    if (!chartHasMinutes(rows)) {
      return '<section class="heat-chart"><h3>' + esc(title) + '</h3><p class="study-empty">這段還沒有學習紀錄。</p></section>';
    }
    return '<section class="heat-chart"><h3>' + esc(title) + '</h3>' + svg + '</section>';
  }

  const HeatUI = createUI();

  function createUI() {
    let span = '12w';
    let selected = '';

    function place(app) {
      let host = app.querySelector('#heatOs');
      if (host) return host;
      host = document.createElement('div');
      host.id = 'heatOs';
      const grid = app.querySelector('.subj-grid');
      if (grid && grid.parentNode) grid.parentNode.insertBefore(host, grid.nextSibling);
      else app.insertBefore(host, app.firstChild);
      return host;
    }

    function statTile(value, unit, label) {
      return '<div class="heat-stat"><b>' + esc(value) + '</b>' + (unit ? '<small>' + esc(unit) + '</small>' : '') + '<span>' + esc(label) + '</span></div>';
    }

    function tiles(sum) {
      const goal = sum.goal;
      const goalTile = !goal.set
        ? '<div class="heat-stat heat-stat-wide"><b class="heat-goal-empty">尚未設定每週目標</b><span>週目標完成率</span></div>'
        : '<div class="heat-stat"><b>' + goal.percent + '%</b><small>' + goal.weekMin + ' / ' + goal.goal + ' 分鐘</small><span>週目標完成率</span></div>';
      const t = stats().formatStat(sum.todayMin);
      const w = stats().formatStat(sum.weekMin);
      const m = stats().formatStat(sum.monthMin);
      const all = stats().formatStat(sum.totalMin);
      return [
        statTile(t.value, t.unit, '今日'),
        statTile(w.value, w.unit, '本週'),
        statTile(m.value, m.unit, '本月'),
        statTile(all.value, all.unit, '累計'),
        statTile(String(sum.streak), '天', '目前連續'),
        statTile(String(sum.longest), '天', '最長連續'),
        goalTile
      ].join('');
    }

    function monthLabels(weeks) {
      let prev = '';
      return weeks.map((week) => {
        const key = week.days[0].date.slice(0, 7);
        let text = '';
        if (key !== prev) {
          const month = Number(key.slice(5));
          text = !prev || prev.slice(0, 4) !== key.slice(0, 4) ? key.slice(2, 4) + '/' + month : month + '月';
          prev = key;
        }
        return text;
      });
    }

    function gridHtml(model) {
      const labels = monthLabels(model.weeks);
      const cols = model.weeks.map((week, i) => {
        const cells = week.days.map((day) => {
          const label = day.date + '　' + day.minutes + ' 分鐘';
          const on = selected === day.date ? ' on' : '';
          return '<button type="button" class="heat-cell heat-' + day.level + on + '" data-date="' + day.date + '" data-label="' + esc(label) + '" aria-label="' + esc(label) + '"></button>';
        }).join('');
        return '<div class="heat-col"><span class="heat-month">' + esc(labels[i]) + '</span><div class="heat-cells">' + cells + '</div></div>';
      }).join('');
      const days = WEEKDAYS.map((name) => '<span>' + name + '</span>').join('');
      const legend = HEAT_LABELS.map((text, level) => (
        '<span class="heat-key"><i class="heat-cell heat-' + level + '" aria-hidden="true"></i>' + esc(text) + '</span>'
      )).join('');
      const total = model.weeks.reduce((sum, week) => sum + week.days.reduce((s, d) => s + d.minutes, 0), 0);
      const note = total > 0 ? '' : '<p class="study-empty">這段期間沒有學習紀錄，空格就是 0 分。</p>';
      const detail = selected
        ? (model.weeks.flatMap((w) => w.days).find((d) => d.date === selected) || null)
        : null;
      const detailText = detail ? detail.date + '　' + detail.minutes + ' 分鐘' : '點一個方格，看當天日期和分鐘數。';
      return note + `
        <div class="heat-board">
          <div class="heat-days" aria-hidden="true">${days}</div>
          <div class="heat-scroll"><div class="heat-cols">${cols}</div></div>
        </div>
        <p class="heat-legend">${legend}</p>
        <p class="heat-detail" id="heatDetail" aria-live="polite">${esc(detailText)}</p>`;
    }

    function html(sum, sessions) {
      const today = sum.today;
      const model = heatCells(sessions, today, span);
      const daily = dailySeries(sessions, today, 14);
      const weekly = weeklySeries(sessions, today, 8);
      const monthly = monthlySeries(sessions, today, 6);
      const subjects = subjectSeries(sessions, today);
      const spans = SPANS.map((s) => (
        '<button type="button" data-span="' + s.id + '" class="' + (span === s.id ? 'on' : '') + '" role="tab" aria-selected="' + (span === s.id ? 'true' : 'false') + '">' + s.name + '</button>'
      )).join('');
      const emptyLead = sum.hasStudy ? '' : '<p class="study-empty">還沒有學習紀錄。</p>';
      return `
        <section class="card heat-card" id="heatCard" aria-label="讀書時數統計">
          <p class="kicker">實際紀錄</p>
          <h2>讀書時數</h2>
          <p class="muted small">系統統計。番茄鐘、手動補登和國文作文都算進總時數與熱力圖，沒有用答題數推算。</p>
          ${emptyLead}
          <div class="heat-stats">${tiles(sum)}</div>
          <h3>讀書熱力圖</h3>
          <div class="seg heat-range" role="tablist" aria-label="熱力圖範圍">${spans}</div>
          <p class="muted small">每列從週一開始。0 分是空格；有讀書的日子分四階：1–29、30–59、60–119、120 分以上。</p>
          ${gridHtml(model)}
          ${chartBlock('近 14 天每日', daily, barSvg(daily, seriesAria('近 14 天每日讀書分鐘', daily)))}
          ${chartHasMinutes(subjects)
            ? '<section class="heat-chart" id="heatSubjects"><h3>各科時間比例</h3><p class="muted small">國文作文另列，不算進國文。上面的每日長條和熱力圖仍把作文算進當天總分鐘。</p>' + subjectSvg(subjects, seriesAria('各科讀書分鐘', subjects.map((s) => ({ label: s.name, minutes: s.minutes })))) + '</section>'
            : '<section class="heat-chart" id="heatSubjects"><h3>各科時間比例</h3><p class="study-empty">這段還沒有學習紀錄。</p></section>'}
          ${chartBlock('近 8 週每週', weekly, barSvg(weekly, seriesAria('近 8 週每週讀書分鐘', weekly)))}
          ${chartBlock('近 6 個月每月', monthly, barSvg(monthly, seriesAria('近 6 個月每月讀書分鐘', monthly)))}
        </section>`;
    }

    function scrollRecent(host) {
      const sc = host.querySelector('.heat-scroll');
      if (!sc) return;
      const go = () => { sc.scrollLeft = sc.scrollWidth; };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
      else go();
    }

    async function paint(host) {
      if (!window.StudyDB) {
        host.innerHTML = '<section class="card heat-card"><h2>讀書時數</h2><p class="study-empty">資料庫尚未開啟。</p></section>';
        return;
      }
      const sessions = await StudyDB.allSessions();
      const goal = window.settings ? window.settings.weeklyGoalMinutes : null;
      const sum = summarizeStudy(sessions, Date.now(), goal);
      host.innerHTML = html(sum, sessions);
      scrollRecent(host);
    }

    function bind(host) {
      host.addEventListener('click', (e) => {
        const spanBtn = e.target.closest('[data-span]');
        if (spanBtn && host.contains(spanBtn)) {
          span = spanBtn.getAttribute('data-span') || '12w';
          paint(host).catch((err) => console.error(err));
          return;
        }
        const cell = e.target.closest('.heat-cell[data-date]');
        if (!cell || !host.contains(cell)) return;
        selected = cell.getAttribute('data-date') || '';
        host.querySelectorAll('.heat-cell.on').forEach((el) => el.classList.remove('on'));
        cell.classList.add('on');
        const detail = host.querySelector('#heatDetail');
        if (detail) detail.textContent = cell.getAttribute('data-label') || '';
      });
    }

    function mount(app) {
      if (!app || typeof document === 'undefined') return;
      const host = place(app);
      if (!host.dataset.bound) {
        host.dataset.bound = '1';
        bind(host);
      }
      paint(host).catch((err) => console.error(err));
    }

    function mountSettings(el) {
      if (!el || typeof document === 'undefined') return;
      const goal = normalizeWeeklyGoal(window.settings && window.settings.weeklyGoalMinutes);
      el.innerHTML = `
        <section class="card" id="weeklyGoalCard">
          <h2>每週讀書目標</h2>
          <p class="muted small">進度頁用這個分鐘數計算週目標完成率。留空時，那裡顯示「尚未設定每週目標」，不會出現百分比。</p>
          <label class="field"><span class="field-title">每週目標（分鐘）</span>
            <input type="number" id="weeklyGoalInput" min="1" max="10080" inputmode="numeric" placeholder="600" value="${goal == null ? '' : goal}"></label>
          <div class="task-actions">
            <button type="button" class="btn btn-primary" id="weeklyGoalSave">儲存</button>
            <button type="button" class="btn btn-soft" id="weeklyGoalClear">清除目標</button>
          </div>
        </section>`;
      const input = el.querySelector('#weeklyGoalInput');
      el.querySelector('#weeklyGoalSave').onclick = async () => {
        const raw = input.value.trim();
        if (!raw) {
          if (typeof toast === 'function') toast('請輸入分鐘數，或按清除目標');
          return;
        }
        const next = normalizeWeeklyGoal(raw);
        if (next == null) {
          if (typeof toast === 'function') toast('請填 1 到 10080 的整數分鐘');
          return;
        }
        window.settings.weeklyGoalMinutes = next;
        input.value = String(next);
        if (typeof saveSettings === 'function') await saveSettings('weeklyGoalMinutes');
        if (typeof toast === 'function') toast('已儲存每週目標');
      };
      el.querySelector('#weeklyGoalClear').onclick = async () => {
        window.settings.weeklyGoalMinutes = null;
        input.value = '';
        if (typeof saveSettings === 'function') await saveSettings('weeklyGoalMinutes');
        if (typeof toast === 'function') toast('已清除每週目標');
      };
    }

    return { mount, mountSettings };
  }

  return {
    SPANS, HEAT_LABELS,
    addMonths, heatLevel, normalizeWeeklyGoal, weeklyGoalRate, goalText, weeklyGoalFromBackup,
    dayMinutes, minutesByDate, longestStreak, summarizeStudy,
    heatRange, heatCells, dailySeries, weeklySeries, monthlySeries, subjectSeries,
    chartHasMinutes, barSvg, subjectSvg,
    HeatUI,
    mount: HeatUI.mount,
    mountSettings: HeatUI.mountSettings
  };
});
