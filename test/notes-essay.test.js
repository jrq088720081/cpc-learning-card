'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const StudyDB = require('../features/db-v2.js');
const StudyStats = require('../features/stats.js');
const StudyHeat = require('../features/heatmap.js');
const Notes = require('../features/notes.js');
const Essay = require('../features/essay.js');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/path-chapters.json'), 'utf8'));

function note(extra) {
  return Object.assign({
    id: 'n1', title: '歐姆定律', body: 'V = IR', subject: 'ee', chapterId: 'ee-2',
    tags: ['公式整理'], images: [], createdAt: 1, updatedAt: 2
  }, extra || {});
}

test('note search and filters use title, body, tags, subject, and newest edit first', () => {
  const rows = [
    note({ id: 'ohm', title: '歐姆', body: 'V=IR\n先換單位', tags: ['公式整理'], subject: 'ee', updatedAt: 2 }),
    note({ id: 'phon', title: '字音', body: '破音字整理', tags: ['重點整理'], subject: 'zh', chapterId: 'zh-phon', updatedAt: 5 }),
    note({ id: 'blank', title: '空白科目', body: '', tags: [], subject: 'none', chapterId: null, updatedAt: 3 })
  ];
  assert.deepEqual(Notes.filterNotes(rows, { q: '歐姆' }).map((n) => n.id), ['ohm']);
  assert.deepEqual(Notes.filterNotes(rows, { q: '單位' }).map((n) => n.id), ['ohm']);
  assert.deepEqual(Notes.filterNotes(rows, { q: '公式' }).map((n) => n.id), ['ohm']);
  assert.deepEqual(Notes.filterNotes(rows, { q: '沒有這句' }), []);
  assert.deepEqual(Notes.filterNotes(rows, { subject: 'zh' }).map((n) => n.id), ['phon']);
  assert.deepEqual(Notes.filterNotes(rows, { tag: '重點整理' }).map((n) => n.id), ['phon']);
  assert.deepEqual(Notes.filterNotes(rows, { subject: 'ee', tag: '重點整理' }), []);
  assert.deepEqual(Notes.filterNotes(rows, {}).map((n) => n.id), ['phon', 'blank', 'ohm']);
  assert.equal(Notes.subjectName('none'), '不指定');
  assert.equal(Notes.previewText('第一行\n第二行\n第三行').includes('第三行'), false);
  assert.equal(Notes.formatTaipei(Date.UTC(2026, 10, 12, 16, 5)), '2026-11-13 00:05');
  const zh = Notes.chaptersForSubject('zh', catalog).map((c) => c.id);
  assert.ok(zh.includes('zh-phon'));
  assert.equal(zh.includes('ee-1'), false);
  assert.equal(Notes.countByChapter(rows)['zh-phon'], 1);
  assert.match(fs.readFileSync(path.join(__dirname, '../features/notes.js'), 'utf8'), /新增第一篇筆記/);
});

test('essay practice stays off unless the flag is exactly true, and turning it off keeps essays', () => {
  assert.equal(Essay.normalizeEnabled(undefined), false);
  assert.equal(Essay.normalizeEnabled(null), false);
  assert.equal(Essay.normalizeEnabled(false), false);
  assert.equal(Essay.normalizeEnabled('true'), false);
  assert.equal(Essay.normalizeEnabled(1), false);
  assert.equal(Essay.normalizeEnabled(true), true);
  assert.equal(Essay.practiceEntryVisible(false), false);
  assert.equal(Essay.practiceEntryVisible(true), true);
  const essays = [Essay.createEssay({ id: 'e1', title: '春雨', body: '雨下了', now: 10 })];
  const off = Essay.setEnabled(true, essays, false);
  assert.equal(off.enabled, false);
  assert.equal(off.removed, 0);
  assert.equal(off.essays.length, 1);
  assert.equal(off.essays[0].title, '春雨');
  assert.equal(off.essays[0].body, '雨下了');
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const toggleAt = app.indexOf('const essayToggle');
  assert.ok(toggleAt > 0);
  const toggle = app.slice(toggleAt, toggleAt + 500);
  assert.equal(toggle.includes('deleteEssay'), false);
  assert.equal(toggle.includes('allEssays'), false);
  assert.match(app, /正式考試不考作文，練習時間會計入總學習時數，但不計入國文進度與分數/);
  assert.equal(fs.readFileSync(path.join(__dirname, '../features/essay.js'), 'utf8').includes('practiceStats'), false);
});

