'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const StudyStats = require('../features/stats.js');
const StudyDB = require('../features/db-v2.js');
const Search = require('../features/mistake-search.js');
const Insights = require('../features/insights.js');

const LANG = ['單字不會', '片語或搭配不會', '文法不懂', '看不懂整句意思', '會話情境判斷錯', '被相似選項騙', '看漏關鍵字', '猜對的'];
const CALC = ['觀念不懂', '公式忘了或用錯', '基礎數學不熟（分數/移項/次方/根號）', '看漏條件或關鍵字', '計算錯（抄錯/漏負號）', '單位換算錯（k、m、μ）', '不知道從哪裡開始', '時間不夠'];

function sess(id, date, minutes, extra) {
  return Object.assign({
    id, date, startAt: 1, endAt: 2, minutes, subject: 'math', chapterId: null, source: 'pomodoro', updatedAt: 1
  }, extra || {});
}
function mistake(extra) {
  return Object.assign({
    id: 'm', subject: 'ee', status: 'active', qText: '', note: '', chapter: '', reasons: [], history: [], createdAt: 1, nextDue: '2026-11-20'
  }, extra || {});
}

test('six reason groups cover the existing sixteen reasons exactly once', () => {
  const rows = Insights.REASON_GROUPS.flatMap((g) => g.reasons);
  assert.equal(rows.length, 16);
  assert.equal(new Set(rows.map((r) => r.reason)).size, 16);
  assert.deepEqual(rows.filter((r) => r.category === 'lang').map((r) => r.reason).sort(), LANG.slice().sort());
  assert.deepEqual(rows.filter((r) => r.category === 'calc').map((r) => r.reason).sort(), CALC.slice().sort());
  const byName = Object.fromEntries(Insights.REASON_GROUPS.map((g) => [g.name, g.reasons.map((r) => r.reason)]));
  assert.deepEqual(byName['觀念不清楚'].slice().sort(), ['文法不懂', '看不懂整句意思', '會話情境判斷錯', '觀念不懂', '不知道從哪裡開始'].sort());
  assert.deepEqual(byName['計算錯誤'].slice().sort(), ['計算錯（抄錯/漏負號）', '基礎數學不熟（分數/移項/次方/根號）', '單位換算錯（k、m、μ）'].sort());
  assert.deepEqual(byName['記憶錯誤'].slice().sort(), ['單字不會', '片語或搭配不會', '猜對的'].sort());
  assert.deepEqual(byName['看錯題目'].slice().sort(), ['被相似選項騙', '看漏關鍵字', '看漏條件或關鍵字'].sort());
  assert.deepEqual(byName['公式不熟'], ['公式忘了或用錯']);
  assert.deepEqual(byName['時間不足'], ['時間不夠']);
});

test('reason counts merge into the six groups and leave stored reasons unchanged', () => {
  const stored = { id: 'a', reasons: ['文法不懂', '觀念不懂'] };
  const before = stored.reasons.slice();
  const counted = Insights.countReasons([
    stored,
    { id: 'b', reasons: ['計算錯（抄錯/漏負號）', '單字不會'] },
    { id: 'c', reasons: ['公式忘了或用錯', '時間不夠', '看漏關鍵字', '自訂原因'] }
  ]);
  assert.deepEqual(stored.reasons, before);
  const concept = counted.groups.find((g) => g.id === 'concept');
  assert.equal(concept.count, 2);
  assert.equal(concept.reasons.find((r) => r.reason === '文法不懂').count, 1);
  assert.equal(concept.reasons.find((r) => r.reason === '看不懂整句意思').count, 0);
  assert.equal(counted.groups.find((g) => g.id === 'arithmetic').count, 1);
  assert.equal(counted.groups.find((g) => g.id === 'memory').count, 1);
  assert.equal(counted.groups.find((g) => g.id === 'misread').count, 1);
  assert.equal(counted.groups.find((g) => g.id === 'formula').count, 1);
  assert.equal(counted.groups.find((g) => g.id === 'time').count, 1);
  assert.equal(counted.other.count, 1);
  assert.equal(counted.other.reasons[0].reason, '自訂原因');
  assert.equal(counted.ticks, 8);
});

