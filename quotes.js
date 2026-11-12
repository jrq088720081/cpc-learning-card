/* 今日語錄：輪播時段與收藏／自訂句的純資料邏輯。不碰 IndexedDB。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.QuoteDeck = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const QUOTE_HOURS = [1, 2, 3, 6, 12, 24];
  const QUOTE_AUTOPLAY_MS = 6000;
  const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
  const STATUSES = ['確認', '相傳', '作者不詳', '有異說', '誤歸'];
  const SHOWN_STATUS = ['相傳', '作者不詳', '有異說'];

  function mod(i, len) {
    if (!len) return 0;
    return ((Math.trunc(i) % len) + len) % len;
  }
  function normalizeQuoteHours(v) {
    const n = Number(v);
    return QUOTE_HOURS.includes(n) ? n : 24;
  }
  function normalizeQuoteAutoplay(v) {
    return v === true || v === 1 || v === '1' || v === 'true';
  }
  /** 台北時間（UTC+8、無日光節約）從 1970-01-01 00:00 起算的第幾個 N 小時時段。 */
  function quoteSlot(nowMs, hours) {
    const n = normalizeQuoteHours(hours);
    return Math.floor((Number(nowMs) + TAIPEI_OFFSET_MS) / (n * 3600000));
  }
  function normalizeQuoteState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const index = Number(raw.index);
    const slot = Number(raw.slot);
    if (!Number.isFinite(index) || !Number.isFinite(slot)) return null;
    return {
      id: typeof raw.id === 'string' ? raw.id.slice(0, 40) : '',
      index: Math.trunc(index),
      slot: Math.trunc(slot),
      n: normalizeQuoteHours(raw.n)
    };
  }
  function normalizeQuoteFavs(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.entries(raw).forEach(([id, v]) => {
      const key = String(id || '').slice(0, 40);
      if (!key) return;
      if (v && typeof v === 'object') out[key] = { on: !(v.on === false || v.on === 0), at: Number(v.at) || 0 };
      else if (v) out[key] = { on: true, at: 0 };
    });
    return out;
  }
  function isQuoteFav(favs, id) {
    const v = favs && favs[id];
    return !!(v && v.on);
  }
  function mergeQuoteFavs(base, incoming) {
    const out = normalizeQuoteFavs(base);
    const inc = normalizeQuoteFavs(incoming);
    Object.entries(inc).forEach(([id, v]) => {
      const old = out[id];
      if (!old || (v.at || 0) >= (old.at || 0)) out[id] = v;
    });
    return out;
  }
  function oneCustom(q, i) {
    if (!q || typeof q !== 'object') return null;
    const text = String(q.text || '').trim().slice(0, 500);
    if (!text) return null;
    const lang = q.lang === 'en' ? 'en' : 'zh';
    const status = STATUSES.includes(q.status) ? q.status : '確認';
    return {
      id: String(q.id || ('cq-' + i)).slice(0, 40),
      text,
      author: String(q.author || '').trim().slice(0, 80),
      era: String(q.era || '').trim().slice(0, 40),
      source: String(q.source || '').trim().slice(0, 120),
      plain: String(q.plain || '').trim().slice(0, 500),
      status,
      note: String(q.note || '').trim().slice(0, 300),
      lang,
      en: lang === 'en' ? String(q.en || text).trim().slice(0, 500) : null,
      zh: lang === 'en' ? String(q.zh || '').trim().slice(0, 500) : null,
      custom: true,
      updatedAt: Number(q.updatedAt) || 0
    };
  }
  function normalizeCustomQuotes(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Map();
    raw.forEach((q, i) => {
      const row = oneCustom(q, i);
      if (!row) return;
      if (seen.has(row.id)) out[seen.get(row.id)] = row;
      else { seen.set(row.id, out.length); out.push(row); }
    });
    return out.slice(0, 200);
  }
  function mergeCustomQuotes(base, incoming) {
    const map = new Map();
    normalizeCustomQuotes(base).forEach((q) => map.set(q.id, q));
    normalizeCustomQuotes(incoming).forEach((q) => {
      const old = map.get(q.id);
      if (!old || (q.updatedAt || 0) >= (old.updatedAt || 0)) map.set(q.id, q);
    });
    return [...map.values()];
  }
  function applyQuoteSettings(current, incoming, mode) {
    const cur = {
      quoteFavs: normalizeQuoteFavs(current && current.quoteFavs),
      quoteState: normalizeQuoteState(current && current.quoteState),
      quoteIntervalHours: normalizeQuoteHours(current && current.quoteIntervalHours),
      quoteAutoplay: normalizeQuoteAutoplay(current && current.quoteAutoplay),
      customQuotes: normalizeCustomQuotes(current && current.customQuotes)
    };
    const src = incoming && typeof incoming === 'object' ? incoming : {};
    const has = (k) => Object.prototype.hasOwnProperty.call(src, k);
    const any = ['quoteFavs', 'quoteState', 'quoteIntervalHours', 'quoteAutoplay', 'customQuotes'].some(has);
    if (!any) return cur;
    if (mode === 'overwrite') {
      return {
        quoteFavs: has('quoteFavs') ? normalizeQuoteFavs(src.quoteFavs) : cur.quoteFavs,
        quoteState: has('quoteState') ? normalizeQuoteState(src.quoteState) : cur.quoteState,
        quoteIntervalHours: has('quoteIntervalHours') ? normalizeQuoteHours(src.quoteIntervalHours) : cur.quoteIntervalHours,
        quoteAutoplay: has('quoteAutoplay') ? normalizeQuoteAutoplay(src.quoteAutoplay) : cur.quoteAutoplay,
        customQuotes: has('customQuotes') ? normalizeCustomQuotes(src.customQuotes) : cur.customQuotes
      };
    }
    return {
      quoteFavs: has('quoteFavs') ? mergeQuoteFavs(cur.quoteFavs, src.quoteFavs) : cur.quoteFavs,
      quoteState: cur.quoteState,
      quoteIntervalHours: cur.quoteIntervalHours,
      quoteAutoplay: cur.quoteAutoplay,
      customQuotes: has('customQuotes') ? mergeCustomQuotes(cur.customQuotes, src.customQuotes) : cur.customQuotes
    };
  }
  /** 固定順序：內建（去掉誤歸）在前，自訂在後。誤歸不進輪播。 */
  function rotationPool(catalog, custom) {
    const out = [];
    (Array.isArray(catalog) ? catalog : []).forEach((q) => {
      if (!q || q.status === '誤歸' || !q.id || !String(q.text || '').trim()) return;
      out.push(q);
    });
    normalizeCustomQuotes(custom).forEach((q) => {
      if (q.status === '誤歸') return;
      out.push(q);
    });
    return out;
  }
  /**
   * 同時段同一則。跨過一個或多個時段只前進一則。
   * 改 N 時保留目前這則，並把錨點改到新間隔的目前時段，不把進度歸零。
   */
  function syncQuoteState(prev, pool, hours, nowMs) {
    const list = Array.isArray(pool) ? pool : [];
    const n = normalizeQuoteHours(hours);
    const slot = quoteSlot(nowMs, n);
    const len = list.length;
    if (!len) return { id: '', index: 0, slot, n };
    let index = 0;
    if (prev && prev.id) {
      const at = list.findIndex((q) => q && q.id === prev.id);
      if (at >= 0) index = at;
      else if (Number.isFinite(Number(prev.index))) index = mod(Number(prev.index), len);
    } else if (prev && Number.isFinite(Number(prev.index))) {
      index = mod(Number(prev.index), len);
    }
    const prevN = prev && QUOTE_HOURS.includes(+prev.n) ? +prev.n : null;
    const prevSlot = prev && Number.isFinite(Number(prev.slot)) ? Math.trunc(Number(prev.slot)) : null;
    if (!prev || prevN === null || prevSlot === null) {
      return { id: list[index].id, index, slot, n };
    }
    if (prevN !== n) {
      const oldNow = quoteSlot(nowMs, prevN);
      if (oldNow > prevSlot) index = (index + 1) % len;
      return { id: list[index].id, index, slot, n };
    }
    if (slot > prevSlot) index = (index + 1) % len;
    if (slot < prevSlot) return { id: list[index].id, index, slot: prevSlot, n };
    return { id: list[index].id, index, slot, n };
  }
  function displayQuote(pool, state, offset) {
    const list = Array.isArray(pool) ? pool : [];
    const len = list.length;
    if (!len) return null;
    let base = 0;
    if (state && state.id) {
      const at = list.findIndex((q) => q && q.id === state.id);
      if (at >= 0) base = at;
      else base = mod(Number(state.index) || 0, len);
    } else if (state && Number.isFinite(Number(state.index))) {
      base = mod(Number(state.index), len);
    }
    return list[mod(base + (Number(offset) || 0), len)];
  }
  function sameQuoteState(a, b) {
    if (!a || !b) return !a && !b;
    return a.id === b.id && a.index === b.index && a.slot === b.slot && a.n === b.n;
  }
  function authorLabel(q) {
    if (!q) return '作者不詳';
    if (q.status === '作者不詳' || q.status === '誤歸') return '作者不詳';
    const name = String(q.author || '').trim();
    return name || '作者不詳';
  }
  function statusTag(q) {
    if (!q || !SHOWN_STATUS.includes(q.status)) return '';
    return q.status;
  }
  function quoteView(q) {
    const english = !!(q && q.lang === 'en');
    return {
      primary: String((q && q.text) || '').trim(),
      secondary: english ? String((q && (q.zh || q.plain)) || '').trim() : '',
      author: authorLabel(q),
      english
    };
  }
  function speakText(q) {
    if (!q || q.lang !== 'en') return '';
    return String(q.en || q.text || '').trim();
  }
  function autoplayAllowed(setting, reducedMotion, expanded) {
    return !!setting && !reducedMotion && !expanded;
  }

  return {
    QUOTE_HOURS,
    QUOTE_AUTOPLAY_MS,
    quoteSlot,
    normalizeQuoteHours,
    normalizeQuoteAutoplay,
    normalizeQuoteState,
    normalizeQuoteFavs,
    isQuoteFav,
    mergeQuoteFavs,
    normalizeCustomQuotes,
    mergeCustomQuotes,
    applyQuoteSettings,
    rotationPool,
    syncQuoteState,
    displayQuote,
    sameQuoteState,
    authorLabel,
    statusTag,
    quoteView,
    speakText,
    autoplayAllowed
  };
});
