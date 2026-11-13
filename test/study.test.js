'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const StudyDB = require('../features/db-v2.js');
const StudyStats = require('../features/stats.js');
const Pomo = require('../features/pomodoro.js');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/path-chapters.json'), 'utf8'));
const DURS = { focus: 25 * 60000, short: 5 * 60000, long: 15 * 60000, longEvery: 4 };

function taipei(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min) - 8 * 3600000;
}
function sess(id, date, minutes, extra) {
  return Object.assign({
    id, date, startAt: 1, endAt: 2, minutes, subject: 'math', chapterId: null, source: 'pomodoro', updatedAt: 1
  }, extra || {});
}

test('Taipei date crosses midnight and week starts Monday', () => {
  assert.equal(StudyStats.taipeiDate(taipei(2026, 11, 12, 23, 59)), '2026-11-12');
  assert.equal(StudyStats.taipeiDate(taipei(2026, 11, 13, 0, 0)), '2026-11-13');
  assert.equal(new Date(Date.UTC(2026, 10, 12)).getUTCDay(), 4);
  assert.equal(StudyStats.weekStartMonday('2026-11-12'), '2026-11-09');
  assert.equal(StudyStats.weekStartMonday('2026-11-09'), '2026-11-09');
  assert.equal(StudyStats.weekStartMonday('2026-11-08'), '2026-11-02');
  assert.equal(new Date(Date.UTC(2026, 10, 15)).getUTCDay(), 0);
  assert.equal(StudyStats.weekStartMonday('2026-11-15'), '2026-11-09');
  assert.equal(new Date(Date.UTC(2026, 2, 1)).getUTCDay(), 0);
  assert.equal(StudyStats.weekStartMonday('2026-03-01'), '2026-02-23');
});

test('week, month, total and streak use Taipei dates and ignore future rows', () => {
  const now = taipei(2026, 11, 12, 12, 0);
  const sum = StudyStats.summarize([
    sess('sun', '2026-11-08', 30),
    sess('mon', '2026-11-09', 60),
    sess('thu', '2026-11-12', 25),
    sess('fri', '2026-11-13', 100),
    sess('zero', '2026-11-12', 0)
  ], now);
  assert.equal(sum.today, '2026-11-12');
  assert.equal(sum.weekStart, '2026-11-09');
  assert.equal(sum.todayMin, 25);
  assert.equal(sum.weekMin, 85);
  assert.equal(sum.monthMin, 115);
  assert.equal(sum.totalMin, 115);
  assert.equal(sum.streak, 1);
  assert.equal(sum.hasStudy, true);
  assert.equal(StudyStats.streakEnding(new Set(['2026-11-10', '2026-11-11', '2026-11-12']), '2026-11-12'), 3);
  assert.equal(StudyStats.streakEnding(new Set(['2026-11-10', '2026-11-11']), '2026-11-12'), 2);
  assert.equal(StudyStats.streakEnding(new Set(['2026-11-10']), '2026-11-12'), 0);
  assert.equal(StudyStats.streakEnding(new Set(), '2026-11-12'), 0);
  const none = StudyStats.summarize([], now);
  assert.equal(none.todayMin, 0);
  assert.equal(none.weekMin, 0);
  assert.equal(none.streak, 0);
  assert.equal(none.hasStudy, false);
  assert.deepEqual(StudyStats.formatStat(0), { value: '0', unit: '小時' });
});

