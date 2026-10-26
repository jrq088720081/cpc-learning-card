/* 個人通行碼閘門：只存 SHA-256 雜湊於 localStorage，本次分頁解鎖存 sessionStorage。 */
(function () {
  const HK = 'cpc_gate_hash', HINT = 'cpc_gate_hint', OK = 'cpc_gate_ok', OFF = 'cpc_gate_off';
  async function sha(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cpc-card:' + s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  const e = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function overlay(html) {
    let el = document.getElementById('gate');
    if (!el) { el = document.createElement('div'); el.id = 'gate'; document.body.appendChild(el); }
    el.innerHTML = `<div class="gate-card">${html}<p class="gate-note">網址請勿公開張貼；要給別人用再自行告知通行碼。</p></div>`;
    document.documentElement.classList.add('gated');
    return el;
  }
  function done() { const el = document.getElementById('gate'); if (el) el.remove(); document.documentElement.classList.remove('gated'); }
  function setup(onDone, title) {
    const el = overlay(`<h2>${title || '設定通行碼'}</h2><p class="muted small">之後開啟這個 App 需要輸入（至少 4 字）。只存在這台裝置，忘記只能清除網站資料重設。</p>
      <input type="password" id="g1" placeholder="通行碼" autocomplete="new-password">
      <input type="password" id="g2" placeholder="再輸入一次" autocomplete="new-password">
      <input type="text" id="gh" placeholder="提示（選填，別寫通行碼本身）">
      <p class="gate-err" id="ge"></p><button type="button" class="btn btn-primary" id="gs">設定並進入</button>`);
    el.querySelector('#gs').onclick = async () => {
      const a = el.querySelector('#g1').value, b = el.querySelector('#g2').value;
      const err = el.querySelector('#ge');
      if (a.length < 4) { err.textContent = '至少 4 個字'; return; }
      if (a !== b) { err.textContent = '兩次不一樣'; return; }
      localStorage.setItem(HK, await sha(a));
      localStorage.setItem(HINT, el.querySelector('#gh').value.trim());
      localStorage.removeItem(OFF);
      sessionStorage.setItem(OK, '1'); done(); onDone && onDone();
    };
  }
  function unlock() {
    const hint = localStorage.getItem(HINT);
    const el = overlay(`<h2>🔒 中油學習卡</h2><p class="muted small">請輸入通行碼</p>
      <input type="password" id="gp" placeholder="通行碼" autocomplete="current-password">
      ${hint ? `<p class="muted small">提示：${e(hint)}</p>` : ''}
      <p class="gate-err" id="ge"></p><button type="button" class="btn btn-primary" id="gu">解鎖</button>`);
    const go = async () => {
      if (await sha(el.querySelector('#gp').value) === localStorage.getItem(HK)) { sessionStorage.setItem(OK, '1'); done(); }
      else el.querySelector('#ge').textContent = '通行碼不對';
    };
    el.querySelector('#gu').onclick = go;
    el.querySelector('#gp').onkeydown = (ev) => { if (ev.key === 'Enter') go(); };
    setTimeout(() => el.querySelector('#gp').focus(), 50);
  }
  function check() {
    if (localStorage.getItem(OFF) === '1' || sessionStorage.getItem(OK) === '1') return;
    if (!localStorage.getItem(HK)) setup(); else unlock();
  }
  window.CpcGate = {
    isOn: () => localStorage.getItem(OFF) !== '1',
    async change() {
      if (localStorage.getItem(HK)) {
        const old = prompt('先輸入目前的通行碼');
        if (old == null) return;
        if (await sha(old) !== localStorage.getItem(HK)) { alert('通行碼不對'); return; }
      }
      setup(() => alert('通行碼已更新'), '變更通行碼');
    },
    async toggleOff(off) {
      if (off) {
        if (!confirm('不建議關閉：網址被猜到時任何人都能看到你的資料。確定關閉通行碼？')) return false;
        const old = localStorage.getItem(HK) ? prompt('輸入目前的通行碼以確認') : '';
        if (localStorage.getItem(HK) && (old == null || await sha(old) !== localStorage.getItem(HK))) { alert('通行碼不對'); return false; }
        localStorage.setItem(OFF, '1');
      } else { localStorage.removeItem(OFF); if (!localStorage.getItem(HK)) setup(); }
      return true;
    },
    lock() { sessionStorage.removeItem(OK); check(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check); else check();
})();
