'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Q = require('../quotes.js');

function taipeiLocalMs(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min) - 8 * 3600000;
}
function taipeiParts(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(new Date(ms));
  const o = {};
  parts.forEach((p) => { if (p.type !== 'literal') o[p.type] = p.value; });
  return o;
}

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/quotes.json'), 'utf8'));
const pool = Q.rotationPool(data.quotes, []);

test('quotes file is the bundled catalog', () => {
  assert.equal(data.quotes.length, 104);
  assert.equal(data.version, 1);
  assert.equal(pool.length, 97);
  assert.equal(pool.some((q) => q.status === '誤歸'), false);
  assert.equal(data.quotes.filter((q) => q.status === '誤歸').length, 7);
});

test('Taipei clock matches the +8 slot boundary', () => {
  const at559 = taipeiLocalMs(2026, 11, 12, 5, 59);
  const at600 = taipeiLocalMs(2026, 11, 12, 6, 0);
  const p559 = taipeiParts(at559);
  const p600 = taipeiParts(at600);
  assert.equal(p559.day, '12');
  assert.equal(p559.hour, '05');
  assert.equal(p559.minute, '59');
  assert.equal(p600.hour, '06');
  assert.equal(p600.minute, '00');
  assert.equal(Q.quoteSlot(at600, 6), Q.quoteSlot(at559, 6) + 1);
  const late = taipeiLocalMs(2026, 11, 12, 23, 59);
  const next = taipeiLocalMs(2026, 11, 13, 0, 0);
  const pLate = taipeiParts(late);
  const pNext = taipeiParts(next);
  assert.equal(pLate.hour, '23');
  assert.equal(pLate.minute, '59');
  assert.ok(pNext.hour === '00' || pNext.hour === '24');
  assert.equal(Q.quoteSlot(next, 24), Q.quoteSlot(late, 24) + 1);
  assert.equal(Q.quoteSlot(taipeiLocalMs(2026, 11, 12, 0, 0), 24), Q.quoteSlot(late, 24));
});

test('N=6 crosses 05:59/06:00 by one quote and refresh stays', () => {
  const a = taipeiLocalMs(2026, 11, 12, 5, 59);
  const b = taipeiLocalMs(2026, 11, 12, 6, 0);
  const s1 = Q.syncQuoteState(null, pool, 6, a);
  const s2 = Q.syncQuoteState(s1, pool, 6, b);
  const s3 = Q.syncQuoteState(s2, pool, 6, b);
  assert.equal(s1.index, 0);
  assert.equal(s1.id, pool[0].id);
  assert.equal(s2.index, 1);
  assert.equal(s2.id, pool[1].id);
  assert.equal(s3.id, s2.id);
  assert.equal(s3.index, 1);
  assert.equal(Q.quoteSlot(b, 6) - Q.quoteSlot(a, 6), 1);
});

test('N=24 crosses 23:59/00:00 by one quote and refresh stays', () => {
  const a = taipeiLocalMs(2026, 11, 12, 23, 59);
  const b = taipeiLocalMs(2026, 11, 13, 0, 0);
  const s1 = Q.syncQuoteState(null, pool, 24, a);
  const again = Q.syncQuoteState(s1, pool, 24, a);
  const s2 = Q.syncQuoteState(s1, pool, 24, b);
  const s3 = Q.syncQuoteState(s2, pool, 24, b);
  assert.equal(again.id, s1.id);
  assert.equal(s2.index, s1.index + 1);
  assert.equal(s3.id, s2.id);
});

test('skipping several slots advances only one', () => {
  const a = taipeiLocalMs(2026, 11, 12, 5, 59);
  const b = taipeiLocalMs(2026, 11, 12, 18, 0);
  assert.equal(Q.quoteSlot(b, 6) - Q.quoteSlot(a, 6), 3);
  const s1 = Q.syncQuoteState(null, pool, 6, a);
  const s2 = Q.syncQuoteState(s1, pool, 6, b);
  const s3 = Q.syncQuoteState(s2, pool, 6, b);
  assert.equal(s2.index, 1);
  assert.equal(s3.index, 1);
});

test('changing N keeps the current quote', () => {
  const t = taipeiLocalMs(2026, 11, 12, 10, 0);
  const later = taipeiLocalMs(2026, 11, 12, 11, 0);
  const boundary = taipeiLocalMs(2026, 11, 12, 12, 0);
  const state = {
    id: pool[5].id,
    index: 5,
    slot: Q.quoteSlot(t, 24),
    n: 24
  };
  const next = Q.syncQuoteState(state, pool, 6, t);
  assert.equal(next.id, pool[5].id);
  assert.equal(next.index, 5);
  assert.equal(next.n, 6);
  assert.equal(next.slot, Q.quoteSlot(t, 6));
  const still = Q.syncQuoteState(next, pool, 6, later);
  assert.equal(still.id, pool[5].id);
  const after = Q.syncQuoteState(still, pool, 6, boundary);
  assert.equal(after.id, pool[6].id);
  assert.equal(Q.normalizeQuoteHours(5), 24);
});