test('manual essay saves keep at most 20 versions and can restore an older body', () => {
  let essay = Essay.createEssay({ id: 'e1', title: '題', body: '版本0', now: 1000 });
  essay = Essay.saveVersion(essay, 1000);
  for (let i = 1; i <= 24; i++) {
    essay = Essay.normalizeEssay(Object.assign({}, essay, { body: '版本' + i }));
    essay = Essay.saveVersion(essay, 1000 + i);
  }
  assert.equal(essay.versions.length, 20);
  assert.equal(essay.versions[0].body, '版本5');
  assert.equal(essay.versions[19].body, '版本24');
  assert.equal(Essay.MAX_VERSIONS, 20);
  const restored = Essay.restoreVersion(essay, essay.versions[0].at, 5000);
  assert.equal(restored.body, '版本5');
  assert.ok(restored.versions.length <= 20);
  assert.ok(restored.versions.some((v) => v.body === '版本24'));
  const bulky = Essay.normalizeEssay({
    id: 'fat', title: '多', body: '現在', status: 'draft',
    versions: Array.from({ length: 25 }, (_, i) => ({ at: i + 1, body: '舊' + i })),
    createdAt: 1, updatedAt: 2
  });
  assert.equal(bulky.versions.length, 20);
  assert.equal(bulky.versions[0].body, '舊5');
  assert.equal(Essay.wordCount('今天 天氣\n好'), 5);
});

test('each essay timing writes its own session, and ending again does not', () => {
  let running = Essay.startClock(Essay.createEssay({ id: 'e1', now: 1 }), 10000);
  const storedRun = JSON.parse(JSON.stringify(running));
  assert.equal(Essay.elapsedMs(storedRun, 10000 + 15000), 15000);
  assert.equal(Essay.pendingSession(storedRun), null);
  const paused = Essay.pauseClock(running, 10000 + 90000);
  const storedPause = JSON.parse(JSON.stringify(paused));
  assert.equal(storedPause.clock.sessionId, running.clock.sessionId);
  assert.equal(Essay.elapsedMs(storedPause, 10000 + 90000 + 60000), 90000);
  const resumed = Essay.startClock(storedPause, 10000 + 120000);
  assert.equal(resumed.clock.sessionId, running.clock.sessionId);
  const pausedEnd = Essay.finishEssay(resumed, 10000 + 120000 + 60000);
  assert.equal(pausedEnd.session.id, running.clock.sessionId);
  assert.equal(pausedEnd.session.minutes, 2);
  assert.equal(Essay.finishEssay(pausedEnd.essay, pausedEnd.session.endAt + 1000).session, null);
  assert.equal(Essay.formatDuration(65000), '00:01:05');

  let essay = Essay.startClock(Essay.createEssay({ id: 'e1', now: 1 }), 1000);
  const first = Essay.finishEssay(essay, 1000 + 5 * 60000);
  assert.equal(first.session.minutes, 5);
  assert.equal(first.session.source, 'essay');
  assert.equal(first.session.subject, 'zh');
  assert.equal(first.session.id, essay.clock.sessionId);
  assert.equal(first.essay.status, 'done');
  assert.equal(first.essay.totalMinutes, 5);
  assert.equal(Essay.finishEssay(first.essay, 1000 + 8 * 60000).session, null);
  const retry = Essay.finishEssay(JSON.parse(JSON.stringify(Object.assign({}, first.essay, {
    totalMinutes: 0,
    clock: Object.assign({}, first.essay.clock, { sessionWritten: false })
  }))), first.session.endAt);
  assert.equal(retry.session.id, first.session.id);
  assert.equal(retry.session.minutes, 5);
  const norm = StudyStats.normalizeSession(first.session);
  const kept = StudyStats.keepFirstSession(norm, Object.assign({}, norm, { minutes: 99, updatedAt: 999999 }));
  assert.equal(kept.wrote, false);
  assert.equal(kept.session.minutes, 5);

  essay = Essay.startClock(first.essay, 200000);
  assert.notEqual(essay.clock.sessionId, first.session.id);
  assert.equal(Essay.elapsedMs(essay, 200000), 0);
  const second = Essay.finishEssay(essay, 200000 + 3 * 60000);
  assert.equal(second.session.minutes, 3);
  assert.equal(second.session.subject, 'zh');
  assert.notEqual(second.session.id, first.session.id);
  assert.equal(second.essay.totalMinutes, 8);
  assert.equal(Essay.finishEssay(second.essay, 200000 + 4 * 60000).session, null);
  const both = [norm, StudyStats.normalizeSession(second.session)];
  const rows = StudyHeat.subjectSeries(both, first.session.date);
  assert.equal(rows.find((r) => r.id === 'zh').minutes, 8);
  assert.equal(StudyStats.normalizeSession(Object.assign({}, norm, { source: 'hack' })), null);

  const short = Essay.finishEssay(Essay.startClock(Essay.createEssay({ id: 'e2', now: 1 }), 1000), 1000 + 20000);
  assert.equal(short.session, null);
  assert.equal(short.essay.clock.sessionWritten, false);
  const next = Essay.startClock(short.essay, 30000);
  assert.notEqual(next.clock.sessionId, short.essay.clock.sessionId);
  assert.equal(Essay.elapsedMs(next, 30000), 0);
  const later = Essay.finishEssay(next, 30000 + 2 * 60000);
  assert.equal(later.session.minutes, 2);
  assert.equal(Essay.finishEssay(later.essay, 30000 + 4 * 60000).session, null);
});