test('search matches question, note, and chapter, and sort works with the existing filters', () => {
  const rows = [
    mistake({ id: 'a', qText: '克希荷夫電流', note: '', chapter: '電阻', subject: 'ee', createdAt: 1, nextDue: '2026-11-20', status: 'active', starred: true }),
    mistake({ id: 'b', qText: '分數加法', note: '先通分', chapter: '分數與通分', subject: 'math', createdAt: 3, nextDue: '2026-11-14', status: 'active' }),
    mistake({ id: 'c', qText: 'The meeting has been put off.', note: '延期', chapter: '片語', subject: 'english', createdAt: 2, nextDue: null, status: 'done' })
  ];
  const order = ['english', 'zh', 'ee', 'em', 'math'];
  const base = { today: '2026-11-13', subjectOrder: order, isDue: (m, t) => m.status === 'active' && m.nextDue && m.nextDue <= t, isQuizzable: (m) => m.status === 'done' };
  assert.deepEqual(Search.arrange(rows, Object.assign({ query: '通分', sort: 'recent' }, base)).map((m) => m.id), ['b']);
  assert.deepEqual(Search.arrange(rows, Object.assign({ query: 'PUT', sort: 'recent' }, base)).map((m) => m.id), ['c']);
  assert.deepEqual(Search.arrange(rows, Object.assign({ query: '電阻', sort: 'recent' }, base)).map((m) => m.id), ['a']);
  assert.deepEqual(Search.arrange(rows, Object.assign({ query: '', sort: 'recent' }, base)).map((m) => m.id), ['b', 'c', 'a']);
  assert.deepEqual(Search.arrange(rows, Object.assign({ query: '', sort: 'next' }, base)).map((m) => m.id), ['b', 'a', 'c']);
  assert.deepEqual(Search.arrange(rows, Object.assign({ query: '', sort: 'subject' }, base)).map((m) => m.id), ['c', 'a', 'b']);
  rows[1].nextDue = '2026-11-13';
  assert.deepEqual(Search.arrange(rows, Object.assign({ query: '分', sort: 'subject', status: 'active', reason: '', onlyDue: true }, base)).map((m) => m.id), ['b']);
  assert.deepEqual(Search.arrange(rows, Object.assign({}, base, { query: '', sort: 'recent', status: 'done', quiz: true, isQuizzable: () => false })).map((m) => m.id), []);
  assert.deepEqual(Search.arrange(rows, Object.assign({}, base, { query: '', sort: 'recent', status: 'done', quiz: true })).map((m) => m.id), ['c']);
  assert.deepEqual(Search.arrange(rows, Object.assign({ query: '', sort: 'recent', starred: true }, base)).map((m) => m.id), ['a']);
  const ids = rows.map((m) => m.id);
  Search.arrange(rows, Object.assign({ query: '', sort: 'subject' }, base));
  assert.deepEqual(rows.map((m) => m.id), ids);
  assert.equal(Search.normalizeSort('nope'), 'recent');
  assert.equal(Search.sortFromBackup('subject', { tabs: [] }, 'overwrite'), 'subject');
  assert.equal(Search.sortFromBackup('subject', { mistakeListSort: 'next' }, 'merge'), 'next');
  assert.equal(Search.sortFromBackup('subject', { mistakeListSort: 'bad' }, 'merge'), 'subject');
  assert.equal(Search.sortFromBackup('subject', { mistakeListSort: 'bad' }, 'overwrite'), 'recent');
  assert.match(Search.controlsHtml('next'), /value="next" selected/);
});

