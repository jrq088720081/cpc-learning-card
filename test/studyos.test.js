'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const StudyDB = require('../features/db-v2.js');
const StudyStats = require('../features/stats.js');
const StudyTasks = require('../features/tasks.js');
const StudyHeat = require('../features/heatmap.js');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/path-chapters.json'), 'utf8'));

function taipei(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h || 0, min || 0) - 8 * 3600000;
}
function task(extra) {
  return Object.assign({
    id: 't1', title: '讀電工', subject: 'ee', chapterId: null, estMinutes: 40,
    dueDate: '2026-11-12', priority: 'mid', status: 'todo', doneAt: null,
    createdAt: 1, updatedAt: 1
  }, extra || {});
}
function sess(id, date, minutes, extra) {
  return Object.assign({
    id, date, startAt: 1, endAt: 2, minutes, subject: 'math', chapterId: null, source: 'manual', updatedAt: 1
  }, extra || {});
}
function monday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

test('overdue uses Taipei midnight, and a finished task is not overdue', () => {
  const row = task();
  const before = StudyStats.taipeiDate(taipei(2026, 11, 12, 23, 59));
  const after = StudyStats.taipeiDate(taipei(2026, 11, 13, 0, 0));
  assert.equal(before, '2026-11-12');
  assert.equal(after, '2026-11-13');
  assert.equal(StudyTasks.isOverdue(row, before), false);
  assert.equal(StudyTasks.isOverdue(row, after), true);
  assert.equal(StudyTasks.isOverdue(task({ dueDate: '2026-11-13' }), after), false);
  assert.equal(StudyTasks.isOverdue(task({ status: 'done', doneAt: 5 }), after), false);
  assert.equal(StudyTasks.isOverdue(task({ status: 'doing' }), after), true);
});

test('week view is seven days starting Monday', () => {
  const thu = StudyTasks.weekDays('2026-11-12');
  assert.deepEqual(thu, [
    '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'
  ]);
  assert.equal(monday(thu[0]), true);
  assert.deepEqual(StudyTasks.weekDays('2026-11-09'), thu);
  assert.deepEqual(StudyTasks.weekDays('2026-11-15'), thu);
  const prev = StudyTasks.weekDays('2026-11-08');
  assert.equal(prev.length, 7);
  assert.equal(prev[0], '2026-11-02');
  assert.equal(prev[6], '2026-11-08');
  assert.equal(monday(prev[0]), true);
  const march = StudyTasks.weekDays('2026-03-01');
  assert.equal(march[0], '2026-02-23');
  assert.equal(march.length, 7);
  assert.equal(monday(march[0]), true);
});

test('today completion rate ignores overdue tasks and is empty when nothing is due today', () => {
  const today = '2026-11-12';
  const rows = [
    task({ id: 'done', status: 'done', doneAt: 2 }),
    task({ id: 'open', status: 'todo' }),
    task({ id: 'late', dueDate: '2026-11-11', status: 'doing' }),
    task({ id: 'next', dueDate: '2026-11-13', status: 'done', doneAt: 3 })
  ];
  const rate = StudyTasks.todayRate(rows, today);
  assert.equal(rate.empty, false);
  assert.equal(rate.done, 1);
  assert.equal(rate.total, 2);
  assert.equal(rate.percent, 50);
  assert.match(StudyTasks.rateText(rate), /1 \/ 2（50%）/);
  const none = StudyTasks.todayRate([], today);
  assert.equal(none.empty, true);
  assert.equal(none.percent, null);
  assert.equal(StudyTasks.rateText(none).includes('%'), false);
  assert.equal(StudyTasks.rateText(none), '今天沒有到期的任務');
  const onlyLate = StudyTasks.todayRate([task({ dueDate: '2026-11-11' })], today);
  assert.equal(onlyLate.empty, true);
  assert.equal(onlyLate.percent, null);
  const allOpen = StudyTasks.todayRate([task({ id: 'a' }), task({ id: 'b' })], today);
  assert.equal(allOpen.empty, false);
  assert.equal(allOpen.percent, 0);
  const visible = StudyTasks.visibleTasks(rows, { view: 'today', today });
  assert.deepEqual(visible.map((t) => t.id), ['late', 'open', 'done']);
  assert.equal(StudyTasks.visibleTasks(rows, { view: 'today', today }).some((t) => t.id === 'next'), false);
});