test('import keeps the newer note or essay and still reads a v9 backup', () => {
  const localNote = note({ id: 'n', title: '本機', body: '舊正文', updatedAt: 5, images: [{ id: 'i1', dataUrl: 'data:image/jpeg;base64,YQ==', createdAt: 1 }] });
  const v9 = { app: 'mistake-notebook', version: 9, mistakes: [{ id: 'm1' }], settings: { tabs: [] } };
  const kept = Notes.notesFromBackup([localNote], v9);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].title, '本機');
  assert.equal(kept[0].images[0].id, 'i1');
  assert.equal(Notes.notesFromBackup([localNote], null)[0].id, 'n');
  const merged = Notes.notesFromBackup([localNote], {
    version: 10,
    notes: [
      note({ id: 'n', title: '較舊', updatedAt: 3, images: [] }),
      note({ id: 'n', title: '較新', body: '新正文', updatedAt: 9, images: [{ id: 'i2', dataUrl: 'data:image/jpeg;base64,Yg==', createdAt: 4 }] }),
      note({ id: 'other', title: '另一篇', updatedAt: 1 }),
      { title: '沒有 id' }
    ]
  });
  const byId = Object.fromEntries(merged.map((n) => [n.id, n]));
  assert.equal(byId.n.title, '較新');
  assert.equal(byId.n.images[0].id, 'i2');
  assert.equal(byId.other.title, '另一篇');
  assert.equal(merged.some((n) => n.title === '沒有 id'), false);
  const blob = new Blob(['b'], { type: 'image/jpeg' });
  const hydrated = Notes.hydrateImages(byId.n, () => blob);
  assert.equal(hydrated.images[0].blob, blob);
  assert.equal(Object.prototype.hasOwnProperty.call(hydrated.images[0], 'dataUrl'), false);

  const localEssay = Essay.createEssay({ id: 'e', title: '本機作文', body: '原文', now: 4 });
  assert.equal(Essay.essaysFromBackup([localEssay], v9)[0].title, '本機作文');
  assert.equal(Essay.essaysFromBackup([localEssay], { version: 8 }).length, 1);
  const essayMerged = Essay.essaysFromBackup([localEssay], {
    version: 10,
    essays: [
      { id: 'e', title: '較舊', body: 'a', status: 'draft', updatedAt: 2, createdAt: 1 },
      { id: 'e', title: '較新', body: 'b', status: 'done', updatedAt: 8, createdAt: 1, totalMinutes: 12 },
      { id: 'e2', title: '另一篇', body: 'c', updatedAt: 3, createdAt: 1 }
    ]
  });
  const essayById = Object.fromEntries(essayMerged.map((e) => [e.id, e]));
  assert.equal(essayById.e.title, '較新');
  assert.equal(essayById.e.status, 'done');
  assert.equal(essayById.e2.title, '另一篇');
  assert.equal(essayById.e.body, 'b');
});

test('version 3 database upgrade only adds notes and essays', () => {
  function fakeDb(names) {
    const created = [];
    const indexes = [];
    return {
      created,
      indexes,
      objectStoreNames: { contains: (name) => names.includes(name) || created.includes(name) },
      createObjectStore(name) {
        created.push(name);
        return {
          indexNames: { contains: () => false },
          createIndex(indexName) { indexes.push(name + ':' + indexName); }
        };
      },
      deleteObjectStore() { throw new Error('不該刪 store'); }
    };
  }
  const fromV3 = fakeDb(['mistakes', 'meta', 'studySessions', 'pomodoroState', 'tasks']);
  StudyDB.upgrade(fromV3, {
    objectStore() {
      return { indexNames: { contains: () => true }, createIndex() { throw new Error('既有索引不該重做'); } };
    }
  });
  assert.deepEqual(fromV3.created, ['notes', 'essays']);
  assert.deepEqual(fromV3.indexes, ['notes:subject', 'notes:updatedAt', 'essays:updatedAt']);
  const src = fs.readFileSync(path.join(__dirname, '../features/db-v2.js'), 'utf8');
  assert.equal(src.includes('deleteObjectStore'), false);
  assert.equal(src.includes('.clear('), false);
  assert.equal(StudyDB.DB_VERSION, 4);
  assert.equal(StudyDB.NOTE_STORE, 'notes');
  assert.equal(StudyDB.ESSAY_STORE, 'essays');
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.match(app, /notesFromBackup/);
  assert.match(app, /essaysFromBackup/);
  assert.match(app, /essayEnabled/);
  assert.equal(app.match(/indexedDB\.open/g).length, 1);
});
