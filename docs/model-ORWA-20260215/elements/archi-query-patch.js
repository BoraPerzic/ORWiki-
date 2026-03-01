
/* archi-query-patch.js  (v4 — Clear Results button + auto-scroll)
   ----------------------------------------------------------
   Upgrades the Archi HTML report query panel:
   - hides the original <input id="myprompt"> (kept in DOM, alasql owns it)
   - inserts a <textarea> + toolbar above the console output div
   - Run button and Ctrl+Enter call window.alasql.log(sql) directly —
     this is the exact internal path alasql.prompt uses, bypassing the
     broken synthetic-keydown approach (keyCode/which are read-only in
     modern browsers and cannot be spoofed via KeyboardEvent constructor)
   - adds saved-query library (localStorage) and session history
   ---------------------------------------------------------------- */
(function () {
  'use strict';

  const HISTORY_KEY = 'archi_query_history';
  const SAVED_KEY   = 'archi_saved_queries';

  /* ── storage helpers ─────────────────────────────────────────── */
  function getHistory() {
    try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]'); }
    catch(e) { return []; }
  }
  function pushHistory(sql) {
    const h = getHistory().filter(q => q !== sql);
    h.unshift(sql);
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 10)));
  }
  function getSaved() {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); }
    catch(e) { return []; }
  }
  function saveSaved(arr) {
    localStorage.setItem(SAVED_KEY, JSON.stringify(arr));
  }

  /* ── build and install the upgraded UI ──────────────────────── */
  function patchQueryInput(originalInput) {

    /* Archi's script has already called:
         alasql.options.logtarget = 'myconsole'
         alasql.prompt('myprompt', 'useid')
       Both are done before our script loads (we are injected before </body>
       but after the inline <script> block). The logtarget is correct.
       We do NOT need to touch alasql config. */

    /* Hide the original input — keep it in the DOM so alasql's internal
       reference to it (e.g. value clearing) doesn't break anything.      */
    originalInput.style.cssText =
      'position:absolute;opacity:0;width:0;height:0;pointer-events:none;overflow:hidden;';
    originalInput.setAttribute('aria-hidden', 'true');
    originalInput.removeAttribute('autofocus');

    /* ── textarea ── */
    const ta = document.createElement('textarea');
    ta.id          = 'aqp-textarea';
    ta.className   = 'aqp-textarea';
    ta.placeholder = [
      'Enter SQL \u2014 Ctrl+Enter or click \u25b6 Run',
      '',
      'Tables:  Elements \u00b7 Properties \u00b7 Relationships \u00b7 Views \u00b7 ViewsContent \u00b7 Folders \u00b7 FoldersContent',
      'Columns: Elements(id, type, name, documentation)',
      '         Properties(conceptid, propkey, propvalue)',
      '',
      'Examples:',
      '  SELECT * FROM Elements WHERE type = \'Capability\'',
      '  SELECT e.name, p.propvalue AS CMM',
      '  FROM Elements e JOIN Properties p ON p.conceptid = e.id',
      '  WHERE e.type = \'Capability\' AND p.propkey = \'CMM_Maturity\'',
      '  ORDER BY e.name',
    ].join('\n');
    ta.spellcheck  = false;
    ta.rows        = 5;
    const h0 = getHistory();
    if (h0.length) ta.value = h0[0];

    /* ── toolbar ── */
    const toolbar = document.createElement('div');
    toolbar.className = 'aqp-toolbar';

    const runBtn          = makeBtn('aqp-btn aqp-btn-run',          '\u25b6\u2002Run',           'Run query (Ctrl+Enter)');
    const saveBtn         = makeBtn('aqp-btn aqp-btn-save',         'Save',                      'Save this query to library');
    const libBtn          = makeBtn('aqp-btn aqp-btn-lib',          'Library',                   'Show saved queries and history');
    const clearBtn        = makeBtn('aqp-btn aqp-btn-clear',        '\u2715\u2002Clear',         'Clear editor');
    const clearResultsBtn = makeBtn('aqp-btn aqp-btn-clear-results','\u{1f5d1}\u2002Clear Results','Clear query results from #myconsole');
    toolbar.append(runBtn, saveBtn, libBtn, clearBtn, clearResultsBtn);

    /* ── library panel ── */
    const lib = document.createElement('div');
    lib.className = 'aqp-lib';
    lib.hidden    = true;

    /* ── wrapper — insert BEFORE #myconsole so output appears below editor ── */
    const wrapper = document.createElement('div');
    wrapper.className = 'aqp-wrapper';
    wrapper.append(ta, toolbar, lib);

    const consoleDiv = document.getElementById('myconsole');
    if (consoleDiv && consoleDiv.parentNode) {
      consoleDiv.parentNode.insertBefore(wrapper, consoleDiv);
    } else {
      /* fallback: insert before the original input's parent <p> */
      const p = originalInput.closest('p') || originalInput.parentNode;
      p.parentNode.insertBefore(wrapper, p);
    }

    /* ── runQuery — the core fix ─────────────────────────────── */
    function runQuery() {
      const sql = ta.value.trim();
      if (!sql) return;
      pushHistory(sql);

      /* alasql.log(sql) is exactly what alasql.prompt calls internally
         when the user presses Enter. It:
           1. Runs alasql(sql) against the in-memory tables
           2. Formats the result as an HTML table (or error message)
           3. Appends the HTML to document.getElementById(alasql.options.logtarget)
              which is already set to 'myconsole' by Archi's own script.
         We call it directly — no keyboard event simulation required.       */
      if (window.alasql) {
        try {
          window.alasql.log(sql);
          /* scroll results into view immediately after alasql writes to #myconsole */
          if (consoleDiv) {
            consoleDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } catch(err) {
          /* alasql.log can throw on parse errors before it reaches its own
             error handler — catch and write to myconsole ourselves.        */
          const target = document.getElementById(
            window.alasql.options && window.alasql.options.logtarget || 'myconsole'
          );
          if (target) {
            target.innerHTML +=
              '<p style="color:red;font-family:monospace">[Error] ' +
              err.message.replace(/</g,'&lt;') + '</p>';
          }
        }
      } else {
        alert('alasql is not available. Check that alasql.min.js loaded correctly.');
      }
    }

    runBtn.addEventListener('click', runQuery);

    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        runQuery();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = s + 2;
      }
    });

    clearBtn.addEventListener('click', () => { ta.value = ''; ta.focus(); });

    clearResultsBtn.addEventListener('click', () => {
      if (consoleDiv) consoleDiv.innerHTML = '';
    });

    saveBtn.addEventListener('click', () => {
      const sql = ta.value.trim();
      if (!sql) { alert('Nothing to save.'); return; }
      const name = prompt('Name for this query:', 'Query ' + (getSaved().length + 1));
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

    function renderLib() {
      lib.innerHTML = '';
      const saved = getSaved();
      if (saved.length) {
        lib.appendChild(libHeading('Saved queries'));
        saved.forEach((q, i) => {
          lib.appendChild(makeLibItem(q.name, q.sql, () => {
            const arr = getSaved(); arr.splice(i, 1); saveSaved(arr); renderLib();
          }));
        });
      }
      const hist = getHistory();
      if (hist.length) {
        lib.appendChild(libHeading('Recent (this session)'));
        hist.forEach(sql => {
          lib.appendChild(makeLibItem(
            sql.substring(0, 80) + (sql.length > 80 ? '\u2026' : ''), sql, null
          ));
        });
      }
      if (!saved.length && !hist.length) {
        lib.innerHTML = '<p class="aqp-lib-empty">No saved queries or history yet.</p>';
      }
    }

    function makeLibItem(label, sql, onDelete) {
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
        del.textContent = '\u2715';
        del.title       = 'Delete';
        del.addEventListener('click', onDelete);
        row.appendChild(del);
      }
      return row;
    }

    function libHeading(text) {
      const h = document.createElement('h3');
      h.className   = 'aqp-lib-heading';
      h.textContent = text;
      return h;
    }

    console.info('[archi-query-patch v3] patched — using direct alasql.log() execution');
    return true;
  }

  /* ── helpers ─────────────────────────────────────────────────── */
  function makeBtn(cls, text, title) {
    const b = document.createElement('button');
    b.className   = cls;
    b.textContent = text;
    b.title       = title;
    return b;
  }

  /* ── selector list — #myprompt first (Archi 5.6/5.7 confirmed) ─ */
  const CANDIDATES = [
    '#myprompt',                        /* Archi 5.6 / 5.7 — confirmed */
    '#query-input',
    '#queryInput',
    'input[id*="prompt"]',
    'input[placeholder*="query" i]',
    'input[placeholder*="sql" i]',
    'input[placeholder*="SELECT" i]',
    '.query-input',
    'input[id*="query"]',
    'input[id*="sql"]',
  ];

  function findAndPatch() {
    for (const sel of CANDIDATES) {
      const el = document.querySelector(sel);
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        if (el.dataset.aqpPatched) return true;
        el.dataset.aqpPatched = '1';
        return patchQueryInput(el);
      }
    }
    return false;
  }

  function init() {
    if (findAndPatch()) return;
    const obs = new MutationObserver(() => {
      if (findAndPatch()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', () => setTimeout(findAndPatch, 200));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
