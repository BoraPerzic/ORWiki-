
/* archi-query-patch.js
   Upgrades the Archi HTML report query panel:
   - replaces the single <input> with a <textarea>
   - adds a Run button  (also triggered by Ctrl+Enter)
   - adds a collapsible saved-query library
   - adds last-10 query history (sessionStorage)
   ---------------------------------------------------------------- */
(function () {
  'use strict';

  /* ── helpers ─────────────────────────────────────────────────── */
  const HISTORY_KEY = 'archi_query_history';
  const SAVED_KEY   = 'archi_saved_queries';

  function getHistory () {
    try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
  }
  function pushHistory (sql) {
    const h = getHistory().filter(q => q !== sql);
    h.unshift(sql);
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 10)));
  }
  function getSaved () {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); }
    catch { return []; }
  }
  function saveSaved (arr) {
    localStorage.setItem(SAVED_KEY, JSON.stringify(arr));
  }

  /* ── find and replace the original query input ───────────────── */
  function patchQueryInput (originalInput) {
    /* Build replacement DOM */
    const wrapper = document.createElement('div');
    wrapper.className = 'aqp-wrapper';

    /* ── textarea ── */
    const ta = document.createElement('textarea');
    ta.id          = originalInput.id   || 'aqp-textarea';
    ta.className   = 'aqp-textarea';
    ta.placeholder = 'Enter SQL — Ctrl+Enter to run\n\nExamples:\n  SELECT * FROM Elements\n  SELECT name, type FROM Elements WHERE type LIKE \'%Application%\'\n  SELECT e.name, v.name AS view FROM Elements e JOIN ViewsContent vc ON e.id=vc.contentid JOIN Views v ON vc.viewid=v.id';
    ta.spellcheck  = false;
    ta.rows        = 5;
    /* restore last value if any */
    const h0 = getHistory();
    if (h0.length) ta.value = h0[0];

    /* ── toolbar row ── */
    const toolbar = document.createElement('div');
    toolbar.className = 'aqp-toolbar';

    const runBtn = document.createElement('button');
    runBtn.className   = 'aqp-btn aqp-btn-run';
    runBtn.textContent = '▶  Run';
    runBtn.title       = 'Run query (Ctrl+Enter)';

    const saveBtn = document.createElement('button');
    saveBtn.className   = 'aqp-btn aqp-btn-save';
    saveBtn.textContent = '💾  Save';
    saveBtn.title       = 'Save this query';

    const libBtn = document.createElement('button');
    libBtn.className   = 'aqp-btn aqp-btn-lib';
    libBtn.textContent = '📂  Library';
    libBtn.title       = 'Show saved queries & history';

    const clearBtn = document.createElement('button');
    clearBtn.className   = 'aqp-btn aqp-btn-clear';
    clearBtn.textContent = '✕  Clear';
    clearBtn.title       = 'Clear textarea';

    toolbar.append(runBtn, saveBtn, libBtn, clearBtn);

    /* ── library panel ── */
    const lib = document.createElement('div');
    lib.className = 'aqp-lib';
    lib.hidden    = true;

    /* ── assemble ── */
    wrapper.append(ta, toolbar, lib);

    /* Replace original input */
    originalInput.replaceWith(wrapper);

    /* ── wire up events ───────────────────────────────────────── */

    /* execute the query using Archi's existing mechanism */
    function runQuery () {
      const sql = ta.value.trim();
      if (!sql) return;
      pushHistory(sql);
      /* Archi wires its query execution to the original input's value +
         a keypress / change event.  We fire both approaches:          */
      /* approach A – dispatch on a hidden proxy input Archi may still watch */
      let proxy = document.getElementById('_aqp_proxy_input');
      if (!proxy) {
        proxy = document.createElement('input');
        proxy.type = 'text';
        proxy.id   = '_aqp_proxy_input';
        proxy.style.cssText = 'position:absolute;opacity:0;width:0;height:0;pointer-events:none;';
        document.body.appendChild(proxy);
      }
      proxy.value = sql;
      proxy.dispatchEvent(new Event('change',  { bubbles: true }));
      proxy.dispatchEvent(new Event('input',   { bubbles: true }));
      const ke = new KeyboardEvent('keypress', { key:'Enter', keyCode:13, which:13, bubbles:true });
      proxy.dispatchEvent(ke);

      /* approach B – call alasql directly if window.alasql is available
         and Archi exposes a result-render function                      */
      if (window.alasql && typeof window.runQuery === 'function') {
        window.runQuery(sql);
      }
      /* approach C – look for any existing query runner Archi bound */
      const existing = document.querySelector('input[type=text][id*=quer], input[type=text][id*=sql]');
      if (existing && existing !== proxy) {
        existing.value = sql;
        existing.dispatchEvent(new KeyboardEvent('keypress', { key:'Enter', keyCode:13, which:13, bubbles:true }));
      }
    }

    runBtn.addEventListener('click', runQuery);

    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        runQuery();
      }
      /* allow Tab to insert spaces rather than jump focus */
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = s + 2;
      }
    });

    clearBtn.addEventListener('click', () => { ta.value = ''; ta.focus(); });

    saveBtn.addEventListener('click', () => {
      const sql = ta.value.trim();
      if (!sql) { alert('Nothing to save.'); return; }
      const name = prompt('Name for this query:', 'My query ' + (getSaved().length + 1));
      if (!name) return;
      const arr = getSaved();
      arr.push({ name, sql, ts: new Date().toISOString() });
      saveSaved(arr);
      renderLib();
      lib.hidden = false;
    });

    libBtn.addEventListener('click', () => {
      lib.hidden = !lib.hidden;
      if (!lib.hidden) renderLib();
    });

    function renderLib () {
      lib.innerHTML = '';

      /* saved queries */
      const saved = getSaved();
      if (saved.length) {
        const h3s = document.createElement('h3');
        h3s.className = 'aqp-lib-heading';
        h3s.textContent = '💾 Saved queries';
        lib.appendChild(h3s);
        saved.forEach((q, i) => {
          lib.appendChild(makeLibItem(q.name, q.sql, () => {
            const arr = getSaved();
            arr.splice(i, 1);
            saveSaved(arr);
            renderLib();
          }));
        });
      }

      /* history */
      const hist = getHistory();
      if (hist.length) {
        const h3h = document.createElement('h3');
        h3h.className = 'aqp-lib-heading';
        h3h.textContent = '🕑 Recent (this session)';
        lib.appendChild(h3h);
        hist.forEach(sql => {
          lib.appendChild(makeLibItem(sql.substring(0, 60) + (sql.length > 60 ? '…' : ''), sql, null));
        });
      }

      if (!saved.length && !hist.length) {
        lib.innerHTML = '<p class="aqp-lib-empty">No saved queries or history yet.</p>';
      }
    }

    function makeLibItem (label, sql, onDelete) {
      const row = document.createElement('div');
      row.className = 'aqp-lib-item';

      const lbl = document.createElement('span');
      lbl.className   = 'aqp-lib-label';
      lbl.textContent = label;
      lbl.title       = sql;
      lbl.addEventListener('click', () => { ta.value = sql; lib.hidden = true; ta.focus(); });

      row.appendChild(lbl);

      if (onDelete) {
        const del = document.createElement('button');
        del.className   = 'aqp-lib-del';
        del.textContent = '✕';
        del.title       = 'Delete';
        del.addEventListener('click', onDelete);
        row.appendChild(del);
      }
      return row;
    }
  }

  /* ── hunt for the original query input ───────────────────────── */
  function findAndPatch () {
    /* Archi's query input lives inside the query / model-purpose tab.
       Common selectors observed in Archi reports:                    */
    const candidates = [
      '#query-input',
      '#queryInput',
      'input[placeholder*="query" i]',
      'input[placeholder*="sql" i]',
      'input[placeholder*="SELECT" i]',
      '.query-input',
      'input[id*="query"]',
      'input[id*="sql"]',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.tagName === 'INPUT') {
        patchQueryInput(el);
        console.info('[archi-query-patch] patched:', sel);
        return true;
      }
    }
    return false;
  }

  /* try immediately, then observe for lazy-rendered tabs */
  function init () {
    if (findAndPatch()) return;
    /* MutationObserver for SPAs / lazy tab rendering */
    const obs = new MutationObserver(() => {
      if (findAndPatch()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    /* also re-try on tab clicks */
    document.addEventListener('click', () => {
      setTimeout(findAndPatch, 150);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