test('tasks sort unfinished first, then due date, then priority', () => {
  const sorted = StudyTasks.sortTasks([
    task({ id: 'done', status: 'done', priority: 'high', dueDate: '2026-11-10', doneAt: 1 }),
    task({ id: 'later', status: 'todo', priority: 'high', dueDate: '2026-11-13' }),
    task({ id: 'low', status: 'todo', priority: 'low', dueDate: '2026-11-12' }),
    task({ id: 'high', status: 'doing', priority: 'high', dueDate: '2026-11-12' })
  ]);
  assert.deepEqual(sorted.map((t) => t.id), ['high', 'low', 'later', 'done']);
});

test('heatmap levels are 0, 1–29, 30–59, 60–119, 120+', () => {
  assert.equal(StudyHeat.heatLevel(0), 0);
  assert.equal(StudyHeat.heatLevel(null), 0);
  assert.equal(StudyHeat.heatLevel(1), 1);
  assert.equal(StudyHeat.heatLevel(29), 1);
  assert.equal(StudyHeat.heatLevel(30), 2);
  assert.equal(StudyHeat.heatLevel(59), 2);
  assert.equal(StudyHeat.heatLevel(60), 3);
  assert.equal(StudyHeat.heatLevel(119), 3);
  assert.equal(StudyHeat.heatLevel(120), 4);
  assert.equal(StudyHeat.heatLevel(400), 4);
  const cells = StudyHeat.heatCells([
    sess('a', '2026-11-12', 20),
    sess('b', '2026-11-12', 15),
    sess('c', '2026-11-14', 100)
  ], '2026-11-12', '12w');
  const flat = cells.weeks.flatMap((w) => w.days);
  const today = flat.find((d) => d.date === '2026-11-12');
  const future = flat.find((d) => d.date === '2026-11-14');
  assert.equal(today.minutes, 35);
  assert.equal(today.level, 2);
  assert.equal(future.future, true);
  assert.equal(future.minutes, 0);
  assert.equal(future.level, 0);
  cells.weeks.forEach((week) => {
    assert.equal(week.days.length, 7);
    assert.equal(monday(week.start), true);
    assert.equal(week.days[0].date, week.start);
  });
  assert.equal(cells.weeks.length, 12);
  assert.equal(cells.weeks[11].start, '2026-11-09');
});

