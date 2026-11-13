/* IndexedDB：只新增 store，不刪、不改名、不清空既有的 mistakes／meta／studySessions／pomodoroState。
   v2 番茄鐘「進行中」放獨立的 pomodoroState（固定 id=current），不塞進 meta。
   分鐘數與通知開關是設定，另用 meta 的新 key pomodoroSettings（由 app.js 讀寫）。
   v3 只加 tasks（讀書任務）。已逾期不另存，由到期日現算。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StudyDB = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DB_VERSION = 3;
  const SESSION_STORE = 'studySessions';
  const POMO_STORE = 'pomodoroState';
  const TASK_STORE = 'tasks';
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

  function getPomo() {
    return tx(POMO_STORE, 'readonly', (s) => reqP(s.get(POMO_ID)));
  }

  function putPomo(state) {
    const row = Object.assign({}, state, { id: POMO_ID });
    return tx(POMO_STORE, 'readwrite', (s) => { s.put(row); });
  }

  return {
    DB_VERSION, SESSION_STORE, POMO_STORE, TASK_STORE, POMO_ID,
    bind, upgrade, allSessions, putSessions, putSessionOnce, deleteSession,
    allTasks, putTask, putTasks, deleteTask, getPomo, putPomo
  };
});