test('priority formula uses active mistakes, completion, weak exams, and days', () => {
  assert.equal(Insights.dayScore(null), null);
  assert.equal(Insights.dayScore(0), 20);
  assert.equal(Insights.dayScore(7), 20);
  assert.equal(Insights.dayScore(8), 12);
  assert.equal(Insights.dayScore(21), 12);
  assert.equal(Insights.dayScore(22), 6);
  assert.equal(Insights.dayScore(45), 6);
  assert.equal(Insights.dayScore(46), 0);
  assert.equal(Insights.dayScore(-1), 0);
  const part = Insights.subjectPriority({ activeMistakes: 3, completion: 40, examAvg: 55, dayScore: 20 });
  assert.deepEqual(part, { mistakePts: 12, incompletePts: 18, weakPts: 20, dayScore: 20, total: 70, completionKnown: true });
  assert.equal(Insights.subjectPriority({ activeMistakes: 0, completion: null, examAvg: null, dayScore: 20 }).incompletePts, 0);
  assert.equal(Insights.subjectPriority({ activeMistakes: 0, completion: 100, examAvg: 90, dayScore: 0 }).weakPts, 0);
  assert.equal(Insights.subjectPriority({ activeMistakes: 0, completion: 100, examAvg: 70, dayScore: 0 }).weakPts, 10);
  assert.equal(Insights.subjectCompletion([
    { subject: 'ee', role: 'main', learned: 2, total: 5, done: false }
  ], 'ee'), 40);
  assert.equal(Insights.subjectCompletion([
    { subject: 'ee', role: 'main', learned: 0, total: 4, done: true },
    { subject: 'ee', role: 'main', learned: 1, total: 4, done: false }
  ], 'ee'), 62.5);
  assert.equal(Insights.subjectCompletion([
    { subject: 'zh', role: 'side', learned: 1, total: 4, done: false }
  ], 'zh'), 25);

  const model = Insights.analyze({
    today: '2026-11-13',
    examStatus: 'manual',
    examDate: '2026-11-20',
    chapters: [{ id: 'ee-2', name: '電阻', subject: 'ee', role: 'main', learned: 2, total: 5, done: false }],
    sessions: [],
    tasks: [],
    mistakes: [
      mistake({ id: 'm1', subject: 'ee', status: 'active' }),
      mistake({ id: 'm2', subject: 'ee', status: 'active' }),
      mistake({ id: 'm3', subject: 'ee', status: 'active' })
    ],
    exams: [
      { id: 'e1', subject: 'ee', date: '2026-10-01', fullScore: 100, score: 55, name: '模考' },
      { id: 'e2', subject: 'zh', date: '2026-10-02', fullScore: 100, score: 90, name: '國文' },
      { id: 'e3', subject: 'math', date: '2026-10-03', fullScore: 100, score: 70, name: '數學' }
    ]
  });
  const ee = model.priority.rows.find((r) => r.id === 'ee');
  assert.equal(model.priority.omitted, false);
  assert.equal(model.priority.days, 7);
  assert.equal(ee.total, 70);
  assert.equal(ee.mistakePts, 12);
  assert.equal(model.priority.rows.find((r) => r.id === 'en').active, 0);
  const html = Insights.panelHtml(model);
  assert.match(html, /優先分＝錯題量分/);
  assert.match(html, /優先分 70/);
  assert.match(html, /距離考試 7 天/);
});

test('missing exam date does not invent a day count and drops the ranking', () => {
  const sessions = [
    sess('s1', '2026-11-01', 20),
    sess('s2', '2026-11-02', 20),
    sess('s3', '2026-11-03', 20)
  ];
  assert.equal(Insights.resolveExamDate({ examSchedule: { writtenDate: '2027-12-11', status: 'estimate' } }), null);
  assert.equal(Insights.resolveExamDate({ examDate: '', examStatus: 'manual' }), null);
  assert.equal(Insights.resolveExamDate({ examDate: '2026-11-20', examStatus: 'manual' }), '2026-11-20');
  const model = Insights.analyze({
    today: '2026-11-13',
    examSchedule: { writtenDate: '2027-12-11', status: 'estimate' },
    sessions, exams: [], mistakes: [], tasks: []
  });
  assert.equal(model.insufficient, false);
  assert.equal(model.priority.omitted, true);
  assert.equal(model.priority.days, null);
  assert.deepEqual(model.priority.rows, []);
  const html = Insights.panelHtml(model);
  assert.match(html, /尚未設定考試日期/);
  assert.match(html, /不自行推算距離考試天數/);
  assert.equal(html.includes('2027-12-11'), false);
  assert.equal(/距離考試 \d+ 天。/.test(html), false);
  assert.equal(html.includes('優先分 '), false);
});

