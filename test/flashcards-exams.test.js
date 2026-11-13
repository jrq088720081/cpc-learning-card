'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const StudyDB = require('../features/db-v2.js');
const Flashcards = require('../features/flashcards.js');
const Exams = require('../features/exams.js');

function card(extra) {
  return Flashcards.createRefCard(Object.assign({
    refType: 'vocab', refId: 'enw:ability', today: '2026-11-13', now: 10
  }, extra || {}));
}

function exam(extra) {
  return Exams.normalizeExam(Object.assign({
    id: 'e1', name: '計時模擬考', date: '2026-11-13', subject: 'ee',
    fullScore: 20, score: 16, correct: 16, wrong: 4, usedMinutes: 40,
    source: 'mock', updatedAt: 5
  }, extra || {}));
}

test('ebbinghaus grades move one stage, stay, or return to the first day', () => {
  assert.deepEqual(Flashcards.INTERVALS, [1, 2, 4, 7, 15, 30]);
  assert.equal(Flashcards.nextStage(0, 'know'), 1);
  assert.equal(Flashcards.nextStage(5, 'know'), 5);
  assert.equal(Flashcards.nextStage(3, 'fuzzy'), 3);
  assert.equal(Flashcards.nextStage(4, 'miss'), 0);
  assert.deepEqual(Flashcards.schedule(0, 'know', '2026-11-13'), { stage: 1, days: 2, nextDue: '2026-11-15' });
  assert.deepEqual(Flashcards.schedule(2, 'fuzzy', '2026-11-13'), { stage: 2, days: 4, nextDue: '2026-11-17' });
  assert.deepEqual(Flashcards.schedule(5, 'miss', '2026-11-13'), { stage: 0, days: 1, nextDue: '2026-11-14' });
  assert.deepEqual(Flashcards.schedule(5, 'know', '2026-11-13'), { stage: 5, days: 30, nextDue: '2026-12-13' });
  assert.equal(Flashcards.addDays('2024-02-28', 1), '2024-02-29');

  const original = card();
  const known = Flashcards.applyGrade(original, 'know', '2026-11-13', 20);
  assert.equal(original.stage, 0);
  assert.equal(original.history.length, 0);
  assert.equal(original.nextDue, '2026-11-13');
  assert.equal(known.stage, 1);
  assert.equal(known.nextDue, '2026-11-15');
  assert.equal(known.history[0].result, 'know');
  assert.equal(known.history[0].stage, 0);
  assert.equal(Flashcards.dueCards([known], '2026-11-13').length, 0);
  assert.equal(Flashcards.dueCards([original], '2026-11-13').length, 1);
  const fuzzy = Flashcards.applyGrade(card({ stage: 0 }), 'fuzzy', '2026-11-13', 21);
  assert.equal(fuzzy.stage, 0);
  assert.equal(fuzzy.nextDue, '2026-11-14');
  assert.equal(Flashcards.isDue(fuzzy, '2026-11-13'), false);
  const missed = Flashcards.applyGrade(known, 'miss', '2026-11-15', 30);
  assert.equal(missed.stage, 0);
  assert.equal(missed.nextDue, '2026-11-16');
  assert.equal(Flashcards.applyGrade(original, 'maybe', '2026-11-13', 1), null);
});

