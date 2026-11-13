/* 安裝提示、離線細列、Service Worker 更新、儲存空間與持久保存。
   不彈窗。已是主畫面（standalone）就不顯示安裝。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PwaStatus = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const OFFLINE_TEXT = '目前離線，資料存在本機，恢復連線後即可備份';
  const UPDATE_TEXT = '有新版本，重新載入';
  const INSTALL_BUTTON = '安裝到主畫面';
  const IOS_TEXT = 'iPhone／iPad 請點 Safari 的「分享」，再選「加入主畫面」。';
  const PERSIST_BUTTON = '申請持久保存';

  function installMode(env) {
    const e = env || {};
    if (e.standalone) return 'hidden';
    if (e.canPrompt) return 'prompt';
    if (e.ios) return 'ios';
    return 'hidden';
  }

  function isIosSafari(ua, opts) {
    const s = String(ua || '');
    const extra = opts || {};
    const ios = /iPad|iPhone|iPod/.test(s)
      || (extra.platform === 'MacIntel' && Number(extra.maxTouchPoints) > 1);
    const safari = /Safari/i.test(s) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(s);
    return !!(ios && safari);
  }

  function isStandalone(nav, matchMedia) {
    if (nav && nav.standalone === true) return true;
    if (typeof matchMedia === 'function') {
      try {
        const q = matchMedia('(display-mode: standalone)');
        if (q && q.matches) return true;
      } catch (err) { /* 沒有 matchMedia */ }
    }
    return false;
  }

  function formatUsage(estimate) {
    if (!estimate || typeof estimate.usage !== 'number' || !Number.isFinite(estimate.usage) || estimate.usage < 0) return null;
    const usageMb = estimate.usage / 1048576;
    const quotaMb = typeof estimate.quota === 'number' && estimate.quota > 0 ? estimate.quota / 1048576 : null;
    const text = quotaMb == null
      ? '已用 ' + usageMb.toFixed(1) + ' MB'
      : '已用 ' + usageMb.toFixed(1) + ' MB，配額約 ' + quotaMb.toFixed(1) + ' MB';
    return { usageMb, quotaMb, text };
  }

  function persistLabel(persisted) {
    if (persisted === true) return '已持久保存。瀏覽器不會因為空間不夠就自動清掉這份資料。';
    if (persisted === false) return '尚未持久保存。空間不夠時，瀏覽器可能清掉本機資料，請另外備份。';
    return '這台瀏覽器無法查詢持久保存。';
  }

  let started = false;
  let deferred = null;
  let installed = false;
  let offline = false;
  let updateReady = false;
  let bar = null;
  let offlineEl = null;
  let updateEl = null;
  let reloadBtn = null;

  function ensureBar() {
    if (bar || typeof document === 'undefined') return;
    bar = document.getElementById('pwaBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pwaBar';
      bar.className = 'pwa-bar';
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');
      document.body.insertBefore(bar, document.body.firstChild);
    }
    bar.replaceChildren();
    offlineEl = document.createElement('span');
    offlineEl.id = 'pwaOffline';
    offlineEl.textContent = OFFLINE_TEXT;
    updateEl = document.createElement('span');
    updateEl.id = 'pwaUpdate';
    updateEl.textContent = UPDATE_TEXT;
    reloadBtn = document.createElement('button');
    reloadBtn.type = 'button';
    reloadBtn.id = 'pwaReload';
    reloadBtn.className = 'pwa-reload';
    reloadBtn.textContent = '重新載入';
    reloadBtn.addEventListener('click', () => location.reload());
    bar.appendChild(offlineEl);
    bar.appendChild(updateEl);
    bar.appendChild(reloadBtn);
  }

  function renderBar() {
    if (!bar) return;
    const showOff = offline;
    const showUp = updateReady;
    offlineEl.hidden = !showOff;
    updateEl.hidden = !showUp;
    reloadBtn.hidden = !showUp;
    const on = showOff || showUp;
    bar.hidden = !on;
    document.body.classList.toggle('has-pwa-bar', on);
    if (on) {
      const h = bar.offsetHeight || 32;
      document.documentElement.style.setProperty('--pwa-bar-h', h + 'px');
    }
  }

  function showUpdate() {
    updateReady = true;
    ensureBar();
    renderBar();
  }

  function setOffline(on) {
    offline = !!on;
    ensureBar();
    renderBar();
  }

  function currentInstallEnv() {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    return {
      standalone: installed || isStandalone(nav, typeof window !== 'undefined' ? window.matchMedia.bind(window) : null),
      ios: isIosSafari(nav && nav.userAgent, {
        platform: nav && nav.platform,
        maxTouchPoints: nav && nav.maxTouchPoints
      }),
      canPrompt: !!deferred
    };
  }

  function refreshSettings() {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('pwaSettingsMount');
    if (host) mountSettings(host);
  }

  function start() {
    if (started || typeof window === 'undefined') return;
    started = true;
    ensureBar();
    setOffline(typeof navigator !== 'undefined' && navigator.onLine === false);
    window.addEventListener('offline', () => setOffline(true));
    window.addEventListener('online', () => setOffline(false));
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferred = event;
      refreshSettings();
    });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      installed = true;
      refreshSettings();
    });
    if (navigator.serviceWorker) {
      let had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (had) showUpdate();
        had = true;
      });
    }
  }

  function watch(reg) {
    if (!reg) return;
    const arm = (worker) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker && navigator.serviceWorker.controller) showUpdate();
      });
    };
    reg.addEventListener('updatefound', () => arm(reg.installing));
    if (reg.waiting && navigator.serviceWorker && navigator.serviceWorker.controller) showUpdate();
  }

  async function readStorage() {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : null;
    let estimate = null;
    let persisted = null;
    if (storage && storage.estimate) {
      try { estimate = await storage.estimate(); } catch (err) { estimate = null; }
    }
    if (storage && storage.persisted) {
      try { persisted = await storage.persisted(); } catch (err) { persisted = null; }
    }
    return { estimate: formatUsage(estimate), persisted, canPersist: !!(storage && storage.persist) };
  }

  async function mountSettings(host) {
    if (!host) return;
    start();
    const mode = installMode(currentInstallEnv());
    const storage = await readStorage();
    host.replaceChildren();

    if (mode !== 'hidden') {
      const card = document.createElement('section');
      card.className = 'card';
      card.id = 'pwaInstallCard';
      const title = document.createElement('h2');
      title.textContent = '安裝到主畫面';
      card.appendChild(title);
      if (mode === 'ios') {
        const p = document.createElement('p');
        p.className = 'muted small';
        p.textContent = IOS_TEXT;
        card.appendChild(p);
      } else {
        const p = document.createElement('p');
        p.className = 'muted small';
        p.textContent = '裝到主畫面後，可以像 App 一樣打開。不會另外跳窗。';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary';
        btn.id = 'pwaInstallBtn';
        btn.textContent = INSTALL_BUTTON;
        btn.addEventListener('click', async () => {
          if (!deferred) return;
          deferred.prompt();
          try { await deferred.userChoice; } catch (err) { /* 使用者關掉 */ }
          deferred = null;
          await mountSettings(host);
        });
        card.appendChild(p);
        card.appendChild(btn);
      }
      host.appendChild(card);
    }

    const store = document.createElement('section');
    store.className = 'card';
    store.id = 'pwaStorageCard';
    const h = document.createElement('h2');
    h.textContent = '資料保存狀態';
    const usage = document.createElement('p');
    usage.id = 'pwaUsage';
    usage.textContent = storage.estimate ? storage.estimate.text : '這台瀏覽器沒有提供已用空間。';
    const state = document.createElement('p');
    state.id = 'pwaPersistState';
    state.textContent = persistLabel(storage.persisted);
    store.appendChild(h);
    store.appendChild(usage);
    store.appendChild(state);
    if (storage.canPersist) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.id = 'pwaPersistBtn';
      btn.textContent = PERSIST_BUTTON;
      btn.disabled = storage.persisted === true;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        let ok = false;
        try { ok = await navigator.storage.persist(); } catch (err) { ok = false; }
        state.textContent = persistLabel(ok);
        btn.disabled = ok === true;
        if (!ok) btn.disabled = false;
      });
      store.appendChild(btn);
    }
    host.appendChild(store);
  }

  return {
    OFFLINE_TEXT, UPDATE_TEXT, INSTALL_BUTTON, IOS_TEXT, PERSIST_BUTTON,
    installMode, isIosSafari, isStandalone, formatUsage, persistLabel,
    start, watch, mountSettings, readStorage, showUpdate, setOffline
  };
});