test('heatmap ranges stay on Monday and charts draw nothing when minutes are zero', () => {
  const half = StudyHeat.heatRange('2026-11-12', '6m');
  const year = StudyHeat.heatRange('2026-11-12', '1y');
  assert.equal(half.weeks[0].start, StudyStats.weekStartMonday(StudyHeat.addMonths('2026-11-12', -6)));
  assert.equal(half.weeks[half.weeks.length - 1].start, '2026-11-09');
  assert.equal(monday(half.weeks[0].start), true);
  assert.ok(half.weeks.length > 12);
  assert.equal(year.weeks[0].start, StudyStats.weekStartMonday(StudyHeat.addMonths('2026-11-12', -12)));
  assert.ok(year.weeks.length > half.weeks.length);
  year.weeks.forEach((week) => {
    assert.equal(week.days.length, 7);
    assert.equal(monday(week.days[0]), true);
  });
  const emptyDays = StudyHeat.dailySeries([], '2026-11-12', 14);
  assert.equal(emptyDays.length, 14);
  assert.equal(StudyHeat.chartHasMinutes(emptyDays), false);
  assert.equal(StudyHeat.barSvg(emptyDays, '近 14 天'), '');
  const subjects = StudyHeat.subjectSeries([
    sess('m', '2026-11-12', 40, { subject: 'math' }),
    sess('future', '2026-11-20', 90, { subject: 'zh' })
  ], '2026-11-12');
  assert.equal(subjects.find((r) => r.id === 'math').minutes, 40);
  assert.equal(subjects.find((r) => r.id === 'zh').minutes, 0);
  assert.equal(subjects.reduce((sum, r) => sum + r.minutes, 0), 40);
  const mixed = [
    sess('formal', '2026-11-12', 20, { subject: 'zh', source: 'pomodoro' }),
    sess('essay', '2026-11-12', 40, { subject: 'zh', source: 'essay' })
  ];
  const split = StudyStats.subjectMinuteShares(mixed, '2026-11-12');
  const heatSubjects = StudyHeat.subjectSeries(mixed, '2026-11-12');
  assert.equal(split.total, 60);
  assert.equal(split.formal.zh, 20);
  assert.equal(split.essay, 40);
  assert.equal(StudyStats.displaySubjectName(mixed[1]), '國文作文');
  assert.equal(StudyStats.displaySubjectName(mixed[0]), '國文');
  assert.equal(heatSubjects.find((r) => r.id === 'zh').minutes, 20);
  assert.equal(heatSubjects.find((r) => r.id === 'essay').minutes, 40);
  assert.equal(heatSubjects.find((r) => r.id === 'essay').name, '國文作文');
  assert.equal(StudyHeat.dayMinutes(mixed, '2026-11-12', '2026-11-12'), 60);
  const cell = StudyHeat.heatCells(mixed, '2026-11-12', '12w').weeks
    .flatMap((w) => w.days).find((d) => d.date === '2026-11-12');
  assert.equal(cell.minutes, 60);
  assert.equal(cell.level, StudyHeat.heatLevel(60));
  const svg = StudyHeat.subjectSvg(heatSubjects, '各科讀書分鐘');
  assert.match(svg, /國文作文/);
  assert.match(svg, /tone-essay/);
  assert.match(svg, /tone-zh/);
  const weeks = StudyHeat.weeklySeries([
    sess('a', '2026-11-12', 40),
    sess('b', '2026-11-09', 20)
  ], '2026-11-12', 8);
  assert.equal(weeks.length, 8);
  assert.equal(weeks[7].start, '2026-11-09');
  assert.equal(weeks[7].minutes, 60);
  const months = StudyHeat.monthlySeries([
    sess('a', '2026-11-12', 40),
    sess('b', '2026-10-01', 15),
    sess('c', '2026-12-01', 99)
  ], '2026-11-12', 6);
  assert.equal(months.length, 6);
  assert.equal(months[5].key, '2026-11');
  assert.equal(months[5].minutes, 40);
  assert.equal(months.find((m) => m.key === '2026-10').minutes, 15);
  assert.equal(months.some((m) => m.minutes === 99), false);
  const drawn = StudyHeat.barSvg(StudyHeat.dailySeries([sess('a', '2026-11-12', 40)], '2026-11-12', 14), '近 14 天');
  assert.match(drawn, /<svg/);
  assert.match(drawn, /40 分鐘/);
});

test('longest streak skips gaps, zero-minute days, and future dates', () => {
  const today = '2026-11-12';
  const rows = [
    sess('a', '2026-11-01', 10),
    sess('z', '2026-11-02', 0),
    sess('b', '2026-11-03', 10),
    sess('c', '2026-11-04', 10),
    sess('d', '2026-11-05', 10),
    sess('e', '2026-11-10', 10),
    sess('f', '2026-11-11', 10),
    sess('g', '2026-11-20', 30)
  ];
  assert.equal(StudyHeat.longestStreak(rows, today), 3);
  assert.equal(StudyHeat.longestStreak([], today), 0);
  const sum = StudyHeat.summarizeStudy(rows, taipei(2026, 11, 12, 12, 0), null);
  assert.equal(sum.longest, 3);
  assert.equal(sum.streak, 2);
  assert.equal(sum.goal.set, false);
});

test('weekly goal stays unset instead of a fake percent', () => {
  assert.equal(StudyHeat.normalizeWeeklyGoal(null), null);
  assert.equal(StudyHeat.normalizeWeeklyGoal(''), null);
  assert.equal(StudyHeat.normalizeWeeklyGoal(0), null);
  assert.equal(StudyHeat.normalizeWeeklyGoal(600), 600);
  const unset = StudyHeat.weeklyGoalRate(80, null);
  assert.equal(unset.set, false);
  assert.equal(unset.percent, null);
  assert.equal(StudyHeat.goalText(unset), '尚未設定每週目標');
  assert.equal(StudyHeat.goalText(unset).includes('%'), false);
  assert.equal(StudyHeat.goalText(StudyHeat.weeklyGoalRate(0, undefined)).includes('0%'), false);
  const zero = StudyHeat.weeklyGoalRate(0, 120);
  assert.equal(zero.set, true);
  assert.equal(zero.percent, 0);
  assert.equal(StudyHeat.goalText(zero), '0%');
  assert.equal(StudyHeat.weeklyGoalRate(90, 60).percent, 150);
  assert.equal(StudyHeat.weeklyGoalFromBackup(600, { tabs: [] }, 'overwrite'), 600);
  assert.equal(StudyHeat.weeklyGoalFromBackup(600, { weeklyGoalMinutes: null }, 'merge'), 600);
  assert.equal(StudyHeat.weeklyGoalFromBackup(600, { weeklyGoalMinutes: 300 }, 'merge'), 300);
  assert.equal(StudyHeat.weeklyGoalFromBackup(600, { weeklyGoalMinutes: null }, 'overwrite'), null);
});

