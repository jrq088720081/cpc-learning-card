/* IndexedDB：只新增 store，不刪、不改名、不清空既有的 mistakes／meta／studySessions／pomodoroState／tasks／notes／essays。
   v2 番茄鐘「進行中」放獨立的 pomodoroState（固定 id=current），不塞進 meta。
   分鐘數與通知開關是設定，另用 meta 的新 key pomodoroSettings（由 app.js 讀寫）。
   v3 只加 tasks（讀書任務）。已逾期不另存，由到期日現算。
   v4 只加 notes、essays。既有 store 與 meta 的 key 結構不動，也不改資料庫名稱。
   v5 只加 flashcards、exams。單字庫與公式庫仍是靜態檔，不複製進這兩個 store。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StudyDB = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DB_VERSION = 5;
  const SESSION_STORE = 'studySessions';
  const POMO_STORE = 'pomodoroState';
  const TASK_STORE = 'tasks';
  const NOTE_STORE = 'notes';
  const ESSAY_STORE = 'essays';
  const FLASH_STORE = 'flashcards';
  const EXAM_STORE = 'exams';
  const POMO_ID = 'current';

  let getDb = null;
  function bind(fn) { getDb = fn; }

  /** onupgradeneeded 專用：缺的 store 才建立。呼叫端仍要自己確保 mistakes、meta 存在。 */
  function upgrade(db, transaction) {
    if (!db.objectStoreNames.contains(SESSION_STORE)) {
      const store = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
      store.createIndex('date', 'date', { unique: false });
    } else if (transaction) {
      const store = transaction.objectStore(SESSION_STORE);
      if (store.indexNames && !store.indexNames.contains('date')) {
        store.createIndex('date', 'date', { unique: false });
      }
    }
    if (!db.objectStoreNames.contains(POMO_STORE)) {
      db.createObjectStore(POMO_STORE, { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains(TASK_STORE)) {
      const store = db.createObjectStore(TASK_STORE, { keyPath: 'id' });
      store.createIndex('dueDate', 'dueDate', { unique: false });
      store.createIndex('status', 'status', { unique: false });
    } else if (transaction) {
      const store = transaction.objectStore(TASK_STORE);
      if (store.indexNames && !store.indexNames.contains('dueDate')) {
        store.createIndex('dueDate', 'dueDate', { unique: false });
      }
      if (store.indexNames && !store.indexNames.contains('status')) {
        store.createIndex('status', 'status', { unique: false });
      }
    }
    ensureIndexed(db, transaction, NOTE_STORE, [['subject', 'subject'], ['updatedAt', 'updatedAt']]);
    ensureIndexed(db, transaction, ESSAY_STORE, [['updatedAt', 'updatedAt']]);
    ensureIndexed(db, transaction, FLASH_STORE, [['nextDue', 'nextDue'], ['refType', 'refType']]);
    ensureIndexed(db, transaction, EXAM_STORE, [['date', 'date'], ['subject', 'subject']]);
  }

  /** 缺的 store 才建立，缺的索引才補。不刪、不改名、不清空。 */
  function ensureIndexed(db, transaction, name, indexes) {
    if (!db.objectStoreNames.contains(name)) {
      const store = db.createObjectStore(name, { keyPath: 'id' });
      indexes.forEach(([indexName, key]) => store.createIndex(indexName, key, { unique: false }));
      return;
    }
    if (!transaction) return;
    const store = transaction.objectStore(name);
    indexes.forEach(([indexName, key]) => {
      if (store.indexNames && !store.indexNames.contains(indexName)) {
        store.createIndex(indexName, key, { unique: false });
      }
    });
  }

  function tx(store, mode, fn) {
    if (!getDb) return Promise.reject(new Error('資料庫尚未接上'));
    return Promise.resolve(getDb()).then((d) => new Promise((resolve, reject) => {
      if (!d) { reject(new Error('資料庫尚未開啟')); return; }
      const t = d.transaction(store, mode);
      let result;
      Promise.resolve(fn(t.objectStore(store))).then((r) => { result = r; }).catch(() => { try { t.abort(); } catch (e) { /* 已結束 */ } });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error || new Error('資料庫讀寫失敗'));
      t.onabort = () => reject(t.error || new Error('資料庫寫入中止'));
    }));
  }

  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  function allSessions() {
    return tx(SESSION_STORE, 'readonly', (s) => {
      if (s.indexNames && s.indexNames.contains('date')) return reqP(s.index('date').getAll());
      return reqP(s.getAll());
    });
  }

  function putSessions(list) {
    return tx(SESSION_STORE, 'readwrite', (s) => {
      (list || []).forEach((row) => { if (row && row.id) s.put(row); });
    });
  }

  /** 同一個 id 只留第一筆。專注結束、重新整理、多分頁都走這裡。 */
  function putSessionOnce(session) {
    const Stats = (typeof globalThis !== 'undefined' && globalThis.StudyStats) || null;
    return tx(SESSION_STORE, 'readwrite', (store) => new Promise((resolve, reject) => {
      const g = store.get(session && session.id);
      g.onerror = () => reject(g.error);
      g.onsuccess = () => {
        const decision = Stats
          ? Stats.keepFirstSession(g.result || null, session)
          : (g.result ? { wrote: false, session: g.result } : { wrote: true, session: session });
        if (!decision.wrote || !decision.session) { resolve(decision); return; }
        const p = store.put(decision.session);
        p.onerror = () => reject(p.error);
        p.onsuccess = () => resolve(decision);
      };
    }));
  }

  function deleteSession(id) {
    return tx(SESSION_STORE, 'readwrite', (s) => { s.delete(id); });
  }

  function allTasks() {
    return tx(TASK_STORE, 'readonly', (s) => reqP(s.getAll()));
  }

  function putTask(task) {
    return tx(TASK_STORE, 'readwrite', (s) => { if (task && task.id) s.put(task); });
  }

  function putTasks(list) {
    return tx(TASK_STORE, 'readwrite', (s) => {
      (list || []).forEach((row) => { if (row && row.id) s.put(row); });
    });
  }

  function deleteTask(id) {
    return tx(TASK_STORE, 'readwrite', (s) => { s.delete(id); });
  }

  function allNotes() {
    return tx(NOTE_STORE, 'readonly', (s) => reqP(s.getAll()));
  }

  function getNote(id) {
    return tx(NOTE_STORE, 'readonly', (s) => reqP(s.get(id)));
  }

  function putNote(note) {
    return tx(NOTE_STORE, 'readwrite', (s) => { if (note && note.id) s.put(note); });
  }

  function putNotes(list) {
    return tx(NOTE_STORE, 'readwrite', (s) => {
      (list || []).forEach((row) => { if (row && row.id) s.put(row); });
    });
  }

  function deleteNote(id) {
    return tx(NOTE_STORE, 'readwrite', (s) => { s.delete(id); });
  }

  function allEssays() {
    return tx(ESSAY_STORE, 'readonly', (s) => reqP(s.getAll()));
  }

  function getEssay(id) {
    return tx(ESSAY_STORE, 'readonly', (s) => reqP(s.get(id)));
  }

  function putEssay(essay) {
    return tx(ESSAY_STORE, 'readwrite', (s) => { if (essay && essay.id) s.put(essay); });
  }

  function putEssays(list) {
    return tx(ESSAY_STORE, 'readwrite', (s) => {
      (list || []).forEach((row) => { if (row && row.id) s.put(row); });
    });
  }

  function deleteEssay(id) {
    return tx(ESSAY_STORE, 'readwrite', (s) => { s.delete(id); });
  }

  function allFlashcards() {
    return tx(FLASH_STORE, 'readonly', (s) => reqP(s.getAll()));
  }

  function getFlashcard(id) {
    return tx(FLASH_STORE, 'readonly', (s) => reqP(s.get(id)));
  }

  function putFlashcard(card) {
    return tx(FLASH_STORE, 'readwrite', (s) => { if (card && card.id) s.put(card); });
  }

  function putFlashcards(list) {
    return tx(FLASH_STORE, 'readwrite', (s) => {
      (list || []).forEach((row) => { if (row && row.id) s.put(row); });
    });
  }

  function deleteFlashcard(id) {
    return tx(FLASH_STORE, 'readwrite', (s) => { s.delete(id); });
  }

  function allExams() {
    return tx(EXAM_STORE, 'readonly', (s) => reqP(s.getAll()));
  }

  function getExam(id) {
    return tx(EXAM_STORE, 'readonly', (s) => reqP(s.get(id)));
  }

  function putExam(exam) {
    return tx(EXAM_STORE, 'readwrite', (s) => { if (exam && exam.id) s.put(exam); });
  }

  function putExams(list) {
    return tx(EXAM_STORE, 'readwrite', (s) => {
      (list || []).forEach((row) => { if (row && row.id) s.put(row); });
    });
  }

  function deleteExam(id) {
    return tx(EXAM_STORE, 'readwrite', (s) => { s.delete(id); });
  }

  /** 同一個交卷 id 只留第一筆。編輯外部成績改走 putExam。 */
  function putExamOnce(exam) {
    const Exams = (typeof globalThis !== 'undefined' && globalThis.Exams) || null;
    return tx(EXAM_STORE, 'readwrite', (store) => new Promise((resolve, reject) => {
      const g = store.get(exam && exam.id);
      g.onerror = () => reject(g.error);
      g.onsuccess = () => {
        const decision = Exams
          ? Exams.keepFirstExam(g.result || null, exam)
          : (g.result ? { wrote: false, exam: g.result } : { wrote: true, exam: exam });
        if (!decision.wrote || !decision.exam) { resolve(decision); return; }
        const p = store.put(decision.exam);
        p.onerror = () => reject(p.error);
        p.onsuccess = () => resolve(decision);
      };
    }));
  }

  function getPomo() {
    return tx(POMO_STORE, 'readonly', (s) => reqP(s.get(POMO_ID)));
  }

  function putPomo(state) {
    const row = Object.assign({}, state, { id: POMO_ID });
    return tx(POMO_STORE, 'readwrite', (s) => { s.put(row); });
  }

  return {
    DB_VERSION, SESSION_STORE, POMO_STORE, TASK_STORE, NOTE_STORE, ESSAY_STORE,
    FLASH_STORE, EXAM_STORE, POMO_ID,
    bind, upgrade, allSessions, putSessions, putSessionOnce, deleteSession,
    allTasks, putTask, putTasks, deleteTask, getPomo, putPomo,
    allNotes, getNote, putNote, putNotes, deleteNote,
    allEssays, getEssay, putEssay, putEssays, deleteEssay,
    allFlashcards, getFlashcard, putFlashcard, putFlashcards, deleteFlashcard,
    allExams, getExam, putExam, putExams, deleteExam, putExamOnce
  };
});