test('review records point at the word bank and do not copy the glossary', () => {
  const made = Flashcards.createRefCard({
    refType: 'vocab', refId: 'enw:ability', today: '2026-11-13', now: 10,
    front: 'ability', back: '能力'
  });
  assert.equal(made.refType, 'vocab');
  assert.equal(made.refId, 'enw:ability');
  assert.equal(made.front, null);
  assert.equal(made.back, null);
  assert.equal(JSON.stringify(made).includes('能力'), false);
  assert.equal(made.w, undefined);
  assert.equal(made.zh, undefined);
  const again = Flashcards.normalizeCard(Object.assign({}, made, { front: 'ability', back: '能力' }));
  assert.equal(again.front, null);
  assert.equal(again.back, null);
  const face = Flashcards.presentCard(made, {
    vocab: [{ id: 'enw:ability', w: 'ability', pos: 'n.', zh: '能力', kk: 'ə', src: [{ id: 'q1' }] }],
    questions: new Map([['q1', {
      id: 'q1', stem: 'She has the ______ to finish it.', choices: ['A. ability'], answer: 'A', translation: '她有能力完成。'
    }]])
  });
  assert.equal(face.front, 'ability');
  assert.equal(face.zh, '能力');
  assert.equal(face.example.en, 'She has the ability to finish it.');
  assert.equal(face.example.zh, '她有能力完成。');
  assert.equal(Flashcards.vocabExample({ w: 'quiet', src: [] }, new Map()), null);
  const custom = Flashcards.createCustom({ front: '歐姆', back: 'V=IR', today: '2026-11-13', now: 4 });
  assert.equal(custom.refType, 'custom');
  assert.equal(custom.front, '歐姆');
  assert.equal(custom.back, 'V=IR');
  assert.equal(Flashcards.createCustom({ front: '  ', back: '答案', today: '2026-11-13', now: 4 }), null);
  assert.deepEqual(Flashcards.formulaSymbols('V=IR'), ['V', 'I', 'R']);
  assert.deepEqual(Flashcards.formulaSymbols('\\frac{1}{R}=\\frac{1}{R_1}+\\frac{1}{R_2}'), ['R', 'R_1', 'R_2']);
  const shown = Flashcards.presentCard(
    Flashcards.createRefCard({ refType: 'formula', refId: 'ohm', today: '2026-11-13', now: 1 }),
    { formulas: [{ id: 'ohm', name: '歐姆定律', tex: 'V=IR', blurb: '兩個已知求另一個', plain: '電壓等於電流乘電阻', subject: 'ee', questionIds: ['cpc-105-13'] }] }
  );
  assert.equal(shown.front, '歐姆定律');
  assert.deepEqual(shown.symbols, ['V', 'I', 'R']);
  assert.equal(shown.condition, '兩個已知求另一個');
  const kept = Flashcards.cardsFromBackup([made], { version: 10, mistakes: [{ id: 'm1' }] });
  assert.equal(kept[0].refId, 'enw:ability');
  const merged = Flashcards.cardsFromBackup([made], {
    version: 11,
    flashcards: [
      Object.assign({}, made, { updatedAt: 1 }),
      Object.assign({}, made, { updatedAt: 30, stage: 2, nextDue: '2026-11-20' }),
      { refType: 'vocab' }
    ]
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].stage, 2);
  assert.equal(merged[0].updatedAt, 30);
});

test('the same mock submission is not written twice', () => {
  const first = Exams.buildMockExam({
    id: 'mock-1', name: '計時模擬考', subject: 'ee', correct: 8, wrong: 2, graded: 10,
    startedAt: 0, endedAt: 20 * 60000, plannedSec: 40 * 60, date: '2026-11-13', now: 5
  });
  assert.equal(first.source, 'mock');
  assert.equal(first.score, 8);
  assert.equal(first.fullScore, 10);
  assert.equal(first.usedMinutes, 20);
  const retry = Exams.buildMockExam({
    id: 'mock-1', name: '計時模擬考', subject: 'ee', correct: 1, wrong: 9, graded: 10,
    usedMinutes: 20, date: '2026-11-13', now: 9
  });
  const once = Exams.keepFirstExam(null, first);
  assert.equal(once.wrote, true);
  assert.equal(once.exam.score, 8);
  const twice = Exams.keepFirstExam(once.exam, retry);
  assert.equal(twice.wrote, false);
  assert.equal(twice.exam.score, 8);
  assert.equal(twice.exam.correct, 8);
  assert.equal(Exams.keepFirstExam({ id: 'bad' }, first).wrote, true);
  const state = { mode: 'mock', examRecordId: 'mock-1', examWritten: false };
  assert.equal(Exams.shouldRecordExam(state), true);
  state.examWritten = true;
  assert.equal(Exams.shouldRecordExam(state), false);
  assert.equal(Exams.shouldRecordExam({ mode: 'practice', examRecordId: 'mock-1' }), false);
  assert.equal(Exams.usedMinutes(0, 20 * 60000, 15 * 60), 15);
  assert.equal(Exams.buildMockExam({ id: 'x', subject: 'ee', correct: 0, wrong: 0, graded: 0, date: '2026-11-13', now: 1 }), null);
});

