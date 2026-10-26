/* Google 雲端硬碟備份（純前端）。
   - 只用 drive.file scope
   - access token 只放記憶體，不存 refresh token
   - 可被測試 stub：window.__DriveBackupHooks */
(function (global) {
  'use strict';

  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FOLDER_NAME = '中油錯題本備份';
  const GIS_SRC = 'https://accounts.google.com/gsi/client';
  const GAPI_SRC = 'https://apis.google.com/js/api.js';
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

  const DEFAULT_DRIVE = () => ({
    clientIdOverride: '',
    connected: false,
    accountHint: '',
    folderId: '',
    folderName: '',
    folderUrl: '',
    scheduleEnabled: false,
    scheduleKind: 'weekly', // daily | weekly | monthly30
    scheduleTime: '21:00',
    scheduleWeekday: 0, // 0=日 … 6=六（每週用）
    lastCloudBackupAt: null, // ISO
    lastCloudBackupDate: null, // YYYY-MM-DD
    lastCloudFileId: '',
    lastCloudFileName: ''
  });

  let accessToken = null;
  let tokenExpiresAt = 0;
  let tokenClient = null;
  let gisReady = null;
  let gapiReady = null;
  let autoBusy = false;

  const hooks = () => global.__DriveBackupHooks || {};

  function online() {
    if (typeof hooks().online === 'function') return !!hooks().online();
    return navigator.onLine !== false;
  }

  function getClientId(settings) {
    const ov = (settings && settings.driveBackup && settings.driveBackup.clientIdOverride) || '';
    if (ov && ov.trim()) return ov.trim();
    const cfg = global.MISTAKE_BACKUP_CONFIG || {};
    return (cfg.googleClientId || '').trim();
  }

  function hasClientId(settings) { return !!getClientId(settings); }

  function isConnected(settings) {
    return !!(settings && settings.driveBackup && settings.driveBackup.connected && settings.driveBackup.folderId);
  }

  function cloudFileName(dateStr) {
    return `錯題本備份-${dateStr}.json`;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some((s) => s.src === src)) { resolve(); return; }
      const el = document.createElement('script');
      el.src = src; el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('載入 Google 登入元件失敗，請確認有網路'));
      document.head.appendChild(el);
    });
  }

  async function ensureGis() {
    if (hooks().mockAuth) return;
    if (gisReady) return gisReady;
    gisReady = loadScript(GIS_SRC).then(() => {
      if (!global.google || !google.accounts || !google.accounts.oauth2) throw new Error('Google Identity Services 無法使用');
    });
    return gisReady;
  }

  async function ensureGapiPicker() {
    if (hooks().mockPicker) return;
    if (gapiReady) return gapiReady;
    gapiReady = loadScript(GAPI_SRC).then(() => new Promise((resolve, reject) => {
      if (!global.gapi) return reject(new Error('Google API 無法使用'));
      gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Google Picker 載入失敗')) });
    }));
    return gapiReady;
  }

  function clearToken() { accessToken = null; tokenExpiresAt = 0; }

  async function requestToken(settings, { interactive = true } = {}) {
    if (hooks().mockAuth) {
      const t = await hooks().mockAuth({ interactive });
      if (!t || !t.access_token) throw new Error('模擬登入失敗');
      accessToken = t.access_token;
      tokenExpiresAt = Date.now() + (t.expires_in || 3600) * 1000;
      return accessToken;
    }
    const clientId = getClientId(settings);
    if (!clientId) throw new Error('尚未設定 Google Client ID');
    await ensureGis();
    if (accessToken && Date.now() < tokenExpiresAt - 60000) return accessToken;

    return new Promise((resolve, reject) => {
      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error) { clearToken(); reject(new Error(resp.error_description || resp.error)); return; }
            accessToken = resp.access_token;
            tokenExpiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
            resolve(accessToken);
          },
          error_callback: (err) => { clearToken(); reject(new Error((err && err.message) || '登入取消或失敗')); }
        });
        tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      } catch (err) { reject(err); }
    });
  }

  async function driveFetch(path, { method = 'GET', headers = {}, body, raw = false, upload = false } = {}) {
    if (hooks().mockFetch) return hooks().mockFetch(path, { method, headers, body, raw, upload });
    if (!accessToken) throw new Error('尚未登入 Google');
    const base = upload ? UPLOAD_API : DRIVE_API;
    const url = path.startsWith('http') ? path : base + path;
    const h = Object.assign({ Authorization: 'Bearer ' + accessToken }, headers);
    const res = await fetch(url, { method, headers: h, body });
    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch {}
      const err = new Error('Drive API ' + res.status + (detail ? ': ' + detail.slice(0, 200) : ''));
      err.status = res.status;
      throw err;
    }
    if (raw) return res;
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  async function findFolderByName(name) {
    const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const data = await driveFetch(`/files?q=${q}&spaces=drive&fields=files(id,name,webViewLink)`);
    return (data.files && data.files[0]) || null;
  }

  async function createFolder(name) {
    return driveFetch('/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' })
    });
  }

  async function ensureBackupFolder(settings) {
    const db = settings.driveBackup;
    if (db.folderId) {
      try {
        const f = await driveFetch(`/files/${encodeURIComponent(db.folderId)}?fields=id,name,webViewLink,trashed`);
        if (f && !f.trashed) {
          db.folderId = f.id; db.folderName = f.name; db.folderUrl = f.webViewLink || folderOpenUrl(f.id);
          return f;
        }
      } catch (err) {
        if (err.status !== 404) throw err;
      }
    }
    let f = await findFolderByName(FOLDER_NAME);
    if (!f) f = await createFolder(FOLDER_NAME);
    db.folderId = f.id; db.folderName = f.name; db.folderUrl = f.webViewLink || folderOpenUrl(f.id);
    return f;
  }

  function folderOpenUrl(id) {
    return id ? `https://drive.google.com/drive/folders/${id}` : '';
  }

  async function pickFolder(settings) {
    if (hooks().mockPicker) {
      const picked = await hooks().mockPicker();
      if (!picked) return null;
      settings.driveBackup.folderId = picked.id;
      settings.driveBackup.folderName = picked.name || FOLDER_NAME;
      settings.driveBackup.folderUrl = picked.url || folderOpenUrl(picked.id);
      return picked;
    }
    const clientId = getClientId(settings);
    await requestToken(settings, { interactive: true });
    await ensureGapiPicker();
    return new Promise((resolve) => {
      const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setMimeTypes('application/vnd.google-apps.folder');
      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey('') // drive.file + OAuth 可不需 API key；若環境要求可之後再填
        .setAppId(clientId.split('-')[0])
        .setTitle('選擇備份資料夾')
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED && data.docs && data.docs[0]) {
            const d = data.docs[0];
            settings.driveBackup.folderId = d.id;
            settings.driveBackup.folderName = d.name;
            settings.driveBackup.folderUrl = d.url || folderOpenUrl(d.id);
            resolve({ id: d.id, name: d.name, url: settings.driveBackup.folderUrl });
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    });
  }

  async function resumableUpload(blob, meta) {
    if (hooks().mockUpload) return hooks().mockUpload(blob, meta);

    const start = await fetch(UPLOAD_API + '/files?uploadType=resumable&fields=id,name,webViewLink,size,modifiedTime', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/json',
        'X-Upload-Content-Length': String(blob.size)
      },
      body: JSON.stringify(meta)
    });
    if (!start.ok) {
      const t = await start.text().catch(() => '');
      throw new Error('無法開始上傳（' + start.status + '）' + (t ? ': ' + t.slice(0, 160) : ''));
    }
    const location = start.headers.get('Location');
    if (!location) throw new Error('上傳回應沒有 Location');

    // 單次 PUT（檔案通常 < 100MB）；若要切塊可再擴充
    const put = await fetch(location, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(blob.size)
      },
      body: blob
    });
    if (!put.ok) {
      const t = await put.text().catch(() => '');
      throw new Error('上傳失敗（' + put.status + '）' + (t ? ': ' + t.slice(0, 160) : ''));
    }
    return put.json();
  }

  async function listBackupFiles(settings) {
    const folderId = settings.driveBackup.folderId;
    if (!folderId) return [];
    await requestToken(settings, { interactive: true });
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and (name contains '錯題本備份' or name contains 'mistake')`);
    const data = await driveFetch(`/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&pageSize=50&fields=files(id,name,size,modifiedTime,webViewLink)`);
    return (data.files || []).filter((f) => /\.json$/i.test(f.name));
  }

  async function downloadFile(fileId) {
    if (hooks().mockDownload) return hooks().mockDownload(fileId);
    await driveFetch; // keep token
    const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!res.ok) throw new Error('下載失敗（' + res.status + '）');
    const text = await res.text();
    return new File([text], 'drive-backup.json', { type: 'application/json' });
  }

  /** 排程是否到期（純函式，方便測試） */
  function isScheduleDue(cfg, now = new Date()) {
    if (!cfg || !cfg.scheduleEnabled) return false;
    const [H, M] = String(cfg.scheduleTime || '21:00').split(':').map((x) => parseInt(x, 10));
    const hh = Number.isFinite(H) ? H : 21, mm = Number.isFinite(M) ? M : 0;
    const last = cfg.lastCloudBackupAt ? new Date(cfg.lastCloudBackupAt) : null;

    const atTime = (d) => { const x = new Date(d); x.setHours(hh, mm, 0, 0); return x; };

    if (!last) {
      // 從未雲端備份：到了今天的設定時間就算到期
      return now.getTime() >= atTime(now).getTime();
    }

    let earliest;
    if (cfg.scheduleKind === 'daily') {
      earliest = atTime(last);
      earliest.setDate(earliest.getDate() + 1);
    } else if (cfg.scheduleKind === 'monthly30') {
      earliest = atTime(last);
      earliest.setDate(earliest.getDate() + 30);
    } else {
      // weekly：從上次起算至少 7 天，且落在指定星期幾的設定時間之後
      const wd = Number.isFinite(+cfg.scheduleWeekday) ? +cfg.scheduleWeekday : 0;
      earliest = atTime(last);
      earliest.setDate(earliest.getDate() + 1);
      while (earliest.getDay() !== wd || earliest.getTime() < last.getTime() + 6.5 * 86400000) {
        earliest.setDate(earliest.getDate() + 1);
        earliest = atTime(earliest);
        // 安全上限
        if (earliest.getTime() - last.getTime() > 20 * 86400000) break;
      }
      // 簡化：上次 + 7 天的設定時間
      earliest = atTime(last);
      earliest.setDate(earliest.getDate() + 7);
    }
    return now.getTime() >= earliest.getTime();
  }

  function nextDueLabel(cfg, now = new Date()) {
    if (!cfg || !cfg.scheduleEnabled) return '未開啟排程';
    if (isScheduleDue(cfg, now)) return '已到期，打開 App 時會自動上傳';
    const kind = cfg.scheduleKind === 'daily' ? '每天' : cfg.scheduleKind === 'monthly30' ? '每 30 天' : '每週';
    return `${kind} ${cfg.scheduleTime || '21:00'}（僅在 App 打開時檢查）`;
  }

  const api = {
    SCOPE, FOLDER_NAME, DEFAULT_DRIVE, getClientId, hasClientId, isConnected, online,
    cloudFileName, isScheduleDue, nextDueLabel, folderOpenUrl, clearToken,
    requestToken, ensureBackupFolder, pickFolder, resumableUpload, listBackupFiles, downloadFile,
    getAccessToken: () => accessToken,
    /** 給 app.js：連接帳號並確保資料夾 */
    async connect(settings) {
      await requestToken(settings, { interactive: true });
      await ensureBackupFolder(settings);
      settings.driveBackup.connected = true;
      settings.driveBackup.accountHint = settings.driveBackup.accountHint || '已連接 Google';
      return settings.driveBackup;
    },
    disconnect(settings) {
      const tok = accessToken;
      clearToken();
      if (tok && global.google && google.accounts && google.accounts.oauth2) {
        try { google.accounts.oauth2.revoke(tok, () => {}); } catch {}
      }
      settings.driveBackup.connected = false;
      settings.driveBackup.accountHint = '';
      // 保留 folderId / 排程，方便重連
    }
  };

  global.DriveBackup = api;
})(typeof window !== 'undefined' ? window : globalThis);
