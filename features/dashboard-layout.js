/* 可重用的格線版面。今日頁用 12 欄；其他頁之後可傳自己的 finders。
   位置與大小以格為單位，存 meta 的 dashboardLayout（含版本），不升 IndexedDB。
   拖曳用 Pointer Events。窄於 1024px 維持原本的單欄，不進入編輯。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DashLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const LAYOUT_VERSION = 1;
  const COLS = 12;
  const META_KEY = 'dashboardLayout';
  const DESKTOP_MIN = 1024;
  const MAX_H = 80;

  const SPECS = {
    exam: { minW: 4, minH: 3, label: '考試倒數' },
    quote: { minW: 4, minH: 3, label: '語錄' },
    study: { minW: 4, minH: 4, label: '學習時數' },
    pomo: { minW: 4, minH: 4, label: '番茄鐘' },
    tasks: { minW: 4, minH: 4, label: '今日任務' },
    today: { minW: 4, minH: 4, label: '今日該做' },
    next: { minW: 3, minH: 3, label: '下一個章節' },
    due: { minW: 3, minH: 3, label: '待複習' },
    alerts: { minW: 4, minH: 2, label: '提醒' },
    extra: { minW: 4, minH: 3, label: '其他分頁' },
    backup: { minW: 4, minH: 2, label: '備份' },
    tips: { minW: 4, minH: 3, label: '備考技巧' }
  };

  const HOME_ROWS = [
    { ids: ['exam', 'quote'], h: 6 },
    { ids: ['study', 'pomo'], h: 14 },
    { ids: ['tasks', 'today'], h: 18 },
    { ids: ['next', 'due'], h: 7 },
    { ids: ['alerts'], h: 4 },
    { ids: ['extra'], h: 6 },
    { ids: ['backup', 'tips'], h: 8 }
  ];

  const HOME_FINDERS = [
    ['exam', (root) => root.querySelector('.exam-strip')],
    ['quote', (root) => root.querySelector('#quoteCard')],
    ['study', (root) => root.querySelector('#studyCard')],
    ['pomo', (root) => root.querySelector('#pomoCard')],
    ['tasks', (root) => root.querySelector('#taskCard')],
    ['alerts', (root) => root.querySelector('[data-dash="alerts"]')],
    ['today', (root) => root.querySelector('[data-dash="today"]')],
    ['extra', (root) => root.querySelector('[data-dash="extra"]')],
    ['next', (root) => root.querySelector('[data-dash="next"]')],
    ['due', (root) => root.querySelector('[data-dash="due"]')],
    ['backup', (root) => root.querySelector('[data-dash="backup"]')],
    ['tips', (root) => root.querySelector('[data-dash="tips"]')]
  ];

  function specOf(id) {
    return SPECS[id] || { minW: 3, minH: 3, placeW: COLS, placeH: 4, label: String(id || '卡片') };
  }

  function clampInt(n, min, max) {
    let v = Math.round(Number(n));
    if (!Number.isFinite(v)) v = min;
    if (v < min) v = min;
    if (v > max) v = max;
    return v;
  }

  function clampItem(item, spec) {
    const rule = spec || specOf(item && item.id);
    const w = clampInt(item && item.w, rule.minW, COLS);
    const h = clampInt(item && item.h, rule.minH, MAX_H);
    let x = clampInt(item && item.x, 0, COLS);
    const y = Math.max(0, Math.round(Number(item && item.y) || 0));
    if (x + w > COLS) x = Math.max(0, COLS - w);
    return { id: String(item && item.id || ''), x, y, w, h };
  }

  function overlaps(a, b) {
    if (!a || !b || a.id === b.id) return false;
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function hasOverlap(items) {
    const list = items || [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (overlaps(list[i], list[j])) return true;
      }
    }
    return false;
  }

  /** 以格子步距吸附。stride 是一格加間距的像素，回傳 0 起算的格索引。 */
  function snapIndex(px, stride) {
    const n = Number(px);
    const s = Number(stride);
    if (!Number.isFinite(n) || !Number.isFinite(s) || s <= 0) return 0;
    return Math.max(0, Math.round(n / s));
  }

  /** 像素長度吸附成格數，不小於 min。 */
  function snapSpan(px, stride, min) {
    const minN = Math.max(1, Math.round(Number(min) || 1));
    return Math.max(minN, snapIndex(px, stride));
  }

  /**
   * 被移動的那張留在新位置。撞到的卡片往下讓，直到不重疊。
   * 不往上擠，避免蓋掉使用者自己排好的空位。
   */
  function resolveItems(items, activeId) {
    const list = (items || []).map((it) => clampItem(it, specOf(it.id))).filter((it) => it.id);
    const map = new Map(list.map((it) => [it.id, it]));
    const rest = list
      .filter((it) => it.id !== activeId)
      .sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const order = [];
    if (activeId && map.has(activeId)) order.push(map.get(activeId));
    rest.forEach((it) => order.push(it));
    const placed = [];
    order.forEach((src) => {
      let item = { id: src.id, x: src.x, y: src.y, w: src.w, h: src.h };
      let guard = 0;
      while (placed.some((p) => overlaps(p, item)) && guard < 400) {
        const hits = placed.filter((p) => overlaps(p, item));
        const bottom = Math.max.apply(null, hits.map((p) => p.y + p.h));
        item = { id: item.id, x: item.x, y: Math.max(item.y + 1, bottom), w: item.w, h: item.h };
        guard += 1;
      }
      placed.push(item);
    });
    return placed;
  }

  function pack(layout, items) {
    return {
      version: LAYOUT_VERSION,
      cols: COLS,
      savedAt: layout && layout.savedAt ? Number(layout.savedAt) || 0 : 0,
      items
    };
  }

  function defaultLayout(ids) {
    const set = new Set();
    const order = [];
    (ids || []).forEach((id) => {
      const key = String(id || '').trim();
      if (!key || set.has(key)) return;
      set.add(key);
      order.push(key);
    });
    const items = [];
    let y = 0;
    HOME_ROWS.forEach((row) => {
      const present = row.ids.filter((id) => set.has(id));
      if (!present.length) return;
      if (present.length === 1) {
        items.push(clampItem({ id: present[0], x: 0, y, w: COLS, h: row.h }, specOf(present[0])));
      } else {
        const w = Math.floor(COLS / present.length);
        present.forEach((id, i) => {
          const width = i === present.length - 1 ? COLS - w * i : w;
          items.push(clampItem({ id, x: w * i, y, w: width, h: row.h }, specOf(id)));
        });
      }
      y += row.h;
    });
    order.forEach((id) => {
      if (items.some((it) => it.id === id)) return;
      const spec = specOf(id);
      const h = Math.max(spec.minH, spec.placeH || 4);
      const w = Math.min(COLS, Math.max(spec.minW, spec.placeW || COLS));
      items.push(clampItem({ id, x: 0, y, w, h }, spec));
      y += h;
    });
    return { version: LAYOUT_VERSION, cols: COLS, savedAt: 0, items };
  }

  function restoreDefault(ids) {
    return defaultLayout(ids);
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!Array.isArray(raw.items)) return null;
    const seen = new Set();
    const items = [];
    raw.items.forEach((it) => {
      if (!it || typeof it !== 'object') return;
      const id = String(it.id || '').trim();
      if (!id || seen.has(id)) return;
      if (![it.x, it.y, it.w, it.h].every((n) => Number.isFinite(Number(n)))) return;
      seen.add(id);
      items.push(clampItem({ id, x: it.x, y: it.y, w: it.w, h: it.h }, specOf(id)));
    });
    if (!items.length) return null;
    return {
      version: LAYOUT_VERSION,
      cols: COLS,
      savedAt: Number(raw.savedAt) || 0,
      items: resolveItems(items, null)
    };
  }

  /** 已存的卡片留在原位；這次才出現、或不在存檔裡的卡片接到最下面。 */
  function layoutFor(presentIds, saved) {
    const ids = [];
    (presentIds || []).forEach((id) => {
      const key = String(id || '').trim();
      if (key && !ids.includes(key)) ids.push(key);
    });
    const clean = sanitize(saved);
    if (!clean) return defaultLayout(ids);
    const have = new Set(clean.items.map((it) => it.id));
    const placed = clean.items.filter((it) => ids.includes(it.id)).map((it) => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h }));
    const missing = ids.filter((id) => !have.has(id));
    let y = placed.reduce((m, it) => Math.max(m, it.y + it.h), 0);
    missing.forEach((id) => {
      const spec = specOf(id);
      const h = Math.max(spec.minH, spec.placeH || 4);
      const w = Math.min(COLS, Math.max(spec.minW, spec.placeW || COLS));
      placed.push(clampItem({ id, x: 0, y, w, h }, spec));
      y += h;
    });
    return {
      version: LAYOUT_VERSION,
      cols: COLS,
      savedAt: clean.savedAt || 0,
      items: resolveItems(placed, null)
    };
  }

  function moveItem(layout, id, x, y) {
    const base = layout && Array.isArray(layout.items) ? layout : { items: [], savedAt: 0 };
    const items = base.items.map((it) => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h }));
    const idx = items.findIndex((it) => it.id === id);
    if (idx < 0) return pack(base, resolveItems(items, null));
    items[idx] = clampItem({ id, x, y, w: items[idx].w, h: items[idx].h }, specOf(id));
    return pack(base, resolveItems(items, id));
  }

  function resizeItem(layout, id, w, h) {
    const base = layout && Array.isArray(layout.items) ? layout : { items: [], savedAt: 0 };
    const items = base.items.map((it) => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h }));
    const idx = items.findIndex((it) => it.id === id);
    if (idx < 0) return pack(base, resolveItems(items, null));
    items[idx] = clampItem({ id, x: items[idx].x, y: items[idx].y, w, h }, specOf(id));
    return pack(base, resolveItems(items, id));
  }

  /** 方向鍵移動一格；帶 dw／dh 時改寬高（鍵盤的 Shift＋方向鍵）。 */
  function nudge(layout, id, dx, dy, dw, dh) {
    const it = layout && layout.items && layout.items.find((row) => row.id === id);
    if (!it) return layout;
    if (dw || dh) return resizeItem(layout, id, it.w + (dw || 0), it.h + (dh || 0));
    return moveItem(layout, id, it.x + (dx || 0), it.y + (dy || 0));
  }

  function layoutFromBackup(current, incoming, mode) {
    const cur = sanitize(current);
    const inc = sanitize(incoming);
    if (!inc) return cur;
    if (mode === 'overwrite') return inc;
    if (!cur) return inc;
    return (Number(inc.savedAt) || 0) >= (Number(cur.savedAt) || 0) ? inc : cur;
  }

  function mergeStore(previous, live) {
    const prev = sanitize(previous);
    const liveItems = (live && live.items) || [];
    const liveIds = new Set(liveItems.map((it) => it.id));
    const kept = ((prev && prev.items) || []).filter((it) => it && it.id && !liveIds.has(it.id));
    const merged = {
      version: LAYOUT_VERSION,
      cols: COLS,
      savedAt: Date.now(),
      items: liveItems.map((it) => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h })).concat(
        kept.map((it) => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h }))
      )
    };
    const clean = sanitize(merged);
    if (!clean) return merged;
    clean.savedAt = merged.savedAt;
    return clean;
  }

  let mounted = null;

  function isDesktop() {
    return typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(min-width: ' + DESKTOP_MIN + 'px)').matches;
  }

  function hasContent(el) {
    if (!el) return false;
    if (el.querySelector('img, svg, button, a, input, textarea, select, canvas')) return true;
    return (el.textContent || '').trim().length > 0;
  }

  function fieldTarget(el) {
    if (!el || !el.closest) return false;
    return !!el.closest('input, textarea, select, [contenteditable="true"]');
  }

  function detach() {
    if (!mounted) return;
    const state = mounted;
    mounted = null;
    if (state.mq) state.mq.removeEventListener('change', state.onMode);
    if (state.tools) {
      state.tools.replaceChildren();
      state.tools.classList.remove('is-on');
      state.tools.hidden = true;
    }
    if (state.root) state.root.classList.remove('dash-on');
  }

  function mount(root, options) {
    detach();
    if (!root || typeof document === 'undefined') return;
    const opts = options || {};
    const finders = opts.finders || HOME_FINDERS;
    const found = [];
    finders.forEach(([id, find]) => {
      const el = find(root);
      if (!hasContent(el)) return;
      if (found.some((row) => row.id === id || row.node === el)) return;
      found.push({ id, node: el });
    });
    if (!found.length) return;

    const board = document.createElement('div');
    board.id = 'dashBoard';
    board.className = 'dash-board';
    const cards = found.map((row) => {
      const spec = specOf(row.id);
      const item = document.createElement('div');
      item.className = 'dash-item';
      item.dataset.dashId = row.id;
      const chrome = document.createElement('div');
      chrome.className = 'dash-chrome';
      chrome.hidden = true;
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'dash-handle';
      handle.dataset.drag = row.id;
      handle.setAttribute('aria-label', '拖曳「' + spec.label + '」的位置');
      const grip = document.createElement('span');
      grip.setAttribute('aria-hidden', 'true');
      grip.textContent = '⠿';
      handle.appendChild(grip);
      const name = document.createElement('span');
      name.className = 'dash-name';
      name.textContent = spec.label;
      chrome.appendChild(handle);
      chrome.appendChild(name);
      const body = document.createElement('div');
      body.className = 'dash-body';
      row.node.parentNode.insertBefore(item, row.node);
      body.appendChild(row.node);
      const resize = document.createElement('button');
      resize.type = 'button';
      resize.className = 'dash-resize';
      resize.hidden = true;
      resize.dataset.resize = row.id;
      resize.setAttribute('aria-label', '拖曳調整「' + spec.label + '」的寬高');
      item.appendChild(chrome);
      item.appendChild(body);
      item.appendChild(resize);
      return { id: row.id, el: item, label: spec.label };
    });

    const anchor = cards[0].el;
    anchor.parentNode.insertBefore(board, anchor);
    cards.forEach((card) => board.appendChild(card.el));
    ['studyOs', 'taskOs'].forEach((id) => {
      const shell = document.getElementById(id);
      if (shell && shell.parentNode && !shell.childElementCount) shell.remove();
    });
    root.querySelectorAll('[data-dash]').forEach((el) => {
      if (!el.closest('#dashBoard') && !hasContent(el)) el.remove();
    });

    const presentIds = cards.map((card) => card.id);
    let saved = opts.layout || null;
    let live = layoutFor(presentIds, saved);
    let editing = false;
    let drag = null;
    let saveTimer = 0;

    const tools = opts.tools || null;
    let editBtn = null;
    let resetBtn = null;
    let hint = null;
    if (tools) {
      tools.replaceChildren();
      editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-soft btn-sm';
      editBtn.id = 'layoutEdit';
      editBtn.textContent = '編輯版面';
      editBtn.setAttribute('aria-pressed', 'false');
      resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'btn btn-soft btn-sm';
      resetBtn.id = 'layoutReset';
      resetBtn.textContent = '還原預設版面';
      resetBtn.hidden = true;
      hint = document.createElement('span');
      hint.className = 'layout-hint';
      hint.textContent = '拖曳把手移動，右下角縮放。方向鍵移動，Shift＋方向鍵縮放。';
      hint.hidden = true;
      tools.appendChild(editBtn);
      tools.appendChild(resetBtn);
      tools.appendChild(hint);
      editBtn.addEventListener('click', () => {
        if (!isDesktop()) return;
        editing = !editing;
        if (!editing) clearActive();
        paint();
      });
      resetBtn.addEventListener('click', () => {
        live = restoreDefault(presentIds);
        paint();
        persist();
      });
    }

    function clearActive() {
      cards.forEach((card) => card.el.classList.remove('is-active'));
    }

    function markActive(id) {
      cards.forEach((card) => card.el.classList.toggle('is-active', card.id === id));
    }

    function paint() {
      const desktop = isDesktop();
      if (!desktop) editing = false;
      board.classList.toggle('is-grid', desktop);
      board.classList.toggle('is-stack', !desktop);
      root.classList.toggle('dash-on', desktop);
      const byId = new Map(live.items.map((it) => [it.id, it]));
      cards.forEach((card) => {
        const spec = byId.get(card.id);
        const on = !!(desktop && spec);
        card.el.style.gridColumn = on ? (spec.x + 1) + ' / span ' + spec.w : '';
        card.el.style.gridRow = on ? (spec.y + 1) + ' / span ' + spec.h : '';
        const chrome = card.el.querySelector('.dash-chrome');
        const resize = card.el.querySelector('.dash-resize');
        const show = editing && desktop;
        if (chrome) chrome.hidden = !show;
        if (resize) resize.hidden = !show;
        card.el.tabIndex = show ? 0 : -1;
        if (show) card.el.setAttribute('aria-label', card.label + '。方向鍵移動，Shift 加方向鍵調整大小');
        else card.el.removeAttribute('aria-label');
      });
      board.classList.toggle('is-editing', editing && desktop);
      if (tools) {
        const showTools = desktop;
        tools.hidden = !showTools;
        tools.classList.toggle('is-on', showTools);
      }
      if (editBtn) {
        editBtn.setAttribute('aria-pressed', editing ? 'true' : 'false');
        editBtn.textContent = editing ? '完成編輯' : '編輯版面';
      }
      if (resetBtn) resetBtn.hidden = !editing;
      if (hint) hint.hidden = !editing;
    }

    function persist() {
      const stored = mergeStore(saved, live);
      saved = stored;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = 0;
        if (typeof opts.save === 'function') {
          Promise.resolve(opts.save(stored)).catch((err) => console.error(err));
        }
      }, 120);
    }

    function measure() {
      const rect = board.getBoundingClientRect();
      const style = getComputedStyle(board);
      const gap = parseFloat(style.columnGap) || 12;
      const row = parseFloat(style.gridAutoRows) || 36;
      const col = (rect.width - gap * (COLS - 1)) / COLS;
      return { rect, gap, row, col };
    }

    function cellAt(clientX, clientY) {
      const m = measure();
      return {
        x: snapIndex(clientX - m.rect.left, m.col + m.gap),
        y: snapIndex(clientY - m.rect.top, m.row + m.gap)
      };
    }

    function applyDrag(e) {
      if (!drag) return;
      const cell = cellAt(e.clientX, e.clientY);
      if (drag.mode === 'move') {
        live = moveItem(live, drag.id, cell.x - drag.grabX, cell.y - drag.grabY);
      } else {
        const it = live.items.find((row) => row.id === drag.id);
        if (!it) return;
        live = resizeItem(live, drag.id, cell.x - it.x + 1, cell.y - it.y + 1);
      }
      paint();
    }

    function onPointerDown(e) {
      if (!editing || !isDesktop()) return;
      const handle = e.target.closest && (e.target.closest('[data-drag]') || e.target.closest('[data-resize]'));
      if (!handle || !board.contains(handle)) return;
      const id = handle.dataset.drag || handle.dataset.resize;
      const it = live.items.find((row) => row.id === id);
      if (!it) return;
      const cell = cellAt(e.clientX, e.clientY);
      drag = {
        id,
        mode: handle.dataset.drag ? 'move' : 'resize',
        pointerId: e.pointerId,
        grabX: cell.x - it.x,
        grabY: cell.y - it.y
      };
      markActive(id);
      board.classList.add('is-dragging');
      if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
      const item = handle.closest('.dash-item');
      if (item) item.focus();
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      applyDrag(e);
      e.preventDefault();
    }

    function onPointerUp(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      applyDrag(e);
      drag = null;
      board.classList.remove('is-dragging');
      persist();
    }

    function onKeyDown(e) {
      if (!editing || !isDesktop()) return;
      if (fieldTarget(e.target)) return;
      const item = e.target.closest && e.target.closest('.dash-item');
      if (!item || !board.contains(item)) return;
      const id = item.dataset.dashId;
      let dx = 0; let dy = 0; let dw = 0; let dh = 0;
      if (e.key === 'ArrowLeft') { if (e.shiftKey) dw = -1; else dx = -1; }
      else if (e.key === 'ArrowRight') { if (e.shiftKey) dw = 1; else dx = 1; }
      else if (e.key === 'ArrowUp') { if (e.shiftKey) dh = -1; else dy = -1; }
      else if (e.key === 'ArrowDown') { if (e.shiftKey) dh = 1; else dy = 1; }
      else return;
      e.preventDefault();
      live = nudge(live, id, dx, dy, dw, dh);
      markActive(id);
      paint();
      persist();
    }

    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove);
    board.addEventListener('pointerup', onPointerUp);
    board.addEventListener('pointercancel', onPointerUp);
    board.addEventListener('keydown', onKeyDown);

    const mq = window.matchMedia('(min-width: ' + DESKTOP_MIN + 'px)');
    const onMode = () => paint();
    if (mq.addEventListener) mq.addEventListener('change', onMode);
    mounted = { mq, onMode, tools, root };
    paint();
  }

  return {
    LAYOUT_VERSION, COLS, META_KEY, DESKTOP_MIN, SPECS, HOME_ROWS,
    specOf, clampItem, overlaps, hasOverlap, snapIndex, snapSpan, resolveItems,
    defaultLayout, restoreDefault, sanitize, layoutFor, moveItem, resizeItem, nudge,
    layoutFromBackup, mergeStore, isDesktop, mount, detach
  };
});