test('manual browse does not change stored progress', () => {
  const t = taipeiLocalMs(2026, 11, 12, 15, 0);
  const state = Object.freeze(Q.syncQuoteState(null, pool, 24, t));
  const shown = Q.displayQuote(pool, state, 1);
  assert.equal(shown.id, pool[1].id);
  assert.equal(state.id, pool[0].id);
  const again = Q.syncQuoteState(state, pool, 24, t);
  assert.equal(again.id, state.id);
  assert.equal(again.index, state.index);
});

test('misattributed and custom quotes', () => {
  const custom = [
    { id: 'cq-1', text: '自訂一句', status: '確認', lang: 'zh', author: '我' },
    { id: 'cq-bad', text: '不該出現', status: '誤歸', lang: 'zh' }
  ];
  const mixed = Q.rotationPool(data.quotes, custom);
  assert.equal(mixed[mixed.length - 1].id, 'cq-1');
  assert.equal(mixed.some((q) => q.id === 'cq-bad' || q.status === '誤歸'), false);
  assert.equal(Q.authorLabel({ status: '作者不詳', author: '不詳（傳為子思）' }), '作者不詳');
  assert.equal(Q.authorLabel({ status: '誤歸', author: '魯迅' }), '作者不詳');
  assert.equal(Q.authorLabel({ status: '確認', author: '孔子' }), '孔子');
  assert.equal(Q.authorLabel({ status: '相傳', author: '岳飛（傳）' }), '岳飛（傳）');
  const en = Q.quoteView({ lang: 'en', text: 'Hi', zh: '嗨', author: 'A', status: '確認' });
  assert.equal(en.primary, 'Hi');
  assert.equal(en.secondary, '嗨');
  assert.equal(en.english, true);
  const zh = Q.quoteView({ lang: 'zh', text: '學', author: '孔子', status: '確認' });
  assert.equal(zh.secondary, '');
  assert.equal(Q.statusTag({ status: '有異說' }), '有異說');
  assert.equal(Q.statusTag({ status: '確認' }), '');
  assert.equal(Q.speakText({ lang: 'en', text: 'Hi', en: 'Hi' }), 'Hi');
  assert.equal(Q.speakText({ lang: 'zh', text: '學' }), '');
});

test('autoplay pauses when reduced motion or expanded', () => {
  assert.equal(Q.QUOTE_AUTOPLAY_MS, 6000);
  assert.equal(Q.autoplayAllowed(false, false, false), false);
  assert.equal(Q.autoplayAllowed(true, false, false), true);
  assert.equal(Q.autoplayAllowed(true, true, false), false);
  assert.equal(Q.autoplayAllowed(true, false, true), false);
});

test('old backups keep quote fields and new fields merge', () => {
  const cur = {
    quoteFavs: { q001: { on: true, at: 10 } },
    quoteState: { id: 'q001', index: 0, slot: 4, n: 6 },
    quoteIntervalHours: 6,
    quoteAutoplay: true,
    customQuotes: [{ id: 'cq-1', text: '舊句', lang: 'zh', status: '確認', updatedAt: 1 }]
  };
  const kept = Q.applyQuoteSettings(cur, { tabs: [] }, 'overwrite');
  assert.equal(kept.quoteIntervalHours, 6);
  assert.equal(kept.quoteAutoplay, true);
  assert.equal(kept.quoteFavs.q001.on, true);
  assert.equal(kept.customQuotes[0].text, '舊句');
  assert.equal(kept.quoteState.id, 'q001');
  const merged = Q.applyQuoteSettings(cur, {
    quoteFavs: { q001: { on: false, at: 20 }, q002: { on: true, at: 3 } },
    quoteIntervalHours: 1,
    quoteAutoplay: false,
    customQuotes: [{ id: 'cq-2', text: '新句', lang: 'zh', status: '確認', updatedAt: 2 }]
  }, 'merge');
  assert.equal(merged.quoteIntervalHours, 6);
  assert.equal(merged.quoteAutoplay, true);
  assert.equal(merged.quoteState.id, 'q001');
  assert.equal(merged.quoteFavs.q001.on, false);
  assert.equal(merged.quoteFavs.q002.on, true);
  assert.deepEqual(merged.customQuotes.map((q) => q.id), ['cq-1', 'cq-2']);
  const replaced = Q.applyQuoteSettings(cur, {
    quoteFavs: {},
    quoteState: null,
    quoteIntervalHours: 12,
    quoteAutoplay: false,
    customQuotes: []
  }, 'overwrite');
  assert.equal(replaced.quoteIntervalHours, 12);
  assert.equal(replaced.quoteAutoplay, false);
  assert.equal(replaced.quoteState, null);
  assert.deepEqual(replaced.customQuotes, []);
});

test('service worker caches the next version and the quote file', () => {
  const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(sw, /mistake-notebook-v42/);
  assert.match(sw, /\.\/data\/quotes\.json/);
  assert.match(sw, /\.\/quotes\.js/);
  assert.match(html, /quotes\.js/);
});