test('pomodoro remaining follows endAt, pauses do not add minutes, one session id once', () => {
  const t0 = 1_000_000;
  const started = Pomo.start(Pomo.idleState(), {
    subject: 'ee', chapterId: 'ee-2', now: t0, sessionId: 's1', durations: DURS
  });
  assert.equal(started.state.status, 'running');
  assert.equal(Pomo.remainingMs(started.state, t0), 25 * 60000);
  assert.equal(Pomo.remainingMs(started.state, t0 + 10_000), 25 * 60000 - 10_000);
  assert.equal(Pomo.formatClock(Pomo.remainingMs(started.state, t0)), '25:00');
  const paused = Pomo.pause(started.state, t0 + 60_000).state;
  assert.equal(Pomo.remainingMs(paused, t0 + 10 * 60000), 25 * 60000 - 60_000);
  const resumed = Pomo.resume(paused, t0 + 10 * 60000).state;
  assert.equal(resumed.endAt, t0 + 10 * 60000 + (25 * 60000 - 60_000));
  const done = Pomo.settle(resumed, resumed.endAt + 1000, DURS);
  assert.equal(done.records.length, 1);
  assert.equal(done.records[0].id, 's1');
  assert.equal(done.records[0].source, 'pomodoro');
  assert.equal(done.records[0].minutes, 25);
  assert.equal(done.records[0].endAt, resumed.endAt);
  assert.equal(done.records[0].subject, 'ee');
  assert.equal(done.state.phase, 'short');
  assert.equal(done.records[0].updatedAt, resumed.endAt);
  const again = Pomo.settle(done.state, resumed.endAt + 1000, DURS);
  const caught = Pomo.settle(resumed, resumed.endAt + 8 * 60000, DURS);
  assert.equal(caught.records.length, 1);
  assert.equal(caught.records[0].minutes, 25);
  assert.equal(caught.state.status, 'idle');
  assert.equal(again.records.length, 0);
  assert.equal(again.changed, false);
  const first = StudyStats.keepFirstSession(null, done.records[0]);
  assert.equal(first.wrote, true);
  const second = StudyStats.keepFirstSession(first.session, Object.assign({}, done.records[0], { minutes: 99, updatedAt: 999 }));
  assert.equal(second.wrote, false);
  assert.equal(second.session.minutes, 25);
  assert.equal(Pomo.displayRemainingMs(Pomo.idleState(), DURS, t0), 25 * 60000);
  assert.equal(Pomo.formatClock(0), '00:00');
  assert.equal(Pomo.formatClock(1), '00:01');
});

test('fourth round is a long break and a caught-up focus still records once', () => {
  const t0 = taipei(2026, 11, 12, 23, 50);
  let idle = Pomo.idleState();
  idle.round = 3;
  const started = Pomo.start(idle, {
    subject: 'math', chapterId: 'math-1', now: t0, sessionId: 'night', durations: DURS
  }).state;
  assert.equal(started.round, 4);
  assert.equal(StudyStats.taipeiDate(started.startAt), '2026-11-12');
  const both = Pomo.settle(started, started.endAt + DURS.long + 1000, DURS);
  assert.equal(both.alarm, 'focus-caught-up');
  assert.equal(both.state.status, 'idle');
  assert.equal(both.records.length, 1);
  assert.equal(both.records[0].date, '2026-11-12');
  assert.equal(StudyStats.taipeiDate(both.records[0].endAt), '2026-11-13');
  assert.equal(Pomo.settle(both.state, started.endAt + DURS.long + 1000, DURS).records.length, 0);
  const onTime = Pomo.settle(started, started.endAt, DURS);
  assert.equal(onTime.state.phase, 'long');
  assert.equal(onTime.alarm, 'focus');
  const skipped = Pomo.skipBreak(onTime.state, onTime.state.endAt - 1000);
  assert.equal(skipped.state.status, 'idle');
  assert.equal(skipped.state.round, 4);
  assert.equal(Pomo.resetPlan(started, t0 + 30_000).needsConfirm, false);
  const plan = Pomo.resetPlan(started, t0 + 90_000);
  assert.equal(plan.needsConfirm, true);
  assert.equal(plan.minutes, 1);
  const partial = Pomo.partialSession(Pomo.pause(started, t0 + 90_000).state, t0 + 90_000);
  assert.equal(partial.id, 'night');
  assert.equal(partial.minutes, 1);
  assert.equal(partial.source, 'pomodoro');
});

