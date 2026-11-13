/* 筆記。不開資料庫、不改既有 store。讀寫走 StudyDB 的 notes。
   正文保留換行。畫面上若有 KaTeX，就顯示 $...$ 公式；編輯框仍是純文字。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Notes = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SUBJECTS = [
    { id: 'zh', name: '國文' },
    { id: 'en', name: '英文' },
    { id: 'ee', name: '電工原理' },
    { id: 'em', name: '電工機械' },
    { id: 'math', name: '數學基礎' },
    { id: 'none', name: '不指定' }
  ];
  const SUBJECT_IDS = new Set(SUBJECTS.map((s) => s.id));
  const QUICK_TAGS = ['公式整理', '重點整理'];
  const EMPTY_CTA = '新增第一篇筆記';
  const MAX_IMAGES = 20;

  let editorUnlisten = null;
  let draftTimer = null;

  function finite(n) {
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
  }

  function newId(prefix) {
    let rnd = '';
    try {
      if (globalThis.crypto && crypto.getRandomValues) {
        const buf = new Uint8Array(6);
        crypto.getRandomValues(buf);
        rnd = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* 改用 Math.random */ }
    if (!rnd) rnd = Math.random().toString(16).slice(2, 14);
    return (prefix + '-' + Date.now().toString(36) + rnd).slice(0, 40);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function subjectName(id) {
    const row = SUBJECTS.find((s) => s.id === id);
    return row ? row.name : '不指定';
  }

  function catalog() {
    return (typeof window !== 'undefined' && window.__PATH_CHAPTERS__) || { chapters: [] };
  }

  function chaptersForSubject(subject, source) {
    const list = ((source || catalog()).chapters) || [];
    return list
      .filter((c) => c && c.subject === subject && c.id && c.name && c.role !== 'link')
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id)));
  }

  function chapterName(id, source) {
    if (!id) return '';
    const list = ((source || catalog()).chapters) || [];
    const row = list.find((c) => c && c.id === id);
    return row ? row.name : '';
  }

  function normalizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    const out = [];
    tags.forEach((t) => {
      const s = String(t || '').trim().slice(0, 24);
      if (s && !out.includes(s)) out.push(s);
    });
    return out.slice(0, 20);
  }

  function normalizeImage(img) {
    if (!img || typeof img !== 'object' || Array.isArray(img)) return null;
    const id = String(img.id || '').trim().slice(0, 80);
    if (!id) return null;
    const createdAt = finite(img.createdAt);
    const blob = (typeof Blob !== 'undefined' && img.blob instanceof Blob) ? img.blob : null;
    const dataUrl = typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:') ? img.dataUrl : '';
    if (!blob && !dataUrl) return null;
    const out = { id, createdAt };
    if (blob) out.blob = blob;
    if (dataUrl) out.dataUrl = dataUrl;
    return out;
  }

  function normalizeNote(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = String(raw.id || '').trim().slice(0, 80);
    if (!id) return null;
    const subject = SUBJECT_IDS.has(raw.subject) ? raw.subject : 'none';
    let chapterId = raw.chapterId ? String(raw.chapterId).slice(0, 40) : '';
    if (subject === 'none') chapterId = '';
    const images = [];
    (Array.isArray(raw.images) ? raw.images : []).forEach((img) => {
      const n = normalizeImage(img);
      if (n && images.length < MAX_IMAGES) images.push(n);
    });
    return {
      id,
      title: String(raw.title || '').slice(0, 120),
      body: String(raw.body == null ? '' : raw.body).slice(0, 200000),
      subject,
      chapterId: chapterId || null,
      tags: normalizeTags(raw.tags),
      images,
      createdAt: finite(raw.createdAt),
      updatedAt: finite(raw.updatedAt)
    };
  }

  function isBlankNote(note) {
    const n = note && note.id ? note : normalizeNote(note);
    if (!n) return true;
    if (String(n.title || '').trim()) return false;
    if (String(n.body || '').trim()) return false;
    if ((n.tags || []).length) return false;
    if ((n.images || []).length) return false;
    if (n.chapterId) return false;
    if (n.subject && n.subject !== 'none') return false;
    return true;
  }

  function mergeNotes(local, incoming) {
    const map = new Map();
    const take = (raw) => {
      const n = normalizeNote(raw);
      if (!n) return;
      const old = map.get(n.id);
      if (!old || (n.updatedAt || 0) > (old.updatedAt || 0)) map.set(n.id, n);
    };
    (local || []).forEach(take);
    (incoming || []).forEach(take);
    return [...map.values()];
  }

  /** 舊備份沒有 notes 陣列時，原樣留著本機筆記。 */
  function notesFromBackup(local, data) {
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'notes') || !Array.isArray(data.notes)) {
      return (local || []).map(normalizeNote).filter(Boolean);
    }
    return mergeNotes(local, data.notes);
  }

  function hydrateImages(note, toBlob) {
    const n = normalizeNote(note);
    if (!n) return null;
    const images = [];
    (Array.isArray(note.images) ? note.images : []).forEach((img) => {
      const norm = normalizeImage(img);
      if (!norm || images.length >= MAX_IMAGES) return;
      if (norm.blob) {
        images.push({ id: norm.id, createdAt: norm.createdAt, blob: norm.blob });
        return;
      }
      const blob = norm.dataUrl && toBlob ? toBlob(norm.dataUrl) : null;
      if (blob) images.push({ id: norm.id, createdAt: norm.createdAt, blob });
    });
    n.images = images;
    return n;
  }

  async function notesForExport(list, toDataUrl) {
    const out = [];
    for (const raw of list || []) {
      const n = normalizeNote(raw);
      if (!n) continue;
      const images = [];
      for (const img of n.images) {
        let dataUrl = img.dataUrl || '';
        if (!dataUrl && img.blob && toDataUrl) dataUrl = await toDataUrl(img.blob);
        if (!dataUrl) continue;
        images.push({ id: img.id, dataUrl, createdAt: img.createdAt });
      }
      out.push({
        id: n.id, title: n.title, body: n.body, subject: n.subject, chapterId: n.chapterId,
        tags: n.tags, images, createdAt: n.createdAt, updatedAt: n.updatedAt
      });
    }
    return out;
  }

  function filterNotes(list, opts) {
    const o = opts || {};
    const q = String(o.q || '').trim().toLowerCase();
    const subject = o.subject ? String(o.subject) : '';
    const tag = String(o.tag || '').trim();
    const chapterId = o.chapterId ? String(o.chapterId) : '';
    const rows = (list || []).map(normalizeNote).filter(Boolean).filter((n) => {
      if (subject && n.subject !== subject) return false;
      if (chapterId && n.chapterId !== chapterId) return false;
      if (tag && !(n.tags || []).includes(tag)) return false;
      if (q) {
        const hay = (n.title + '\n' + n.body + '\n' + (n.tags || []).join('\n')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    rows.sort((a, b) => (b.updatedAt - a.updatedAt) || (b.createdAt - a.createdAt) || a.id.localeCompare(b.id));
    return rows;
  }

  function countByChapter(list) {
    const map = {};
    (list || []).forEach((raw) => {
      const n = normalizeNote(raw);
      if (!n || !n.chapterId) return;
      map[n.chapterId] = (map[n.chapterId] || 0) + 1;
    });
    return map;
  }

  function previewText(body) {
    const lines = String(body || '').split(/\n/).map((s) => s.trim()).filter(Boolean);
    return lines.slice(0, 2).join('\n').slice(0, 80);
  }

  function formatTaipei(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n + 8 * 60 * 60 * 1000);
    const p = (x) => String(x).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }

  function typeset(el) {
    if (!el || typeof renderMathInElement !== 'function') return;
    try {
      renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false,
        strict: 'ignore',
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option']
      });
    } catch (e) { /* 沒有 KaTeX 就維持純文字 */ }
  }

  function fillText(el, text) {
    if (!el) return;
    el.replaceChildren();
    const lines = String(text || '').split('\n');
    lines.forEach((line, i) => {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(line));
    });
    typeset(el);
  }

  function stashKey(id) { return 'cpc-note-draft-' + id; }

  function stashNote(note) {
    try {
      sessionStorage.setItem(stashKey(note.id), JSON.stringify({
        id: note.id, title: note.title, body: note.body, subject: note.subject,
        chapterId: note.chapterId, tags: note.tags, updatedAt: note.updatedAt
      }));
    } catch (e) { /* 私密模式可能寫不進 sessionStorage */ }
  }

  function readStash(id) {
    try {
      const raw = sessionStorage.getItem(stashKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearStash(id) {
    try { sessionStorage.removeItem(stashKey(id)); } catch (e) {}
  }

  function clearHooks() {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = null;
    if (editorUnlisten) editorUnlisten();
    editorUnlisten = null;
  }

  function db() {
    return (typeof globalThis !== 'undefined' && globalThis.StudyDB) || null;
  }

  function forStore(note) {
    const n = normalizeNote(note);
    if (!n) return null;
    n.images = (n.images || []).filter((img) => img.blob).map((img) => ({ id: img.id, createdAt: img.createdAt, blob: img.blob }));
    return n;
  }

  async function mount(app, parts) {
    clearHooks();
    parts = parts || [];
    if (!app) return;
    if (parts[0] === 'new') {
      location.replace('#mine/notes/edit/' + encodeURIComponent(newId('note')));
      return;
    }
    if (parts[0] === 'edit' && parts[1]) return mountEditor(app, parts[1]);
    return mountList(app, parts);
  }

  async function mountList(app, parts) {
    const store = db();
    const all = store ? (await store.allNotes()) : [];
    const chapterId = parts[0] === 'ch' && parts[1] ? parts[1] : '';
    const tags = [];
    (all || []).forEach((raw) => {
      const n = normalizeNote(raw);
      if (!n) return;
      n.tags.forEach((t) => { if (!tags.includes(t)) tags.push(t); });
    });
    QUICK_TAGS.forEach((t) => { if (!tags.includes(t)) tags.push(t); });
    const chName = chapterId ? (chapterName(chapterId) || chapterId) : '';
    app.innerHTML = `
      <div class="note-tools">
        <label class="field"><span class="field-title">搜尋</span>
          <input type="search" id="noteQ" placeholder="標題、內容或標籤" enterkeyhint="search" autocomplete="off">
        </label>
        <div class="note-filters">
          <label class="field"><span class="field-title">科目</span>
            <select id="noteFilterSubject">
              <option value="">全部科目</option>
              ${SUBJECTS.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span class="field-title">標籤</span>
            <select id="noteFilterTag">
              <option value="">全部標籤</option>
              ${tags.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
      ${chapterId ? `<p class="note-filter-banner">只看「${esc(chName)}」的筆記。<a href="#mine/notes">看全部筆記</a></p>` : ''}
      <div id="noteList"></div>
      <a class="btn btn-primary" id="noteCreate" href="#mine/notes/new">新增筆記</a>`;
    const paint = () => {
      const rows = filterNotes(all, {
        q: document.getElementById('noteQ').value,
        subject: document.getElementById('noteFilterSubject').value,
        tag: document.getElementById('noteFilterTag').value,
        chapterId
      });
      const box = document.getElementById('noteList');
      if (!all.length) {
        box.innerHTML = `<div class="empty"><div class="empty-ico">✎</div><h2>還沒有筆記</h2><p class="muted">公式、重點可以記在這裡，重新整理也還在。</p><a class="btn btn-primary" href="#mine/notes/new">${EMPTY_CTA}</a></div>`;
        document.getElementById('noteCreate').hidden = true;
        return;
      }
      document.getElementById('noteCreate').hidden = false;
      if (!rows.length) {
        box.innerHTML = '<div class="empty"><h2>沒有符合的筆記</h2><p class="muted">換個科目、標籤，或清掉搜尋再看。</p></div>';
        return;
      }
      box.innerHTML = rows.map((n) => {
        const title = n.title.trim() || '未命名筆記';
        const preview = previewText(n.body);
        const when = formatTaipei(n.updatedAt);
        const tagHtml = (n.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
        return `<a class="item note-item" href="#mine/notes/edit/${esc(encodeURIComponent(n.id))}">
          <div class="item-body">
            <div class="item-title">${esc(title)}</div>
            ${preview ? `<div class="item-sub note-preview-inline"></div>` : '<div class="item-sub muted">沒有內文</div>'}
            <div class="item-tags"><span class="tag">${esc(subjectName(n.subject))}</span>${tagHtml}${when ? `<span class="tag">${esc(when)}</span>` : ''}</div>
          </div><span class="chev">›</span></a>`;
      }).join('');
      const nodes = box.querySelectorAll('.note-item');
      rows.forEach((n, i) => {
        const slot = nodes[i] && nodes[i].querySelector('.note-preview-inline');
        if (slot) fillText(slot, previewText(n.body));
      });
    };
    document.getElementById('noteQ').addEventListener('input', paint);
    document.getElementById('noteFilterSubject').addEventListener('change', paint);
    document.getElementById('noteFilterTag').addEventListener('change', paint);
    paint();
  }

  async function mountEditor(app, id) {
    const store = db();
    let loaded = null;
    try { loaded = store ? await store.getNote(id) : null; } catch (e) { loaded = null; }
    let note = normalizeNote(loaded) || normalizeNote({
      id, title: '', body: '', subject: 'none', chapterId: null, tags: [], images: [],
      createdAt: Date.now(), updatedAt: 0
    });
    const stash = readStash(id);
    if (stash && (stash.updatedAt || 0) > (note.updatedAt || 0)) {
      note = normalizeNote(Object.assign({}, note, {
        title: stash.title, body: stash.body, subject: stash.subject,
        chapterId: stash.chapterId, tags: stash.tags, images: note.images, updatedAt: stash.updatedAt
      })) || note;
    }
    let existed = !!loaded;
    const chaptersNow = () => chaptersForSubject(note.subject);

    app.innerHTML = `
      <form id="noteForm" class="note-editor" autocomplete="off">
        <section class="card">
          <label class="field"><span class="field-title">標題</span>
            <input type="text" id="noteTitle" maxlength="120" placeholder="例如：串聯分壓" value="${esc(note.title)}">
          </label>
          <label class="field"><span class="field-title">科目</span>
            <select id="noteSubject">${SUBJECTS.map((s) => `<option value="${esc(s.id)}"${s.id === note.subject ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
          </label>
          <label class="field"><span class="field-title">章節 <small>可空</small></span>
            <select id="noteChapter"></select>
          </label>
          <span class="field-title">標籤</span>
          <div class="tag-row" id="noteQuick"></div>
          <div class="tag-row" id="noteTags"></div>
          <div class="inline note-tag-add">
            <input type="text" id="noteTagInput" maxlength="24" placeholder="自訂標籤" aria-label="自訂標籤">
            <button type="button" class="btn btn-soft" id="noteTagAdd">加入標籤</button>
          </div>
        </section>
        <section class="card">
          <label class="field"><span class="field-title">內容 <small>純文字，換行會保留。$公式$ 可顯示</small></span>
            <textarea id="noteBody" rows="10" placeholder="寫下重點。一行一個也行。">${esc(note.body)}</textarea>
          </label>
          <p class="hint" id="noteSaveHint">輸入時會自動儲存草稿，離開這頁也不會丟。</p>
          <div class="note-preview" id="notePreview" aria-label="內容預覽"></div>
        </section>
        <section class="card">
          <span class="field-title">照片 <small>可多張，會壓縮後存在這台裝置</small></span>
          <div class="note-images" id="noteImages"></div>
          <label class="btn btn-soft">加入照片<input class="file-hidden" id="notePhoto" type="file" accept="image/*" multiple></label>
        </section>
        <button type="submit" class="btn btn-primary" id="noteSave">儲存</button>
        <a class="btn btn-soft" href="#mine/notes">回筆記列表</a>
        <button type="button" class="btn btn-text-bad" id="noteDelete"${existed ? '' : ' hidden'}>刪除這篇筆記</button>
      </form>`;

    const chapterSelect = document.getElementById('noteChapter');
    const fillChapters = () => {
      const list = note.subject === 'none' ? [] : chaptersNow();
      const ids = new Set(list.map((c) => c.id));
      let extra = '';
      if (note.chapterId && !ids.has(note.chapterId) && note.subject !== 'none') {
        extra = `<option value="${esc(note.chapterId)}">${esc(chapterName(note.chapterId) || note.chapterId)}</option>`;
      }
      chapterSelect.innerHTML = `<option value="">不指定章節</option>${extra}${list.map((c) => `<option value="${esc(c.id)}"${c.id === note.chapterId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}`;
      chapterSelect.disabled = note.subject === 'none';
      if (note.subject === 'none') chapterSelect.value = '';
    };
    const renderQuick = () => {
      document.getElementById('noteQuick').innerHTML = QUICK_TAGS.map((t) =>
        `<button type="button" class="chip note-quick${note.tags.includes(t) ? ' on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`
      ).join('');
      document.querySelectorAll('.note-quick').forEach((b) => {
        b.onclick = () => {
          const t = b.getAttribute('data-tag');
          if (note.tags.includes(t)) note.tags = note.tags.filter((x) => x !== t);
          else note.tags = note.tags.concat(t);
          renderQuick();
          renderTags();
          touch();
        };
      });
    };
    const renderTags = () => {
      const box = document.getElementById('noteTags');
      const custom = note.tags.filter((t) => !QUICK_TAGS.includes(t));
      box.innerHTML = custom.length
        ? custom.map((t) => `<button type="button" class="chip note-tag" data-tag="${esc(t)}">${esc(t)} ✕</button>`).join('')
        : '';
      box.querySelectorAll('.note-tag').forEach((b) => {
        b.onclick = () => {
          note.tags = note.tags.filter((t) => t !== b.getAttribute('data-tag'));
          renderTags();
          touch();
        };
      });
    };
    const renderImages = () => {
      const box = document.getElementById('noteImages');
      if (!note.images.length) {
        box.innerHTML = '<p class="muted small">還沒有照片。</p>';
        return;
      }
      box.innerHTML = note.images.map((img) => {
        const src = img.blob && typeof blobUrl === 'function' ? blobUrl(img.blob) : (img.dataUrl || '');
        return `<figure class="note-photo"><img class="zoomable" src="${esc(src)}" alt="筆記照片"><button type="button" class="btn btn-text-bad note-photo-del" data-id="${esc(img.id)}">刪除照片</button></figure>`;
      }).join('');
      box.querySelectorAll('.note-photo-del').forEach((b) => {
        b.onclick = () => {
          note.images = note.images.filter((img) => img.id !== b.getAttribute('data-id'));
          renderImages();
          touch();
        };
      });
    };
    const readFields = () => {
      const title = document.getElementById('noteTitle');
      if (!title) return false;
      note.title = title.value;
      note.body = document.getElementById('noteBody').value;
      note.subject = document.getElementById('noteSubject').value || 'none';
      if (!SUBJECT_IDS.has(note.subject)) note.subject = 'none';
      const ch = document.getElementById('noteChapter').value;
      note.chapterId = note.subject === 'none' ? null : (ch || null);
      note = normalizeNote(note) || note;
      return true;
    };
    const paintPreview = () => fillText(document.getElementById('notePreview'), document.getElementById('noteBody').value);
    async function persist() {
      if (!readFields()) return;
      stashNote(note);
      const storeNow = db();
      if (!storeNow) return;
      if (isBlankNote(note)) {
        if (existed) {
          await storeNow.deleteNote(note.id);
          existed = false;
          clearStash(note.id);
        }
        return;
      }
      note.updatedAt = note.updatedAt || Date.now();
      await storeNow.putNote(forStore(note));
      existed = true;
      const del = document.getElementById('noteDelete');
      if (del) del.hidden = false;
    }
    function touch() {
      if (!readFields()) return;
      note.updatedAt = Date.now();
      stashNote(note);
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(() => { persist().catch((e) => console.error(e)); }, 250);
    }
    function armHooks() {
      const onLeave = () => {
        if (!readFields()) return;
        note.updatedAt = Date.now();
        stashNote(note);
        persist().catch((e) => console.error(e));
      };
      const onHash = () => {
        onLeave();
        clearHooks();
      };
      const onHide = () => { if (document.visibilityState === 'hidden') onLeave(); };
      window.addEventListener('hashchange', onHash, true);
      window.addEventListener('pagehide', onLeave);
      document.addEventListener('visibilitychange', onHide);
      editorUnlisten = () => {
        window.removeEventListener('hashchange', onHash, true);
        window.removeEventListener('pagehide', onLeave);
        document.removeEventListener('visibilitychange', onHide);
      };
    }

    fillChapters();
    renderQuick();
    renderTags();
    renderImages();
    paintPreview();
    armHooks();

    document.getElementById('noteSubject').addEventListener('change', () => {
      readFields();
      const allowed = new Set(chaptersNow().map((c) => c.id));
      if (note.chapterId && !allowed.has(note.chapterId)) note.chapterId = null;
      fillChapters();
      touch();
    });
    document.getElementById('noteChapter').addEventListener('change', touch);
    document.getElementById('noteTitle').addEventListener('input', touch);
    document.getElementById('noteBody').addEventListener('input', () => { paintPreview(); touch(); });
    document.getElementById('noteTagAdd').onclick = () => {
      const input = document.getElementById('noteTagInput');
      const t = input.value.trim();
      if (!t) return;
      if (!note.tags.includes(t)) note.tags = note.tags.concat(t);
      input.value = '';
      renderQuick();
      renderTags();
      touch();
    };
    document.getElementById('noteTagInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('noteTagAdd').click(); }
    });
    document.getElementById('notePhoto').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      if (typeof compressImage !== 'function') {
        if (typeof toast === 'function') toast('這台裝置沒辦法壓縮照片');
        return;
      }
      try {
        if (typeof toast === 'function') toast('照片處理中…');
        for (const file of files) {
          if (note.images.length >= MAX_IMAGES) {
            if (typeof toast === 'function') toast('一篇筆記最多 ' + MAX_IMAGES + ' 張照片');
            break;
          }
          const blob = await compressImage(file);
          note.images.push({ id: newId('img'), createdAt: Date.now(), blob });
        }
        renderImages();
        touch();
        await persist();
        if (typeof toast === 'function') toast('照片已加入');
      } catch (err) {
        console.warn(err);
        if (typeof toast === 'function') toast('這張照片讀不到，請換一張');
      }
    });
    document.getElementById('noteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (draftTimer) clearTimeout(draftTimer);
      readFields();
      note.updatedAt = Date.now();
      await persist();
      if (typeof toast === 'function') toast(isBlankNote(note) ? '還沒有內容可存' : '已儲存');
    });
    const delBtn = document.getElementById('noteDelete');
    if (delBtn) delBtn.onclick = async () => {
      if (typeof confirmBox !== 'function') return;
      const ok = await confirmBox('刪除這篇筆記？', '<p>刪掉之後，這篇的文字和照片會從這台裝置移除。</p>', '刪除', true);
      if (!ok) return;
      clearHooks();
      clearStash(note.id);
      if (db()) await db().deleteNote(note.id);
      if (typeof toast === 'function') toast('已刪除筆記');
      location.hash = '#mine/notes';
    };
  }

  async function decoratePath(root) {
    const store = db();
    if (!root || !store || !store.allNotes) return;
    let all = [];
    try { all = await store.allNotes(); } catch (e) { return; }
    const counts = countByChapter(all);
    root.querySelectorAll('a.path-ch-hit').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/#path\/go\/([^?#]+)/);
      if (!m) return;
      let id = m[1];
      try { id = decodeURIComponent(id); } catch (e) { /* 保留原字 */ }
      const n = counts[id] || 0;
      if (!n) return;
      const article = a.closest('article');
      if (!article || article.querySelector('.path-note-link')) return;
      const link = document.createElement('a');
      link.className = 'btn btn-soft btn-sm path-note-link';
      link.href = '#mine/notes/ch/' + encodeURIComponent(id);
      link.textContent = '筆記 ' + n + ' 篇';
      article.appendChild(link);
    });
  }

  return {
    SUBJECTS, QUICK_TAGS, EMPTY_CTA, MAX_IMAGES,
    newId, subjectName, chaptersForSubject, chapterName,
    normalizeNote, normalizeImage, isBlankNote, mergeNotes, notesFromBackup, hydrateImages, notesForExport,
    filterNotes, countByChapter, previewText, formatTaipei,
    mount, decoratePath
  };
});