test('fewer than three records shows only the empty state and no chart', () => {
  const model = Insights.analyze({
    today: '2026-11-13',
    sessions: [sess('s1', '2026-11-01', 30)],
    exams: [{ id: 'bad', subject: 'ee', date: '2026-11-01', fullScore: 0, score: 0, name: 'x' }],
    mistakes: [mistake({ id: 'm1' })],
    examSchedule: { writtenDate: '2027-12-11', status: 'estimate' }
  });
  assert.equal(model.insufficient, true);
  assert.equal(model.recordCount, 2);
  assert.equal(Insights.isInsufficient({ sessions: [], exams: [], mistakes: [] }), true);
  const html = Insights.panelHtml(model);
  assert.match(html, /資料還不夠，先累積幾筆紀錄/);
  assert.equal(html.includes('系統統計'), false);
  assert.equal(html.includes('實際紀錄'), false);
  assert.equal(html.includes('<h3>'), false);
  assert.equal(html.includes('<svg'), false);
  assert.equal(html.includes('polyline'), false);
  assert.equal(html.includes(' open'), false);
});

test('essay minutes stay in total time and out of formal Chinese progress and scores', () => {
  const share = Insights.timeShare([
    sess('a', '2026-11-01', 30, { subject: 'zh', source: 'essay' }),
    sess('b', '2026-11-02', 30, { subject: 'zh', source: 'pomodoro' }),
    sess('c', '2026-11-03', 40, { subject: 'ee', source: 'manual' })
  ]);
  assert.equal(share.total, 100);
  assert.equal(share.essay, 30);
  assert.equal(share.formal.zh, 30);
  assert.equal(share.formal.ee, 40);
  assert.equal(share.rows.find((r) => r.id === 'zh').minutes, 30);
  assert.equal(share.rows.find((r) => r.id === 'essay').minutes, 30);
  const same = StudyStats.subjectMinuteShares([
    sess('a', '2026-11-01', 30, { subject: 'zh', source: 'essay' }),
    sess('b', '2026-11-02', 30, { subject: 'zh', source: 'pomodoro' }),
    sess('c', '2026-11-03', 40, { subject: 'ee', source: 'manual' })
  ]);
  assert.equal(share.formal.zh, same.formal.zh);
  assert.equal(share.essay, same.essay);
  assert.equal(share.total, same.total);

  const onlyEssay = [
    sess('e1', '2026-11-01', 40, { subject: 'zh', source: 'essay' }),
    sess('e2', '2026-11-02', 40, { subject: 'zh', source: 'essay' }),
    sess('e3', '2026-11-03', 40, { subject: 'zh', source: 'essay' })
  ];
  const model = Insights.analyze({
    today: '2026-11-13',
    examStatus: 'official',
    examDate: '2026-12-20',
    sessions: onlyEssay,
    exams: [
      { id: 'z1', subject: 'zh', date: '2026-11-01', fullScore: 100, score: 90, name: '一' },
      { id: 'z2', subject: 'zh', date: '2026-11-08', fullScore: 100, score: 92, name: '二' },
      { id: 'z3', subject: 'zh', date: '2026-11-10', fullScore: 100, score: 88, name: '三' }
    ],
    mistakes: [],
    tasks: [{ id: 't1', title: '複習克希荷夫', subject: 'ee', dueDate: '2026-11-16', status: 'todo' }],
    chapters: [{ id: 'ee-2', name: '電阻', subject: 'ee', role: 'main', learned: 0, total: 4, done: false }]
  });
  assert.equal(model.share.formal.zh, 0);
  assert.equal(model.share.essay, 120);
  assert.equal(model.completionOf.zh, null);
  const zh = model.exams.subjects.find((s) => s.id === 'zh');
  assert.equal(zh.avg, 90);
  assert.equal(zh.trend.text, '下降');
  const lines = Insights.advice(model);
  assert.equal(lines.weak.some((t) => t.includes('可考慮加強國文')), false);
  assert.ok(lines.week.some((t) => t.includes('可考慮下週排一點國文正式題') && t.includes('依據') && t.includes('作文')));
  assert.ok(lines.week.some((t) => t.includes('複習克希荷夫')));
  const html = Insights.panelHtml(model);
  assert.equal(html.includes('<svg'), false);
  assert.equal(html.includes('polyline'), false);
  assert.match(html, /不畫趨勢線|趨勢：下降/);
  assert.match(html, /<h3>實際紀錄<\/h3>/);
  assert.match(html, /<h3>系統統計<\/h3>/);
  assert.match(html, /<h3>系統建議<\/h3>/);
});

