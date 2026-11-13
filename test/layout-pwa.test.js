'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const Dash = require('../features/dashboard-layout.js');
const Pwa = require('../features/pwa-status.js');
const StudyDB = require('../features/db-v2.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function item(layout, id) {
  return layout.items.find((row) => row.id === id);
}

test('grid snap rounds to the nearest cell and never goes negative', () => {
  assert.equal(Dash.snapIndex(0, 100), 0);
  assert.equal(Dash.snapIndex(49, 100), 0);
  assert.equal(Dash.snapIndex(50, 100), 1);
  assert.equal(Dash.snapIndex(149, 100), 1);
  assert.equal(Dash.snapIndex(150, 100), 2);
  assert.equal(Dash.snapIndex(-30, 80), 0);
  assert.equal(Dash.snapIndex(10, 0), 0);
  assert.equal(Dash.snapSpan(20, 100, 4), 4);
  assert.equal(Dash.snapSpan(350, 100, 3), 4);
  assert.equal(Dash.snapSpan(440, 100, 3), 4);
});

test('default desktop layout pairs countdown, hours, and tasks', () => {
  const ids = ['exam', 'quote', 'study', 'pomo', 'tasks', 'today', 'next', 'due'];
  const layout = Dash.defaultLayout(ids);
  const exam = item(layout, 'exam');
  const quote = item(layout, 'quote');
  const study = item(layout, 'study');
  const pomo = item(layout, 'pomo');
  const tasks = item(layout, 'tasks');
  const today = item(layout, 'today');
  assert.equal(layout.version, 1);
  assert.equal(layout.cols, 12);
  assert.equal(exam.y, quote.y);
  assert.equal(exam.x, 0);
  assert.equal(quote.x, 6);
  assert.equal(exam.w, 6);
  assert.equal(quote.w, 6);
  assert.equal(study.y, pomo.y);
  assert.ok(study.y >= exam.y + exam.h);
  assert.equal(tasks.y, today.y);
  assert.ok(tasks.y >= study.y + study.h);
  assert.equal(Dash.hasOverlap(layout.items), false);
  ids.forEach((id) => {
    const it = item(layout, id);
    assert.ok(it.x >= 0 && it.y >= 0 && it.x + it.w <= 12);
    assert.ok(it.w >= Dash.specOf(id).minW && it.h >= Dash.specOf(id).minH);
  });
});

test('moving onto another card pushes it down and does not overlap', () => {
  const start = Dash.defaultLayout(['exam', 'quote']);
  const before = JSON.stringify(start);
  const moved = Dash.moveItem(start, 'exam', 6, 0);
  assert.equal(JSON.stringify(start), before);
  const exam = item(moved, 'exam');
  const quote = item(moved, 'quote');
  assert.equal(exam.x, 6);
  assert.equal(exam.y, 0);
  assert.ok(quote.y >= exam.y + exam.h);
  assert.equal(Dash.hasOverlap(moved.items), false);
});

test('resize keeps the minimum size and makes the neighbor yield', () => {
  const start = Dash.defaultLayout(['exam', 'quote']);
  const tiny = Dash.resizeItem(start, 'exam', 1, 1);
  const exam = item(tiny, 'exam');
  assert.equal(exam.w, Dash.specOf('exam').minW);
  assert.equal(exam.h, Dash.specOf('exam').minH);
  assert.equal(Dash.hasOverlap(tiny.items), false);

  const wide = Dash.resizeItem(start, 'exam', 30, 6);
  const grown = item(wide, 'exam');
  const quote = item(wide, 'quote');
  assert.equal(grown.w, 12);
  assert.equal(grown.x, 0);
  assert.ok(quote.y >= grown.y + grown.h);
  assert.equal(Dash.hasOverlap(wide.items), false);

  const nudged = Dash.nudge(start, 'exam', 0, 0, -10, 0);
  assert.equal(item(nudged, 'exam').w, Dash.specOf('exam').minW);
  const shifted = Dash.nudge(start, 'quote', -1, 0, 0, 0);
  assert.equal(Dash.hasOverlap(shifted.items), false);
  assert.equal(item(shifted, 'quote').x, 5);
});

test('layout save, load, and restore round-trip', () => {
  const ids = ['exam', 'quote', 'study', 'pomo', 'tasks', 'today'];
  const designed = Dash.defaultLayout(ids);
  const saved = Dash.sanitize(JSON.parse(JSON.stringify(designed)));
  assert.deepEqual(saved.items, designed.items);
  assert.equal(saved.version, Dash.LAYOUT_VERSION);

  const custom = Dash.moveItem(designed, 'study', 0, 2);
  const loaded = Dash.layoutFor(ids, custom);
  assert.equal(item(loaded, 'study').y, 2);
  assert.equal(Dash.hasOverlap(loaded.items), false);

  const restored = Dash.restoreDefault(ids);
  assert.deepEqual(restored.items, designed.items);
  assert.notDeepEqual(custom.items, restored.items);

  const older = { version: 1, savedAt: 10, items: [{ id: 'exam', x: 0, y: 0, w: 6, h: 4 }] };
  const newer = { version: 1, savedAt: 20, items: [{ id: 'exam', x: 2, y: 1, w: 6, h: 4 }] };
  assert.equal(item(Dash.layoutFromBackup(older, newer, 'merge'), 'exam').x, 2);
  assert.equal(item(Dash.layoutFromBackup(newer, older, 'merge'), 'exam').x, 2);
  assert.equal(item(Dash.layoutFromBackup(newer, older, 'overwrite'), 'exam').x, 0);
  assert.equal(item(Dash.layoutFromBackup(newer, null, 'overwrite'), 'exam').x, 2);
  assert.equal(Dash.sanitize(null), null);
  assert.equal(Dash.sanitize({ version: 1, items: [{ id: '', x: 0, y: 0, w: 4, h: 4 }] }), null);
});