test('score stats ignore practice history and stay empty without exams', () => {
  const practice = {
    history: [{ at: Date.UTC(2026, 10, 13, 4, 0), subject: 'ee', correct: 18, total: 20, source: '模擬考' }]
  };
  const empty = Exams.progressModel([], practice, { ee: 80 });
  assert.equal(empty.empty, true);
  assert.equal(empty.svg, '');
  assert.equal(empty.subjects.length, 0);
  assert.equal(empty.weak.length, 0);
  assert.equal(empty.practice.length, 1);
  assert.equal(empty.practice[0].source, '模擬考');
  const emptyHtml = Exams.progressHtml([], practice, { ee: 80 });
  assert.equal(emptyHtml.includes('<svg'), false);
  assert.equal(emptyHtml.includes('<polyline'), false);
  assert.match(emptyHtml, /還沒有成績/);
  assert.match(emptyHtml, /歷史練習/);
  assert.match(emptyHtml, /18 \/ 20/);
  assert.equal(emptyHtml.includes('80'), false);

  const rows = [
    exam({ id: 'a', date: '2026-11-01', score: 10, fullScore: 20, correct: 10, wrong: 10, updatedAt: 1 }),
    exam({ id: 'b', date: '2026-11-10', score: 16, fullScore: 20, correct: 16, wrong: 4, updatedAt: 2 }),
    exam({ id: 'c', subject: 'zh', date: '2026-11-11', score: 90, fullScore: 100, correct: 90, wrong: 10, source: 'manual', updatedAt: 3 })
  ];
  const model = Exams.progressModel(rows, practice, { ee: 80, zh: 70 });
  assert.equal(model.empty, false);
  assert.match(model.svg, /<svg/);
  assert.match(model.svg, /<polyline/);
  const ee = model.subjects.find((s) => s.id === 'ee');
  const zh = model.subjects.find((s) => s.id === 'zh');
  assert.equal(ee.avg, 65);
  assert.equal(ee.max, 80);
  assert.equal(ee.min, 50);
  assert.equal(ee.gap, -15);
  assert.equal(ee.gapText, '低於目標 15 分');
  assert.equal(zh.avg, 90);
  assert.equal(zh.gap, 20);
  assert.deepEqual(model.weak.map((s) => s.id), ['ee', 'zh']);
  assert.equal(model.subjects.some((s) => s.id === 'math'), false);
  const noTarget = Exams.progressModel(rows, null, {});
  assert.equal(noTarget.subjects.find((s) => s.id === 'ee').gap, null);
  assert.equal(noTarget.subjects.find((s) => s.id === 'ee').gapText, '尚未設定目標');
  const one = Exams.progressModel([
    exam({ id: 'm', subject: 'math', score: 3, fullScore: 4, correct: 3, wrong: 1, date: '2026-11-02' })
  ], null, {});
  assert.match(one.svg, /<circle/);
  assert.equal(one.svg.includes('<polyline'), false);
  assert.equal(one.subjects[0].avg, 75);
  const html = Exams.progressHtml(rows, practice, { ee: 80, zh: 70 });
  assert.equal((html.match(/<svg/g) || []).length, 1);
  assert.match(html, /歷史練習/);
  assert.match(html, /弱科/);
});

