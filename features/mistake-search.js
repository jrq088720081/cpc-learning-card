/* 錯題列表的搜尋與排序。只讀題目、備註、章節，不改錯題、不改原因清單、不開新 store。
   排序偏好是 meta 的 mistakeListSort，由呼叫端讀寫。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MistakeSearch = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const META_KEY = 'mistakeListSort';
  const SORTS = [
    { id: 'recent', name: '最近加入' },
    { id: 'next', name: '下次複習' },
    { id: 'subject', name: '科目' }
  ];
  const SORT_IDS = new Set(SORTS.map((s) => s.id));

  function normalizeSort(value) {
    return SORT_IDS.has(value) ? value : 'recent';
  }

  function fold(value) {
    return String(value || '').normalize('NFKC').toLowerCase().trim();
  }

  /** 題目文字、小筆記（備註）、章節。空白搜尋視為全部符合。 */
  function matchesQuery(mistake, query) {
    const q = fold(query);
    if (!q) return true;
    if (!mistake) return false;
    const hay = [mistake.qText, mistake.note, mistake.chapter].map(fold).join('\n');
    return hay.includes(q);
  }

  function createdAt(m) {
    const n = Number(m && m.createdAt);
    return Number.isFinite(n) ? n : 0;
  }

  function compare(a, b, sort, rank) {
    if (sort === 'next') {
      const aOpen = a && a.status !== 'done' && !!a.nextDue;
      const bOpen = b && b.status !== 'done' && !!b.nextDue;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      if (aOpen && a.nextDue !== b.nextDue) return a.nextDue < b.nextDue ? -1 : 1;
    } else if (sort === 'subject') {
      const ar = rank.has(a && a.subject) ? rank.get(a.subject) : 999;
      const br = rank.has(b && b.subject) ? rank.get(b.subject) : 999;
      if (ar !== br) return ar - br;
      const chapter = String((a && a.chapter) || '').localeCompare(String((b && b.chapter) || ''), 'zh-Hant');
      if (chapter) return chapter;
    }
    const byTime = createdAt(b) - createdAt(a);
    if (byTime) return byTime;
    return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
  }

  /**
   * 先套既有篩選與搜尋，再排序。回傳新陣列，不改原列表。
   * isDue(mistake, today)、isQuizzable(mistake, today) 由錯題本傳入。
   */
  function arrange(list, opts) {
    const o = opts || {};
    const today = o.today || '';
    const sort = normalizeSort(o.sort);
    const order = Array.isArray(o.subjectOrder) ? o.subjectOrder : [];
    const rank = new Map(order.map((id, i) => [id, i]));
    const isDue = typeof o.isDue === 'function' ? o.isDue : function () { return false; };
    const isQuizzable = typeof o.isQuizzable === 'function' ? o.isQuizzable : function () { return false; };
    const out = (list || []).filter((m) => {
      if (!m) return false;
      if (o.reason && !(m.reasons || []).includes(o.reason)) return false;
      if (o.status && m.status !== o.status) return false;
      if (o.onlyDue && !isDue(m, today)) return false;
      if (o.quiz && !isQuizzable(m, today)) return false;
      if (o.starred && !m.starred) return false;
      return matchesQuery(m, o.query);
    });
    out.sort((a, b) => compare(a, b, sort, rank));
    return out;
  }

  /** 舊備份沒有這個 key 就留著這台裝置的偏好。無效值在覆蓋時回到最近加入，合併時留本地。 */
  function sortFromBackup(local, settingsSlice, mode) {
    const cur = normalizeSort(local);
    const slice = settingsSlice && typeof settingsSlice === 'object' && !Array.isArray(settingsSlice) ? settingsSlice : null;
    if (!slice || !Object.prototype.hasOwnProperty.call(slice, META_KEY)) return cur;
    const raw = slice[META_KEY];
    if (raw == null || raw === '') return mode === 'overwrite' ? 'recent' : cur;
    if (!SORT_IDS.has(raw)) return mode === 'overwrite' ? 'recent' : cur;
    return raw;
  }

  function controlsHtml(sort) {
    const current = normalizeSort(sort);
    const options = SORTS.map((s) => (
      '<option value="' + s.id + '"' + (s.id === current ? ' selected' : '') + '>' + s.name + '</option>'
    )).join('');
    return '<div class="mistake-tools">'
      + '<label class="field"><span class="field-title">搜尋</span>'
      + '<input type="search" id="mistakeQuery" placeholder="題目、備註或章節" autocomplete="off" enterkeyhint="search"></label>'
      + '<label class="field"><span class="field-title">排序</span>'
      + '<select id="mistakeSort" aria-label="排序">' + options + '</select></label>'
      + '</div>';
  }

  return {
    META_KEY, SORTS, normalizeSort, matchesQuery, arrange, sortFromBackup, controlsHtml
  };
});