test('import keeps the newer task and still reads a v8 backup', () => {
  const local = [task({ id: 'a', title: '舊標題', updatedAt: 10 })];
  const merged = StudyTasks.tasksFromBackup(local, {
    version: 9,
    tasks: [
      task({ id: 'a', title: '較舊', updatedAt: 5 }),
      task({ id: 'a', title: '較新', updatedAt: 20 }),
      task({ id: 'b', title: '另一件', updatedAt: 3 }),
      { id: 'bad' }
    ]
  });
  const byId = Object.fromEntries(merged.map((t) => [t.id, t]));
  assert.equal(byId.a.title, '較新');
  assert.equal(byId.a.updatedAt, 20);
  assert.equal(byId.b.title, '另一件');
  assert.equal(merged.some((t) => t.id === 'bad'), false);
  const oldFile = { app: 'mistake-notebook', version: 8, mistakes: [{ id: 'm1' }], settings: { tabs: [] } };
  const kept = StudyTasks.tasksFromBackup(local, oldFile);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].title, '舊標題');
  assert.equal(StudyTasks.tasksFromBackup(local, null)[0].id, 'a');
  assert.equal(StudyTasks.tasksFromBackup(local, { version: 7 }).length, 1);
  const built = StudyTasks.buildTask({
    id: 'n1', title: '字音', subject: 'zh', chapterId: 'ee-1', estMinutes: 20,
    dueDate: '2026-11-12', priority: 'high', status: 'todo', updatedAt: 4, catalog
  });
  assert.equal(built.ok, false);
  const ok = StudyTasks.buildTask({
    id: 'n1', title: '字音', subject: 'zh', chapterId: 'zh-phon', estMinutes: 20,
    dueDate: '2026-11-12', priority: 'high', status: 'todo', updatedAt: 4, createdAt: 2, catalog
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.task.chapterId, 'zh-phon');
});

test('version 4 upgrade adds notes and essays without removing older stores', () => {
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
  const fromV2 = fakeDb(['mistakes', 'meta', 'studySessions', 'pomodoroState']);
  StudyDB.upgrade(fromV2, {
    objectStore() {
      return { indexNames: { contains: () => true }, createIndex() { throw new Error('既有索引不該重做'); } };
    }
  });
  assert.deepEqual(fromV2.created, ['tasks', 'notes', 'essays', 'flashcards', 'exams']);
  assert.deepEqual(fromV2.indexes, ['tasks:dueDate', 'tasks:status', 'notes:subject', 'notes:updatedAt', 'essays:updatedAt', 'flashcards:nextDue', 'flashcards:refType', 'exams:date', 'exams:subject']);
  const fresh = fakeDb(['mistakes', 'meta']);
  StudyDB.upgrade(fresh, null);
  assert.deepEqual(fresh.created, ['studySessions', 'pomodoroState', 'tasks', 'notes', 'essays', 'flashcards', 'exams']);
  assert.ok(fresh.indexes.includes('tasks:dueDate'));
  assert.ok(fresh.indexes.includes('tasks:status'));
  const src = fs.readFileSync(path.join(__dirname, '../features/db-v2.js'), 'utf8');
  assert.equal(src.includes('deleteObjectStore'), false);
  assert.equal(src.includes('.clear('), false);
  assert.equal(StudyDB.DB_VERSION, 5);
  assert.equal(StudyDB.TASK_STORE, 'tasks');
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.match(app, /const DATA_VERSION = 13/);
  assert.match(app, /tasksFromBackup/);
  assert.match(app, /weeklyGoalMinutes/);
  assert.equal(app.match(/indexedDB\.open/g).length, 1);
});