test('unknown and new cards are placed at the bottom without overlap', () => {
  const saved = {
    version: 1,
    savedAt: 5,
    items: [
      { id: 'exam', x: 0, y: 0, w: 6, h: 6 },
      { id: 'quote', x: 6, y: 0, w: 6, h: 6 },
      { id: 'retired', x: 0, y: 30, w: 12, h: 4 }
    ]
  };
  const live = Dash.layoutFor(['exam', 'quote', 'spark'], saved);
  assert.equal(item(live, 'retired'), undefined);
  const spark = item(live, 'spark');
  const floor = Math.max(item(live, 'exam').y + item(live, 'exam').h, item(live, 'quote').y + item(live, 'quote').h);
  assert.ok(spark.y >= floor);
  assert.equal(spark.x, 0);
  assert.equal(spark.w, 12);
  assert.equal(Dash.hasOverlap(live.items), false);

  const designed = Dash.defaultLayout(['exam', 'quote', 'widget']);
  const widget = item(designed, 'widget');
  assert.ok(widget.y >= item(designed, 'exam').y + item(designed, 'exam').h);
  assert.equal(Dash.hasOverlap(designed.items), false);

  const stored = Dash.mergeStore(saved, { items: live.items });
  assert.ok(stored.items.some((row) => row.id === 'retired'));
  assert.ok(stored.items.some((row) => row.id === 'spark'));
  assert.equal(Dash.hasOverlap(stored.items), false);
  assert.equal(stored.version, 1);
  assert.ok(stored.savedAt > 0);
});

test('install prompt, offline copy, and storage text stay quiet', () => {
  assert.equal(Pwa.installMode({ standalone: true, ios: true, canPrompt: true }), 'hidden');
  assert.equal(Pwa.installMode({ standalone: false, ios: false, canPrompt: true }), 'prompt');
  assert.equal(Pwa.installMode({ standalone: false, ios: true, canPrompt: false }), 'ios');
  assert.equal(Pwa.installMode({ standalone: false, ios: false, canPrompt: false }), 'hidden');
  assert.equal(Pwa.isIosSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), true);
  assert.equal(Pwa.isIosSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'), false);
  assert.equal(Pwa.isIosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', { platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(Pwa.isStandalone({ standalone: true }, () => ({ matches: false })), true);
  assert.equal(Pwa.isStandalone({}, () => ({ matches: false })), false);
  assert.equal(Pwa.OFFLINE_TEXT, '目前離線，資料存在本機，恢復連線後即可備份');
  assert.equal(Pwa.UPDATE_TEXT, '有新版本，重新載入');
  assert.equal(Pwa.INSTALL_BUTTON, '安裝到主畫面');
  const usage = Pwa.formatUsage({ usage: 1048576, quota: 10 * 1048576 });
  assert.equal(usage.text, '已用 1.0 MB，配額約 10.0 MB');
  assert.equal(Pwa.formatUsage(null), null);
  assert.match(Pwa.persistLabel(true), /已持久保存/);
  assert.match(Pwa.persistLabel(false), /尚未持久保存/);
});

test('page, service worker, and backup pick up the layout without a database upgrade', () => {
  const app = read('app.js');
  const sw = read('sw.js');
  const html = read('index.html');
  const db = read('features/db-v2.js');
  assert.equal(StudyDB.DB_VERSION, 5);
  assert.match(db, /DB_VERSION = 5/);
  assert.equal(db.includes('DB_VERSION = 6'), false);
  assert.match(app, /const DATA_VERSION = 13/);
  assert.match(app, /dashboardLayout/);
  assert.match(app, /DashLayout\.mount/);
  assert.match(app, /PwaStatus\.mountSettings/);
  assert.equal(app.match(/indexedDB\.open/g).length, 1);
  assert.match(sw, /mistake-notebook-v45/);
  assert.match(sw, /\.\/features\/dashboard-layout\.js/);
  assert.match(sw, /\.\/features\/pwa-status\.js/);
  assert.match(html, /features\/dashboard-layout\.js/);
  assert.match(html, /features\/pwa-status\.js/);
  assert.match(html, /id="layoutTools"/);
  ['今日', '學習', '進度', '我的題目', '設定'].forEach((name) => assert.match(html, new RegExp(name)));
});