test('stats blocks with fewer than three of their own records stay empty, and repeated mistakes link through', () => {
  const model = Insights.analyze({
    today: '2026-11-13',
    examSchedule: { status: 'estimate', writtenDate: '2027-12-11' },
    sessions: [
      sess('old', '2026-10-01', 50, { subject: 'ee', chapterId: 'ee-2' }),
      sess('mathold', '2026-10-01', 20, { subject: 'math', chapterId: 'math-9' })
    ],
    exams: [{ id: 'e1', subject: 'ee', date: '2026-11-01', fullScore: 100, score: 40, name: '一次' }],
    tasks: [{ id: 'done', title: '已做完', status: 'done', dueDate: '2026-11-01' }],
    chapters: [
      { id: 'ee-2', name: '電阻', subject: 'ee', role: 'main', learned: 1, total: 4, done: false },
      { id: 'math-9', name: '比例與反比', subject: 'math', role: 'main', learned: 0, total: 3, done: false }
    ],
    mistakes: [
      mistake({
        id: 'hot', chapter: '電阻', qText: '串聯分壓', note: '先畫圖', subject: 'ee',
        reasons: ['觀念不懂', '公式忘了或用錯'],
        history: [{ date: '2026-11-12', result: 'wrong' }, { date: '2026-11-01', result: 'wrong' }]
      }),
      mistake({ id: 'm2', chapter: '分數與通分', subject: 'math', reasons: ['計算錯（抄錯/漏負號）'], history: [{ date: '2026-11-11', result: 'correct' }] }),
      mistake({ id: 'm3', chapter: '片語', subject: 'english', status: 'done', reasons: ['單字不會'], history: [] })
    ]
  });
  assert.equal(model.reviewOn, '2026-11-12');
  assert.equal(model.mastered, 1);
  assert.equal(model.tasks.length, 0);
  assert.equal(model.share.count, 2);
  assert.equal(model.exams.count, 1);
  assert.equal(model.activity.find((row) => row.name === '電阻').date, '2026-11-12');
  assert.equal(model.stale.some((row) => row.name === '電阻'), false);
  assert.ok(model.stale.some((row) => row.name === '比例與反比'));
  const html = Insights.panelHtml(model);
  assert.match(html, /資料還不夠，先累積幾筆紀錄/);
  assert.match(html, /href="#detail\/hot"/);
  assert.match(html, /答錯 2 次/);
  assert.match(html, /已掌握 1 題/);
  assert.match(html, /觀念不清楚/);
  assert.equal(html.includes('<svg'), false);
  const advice = Insights.advice(model);
  assert.ok(advice.stale[0].includes('可考慮再看「比例與反比」'));
  assert.ok(advice.stale[0].includes('依據'));
  assert.equal(advice.weak[0], Insights.INSUFFICIENT_COPY);
});

test('database version stays 5 and the new files are cached', () => {
  assert.equal(StudyDB.DB_VERSION, 5);
  const db = fs.readFileSync(path.join(__dirname, '../features/db-v2.js'), 'utf8');
  const insights = fs.readFileSync(path.join(__dirname, '../features/insights.js'), 'utf8');
  const search = fs.readFileSync(path.join(__dirname, '../features/mistake-search.js'), 'utf8');
  assert.equal(db.includes('deleteObjectStore'), false);
  assert.equal(insights.includes('indexedDB.open'), false);
  assert.equal(search.includes('indexedDB.open'), false);
  assert.match(db, /DB_VERSION = 5/);
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(app, /const DATA_VERSION = 12/);
  assert.match(app, /mistakeListSort/);
  assert.match(app, /Insights\.mount/);
  assert.match(sw, /mistake-notebook-v44/);
  assert.match(sw, /\.\/features\/mistake-search\.js/);
  assert.match(sw, /\.\/features\/insights\.js/);
  assert.match(html, /features\/mistake-search\.js/);
  assert.match(html, /features\/insights\.js/);
  assert.equal(app.match(/indexedDB\.open/g).length, 1);
});
