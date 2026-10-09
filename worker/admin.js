// The moderation page. It contains no data: everything is loaded from /api/admin/* with the admin token, which the
// reviewer types in and which is kept in sessionStorage for this tab only. Submitted text is always escaped.
export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Review queue · The Car Archive</title>
<style>
:root{--bg:#f6f4ef;--ink:#20231f;--muted:#646a5e;--line:#cecec4;--accent:#293829;--bad:#8a2f1f}
@media (prefers-color-scheme:dark){:root{--bg:#151714;--ink:#ecebe5;--muted:#a3a99b;--line:#3a3f37;--accent:#b9d3b5;--bad:#e7967f}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 Arial,Helvetica,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 60px}
h1{font:normal 34px Georgia,serif;margin:0 0 6px} h2{font:normal 22px Georgia,serif;margin:28px 0 8px}
.muted{color:var(--muted)} input,textarea,select,button{font:inherit;color:inherit}
input,textarea,select{background:transparent;border:1px solid var(--line);padding:8px;width:100%;box-sizing:border-box}
button{border:1px solid var(--accent);background:transparent;padding:7px 14px;cursor:pointer;border-radius:3px}
button.primary{background:var(--accent);color:var(--bg)} button.bad{border-color:var(--bad);color:var(--bad)}
button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.card{border:1px solid var(--line);padding:14px 16px;margin:14px 0}
dl{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin:8px 0} dt{color:var(--muted)} dd{margin:0;overflow-wrap:anywhere}
textarea.json{font:12px/1.4 ui-monospace,monospace;min-height:150px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.4 ui-monospace,monospace;border:1px solid var(--line);padding:10px}
.msg{min-height:1.5em}.err{color:var(--bad)}
@media(max-width:600px){dl{grid-template-columns:1fr}}
</style></head>
<body><main>
<h1>Review queue</h1>
<p class="muted">Suggestions are private until approved. Approving with an overlay entry prepares a data change (see data/SCHEMA.md, Overlay); it reaches the site only after it is exported into data/overlay.json, checked with <code>node scripts/check-data.mjs</code>, committed and deployed. “Approve as a lead” accepts a suggestion that needs research (a missing car, a photo) without changing data. Links open in a new tab: check them before approving. This page never fetches them.</p>
<form id="login" class="row" autocomplete="off"><label for="tok" class="muted">Admin token</label><input id="tok" type="password" style="max-width:360px" required><button class="primary">Unlock</button></form>
<div id="app" hidden>
  <div class="row" role="group" aria-label="Status">
    <button data-st="pending" class="primary">Pending</button><button data-st="approved">Approved</button><button data-st="rejected">Rejected</button>
    <button id="lock" type="button">Lock</button>
  </div>
  <p class="msg" id="msg" role="status"></p>
  <div id="list"></div>
  <h2>Export approved changes</h2>
  <p class="muted">Copy these entries into the "entries" list of data/overlay.json (or save as a file and run <code>node scripts/apply-overlay-export.mjs export.json</code>), commit, then mark them exported.</p>
  <div class="row"><button id="exp" type="button">Load approved, not yet exported</button><button id="mark" type="button" disabled>Mark these as exported</button></div>
  <pre id="out" hidden></pre>
</div>
<script>
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = u => /^https?:\\/\\//i.test(u || '') ? esc(u) : '#';
  let token = sessionStorage.getItem('ca-admin') || '';
  let status = 'pending', exported = [];
  const api = async (path, opts = {}) => {
    const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { lock(); throw new Error('Wrong token.'); }
    if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')');
    return j;
  };
  const say = (t, bad) => { $('#msg').textContent = t; $('#msg').className = 'msg' + (bad ? ' err' : ''); };
  function lock() { token = ''; sessionStorage.removeItem('ca-admin'); $('#app').hidden = true; $('#login').hidden = false; }
  async function load() {
    say('Loading…');
    try {
      const j = await api('/api/admin/submissions?status=' + status);
      say(j.submissions.length + ' ' + status);
      $('#list').innerHTML = j.submissions.map(s => \`
        <article class="card" data-id="\${s.id}">
          <div class="row"><b>#\${s.id} · \${({ car: 'Suggest a car', source: 'Source or photo', correction: 'Correction' })[s.type] || esc(s.type)}</b><span class="muted">\${new Date(s.created_at).toLocaleString()}</span></div>
          <dl>
            <dt>Car</dt><dd>\${esc(s.make)} \${esc(s.model)} \${esc(s.generation || '')}</dd>
            <dt>Market</dt><dd>\${esc(s.market || '–')}</dd><dt>Year</dt><dd>\${esc(s.year || '–')} \${s.year_kind ? '(' + esc(s.year_kind) + ' year)' : ''}</dd>
            <dt>Source</dt><dd>\${s.source_url ? \`<a href="\${safeUrl(s.source_url)}" target="_blank" rel="noopener noreferrer nofollow">\${esc(s.source_url)}</a>\` : '–'}</dd>
            <dt>Photo page</dt><dd>\${s.photo_url ? \`<a href="\${safeUrl(s.photo_url)}" target="_blank" rel="noopener noreferrer nofollow">\${esc(s.photo_url)}</a>\` : '–'}</dd>
            <dt>Explanation</dt><dd>\${esc(s.note)}</dd>
            \${s.target ? \`<dt>Target</dt><dd>\${esc(s.target)}</dd>\` : ''}
            \${s.page ? \`<dt>Sent from</dt><dd><a href="\${esc(s.page)}" target="_blank" rel="noopener">\${esc(s.page)}</a></dd>\` : ''}
            \${s.review_note ? \`<dt>Review note</dt><dd>\${esc(s.review_note)}</dd>\` : ''}
          </dl>
          \${s.status === 'pending' ? \`
          <label class="muted" for="ov\${s.id}">Overlay entry (replace every TODO; use null to approve as a lead)</label>
          <textarea class="json" id="ov\${s.id}">\${esc(JSON.stringify(s.draft, null, 2))}</textarea>
          <label class="muted" for="note\${s.id}">Review note (private)</label><input id="note\${s.id}">
          <div class="row" style="margin-top:8px"><button class="primary" data-act="approve">Approve with this entry</button><button data-act="lead">Approve as a lead (no data change)</button><button class="bad" data-act="reject">Reject</button></div>\`
          : \`<pre>\${esc(JSON.stringify(s.draft, null, 2))}</pre>\`}
        </article>\`).join('') || '<p class="muted">Nothing here.</p>';
    } catch (e) { say(e.message, true); }
  }
  $('#login').addEventListener('submit', e => { e.preventDefault(); token = $('#tok').value; sessionStorage.setItem('ca-admin', token); $('#login').hidden = true; $('#app').hidden = false; load(); });
  $('#lock').addEventListener('click', lock);
  document.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => {
    status = b.dataset.st; document.querySelectorAll('[data-st]').forEach(x => x.classList.toggle('primary', x === b)); load();
  }));
  $('#list').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const card = b.closest('[data-id]'), id = card.dataset.id;
    let overlay = null;
    if (b.dataset.act === 'approve') {
      try { overlay = JSON.parse(card.querySelector('textarea').value); } catch { say('The overlay entry is not valid JSON.', true); return; }
    }
    const action = b.dataset.act === 'reject' ? 'reject' : 'approve';
    try {
      await api('/api/admin/submissions/' + id + '/review', { method: 'POST', body: JSON.stringify({ action, note: card.querySelector('input').value, overlay }) });
      say('#' + id + ' ' + (action === 'approve' ? 'approved' : 'rejected') + '.'); load();
    } catch (e2) { say(e2.message, true); }
  });
  $('#exp').addEventListener('click', async () => {
    try { const j = await api('/api/admin/export'); exported = j.submissions; $('#out').hidden = false; $('#out').textContent = JSON.stringify({ entries: j.entries }, null, 2); $('#mark').disabled = !exported.length; }
    catch (e) { say(e.message, true); }
  });
  $('#mark').addEventListener('click', async () => {
    try { const j = await api('/api/admin/export/mark', { method: 'POST', body: JSON.stringify({ submissions: exported }) }); say(j.marked + ' marked as exported.'); $('#mark').disabled = true; }
    catch (e) { say(e.message, true); }
  });
  if (token) { $('#login').hidden = true; $('#app').hidden = false; load(); }
})();
</script>
</main></body></html>`;
