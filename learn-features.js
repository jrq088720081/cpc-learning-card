/* 學習區功能：專業科目／國英刷題／數學／模擬考／練習統計。依賴 app.js 全域工具。 */
'use strict';

const LearnUI = (() => {
  /* ---------- data loaders ---------- */
  let _bank, _concepts, _zhQuiz, _enQuiz, _math;
  async function loadBank() {
    if (_bank) return _bank;
    if (window.__EXAM_BANK__) _bank = window.__EXAM_BANK__;
    else {
      try { _bank = await (await fetch('./data/exam/bank.json')).json(); }
      catch { _bank = { meta: {}, questions: [] }; }
    }
    return _bank;
  }
  async function loadConcepts() {
    if (_concepts) return _concepts;
    if (window.__EXAM_CONCEPTS__) _concepts = window.__EXAM_CONCEPTS__;
    else {
      try { _concepts = await (await fetch('./data/exam/concepts.json')).json(); }
      catch { _concepts = { curated: [], fromBank: [] }; }
    }
    return _concepts;
  }
  async function loadZhQuiz() {
    if (_zhQuiz) return _zhQuiz;
    if (window.__ZH_QUIZ__) _zhQuiz = window.__ZH_QUIZ__;
    else {
      try { _zhQuiz = await (await fetch('./data/zh/quiz.json')).json(); }
      catch { _zhQuiz = { exam114: [], fromKnowledge: [] }; }
    }
    return _zhQuiz;
  }
  async function loadEnQuiz() {
    if (_enQuiz) return _enQuiz;
    if (window.__EN_QUIZ__) _enQuiz = window.__EN_QUIZ__;
    else {
      try { _enQuiz = await (await fetch('./data/en/quiz.json')).json(); }
      catch { _enQuiz = { exam114: [], recall: [] }; }
    }
    return _enQuiz;
  }
  async function loadMath() {
    if (_math) return _math;
    if (window.__MATH_LESSONS__) _math = window.__MATH_LESSONS__;
    else {
      try { _math = await (await fetch('./data/math/lessons.json')).json(); }
      catch { _math = { units: [] }; }
    }
    return _math;
  }

  /* ---------- practice stats (IndexedDB meta) ---------- */
  async function getStats() {
    return (await DB.meta('practiceStats', null)) || { bySubject: {}, history: [] };
  }
  async function recordPractice({ subject, correct, total, source }) {
    const st = await getStats();
    const s = st.bySubject[subject] || { correct: 0, total: 0, wrong: 0 };
    s.correct += correct;
    s.total += total;
    s.wrong += (total - correct);
    st.bySubject[subject] = s;
    st.history = [{ at: Date.now(), subject, correct, total, source: source || '' }, ...(st.history || [])].slice(0, 100);
    await DB.setMeta('practiceStats', st);
    return st;
  }
  function accuracyOf(st, subject) {
    const s = st.bySubject[subject];
    if (!s || !s.total) return null;
    return Math.round(100 * s.correct / s.total);
  }

  /* ---------- TTS helpers (EN) ---------- */
  let enSlow = false;
  function speakEn(text, rate) {
    if (!window.speechSynthesis || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = 'en-US';
    u.rate = rate != null ? rate : (enSlow ? 0.7 : 1);
    const voices = speechSynthesis.getVoices();
    const v = voices.find((x) => /en-US|en_US|English/.test(x.lang)) || voices.find((x) => /^en/.test(x.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  function enWordSpans(text) {
    return String(text || '').split(/(\s+)/).map((tok) => {
      if (/^\s+$/.test(tok) || !tok) return esc(tok);
      const clean = tok.replace(/^[^\w']+|[^\w']+$/g, '');
      if (!/[A-Za-z]/.test(clean)) return esc(tok);
      return `<button type="button" class="en-word" data-speak="${esc(clean)}">${esc(tok)}</button>`;
    }).join('');
  }
  function wireEnSpeak(root) {
    $$('.en-word', root).forEach((b) => {
      if (b._wired) return; b._wired = true;
      b.addEventListener('click', (e) => { e.preventDefault(); speakEn(b.getAttribute('data-speak') || ''); });
    });
    $$('[data-en-sentence]', root).forEach((b) => {
      if (b._wired) return; b._wired = true;
      b.addEventListener('click', (e) => { e.preventDefault(); speakEn(b.getAttribute('data-en-sentence') || ''); });
    });
  }

  /* ---------- add wrong to notebook ---------- */
  function mapLearnTab(subjectTab) {
    let tab = subjectTab || 'ee';
    if (tab === 'en' || tab === 'english') {
      const t = settings.tabs.find((x) => x.id === 'english' || /英文/.test(x.name));
      return t ? t.id : 'english';
    }
    if (tab === 'zh' || tab === 'chinese') {
      let t = settings.tabs.find((x) => x.id === 'zh' || /國文/.test(x.name));
      if (!t) {
        // ensure 國文 tab exists for language reasons
        t = { id: 'zh', name: '國文', category: 'lang', intervals: null };
        settings.tabs.push(t);
        saveSettings('tabs');
      }
      return t.id;
    }
    if (tab === 'math') {
      let t = settings.tabs.find((x) => x.id === 'math' || /數學/.test(x.name));
      if (!t) {
        t = { id: 'math', name: '數學基礎', category: 'calc', intervals: null };
        settings.tabs.push(t);
        saveSettings('tabs');
      }
      return t.id;
    }
    if (tab === 'ee' || tab === 'em') return tab;
    const hit = settings.tabs.find((x) => x.id === tab);
    return hit ? hit.id : (settings.tabs[0]?.id || 'ee');
  }

  async function findMistakeByLearnId(learnId) {
    if (!learnId) return null;
    const all = await DB.all();
    return all.find((m) => m.learnId === learnId || m.sourceId === learnId) || null;
  }

  async function addWrongToNotebook({
    subjectTab, stem, answer, choices, reasons, source, chapter,
    learnId, picked, explain, figurePath, hasFigure, label, silent
  }) {
    const tabId = mapLearnTab(subjectTab);
    const cat = tabOf(tabId).category || 'calc';
    const choiceLine = (choices || []).find((c) => String(c).startsWith(answer)) || '';
    const wrongLine = picked ? ((choices || []).find((c) => String(c).startsWith(picked)) || picked) : '';
    const aParts = [];
    if (answer) aParts.push(`正解 ${answer}${choiceLine ? '　' + choiceLine : ''}`);
    if (picked && picked !== answer) aParts.push(`你的作答 ${picked}${wrongLine && wrongLine !== picked ? '　' + wrongLine : ''}`);
    if (explain) aParts.push('詳解：\n' + explain);
    const aText = aParts.join('\n\n');
    const src = source || '學習區';
    const existing = await findMistakeByLearnId(learnId);
    if (existing) {
      existing.reasons = [...new Set([...(existing.reasons || []), ...(reasons || [])])];
      existing.updatedAt = Date.now();
      if (explain && !(existing.aText || '').includes('詳解')) {
        existing.aText = (existing.aText || '') + '\n\n詳解：\n' + explain;
      }
      if (stem) existing.qText = stem;
      existing.source = src;
      if (chapter) existing.chapter = chapter;
      await DB.put(existing);
      if (!silent) toast('已在錯題本（已更新）');
      return existing;
    }
    const m = {
      id: uid(),
      learnId: learnId || '',
      sourceId: learnId || '',
      subject: tabId,
      category: cat,
      chapter: chapter || label || '',
      source: src,
      qText: stem || '',
      aText,
      note: picked && picked !== answer ? `練習時選了 ${picked}` : '',
      reasons: reasons || [],
      questionImg: null,
      answerImg: null,
      figurePath: hasFigure && figurePath ? figurePath : '',
      status: 'active',
      stage: 0,
      nextDue: addDays(today(), (intervalsFor(tabId) || EBBINGHAUS)[0] || 1),
      history: [],
      starred: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdDate: today(),
      relearnCount: 0,
      relearnDates: []
    };
    await DB.put(m);
    remember('sources', m.source, tabId);
    if (m.chapter) remember('chapters', m.chapter, tabId);
    await saveSettings('chapters', 'sources');
    if (!silent) toast('已加入錯題本');
    return m;
  }

  async function promptAddWrong(opts) {
    const tab = mapLearnTab(opts.subjectTab);
    const reasons = categoryOf(tabOf(tab).category).reasons || [];
    const preview = esc((opts.stem || '').slice(0, 80)) + ((opts.stem || '').length > 80 ? '…' : '');
    const html = `<p class="muted small">勾選錯誤原因後加入錯題本（會排進艾賓浩斯複習）。</p>
      <p class="small" style="margin:6px 0 10px">${preview}</p>
      ${opts.picked && opts.answer ? `<p class="muted small">你的作答 <b>${esc(opts.picked)}</b>　正解 <b>${esc(opts.answer)}</b></p>` : ''}
      <div class="reason-grid">${reasons.map((r) => `<label class="check"><input type="checkbox" value="${esc(r)}"> ${esc(r)}</label>`).join('')}</div>`;
    const { ok, body } = await modal({ title: '加入錯題本', html, okText: '加入', cancelText: '不用' });
    if (!ok) return null;
    const pickedReasons = $$('input:checked', body).map((i) => i.value);
    return addWrongToNotebook({ ...opts, subjectTab: tab, reasons: pickedReasons });
  }

  async function promptAddWrongBulk(items, subjectTab, source) {
    if (!items.length) { toast('沒有答錯的題'); return; }
    const tab = mapLearnTab(subjectTab);
    const reasons = categoryOf(tabOf(tab).category).reasons || [];
    const html = `<p class="muted small">將 <b>${items.length}</b> 題答錯題一次加入錯題本。可先勾共同錯誤原因（每題都會套用）。</p>
      <div class="reason-grid">${reasons.map((r) => `<label class="check"><input type="checkbox" value="${esc(r)}"> ${esc(r)}</label>`).join('')}</div>`;
    const { ok, body } = await modal({ title: '全部加入錯題本', html, okText: `加入 ${items.length} 題`, cancelText: '取消' });
    if (!ok) return;
    const pickedReasons = $$('input:checked', body).map((i) => i.value);
    let nNew = 0, nUp = 0;
    for (const q of items) {
      const before = await findMistakeByLearnId(q.id);
      await addWrongToNotebook({
        subjectTab: tab,
        stem: q.stem,
        answer: q.answer,
        choices: q.choices,
        reasons: pickedReasons,
        source: source || '模擬考／練習',
        chapter: q.label || q.topic || '',
        learnId: q.id,
        picked: q._picked,
        explain: q.explain || '',
        figurePath: q.figurePath,
        hasFigure: q.hasFigure,
        label: q.label,
        silent: true
      });
      if (before) nUp++; else nNew++;
    }
    toast(`完成：新增 ${nNew}、更新 ${nUp}`);
  }

  /* ---------- normalize question ---------- */
  function figSrc(path) {
    if (!path) return '';
    return path.startsWith('./') || path.startsWith('data/') || path.startsWith('/') ? (path.startsWith('data/') ? './' + path : path) : './' + path;
  }


  /* ---------- KaTeX / LaTeX ---------- */
  function hasMathDelims(s) {
    const t = String(s ?? '');
    return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/.test(t);
  }
  /** Escape HTML but keep $...$ / $$...$$ / \(...\) / \[...\] intact for KaTeX; optionally annotate rare Chinese outside math. */
  function formatRichText(text, { annotate = false } = {}) {
    const s = String(text ?? '');
    if (!s) return '';
    const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;
    let out = '', last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) {
        const chunk = s.slice(last, m.index);
        out += (annotate && typeof annotateZhText === 'function')
          ? annotateZhText(chunk, { annotate: true })
          : esc(chunk);
      }
      out += esc(m[0]);
      last = m.index + m[0].length;
    }
    if (last < s.length) {
      const chunk = s.slice(last);
      out += (annotate && typeof annotateZhText === 'function')
        ? annotateZhText(chunk, { annotate: true })
        : esc(chunk);
    }
    return out || (annotate && typeof annotateZhText === 'function' ? annotateZhText(s, { annotate: true }) : esc(s));
  }
  /** Rough plain text for TTS so we don't speak raw \\dfrac. */
  function plainForSpeak(text) {
    return String(text ?? '')
      .replace(/\$\$([\s\S]+?)\$\$/g, ' $1 ')
      .replace(/\$([^$\n]+?)\$/g, ' $1 ')
      .replace(/\\\(([\s\S]+?)\\\)/g, ' $1 ')
      .replace(/\\\[([\s\S]+?)\\\]/g, ' $1 ')
      .replace(/\\dfrac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
      .replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, '$2的$1次方根')
      .replace(/\\sqrt\{([^{}]+)\}/g, '根號$1')
      .replace(/\\times/g, '×').replace(/\\div/g, '÷').replace(/\\pm/g, '正負')
      .replace(/\\le/g, '小於等於').replace(/\\ge/g, '大於等於').replace(/\\ne/g, '不等於')
      .replace(/\\approx/g, '約等於').replace(/\\infty/g, '無限大')
      .replace(/\\mathrm\{([^{}]+)\}/g, '$1').replace(/\\,/g, ' ')
      .replace(/\^{([^{}]+)}/g, '的$1次方').replace(/_\{([^{}]+)\}/g, '下標$1')
      .replace(/\\%/g, '%').replace(/[{}]/g, '')
      .replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function typesetMath(root) {
    if (!root || typeof renderMathInElement !== 'function') return;
    try {
      renderMathInElement(root, {
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
    } catch (e) { /* offline / missing katex */ }
  }


  /* ---------- shared MC runner ---------- */
  /**
   * opts: { mode:'practice'|'mock', hideUntilSubmit, onFinish }
   * questions: array of {id,stem,choices,answer,explain,figurePath,hasFigure,label,...}
   */
  function renderMcShell({ title, subtitle, q, index, total, mode, reveal, picked, timedLeft }) {
    const choices = (q.choices || []).map((c, i) => {
      const letter = (c.match(/^([A-D])/) || [])[1] || chr(65 + i);
      const show = reveal;
      let cls = 'mc-choice';
      if (show && letter === q.answer) cls += ' is-correct';
      if (show && picked === letter && letter !== q.answer) cls += ' is-wrong';
      if (!show && picked === letter) cls += ' is-picked';
      const choiceHtml = hasMathDelims(c) ? formatRichText(c) : esc(c);
      return `<button type="button" class="${cls}" data-letter="${letter}" ${reveal && mode === 'practice' ? '' : ''} ${mode === 'mock' && reveal ? 'disabled' : ''}>${choiceHtml}</button>`;
    }).join('');
    const fig = q.hasFigure && q.figurePath
      ? `<figure class="q-fig"><img src="${esc(figSrc(q.figurePath))}" alt="題目附圖" loading="lazy"></figure>` : '';
    const label = q.label ? `<span class="tag">${esc(q.label)}</span>` : '';
    const ext = q.extension ? `<span class="tag tag-ext">延伸</span>` : '';
    const conf = q.answerConfidence === 'none' ? `<span class="tag">缺答案</span>` : '';
    let stemHtml;
    if (q.lang === 'en') {
      stemHtml = enWordSpans(q.stem);
    } else if (hasMathDelims(q.stem)) {
      stemHtml = formatRichText(q.stem, { annotate: q.lang === 'zh' || /[\u4e00-\u9fff]/.test(q.stem || '') });
    } else if (q.lang === 'zh' || /[\u4e00-\u9fff]/.test(q.stem || '')) {
      stemHtml = (typeof annotateZhText === 'function' ? annotateZhText(q.stem, { annotate: true }) : esc(q.stem));
    } else {
      stemHtml = esc(q.stem);
    }
    const timer = timedLeft != null ? `<div class="mock-timer" id="mockTimer">剩餘 ${fmtTime(timedLeft)}</div>` : '';
    const explainBody = q.explain || ('正解：' + q.answer);
    const explainHtml = formatExplainBody(explainBody);
    const explain = reveal && (q.explain || q.answer)
      ? `<div class="q-explain card soft-card"><b>詳解</b><div class="explain-body">${explainHtml}</div>
          ${q.answer ? `<p class="muted small">答案：${esc(q.answer)}</p>` : '<p class="muted small">此題題庫尚無答案，請自行核對講義。</p>'}
        </div>` : '';
    return `
      <section class="card learn-shell quiz-head">
        <div class="bar-label"><div><div class="eyebrow">${esc(title)}</div><h2>${esc(subtitle || '')}</h2></div>
          <span class="tag">${index + 1} / ${total}</span></div>
        ${timer}
        <p class="muted small">${label}${ext}${conf}</p>
      </section>
      <section class="card q-card" data-qid="${esc(q.id || '')}">
        <div class="q-stem">${stemHtml} ${q.lang === 'en' ? `<button type="button" class="btn btn-soft btn-sm" data-en-sentence="${esc(q.stem)}">🔊 整句</button>` : (typeof zhSpeakBtn === 'function' ? zhSpeakBtn(plainForSpeak(q.stem), '🔊') : '')}</div>
        ${fig}
        <div class="mc-list">${choices}</div>
        <div class="btn-row q-actions" style="margin-top:12px;flex-wrap:wrap">
          ${mode === 'practice' && !reveal ? `<button type="button" class="btn btn-soft" id="btnReveal">看詳解</button>` : ''}
          ${mode === 'practice' && reveal && picked && picked !== q.answer && q.answer ? `<button type="button" class="btn btn-soft" id="btnAddWrong">加入錯題本</button>` : ''}
          <button type="button" class="btn btn-soft" id="btnPrev" ${index <= 0 ? 'disabled' : ''}>上一題</button>
          <button type="button" class="btn btn-primary" id="btnNext">${index >= total - 1 ? (mode === 'mock' ? '交卷' : '完成') : '下一題'}</button>
        </div>
        ${explain}
      </section>`;
  }
  function chr(n) { return String.fromCharCode(n); }
  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  let _runner = null;
  function stopRunner() {
    if (_runner && _runner.timer) clearInterval(_runner.timer);
    _runner = null;
  }

  async function runQuiz(app, {
    title, questions, mode = 'practice', subjectTab = 'ee', source = '刷題',
    durationSec = null, onDone, annotateZh = false
  }) {
    stopRunner();
    const qs = (questions || []).filter(Boolean);
    if (!qs.length) {
      app.innerHTML = `<section class="card"><h2>沒有題目</h2><p class="muted">換個篩選條件試試。</p><a class="btn btn-primary" href="#learn">回學習</a></section>`;
      return;
    }
    const state = {
      title, qs, mode, subjectTab, source, annotateZh,
      index: 0,
      picked: {}, // id -> letter
      revealed: {}, // id -> bool
      startedAt: Date.now(),
      endsAt: durationSec ? Date.now() + durationSec * 1000 : null,
      finished: false
    };
    _runner = state;

    const tick = () => {
      if (!state.endsAt || state.finished) return;
      const left = (state.endsAt - Date.now()) / 1000;
      const el = $('#mockTimer');
      if (el) el.textContent = '剩餘 ' + fmtTime(left);
      if (left <= 0) finish(true);
    };
    if (state.endsAt) state.timer = setInterval(tick, 500);

    async function finish(auto) {
      if (state.finished) return;
      state.finished = true;
      if (state.timer) clearInterval(state.timer);
      let correct = 0, graded = 0;
      state.qs.forEach((q) => {
        if (!q.answer) return;
        graded++;
        if (state.picked[q.id] === q.answer) correct++;
      });
      await recordPractice({ subject: subjectTab, correct, total: graded || state.qs.length, source });
      const wrongs = state.qs.filter((q) => q.answer && state.picked[q.id] && state.picked[q.id] !== q.answer)
        .map((q) => Object.assign({}, q, { _picked: state.picked[q.id] }));
      const isMock = state.mode === 'mock' || !!state.endsAt || auto;
      app.innerHTML = `
        <section class="card learn-shell">
          <h2>${auto ? '時間到・已交卷' : (isMock ? '模擬考交卷' : '練習結束')}</h2>
          <p class="lead">得分 <b class="hl">${correct}</b> / ${graded || state.qs.length}${graded && graded !== state.qs.length ? `（可計分 ${graded} 題）` : ''}</p>
          <p class="muted small">答錯 <b>${wrongs.length}</b> 題。可逐題加入錯題本，或一次全部加入（勾錯誤原因）。</p>
          <div class="btn-row" style="flex-wrap:wrap">
            <button type="button" class="btn btn-primary" id="btnReviewAll">逐題回顧</button>
            ${wrongs.length ? `<button type="button" class="btn btn-soft" id="btnAddAllWrong">全部加入錯題本（${wrongs.length}）</button>` : ''}
            <a class="btn btn-soft" href="#learn">回學習</a>
          </div>
        </section>
        <div class="card soft-card" id="resultList">
          <h3>作答一覽${wrongs.length ? `・錯題 ${wrongs.length}` : ''}</h3>
          ${state.qs.map((q, i) => {
            const p = state.picked[q.id] || '—';
            const ok = q.answer && p === q.answer;
            const na = !q.answer;
            const wrong = q.answer && p && p !== q.answer;
            return `<div class="result-item ${wrong ? 'is-wrong' : ''}">
              <button type="button" class="overview-tab result-row" data-i="${i}">
                <span><b>#${i + 1}</b> ${esc((q.stem || '').slice(0, 42))}${(q.stem || '').length > 42 ? '…' : ''}<br>
                <span class="muted small">你的作答 ${esc(p)}${na ? '・缺答案' : ('・正解 ' + esc(q.answer))}</span></span>
                <span class="${na ? 'pill-ok' : ok ? 'pill-ok' : 'pill-bad'}">${na ? '—' : ok ? '對' : '錯'}</span>
              </button>
              ${wrong ? `<button type="button" class="btn btn-soft btn-sm btn-add-one" data-wid="${esc(q.id)}">加入錯題本</button>` : ''}
            </div>`;
          }).join('')}
        </div>`;
      $('#btnReviewAll').onclick = () => { state.index = 0; state.mode = 'practice'; state.finished = false; state.qs.forEach((q) => { state.revealed[q.id] = true; }); paint(); };
      const ball = $('#btnAddAllWrong');
      if (ball) ball.onclick = () => promptAddWrongBulk(wrongs, state.subjectTab, state.source || (isMock ? '計時模擬考' : '練習'));
      $$('.result-row', app).forEach((b) => b.onclick = () => {
        state.index = +b.dataset.i;
        state.mode = 'practice';
        state.finished = false;
        state.revealed[state.qs[state.index].id] = true;
        paint();
      });
      $$('.btn-add-one', app).forEach((b) => b.onclick = (e) => {
        e.stopPropagation();
        const q = state.qs.find((x) => x.id === b.dataset.wid);
        if (!q) return;
        promptAddWrong({
          subjectTab: state.subjectTab, stem: q.stem, answer: q.answer, choices: q.choices,
          source: state.source || (isMock ? '計時模擬考' : '練習'),
          chapter: q.label || q.topic || '',
          learnId: q.id, picked: state.picked[q.id], explain: q.explain || '',
          figurePath: q.figurePath, hasFigure: q.hasFigure, label: q.label
        });
      });
      if (onDone) onDone({ correct, graded, wrongs, state });
    }

    function paint() {
      if (state.finished) return;
      const q = state.qs[state.index];
      const reveal = state.mode === 'mock' ? false : !!state.revealed[q.id];
      const left = state.endsAt ? (state.endsAt - Date.now()) / 1000 : null;
      q.lang = q.lang || (subjectTab === 'en' || subjectTab === 'english' ? 'en' : (subjectTab === 'zh' ? 'zh' : ''));
      app.innerHTML = renderMcShell({
        title: state.title,
        subtitle: state.mode === 'mock' ? '模擬考（交卷前不顯示答案）' : '練習模式',
        q, index: state.index, total: state.qs.length,
        mode: state.mode, reveal, picked: state.picked[q.id] || null,
        timedLeft: left
      });
      typesetMath(app);
      if (typeof wireZhSpeak === 'function') wireZhSpeak(app);
      wireEnSpeak(app);

      $$('.mc-choice', app).forEach((btn) => {
        btn.onclick = async () => {
          if (state.finished) return;
          const letter = btn.dataset.letter;
          state.picked[q.id] = letter;
          if (state.mode === 'practice') {
            // immediate check after choose
            state.revealed[q.id] = true;
          }
          paint();
        };
      });
      const br = $('#btnReveal');
      if (br) br.onclick = () => { state.revealed[q.id] = true; paint(); };
      const ba = $('#btnAddWrong');
      if (ba) ba.onclick = () => promptAddWrong({
        subjectTab: state.subjectTab, stem: q.stem, answer: q.answer, choices: q.choices,
        source: state.source, chapter: q.topic || q.section || q.label || '',
        learnId: q.id, picked: state.picked[q.id], explain: q.explain || '',
        figurePath: q.figurePath, hasFigure: q.hasFigure, label: q.label
      });
      // Auto-offer once right after a wrong answer in practice
      if (state.mode === 'practice' && state.revealed[q.id] && state.picked[q.id]
          && q.answer && state.picked[q.id] !== q.answer && !state._offeredAdd?.[q.id]) {
        state._offeredAdd = state._offeredAdd || {};
        state._offeredAdd[q.id] = true;
        setTimeout(() => {
          if (state.finished) return;
          promptAddWrong({
            subjectTab: state.subjectTab, stem: q.stem, answer: q.answer, choices: q.choices,
            source: state.source, chapter: q.topic || q.section || q.label || '',
            learnId: q.id, picked: state.picked[q.id], explain: q.explain || '',
            figurePath: q.figurePath, hasFigure: q.hasFigure, label: q.label
          });
        }, 350);
      }
      $('#btnPrev').onclick = () => { if (state.index > 0) { state.index--; paint(); } };
      $('#btnNext').onclick = () => {
        if (state.index >= state.qs.length - 1) {
          if (state.mode === 'mock') finish(false);
          else finish(false);
        } else { state.index++; paint(); }
      };
    }
    paint();
  }

  /* ---------- LEARN HUB ---------- */
  async function viewLearn(app) {
    const bank = await loadBank();
    const zh = await loadZhQuiz();
    const en = await loadEnQuiz();
    const math = await loadMath();
    const meta = bank.meta || {};
    app.innerHTML = `
      <section class="card learn-shell">
        <h2>學習區</h2>
        <p>考古題刷題、觀念卡、計時模擬考、國英發音與數學基礎都在這裡。寫錯可勾原因寫進同一本錯題本。</p>
        <p class="muted small">專業題庫 ${meta.total || 0} 題（有圖 ${meta.withFigure || 0}）・國文 114 選擇 ${zh.exam114?.length || 0}＋常識自出 ${zh.fromKnowledge?.length || 0}・英文 114 共 ${en.exam114?.length || 0}・數學 ${math.units?.length || 0} 單元</p>
      </section>
      <div class="learn-subjects">
        <a class="overview-tab learn-card" href="#learn-math"><b>數學基礎</b><span class="muted small">分數・方程式・單位換算</span><span class="tag tag-ok">可用</span></a>
        <a class="overview-tab learn-card" href="#learn-en"><b>英文</b><span class="muted small">114 考古・點字發音・回想卡</span><span class="tag tag-ok">可用</span></a>
        <a class="overview-tab learn-card" href="#learn-zh"><b>國文</b><span class="muted small">常識總表・刷題</span><span class="tag tag-ok">可用</span></a>
        <a class="overview-tab learn-card" href="#learn-ee"><b>電工原理</b><span class="muted small">觀念＋刷題＋模擬</span><span class="tag tag-ok">可用</span></a>
        <a class="overview-tab learn-card" href="#learn-em"><b>電工機械</b><span class="muted small">觀念＋刷題＋模擬</span><span class="tag tag-ok">可用</span></a>
        <a class="overview-tab learn-card" href="#learn-mock"><b>計時模擬考</b><span class="muted small">20／40／60 分・交卷才看答案</span><span class="tag tag-ok">可用</span></a>
      </div>
      <section class="card soft-card">
        <h3>與錯題本的銜接</h3>
        <p class="muted small">學習區答錯 → 勾錯誤原因 → 存進 IndexedDB → 艾賓浩斯複習；雲端備份一併帶走。</p>
        <div class="btn-row"><a class="btn btn-soft" href="#home">錯題首頁</a><a class="btn btn-soft" href="#add">新增錯題</a></div>
      </section>`;
  }

  function proSeg(track, active) {
    const base = `#learn-${track}`;
    return `<div class="mode-seg" role="tablist">
      <a href="${base}" class="${active === 'hub' ? 'on' : ''}">總覽</a>
      <a href="${base}/concepts" class="${active === 'concepts' ? 'on' : ''}">觀念區</a>
      <a href="${base}/drill" class="${active === 'drill' ? 'on' : ''}">刷題／計算</a>
      <a href="#learn-mock/${track}" class="${active === 'mock' ? 'on' : ''}">模擬考</a>
    </div>`;
  }

  async function viewPro(app, track, parts) {
    const name = track === 'em' ? '電工機械' : '電工原理';
    const sub = parts[0] || 'hub';
    $('#pageTitle').textContent = name;
    if (sub === 'concepts') return viewProConcepts(app, track);
    if (sub === 'drill') return viewProDrill(app, track, parts.slice(1));
    if (sub === 'quiz') return viewProDrill(app, track, parts.slice(1));

    const bank = await loadBank();
    const concepts = await loadConcepts();
    const qs = bank.questions.filter((q) => track === 'all' || q.track === track);
    const withAns = qs.filter((q) => q.answer).length;
    const figs = qs.filter((q) => q.hasFigure).length;
    const curatedN = concepts.curated.filter((c) => c.track === track).length;
    const bankConceptN = concepts.fromBank.filter((c) => c.track === track).length;

    app.innerHTML = `
      ${proSeg(track, 'hub')}
      <section class="card learn-shell">
        <h2>${esc(name)}</h2>
        <p>觀念區整理「較少計算」的觀念題與延伸小卡（高中／高職統測電機電子群難度）；刷題區為歷屆選擇題（含附圖）。</p>
        <p class="muted small">本題庫篩選：${qs.length} 題（有答案 ${withAns}、附圖 ${figs}）・延伸觀念卡 ${curatedN}・歷屆觀念 ${bankConceptN}。分類為關鍵字啟發式，可用「全部專業」查看。</p>
        <div class="btn-row" style="margin-top:12px;flex-wrap:wrap">
          <a class="btn btn-primary" href="#learn-${track}/concepts">進觀念區</a>
          <a class="btn btn-primary" href="#learn-${track}/drill">進刷題</a>
          <a class="btn btn-soft" href="#learn-mock/${track}">計時模擬考</a>
          <a class="btn btn-soft" href="#learn">回學習</a>
        </div>
      </section>
      <section class="card soft-card">
        <h3>提示</h3>
        <ul class="muted small" style="margin:0;padding-left:1.2rem">
          <li>練習模式：選完或按「看詳解」才顯示講解。</li>
          <li>模擬考：交卷前不顯示任何答案。</li>
          <li>106／108／109 部分題缺答案，仍可練習，計分時會略過。</li>
        </ul>
      </section>`;
  }

  async function viewProConcepts(app, track) {
    const concepts = await loadConcepts();
    const curated = concepts.curated.filter((c) => c.track === track);
    const fromBank = concepts.fromBank.filter((c) => c.track === track);
    $('#pageTitle').textContent = '觀念區';
    app.innerHTML = `
      ${proSeg(track, 'concepts')}
      <section class="card learn-shell">
        <h2>觀念區 <span class="tag tag-ok">${curated.length + fromBank.length}</span></h2>
        <p>先打基礎再刷計算題。標「延伸」者非中油原題，難度控制在統測電機電子群。</p>
        <div class="btn-row" style="margin-top:10px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="btnStartCurated">練習延伸觀念（${curated.length}）</button>
          <button type="button" class="btn btn-soft" id="btnStartBankC">練習歷屆觀念（${fromBank.length}）</button>
          <button type="button" class="btn btn-soft" id="btnStartAllC">全部觀念卡</button>
        </div>
      </section>
      <div class="card soft-card">
        <h3>延伸觀念卡</h3>
        ${curated.map((c) => `<button type="button" class="overview-tab concept-item" data-id="${esc(c.id)}"><span><b>${esc(c.topic)}</b><br><span class="muted small">${esc((c.stem || '').slice(0, 48))}…</span></span><span class="tag tag-ext">延伸</span></button>`).join('') || '<p class="muted">無</p>'}
      </div>
      <div class="card soft-card">
        <h3>歷屆觀念題（抽樣列表）</h3>
        ${fromBank.slice(0, 30).map((c) => `<div class="muted small" style="padding:6px 0;border-bottom:1px solid var(--line,#e7e2d8)">（${c.year} #${c.qnum}）${esc((c.stem || '').slice(0, 60))}…</div>`).join('') || '<p class="muted">無</p>'}
        <p class="muted small">${fromBank.length > 30 ? `另有 ${fromBank.length - 30} 題可在「練習歷屆觀念」作答。` : ''}</p>
      </div>`;
    const start = (list, title) => runQuiz(app, {
      title, questions: shuffle(list.map(normalizeConcept)), mode: 'practice',
      subjectTab: track, source: title
    });
    $('#btnStartCurated').onclick = () => start(curated, '延伸觀念');
    $('#btnStartBankC').onclick = () => start(fromBank, '歷屆觀念');
    $('#btnStartAllC').onclick = () => start(curated.concat(fromBank), '全部觀念');
    $$('.concept-item', app).forEach((b) => {
      b.onclick = () => {
        const c = curated.find((x) => x.id === b.dataset.id);
        if (c) start([c], c.topic);
      };
    });
  }

  function normalizeConcept(c) {
    return {
      id: c.id, stem: c.stem, choices: c.choices, answer: c.answer,
      explain: c.explain || '', extension: !!c.extension, label: c.extension ? '延伸觀念' : `歷屆觀念 ${c.year || ''}`,
      hasFigure: !!c.hasFigure, figurePath: c.figurePath || '', topic: c.topic || '',
      answerConfidence: c.answer ? 'high' : 'none'
    };
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function viewProDrill(app, track, rest) {
    const bank = await loadBank();
    $('#pageTitle').textContent = '刷題';
    // if rest[0]==='run' → start with filters in sessionStorage
    if (rest[0] === 'run') {
      const cfg = JSON.parse(sessionStorage.getItem('drillCfg') || '{}');
      let qs = bank.questions.slice();
      const scope = cfg.scope || track;
      if (scope === 'ee' || scope === 'em') qs = qs.filter((q) => q.track === scope);
      if (cfg.year && cfg.year !== 'all') qs = qs.filter((q) => String(q.year) === String(cfg.year));
      if (cfg.onlyFig) qs = qs.filter((q) => q.hasFigure);
      if (cfg.onlyAns) qs = qs.filter((q) => q.answer);
      if (cfg.limit) qs = shuffle(qs).slice(0, cfg.limit);
      else qs = shuffle(qs);
      return runQuiz(app, {
        title: `${scope === 'em' ? '電工機械' : scope === 'ee' ? '電工原理' : '全部專業'}刷題`,
        questions: qs.map((q) => ({
          id: q.id, stem: q.stem, choices: q.choices, answer: q.answer,
          explain: q.explain || (q.answer ? `歷屆答案：${q.answer}` : '題庫無答案'),
          hasFigure: q.hasFigure, figurePath: q.figurePath,
          label: `${q.year} #${q.qnum}・${q.track === 'em' ? '機械' : '原理'}`,
          answerConfidence: q.answerConfidence,
          extension: false
        })),
        mode: 'practice', subjectTab: scope === 'em' ? 'em' : 'ee', source: '專業刷題'
      });
    }

    const years = [...new Set(bank.questions.map((q) => q.year))].sort();
    const count = (pred) => bank.questions.filter(pred).length;
    app.innerHTML = `
      ${proSeg(track, 'drill')}
      <section class="card learn-shell">
        <h2>刷題／計算區</h2>
        <p class="muted small">選完選項即對錯；也可按「看詳解」。附圖會一併顯示（離線已快取）。</p>
        <label class="field"><span class="field-title">範圍</span>
          <select id="drillScope">
            <option value="${track}" selected>${track === 'em' ? '電工機械' : '電工原理'}</option>
            <option value="all">全部專業</option>
            <option value="ee">電工原理</option>
            <option value="em">電工機械</option>
          </select>
        </label>
        <label class="field"><span class="field-title">年份</span>
          <select id="drillYear"><option value="all">全部年份</option>${years.map((y) => `<option value="${y}">${y}</option>`).join('')}</select>
        </label>
        <label class="field"><span class="field-title">題數</span>
          <select id="drillLimit">
            <option value="10">10 題</option>
            <option value="20" selected>20 題</option>
            <option value="40">40 題</option>
            <option value="0">全部（可能很多）</option>
          </select>
        </label>
        <label class="check"><input type="checkbox" id="drillFig"> 只看出圖題（約 ${count((q) => q.hasFigure)} 題）</label>
        <label class="check"><input type="checkbox" id="drillAns" checked> 只出有答案的題（約 ${count((q) => q.answer)} 題）</label>
        <div class="btn-row" style="margin-top:12px">
          <button type="button" class="btn btn-primary" id="drillStart">開始刷題</button>
          <a class="btn btn-soft" href="#learn-${track}">回總覽</a>
        </div>
      </section>`;
    $('#drillStart').onclick = () => {
      const cfg = {
        scope: $('#drillScope').value,
        year: $('#drillYear').value,
        limit: parseInt($('#drillLimit').value, 10) || 0,
        onlyFig: $('#drillFig').checked,
        onlyAns: $('#drillAns').checked
      };
      sessionStorage.setItem('drillCfg', JSON.stringify(cfg));
      location.hash = `#learn-${track}/drill/run`;
    };
  }

  /* ---------- MOCK EXAM ---------- */
  async function viewMock(app, parts) {
    stopRunner();
    $('#pageTitle').textContent = '計時模擬考';
    const preset = parts[0] || '';
    if (parts[0] === 'run') {
      const cfg = JSON.parse(sessionStorage.getItem('mockCfg') || '{}');
      return startMock(app, cfg);
    }
    const bank = await loadBank();
    const zh = await loadZhQuiz();
    const en = await loadEnQuiz();
    app.innerHTML = `
      <section class="card learn-shell">
        <h2>計時模擬考</h2>
        <p>交卷前<strong>不顯示</strong>答案與詳解。時間到自動交卷。</p>
        <label class="field"><span class="field-title">範圍</span>
          <select id="mockScope">
            <option value="ee" ${preset === 'ee' ? 'selected' : ''}>電工原理</option>
            <option value="em" ${preset === 'em' ? 'selected' : ''}>電工機械</option>
            <option value="pro" ${preset === 'pro' ? 'selected' : ''}>專業混合（原理＋機械）</option>
            <option value="zh">國文（114＋常識自出）</option>
            <option value="en">英文（114）</option>
            <option value="mixed">國英＋專業混合</option>
          </select>
        </label>
        <label class="field"><span class="field-title">時間</span>
          <select id="mockDur">
            <option value="20">20 分鐘</option>
            <option value="40" selected>40 分鐘</option>
            <option value="60">60 分鐘</option>
            <option value="custom">自訂分鐘</option>
          </select>
        </label>
        <label class="field" id="mockCustomWrap" hidden><span class="field-title">自訂分鐘</span>
          <input type="number" id="mockCustom" min="1" max="180" value="30">
        </label>
        <label class="field"><span class="field-title">題數</span>
          <select id="mockN">
            <option value="20">20 題</option>
            <option value="30" selected>30 題</option>
            <option value="40">40 題</option>
            <option value="50">50 題</option>
          </select>
        </label>
        <div class="btn-row" style="margin-top:12px">
          <button type="button" class="btn btn-primary" id="mockGo">開始計時</button>
          <a class="btn btn-soft" href="#learn">回學習</a>
        </div>
        <p class="muted small">題庫：專業 ${bank.meta?.total || 0}・國文 ${(zh.exam114?.length || 0) + (zh.fromKnowledge?.length || 0)}・英文 ${en.exam114?.length || 0}</p>
      </section>`;
    $('#mockDur').onchange = () => { $('#mockCustomWrap').hidden = $('#mockDur').value !== 'custom'; };
    $('#mockGo').onclick = () => {
      let mins = parseInt($('#mockDur').value, 10);
      if ($('#mockDur').value === 'custom') mins = Math.max(1, Math.min(180, parseInt($('#mockCustom').value, 10) || 30));
      const cfg = { scope: $('#mockScope').value, minutes: mins, n: parseInt($('#mockN').value, 10) || 30 };
      sessionStorage.setItem('mockCfg', JSON.stringify(cfg));
      location.hash = '#learn-mock/run';
    };
  }

  async function startMock(app, cfg) {
    const bank = await loadBank();
    const zh = await loadZhQuiz();
    const en = await loadEnQuiz();
    const n = cfg.n || 30;
    let pool = [];
    const scope = cfg.scope || 'pro';
    const mapPro = (q) => ({
      id: q.id, stem: q.stem, choices: q.choices, answer: q.answer,
      explain: q.explain || (q.answer ? `答案 ${q.answer}` : ''),
      hasFigure: q.hasFigure, figurePath: q.figurePath,
      label: `${q.year}#${q.qnum}`, answerConfidence: q.answerConfidence
    });
    const mapLang = (q, lang) => ({
      id: q.id, stem: q.stem, choices: q.choices, answer: q.answer,
      explain: q.explain || '', label: q.label || q.section || '', lang,
      hasFigure: false, figurePath: ''
    });
    if (scope === 'ee') pool = bank.questions.filter((q) => q.track === 'ee' && q.answer);
    else if (scope === 'em') pool = bank.questions.filter((q) => q.track === 'em' && q.answer);
    else if (scope === 'pro') pool = bank.questions.filter((q) => q.answer);
    else if (scope === 'zh') pool = [...(zh.exam114 || []), ...(zh.fromKnowledge || [])];
    else if (scope === 'en') pool = [...(en.exam114 || [])];
    else {
      pool = [
        ...bank.questions.filter((q) => q.answer).map(mapPro),
        ...(zh.exam114 || []).map((q) => mapLang(q, 'zh')),
        ...(en.exam114 || []).map((q) => mapLang(q, 'en'))
      ];
      const qs = shuffle(pool).slice(0, n);
      return runQuiz(app, {
        title: '混合模擬考', questions: qs, mode: 'mock',
        subjectTab: 'ee', source: '模擬考', durationSec: (cfg.minutes || 40) * 60
      });
    }
    if (scope === 'zh') pool = pool.map((q) => mapLang(q, 'zh'));
    else if (scope === 'en') pool = pool.map((q) => mapLang(q, 'en'));
    else pool = pool.map(mapPro);
    const qs = shuffle(pool).slice(0, n);
    const tab = scope === 'en' ? 'en' : scope === 'zh' ? 'zh' : (scope === 'em' ? 'em' : 'ee');
    return runQuiz(app, {
      title: '計時模擬考', questions: qs, mode: 'mock',
      subjectTab: tab, source: '模擬考', durationSec: (cfg.minutes || 40) * 60
    });
  }

  /* ---------- ZH QUIZ ---------- */
  async function viewZhQuizHub(app) {
    const data = await loadZhQuiz();
    app.innerHTML = `
      ${typeof zhSeg === 'function' ? zhSeg('quiz') : ''}
      <section class="card learn-shell">
        <h2>國文刷題</h2>
        <p>114 年中油國文選擇題，以及由常識總表自動出題（字音／配對），來源會標示清楚。</p>
        <p class="muted small">114 選擇 ${data.exam114?.length || 0} 題・常識自出 ${data.fromKnowledge?.length || 0} 題。選完或按詳解才顯示講解。</p>
        <div class="btn-row" style="margin-top:12px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="zh114">114 國文選擇（${data.exam114?.length || 0}）</button>
          <button type="button" class="btn btn-soft" id="zhAuto">常識表出題（${data.fromKnowledge?.length || 0}）</button>
          <button type="button" class="btn btn-soft" id="zhMix">混合 20 題</button>
          <a class="btn btn-soft" href="#learn-mock">計時模擬考</a>
        </div>
      </section>`;
    const go = (list, title) => runQuiz(app, {
      title, questions: shuffle(list).map((q) => ({
        ...q, lang: 'zh', label: q.label || '114 國文',
        hasFigure: false
      })),
      mode: 'practice', subjectTab: 'zh', source: title
    });
    $('#zh114').onclick = () => go(data.exam114 || [], '114 國文');
    $('#zhAuto').onclick = () => go(data.fromKnowledge || [], '常識表出題');
    $('#zhMix').onclick = () => go([...(data.exam114 || []), ...(data.fromKnowledge || [])].slice(), '國文混合');
  }

  /* ---------- EN ---------- */
  async function viewEn(app, parts) {
    const data = await loadEnQuiz();
    $('#pageTitle').textContent = '英文';
    if (parts[0] === 'recall') return viewEnRecall(app, data);
    if (parts[0] === 'quiz') {
      const sec = parts[1] || 'all';
      let list = data.exam114 || [];
      if (sec !== 'all') list = list.filter((q) => q.section === sec);
      return runQuiz(app, {
        title: '英文練習', questions: shuffle(list).map((q) => ({ ...q, lang: 'en', label: ({ vocab: '字彙', grammar: '文法', dialogue: '會話' })[q.section] || q.section })),
        mode: 'practice', subjectTab: 'en', source: '英文刷題'
      });
    }
    const links = (settings.learnLinks || []).filter((l) => l.subject === 'en' && l.url);
    app.innerHTML = `
      <section class="card learn-shell">
        <h2>英文 <span class="tag tag-ok">114 考古</span></h2>
        <p>點單字或按「整句」可發音（en-US）。可開慢速。另有遮答案回想卡。</p>
        <label class="check"><input type="checkbox" id="enSlowToggle" ${enSlow ? 'checked' : ''}> 慢速發音</label>
        <div class="btn-row" style="margin-top:12px;flex-wrap:wrap">
          <a class="btn btn-primary" href="#learn-en/quiz/all">全部練習（${data.exam114?.length || 0}）</a>
          <a class="btn btn-soft" href="#learn-en/quiz/vocab">字彙</a>
          <a class="btn btn-soft" href="#learn-en/quiz/grammar">文法</a>
          <a class="btn btn-soft" href="#learn-en/quiz/dialogue">會話</a>
          <a class="btn btn-soft" href="#learn-en/recall">遮答案回想卡</a>
        </div>
      </section>
      <section class="card soft-card">
        <h3>使用提示</h3>
        <p class="muted small">練習模式選完即對錯；模擬考請走「計時模擬考 → 英文」。答錯可加入錯題本（語文類原因）。</p>
      </section>
      ${links.length ? `<section class="card soft-card"><h3>學習連結</h3><ul class="link-list">${links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a></li>`).join('')}</ul></section>` : ''}`;
    const t = $('#enSlowToggle');
    if (t) t.onchange = () => { enSlow = t.checked; toast(enSlow ? '已開慢速' : '已關慢速'); };
  }

  async function viewEnRecall(app, data) {
    const cards = data.recall || [];
    if (!cards.length) {
      app.innerHTML = `<section class="card"><h2>尚無回想卡</h2><a class="btn" href="#learn-en">回英文</a></section>`;
      return;
    }
    let i = 0, shown = false;
    const paint = () => {
      const c = cards[i];
      const blanked = (c.sentence || '').replace(/_+/g, '______');
      app.innerHTML = `
        <section class="card learn-shell">
          <div class="bar-label"><h2>遮答案回想卡</h2><span class="tag">${i + 1}/${cards.length}</span></div>
          <p class="muted small">${esc(c.promptZh || '先自己想，再翻開。')}</p>
          <label class="check"><input type="checkbox" id="enSlowToggle" ${enSlow ? 'checked' : ''}> 慢速發音</label>
        </section>
        <section class="card q-card">
          <div class="q-stem">${enWordSpans(blanked)}</div>
          <div class="btn-row" style="margin:10px 0;flex-wrap:wrap">
            <button type="button" class="btn btn-soft" data-en-sentence="${esc(c.sentence)}">🔊 整句</button>
            <button type="button" class="btn btn-primary" id="btnFlip">${shown ? '隱藏答案' : '顯示答案'}</button>
          </div>
          ${shown ? `<div class="q-explain card soft-card"><b>${esc(c.answerWord || c.answer)}</b><p class="muted small">${esc(c.explain || '')}</p>
            <div class="mc-list" style="margin-top:8px">${(c.choices || []).map((ch) => `<div class="muted small">${esc(ch)}</div>`).join('')}</div>
            <button type="button" class="btn btn-soft" id="btnAddWrong" style="margin-top:8px">不會・加入錯題本</button>
          </div>` : '<p class="muted">想好再翻開。</p>'}
          <div class="btn-row" style="margin-top:12px">
            <button type="button" class="btn btn-soft" id="btnPrev" ${i <= 0 ? 'disabled' : ''}>上一張</button>
            <button type="button" class="btn btn-primary" id="btnNext">${i >= cards.length - 1 ? '完成' : '下一張'}</button>
            <a class="btn btn-soft" href="#learn-en">回英文</a>
          </div>
        </section>`;
      wireEnSpeak(app);
      const t = $('#enSlowToggle'); if (t) t.onchange = () => { enSlow = t.checked; };
      $('#btnFlip').onclick = () => { shown = !shown; paint(); };
      $('#btnPrev').onclick = () => { if (i > 0) { i--; shown = false; paint(); } };
      $('#btnNext').onclick = () => { if (i >= cards.length - 1) { location.hash = '#learn-en'; return; } i++; shown = false; paint(); };
      const aw = $('#btnAddWrong');
      if (aw) aw.onclick = () => promptAddWrong({
        subjectTab: 'en', stem: c.sentence, answer: c.answer, choices: c.choices, source: '英文回想卡'
      });
    };
    paint();
  }

  /* ---------- MATH ---------- */
  async function viewMath(app, parts) {
    const data = await loadMath();
    const unitId = parts[0];
    if (unitId && unitId !== 'practice') {
      const unit = (data.units || []).find((u) => u.id === unitId);
      if (!unit) {
        app.innerHTML = `<section class="card"><h2>找不到單元</h2><a class="btn btn-primary" href="#learn-math">回數學</a></section>`;
        return;
      }
      return viewMathUnit(app, unit);
    }
    $('#pageTitle').textContent = '數學基礎';
    const links = (settings.learnLinks || []).filter((l) => l.subject === 'math' && l.url);
    app.innerHTML = `
      <section class="card learn-shell">
        <h2>數學基礎</h2>
        <p>國小～高中職會用到的底子，服務電工計算。每單元有短講解、例題與練習題；搞不懂再點外部連結（均一等）。</p>
      </section>
      <div class="learn-subjects">
        ${(data.units || []).map((u) => `
          <a class="overview-tab learn-card" href="#learn-math/${esc(u.id)}">
            <b>${esc(u.name)}</b>
            <span class="muted small math-inline">${formatRichText(u.blurb || '')}</span>
            <span class="tag">${(u.practice || []).length} 題練習</span>
          </a>`).join('')}
      </div>
      <section class="card soft-card">
        <h3>外部學習連結</h3>
        ${links.length ? `<ul class="link-list">${links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>${l.unit ? ` <span class="muted small">（${esc(l.unit)}）</span>` : ''}${l.note ? `<div class="muted small">${esc(l.note)}</div>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">可到設定新增。</p>'}
        <div class="btn-row"><a class="btn btn-soft" href="#settings">管理連結</a><a class="btn btn-soft" href="#learn">回學習</a></div>
      </section>`;
    typesetMath(app);
  }

  const MATH_STEP_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function displayMath(tex) {
    const t = String(tex ?? '').trim();
    if (!t) return '';
    if (t.startsWith('$$') || t.startsWith('\\[')) return formatRichText(t);
    return formatRichText('$$' + t + '$$');
  }
  function formatExplainBody(text) {
    const raw = String(text ?? '');
    if (!raw) return '';
    const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      return `<p class="explain-line">${hasMathDelims(raw) ? formatRichText(raw) : esc(raw)}</p>`;
    }
    return lines.map((line) => {
      const html = hasMathDelims(line) ? formatRichText(line) : esc(line);
      const cls = /^最終答案/.test(line) ? 'explain-line explain-answer' : 'explain-line';
      return `<p class="${cls}">${html}</p>`;
    }).join('');
  }
  function renderMathExample(ex) {
    if (!ex) return '';
    // Structured detailed worked example
    if (ex.steps && Array.isArray(ex.steps) && ex.steps.length) {
      const intro = ex.intro || (ex.kind ? `這是一題${ex.kind}，我們一步一步來求解：` : '我們一步一步來求解：');
      const givenLabel = ex.givenLabel || '給定：';
      const stepsHtml = ex.steps.map((st, i) => {
        const num = MATH_STEP_NUM[i] || String(i + 1);
        const title = st.title || '';
        const reason = st.reason || '';
        const calcs = (st.calcs || []).map((c) => displayMath(c)).join('');
        return `<li class="math-step">
          <div class="math-step-title">步驟${num}：${esc(title)}</div>
          ${reason ? `<p class="math-step-reason">${formatRichText(reason)}</p>` : ''}
          ${calcs ? `<div class="math-step-calcs">${calcs}</div>` : ''}
        </li>`;
      }).join('');
      return `<div class="math-ex">
        <b class="math-ex-title">${esc(ex.title || '例題')}</b>
        <div class="math-worked">
          <p class="math-intro">${esc(intro)}</p>
          <p class="math-given-label">${esc(givenLabel)}</p>
          <div class="math-block math-given">${displayMath(ex.given || '')}</div>
          <h4 class="math-steps-h">求解步驟</h4>
          <ol class="math-steps">${stepsHtml}</ol>
          <h4 class="math-answer-h">最終答案</h4>
          <div class="math-block math-final">${displayMath(ex.answer || '')}</div>
        </div>
      </div>`;
    }
    // Backward compatible: plain body string
    return `<div class="math-ex"><b class="math-ex-title">${esc(ex.title || '例題')}</b><div class="math-block">${formatRichText(ex.body || '')}</div></div>`;
  }
  async function viewMathUnit(app, unit) {
    $('#pageTitle').textContent = unit.name;
    const links = (settings.learnLinks || []).filter((l) => l.subject === 'math' && (!l.unit || l.unit === unit.name || (unit.id === 'frac' && /分數/.test(l.unit)) || (unit.id === 'linear1' && /一元/.test(l.unit)) || (unit.id === 'linear2' && /二元/.test(l.unit)) || (unit.id === 'signed' && /正負/.test(l.unit))));
    app.innerHTML = `
      <section class="card learn-shell">
        <h2>${esc(unit.name)}</h2>
        <p class="math-inline">${formatRichText(unit.blurb || '')}</p>
        <div class="math-explain"><b>精簡說明</b><p class="math-inline">${formatRichText(unit.explain || '')}</p></div>
      </section>
      <section class="card soft-card"><h3>例題</h3>
        ${(unit.examples || []).map((ex) => renderMathExample(ex)).join('') || '<p class="muted">無</p>'}
      </section>
      <section class="card soft-card">
        <h3>練習題</h3>
        <p class="muted small">選完才顯示詳解。公式以 LaTeX（KaTeX）顯示，離線可用。</p>
        <button type="button" class="btn btn-primary" id="mathPractice">開始練習（${(unit.practice || []).length} 題）</button>
      </section>
      ${links.length ? `<section class="card soft-card"><h3>搞不懂再點</h3><ul class="link-list">${links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a></li>`).join('')}</ul></section>` : ''}
      <div class="btn-row"><a class="btn btn-soft" href="#learn-math">回數學單元</a></div>`;
    typesetMath(app);
    $('#mathPractice').onclick = () => runQuiz(app, {
      title: unit.name,
      questions: (unit.practice || []).map((p, i) => ({
        id: `math-${unit.id}-${i}`, stem: p.stem, choices: p.choices, answer: p.answer,
        explain: p.explain || '', label: '數學練習'
      })),
      mode: 'practice', subjectTab: 'math', source: '數學・' + unit.name
    });
  }

  /* ---------- HOME helpers ---------- */
  async function todaySuggestions() {
    const dueN = (await DB.all()).filter((m) => isDue(m)).length;
    const st = await getStats();
    const goal = settings.dailyGoal || 10;
    const tips = [];
    if (dueN) tips.push({ href: '#session', text: `複習錯題 ${Math.min(dueN, goal)} 題`, primary: true });
    tips.push({ href: '#learn-zh', text: '國文常識／刷題約 10 分鐘' });
    tips.push({ href: '#learn-ee/drill', text: `專業刷題 ${goal} 題` });
    tips.push({ href: '#learn-en/recall', text: '英文回想卡 5 張' });
    tips.push({ href: '#learn-math', text: '數學基礎一單元' });
    tips.push({ href: '#learn-mock', text: '計時模擬考一段' });
    const weak = Object.entries(st.bySubject || {}).sort((a, b) => (a[1].correct / (a[1].total || 1)) - (b[1].correct / (b[1].total || 1)))[0];
    if (weak && weak[1].total >= 5) {
      const map = { ee: '#learn-ee', em: '#learn-em', en: '#learn-en', zh: '#learn-zh', english: '#learn-en' };
      tips.unshift({ href: map[weak[0]] || '#learn', text: `弱科加強：${weak[0]}（正確率 ${accuracyOf(st, weak[0])}%）` });
    }
    return { tips, st, dueN, goal };
  }

  async function weaknessHtml() {
    const everything = await DB.all();
    const st = await getStats();
    const byTab = {};
    everything.forEach((m) => {
      const k = m.subject || '?';
      byTab[k] = byTab[k] || { n: 0, reasons: {} };
      byTab[k].n++;
      (m.reasons || []).forEach((r) => { byTab[k].reasons[r] = (byTab[k].reasons[r] || 0) + 1; });
    });
    const tabs = settings.tabs || [];
    const tabBlocks = tabs.map((t) => {
      const info = byTab[t.id] || { n: 0, reasons: {} };
      const acc = accuracyOf(st, t.id) ?? accuracyOf(st, t.id === 'english' ? 'en' : t.id);
      const topReason = Object.entries(info.reasons).sort((a, b) => b[1] - a[1])[0];
      return `<div class="weak-tab">
        <div class="bar-label"><b>${esc(t.name)}</b><span class="muted small">錯題 ${info.n}${acc != null ? `・練習正確率 ${acc}%` : ''}</span></div>
        ${topReason ? `<p class="muted small">最常：${esc(topReason[0])}（${topReason[1]}）</p>` : '<p class="muted small">尚無錯因</p>'}
      </div>`;
    }).join('');
    const counts = {};
    everything.forEach((m) => (m.reasons || []).forEach((r) => { counts[r] = (counts[r] || 0) + 1; }));
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted[0]?.[1] || 1;
    const bars = sorted.length
      ? sorted.slice(0, 8).map(([r, n], i) => `<div class="bar-row ${i === 0 ? 'top' : ''}"><div class="bar-label"><span>${esc(r)}</span><b>${n}</b></div><div class="bar"><i style="--w:${Math.round(n / max * 100)}%"></i></div></div>`).join('')
      : '<p class="muted">還沒有錯因資料。</p>';
    return `<div class="weak-tabs">${tabBlocks || '<p class="muted small">尚無分頁資料</p>'}</div>
      <h4 style="margin:12px 0 6px">錯因總覽</h4>${bars}
      <p class="muted small" style="margin-top:8px">練習正確率來自學習區刷題／模擬考統計（本機）。</p>`;
  }

  return {
    viewLearn, viewPro, viewMock, viewZhQuizHub, viewEn, viewMath,
    todaySuggestions, weaknessHtml, stopRunner, getStats, accuracyOf, loadBank
  };
})();
