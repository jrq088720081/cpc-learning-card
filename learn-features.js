/* 學習區功能：專業科目／國英刷題／數學／模擬考／練習統計。依賴 app.js 全域工具。 */
'use strict';

const LearnUI = (() => {
  /* ---------- data loaders ---------- */
  let _bank, _concepts, _zhQuiz, _enQuiz, _math, _tips;
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
  async function loadTips() {
    if (_tips) return _tips;
    if (window.__TIPS__) _tips = window.__TIPS__;
    else {
      try { _tips = await (await fetch('./data/tips/tips.json')).json(); }
      catch { _tips = { sourceNote: '', categories: [] }; }
    }
    return _tips;
  }
  let _examLinks;
  async function loadExamLinks() {
    if (_examLinks) return _examLinks;
    if (window.__MATH_EXAM_LINKS__) _examLinks = window.__MATH_EXAM_LINKS__;
    else {
      try { _examLinks = await (await fetch('./data/math/exam-links.json')).json(); }
      catch { _examLinks = { byUnit: {}, byQuestion: {}, questions: {}, meta: {} }; }
    }
    return _examLinks;
  }
  let _formulas;
  async function loadFormulas() {
    if (_formulas) return _formulas;
    let raw = window.__EXAM_FORMULAS__;
    if (!raw) {
      try { raw = await (await fetch('./data/exam/formulas.json')).json(); }
      catch { raw = { formulas: [] }; }
    }
    const formulas = raw.formulas || [];
    const byId = {};
    const byQuestion = {};
    formulas.forEach((f) => {
      byId[f.id] = f;
      (f.questionIds || []).forEach((qid) => {
        if (!byQuestion[qid]) byQuestion[qid] = [];
        if (!byQuestion[qid].includes(f.id)) byQuestion[qid].push(f.id);
      });
    });
    _formulas = { formulas, byId, byQuestion, meta: raw.meta || {} };
    return _formulas;
  }
  let _pathPlan;
  async function loadPathChapters() {
    if (_pathPlan) return _pathPlan;
    if (window.__PATH_CHAPTERS__) _pathPlan = window.__PATH_CHAPTERS__;
    else {
      try { _pathPlan = await (await fetch('./data/path-chapters.json')).json(); }
      catch { _pathPlan = { phases: [], chapters: [], rules: {}, mainOrder: [], rotations: {} }; }
    }
    return _pathPlan;
  }
  const FORMULA_SUBJECT = { ee: '電工原理', em: '電工機械', math: '數學' };
  function formulaSubjectName(subject) {
    return FORMULA_SUBJECT[subject] || subject || '';
  }
  function formulaChipsForQuestion(q, data) {
    if (!q || !data || !q.id) return '';
    const ids = (data.byQuestion || {})[q.id] || [];
    if (!ids.length) return '';
    const chips = ids.map((fid) => {
      const f = (data.byId || {})[fid];
      if (!f) return '';
      const track = f.subject === 'em' ? 'em' : 'ee';
      return `<a class="chip chip-formula" href="#learn-${track}/formulas/${esc(fid)}">${esc(f.name)}</a>`;
    }).filter(Boolean).join('');
    if (!chips) return '';
    return `<div class="link-chips muted small"><span>相關公式：</span>${chips}</div>`;
  }
  function stemSummary(stem, n) {
    const s = String(stem || '').replace(/\s+/g, ' ').trim();
    const lim = n || 72;
    return s.length > lim ? s.slice(0, lim) + '…' : s;
  }
  function examQuestionHref(q) {
    const track = q && q.track === 'em' ? 'em' : 'ee';
    return `#learn-${track}/q/${encodeURIComponent(q.id)}`;
  }
  function mathChipsForQuestion(q, links) {
    if (!q || !links) return '';
    const units = (links.byQuestion || {})[q.id] || q.mathUnits || [];
    if (!units.length) return '';
    const names = (links.meta && links.meta.unitNames) || {};
    const chips = units.map((uid) => {
      const name = names[uid] || uid;
      return `<a class="chip chip-math" href="#learn-math/${esc(uid)}">不會？先練：${esc(name)}</a>`;
    }).join(' ');
    return `<div class="link-chips muted small"><span>數學補強：</span>${chips}</div>`;
  }
  function examChipsForUnit(unitId, links) {
    if (!unitId || !links) return '';
    const ids = ((links.byUnit || {})[unitId] || []).slice(0, 8);
    if (!ids.length) return '';
    const qm = links.questions || {};
    const chips = ids.map((id) => {
      const m = qm[id] || {};
      const label = m.label || id.replace(/^cpc-/, '');
      const track = m.track === 'em' ? 'em' : 'ee';
      return `<a class="chip chip-exam" href="#learn-${track}/q/${esc(id)}">相關歷屆：${esc(label)}</a>`;
    }).join(' ');
    return `<div class="link-chips muted small"><span>相關歷屆：</span>${chips}</div>`;
  }
  function sourceTagHtml(item) {
    if (!item) return '';
    const s = item.source || '';
    if (!s) return '';
    const note = item.sourceNote ? `・${item.sourceNote}` : '';
    return `<p class="muted small source-tag">出處：${esc(s)}${esc(note)}</p>`;
  }

  /* ---------- practice stats (IndexedDB meta) ---------- */
  async function getStats() {
    return (await DB.meta('practiceStats', null)) || { bySubject: {}, history: [] };
  }
  async function recordPractice({ subject, correct, total, source, ids }) {
    const st = await getStats();
    const s = st.bySubject[subject] || { correct: 0, total: 0, wrong: 0 };
    s.correct += correct;
    s.total += total;
    s.wrong += (total - correct);
    st.bySubject[subject] = s;
    st.history = [{ at: Date.now(), subject, correct, total, source: source || '' }, ...(st.history || [])].slice(0, 100);
    if (ids && ids.length) {
      st.seen = st.seen || {};
      const cur = new Set(st.seen[subject] || []);
      ids.forEach((id) => { if (id) cur.add(String(id)); });
      st.seen[subject] = [...cur].slice(-4000);
    }
    await DB.setMeta('practiceStats', st);
    return st;
  }
  function accuracyOf(st, subject) {
    const s = st.bySubject[subject];
    if (!s || !s.total) return null;
    return Math.round(100 * s.correct / s.total);
  }

  /* ---------- TTS helpers (EN) ---------- */
  const EN_RATES = { slow: 0.72, normal: 1, fast: 1.22 };
  function enRateKey() {
    const k = (typeof settings !== 'undefined' && settings && settings.enTtsRate) || 'normal';
    return EN_RATES[k] ? k : 'normal';
  }
  function enSpeakRate() { return EN_RATES[enRateKey()]; }
  function speakEn(text, rate) {
    const t = String(text || '').trim();
    if (!t || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    const r = rate != null ? rate : enSpeakRate();
    if (typeof speakEnglishQueued === 'function') speakEnglishQueued(t, r);
  }
  function enWordSpans(text) {
    return String(text || '').split(/(\s+)/).map((tok) => {
      if (/^\s+$/.test(tok) || !tok) return esc(tok);
      const clean = tok.replace(/^[^\w']+|[^\w']+$/g, '');
      if (!/[A-Za-z]/.test(clean)) return esc(tok);
      return `<button type="button" class="en-word" data-speak="${esc(clean)}">${esc(tok)}</button>`;
    }).join('');
  }
  function passageFlat(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }
  function passageRecord(q) {
    const data = _enQuiz || (typeof window !== 'undefined' ? window.__EN_QUIZ__ : null);
    const id = q && q.passageId;
    return (data && data.passages && id && data.passages[id]) || null;
  }
  function passageParts(q) {
    const pack = passageRecord(q);
    const fromText = String((q && q.passage) || '').replace(/\r\n/g, '\n').trim();
    const split = fromText
      ? fromText.split(/\n{2,}/).map((s) => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
      : [];
    if (pack && Array.isArray(pack.paragraphs) && pack.paragraphs.length) {
      if (!fromText || passageFlat(pack.paragraphs.join(' ')) === passageFlat(fromText)) return pack.paragraphs;
    }
    return split;
  }
  function passageZhList(q) {
    const pack = passageRecord(q);
    if (pack && Array.isArray(pack.zh) && pack.zh.length) return pack.zh;
    if (q && Array.isArray(q.passageZh)) return q.passageZh;
    return [];
  }
  function renderPassageBlock(q, reveal) {
    if (!q || !q.passage) return '';
    const paras = passageParts(q);
    const list = paras.length ? paras : [String(q.passage)];
    const zh = passageZhList(q);
    const showZh = !!(reveal && q.lang === 'en' && zh.length);
    const blocks = list.map((p, i) => {
      const en = q.lang === 'en' ? enWordSpans(p) : esc(p);
      const read = q.lang === 'en'
        ? `<div class="q-para-tools"><button type="button" class="btn btn-soft btn-sm" data-en-para="${i}" data-speak="${esc(p)}" aria-pressed="false">朗讀本段</button></div>`
        : '';
      const zhHtml = showZh && zh[i] ? `<p class="q-para-zh">${esc(zh[i])}</p>` : '';
      return `<div class="q-para">${read}<p class="q-para-en">${en}</p>${zhHtml}</div>`;
    }).join('');
    return `<div class="q-passage">${blocks}</div>`;
  }
  function setParaBtn(b, on) {
    if (!b) return;
    b.classList.toggle('is-reading', !!on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.textContent = on ? '停止朗讀' : '朗讀本段';
  }
  function resetParaBtns(root, except) {
    $$('[data-en-para]', root).forEach((x) => { if (x !== except) setParaBtn(x, false); });
  }
  function armParaWatch(b) {
    clearTimeout(b._watch);
    let ticks = 0;
    const step = () => {
      if (!b.isConnected || !b.classList.contains('is-reading')) return;
      ticks += 1;
      let busy = false;
      try { busy = !!(window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending)); } catch (e) { busy = false; }
      if (ticks > 2 && !busy) { setParaBtn(b, false); return; }
      b._watch = setTimeout(step, 350);
    };
    b._watch = setTimeout(step, 350);
  }
  function enSpeedHtml() {
    const cur = enRateKey();
    const opts = [['slow', '慢'], ['normal', '正常'], ['fast', '快']];
    return `<div class="en-speed" role="group" aria-label="語速"><span class="lbl">語速</span>${opts.map(([k, n]) => `<button type="button" class="en-rate ${cur === k ? 'on' : ''}" data-en-rate="${k}" aria-pressed="${cur === k ? 'true' : 'false'}">${n}</button>`).join('')}</div>`;
  }
  function glossKey(s) {
    return String(s || '')
      .replace(/^[A-D][.、．)\]]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/[.。!！?？]+$/g, '');
  }
  function enSpeakList(items) {
    return (items || []).map((it) => {
      const en = (it && it.en) || '';
      const zh = (it && it.zh) || '';
      if (!en) return '';
      const long = en.trim().split(/\s+/).length >= 7;
      return `<li><button type="button" class="en-speak-item${long ? ' is-long' : ''}" data-speak="${esc(en)}"><b>${esc(en)}</b><span>${esc(zh)}</span></button></li>`;
    }).filter(Boolean).join('');
  }
  function renderEnGloss(q) {
    if (!q) return '';
    const tr = q.translation
      ? `<div class="en-block"><h4>整句中譯</h4><p>${esc(q.translation)}</p></div>`
      : '';
    const choiceKeys = new Set((q.choices || []).map(glossKey));
    const phraseItems = [];
    const optionItems = [];
    (q.phrases || []).forEach((it) => {
      const en = (it && it.en) || '';
      if (!en) return;
      if (choiceKeys.has(glossKey(en))) optionItems.push(it);
      else phraseItems.push(it);
    });
    const phrases = enSpeakList(phraseItems);
    const options = enSpeakList(optionItems);
    const words = enSpeakList(q.words);
    const ph = phrases ? `<div class="en-block"><h4>片語</h4><ul class="en-speak-list">${phrases}</ul></div>` : '';
    const opt = options ? `<div class="en-block"><h4>選項對照</h4><ul class="en-speak-list en-speak-options">${options}</ul></div>` : '';
    const wd = words ? `<div class="en-block"><h4>單字</h4><ul class="en-speak-list">${words}</ul></div>` : '';
    const note = q.explain ? `<div class="en-block"><h4>說明</h4>${formatExplainBody(q.explain, { speakEn: true })}</div>` : '';
    return `${tr}${ph}${opt}${wd}${note}`;
  }
  function renderEnExplain(q) {
    return `${enSpeedHtml()}${renderEnGloss(q)}`;
  }
  function wireEnSpeak(root) {
    if (typeof stopEnglishSpeak === 'function') stopEnglishSpeak();
    $$('.en-word, .en-speak-item, .en-gloss', root).forEach((b) => {
      if (b._wired) return; b._wired = true;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetParaBtns(root);
        b.classList.add('is-hot');
        clearTimeout(b._hot);
        b._hot = setTimeout(() => b.classList.remove('is-hot'), 700);
        speakEn(b.getAttribute('data-speak') || '');
      });
    });
    $$('[data-en-para]', root).forEach((b) => {
      if (b._wired) return; b._wired = true;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (b.classList.contains('is-reading')) {
          if (typeof stopEnglishSpeak === 'function') stopEnglishSpeak();
          setParaBtn(b, false);
          return;
        }
        const text = b.getAttribute('data-speak') || '';
        if (!text.trim() || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
          if (typeof toast === 'function') toast('這台裝置無法朗讀');
          return;
        }
        resetParaBtns(root);
        setParaBtn(b, true);
        speakEn(text);
        armParaWatch(b);
      });
    });
    $$('[data-en-sentence]', root).forEach((b) => {
      if (b._wired) return; b._wired = true;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetParaBtns(root);
        speakEn(b.getAttribute('data-en-sentence') || '');
      });
    });
    $$('[data-en-rate]', root).forEach((b) => {
      if (b._wired) return; b._wired = true;
      b.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof stopEnglishSpeak === 'function') stopEnglishSpeak();
        resetParaBtns(root);
        const rate = b.getAttribute('data-en-rate') || 'normal';
        if (typeof settings !== 'undefined' && settings) {
          settings.enTtsRate = EN_RATES[rate] ? rate : 'normal';
          if (typeof saveSettings === 'function') await saveSettings('enTtsRate');
        }
        $$('[data-en-rate]', root).forEach((x) => {
          const on = x.getAttribute('data-en-rate') === enRateKey();
          x.classList.toggle('on', on);
          x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const label = { slow: '慢', normal: '正常', fast: '快' }[enRateKey()] || '正常';
        if (typeof toast === 'function') toast('語速：' + label);
      });
    });
  }

  /* ---------- 國英年份（只列出有題的年度，題池＝所選年份聯集） ---------- */
  const yearPick = { zh: null, en: null };
  function examBuckets(data) {
    const out = [];
    if (!data) return out;
    Object.keys(data).forEach((k) => {
      const m = /^exam(\d{2,3})$/.exec(k);
      if (!m) return;
      const arr = data[k];
      if (Array.isArray(arr) && arr.length) out.push({ year: +m[1], key: k, questions: arr });
    });
    out.sort((a, b) => b.year - a.year);
    return out;
  }
  function allExamQuestions(data) {
    return examBuckets(data).flatMap((b) => b.questions);
  }
  function pickedYears(kind, data) {
    const years = examBuckets(data).map((b) => b.year);
    if (!years.length) return [];
    const store = yearPick[kind];
    if (!store || !store.size) {
      yearPick[kind] = new Set([years[0]]);
      return [years[0]];
    }
    const kept = years.filter((y) => store.has(y));
    if (!kept.length) {
      yearPick[kind] = new Set([years[0]]);
      return [years[0]];
    }
    return kept;
  }
  function questionsForYears(data, years) {
    const set = new Set((years || []).map(Number));
    return examBuckets(data).filter((b) => set.has(b.year)).flatMap((b) => b.questions);
  }
  function yearChipsHtml(data, picked) {
    const years = examBuckets(data);
    const set = new Set(picked);
    if (!years.length) return '<p class="muted small">尚無年份題庫。</p>';
    return `<div class="year-chips" role="group" aria-label="選擇年份">${years.map((b) => `<button type="button" class="year-chip ${set.has(b.year) ? 'on' : ''}" data-year="${b.year}" aria-pressed="${set.has(b.year) ? 'true' : 'false'}">${b.year}（${b.questions.length}）</button>`).join('')}<button type="button" class="year-chip year-all">全選</button></div>`;
  }
  function wireYearChips(root, kind, data, rerender) {
    $$('.year-chip[data-year]', root).forEach((b) => {
      b.onclick = () => {
        const y = +b.dataset.year;
        const cur = new Set(pickedYears(kind, data));
        if (cur.has(y)) {
          if (cur.size <= 1) { if (typeof toast === 'function') toast('至少留一個年份'); return; }
          cur.delete(y);
        } else cur.add(y);
        yearPick[kind] = cur;
        rerender();
      };
    });
    const allBtn = $('.year-all', root);
    if (allBtn) allBtn.onclick = () => {
      yearPick[kind] = new Set(examBuckets(data).map((b) => b.year));
      rerender();
    };
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
    explain = stripGenericOptionBoilerplate(explain);
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
  /**
   * cases／矩陣的換行必須是兩個反斜線。JSON 常把 `\\\\` 存成單一 `\` + 空白，
   * KaTeX 會把它當成普通空白，聯立方程式就黏成一行。這裡只補「不是指令」的孤立反斜線；
   * 已經是 `\\` 的不再加倍。HTML escape 不處理反斜線，所以要在 esc 之前做。
   */
  function repairTexRowBreaks(tex) {
    return String(tex ?? '').replace(
      /\\begin\{(cases|aligned|align\*?|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|array|gather\*?|split)\}([\s\S]*?)\\end\{\1\}/g,
      (full, env, body) => {
        const fixed = body.replace(/(^|[^\\])\\(?=\s)/g, '$1\\\\');
        return '\\begin{' + env + '}' + fixed + '\\end{' + env + '}';
      }
    );
  }
  /** Escape HTML but keep $...$ / $$...$$ / \(...\) / \[...\] intact for KaTeX; optionally annotate rare Chinese outside math. */
  function formatRichText(text, { annotate = false } = {}) {
    const s = repairTexRowBreaks(String(text ?? ''));
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
    const explainHtml = (q.lang === 'en' && (q.translation || (q.phrases && q.phrases.length) || (q.words && q.words.length)))
      ? renderEnExplain(q)
      : formatExplainBody(explainBody, { speakEn: q.lang === 'en' });
    const explain = reveal && (q.explain || q.answer)
      ? `<div class="q-explain card soft-card"><div class="q-tools">${learnedLabel(!!q._learned)}</div><b>詳解</b><div class="explain-body">${explainHtml}</div>
          ${q.answer ? `<p class="muted small">答案：${esc(q.answer)}</p>` : '<p class="muted small">此題題庫尚無答案，請自行核對講義。</p>'}
          ${sourceTagHtml(q)}
          ${reveal ? (q._formulaChipsHtml || '') : ''}
          ${reveal ? (q._mathChipsHtml || '') : ''}
        </div>` : '';
    return `
      <section class="card learn-shell quiz-head">
        <div class="bar-label"><div><div class="eyebrow">${esc(title)}</div><h2>${esc(subtitle || '')}</h2></div>
          <span class="tag">${index + 1} / ${total}</span></div>
        ${timer}
        <p class="muted small">${label}${ext}${conf}</p>
      </section>
      <section class="card q-card" data-qid="${esc(q.id || '')}">
        ${(mode === 'mock' && !reveal) ? '' : `<div class="q-tools">
          ${learnedLabel(!!q._learned)}
          <button type="button" class="q-fav ${q._fav ? 'on' : ''}" id="btnFav" aria-pressed="${q._fav ? 'true' : 'false'}" title="我的最愛">${q._fav ? '★' : '☆'}<span class="small">${q._fav ? '已收藏' : '收藏'}</span></button>
        </div>`}
        ${renderPassageBlock(q, reveal)}
        <div class="q-stem">${stemHtml} ${q.lang === 'en' && q.stem ? `<button type="button" class="btn btn-soft btn-sm" data-en-sentence="${esc(q.stem)}">🔊 整句</button>` : (q.lang === 'en' ? '' : (typeof zhSpeakBtn === 'function' ? zhSpeakBtn(plainForSpeak(q.stem), '🔊') : ''))}</div>
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
  function favSnapshot(q, state) {
    return { id: q.id, stem: q.stem, choices: q.choices, answer: q.answer, explain: q.explain || '',
      figurePath: q.figurePath || '', hasFigure: !!q.hasFigure, label: q.label || '', lang: q.lang || '',
      translation: q.translation || '', phrases: q.phrases || [], words: q.words || [],
      passage: q.passage || '', passageId: q.passageId || '',
      source: q.source || '', sourceNote: q.sourceNote || '', subjectTab: state.subjectTab, from: state.source || '', at: Date.now() };
  }
  async function wireQTools(q, state) {
    const fav = $('#btnFav');
    if (fav) fav.onclick = async () => {
      settings.learnFavs = settings.learnFavs || {};
      if (settings.learnFavs[q.id]) delete settings.learnFavs[q.id];
      else settings.learnFavs[q.id] = favSnapshot(q, state);
      await saveSettings('learnFavs');
      const on = !!settings.learnFavs[q.id];
      fav.classList.toggle('on', on); fav.setAttribute('aria-pressed', on ? 'true' : 'false');
      fav.innerHTML = `${on ? '★' : '☆'}<span class="small">${on ? '已收藏' : '收藏'}</span>`;
      toast(on ? '已加入我的最愛' : '已取消收藏');
    };
    const syncLearned = (on) => {
      $$('.quiz-learned').forEach((input) => {
        input.checked = on;
        const label = input.closest('.q-learned');
        if (label) label.classList.toggle('on', on);
      });
    };
    $$('.quiz-learned').forEach((input) => {
      input.addEventListener('change', async () => {
        const on = input.checked;
        if (!q.id) {
          syncLearned(false);
          toast('這題沒有編號，沒辦法記成已學會');
          return;
        }
        const prev = await commitLearned(q.id, learnedSnapshotFromQuestion(q, state), on);
        syncLearned(on);
        if (on) toast('已記成已學會');
        else if (prev && typeof toastAction === 'function') {
          toastAction('已從已學會移出', '復原', async () => {
            await commitLearned(q.id, prev, true);
            syncLearned(true);
            toast('已恢復已學會');
          });
        } else toast('已從已學會移出');
      });
    });
  }
  const FAV_CATS = [['all', '全部'], ['zh', '國文'], ['en', '英文'], ['en-vocab', '英文單字'], ['ee', '電工原理'], ['em', '電工機械'], ['math', '數學'], ['other', '其他']];
  function favCat(f) {
    const t = String(f.subjectTab || '');
    if (t === 'en-vocab' || f.kind === 'word' || f.kind === 'phrase') return 'en-vocab';
    if (t === 'english') return 'en';
    return ['zh', 'en', 'ee', 'em', 'math'].includes(t) ? t : 'other';
  }
  let _favFilter = 'all';
  async function viewFavs(app) {
    $('#pageTitle').textContent = '我的最愛';
    const all = Object.values(settings.learnFavs || {}).sort((a, b) => (b.at || 0) - (a.at || 0));
    if (!all.length) {
      app.innerHTML = `<section class="card"><h2>★ 我的最愛</h2><p class="muted">還沒有收藏。做題時點題目右上的 ☆，或在單字庫點星星，會分類收在這裡（含英文單字）。</p><a class="btn btn-primary" href="#learn">去學習區做題</a></section>`;
      return;
    }
    const counts = {}; all.forEach((f) => { const c = favCat(f); counts[c] = (counts[c] || 0) + 1; });
    if (_favFilter !== 'all' && !counts[_favFilter]) _favFilter = 'all';
    const favs = _favFilter === 'all' ? all : all.filter((f) => favCat(f) === _favFilter);
    const chips = FAV_CATS.filter(([k]) => k === 'all' || counts[k]).map(([k, n]) => `<button type="button" class="chip fav-chip ${k === _favFilter ? 'active' : ''}" data-k="${k}">${n} ${k === 'all' ? all.length : counts[k]}</button>`).join('');
    app.innerHTML = `<section class="card learn-shell"><h2>★ 我的最愛</h2>
      <div class="fav-chips">${chips}</div>
      <div class="btn-row"><button type="button" class="btn btn-primary" id="favRun">練習這 ${favs.length} 題</button></div></section>
      <div class="card soft-card">${favs.map((f, i) => `<div class="fav-item"><button type="button" class="overview-tab fav-row" data-i="${i}"><span>${formatRichText((f.stem || '').slice(0, 70))}<br><span class="muted small">${esc((FAV_CATS.find(([k]) => k === favCat(f)) || [, '其他'])[1])}・${esc(f.from || '')}</span></span></button><button type="button" class="q-fav on fav-del" data-id="${esc(f.id)}" title="取消收藏" aria-label="取消收藏">★</button></div>`).join('')}</div>`;
    typesetMath(app);
    const quizItems = favs.filter((f) => favCat(f) !== 'en-vocab');
    const runBtn = $('#favRun');
    if (runBtn) {
      if (!quizItems.length) runBtn.hidden = true;
      else {
        runBtn.textContent = `練習這 ${quizItems.length} 題`;
        runBtn.onclick = () => runQuiz(app, { title: '我的最愛', questions: quizItems.map((f) => Object.assign({}, f)), mode: 'practice', subjectTab: quizItems[0].subjectTab || 'math', source: '我的最愛' });
      }
    }
    $$('.fav-chip', app).forEach((b) => b.onclick = () => { _favFilter = b.dataset.k; viewFavs(app); });
    $$('.fav-row', app).forEach((b) => b.onclick = () => {
      const f = favs[+b.dataset.i];
      if (f && favCat(f) === 'en-vocab') { location.hash = '#learn-en/vocab/w/' + encodeURIComponent(f.id); return; }
      runQuiz(app, { title: '我的最愛', questions: [Object.assign({}, f)], mode: 'practice', subjectTab: f.subjectTab || 'math', source: '我的最愛' });
    });
    $$('.fav-del', app).forEach((b) => b.onclick = async () => {
      const id = b.dataset.id, snap = settings.learnFavs[id];
      delete settings.learnFavs[id]; await saveSettings('learnFavs');
      viewFavs(app);
      if (typeof toastAction === 'function') toastAction('已取消收藏', '撤銷', async () => { settings.learnFavs[id] = snap; await saveSettings('learnFavs'); viewFavs(app); });
      else toast('已取消收藏');
    });
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
    if (typeof stopEnglishSpeak === 'function') stopEnglishSpeak();
  }

  async function runQuiz(app, {
    title, questions, mode = 'practice', subjectTab = 'ee', source = '刷題',
    durationSec = null, onDone, annotateZh = false, doneHref = '#learn', doneLabel = '回學習'
  }) {
    stopRunner();
    const qs = (questions || []).filter(Boolean);
    if (!qs.length) {
      app.innerHTML = `<section class="card"><h2>沒有題目</h2><p class="muted">換個篩選條件試試。</p><a class="btn btn-primary" href="${esc(doneHref)}">${esc(doneLabel)}</a></section>`;
      return;
    }
    const state = {
      title, qs, mode, subjectTab, source, annotateZh,
      index: 0,
      picked: {}, // id -> letter
      revealed: {}, // id -> bool
      startedAt: Date.now(),
      endsAt: durationSec ? Date.now() + durationSec * 1000 : null,
      finished: false,
      examLinks: null,
      formulas: null
    };
    _runner = state;
    try {
      const [examLinks, formulas] = await Promise.all([loadExamLinks(), loadFormulas()]);
      if (_runner !== state) return;
      state.examLinks = examLinks;
      state.formulas = formulas;
    } catch (_) {}

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
      if (typeof stopEnglishSpeak === 'function') stopEnglishSpeak();
      if (state.timer) clearInterval(state.timer);
      let correct = 0, graded = 0;
      state.qs.forEach((q) => {
        if (!q.answer) return;
        graded++;
        if (state.picked[q.id] === q.answer) correct++;
      });
      const seenIds = state.qs.filter((q) => q.id && state.picked[q.id]).map((q) => q.id);
      await recordPractice({ subject: subjectTab, correct, total: graded || state.qs.length, source, ids: seenIds });
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
            <a class="btn btn-soft" href="${esc(doneHref)}">${esc(doneLabel)}</a>
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
      if (reveal && state.examLinks) q._mathChipsHtml = mathChipsForQuestion(q, state.examLinks);
      else q._mathChipsHtml = '';
      if (reveal && state.formulas) q._formulaChipsHtml = formulaChipsForQuestion(q, state.formulas);
      else q._formulaChipsHtml = '';
      const left = state.endsAt ? (state.endsAt - Date.now()) / 1000 : null;
      q._fav = !!(settings.learnFavs || {})[q.id];
      q._learned = !!(settings && settings.learned && settings.learned[q.id]);
      q.lang = q.lang || (subjectTab === 'en' || subjectTab === 'english' ? 'en' : (subjectTab === 'zh' ? 'zh' : ''));
      app.innerHTML = renderMcShell({
        title: state.title,
        subtitle: state.mode === 'mock' ? '模擬考（交卷前不顯示答案）' : '練習模式',
        q, index: state.index, total: state.qs.length,
        mode: state.mode, reveal, picked: state.picked[q.id] || null,
        timedLeft: left
      });
      typesetMath(app);
      wireQTools(q, state);
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

  /* ---------- 學習科目列（上次停留記在 localStorage，不進 IndexedDB） ---------- */
  const LEARN_NAV = [
    ['zh', '國文', '#learn-zh/quiz'],
    ['en', '英文', '#learn-en'],
    ['ee', '電工原理', '#learn-ee/drill'],
    ['em', '電工機械', '#learn-em/drill'],
    ['math', '數學基礎', '#learn-math']
  ];
  const LEARN_SUBJECT_KEY = 'cpcLearnSubject';
  function rememberLearnSubject(id) {
    if (!LEARN_NAV.some(([k]) => k === id)) return;
    try { localStorage.setItem(LEARN_SUBJECT_KEY, id); } catch (_) {}
  }
  function lastLearnSubject() {
    try {
      const v = localStorage.getItem(LEARN_SUBJECT_KEY);
      if (LEARN_NAV.some(([k]) => k === v)) return v;
    } catch (_) {}
    return 'zh';
  }
  function learnSubjectHref(id) {
    const row = LEARN_NAV.find(([k]) => k === id);
    return row ? row[2] : LEARN_NAV[0][2];
  }
  function subjectChrome(active) {
    if (active) rememberLearnSubject(active);
    const hash = (location.hash || '').replace(/^#/, '');
    const bankOn = hash === 'learn-bank' || hash.startsWith('learn-bank/');
    const mockOn = hash === 'learn-mock' || hash.startsWith('learn-mock/');
    const tabs = LEARN_NAV.map(([id, name, href]) =>
      `<a href="${href}" role="tab" class="${id === active ? 'on' : ''}" aria-selected="${id === active}">${name}</a>`
    ).join('');
    return `<nav class="subject-tabs" role="tablist" aria-label="科目">${tabs}</nav>
      <p class="learn-extras"><a href="#learn-bank" class="${bankOn ? 'on' : ''}">全部題庫</a><a href="#learn-mock" class="${mockOn ? 'on' : ''}">綜合模擬考</a></p>`;
  }
  async function tipsSectionHtml() {
    const data = await loadTips();
    const cats = data.categories || [];
    const cards = cats.map((c) => `
      <a class="overview-tab learn-card" href="#learn-tips/${esc(c.id)}">
        <b>${esc(c.name)}</b>
        <span class="muted small">${(c.tips || []).length} 則</span>
      </a>`).join('');
    return `<section id="exam-tips" class="today-tips">
      <h2>備考技巧</h2>
      <p class="muted small">${esc(data.sourceNote || '讀書方法、大範圍練習、答卷關鍵與心態。')}</p>
      <div class="learn-subjects">${cards || '<p class="muted">尚無分類</p>'}</div>
    </section>`;
  }

  /* ---------- LEARN HUB（入口卡頁已拿掉，#learn 直接進上次的科目） ---------- */
  async function viewLearn() {
    location.replace(learnSubjectHref(lastLearnSubject()));
  }

  function proSeg(track, active) {
    const base = `#learn-${track}`;
    return `<div class="mode-seg" role="tablist" aria-label="${track === 'em' ? '電工機械' : '電工原理'}">
      <a href="${base}/concepts" class="${active === 'concepts' ? 'on' : ''}">觀念</a>
      <a href="${base}/drill" class="${active === 'drill' ? 'on' : ''}">刷題</a>
      <a href="${base}/formulas" class="${active === 'formulas' ? 'on' : ''}">公式庫</a>
      <a href="${base}/mock" class="${active === 'mock' ? 'on' : ''}">模擬考</a>
    </div>`;
  }

  async function viewPro(app, track, parts) {
    rememberLearnSubject(track);
    const name = track === 'em' ? '電工機械' : '電工原理';
    const sub = parts[0] || 'drill';
    $('#pageTitle').textContent = name;
    if (!parts[0] || sub === 'hub') {
      location.replace(`#learn-${track}/drill`);
      return;
    }
    if (sub === 'q' && parts[1]) return viewExamQuestion(app, track, parts[1]);
    if (sub === 'concepts') return viewProConcepts(app, track);
    if (sub === 'drill' || sub === 'quiz') return viewProDrill(app, track, parts.slice(1));
    if (sub === 'formulas') return viewFormulas(app, parts.slice(1), { track });
    if (sub === 'mock') {
      if (parts[1] === 'run') {
        const cfg = JSON.parse(sessionStorage.getItem('mockCfg') || '{}');
        return startMock(app, cfg);
      }
      return viewMock(app, [track], { track });
    }
    location.replace(`#learn-${track}/drill`);
  }

  async function viewProConcepts(app, track) {
    const concepts = await loadConcepts();
    const curated = concepts.curated.filter((c) => c.track === track);
    const fromBank = concepts.fromBank.filter((c) => c.track === track);
    app.innerHTML = `
      ${subjectChrome(track)}${proSeg(track, 'concepts')}
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


  async function viewExamQuestion(app, track, qid) {
    const bank = await loadBank();
    const links = await loadExamLinks();
    const q = (bank.questions || []).find((x) => x.id === qid);
    if (!q) {
      app.innerHTML = `<section class="card"><h2>找不到試題</h2><p class="muted small">${esc(qid)}</p>
        <a class="btn btn-primary" href="#learn-${track}/drill">回刷題</a></section>`;
      return;
    }
    const mapped = {
      id: q.id, stem: q.stem, choices: q.choices, answer: q.answer,
      explain: q.explain || (q.answer ? `歷屆答案：${q.answer}` : '題庫無答案'),
      hasFigure: q.hasFigure, figurePath: q.figurePath,
      label: `${q.year} #${q.qnum}・${q.track === 'em' ? '機械' : '原理'}`,
      answerConfidence: q.answerConfidence,
      mathUnits: (links.byQuestion || {})[q.id] || []
    };
    return runQuiz(app, {
      title: '歷屆單題',
      questions: [mapped],
      mode: 'practice',
      subjectTab: q.track === 'em' ? 'em' : 'ee',
      source: `歷屆 ${q.year}#${q.qnum}`
    });
  }

  async function viewProDrill(app, track, rest) {
    const bank = await loadBank();
    // if rest[0]==='run' → start with filters in sessionStorage
    if (rest[0] === 'run') {
      const cfg = JSON.parse(sessionStorage.getItem('drillCfg') || '{}');
      const links = await loadExamLinks();
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
          extension: false,
          mathUnits: (links.byQuestion || {})[q.id] || []
        })),
        mode: 'practice', subjectTab: scope === 'em' ? 'em' : 'ee', source: '專業刷題'
      });
    }

    const years = [...new Set(bank.questions.map((q) => q.year))].sort();
    const count = (pred) => bank.questions.filter(pred).length;
    app.innerHTML = `
      ${subjectChrome(track)}${proSeg(track, 'drill')}
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
  async function viewMock(app, parts, opts) {
    opts = opts || {};
    parts = parts || [];
    stopRunner();
    $('#pageTitle').textContent = opts.track === 'em' ? '電工機械' : opts.track === 'ee' ? '電工原理' : '綜合模擬考';
    const preset = opts.track || ((parts[0] && parts[0] !== 'run') ? parts[0] : '');
    if (!opts.track && parts[0] === 'run') {
      const cfg = JSON.parse(sessionStorage.getItem('mockCfg') || '{}');
      return startMock(app, cfg);
    }
    const bank = await loadBank();
    const zh = await loadZhQuiz();
    const en = await loadEnQuiz();
    const years = new Set();
    (bank.questions || []).forEach((q) => { if (q.year) years.add(q.year); });
    allExamQuestions(zh).forEach((q) => { if (q.year) years.add(q.year); });
    allExamQuestions(en).forEach((q) => { if (q.year) years.add(q.year); });
    const yearOpts = [...years].sort((a, b) => b - a).map((y) => `<option value="${y}">${y}</option>`).join('');
    const head = opts.track
      ? subjectChrome(opts.track) + proSeg(opts.track, 'mock')
      : (subjectChrome('') + (typeof pageHead === 'function'
        ? pageHead('離線模擬', '綜合模擬考', '交卷前不顯示答案。題目從這台裝置上的題庫抽，時間到會自動交卷。範圍可以混國文、英文和專業。')
        : '<h2>綜合模擬考</h2>'));
    app.innerHTML = `
      ${head}
      <div class="mock-wrap">
        <section class="card">
          <h3>建立考卷</h3>
          <label class="field"><span class="field-title">考卷範圍</span>
            <select id="mockScope">
              <option value="ee" ${preset === 'ee' ? 'selected' : ''}>電工原理</option>
              <option value="em" ${preset === 'em' ? 'selected' : ''}>電工機械</option>
              <option value="pro" ${preset === 'pro' ? 'selected' : ''}>專業混合（原理＋機械）</option>
              <option value="zh">國文（歷屆選擇＋常識自出）</option>
              <option value="en">英文</option>
              <option value="mixed">國英＋專業混合</option>
            </select>
          </label>
          <label class="field"><span class="field-title">年份</span>
            <select id="mockYear"><option value="all">全部年份</option>${yearOpts}</select>
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
          <button type="button" class="btn btn-primary" id="mockGo">建立考卷</button>
          <p class="muted small">題庫：專業 ${bank.meta?.total || 0}・國文 ${allExamQuestions(zh).length + (zh.fromKnowledge?.length || 0)}・英文 ${allExamQuestions(en).length}。指定年份時，沒有年份的常識題不會入卷。</p>
        </section>
      </div>`;
    $('#mockDur').onchange = () => { $('#mockCustomWrap').hidden = $('#mockDur').value !== 'custom'; };
    $('#mockGo').onclick = () => {
      let mins = parseInt($('#mockDur').value, 10);
      if ($('#mockDur').value === 'custom') mins = Math.max(1, Math.min(180, parseInt($('#mockCustom').value, 10) || 30));
      const cfg = { scope: $('#mockScope').value, minutes: mins, n: parseInt($('#mockN').value, 10) || 30, year: $('#mockYear').value };
      sessionStorage.setItem('mockCfg', JSON.stringify(cfg));
      location.hash = opts.track ? `#learn-${opts.track}/mock/run` : '#learn-mock/run';
    };
  }

  async function startMock(app, cfg) {
    const bank = await loadBank();
    const zh = await loadZhQuiz();
    const en = await loadEnQuiz();
    const examLinks = await loadExamLinks();
    const n = cfg.n || 30;
    let pool = [];
    const scope = cfg.scope || 'pro';
    const yearOk = (q) => !cfg.year || cfg.year === 'all' || String(q.year || '') === String(cfg.year);
    const mapPro = (q) => ({
      id: q.id, stem: q.stem, choices: q.choices, answer: q.answer,
      explain: q.explain || (q.answer ? `答案 ${q.answer}` : ''),
      hasFigure: q.hasFigure, figurePath: q.figurePath,
      label: `${q.year}#${q.qnum}`, answerConfidence: q.answerConfidence,
      mathUnits: (examLinks.byQuestion || {})[q.id] || []
    });
    const mapLang = (q, lang) => ({
      id: q.id, stem: q.stem, choices: q.choices, answer: q.answer,
      explain: q.explain || '', label: q.label || (q.year ? String(q.year) : '') || q.section || '', lang,
      hasFigure: false, figurePath: '',
      translation: q.translation || '', phrases: q.phrases || [], words: q.words || []
    });
    if (scope === 'ee') pool = bank.questions.filter((q) => q.track === 'ee' && q.answer && yearOk(q));
    else if (scope === 'em') pool = bank.questions.filter((q) => q.track === 'em' && q.answer && yearOk(q));
    else if (scope === 'pro') pool = bank.questions.filter((q) => q.answer && yearOk(q));
    else if (scope === 'zh') pool = [...allExamQuestions(zh), ...(zh.fromKnowledge || [])].filter(yearOk);
    else if (scope === 'en') pool = [...allExamQuestions(en)].filter(yearOk);
    else {
      pool = [
        ...bank.questions.filter((q) => q.answer && yearOk(q)).map(mapPro),
        ...allExamQuestions(zh).filter(yearOk).map((q) => mapLang(q, 'zh')),
        ...allExamQuestions(en).filter(yearOk).map((q) => mapLang(q, 'en'))
      ];
      if (!pool.length) {
        app.innerHTML = `<section class="card"><h2>這個範圍沒有題</h2><p class="muted">換一個年份或範圍再建立。</p><a class="btn btn-primary" href="#learn-mock">回模擬考</a></section>`;
        return;
      }
      const qs = shuffle(pool).slice(0, n);
      return runQuiz(app, {
        title: '混合模擬考', questions: qs, mode: 'mock',
        subjectTab: 'ee', source: '模擬考', durationSec: (cfg.minutes || 40) * 60
      });
    }
    if (!pool.length) {
      app.innerHTML = `<section class="card"><h2>這個範圍沒有題</h2><p class="muted">換一個年份或範圍再建立。</p><a class="btn btn-primary" href="#learn-mock">回模擬考</a></section>`;
      return;
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
    const paint = () => {
      const picked = pickedYears('zh', data);
      const pool = questionsForYears(data, picked);
      const yearsLabel = picked.join('、');
      const kbN = (data.fromKnowledge || []).length;
      app.innerHTML = `
        ${subjectChrome('zh')}${typeof zhSeg === 'function' ? zhSeg('quiz') : ''}
        <section class="card learn-shell">
          <h2>國文刷題</h2>
          <p>有題的年份可複選，題池是所選年份的聯集。常識表出題不依年份；混合＝選取年份＋常識。</p>
          ${yearChipsHtml(data, picked)}
          <p class="muted small">已選 ${esc(yearsLabel)}・選擇 ${pool.length} 題・常識自出 ${kbN} 題・全部選擇 ${allExamQuestions(data).length} 題。選完或按詳解才顯示講解。</p>
          <div class="btn-row" style="margin-top:12px;flex-wrap:wrap">
            <button type="button" class="btn btn-primary" id="zhYears">練習選取年份（${pool.length}）</button>
            <button type="button" class="btn btn-soft" id="zhAuto">常識表出題（${kbN}）</button>
            <button type="button" class="btn btn-soft" id="zhMix">混合</button>
            <a class="btn btn-soft" href="#learn-mock">計時模擬考</a>
          </div>
        </section>`;
      wireYearChips(app, 'zh', data, paint);
      const go = (list, title) => runQuiz(app, {
        title, questions: shuffle(list).map((q) => ({
          ...q, lang: 'zh', label: q.label || (q.year ? `${q.year} 國文` : '國文'),
          hasFigure: false
        })),
        mode: 'practice', subjectTab: 'zh', source: title
      });
      $('#zhYears').onclick = () => go(pool, `國文 ${yearsLabel}`);
      $('#zhAuto').onclick = () => go(data.fromKnowledge || [], '常識表出題');
      $('#zhMix').onclick = () => go([...pool, ...(data.fromKnowledge || [])], '國文混合');
    };
    paint();
  }

  /* ---------- EN ---------- */
  const EN_SEC = { vocab: '字彙', grammar: '文法', dialogue: '會話', cloze: '克漏字', reading: '閱讀' };
  function mapEnQuestion(q) {
    return {
      ...q,
      lang: 'en',
      label: EN_SEC[q.section] || q.label || q.section || (q.year ? String(q.year) : '英文')
    };
  }
  async function viewEn(app, parts) {
    rememberLearnSubject('en');
    const data = await loadEnQuiz();
    if (parts[0] === 'vocab') return viewVocab(app, parts.slice(1));
    if (parts[0] === 'roots') return viewVocabRoots(app, parts.slice(1));
    $('#pageTitle').textContent = '英文';
    if (parts[0] === 'recall') return viewEnRecall(app, data);
    if (parts[0] === 'quiz') {
      const sec = parts[1] || 'all';
      let list = allExamQuestions(data);
      if (sec !== 'all') list = list.filter((q) => q.section === sec);
      return runQuiz(app, {
        title: '英文練習', questions: shuffle(list).map(mapEnQuestion),
        mode: 'practice', subjectTab: 'en', source: '英文刷題'
      });
    }
    const links = (settings.learnLinks || []).filter((l) => l.subject === 'en' && l.url);
    const paint = () => {
      const picked = pickedYears('en', data);
      const pool = questionsForYears(data, picked);
      const yearsLabel = picked.join('、');
      const secBtns = [['all', '全部練習'], ['vocab', '字彙'], ['grammar', '文法'], ['dialogue', '會話'], ['cloze', '克漏字'], ['reading', '閱讀']].map(([sec, name]) => {
        const n = sec === 'all' ? pool.length : pool.filter((q) => q.section === sec).length;
        if (sec !== 'all' && !n) return '';
        return `<button type="button" class="btn ${sec === 'all' ? 'btn-primary' : 'btn-soft'}" data-sec="${sec}">${name}（${n}）</button>`;
      }).join('');
      app.innerHTML = `
        ${subjectChrome('en')}${enSeg('practice')}
        <section class="card learn-shell">
          <h2>英文</h2>
          <p>有題的年份可複選，下方練習用所選年份的聯集。點單字、片語或整句可發音（en-US）。語速分慢／正常／快，會記在這台裝置。</p>
          ${enSpeedHtml()}
          ${yearChipsHtml(data, picked)}
          <p class="muted small">已選 ${esc(yearsLabel)}・${pool.length} 題。詳解含整句中譯，片語與單字分開。</p>
          <div class="btn-row" style="margin-top:12px;flex-wrap:wrap">
            ${secBtns}
            <a class="btn btn-soft" href="#learn-en/recall">遮答案回想卡</a>
            <a class="btn btn-soft" href="#learn-mock">計時模擬考</a>
          </div>
        </section>
        <section class="card soft-card">
          <h3>使用提示</h3>
          <p class="muted small">練習模式選完即對錯；模擬考請走「計時模擬考 → 英文」（用全部已入庫年份）。答錯可加入錯題本（語文類原因）。</p>
        </section>
        ${links.length ? `<section class="card soft-card"><h3>學習連結</h3><ul class="link-list">${links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a></li>`).join('')}</ul></section>` : ''}`;
      wireEnSpeak(app);
      wireYearChips(app, 'en', data, paint);
      $$('[data-sec]', app).forEach((b) => {
        b.onclick = () => {
          const sec = b.dataset.sec || 'all';
          let list = questionsForYears(data, pickedYears('en', data));
          if (sec !== 'all') list = list.filter((q) => q.section === sec);
          runQuiz(app, {
            title: '英文練習', questions: shuffle(list).map(mapEnQuestion),
            mode: 'practice', subjectTab: 'en', source: '英文刷題'
          });
        };
      });
    };
    paint();
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
        ${subjectChrome('en')}${enSeg('practice')}
        <section class="card learn-shell">
          <div class="bar-label"><h2>遮答案回想卡</h2><span class="tag">${i + 1}/${cards.length}</span></div>
          <p class="muted small">${esc(c.promptZh || '先自己想，再翻開。')}</p>
          ${enSpeedHtml()}
        </section>
        <section class="card q-card">
          <div class="q-stem">${enWordSpans(blanked)}</div>
          <div class="btn-row" style="margin:10px 0;flex-wrap:wrap">
            <button type="button" class="btn btn-soft" data-en-sentence="${esc(c.sentence)}">🔊 整句</button>
            <button type="button" class="btn btn-primary" id="btnFlip">${shown ? '隱藏答案' : '顯示答案'}</button>
          </div>
          ${shown ? `<div class="q-explain card soft-card"><b>${esc(c.answerWord || c.answer)}</b>
            ${(c.translation || (c.phrases && c.phrases.length) || (c.words && c.words.length)) ? renderEnGloss(c) : formatExplainBody(c.explain || '', { speakEn: true })}
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
  function mathSeg(active) {
    return `<div class="mode-seg" role="tablist" aria-label="數學基礎">
      <a href="#learn-math" class="${active === 'units' ? 'on' : ''}">單元</a>
      <a href="#learn-math/examples" class="${active === 'examples' ? 'on' : ''}">例題</a>
    </div>`;
  }
  function mathChrome(active) {
    rememberLearnSubject('math');
    return subjectChrome('math') + mathSeg(active);
  }
  async function viewMathExamples(app, data) {
    $('#pageTitle').textContent = '數學基礎';
    const examLinks = await loadExamLinks();
    const blocks = (data.units || []).map((u) => {
      const chips = examChipsForUnit(u.id, examLinks);
      const items = (u.examples || []).map((ex) => `<li><a href="#learn-math/${esc(u.id)}">${esc(ex.title || '例題')}</a>${ex.level === '變' ? ' <span class="tag">變題</span>' : ''}</li>`).join('');
      return `<section class="card">
        <h3>${esc(u.name)}</h3>
        <p class="muted small">完整步驟和練習在單元裡。下面是例題目錄，以及這一單元對上的歷屆題。</p>
        ${items ? `<ul class="path-list">${items}</ul>` : '<p class="muted">這一單元沒有例題。</p>'}
        ${chips}
        <a class="btn btn-soft" href="#learn-math/${esc(u.id)}">打開單元</a>
      </section>`;
    }).join('');
    app.innerHTML = `${mathChrome('examples')}
      <section class="card learn-shell">
        <h2>例題</h2>
        <p>各單元的例題集中在這裡。點標題或「打開單元」看步驟、練習，以及和歷屆題的連結。</p>
      </section>
      ${blocks || '<p class="muted">尚無例題。</p>'}`;
    typesetMath(app);
  }
  async function viewMath(app, parts) {
    rememberLearnSubject('math');
    const data = await loadMath();
    const unitId = parts[0];
    if (unitId === 'examples') return viewMathExamples(app, data);
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
      ${mathChrome('units')}
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
    const t = repairTexRowBreaks(String(tex ?? '').trim());
    if (!t) return '';
    if (t.startsWith('$$') || t.startsWith('\\[')) return formatRichText(t);
    return formatRichText('$$' + t + '$$');
  }
  /**
   * 詳解裡連續的英文單字／片語做成可點發音。選項代號與對話人物（單獨的 A–D）保持純文字。
   * 只包住英文，中文與標點留在外面，所以行距和換行跟原文一樣。
   */
  function annotateExplainEnglish(text) {
    const s = String(text ?? '');
    if (!s) return '';
    const re = /[A-Za-z]+(?:['’-][A-Za-z]+)*(?:(?: +|, +)[A-Za-z]+(?:['’-][A-Za-z]+)*)*/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(s))) {
      if (m.index > last) out += esc(s.slice(last, m.index));
      const phrase = m[0];
      if (/^[A-D]$/.test(phrase)) out += esc(phrase);
      else out += `<button type="button" class="en-gloss" data-speak="${esc(phrase)}">${esc(phrase)}</button>`;
      last = m.index + phrase.length;
    }
    if (last < s.length) out += esc(s.slice(last));
    return out;
  }
  /**
   * 「題幹所問的正解是 X「…」。此項「…」並非該正解，對照上方說明即可排除。」
   * 沒有該選項自己的字詞或錯因，整列拿掉。某一題的其他選項全是這句時，連【其他選項】一起不顯示。
   * 有個別解析的選項留著。
   */
  function stripGenericOptionBoilerplate(text) {
    const raw = String(text ?? '');
    if (!raw || raw.indexOf('題幹所問的正解是') < 0) return raw;
    const boiler = /^題幹所問的正解是\s*[A-D]「.*」。此項「.*」並非該正解，對照上方說明即可排除。?\s*$/;
    const optRe = /^([A-D])[.．、]\s*(.*)$/;
    const noise = (s) => !s || s === '・' || s === '·' || s === '•';
    const keepLine = (ln) => {
      const s = String(ln).trim();
      return !noise(s) && !boiler.test(s);
    };
    const cleanSection = (section) => {
      const blocks = [];
      let cur = null;
      const pre = [];
      String(section).split('\n').forEach((ln) => {
        const m = ln.trim().match(optRe);
        if (m) {
          if (cur) blocks.push(cur);
          cur = { header: ln.replace(/\s+$/, ''), body: [] };
        } else if (!cur) {
          if (ln.trim()) pre.push(ln.replace(/\s+$/, ''));
        } else {
          cur.body.push(ln.replace(/\s+$/, ''));
        }
      });
      if (cur) blocks.push(cur);
      const keptPre = pre.filter(keepLine);
      const kept = [];
      blocks.forEach((b) => {
        const body = b.body.filter(keepLine);
        if (body.length) kept.push({ header: b.header.trim(), body });
      });
      return { keptPre, kept };
    };
    const dropBoilerLines = (chunk) => chunk.split('\n').filter((ln) => !boiler.test(ln.trim())).join('\n').replace(/\s+$/, '');
    if (raw.indexOf('【其他選項】') < 0) return dropBoilerLines(raw).trim();
    const parts = raw.split('【其他選項】');
    const head = dropBoilerLines(parts[0]);
    const blocks = [];
    parts.slice(1).forEach((sec) => {
      const { keptPre, kept } = cleanSection(sec);
      if (!kept.length && !keptPre.length) return;
      const lines = ['【其他選項】'].concat(keptPre);
      kept.forEach((b) => {
        lines.push(b.header);
        b.body.forEach((ln) => lines.push(ln));
      });
      blocks.push(lines.join('\n'));
    });
    return [head].concat(blocks).filter(Boolean).join('\n').trim();
  }
  function formatExplainBody(text, opts) {
    const speakEn = !!(opts && opts.speakEn);
    const raw = stripGenericOptionBoilerplate(text);
    if (!raw) return '';
    const lineHtml = (line) => (hasMathDelims(line) ? formatRichText(line) : (speakEn ? annotateExplainEnglish(line) : esc(line)));
    const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      return `<p class="explain-line">${lineHtml(raw.trim() || raw)}</p>`;
    }
    return lines.map((line) => {
      const cls = /^最終答案/.test(line) ? 'explain-line explain-answer' : 'explain-line';
      return `<p class="${cls}">${lineHtml(line)}</p>`;
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
        <b class="math-ex-title">${esc(ex.title || '例題')}${ex.level === '變' ? ' <span class="tag">變題</span>' : ''}</b>
        <div class="math-worked">
          <p class="math-intro">${esc(intro)}</p>
          <p class="math-given-label">${esc(givenLabel)}</p>
          <div class="math-block math-given">${displayMath(ex.given || '')}</div>
          ${ex.hasFigure && ex.figurePath ? `<figure class="math-fig"><img src="${esc(figSrc(ex.figurePath))}" alt="例題附圖" loading="lazy"></figure>` : ''}
          <h4 class="math-steps-h">求解步驟</h4>
          <ol class="math-steps">${stepsHtml}</ol>
          <h4 class="math-answer-h">最終答案</h4>
          <div class="math-block math-final">${displayMath(ex.answer || '')}</div>
          ${sourceTagHtml(ex)}
        </div>
      </div>`;
    }
    // Backward compatible: plain body string
    return `<div class="math-ex"><b class="math-ex-title">${esc(ex.title || '例題')}${ex.level === '變' ? ' <span class="tag">變題</span>' : ''}</b><div class="math-block">${formatRichText(ex.body || '')}</div>${sourceTagHtml(ex)}</div>`;
  }
  async function viewMathUnit(app, unit) {
    $('#pageTitle').textContent = unit.name;
    const links = (settings.learnLinks || []).filter((l) => l.subject === 'math' && (!l.unit || l.unit === unit.name || (unit.id === 'frac' && /分數/.test(l.unit)) || (unit.id === 'linear1' && /一元/.test(l.unit)) || (unit.id === 'linear2' && /二元/.test(l.unit)) || (unit.id === 'signed' && /正負/.test(l.unit))));
    const examLinks = await loadExamLinks();
    const examChipBlock = examChipsForUnit(unit.id, examLinks);
    const varN = (unit.practice || []).filter((p) => p.level === '變' || /^【變題/.test(p.stem || '')).length;
    app.innerHTML = `
      ${mathChrome('units')}
      <section class="card learn-shell">
        <h2>${esc(unit.name)}</h2>
        <p class="math-inline">${formatRichText(unit.blurb || '')}</p>
        <div class="math-explain"><b>精簡說明</b><p class="math-inline">${formatRichText(unit.explain || '')}</p></div>
        ${examChipBlock}
      </section>
      <section class="card soft-card"><h3>例題</h3>
        <p class="muted small">含原題／習題改編與「變題」（同技巧換數字）。</p>
        ${(unit.examples || []).map((ex) => renderMathExample(ex)).join('') || '<p class="muted">無</p>'}
      </section>
      <section class="card soft-card">
        <h3>練習題</h3>
        <p class="muted small">選完才顯示詳解。含 ${varN} 道變題。公式以 LaTeX（KaTeX）顯示，離線可用。</p>
        ${examChipBlock}
        <button type="button" class="btn btn-primary" id="mathPractice">開始練習（${(unit.practice || []).length} 題）</button>
      </section>
      ${links.length ? `<section class="card soft-card"><h3>搞不懂再點</h3><ul class="link-list">${links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a></li>`).join('')}</ul></section>` : ''}
      <div class="btn-row"><a class="btn btn-soft" href="#learn-math">回數學單元</a></div>`;
    typesetMath(app);
    $('#mathPractice').onclick = () => runQuiz(app, {
      title: unit.name,
      questions: (unit.practice || []).map((p, i) => ({
        id: `math-${unit.id}-${i}`, stem: p.stem, choices: p.choices, answer: p.answer,
        explain: p.explain || '', label: '數學練習',
        figurePath: p.figurePath || '', hasFigure: !!p.hasFigure,
        source: p.source || '', sourceNote: p.sourceNote || ''
      })),
      mode: 'practice', subjectTab: 'math', source: '數學・' + unit.name
    });
  }


  /* ---------- TIPS (備考技巧) ---------- */
  async function viewTips(app, parts) {
    const data = await loadTips();
    const catId = parts[0];
    if (catId) {
      const cat = (data.categories || []).find((c) => c.id === catId);
      if (!cat) {
        app.innerHTML = `<section class="card"><h2>找不到分類</h2><a class="btn btn-primary" href="#learn-tips">回備考技巧</a></section>`;
        return;
      }
      $('#pageTitle').textContent = cat.name;
      app.innerHTML = `
        <section class="card learn-shell">
          <h2>${esc(cat.name)}</h2>
          <p class="muted small">${esc(data.sourceNote || '')}</p>
        </section>
        ${(cat.tips || []).map((tip) => `
          <section class="card soft-card tip-card">
            <h3>${formatRichText(tip.title || '')}</h3>
            <div class="tip-body">${formatExplainBody(tip.body || '')}</div>
            ${(tip.tags || []).length ? `<p class="muted small">${(tip.tags || []).map((tg) => `<span class="tag">${esc(tg)}</span>`).join(' ')}</p>` : ''}
            ${sourceTagHtml(tip)}
          </section>`).join('') || '<p class="muted">尚無內容</p>'}
        <div class="btn-row"><a class="btn btn-soft" href="#tips">回備考技巧</a><a class="btn btn-soft" href="#learn">回學習</a></div>`;
      typesetMath(app);
      return;
    }
    $('#pageTitle').textContent = '備考技巧';
    const cats = data.categories || [];
    app.innerHTML = `
      <section class="card learn-shell">
        <h2>備考技巧</h2>
        <p>讀書方法、大範圍練習、答卷關鍵、數學基礎與心態——整理成可執行的短卡。</p>
        <p class="muted small">${esc(data.sourceNote || '整理自靜心電學教室公開備考文，僅摘要')}</p>
      </section>
      <div class="learn-subjects">
        ${cats.map((c) => `
          <a class="overview-tab learn-card" href="#learn-tips/${esc(c.id)}">
            <b>${esc(c.name)}</b>
            <span class="muted small">${(c.tips || []).length} 則</span>
            <span class="tag tag-ok">可用</span>
          </a>`).join('') || '<p class="muted">尚無分類</p>'}
      </div>
      <div class="btn-row" style="margin-top:12px"><a class="btn btn-soft" href="#learn">回學習</a></div>`;
    typesetMath(app);
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
    tips.push({ href: '#learn-tips', text: '備考技巧幾則' });
    tips.push({ href: '#learn-mock', text: '計時模擬考一段' });
    const weak = Object.entries(st.bySubject || {}).sort((a, b) => (a[1].correct / (a[1].total || 1)) - (b[1].correct / (b[1].total || 1)))[0];
    if (weak && weak[1].total >= 5) {
      const map = { ee: '#learn-ee', em: '#learn-em', en: '#learn-en', zh: '#learn-zh', english: '#learn-en', math: '#learn-math' };
      const names = { ee: '電工原理', em: '電工機械', en: '英文', english: '英文', zh: '國文', math: '數學基礎' };
      tips.unshift({ href: map[weak[0]] || '#learn', text: `弱科加強：${names[weak[0]] || weak[0]}（正確率 ${accuracyOf(st, weak[0])}%）` });
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

  const ZH_TYPE = { phonetic: '字音', match: '常識配對', mc: '選擇題' };
  const bankState = { year: 'all', subject: 'all', type: 'all', limit: 50 };
  let _catalog;

  async function questionCatalog() {
    if (_catalog) return _catalog;
    const bank = await loadBank();
    const zh = await loadZhQuiz();
    const en = await loadEnQuiz();
    const math = await loadMath();
    const items = [];
    (bank.questions || []).forEach((q) => {
      const em = q.track === 'em';
      items.push({
        id: q.id, year: q.year || '', subject: em ? 'em' : 'ee',
        subjectName: em ? '電工機械' : '電工原理',
        type: q.kind === 'concept' ? '觀念' : '計算／刷題',
        typeKey: q.kind === 'concept' ? 'concept' : 'drill',
        stem: q.stem || '', figure: q.hasFigure ? (q.figurePath || '') : '',
        hasFigure: !!q.hasFigure, source: 'pro', raw: q
      });
    });
    allExamQuestions(zh).forEach((q) => {
      items.push({
        id: q.id, year: q.year || '', subject: 'zh', subjectName: '國文',
        type: '選擇題', typeKey: 'zh-mc',
        stem: q.stem || '', figure: '', hasFigure: false, source: 'zh', raw: q
      });
    });
    (zh.fromKnowledge || []).forEach((q) => {
      const key = q.kind || 'kb';
      items.push({
        id: q.id, year: '', subject: 'zh', subjectName: '國文',
        type: ZH_TYPE[key] || q.label || '常識', typeKey: 'zh-' + key,
        stem: q.stem || '', figure: '', hasFigure: false, source: 'zh-kb', raw: q
      });
    });
    allExamQuestions(en).forEach((q) => {
      const sec = EN_SEC[q.section] || q.section || '英文';
      items.push({
        id: q.id, year: q.year || '', subject: 'en', subjectName: '英文',
        type: sec, typeKey: 'en-' + (q.section || 'all'),
        stem: q.stem || '', figure: '', hasFigure: false, source: 'en', raw: q
      });
    });
    (math.units || []).forEach((unit) => {
      (unit.practice || []).forEach((p, i) => {
        items.push({
          id: `math-${unit.id}-${i}`, year: '', subject: 'math', subjectName: '數學基礎',
          type: '數學練習', typeKey: 'math', chapter: unit.name, chapterKey: 'math-' + unit.id,
          stem: p.stem || '', figure: p.hasFigure ? (p.figurePath || '') : '',
          hasFigure: !!p.hasFigure, source: 'math', raw: p
        });
      });
    });
    _catalog = items;
    return items;
  }

  async function bankSummary() {
    const items = await questionCatalog();
    const by = { ee: 0, em: 0, en: 0, zh: 0, math: 0 };
    const ids = { ee: new Set(), em: new Set(), en: new Set(), zh: new Set(), math: new Set() };
    items.forEach((it) => {
      if (!by[it.subject] && by[it.subject] !== 0) return;
      by[it.subject] += 1;
      ids[it.subject].add(it.id);
    });
    const core = by.ee + by.em + by.en + by.zh;
    return { by, ids, total: items.length, core };
  }

  function countSeen(st, mistakes, idSet) {
    const got = new Set();
    if (!idSet || !idSet.size) return 0;
    const seen = (st && st.seen) || {};
    Object.keys(seen).forEach((k) => (seen[k] || []).forEach((id) => { if (idSet.has(id)) got.add(id); }));
    (mistakes || []).forEach((m) => { if (m.learnId && idSet.has(m.learnId)) got.add(m.learnId); });
    return got.size;
  }

  function practicedToday(st, keys, day) {
    const set = new Set(keys || []);
    let n = 0;
    (st && st.history || []).forEach((h) => {
      if (!set.has(h.subject) || !h.at) return;
      let d = '';
      try { d = (typeof dateStr === 'function') ? dateStr(new Date(h.at)) : ''; } catch (_) { d = ''; }
      if (d !== day) return;
      n += Number(h.total) || 0;
    });
    return n;
  }

  async function pathSnapshot() {
    const sug = await todaySuggestions();
    const math = await loadMath();
    const tips = await loadTips();
    const st = sug.st || { bySubject: {}, history: [] };
    const method = ((tips.categories || []).find((c) => c.id === 'method') || {}).tips || [];
    return {
      tips: sug.tips, dueN: sug.dueN, goal: sug.goal, st,
      units: math.units || [],
      methodTip: method[0] || null,
      mathTotal: (st.bySubject.math && st.bySubject.math.total) || 0
    };
  }

  function catalogTag(item) {
    if (item.year) return `${item.year} 年`;
    if (item.source === 'zh-kb') return '常識';
    if (item.subject === 'math') return '練習';
    return '題庫';
  }

  async function runCatalogQuiz(app, item) {
    if (item.source === 'pro') return viewExamQuestion(app, item.subject === 'em' ? 'em' : 'ee', item.id);
    const q = item.raw || {};
    if (item.source === 'math') {
      return runQuiz(app, {
        title: item.type,
        questions: [{
          id: item.id, stem: q.stem, choices: q.choices, answer: q.answer,
          explain: q.explain || '', label: item.type,
          figurePath: q.figurePath || '', hasFigure: !!q.hasFigure
        }],
        mode: 'practice', subjectTab: 'math', source: '題庫・' + item.type
      });
    }
    if (item.subject === 'en') {
      return runQuiz(app, {
        title: '英文', questions: [mapEnQuestion(q)],
        mode: 'practice', subjectTab: 'en', source: '題庫・英文'
      });
    }
    return runQuiz(app, {
      title: '國文',
      questions: [{ ...q, lang: 'zh', label: item.type, hasFigure: false }],
      mode: 'practice', subjectTab: 'zh', source: '題庫・國文'
    });
  }

  async function viewBank(app, parts) {
    const items = await questionCatalog();
    if (parts[0] === 'q' && parts[1]) {
      const item = items.find((x) => x.id === parts[1]);
      if (!item) {
        app.innerHTML = `<section class="card"><h2>找不到這題</h2><a class="btn btn-primary" href="#learn-bank">回題庫</a></section>`;
        return;
      }
      $('#pageTitle').textContent = '作答';
      return runCatalogQuiz(app, item);
    }
    const paint = () => {
      const yearOk = (it) => bankState.year === 'all' || String(it.year || '') === String(bankState.year);
      const subOk = (it) => bankState.subject === 'all' || it.subject === bankState.subject;
      const base = items.filter((it) => yearOk(it) && subOk(it));
      const byChapter = bankState.subject === 'math';
      const typeKeyOf = (it) => byChapter ? (it.chapterKey || it.typeKey) : it.typeKey;
      const typeNameOf = (it) => byChapter ? (it.chapter || it.type) : it.type;
      const types = [];
      const seenType = new Set();
      base.forEach((it) => {
        const key = typeKeyOf(it);
        if (seenType.has(key)) return;
        seenType.add(key);
        types.push({ key, name: typeNameOf(it) });
      });
      if (bankState.type !== 'all' && !seenType.has(bankState.type)) bankState.type = 'all';
      const matched = bankState.type === 'all' ? base : base.filter((it) => typeKeyOf(it) === bankState.type);
      const shown = matched.slice(0, bankState.limit);
      const years = [...new Set(items.map((it) => it.year).filter(Boolean))].sort((a, b) => b - a);
      const head = typeof pageHead === 'function'
        ? pageHead('學習題庫', '全部題庫', '先縮小年份、科目或類型，再從一題開始作答。難度沒有標，所以這裡不篩難度。')
        : '<h2>全部題庫</h2>';
      app.innerHTML = `
        ${subjectChrome('')}
        ${head}
        <section class="card">
          <div class="filter-bar">
            <label class="field"><span class="field-title">年份</span>
              <select id="bankYear"><option value="all">全部</option>${years.map((y) => `<option value="${y}" ${String(bankState.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select>
            </label>
            <label class="field"><span class="field-title">科目</span>
              <select id="bankSubject">
                ${[['all', '全部'], ['ee', '電工原理'], ['em', '電工機械'], ['zh', '國文'], ['en', '英文'], ['math', '數學基礎']].map(([v, n]) => `<option value="${v}" ${bankState.subject === v ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </label>
            <label class="field"><span class="field-title">類型</span>
              <select id="bankType"><option value="all">全部</option>${types.map((it) => `<option value="${esc(it.key)}" ${bankState.type === it.key ? 'selected' : ''}>${esc(it.name)}</option>`).join('')}</select>
            </label>
            <button type="button" class="btn btn-soft" id="bankClear">清除篩選</button>
          </div>
        </section>
        <p class="bank-meta muted small">共 ${matched.length} 題符合條件，目前顯示前 ${shown.length} 題</p>
        <div class="bank-list">
          ${shown.map((it) => {
            const learnedOn = !!(settings && settings.learned && settings.learned[it.id]);
            return `<article class="card bank-q${learnedOn ? ' is-learned' : ''}">
            <div class="bank-q-main">
              <div class="subj-kicker"><span class="tag">${esc(catalogTag(it))}</span><span>${esc(it.subjectName)}／${esc(it.chapter || it.type)}</span></div>
              <div class="bank-stem">${formatRichText(it.stem || '')}</div>
              ${it.hasFigure && it.figure ? `<figure class="bank-fig"><img src="${esc(figSrc(it.figure))}" alt="題目附圖" loading="lazy"></figure>` : ''}
            </div>
            <div class="bank-q-side">
              ${learnedLabel(learnedOn, it.id)}
              <a class="btn btn-primary bank-start" href="#learn-bank/q/${encodeURIComponent(it.id)}">開始作答</a>
            </div>
          </article>`;
          }).join('') || '<section class="card"><p class="muted">沒有符合的題目。</p></section>'}
        </div>
        ${matched.length > shown.length ? `<button type="button" class="btn btn-soft" id="bankMore">再顯示 50 題</button>` : ''}`;
      typesetMath(app);
      $$('.bank-learned', app).forEach((input) => {
        input.addEventListener('change', async () => {
          const id = input.dataset.id;
          const it = items.find((x) => x.id === id);
          const label = input.closest('.q-learned');
          const card = input.closest('.bank-q');
          if (!it || !id) { input.checked = false; return; }
          const on = input.checked;
          const prev = await commitLearned(id, learnedSnapshotFromItem(it), on);
          if (label) label.classList.toggle('on', on);
          if (card) card.classList.toggle('is-learned', on);
          if (on) toast('已記成已學會');
          else if (prev && typeof toastAction === 'function') {
            toastAction('已從已學會移出', '復原', async () => {
              await commitLearned(id, prev, true);
              input.checked = true;
              if (label) label.classList.add('on');
              if (card) card.classList.add('is-learned');
              toast('已恢復已學會');
            });
          } else toast('已從已學會移出');
        });
      });
      const rerun = (reset) => { if (reset) bankState.limit = 50; paint(); };
      $('#bankYear').onchange = () => { bankState.year = $('#bankYear').value; rerun(true); };
      $('#bankSubject').onchange = () => { bankState.subject = $('#bankSubject').value; bankState.type = 'all'; rerun(true); };
      $('#bankType').onchange = () => { bankState.type = $('#bankType').value; rerun(true); };
      $('#bankClear').onclick = () => { bankState.year = 'all'; bankState.subject = 'all'; bankState.type = 'all'; rerun(true); };
      const more = $('#bankMore');
      if (more) more.onclick = () => { bankState.limit += 50; paint(); };
    };
    paint();
  }

  async function viewFormulaDetail(app, formula, bank, examLinks, base, track) {
    $('#pageTitle').textContent = formula.name || '公式';
    const byId = new Map();
    (bank.questions || []).forEach((q) => { if (q && q.id && !byId.has(q.id)) byId.set(q.id, q); });
    const related = (formula.questionIds || []).map((id) => byId.get(id)).filter(Boolean);
    related.sort((a, b) => (b.year - a.year) || ((a.qnum || 0) - (b.qnum || 0)));
    const names = (examLinks.meta && examLinks.meta.unitNames) || {};
    const unitChips = (formula.mathUnitIds || []).map((uid) => {
      const name = names[uid] || uid;
      return `<a class="chip chip-math" href="#learn-math/${esc(uid)}">對應數學單元：${esc(name)}</a>`;
    }).join('');
    const origin = formula.origin || '歷屆';
    const seg = track ? subjectChrome(track) + proSeg(track, 'formulas') : subjectChrome('');
    const back = base || (formula.subject === 'em' ? '#learn-em/formulas' : '#learn-ee/formulas');
    app.innerHTML = `
      ${seg}
      <section class="card formula-card">
        <div class="formula-tags">
          <span class="tag">${esc(formulaSubjectName(formula.subject))}</span>
          <span class="tag tag-exam">${esc(origin)}</span>
        </div>
        <h2>${esc(formula.name || '')}</h2>
        <div class="formula-eq">${formula.tex ? displayMath(formula.tex) : ''}</div>
        <p>${esc(formula.plain || formula.blurb || '')}</p>
        ${unitChips ? `<div class="link-chips muted small"><span>數學基礎：</span>${unitChips}</div>` : ''}
        <div class="btn-row" style="margin-top:12px"><a class="btn btn-soft" href="${back}">回公式庫</a></div>
      </section>
      <section class="card">
        <h3>相關歷屆</h3>
        <p class="muted small">點一題就進原題作答，詳解旁可再連回這條公式。</p>
        <div class="formula-related">
          ${related.map((q) => `<a class="formula-q" href="${examQuestionHref(q)}">
            <b>${esc(String(q.year || ''))} 年 #${esc(String(q.qnum || ''))}　${esc(q.track === 'em' ? '電工機械' : '電工原理')}</b>
            <span class="small">${esc(stemSummary(q.stem))}</span>
          </a>`).join('') || '<p class="muted">這條公式還沒有對上的歷屆題。</p>'}
        </div>
      </section>`;
    typesetMath(app);
  }

  async function viewFormulas(app, parts, opts) {
    opts = opts || {};
    const data = await loadFormulas();
    const formulas = data.formulas || [];
    const fid = parts && parts[0];
    if (!opts.track) {
      if (!fid) { location.replace('#learn-ee/formulas'); return; }
      const known = (data.byId || {})[fid];
      const dest = known && known.subject === 'em' ? 'em' : 'ee';
      location.replace(`#learn-${dest}/formulas/${encodeURIComponent(fid)}`);
      return;
    }
    const track = opts.track === 'em' ? 'em' : 'ee';
    const base = `#learn-${track}/formulas`;
    if (fid) {
      const formula = (data.byId || {})[fid];
      if (!formula) {
        $('#pageTitle').textContent = '公式庫';
        app.innerHTML = `${subjectChrome(track)}${proSeg(track, 'formulas')}<section class="card"><h2>找不到這條公式</h2><a class="btn btn-primary" href="${base}">回公式庫</a></section>`;
        return;
      }
      const [bank, examLinks] = await Promise.all([loadBank(), loadExamLinks()]);
      return viewFormulaDetail(app, formula, bank, examLinks, base, track);
    }
    const state = { subject: track, q: '' };
    const paint = () => {
      const q = state.q.trim().toLowerCase();
      const shown = formulas.filter((f) => {
        if (state.subject !== 'all' && f.subject !== state.subject) return false;
        if (!q) return true;
        const blob = [f.name, f.blurb, f.plain, f.tex, formulaSubjectName(f.subject), f.origin].join(' ');
        return blob.toLowerCase().includes(q);
      });
      const head = `${subjectChrome(track)}${proSeg(track, 'formulas')}<section class="card learn-shell"><h2>公式庫</h2><p class="muted small">每一張卡是歷屆試題會用到的一條公式。點進去看說明，並連到相關考題。數學公式也可以從這裡篩。</p></section>`;
      app.innerHTML = `
        ${head}
        <section class="card">
          <div class="filter-bar formula-filters">
            <label class="field"><span class="field-title">科目</span>
              <select id="fxSubject">
                <option value="all" ${state.subject === 'all' ? 'selected' : ''}>全部科目</option>
                <option value="ee" ${state.subject === 'ee' ? 'selected' : ''}>電工原理</option>
                <option value="em" ${state.subject === 'em' ? 'selected' : ''}>電工機械</option>
                <option value="math" ${state.subject === 'math' ? 'selected' : ''}>數學</option>
              </select>
            </label>
            <label class="field"><span class="field-title">搜尋</span>
              <input type="search" id="fxQ" value="${esc(state.q)}" placeholder="公式名稱、用途或式子">
            </label>
          </div>
        </section>
        <p class="bank-meta muted small">共 ${shown.length} 筆公式</p>
        <div class="formula-grid">
          ${shown.map((f) => `<article class="card formula-card">
            <div class="formula-tags">
              <span class="tag">${esc(formulaSubjectName(f.subject))}</span>
              <span class="tag tag-exam">${esc(f.origin || '歷屆')}</span>
            </div>
            <h3>${esc(f.name || '')}</h3>
            <div class="formula-eq">${f.tex ? displayMath(f.tex) : ''}</div>
            <p class="small">${esc(f.blurb || '')}</p>
            <a class="btn btn-soft btn-sm" href="${base}/${esc(f.id)}">查看詳情</a>
          </article>`).join('') || '<p class="muted">沒有符合的公式。</p>'}
        </div>`;
      typesetMath(app);
      $('#fxSubject').onchange = () => { state.subject = $('#fxSubject').value; paint(); };
      const input = $('#fxQ');
      input.oninput = () => { state.q = input.value; paint(); };
      if (input && state.q) {
        input.focus();
        const n = input.value.length;
        try { input.setSelectionRange(n, n); } catch (_) {}
      }
    };
    paint();
  }

  const LEARN_SUBJECTS = [
    ['zh', '國文'],
    ['en', '英文'],
    ['ee', '電工原理'],
    ['em', '電工機械'],
    ['math', '數學基礎']
  ];
  const LEARN_SUBJECT_NAME = Object.fromEntries(LEARN_SUBJECTS);

  function subjectKeyFromTab(tab) {
    const t = String(tab || '');
    if (t === 'english') return 'en';
    if (LEARN_SUBJECT_NAME[t]) return t;
    return 'other';
  }
  function learnedPct(learned, total) {
    if (!total || learned <= 0) return { text: '0', width: 0 };
    const raw = learned / total * 100;
    if (raw > 0 && raw < 0.05) return { text: '<0.1', width: raw };
    const rounded = Math.round(raw * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return { text, width: Math.min(100, raw) };
  }
  async function commitLearned(id, snap, on) {
    if (typeof settings === 'undefined' || !settings || !id) return null;
    if (!settings.learned || typeof settings.learned !== 'object' || Array.isArray(settings.learned)) settings.learned = {};
    const prev = settings.learned[id] ? Object.assign({}, settings.learned[id]) : null;
    if (on) {
      if (!snap) return prev;
      settings.learned[id] = snap;
    } else delete settings.learned[id];
    if (typeof saveSettings === 'function') await saveSettings('learned');
    return prev;
  }
  function learnedLabel(on, id) {
    const cls = id ? 'bank-learned' : 'quiz-learned';
    const data = id ? ` data-id="${esc(id)}"` : '';
    return `<label class="q-learned${on ? ' on' : ''}"><input type="checkbox" class="${cls}"${data}${on ? ' checked' : ''} aria-label="已學會"><span>已學會</span></label>`;
  }
  function learnedSnapshotFromItem(it) {
    return {
      id: it.id,
      stem: it.stem || '',
      subject: it.subject || 'other',
      subjectName: it.subjectName || LEARN_SUBJECT_NAME[it.subject] || '其他',
      year: it.year ? String(it.year) : '',
      type: it.chapter || it.type || '',
      at: Date.now()
    };
  }
  function learnedSnapshotFromQuestion(q, state) {
    const subject = subjectKeyFromTab(state && state.subjectTab);
    return {
      id: q.id,
      stem: q.stem || '',
      subject,
      subjectName: LEARN_SUBJECT_NAME[subject] || '其他',
      year: q.year ? String(q.year) : '',
      type: q.label || (state && state.source) || '',
      at: Date.now()
    };
  }
  function learnedStats(items) {
    const map = (typeof settings !== 'undefined' && settings && settings.learned) || {};
    const by = {};
    LEARN_SUBJECTS.forEach(([id]) => { by[id] = { total: 0, learned: 0 }; });
    (items || []).forEach((it) => {
      const slot = by[it.subject];
      if (!slot || !it.id) return;
      slot.total += 1;
      if (map[it.id]) slot.learned += 1;
    });
    return by;
  }

  async function viewLearned(app, parts) {
    $('#pageTitle').textContent = '已學會';
    const asked = parts && parts[0];
    const filter = (asked && (LEARN_SUBJECT_NAME[asked] || asked === 'other')) ? asked : 'all';
    const items = await questionCatalog();
    const byId = new Map();
    items.forEach((it) => { if (it.id && !byId.has(it.id)) byId.set(it.id, it); });
    const map = (settings && settings.learned) || {};
    const rows = Object.keys(map).map((id) => {
      const snap = map[id] || {};
      const it = byId.get(id);
      const subject = it ? it.subject : (snap.subject || 'other');
      return {
        id,
        stem: (it && it.stem) || snap.stem || '',
        subject,
        subjectName: (it && it.subjectName) || snap.subjectName || LEARN_SUBJECT_NAME[subject] || '其他',
        year: (it && it.year) || snap.year || '',
        type: (it && (it.chapter || it.type)) || snap.type || '',
        at: snap.at || 0
      };
    }).sort((a, b) => (b.at || 0) - (a.at || 0));
    const head = typeof pageHead === 'function'
      ? pageHead('成就', '已學會', '這裡只收你自己勾過的題。取消勾選就會移出，不會改到星號收藏或錯題本。')
      : '<h2>已學會</h2>';
    if (!rows.length) {
      app.innerHTML = `${head}<section class="card"><p class="muted">還沒有勾選。在題庫、作答頁或單字庫勾「已學會」，就會收在這裡。</p><a class="btn btn-primary" href="#learn-bank">去題庫</a></section>`;
      return;
    }
    const counts = {};
    rows.forEach((r) => { counts[r.subject] = (counts[r.subject] || 0) + 1; });
    const chipOrder = [['all', '全部'], ...LEARN_SUBJECTS, ['en-vocab', '英文單字'], ['other', '其他']];
    const chips = chipOrder.filter(([k]) => k === 'all' || counts[k]).map(([k, n]) => {
      const num = k === 'all' ? rows.length : counts[k];
      return `<button type="button" class="chip fav-chip${k === filter ? ' active' : ''}" data-k="${esc(k)}">${esc(n)} ${num}</button>`;
    }).join('');
    const shown = filter === 'all' ? rows : rows.filter((r) => r.subject === filter);
    const card = (r) => {
      const href = r.subject === 'en-vocab'
        ? `#learn-en/vocab/w/${encodeURIComponent(r.id)}`
        : `#learn-bank/q/${encodeURIComponent(r.id)}`;
      const tag = r.subject === 'en-vocab' ? (r.type || '單字') : (r.year ? String(r.year) + ' 年' : '題庫');
      return `<article class="card bank-q learned-row is-learned">
      <a class="bank-q-main learned-open" href="${href}">
        <div class="subj-kicker"><span class="tag">${esc(tag)}</span><span>${esc(r.subjectName)}${r.type && r.subject !== 'en-vocab' ? '／' + esc(r.type) : ''}</span></div>
        <div class="bank-stem">${r.subject === 'en-vocab' ? esc(r.stem || '') : formatRichText(r.stem || '')}</div>
      </a>
      <label class="q-learned on"><input type="checkbox" class="page-learned" data-id="${esc(r.id)}" checked aria-label="取消已學會"><span>已學會</span></label>
    </article>`;
    };
    let listHtml = '';
    if (!shown.length) listHtml = '<section class="card"><p class="muted">這一科還沒有已學會的題。</p></section>';
    else if (filter === 'all') {
      const order = LEARN_SUBJECTS.map(([k]) => k).concat(['en-vocab', 'other']);
      listHtml = order.map((k) => {
        const list = shown.filter((r) => r.subject === k);
        if (!list.length) return '';
        const name = k === 'en-vocab' ? '英文單字' : (LEARN_SUBJECT_NAME[k] || '其他');
        return `<h3 class="learned-group">${esc(name)}</h3>${list.map(card).join('')}`;
      }).join('');
    } else listHtml = shown.map(card).join('');
    app.innerHTML = `${head}
      <section class="card">
        <div class="fav-chips">${chips}</div>
        <p class="muted small">這組 ${shown.length} 題。點題目可回去作答。</p>
      </section>
      <div class="bank-list">${listHtml}</div>`;
    typesetMath(app);
    $$('.fav-chip', app).forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.k;
        location.hash = !k || k === 'all' ? '#mine/learned' : '#mine/learned/' + encodeURIComponent(k);
      };
    });
    $$('.page-learned', app).forEach((input) => {
      input.addEventListener('change', async () => {
        if (input.checked) return;
        const id = input.dataset.id;
        const prev = await commitLearned(id, null, false);
        const again = () => viewLearned(app, filter === 'all' ? [] : [filter]);
        if (prev && typeof toastAction === 'function') {
          toastAction('已從已學會移出', '復原', async () => {
            await commitLearned(id, prev, true);
            toast('已恢復已學會');
            again();
          });
        } else toast('已從已學會移出');
        again();
      });
    });
  }

  async function viewSubjects(app, opts) {
    opts = opts || {};
    if (!opts.embedded) $('#pageTitle').textContent = '學習科目';
    const items = await questionCatalog();
    const stats = learnedStats(items);
    const rows = LEARN_SUBJECTS.filter(([id]) => stats[id].total > 0);
    const learnedTotal = rows.reduce((n, [id]) => n + stats[id].learned, 0);
    const bankTotal = rows.reduce((n, [id]) => n + stats[id].total, 0);
    const allPct = learnedPct(learnedTotal, bankTotal);
    const head = opts.embedded ? '' : (typeof pageHead === 'function'
      ? pageHead('成就進度', '學習科目', '百分比是這一科已勾「已學會」的題數，除以題庫裡實際有的題。星號收藏和錯題本另外計算。')
      : '<h2>學習科目</h2>');
    const SUBJECT_GROUP = { zh: '共同科目', en: '共同科目', ee: '專業科目', em: '專業科目', math: '基礎能力' };
    const cards = rows.map(([id, name]) => {
      const s = stats[id];
      const pct = learnedPct(s.learned, s.total);
      return `<article class="card subject-progress tone-${esc(id)}">
        <div class="subject-progress-top">
          <div>
            <p class="kicker">${esc(SUBJECT_GROUP[id] || '學習科目')}</p>
            <h3>${esc(name)}</h3>
            <p class="muted small learned-count">已學會 ${s.learned} / ${s.total} 題</p>
          </div>
          <div class="progress-pct" data-subject="${esc(id)}">${esc(pct.text)}<span class="pct-unit">%</span></div>
        </div>
        <div class="bar bar-lg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct.width)}" aria-label="${esc(name)} ${esc(pct.text)}%"><i class="ok" style="--w:${pct.width}%"></i></div>
        <div class="btn-row">
          <a class="btn btn-primary" href="${learnSubjectHref(id)}">去這一科</a>
          <a class="btn btn-soft" href="#mine/learned/${esc(id)}">看已學會</a>
        </div>
      </article>`;
    }).join('');
    app.innerHTML = `${head}
      <section class="card progress-hero">
        <div class="progress-hero-top">
          <div>
            <div class="eyebrow">全部科目</div>
            <h3>已學會 ${learnedTotal} 題</h3>
            <p class="muted small">題庫共 ${bankTotal} 題。自己勾了才算進百分比。</p>
          </div>
          <div class="progress-pct" id="learnedAllPct">${esc(allPct.text)}<span class="pct-unit">%</span></div>
        </div>
        <div class="bar bar-lg"><i class="ok" style="--w:${allPct.width}%"></i></div>
      </section>
      <div class="subj-grid">${cards}</div>`;
  }

  /* ---------- 學習路徑：章節計畫 ---------- */
  let _pathAssign;
  let pathPhaseMemory = null;
  let pathMediaBound = false;
  function pathApplyPhaseOpen() {
    const wide = !!(window.matchMedia && window.matchMedia('(min-width: 768px)').matches);
    $$('details.path-phase').forEach((d) => {
      d.open = wide || !!(pathPhaseMemory && pathPhaseMemory.has(d.dataset.phase));
    });
  }
  function pathBindMedia() {
    if (pathMediaBound || !window.matchMedia) return;
    pathMediaBound = true;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => pathApplyPhaseOpen();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  function pathNorm(s) {
    return String(s || '').normalize('NFKC').replace(/[\s\u3000]+/g, '').toLowerCase();
  }
  function pathRuleMatch(q, rule) {
    if (rule.kinds && rule.kinds.length && rule.kinds.includes(q.kind)) return true;
    if (rule.sections && rule.sections.length && q.section && rule.sections.includes(q.section)) return true;
    if (rule.groups && rule.groups.length && q.group && rule.groups.includes(q.group)) return true;
    if (rule.tags && rule.tags.length && (q.tags || []).some((t) => rule.tags.includes(t))) return true;
    if (rule.keywords && rule.keywords.length) {
      const text = pathNorm(q.text);
      if (rule.keywords.some((k) => k && text.includes(pathNorm(k)))) return true;
    }
    return false;
  }
  function pathDoneMap() {
    if (typeof settings === 'undefined' || !settings) return {};
    if (!settings.pathDone || typeof settings.pathDone !== 'object' || Array.isArray(settings.pathDone)) settings.pathDone = {};
    return settings.pathDone;
  }
  async function togglePathDone(id) {
    const map = pathDoneMap();
    const on = !(map[id] && map[id].on);
    map[id] = { on, at: Date.now() };
    if (typeof saveSettings === 'function') await saveSettings('pathDone');
    if (typeof toast === 'function') toast(on ? '已標記完成' : '已取消完成');
    return on;
  }
  function pathStats(id, questions) {
    const learnedMap = (typeof settings !== 'undefined' && settings && settings.learned) || {};
    const total = questions.length;
    let learned = 0;
    questions.forEach((q) => { if (q.id && learnedMap[q.id]) learned += 1; });
    const manual = !!(pathDoneMap()[id] && pathDoneMap()[id].on);
    const autoDone = total > 0 && learned >= total;
    const done = manual || autoDone;
    const pct = learnedPct(learned, total);
    return { total, learned, manual, autoDone, done, pct, countable: total > 0 };
  }
  function pathSum(list) {
    let learned = 0;
    let total = 0;
    (list || []).forEach((c) => {
      if (!c.stats || !c.stats.countable) return;
      total += c.stats.total;
      learned += c.stats.learned;
    });
    return { learned, total, pct: learnedPct(learned, total) };
  }
  function pathDayIndex(len) {
    if (!len) return 0;
    const iso = (typeof today === 'function') ? String(today()) : '';
    const parts = iso.split('-').map(Number);
    let n = 0;
    if (parts.length === 3 && parts.every((x) => !Number.isNaN(x))) {
      n = Math.floor((Date.UTC(parts[0], parts[1] - 1, parts[2]) - Date.UTC(parts[0], 0, 1)) / 86400000);
    }
    return ((n % len) + len) % len;
  }
  function pathQuizQuestion(q) {
    const raw = q.raw || {};
    const out = {
      id: q.id,
      stem: raw.stem || raw.sentence || q.text || '',
      choices: raw.choices || [],
      answer: raw.answer || '',
      explain: raw.explain || '',
      hasFigure: !!raw.hasFigure,
      figurePath: raw.figurePath || '',
      label: q.label || '',
      answerConfidence: raw.answerConfidence,
      source: raw.source || '',
      sourceNote: raw.sourceNote || ''
    };
    if (q.subject === 'en') {
      out.lang = 'en';
      out.translation = raw.translation || '';
      out.phrases = raw.phrases || [];
      out.words = raw.words || [];
      out.passage = raw.passage || '';
      out.passageId = raw.passageId || '';
    } else if (q.subject === 'zh') {
      out.lang = 'zh';
    }
    return out;
  }
  async function pathAssign() {
    if (_pathAssign) return _pathAssign;
    const plan = await loadPathChapters();
    const bank = await loadBank();
    const zh = await loadZhQuiz();
    const en = await loadEnQuiz();
    const math = await loadMath();
    const buckets = {};
    (plan.chapters || []).forEach((ch) => { buckets[ch.id] = []; });
    const ee = [];
    const em = [];
    (bank.questions || []).forEach((q) => {
      const row = {
        id: q.id,
        subject: q.track === 'em' ? 'em' : 'ee',
        text: q.stem || '',
        tags: q.tags || [],
        kind: q.kind || '',
        section: '',
        group: '',
        year: Number(q.year) || 0,
        qnum: Number(q.qnum) || 0,
        label: `${q.year || ''} #${q.qnum || ''}`,
        raw: q
      };
      (row.subject === 'em' ? em : ee).push(row);
    });
    const zhRows = [];
    const pushZh = (q) => zhRows.push({
      id: q.id, subject: 'zh', text: q.stem || '', tags: q.tags || [], kind: q.kind || '',
      section: q.section || '', group: '', year: Number(q.year) || 0, qnum: Number(q.qnum) || 0,
      label: q.label || (q.year ? String(q.year) : '國文'), raw: q
    });
    allExamQuestions(zh).forEach(pushZh);
    (zh.fromKnowledge || []).forEach(pushZh);
    const enRows = [];
    allExamQuestions(en).forEach((q) => enRows.push({
      id: q.id, subject: 'en', text: q.stem || '', tags: q.tags || [], kind: '',
      section: q.section || '', group: 'exam', year: Number(q.year) || 0, qnum: Number(q.qnum) || 0,
      label: '英文', raw: q
    }));
    (en.recall || []).forEach((q) => enRows.push({
      id: q.id, subject: 'en', text: q.sentence || q.stem || '', tags: [], kind: '',
      section: '', group: 'recall', year: 0, qnum: 0, label: '單字片語', raw: q
    }));
    const put = (subject, rows, otherId) => {
      const rules = (plan.rules && plan.rules[subject]) || [];
      rows.forEach((q) => {
        let id = otherId;
        for (let i = 0; i < rules.length; i++) {
          if (pathRuleMatch(q, rules[i])) { id = rules[i].chapterId; break; }
        }
        if (!buckets[id]) buckets[id] = [];
        buckets[id].push(q);
      });
    };
    put('ee', ee, 'ee-other');
    put('em', em, 'em-other');
    put('zh', zhRows, 'zh-other');
    put('en', enRows, 'en-other');
    Object.keys(buckets).forEach((id) => {
      buckets[id].sort((a, b) => (a.year || 0) - (b.year || 0) || (a.qnum || 0) - (b.qnum || 0) || String(a.id).localeCompare(String(b.id)));
    });
    const unitById = {};
    (math.units || []).forEach((u) => { unitById[u.id] = u; });
    const unitsFor = {};
    (plan.chapters || []).forEach((ch) => {
      if (ch.subject !== 'math') return;
      const ids = ch.unitIds || [];
      unitsFor[ch.id] = ids.map((uid) => {
        const u = unitById[uid];
        return u ? { id: u.id, name: u.name } : null;
      }).filter(Boolean);
      const idSet = new Set(ids);
      const rows = [];
      (math.units || []).forEach((u) => {
        if (!idSet.has(u.id)) return;
        (u.practice || []).forEach((p, i) => {
          rows.push({
            id: `math-${u.id}-${i}`,
            subject: 'math',
            text: p.stem || '',
            unitId: u.id,
            unitName: u.name,
            label: u.name,
            year: 0,
            qnum: i,
            raw: p
          });
        });
      });
      buckets[ch.id] = rows;
    });
    _pathAssign = { plan, buckets, unitsFor };
    return _pathAssign;
  }
  async function pathModel() {
    const { plan, buckets, unitsFor } = await pathAssign();
    const chapters = (plan.chapters || []).map((ch) => {
      const questions = buckets[ch.id] || [];
      return Object.assign({}, ch, {
        questions,
        units: unitsFor[ch.id] || [],
        stats: ch.role === 'link' ? { total: 0, learned: 0, manual: false, done: false, pct: { text: '0', width: 0 }, countable: false } : pathStats(ch.id, questions)
      });
    });
    const byId = {};
    chapters.forEach((c) => { byId[c.id] = c; });
    const main = (plan.mainOrder || []).map((id) => byId[id]).filter(Boolean);
    const next = main.find((c) => c.stats.countable && !c.stats.done) || null;
    const zhRot = (plan.rotations && plan.rotations.zh) || [];
    const enRot = (plan.rotations && plan.rotations.en) || [];
    return {
      plan, chapters, byId, main, next,
      todayZh: zhRot[pathDayIndex(zhRot.length)] || '',
      todayEn: enRot[pathDayIndex(enRot.length)] || ''
    };
  }
  function pathPhaseOf(model, id) {
    return ((model.plan && model.plan.phases) || []).find((p) => p.id === id) || null;
  }
  function pathCircle(ch) {
    if (ch.stats && ch.stats.done) return '✓';
    if (ch.role === 'other' || !ch.order || ch.order >= 90) return '＋';
    return String(ch.order);
  }
  function pathOrderSpan(orders) {
    const nums = Array.from(new Set((orders || []).filter((n) => Number.isFinite(n) && n > 0 && n < 90))).sort((a, b) => a - b);
    if (!nums.length) return '';
    const parts = [];
    let start = nums[0];
    let prev = nums[0];
    for (let i = 1; i <= nums.length; i++) {
      const n = nums[i];
      if (n === prev + 1) { prev = n; continue; }
      parts.push(start === prev ? String(start) : `${start}–${prev}`);
      start = n;
      prev = n;
    }
    return parts.join('、');
  }
  function pathHint(ch) {
    return (ch && (ch.hint || ch.name)) || '';
  }
  function pathParallelNote(ch, model) {
    if (!ch || ch.role !== 'parallel') return '';
    const byId = (model && model.byId) || {};
    if (ch.pairWith && ch.pairWith.length) {
      const span = pathOrderSpan(ch.pairWith.map((id) => byId[id] && byId[id].order));
      return span ? `搭配電工原理<span class="path-ch-keep">第 ${esc(span)} 章</span>` : '';
    }
    if (ch.pairAfter && byId[ch.pairAfter] && byId[ch.pairAfter].order < 90) {
      return `電工原理<span class="path-ch-keep">第 ${esc(byId[ch.pairAfter].order)} 章之後</span>`;
    }
    return '';
  }
  function pathMainNotes(ch, model) {
    if (!ch || ch.role !== 'main') return [];
    const chapters = (model && model.chapters) || [];
    const withs = chapters.filter((c) => c.role === 'parallel' && (c.pairWith || []).includes(ch.id));
    const afters = chapters.filter((c) => c.role === 'parallel' && c.pairAfter === ch.id);
    const notes = [];
    if (withs.length) notes.push(`可同時學：${esc(withs.map(pathHint).filter(Boolean).join('、'))}`);
    if (afters.length) notes.push(`本章之後：${esc(afters.map(pathHint).filter(Boolean).join('、'))}`);
    return notes;
  }
  function pathRowNotes(ch, model) {
    if (!ch) return [];
    if (ch.role === 'parallel') {
      const note = pathParallelNote(ch, model);
      return note ? [note] : [];
    }
    if (ch.role === 'main') return pathMainNotes(ch, model);
    return [];
  }
  function pathTitle(ch) {
    if (ch.role !== 'other') return ch.name;
    const map = { ee: '電工原理', em: '電工機械', zh: '國文', en: '英文' };
    return map[ch.subject] ? `${map[ch.subject]}・其他` : ch.name;
  }
  function pathChapterRow(ch, opts) {
    opts = opts || {};
    if (ch.role === 'link') return pathLinkRow(ch);
    const s = ch.stats;
    const href = `#path/go/${encodeURIComponent(ch.id)}`;
    const today = opts.today ? '<span class="tag tag-ok">今天</span>' : '';
    const manual = s.manual ? '<span class="tag">已標記完成</span>' : '';
    const countLine = s.total ? `已學會 ${s.learned} / ${s.total} 題` : '題目補充中';
    const unitLine = (ch.units && ch.units.length)
      ? `<span class="path-ch-sub">教材：${ch.units.map((u) => esc(u.name)).join('、')}</span>`
      : '';
    const notes = (opts.notes || []).filter(Boolean).map((n) => `<span class="path-ch-sub">${n}</span>`).join('');
    const extra = (ch.role === 'other' && ch.blurb) ? `<span class="path-ch-sub">${esc(ch.blurb)}</span>` : '';
    const pctNow = Math.round(s.pct.width || 0);
    return `<article class="path-ch${s.done ? ' is-done' : ''}${opts.today ? ' is-today' : ''}">
      <a class="path-ch-hit" href="${href}">
        <span class="path-num" aria-hidden="true">${pathCircle(ch)}</span>
        <span class="path-ch-body">
          <span class="path-ch-title">${esc(pathTitle(ch))} ${today}${manual}</span>
          <span class="path-ch-sub">${countLine}</span>
          ${notes}
          ${unitLine}
          ${extra}
          <span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctNow}" aria-label="${esc(pathTitle(ch))} ${esc(s.pct.text)}%"><i class="${s.autoDone ? 'ok' : ''}" style="--w:${s.pct.width}%"></i></span>
        </span>
        <span class="path-ch-pct">${esc(s.pct.text)}%</span>
      </a>
      <button type="button" class="btn btn-soft path-done-btn" data-path-done="${esc(ch.id)}">${s.manual ? '取消完成' : '標記完成'}</button>
    </article>`;
  }
  function pathLinkRow(ch) {
    const links = (ch.links && ch.links.length) ? ch.links : [{ href: ch.href || '#path', label: '前往' }];
    return `<article class="path-ch path-link">
      <div class="path-ch-body">
        <span class="path-ch-title"><span class="path-num" aria-hidden="true">${esc(String(ch.order || ''))}</span>${esc(ch.name)}</span>
        <span class="path-ch-sub">${esc(ch.blurb || '')}</span>
        <div class="path-link-actions">${links.map((l) => `<a class="btn btn-primary" href="${esc(l.href)}">${esc(l.label || '前往')}</a>`).join('')}</div>
      </div>
    </article>`;
  }
  function pathWire(app) {
    $$('[data-path-done]', app).forEach((btn) => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const y = window.scrollY;
        try {
          await togglePathDone(btn.getAttribute('data-path-done'));
          if (typeof render === 'function') await render();
          window.scrollTo(0, y);
        } catch (err) {
          console.error(err);
          if (typeof toast === 'function') toast('沒有存成：' + (err && err.message ? err.message : '請再試一次'));
        }
      };
    });
    $$('details.path-phase > summary', app).forEach((s) => {
      s.addEventListener('click', () => {
        if (window.matchMedia && window.matchMedia('(min-width: 768px)').matches) return;
        const d = s.parentElement;
        const id = d && d.dataset.phase;
        if (!id || !pathPhaseMemory) return;
        const willOpen = !d.open;
        if (willOpen) pathPhaseMemory.add(id);
        else pathPhaseMemory.delete(id);
      });
    });
    const start = $('#pathStart', app);
    if (start) start.onclick = () => { location.hash = start.getAttribute('data-href'); };
  }
  function pathBar(pct, label) {
    const now = Math.round((pct && pct.width) || 0);
    return `<div class="bar bar-lg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${now}" aria-label="${esc(label || '')}"><i class="ok" style="--w:${(pct && pct.width) || 0}%"></i></div>`;
  }
  async function viewPathHome(app, model, opts) {
    opts = opts || {};
    const phases = (model.plan.phases || []);
    if (!pathPhaseMemory) pathPhaseMemory = new Set(['lang']);
    if (model.next) {
      pathPhaseMemory.add(model.next.phase);
      if (model.next.phase === 'ee') pathPhaseMemory.add('em');
    } else pathPhaseMemory.add('sprint');
    let dueN = 0;
    try {
      const t = today();
      dueN = (await DB.all()).filter((m) => isDue(m, t)).length;
    } catch (_) { dueN = 0; }
    const next = model.next;
    const nextPhase = next ? pathPhaseOf(model, next.phase) : pathPhaseOf(model, 'sprint');
    const stageList = next
      ? model.chapters.filter((c) => c.phase === next.phase && c.role === 'main')
      : [];
    const stageSum = pathSum(stageList);
    const stageTitle = nextPhase ? `${nextPhase.label}　${nextPhase.name}` : '學習路徑';
    const stageBody = next
      ? `主線已學會 ${stageSum.learned} / ${stageSum.total} 題。下一個還沒完成的章節在下面。`
      : '主線章節都完成了。接著用錯題、歷屆計時和模擬考收斂。';
    const nextNotes = next ? pathRowNotes(next, model) : [];
    const sprintFirst = model.byId['sprint-review'];
    const nextTitle = next ? next.name : (sprintFirst ? sprintFirst.name : '總複習衝刺');
    const nextHref = next ? `#path/go/${encodeURIComponent(next.id)}` : (sprintFirst && sprintFirst.href) || '#review';
    const nextMeta = next
      ? (next.stats.total ? `已學會 ${next.stats.learned} / ${next.stats.total} 題` : '題目補充中')
      : '主線已經走完，從錯題本重練開始。';
    const nextPct = next ? next.stats.pct : { text: '完成', width: 100 };
    const head = opts.listOnly
      ? (opts.prefix || '')
      : (typeof pageHead === 'function'
        ? pageHead('學習計畫', '學習路徑', '按章節順序往下練。百分比是這一章已勾「已學會」的題數，除以對上的題。滿百分，或按「標記完成」，這一章就打勾。', '<a class="btn btn-primary" href="#home">查看今日</a>')
        : '<h2>學習路徑</h2>');
    const phaseHtml = phases.map((phase) => {
      const open = pathPhaseMemory.has(phase.id);
      const inPhase = model.chapters.filter((c) => c.phase === phase.id);
      const counted = inPhase.filter((c) => c.role !== 'link');
      const summed = pathSum(counted);
      let body = '';
      if (phase.id === 'math') {
        body = inPhase.filter((c) => c.role === 'main').sort((a, b) => a.order - b.order).map((c) => pathChapterRow(c)).join('');
      } else if (phase.id === 'ee' || phase.id === 'em') {
        const lines = inPhase.filter((c) => c.role === 'main' || c.role === 'parallel').sort((a, b) => a.order - b.order).map((c) => pathChapterRow(c, { notes: pathRowNotes(c, model) })).join('');
        const others = inPhase.filter((c) => c.role === 'other').map((c) => pathChapterRow(c)).join('');
        body = `${lines}${others ? `<h3 class="path-other-title">尚未對上的題</h3>${others}` : ''}`;
      } else if (phase.id === 'lang') {
        const zhName = (model.byId[model.todayZh] || {}).name || '';
        const enName = (model.byId[model.todayEn] || {}).name || '';
        const group = (subject, todayId, title) => {
          const rows = inPhase.filter((c) => c.subject === subject).sort((a, b) => a.order - b.order);
          return `<h3 class="path-group-title">${title}</h3>${rows.map((c) => pathChapterRow(c, { today: c.id === todayId })).join('')}`;
        };
        body = `<div class="path-today"><p class="kicker">今天的副線</p><p>國文：${esc(zhName)}　英文：${esc(enName)}</p><p class="muted small">每天換一個題型，兩邊的已學會各自累計。</p></div>${group('zh', model.todayZh, '國文')}${group('en', model.todayEn, '英文')}`;
      } else {
        body = inPhase.filter((c) => c.role === 'link').sort((a, b) => a.order - b.order).map((c) => pathLinkRow(c)).join('');
      }
      const pctLabel = phase.id === 'sprint' ? '' : `<span class="path-phase-pct">${esc(summed.pct.text)}%</span>`;
      const sumLine = phase.id === 'sprint'
        ? ''
        : `<p class="muted small">已學會 ${summed.learned} / ${summed.total} 題</p>${pathBar(summed.pct, phase.name)}`;
      return `<details class="path-phase" data-phase="${esc(phase.id)}"${open ? ' open' : ''}>
        <summary>
          <span class="path-phase-name"><span class="kicker">${esc(phase.label)}</span><strong>${esc(phase.name)}</strong></span>
          ${pctLabel}
          <span class="path-phase-chev" aria-hidden="true">▾</span>
        </summary>
        <div class="path-phase-body">
          <p class="muted small">${esc(phase.blurb || '')}</p>
          ${sumLine}
          ${body}
        </div>
      </details>`;
    }).join('');
    let weak = '';
    try { weak = await weaknessHtml(); } catch (_) { weak = ''; }
    const stage = opts.listOnly ? '' : `<div class="path-grid">
        <section class="card path-stage">
          <p class="kicker">目前階段</p>
          <h3>${esc(stageTitle)}</h3>
          <p class="muted">${esc(stageBody)}</p>
          ${next ? pathBar(stageSum.pct, stageTitle) : ''}
          ${dueN ? `<p class="path-due"><a href="#mine">錯題本今天有 ${dueN} 題要複習</a></p>` : ''}
        </section>
        <section class="card path-next">
          <p class="kicker">下一個節點</p>
          <h3>${esc(nextTitle)}</h3>
          <p class="muted">${esc(nextMeta)}</p>
          ${next ? pathBar(nextPct, nextTitle) : ''}
          <a class="btn btn-primary" href="${esc(nextHref)}">前往</a>
          ${next && next.nextNote ? `<p class="path-next-note">${esc(next.nextNote)}</p>` : ''}
          ${nextNotes.length ? `<p class="path-next-note">${nextNotes.join('。')}</p>` : ''}
        </section>
      </div>`;
    const weakBlock = weak ? `<section class="card path-weak"><h3>弱點看板</h3><p class="muted small">錯因和練習正確率，補強時先看這裡。模擬考在第四階段。</p>${weak}</section>` : '';
    app.innerHTML = `${head}${stage}<div class="progress-chapters">${phaseHtml}</div>${weakBlock}`;
    pathWire(app);
    pathBindMedia();
    pathApplyPhaseOpen();
  }
  async function viewPathChapter(app, model, id, run) {
    const ch = model.byId[id];
    if (!ch || ch.role === 'link') {
      $('#pageTitle').textContent = '學習路徑';
      app.innerHTML = `<section class="card"><h2>找不到這一章</h2><p class="muted">回到進度再選一次。</p><a class="btn btn-primary" href="#progress">回進度</a></section>`;
      return;
    }
    const title = pathTitle(ch);
    $('#pageTitle').textContent = title;
    const phase = pathPhaseOf(model, ch.phase);
    const s = ch.stats;
    if (run && s.total) {
      return runQuiz(app, {
        title,
        questions: ch.questions.map(pathQuizQuestion),
        mode: 'practice',
        subjectTab: ch.subject,
        source: '學習路徑・' + ch.name,
        doneHref: '#progress',
        doneLabel: '回進度'
      });
    }
    const unitLinks = (ch.units || []).map((u) => `<a class="btn btn-soft" href="#learn-math/${esc(u.id)}">看教材：${esc(u.name)}</a>`).join('');
    const empty = !s.total;
    app.innerHTML = `
      <section class="card">
        <p class="kicker">${phase ? esc(phase.label + '　' + phase.name) : ''}</p>
        <h2>${esc(title)}</h2>
        ${pathRowNotes(ch, model).map((n) => `<p class="muted">${n}</p>`).join('')}
        ${empty ? '<p class="path-empty">題目補充中</p><p class="muted">這一章還沒有對上的題目，先練別章，或先標記完成。</p>' : `<p>已學會 ${s.learned} / ${s.total} 題（${esc(s.pct.text)}%）</p>${pathBar(s.pct, ch.name)}`}
        ${s.manual ? '<p><span class="tag">已標記完成</span></p>' : ''}
        ${s.done && !s.manual ? '<p><span class="tag tag-ok">這一章已學會</span></p>' : ''}
        <div class="path-chapter-actions">
          ${empty ? '' : `<button type="button" class="btn btn-primary" id="pathStart" data-href="#path/go/${encodeURIComponent(ch.id)}/run">開始練習（${s.total} 題）</button>`}
          <button type="button" class="btn btn-soft" data-path-done="${esc(ch.id)}">${s.manual ? '取消完成' : '標記完成'}</button>
          ${unitLinks}
          <a class="btn btn-soft" href="#progress">回進度</a>
        </div>
      </section>`;
    pathWire(app);
  }
  async function viewProgress(app) {
    const holder = document.createElement('div');
    await viewSubjects(holder, { embedded: true });
    $('#pageTitle').textContent = '進度';
    const model = await pathModel();
    const prefix = `${typeof pageHead === 'function' ? pageHead('進度', '各科進度', '上面是各科已學會的百分比。下面照學習路徑列章節，可以標記完成。') : '<h2>進度</h2>'}
      ${holder.innerHTML}
      <h2 class="section-label">學習路徑</h2>`;
    return viewPathHome(app, model, { listOnly: true, prefix });
  }
  async function viewPath(app, parts) {
    const model = await pathModel();
    parts = parts || [];
    if (parts[0] === 'go' && parts[1]) return viewPathChapter(app, model, parts[1], parts[2] === 'run');
    location.replace('#progress');
  }


  /* ---------- 英文單字庫 ---------- */
  let _vocabBank;
  let vocabSpeakRate = 1;
  let vocabQuery = '';
  let vocabSort = 'alpha';
  async function loadVocab() {
    if (_vocabBank) return _vocabBank;
    if (window.__EN_VOCAB__) _vocabBank = window.__EN_VOCAB__;
    else {
      try { _vocabBank = await (await fetch('./data/en-vocab.json')).json(); }
      catch { _vocabBank = { meta: {}, words: [], phrases: [], affixes: [] }; }
    }
    return _vocabBank;
  }
  function enSeg(active) {
    return `<div class="mode-seg en-seg" role="tablist" aria-label="英文">
      <a href="#learn-en" role="tab" class="${active === 'practice' ? 'on' : ''}" aria-selected="${active === 'practice'}">刷題</a>
      <a href="#learn-en/vocab" role="tab" class="${active === 'vocab' ? 'on' : ''}" aria-selected="${active === 'vocab'}">單字庫</a>
    </div>`;
  }
  const VOCAB_POS = { 'n.': '名', 'v.': '動', 'adj.': '形', 'adv.': '副', 'prep.': '介', 'conj.': '連', 'pron.': '代', 'interj.': '嘆', 'num.': '數' };
  const VOCAB_POS_LONG = { 'n.': '名詞', 'v.': '動詞', 'adj.': '形容詞', 'adv.': '副詞', 'prep.': '介系詞', 'conj.': '連接詞', 'pron.': '代名詞', 'interj.': '感嘆詞', 'num.': '數詞' };
  function vocabPos(pos) { return VOCAB_POS[pos] || pos || ''; }
  function vocabPosLong(pos) { return VOCAB_POS_LONG[pos] || pos || '詞性'; }
  function vocabLearnedOn(id) {
    return !!(settings && settings.learned && settings.learned[id]);
  }
  function vocabFavOn(id) {
    return !!(settings && settings.learnFavs && settings.learnFavs[id]);
  }
  function vocabProgress(bank) {
    const items = [...(bank.words || []), ...(bank.phrases || [])];
    const learned = items.filter((it) => vocabLearnedOn(it.id)).length;
    const pct = learnedPct(learned, items.length);
    return { learned, total: items.length, pct };
  }
  function vocabSnap(item, kind) {
    return {
      id: item.id,
      stem: item.w || '',
      subject: 'en-vocab',
      subjectName: '英文單字',
      year: '',
      type: kind === 'phrase' ? '片語' : '單字',
      at: Date.now(),
      vocab: true,
      kind: kind === 'phrase' ? 'phrase' : 'word',
      zh: item.zh || ''
    };
  }
  function vocabFavSnap(item, kind) {
    return {
      id: item.id,
      stem: item.w || '',
      zh: item.zh || '',
      subjectTab: 'en-vocab',
      lang: 'en',
      from: item.zh || (kind === 'phrase' ? '片語' : '單字'),
      kind: kind === 'phrase' ? 'phrase' : 'word',
      at: Date.now()
    };
  }
  function vocabSpeak(text, rate) {
    const t = String(text || '').trim();
    if (!t) return;
    const r = rate == null ? vocabSpeakRate : rate;
    if (typeof speakEnglishQueued === 'function') speakEnglishQueued(t, r);
    else if (typeof speakEn === 'function') speakEn(t, r);
  }
  function vocabProgressHtml(bank) {
    const p = vocabProgress(bank);
    return `<section class="card vocab-progress">
      <div class="subject-progress-top">
        <div>
          <p class="kicker">英文單字</p>
          <h3>已學會 ${p.learned} / ${p.total}</h3>
          <p class="muted small">單字與片語都算。勾選會記在這台裝置，並跟著雲端備份走。</p>
        </div>
        <div class="progress-pct" id="vocabPct">${esc(p.pct.text)}<span class="pct-unit">%</span></div>
      </div>
      <div class="bar bar-lg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.pct.width)}" aria-label="單字庫進度 ${esc(p.pct.text)}%"><i class="ok" style="--w:${p.pct.width}%"></i></div>
    </section>`;
  }
  function vocabSubnav(active) {
    const tabs = [['words', '單字', '#learn-en/vocab'], ['phrases', '片語', '#learn-en/vocab/phrases'], ['roots', '字根字首', '#learn-en/roots']];
    return `<div class="mode-seg vocab-sub" role="tablist" aria-label="單字庫">
      ${tabs.map(([k, n, href]) => `<a href="${href}" role="tab" class="${active === k ? 'on' : ''}" aria-selected="${active === k}">${n}</a>`).join('')}
    </div>`;
  }
  function vocabById(bank) {
    const map = new Map();
    (bank.words || []).forEach((w) => map.set(w.id, { ...w, _kind: 'word' }));
    (bank.phrases || []).forEach((w) => map.set(w.id, { ...w, _kind: 'phrase' }));
    return map;
  }
  async function viewVocab(app, parts) {
    const bank = await loadVocab();
    parts = parts || [];
    if (parts[0] === 'w' && parts[1]) return viewVocabDetail(app, bank, parts[1]);
    if (parts[0] === 'phrases') return viewVocabList(app, bank, 'phrases');
    return viewVocabList(app, bank, 'words');
  }
  async function viewVocabList(app, bank, mode) {
    $('#pageTitle').textContent = '單字庫';
    const items = mode === 'phrases' ? (bank.phrases || []) : (bank.words || []);
    const paint = () => {
      const q = vocabQuery.trim().toLowerCase();
      let shown = items.filter((it) => {
        if (!q) return true;
        return [it.w, it.zh, it.pos].join(' ').toLowerCase().includes(q);
      });
      const byFreq = vocabSort === 'freq';
      if (byFreq) shown = shown.slice().sort((a, b) => (b.count - a.count) || a.w.localeCompare(b.w));
      else shown = shown.slice().sort((a, b) => a.w.localeCompare(b.w));
      const letters = [];
      const groups = new Map();
      if (!byFreq) {
        shown.forEach((it) => {
          const L = (it.w[0] || '#').toUpperCase();
          const key = /[A-Z]/.test(L) ? L : '#';
          if (!groups.has(key)) { groups.set(key, []); letters.push(key); }
          groups.get(key).push(it);
        });
      }
      const index = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((L) => {
        const on = groups.has(L);
        return `<button type="button" class="vocab-jump${on ? '' : ' off'}" data-letter="${L}" ${on ? '' : 'disabled'}>${L}</button>`;
      }).join('');
      const row = (it) => {
        const pos = mode === 'words' ? `<span class="vocab-pos">${esc(vocabPos(it.pos))}</span>` : '';
        return `<a class="vocab-row" href="#learn-en/vocab/w/${encodeURIComponent(it.id)}">
          <span class="vocab-w">${esc(it.w)}</span>
          ${pos}
          <span class="vocab-zh">${esc(it.zh || '')}</span>
          <span class="vocab-n" title="出現次數">${it.count || 0}</span>
        </a>`;
      };
      let body = '';
      if (!shown.length) body = '<p class="muted">沒有符合的項目。</p>';
      else if (byFreq) body = `<div class="vocab-list">${shown.map(row).join('')}</div>`;
      else body = letters.map((L) => `<section class="vocab-letter" id="voc-${L === '#' ? 'hash' : L}"><h3>${esc(L)}</h3><div class="vocab-list">${groups.get(L).map(row).join('')}</div></section>`).join('');
      const head = typeof pageHead === 'function'
        ? pageHead('英文', '單字庫', `考古題單字 ${bank.meta?.wordCount || 0}、片語 ${bank.meta?.phraseCount || 0}。點一列看發音、構詞和出處。`)
        : '<h2>單字庫</h2>';
      app.innerHTML = `${subjectChrome('en')}${enSeg('vocab')}${head}
        ${vocabProgressHtml(bank)}
        ${vocabSubnav(mode === 'phrases' ? 'phrases' : 'words')}
        <section class="card">
          <div class="vocab-tools">
            <label class="field grow"><span class="field-title">搜尋</span>
              <input type="search" id="vocabQ" value="${esc(vocabQuery)}" placeholder="${mode === 'phrases' ? '片語或中文' : '單字、詞性或中文'}" autocomplete="off">
            </label>
            <div class="vocab-sort" role="group" aria-label="排序">
              <button type="button" class="btn btn-soft btn-sm${vocabSort === 'alpha' ? ' on' : ''}" data-sort="alpha">A–Z</button>
              <button type="button" class="btn btn-soft btn-sm${vocabSort === 'freq' ? ' on' : ''}" data-sort="freq">出現次數</button>
            </div>
          </div>
          <p class="muted small">${shown.length} 筆${mode === 'words' ? '・詞性、中文、右側是出現次數' : ''}</p>
        </section>
        ${mode === 'words' && !byFreq ? `<nav class="vocab-index" aria-label="字母索引">${index}</nav>` : ''}
        ${body}`;
      const input = $('#vocabQ');
      if (input) {
        input.oninput = () => { vocabQuery = input.value; paint(); };
        if (vocabQuery) {
          input.focus();
          const n = input.value.length;
          try { input.setSelectionRange(n, n); } catch (_) {}
        }
      }
      $$('[data-sort]', app).forEach((b) => {
        b.onclick = () => { vocabSort = b.dataset.sort || 'alpha'; paint(); };
      });
      $$('.vocab-jump', app).forEach((b) => {
        b.onclick = () => {
          const el = document.getElementById('voc-' + b.dataset.letter);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
      });
    };
    paint();
  }
  function vocabCognates(bank, item) {
    const morph = item.morph;
    if (!morph || !morph.root) return [];
    const root = morph.root;
    return (bank.words || []).filter((w) => w.id !== item.id && w.morph && w.morph.root === root);
  }
  function vocabPrefixMates(bank, item) {
    const pre = ((item.morph && item.morph.parts) || []).find((p) => p.k === 'prefix');
    if (!pre) return [];
    return (bank.words || []).filter((w) => {
      if (w.id === item.id || !w.morph) return false;
      return (w.morph.parts || []).some((p) => p.k === 'prefix' && p.id === pre.id);
    });
  }
  async function viewVocabDetail(app, bank, rawId) {
    const map = vocabById(bank);
    const item = map.get(rawId);
    if (!item) {
      $('#pageTitle').textContent = '單字庫';
      app.innerHTML = `${subjectChrome('en')}${enSeg('vocab')}<section class="card"><h2>找不到這個項目</h2><a class="btn btn-primary" href="#learn-en/vocab">回單字庫</a></section>`;
      return;
    }
    const kind = item._kind === 'phrase' ? 'phrase' : 'word';
    $('#pageTitle').textContent = item.w;
    const learned = vocabLearnedOn(item.id);
    const fav = vocabFavOn(item.id);
    const syl = kind === 'word' ? (item.syl || [item.w]) : [];
    const stress = kind === 'word' ? (item.stress || 0) : 0;
    const sec = kind === 'word' ? item.sec : null;
    const sylHtml = kind === 'word' ? `<div class="vocab-syl" aria-label="音節">${syl.map((s, i) => {
      const mark = i === stress ? '<span class="vocab-mark" aria-hidden="true">ˈ</span>' : (i === sec ? '<span class="vocab-mark sec" aria-hidden="true">ˌ</span>' : '');
      const dot = i ? '<span class="vocab-dot" aria-hidden="true">·</span>' : '';
      return `${dot}${mark}<button type="button" class="vocab-speak syl${i === stress ? ' is-stress' : ''}" data-speak="${esc(s)}" aria-label="念 ${esc(s)}">${esc(s)}</button>`;
    }).join('')}</div>` : '';
    const morph = item.morph;
    const morphHtml = kind === 'phrase'
      ? '<p class="vocab-plain">片語，不拆解。</p>'
      : (morph && morph.formula
        ? `<p class="vocab-formula">${esc(morph.formula)}</p>`
        : '<p class="vocab-plain">不拆解</p>');
    const cognates = kind === 'word' ? vocabCognates(bank, item) : [];
    const prefixes = kind === 'word' ? vocabPrefixMates(bank, item) : [];
    const cogHtml = (list, title) => {
      if (!list.length) return '';
      const shown = list.slice(0, 24);
      const more = list.length > shown.length ? `<a class="btn btn-soft btn-sm" href="#learn-en/roots/${encodeURIComponent((item.morph && item.morph.root) || '')}">看全部 ${list.length} 個</a>` : '';
      return `<section class="card"><h3>${title}</h3><div class="vocab-chips">${shown.map((w) => `<a class="chip" href="#learn-en/vocab/w/${encodeURIComponent(w.id)}">${esc(w.w)}</a>`).join('')}</div>${more}</section>`;
    };
    const src = (item.src || []).slice().sort((a, b) => (b.y - a.y) || (a.n - b.n));
    const srcHtml = src.length
      ? `<div class="vocab-src">${src.map((s) => `<a href="#learn-bank/q/${encodeURIComponent(s.id)}">${esc(String(s.y))} 年第 ${esc(String(s.n))} 題</a>`).join('')}</div>`
      : '<p class="muted">沒有對上的題號。</p>';
    app.innerHTML = `${subjectChrome('en')}${enSeg('vocab')}
      <section class="card vocab-card">
        <div class="vocab-card-tools">
          <label class="q-learned${learned ? ' on' : ''}" id="vocabLearned"><input type="checkbox" ${learned ? 'checked' : ''} aria-label="已學會"><span>已學會</span></label>
          <button type="button" class="q-fav${fav ? ' on' : ''}" id="vocabFav" aria-pressed="${fav ? 'true' : 'false'}" aria-label="收藏">${fav ? '★' : '☆'}<span class="small">${fav ? '已收藏' : '收藏'}</span></button>
        </div>
        <button type="button" class="vocab-speak vocab-head" data-speak="${esc(item.w)}" aria-label="念 ${esc(item.w)}">${esc(item.w)}</button>
        <p class="vocab-meta"><span class="tag">${esc(kind === 'phrase' ? '片語' : vocabPosLong(item.pos))}</span> ${esc(item.zh || '')} <span class="muted">出現 ${item.count || 0} 次</span></p>
        ${sylHtml}
        ${kind === 'word' && item.kk ? `<p class="vocab-kk"><span>KK</span> <b>${esc(item.kk)}</b></p>` : ''}
        <div class="vocab-rates" role="group" aria-label="語速">
          ${[['0.7', '0.7'], ['1', '1.0'], ['1.2', '1.2']].map(([v, n]) => `<button type="button" class="btn btn-soft btn-sm vocab-rate${String(vocabSpeakRate) === v ? ' on' : ''}" data-vrate="${v}">${n}</button>`).join('')}
        </div>
        <p class="muted small">點單字念整詞，點音節只念那一節。語速 0.7／1.0／1.2。</p>
      </section>
      <section class="card">
        <h3>構詞</h3>
        ${morphHtml}
      </section>
      ${cogHtml(cognates, '同源字')}
      ${prefixes.length && (!item.morph || !item.morph.root) ? cogHtml(prefixes, '同字首') : ''}
      <section class="card">
        <h3>出處</h3>
        <p class="muted small">點題號會打開那一題。</p>
        ${srcHtml}
        <div class="btn-row" style="margin-top:12px">
          <a class="btn btn-soft" href="${kind === 'phrase' ? '#learn-en/vocab/phrases' : '#learn-en/vocab'}">回列表</a>
          <a class="btn btn-soft" href="#learn-en/roots">字根字首表</a>
        </div>
      </section>`;
    const bindSpeak = (sel, getText) => {
      $$(sel, app).forEach((b) => {
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          vocabSpeak(getText(b), vocabSpeakRate);
        });
      });
    };
    bindSpeak('.vocab-head', (b) => b.getAttribute('data-speak'));
    bindSpeak('.syl', (b) => b.getAttribute('data-speak'));
    $$('.vocab-rate', app).forEach((b) => {
      b.onclick = () => {
        vocabSpeakRate = Number(b.dataset.vrate) || 1;
        $$('.vocab-rate', app).forEach((x) => x.classList.toggle('on', x === b));
        vocabSpeak(item.w, vocabSpeakRate);
      };
    });
    const learnedInput = $('#vocabLearned input', app) || $('input', $('#vocabLearned'));
    if (learnedInput) {
      learnedInput.addEventListener('change', async () => {
        const on = learnedInput.checked;
        const label = $('#vocabLearned');
        const prev = await commitLearned(item.id, vocabSnap(item, kind), on);
        if (label) label.classList.toggle('on', on);
        if (on) toast('已記成已學會');
        else if (prev && typeof toastAction === 'function') {
          toastAction('已從已學會移出', '復原', async () => {
            await commitLearned(item.id, prev, true);
            learnedInput.checked = true;
            if (label) label.classList.add('on');
            toast('已恢復已學會');
          });
        } else toast('已從已學會移出');
      });
    }
    const favBtn = $('#vocabFav');
    if (favBtn) {
      favBtn.onclick = async () => {
        settings.learnFavs = settings.learnFavs || {};
        if (settings.learnFavs[item.id]) delete settings.learnFavs[item.id];
        else settings.learnFavs[item.id] = vocabFavSnap(item, kind);
        if (typeof saveSettings === 'function') await saveSettings('learnFavs');
        const on = !!settings.learnFavs[item.id];
        favBtn.classList.toggle('on', on);
        favBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        favBtn.innerHTML = `${on ? '★' : '☆'}<span class="small">${on ? '已收藏' : '收藏'}</span>`;
        toast(on ? '已加入我的最愛' : '已取消收藏');
      };
    }
  }
  async function viewVocabRoots(app, parts) {
    const bank = await loadVocab();
    const affixId = parts && parts[0];
    $('#pageTitle').textContent = '字根字首表';
    const affixes = bank.affixes || [];
    if (affixId) {
      const aff = affixes.find((a) => a.id === affixId);
      if (!aff) {
        app.innerHTML = `${subjectChrome('en')}${enSeg('vocab')}<section class="card"><h2>找不到這個字根或字首</h2><a class="btn btn-primary" href="#learn-en/roots">回字根字首表</a></section>`;
        return;
      }
      const by = vocabById(bank);
      const words = (aff.words || []).map((id) => by.get(id)).filter(Boolean);
      const kindName = { prefix: '字首', root: '字根', suffix: '字尾' }[aff.kind] || '';
      app.innerHTML = `${subjectChrome('en')}${enSeg('vocab')}${vocabSubnav('roots')}
        <section class="card">
          <p class="kicker">${esc(kindName)}</p>
          <h2>${esc(aff.form || aff.id)}</h2>
          <p>${esc(aff.zh || '')}</p>
          <p class="muted small">單字庫裡有 ${words.length} 個字用到它。</p>
          <a class="btn btn-soft" href="#learn-en/roots">回字根字首表</a>
        </section>
        <div class="vocab-list">${words.map((w) => `<a class="vocab-row" href="#learn-en/vocab/w/${encodeURIComponent(w.id)}">
          <span class="vocab-w">${esc(w.w)}</span>
          <span class="vocab-pos">${esc(vocabPos(w.pos))}</span>
          <span class="vocab-zh">${esc(w.zh || '')}</span>
          <span class="vocab-n">${w.count || 0}</span>
        </a>`).join('') || '<p class="muted">沒有對上的單字。</p>'}</div>`;
      return;
    }
    const order = [['prefix', '字首'], ['root', '字根'], ['suffix', '字尾']];
    const blocks = order.map(([k, name]) => {
      const list = affixes.filter((a) => a.kind === k);
      if (!list.length) return '';
      return `<section class="card"><h3>${name}</h3><div class="vocab-affix">${list.map((a) => `<a class="vocab-affix-item" href="#learn-en/roots/${encodeURIComponent(a.id)}">
        <b>${esc(a.form || a.id)}</b><span>${esc(a.zh || '')}</span><em>${(a.words || []).length}</em>
      </a>`).join('')}</div></section>`;
    }).join('');
    const head = typeof pageHead === 'function'
      ? pageHead('英文', '字根字首表', '只列出單字庫裡真的有拆開的字首、字根、字尾。點一列看包含它的單字。')
      : '<h2>字根字首表</h2>';
    app.innerHTML = `${subjectChrome('en')}${enSeg('vocab')}${head}${vocabSubnav('roots')}${blocks || '<section class="card"><p class="muted">目前沒有可拆的字根或字首。</p></section>'}`;
  }

  return {
    viewLearn, viewPro, viewMock, viewZhQuizHub, viewEn, viewMath, viewTips, viewFavs,
    viewBank, viewFormulas, viewLearned, viewSubjects, viewPath, viewProgress,
    todaySuggestions, weaknessHtml, stopRunner, getStats, accuracyOf, loadBank,
    bankSummary, countSeen, practicedToday, pathSnapshot,
    pathModel, subjectChrome, tipsSectionHtml, lastLearnSubject, learnSubjectHref
  };
})();