test('manual scores can be built and edited, and old backups keep local rows', () => {
  assert.equal(Exams.buildManual({ name: '', date: '2026-11-13', subject: 'zh', fullScore: 100, score: 80, correct: 80, wrong: 20, usedMinutes: 40, now: 1 }).ok, false);
  assert.equal(Exams.buildManual({
    name: '模考', date: '2026-11-13', subject: 'zh', fullScore: 100, score: 120, correct: 1, wrong: 1, usedMinutes: 10, now: 1
  }).ok, false);
  const made = Exams.buildManual({
    id: 'man-1', name: '外部模擬', date: '2026-11-13', subject: 'en',
    fullScore: 100, score: 88, correct: 44, wrong: 6, usedMinutes: 60, now: 3
  });
  assert.equal(made.ok, true);
  assert.equal(made.exam.source, 'manual');
  assert.equal(made.exam.score, 88);
  const edited = Exams.applyEdit(made.exam, { score: 90, correct: 45, wrong: 5 }, 9);
  assert.equal(edited.ok, true);
  assert.equal(edited.exam.id, 'man-1');
  assert.equal(edited.exam.score, 90);
  assert.equal(edited.exam.source, 'manual');
  const mockEdited = Exams.applyEdit(exam({ id: 'mock-9', source: 'mock', score: 10 }), { score: 12, correct: 12, wrong: 8 }, 12);
  assert.equal(mockEdited.exam.source, 'mock');
  assert.equal(mockEdited.exam.score, 12);
  assert.equal(Exams.examsFromBackup([made.exam], { version: 10, mistakes: [] })[0].id, 'man-1');
  const merged = Exams.examsFromBackup([made.exam], {
    version: 11,
    exams: [
      Object.assign({}, made.exam, { score: 10, updatedAt: 1 }),
      Object.assign({}, made.exam, { name: '較新', score: 91, updatedAt: 20 }),
      { name: '沒有 id' }
    ]
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, '較新');
  assert.equal(merged[0].score, 91);
  assert.deepEqual(Exams.normalizeTargetScores({ ee: 80, zh: '', math: 120, en: '70.5' }), { ee: 80, en: 70.5 });
  assert.deepEqual(Exams.targetScoresFromBackup({ ee: 60 }, { tabs: [] }, 'overwrite'), { ee: 60 });
  assert.deepEqual(Exams.targetScoresFromBackup({ ee: 60, zh: 70 }, { targetScores: { ee: 90 } }, 'merge'), { ee: 90, zh: 70 });
  assert.deepEqual(Exams.targetScoresFromBackup({ ee: 60 }, { targetScores: {} }, 'overwrite'), {});
});

test('version 5 only adds flashcards and exams, and the shell points at them', () => {
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
  const fromV4 = fakeDb(['mistakes', 'meta', 'studySessions', 'pomodoroState', 'tasks', 'notes', 'essays']);
  StudyDB.upgrade(fromV4, {
    objectStore() {
      return { indexNames: { contains: () => true }, createIndex() { throw new Error('既有索引不該重做'); } };
    }
  });
  assert.deepEqual(fromV4.created, ['flashcards', 'exams']);
  assert.deepEqual(fromV4.indexes, ['flashcards:nextDue', 'flashcards:refType', 'exams:date', 'exams:subject']);
  const src = fs.readFileSync(path.join(__dirname, '../features/db-v2.js'), 'utf8');
  assert.equal(src.includes('deleteObjectStore'), false);
  assert.equal(src.includes('.clear('), false);
  assert.equal(StudyDB.DB_VERSION, 5);
  assert.equal(StudyDB.FLASH_STORE, 'flashcards');
  assert.equal(StudyDB.EXAM_STORE, 'exams');
  assert.match(src, /putExamOnce/);
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const learn = fs.readFileSync(path.join(__dirname, '../learn-features.js'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(app, /const DATA_VERSION = 13/);
  assert.match(app, /flashcardsFromBackup|cardsFromBackup/);
  assert.match(app, /examsFromBackup/);
  assert.match(app, /targetScores/);
  assert.equal(app.match(/indexedDB\.open/g).length, 1);
  assert.match(sw, /mistake-notebook-v45/);
  assert.match(sw, /\.\/features\/flashcards\.js/);
  assert.match(sw, /\.\/features\/exams\.js/);
  assert.match(html, /features\/flashcards\.js/);
  assert.match(html, /features\/exams\.js/);
  const finishAt = learn.indexOf('async function finish');
  const finish = learn.slice(finishAt, finishAt + 1800);
  assert.match(finish, /recordPractice/);
  assert.match(finish, /commitMock/);
  assert.match(finish, /shouldRecordExam/);
  assert.match(learn, /加入錯題本/);
  assert.match(learn, /翻卡複習|modeLinkHtml/);
  assert.match(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), /const EBBINGHAUS = \[1, 2, 4, 7, 15, 30\]/);
});