test('manual entry, chapter list, and backup dedupe including old files', () => {
  const now = taipei(2026, 11, 12, 16, 0);
  const ok = StudyStats.buildManual({
    date: '2026-11-12', minutes: 40, subject: 'ee', chapterId: 'ee-2',
    hasStart: true, startH: 14, startM: 0, now, id: 'man-1', catalog
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.session.source, 'manual');
  assert.equal(ok.session.date, '2026-11-12');
  assert.equal(ok.session.minutes, 40);
  assert.equal(ok.session.startAt, taipei(2026, 11, 12, 14, 0));
  assert.equal(StudyStats.buildManual({ date: '2026-11-13', minutes: 10, subject: 'zh', now, id: 'x', catalog }).ok, false);
  assert.equal(StudyStats.buildManual({
    date: '2026-11-12', minutes: 10, subject: 'zh', chapterId: 'ee-1', hasStart: false, now, id: 'y', catalog
  }).ok, false);
  const zh = StudyStats.chaptersFor('zh', catalog).map((c) => c.id);
  assert.ok(zh.includes('zh-phon'));
  assert.equal(zh.includes('ee-1'), false);
  const local = [sess('a', '2026-11-11', 30, { source: 'manual', updatedAt: 10, subject: 'zh' })];
  const oldFile = { app: 'mistake-notebook', version: 7, mistakes: [{ id: 'm1' }], settings: { tabs: [] } };
  assert.equal(StudyStats.sessionsFromBackup(local, oldFile)[0].minutes, 30);
  assert.equal(StudyStats.sessionsFromBackup(local, null)[0].id, 'a');
  const merged = StudyStats.sessionsFromBackup(local, {
    version: 8,
    studySessions: [
      sess('a', '2026-11-11', 99, { source: 'manual', updatedAt: 5, subject: 'zh' }),
      sess('a', '2026-11-11', 40, { source: 'manual', updatedAt: 15, subject: 'zh' }),
      sess('b', '2026-11-12', 10, { updatedAt: 3 }),
      { id: 'bad' }
    ]
  });
  const byId = Object.fromEntries(merged.map((s) => [s.id, s]));
  assert.equal(byId.a.minutes, 40);
  assert.equal(byId.b.minutes, 10);
  assert.equal(merged.some((s) => s.id === 'bad'), false);
});

test('database upgrade only adds missing stores', () => {
  function fakeDb(names) {
    const created = [];
    return {
      created,
      objectStoreNames: { contains: (name) => names.includes(name) || created.includes(name) },
      createObjectStore(name) {
        created.push(name);
        return { createIndex() {}, indexNames: { contains: () => false } };
      }
    };
  }
  const fresh = fakeDb(['mistakes', 'meta']);
  StudyDB.upgrade(fresh, null);
  assert.deepEqual(fresh.created, ['studySessions', 'pomodoroState', 'tasks']);
  const again = fakeDb(['mistakes', 'meta', 'studySessions', 'pomodoroState', 'tasks']);
  let indexCreated = false;
  StudyDB.upgrade(again, {
    objectStore() {
      return {
        indexNames: { contains: () => true },
        createIndex() { indexCreated = true; }
      };
    }
  });
  assert.deepEqual(again.created, []);
  assert.equal(indexCreated, false);
  const src = fs.readFileSync(path.join(__dirname, '../features/db-v2.js'), 'utf8');
  assert.equal(src.includes('deleteObjectStore'), false);
  assert.equal(src.includes('.clear('), false);
  assert.match(src, /DB_VERSION = 3/);
});

test('app, service worker, and page share version 2 and the new files', () => {
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(app, /const DATA_VERSION = 9/);
  assert.match(app, /indexedDB\.open\(APP_ID, StudyDB\.DB_VERSION\)/);
  assert.equal(app.includes('indexedDB.open(APP_ID, 1)'), false);
  assert.equal(app.match(/indexedDB\.open/g).length, 1);
  assert.match(app, /onversionchange/);
  assert.match(app, /onblocked/);
  assert.match(app, /studySessions/);
  assert.match(sw, /mistake-notebook-v41/);
  assert.match(sw, /\.\/features\/db-v2\.js/);
  assert.match(sw, /\.\/features\/pomodoro\.js/);
  assert.match(sw, /\.\/features\/stats\.js/);
  assert.match(sw, /\.\/features\/tasks\.js/);
  assert.match(sw, /\.\/features\/heatmap\.js/);
  assert.match(html, /features\/db-v2\.js/);
  assert.match(html, /features\/pomodoro\.js/);
  assert.match(html, /features\/stats\.js/);
  assert.match(html, /features\/tasks\.js/);
  assert.match(html, /features\/heatmap\.js/);
  assert.equal(Pomo.normalizeSettings({ focusMin: 999, shortMin: 0, notify: 'true' }).focusMin, 180);
  assert.equal(Pomo.normalizeSettings({ focusMin: 999, shortMin: 0, notify: 'true' }).shortMin, 1);
  assert.equal(Pomo.normalizeSettings({ focusMin: 999, shortMin: 0, notify: 'true' }).notify, true);
  assert.equal(Pomo.durationsFrom({ focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 }, { focusMs: 3000 }).focus, 3000);
  assert.equal(Pomo.normalizeSettings(null).focusMin, 25);
});
