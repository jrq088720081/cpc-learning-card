/* 今日任務／讀書計畫。不碰 IndexedDB 的開啟與升級；讀寫走 StudyDB。
   已逾期不存檔，用到期日對台北今天現算。時數不從任務推。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.StudyTasks = api;
    root.TaskOS = api.TaskOS;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const PRIORITIES = [
    { id: 'high', name: '高' },
    { id: 'mid', name: '中' },
    { id: 'low', name: '低' }
  ];
  const STATUSES = [
    { id: 'todo', name: '待開始' },
    { id: 'doing', name: '進行中' },
    { id: 'done', name: '已完成' }
  ];
  const VIEWS = [
    { id: 'today', name: '今日' },
    { id: 'week', name: '本週' },
    { id: 'all', name: '全部' }
  ];
  const WEEKDAYS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
  const PRIORITY_RANK = { high: 0, mid: 1, low: 2 };

  function stats() {
    const s = (typeof globalThis !== 'undefined' && globalThis.StudyStats) || null;
    if (!s) throw new Error('StudyStats 尚未載入');
    return s;
  }

  function priorityName(id) {
    const row = PRIORITIES.find((p) => p.id === id);
    return row ? row.name : '中';
  }

  function statusName(id) {
    const row = STATUSES.find((p) => p.id === id);
    return row ? row.name : '待開始';
  }

  function subjectOk(id) {
    return stats().SUBJECTS.some((s) => s.id === id);
  }

  function normalizeTask(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = String(raw.id || '').trim().slice(0, 80);
    const title = String(raw.title || '').trim().slice(0, 80);
    if (!id || !title) return null;
    const subject = subjectOk(raw.subject) ? raw.subject : '';
    let chapterId = raw.chapterId ? String(raw.chapterId).slice(0, 40) : '';
    if (!subject) chapterId = '';
    let estMinutes = null;
    if (raw.estMinutes != null && raw.estMinutes !== '') {
      const n = Math.floor(Number(raw.estMinutes));
      if (Number.isFinite(n) && n >= 1 && n <= 720) estMinutes = n;
    }
    const dueRaw = String(raw.dueDate || '');
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : '';
    const priority = raw.priority === 'high' || raw.priority === 'low' ? raw.priority : 'mid';
    const status = raw.status === 'doing' || raw.status === 'done' ? raw.status : 'todo';
    const createdAt = Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : 0;
    const updatedAt = Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0;
    const doneNum = Number(raw.doneAt);
    const doneAt = status === 'done' ? (Number.isFinite(doneNum) ? doneNum : updatedAt) : null;
    return {
      id, title, subject, chapterId: chapterId || null, estMinutes, dueDate,
      priority, status, doneAt, createdAt, updatedAt
    };
  }

  function mergeTasks(local, incoming) {
    const map = new Map();
    const take = (raw) => {
      const n = normalizeTask(raw);
      if (!n) return;
      const old = map.get(n.id);
      if (!old || (n.updatedAt || 0) > (old.updatedAt || 0)) map.set(n.id, n);
    };
    (local || []).forEach(take);
    (incoming || []).forEach(take);
    return [...map.values()];
  }

  /** 舊備份沒有 tasks 陣列時，原樣留下本機任務。同 id 取 updatedAt 較新的一筆。 */
  function tasksFromBackup(local, data) {
    if (!data || !Array.isArray(data.tasks)) return mergeTasks(local, []);
    return mergeTasks(local, data.tasks);
  }

  function isOverdue(task, todayStr) {
    const t = normalizeTask(task);
    if (!t || !t.dueDate || t.status === 'done') return false;
    return t.dueDate < String(todayStr || '');
  }

  function weekDays(today) {
    const start = stats().weekStartMonday(today);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(stats().addDays(start, i));
    return days;
  }

  function sortTasks(list) {
    const rows = (list || []).map((t) => normalizeTask(t)).filter(Boolean);
    rows.sort((a, b) => {
      const ad = a.status === 'done' ? 1 : 0;
      const bd = b.status === 'done' ? 1 : 0;
      if (ad !== bd) return ad - bd;
      const adue = a.dueDate || '9999-12-31';
      const bdue = b.dueDate || '9999-12-31';
      if (adue !== bdue) return adue < bdue ? -1 : 1;
      const ap = PRIORITY_RANK[a.priority] ?? 1;
      const bp = PRIORITY_RANK[b.priority] ?? 1;
      if (ap !== bp) return ap - bp;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    return rows;
  }

  function matchesView(task, view, today) {
    const t = normalizeTask(task);
    if (!t) return false;
    if (view === 'all') return true;
    if (!t.dueDate) return false;
    if (view === 'week') {
      const days = weekDays(today);
      return t.dueDate >= days[0] && t.dueDate <= days[6];
    }
    if (t.dueDate === today) return true;
    return t.dueDate < today && t.status !== 'done';
  }

  function matchesFilter(task, subjectFilter, statusFilter) {
    const t = normalizeTask(task);
    if (!t) return false;
    if (subjectFilter === 'none' && t.subject) return false;
    if (subjectFilter && subjectFilter !== 'none' && t.subject !== subjectFilter) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    return true;
  }

  function visibleTasks(tasks, opts) {
    const o = opts || {};
    const today = o.today;
    const view = o.view || 'today';
    const rows = (tasks || [])
      .filter((t) => matchesFilter(t, o.subject || '', o.status || ''))
      .filter((t) => matchesView(t, view, today));
    return sortTasks(rows);
  }

  /** 今天到期的任務裡，已完成的比例。今天沒有到期任務時是空的，不是 0%。逾期不算進這格。 */
  function todayRate(tasks, today) {
    const due = (tasks || []).map(normalizeTask).filter((t) => t && t.dueDate === today);
    if (!due.length) return { empty: true, done: 0, total: 0, percent: null };
    const done = due.filter((t) => t.status === 'done').length;
    return { empty: false, done, total: due.length, percent: Math.round(done / due.length * 100) };
  }

  function rateText(rate) {
    if (!rate || rate.empty) return '今天沒有到期的任務';
    return '今日完成率 ' + rate.done + ' / ' + rate.total + '（' + rate.percent + '%）';
  }

  function buildTask(input) {
    const src = input || {};
    const title = String(src.title || '').trim().slice(0, 80);
    if (!title) return { ok: false, error: '請填任務名稱' };
    const subject = subjectOk(src.subject) ? src.subject : '';
    let chapterId = src.chapterId ? String(src.chapterId).slice(0, 40) : '';
    if (!subject) chapterId = '';
    if (chapterId && src.catalog) {
      const allowed = stats().chaptersFor(subject, src.catalog);
      if (!allowed.some((c) => c.id === chapterId)) return { ok: false, error: '這個章節不屬於所選科目' };
    }
    let estMinutes = null;
    if (src.estMinutes !== '' && src.estMinutes != null) {
      const n = Math.floor(Number(src.estMinutes));
      if (!Number.isFinite(n) || n < 1 || n > 720) return { ok: false, error: '預估分鐘請填 1 到 720，或留空' };
      estMinutes = n;
    }
    const dueDate = String(src.dueDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ok: false, error: '請選擇到期日' };
    if (src.priority !== 'high' && src.priority !== 'mid' && src.priority !== 'low') {
      return { ok: false, error: '請選優先順序' };
    }
    if (src.status !== 'todo' && src.status !== 'doing' && src.status !== 'done') {
      return { ok: false, error: '請選狀態' };
    }
    const id = String(src.id || '').trim().slice(0, 80);
    if (!id) return { ok: false, error: '缺少任務編號' };
    const updatedAt = Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : 0;
    const createdAt = Number.isFinite(Number(src.createdAt)) ? Number(src.createdAt) : updatedAt;
    const doneAt = src.status === 'done'
      ? (Number.isFinite(Number(src.doneAt)) && Number(src.doneAt) > 0 ? Number(src.doneAt) : updatedAt)
      : null;
    const task = normalizeTask({
      id, title, subject, chapterId: chapterId || null, estMinutes, dueDate,
      priority: src.priority, status: src.status, doneAt, createdAt, updatedAt
    });
    if (!task) return { ok: false, error: '這個任務無法儲存' };
    return { ok: true, task };
  }

  function withStatus(task, status, now) {
    const base = normalizeTask(task);
    if (!base) return null;
    if (status !== 'todo' && status !== 'doing' && status !== 'done') return null;
    return normalizeTask(Object.assign({}, base, {
      status,
      doneAt: status === 'done' ? (base.doneAt || now) : null,
      updatedAt: now
    }));
  }

  const TaskOS = createUI();

  function createUI() {
    let cache = [];
    let view = 'today';
    let subjectFilter = '';
    let statusFilter = '';
    let showForm = false;
    let draft = null;
    let expanded = false;

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function catalog() {
      return (typeof window !== 'undefined' && window.__PATH_CHAPTERS__) || { chapters: [] };
    }

    function todayStr() {
      return stats().taipeiDate(Date.now());
    }

    function newId() {
      if (typeof uid === 'function') return uid();
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return 'task-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function blankDraft() {
      return {
        id: '', title: '', subject: '', chapterId: '', estMinutes: '',
        dueDate: todayStr(), priority: 'mid', status: 'todo', createdAt: 0, doneAt: null
      };
    }

    function draftFrom(task) {
      return {
        id: task.id,
        title: task.title,
        subject: task.subject || '',
        chapterId: task.chapterId || '',
        estMinutes: task.estMinutes || '',
        dueDate: task.dueDate || todayStr(),
        priority: task.priority,
        status: task.status,
        createdAt: task.createdAt || 0,
        doneAt: task.doneAt || null
      };
    }

    function subjectOptions(selected, includeNone) {
      const head = includeNone ? '<option value="">不指定</option>' : '';
      return head + stats().SUBJECTS.map((s) => (
        '<option value="' + esc(s.id) + '"' + (s.id === selected ? ' selected' : '') + '>' + esc(s.name) + '</option>'
      )).join('');
    }

    function chapterOptions(subjectId, selected) {
      const list = subjectId ? stats().chaptersFor(subjectId, catalog()) : [];
      const opts = ['<option value="">不指定</option>'].concat(list.map((c) => (
        '<option value="' + esc(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>'
      )));
      return opts.join('');
    }

    function filterSubjectOptions() {
      return '<option value="">全部科目</option><option value="none"' + (subjectFilter === 'none' ? ' selected' : '') + '>不指定</option>' +
        stats().SUBJECTS.map((s) => (
          '<option value="' + esc(s.id) + '"' + (subjectFilter === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'
        )).join('');
    }

    function filterStatusOptions() {
      return '<option value="">全部狀態</option>' + STATUSES.map((s) => (
        '<option value="' + s.id + '"' + (statusFilter === s.id ? ' selected' : '') + '>' + s.name + '</option>'
      )).join('');
    }

    function shell() {
      const views = VIEWS.map((v) => (
        '<button type="button" data-view="' + v.id + '" class="' + (view === v.id ? 'on' : '') + '" role="tab" aria-selected="' + (view === v.id ? 'true' : 'false') + '">' + v.name + '</button>'
      )).join('');
      return `
        <section class="card task-card" id="taskCard" aria-label="今日任務">
          <div class="task-head">
            <div>
              <p class="kicker">讀書計畫</p>
              <h2>今日任務</h2>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="taskAdd" data-action="add">新增任務</button>
          </div>
          <p class="task-rate" id="taskRate" aria-live="polite"></p>
          <div class="seg task-views" id="taskViewRow" role="tablist" aria-label="任務檢視">${views}</div>
          <div class="task-filters" id="taskFilterRow">
            <label class="field"><span class="field-title">科目</span>
              <select id="taskSubjectFilter" aria-label="依科目篩選">${filterSubjectOptions()}</select></label>
            <label class="field"><span class="field-title">狀態</span>
              <select id="taskStatusFilter" aria-label="依狀態篩選">${filterStatusOptions()}</select></label>
          </div>
          <div id="taskFormSlot"></div>
          <div id="taskList"></div>
        </section>`;
    }

    function formHtml() {
      const d = draft || blankDraft();
      const pri = PRIORITIES.map((p) => (
        '<option value="' + p.id + '"' + (d.priority === p.id ? ' selected' : '') + '>' + p.name + '</option>'
      )).join('');
      const st = STATUSES.map((p) => (
        '<option value="' + p.id + '"' + (d.status === p.id ? ' selected' : '') + '>' + p.name + '</option>'
      )).join('');
      return `
        <form class="task-form" id="taskForm">
          <h3>${d.id ? '修改任務' : '新增任務'}</h3>
          <label class="field"><span class="field-title">名稱</span>
            <input type="text" id="taskTitle" maxlength="80" required value="${esc(d.title)}" placeholder="例如：練字音字形"></label>
          <label class="field"><span class="field-title">科目</span>
            <select id="taskSubject">${subjectOptions(d.subject, true)}</select></label>
          <label class="field"><span class="field-title">章節 <small>可不選</small></span>
            <select id="taskChapter" ${d.subject ? '' : 'disabled'}>${chapterOptions(d.subject, d.chapterId)}</select></label>
          <label class="field"><span class="field-title">預估分鐘 <small>可不填</small></span>
            <input type="number" id="taskEst" min="1" max="720" inputmode="numeric" value="${esc(d.estMinutes)}" placeholder="例如 40"></label>
          <label class="field"><span class="field-title">到期日</span>
            <input type="date" id="taskDue" required value="${esc(d.dueDate)}"></label>
          <div class="task-filters">
            <label class="field"><span class="field-title">優先</span>
              <select id="taskPriority">${pri}</select></label>
            <label class="field"><span class="field-title">狀態</span>
              <select id="taskStatus">${st}</select></label>
          </div>
          <div class="task-actions">
            <button type="submit" class="btn btn-primary">儲存</button>
            <button type="button" class="btn btn-soft" data-action="cancel">取消</button>
          </div>
        </form>`;
    }

    function readDraftFromDom() {
      const title = document.getElementById('taskTitle');
      if (!title || !draft) return;
      draft.title = title.value;
      draft.subject = document.getElementById('taskSubject').value;
      draft.chapterId = document.getElementById('taskChapter').value;
      draft.estMinutes = document.getElementById('taskEst').value;
      draft.dueDate = document.getElementById('taskDue').value;
      draft.priority = document.getElementById('taskPriority').value;
      draft.status = document.getElementById('taskStatus').value;
    }

    function taskLine(task, today) {
      const overdue = isOverdue(task, today);
      const sub = task.subject ? stats().subjectName(task.subject) : '不指定';
      const ch = task.chapterId ? stats().chapterName(task.chapterId, catalog()) : '';
      const bits = [sub];
      if (ch) bits.push(ch);
      if (task.dueDate) bits.push('到期 ' + task.dueDate);
      bits.push(priorityName(task.priority));
      bits.push(statusName(task.status));
      if (task.estMinutes) bits.push('約 ' + task.estMinutes + ' 分鐘');
      const doneLabel = task.status === 'done' ? '取消完成' : '完成';
      return `<li class="task-row${task.status === 'done' ? ' is-done' : ''}">
        <div class="task-main">
          <b>${esc(task.title)}</b>
          ${overdue ? '<span class="tag tag-over">已逾期</span>' : ''}
          <p class="muted small">${esc(bits.join('　·　'))}</p>
        </div>
        <div class="task-actions">
          <button type="button" class="btn btn-primary" data-action="toggle" data-id="${esc(task.id)}">${doneLabel}</button>
          <button type="button" class="btn btn-soft" data-action="pomo" data-id="${esc(task.id)}">開始番茄鐘</button>
          <button type="button" class="btn btn-soft" data-action="edit" data-id="${esc(task.id)}">修改</button>
          <button type="button" class="btn btn-text-bad" data-action="delete" data-id="${esc(task.id)}">刪除</button>
        </div>
      </li>`;
    }

    function listHtml() {
      const today = todayStr();
      const rows = visibleTasks(cache, { view, today, subject: subjectFilter, status: statusFilter });
      if (!cache.length) {
        return `<div class="study-empty" id="taskEmpty">
          <p>還沒有讀書任務。</p>
          <p>先寫下一件要讀的事，今天有到期的任務才算得出完成率。</p>
          <button type="button" class="btn btn-primary" data-action="add">新增第一個任務</button>
        </div>`;
      }
      if (!rows.length) {
        const empty = view === 'today'
          ? '今天沒有到期或逾期未完成的任務。'
          : view === 'week'
            ? '本週這七天沒有符合的任務。'
            : '沒有符合的任務。';
        return '<p class="study-empty">' + empty + '</p>';
      }
      if (view === 'week') {
        const days = weekDays(today);
        return '<ol class="task-week">' + days.map((date, i) => {
          const mine = rows.filter((t) => t.dueDate === date);
          const body = mine.length
            ? '<ul class="task-list">' + mine.map((t) => taskLine(t, today)).join('') + '</ul>'
            : '<p class="muted small task-day-empty">這天沒有任務</p>';
          const mark = date === today ? ' is-today' : '';
          return '<li class="task-day' + mark + '"><p class="task-day-label">' + WEEKDAYS[i] + '　' + esc(date) + '</p>' + body + '</li>';
        }).join('') + '</ol>';
      }
      const narrow = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
      const cap = view === 'today' && narrow && !expanded ? 5 : rows.length;
      const shown = rows.slice(0, cap);
      const more = rows.length - shown.length;
      const extra = more > 0
        ? '<button type="button" class="btn btn-soft" data-action="expand">還有 ' + more + ' 筆，展開</button>'
        : (view === 'today' && narrow && expanded && rows.length > 5
          ? '<button type="button" class="btn btn-soft" data-action="collapse">收合</button>'
          : '');
      return '<ul class="task-list">' + shown.map((t) => taskLine(t, today)).join('') + '</ul>' + extra;
    }

    function paint(el) {
      const rate = el.querySelector('#taskRate');
      const list = el.querySelector('#taskList');
      const slot = el.querySelector('#taskFormSlot');
      const add = el.querySelector('#taskAdd');
      if (rate) {
        if (!cache.length) {
          rate.textContent = '';
          rate.hidden = true;
        } else {
          rate.hidden = false;
          rate.textContent = rateText(todayRate(cache, todayStr()));
        }
      }
      if (add) add.hidden = !cache.length;
      const viewRow = el.querySelector('#taskViewRow');
      const filterRow = el.querySelector('#taskFilterRow');
      if (viewRow) viewRow.hidden = !cache.length;
      if (filterRow) filterRow.hidden = !cache.length;
      if (slot) slot.innerHTML = showForm ? formHtml() : '';
      if (list) list.innerHTML = listHtml();
      el.querySelectorAll('.task-views button').forEach((btn) => {
        const on = btn.getAttribute('data-view') === view;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    function findTask(id) {
      return cache.map((t) => normalizeTask(t)).find((t) => t && t.id === id) || null;
    }

    async function reload(el) {
      if (!window.StudyDB) {
        const list = el.querySelector('#taskList');
        if (list) list.innerHTML = '<p class="study-empty">資料庫尚未開啟。</p>';
        return;
      }
      const raw = await StudyDB.allTasks();
      cache = (raw || []).map(normalizeTask).filter(Boolean);
      paint(el);
    }

    function openForm(next) {
      draft = next;
      showForm = true;
    }

    async function onToggle(id) {
      const task = findTask(id);
      if (!task) return;
      const next = withStatus(task, task.status === 'done' ? 'todo' : 'done', Date.now());
      if (!next) return;
      await StudyDB.putTask(next);
      if (typeof toast === 'function') toast(next.status === 'done' ? '已標記完成' : '已改回待開始');
    }

    async function onDelete(id) {
      const task = findTask(id);
      if (!task) return;
      const ok = typeof confirmBox === 'function'
        ? await confirmBox('刪除這個任務？', '<p>' + esc(task.title) + '</p><p class="muted small">刪了就不會出現在今日、本週和全部。</p>', '刪除', true)
        : false;
      if (!ok) {
        if (typeof confirmBox !== 'function' && typeof toast === 'function') toast('未刪除');
        return;
      }
      await StudyDB.deleteTask(id);
      if (draft && draft.id === id) { showForm = false; draft = null; }
      if (typeof toast === 'function') toast('已刪除任務');
    }

    function onPomo(id) {
      const task = findTask(id);
      if (!task) return;
      const subject = document.getElementById('pomoSubject');
      if (!subject) {
        if (typeof toast === 'function') toast('這頁沒有番茄鐘');
        return;
      }
      const card = document.getElementById('pomoCard');
      if (subject.disabled) {
        if (card) card.scrollIntoView({ block: 'nearest' });
        if (typeof toast === 'function') toast('番茄鐘進行中，這一輪結束後再帶入科目');
        return;
      }
      if (!task.subject) {
        subject.focus();
        if (card) card.scrollIntoView({ block: 'nearest' });
        if (typeof toast === 'function') toast('這筆任務沒有指定科目，請在番茄鐘選科目');
        return;
      }
      subject.value = task.subject;
      subject.dispatchEvent(new Event('change'));
      const chapter = document.getElementById('pomoChapter');
      if (chapter && task.chapterId) {
        chapter.value = task.chapterId;
        if (chapter.value !== task.chapterId) chapter.value = '';
      }
      if (card) card.scrollIntoView({ block: 'nearest' });
      const label = stats().subjectName(task.subject);
      const ch = task.chapterId ? stats().chapterName(task.chapterId, catalog()) : '';
      if (typeof toast === 'function') toast('已帶入番茄鐘：' + label + (ch ? '　' + ch : ''));
    }

    async function onSubmit(el, e) {
      e.preventDefault();
      readDraftFromDom();
      const now = Date.now();
      const built = buildTask({
        id: draft.id || newId(),
        title: draft.title,
        subject: draft.subject,
        chapterId: draft.chapterId,
        estMinutes: draft.estMinutes,
        dueDate: draft.dueDate,
        priority: draft.priority,
        status: draft.status,
        createdAt: draft.id ? draft.createdAt : now,
        doneAt: draft.status === 'done' ? (draft.doneAt || now) : null,
        updatedAt: now,
        catalog: catalog()
      });
      if (!built.ok) {
        if (typeof toast === 'function') toast(built.error);
        return;
      }
      await StudyDB.putTask(built.task);
      showForm = false;
      draft = null;
      if (typeof toast === 'function') toast('已儲存任務');
      await reload(el);
    }

    function onClick(el, e) {
      const btn = e.target.closest('[data-action], [data-view]');
      if (!btn || !el.contains(btn)) return;
      const action = btn.getAttribute('data-action');
      const viewId = btn.getAttribute('data-view');
      if (viewId) {
        if (showForm) readDraftFromDom();
        view = viewId;
        expanded = false;
        paint(el);
        return;
      }
      if (action === 'add') {
        openForm(blankDraft());
        paint(el);
        const title = el.querySelector('#taskTitle');
        if (title) title.focus();
        return;
      }
      if (action === 'cancel') {
        showForm = false;
        draft = null;
        paint(el);
        return;
      }
      if (action === 'expand') { expanded = true; paint(el); return; }
      if (action === 'collapse') { expanded = false; paint(el); return; }
      const id = btn.getAttribute('data-id');
      if (action === 'edit') {
        const task = findTask(id);
        if (!task) return;
        openForm(draftFrom(task));
        paint(el);
        return;
      }
      if (action === 'toggle') {
        onToggle(id).then(() => reload(el)).catch((err) => console.error(err));
        return;
      }
      if (action === 'delete') {
        onDelete(id).then(() => reload(el)).catch((err) => console.error(err));
        return;
      }
      if (action === 'pomo') onPomo(id);
    }

    function onChange(el, e) {
      const t = e.target;
      if (!t || !el.contains(t)) return;
      if (t.id === 'taskSubjectFilter') {
        if (showForm) readDraftFromDom();
        subjectFilter = t.value;
        expanded = false;
        paint(el);
        return;
      }
      if (t.id === 'taskStatusFilter') {
        if (showForm) readDraftFromDom();
        statusFilter = t.value;
        expanded = false;
        paint(el);
        return;
      }
      if (t.id === 'taskSubject') {
        readDraftFromDom();
        draft.chapterId = '';
        const chapter = el.querySelector('#taskChapter');
        if (chapter) {
          chapter.disabled = !draft.subject;
          chapter.innerHTML = chapterOptions(draft.subject, '');
          chapter.value = '';
        }
      }
    }

    function mount(el) {
      if (!el || typeof document === 'undefined') return;
      el.innerHTML = shell();
      el.addEventListener('click', (e) => onClick(el, e));
      el.addEventListener('change', (e) => onChange(el, e));
      el.addEventListener('submit', (e) => { onSubmit(el, e).catch((err) => console.error(err)); });
      reload(el).catch((err) => console.error(err));
    }

    return { mount };
  }

  return {
    PRIORITIES, STATUSES, VIEWS, WEEKDAYS,
    normalizeTask, mergeTasks, tasksFromBackup, isOverdue, weekDays, sortTasks,
    matchesView, matchesFilter, visibleTasks, todayRate, rateText, buildTask, withStatus,
    priorityName, statusName,
    TaskOS
  };
});
