// ==UserScript==
// @name         reduce · probe
// @namespace    msmr.dev
// @version      1.0.0
// @description  Struktur-Analyse und Selektor-Vorschläge zum Schreiben von src/<domain>.css
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @noframes
// ==/UserScript==

/* Entwicklungswerkzeug, gehört NICHT ins Auslieferungsartefakt.
 *
 * Standardweg ohne zweite Erweiterung: als DevTools-Snippet ausführen
 * (F12 → Sources → Snippets → einfügen → Ctrl+Enter). Der UserScript-Kopf
 * oben schadet dabei nicht, er ist nur ein Kommentar.
 *
 * Öffnen:  Ctrl+Alt+P  (oder Menübefehl "reduce · probe", falls doch ein
 *          Userscript-Manager installiert ist)
 * Picker:  Alt+Klick auf ein Element    (schlägt Selektoren dafür vor)
 */

(() => {
  'use strict';

  // ── Selektor-Stabilität ────────────────────────────────────────────────
  // Die Kernheuristik: Welcher Klassenname überlebt das nächste Deploy?

  const HASHED = [
    /^css-[a-z0-9]{5,}$/i,                      // emotion
    /^sc-[A-Za-z]{6,}$/,                        // styled-components
    /^[A-Za-z]+_[A-Za-z]+__[A-Za-z0-9]{5,}$/,   // CSS Modules
    /^[a-z]{1,2}[A-Z0-9][A-Za-z0-9]{4,}$/,      // minifiziertn
    /^_[A-Za-z0-9]{5,}$/,
    /^[a-f0-9]{6,}$/i,                          // reiner Hash
    /^(?:[a-z]+-)?[0-9]{4,}$/,
  ];

  const SEMANTIC = /^(sidebar|side-bar|aside|header|footer|nav|navigation|content|main|article|post|entry|body|wrapper|container|comment|related|ad|banner|promo|teaser|toc|meta|byline|caption|figure)/i;

  const entropy = (s) => {
    const f = Object.create(null);
    for (const c of s) f[c] = (f[c] || 0) + 1;
    return -Object.values(f).reduce((a, n) => {
      const p = n / s.length;
      return a + p * Math.log2(p);
    }, 0);
  };

  /** 0 = wegwerfen … 1 = verlässlich */
  const stability = (cls) => {
    if (!cls || cls.length < 3) return 0;
    if (HASHED.some((r) => r.test(cls))) return 0;
    if (/^(is|has|js|active|open|visible|hidden)[-_]?/i.test(cls)) return 0.15;
    if (SEMANTIC.test(cls)) return 0.9;
    if (entropy(cls) > 3.7 && !/[-_]/.test(cls)) return 0.25;
    if (/[-_]/.test(cls)) return 0.7;
    return 0.5;
  };

  const STABLE_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-component', 'data-qa', 'itemprop', 'aria-label'];

  const count = (sel) => {
    try {
      return document.querySelectorAll(sel).length;
    } catch {
      return -1;
    }
  };

  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, '\\$1'));

  /**
   * Liefert Selektor-Kandidaten für ein Element, sortiert nach
   * Haltbarkeit × Präzision. Bewusst KEIN nth-child, kein Pfad aus
   * Positionsindizes — das ist genau das, was in sechs Monaten bricht.
   */
  function suggest(el) {
    const out = [];
    const add = (sel, score, why) => {
      const n = count(sel);
      if (n <= 0) return;
      out.push({ sel, n, why, score: score * (n === 1 ? 1 : n <= 4 ? 0.85 : 0.6) });
    };

    const tag = el.tagName.toLowerCase();

    if (/^(main|article|aside|nav|header|footer|figure|figcaption)$/.test(tag)) {
      add(tag, 1, 'semantisches Element');
    }

    const role = el.getAttribute('role');
    if (role) add(`[role="${role}"]`, 0.95, 'ARIA-Landmark');

    for (const a of STABLE_ATTRS) {
      const v = el.getAttribute(a);
      if (v && v.length < 40) add(`[${a}="${esc(v)}"]`, 0.85, `stabiles Attribut ${a}`);
    }

    if (el.id && stability(el.id) > 0.4) add(`#${esc(el.id)}`, 0.8, 'ID');

    const classes = [...el.classList]
      .map((c) => ({ c, s: stability(c) }))
      .sort((a, b) => b.s - a.s);

    for (const { c, s } of classes.slice(0, 3)) {
      if (s >= 0.5) add(`.${esc(c)}`, s * 0.8, `Klasse (Stabilität ${s.toFixed(2)})`);
    }

    // Strukturell: "das Element, das X enthält" statt "das zweite Kind"
    for (const anchor of ['main', 'article', '[role="main"]', 'h1']) {
      if (el.querySelector(anchor)) {
        const parentTag = el.parentElement === document.body ? 'body > ' : '';
        add(`${parentTag}${tag}:has(> ${anchor})`, 0.75, `strukturell (enthält ${anchor})`);
        add(`${parentTag}${tag}:has(${anchor})`, 0.65, `strukturell (Nachfahre ${anchor})`);
      }
    }

    // Kombination aus zwei mittelmäßigen Klassen ist oft besser als eine gute
    if (classes.length >= 2 && classes[0].s >= 0.5 && classes[1].s >= 0.5) {
      add(`.${esc(classes[0].c)}.${esc(classes[1].c)}`, 0.7, 'Klassen-Kombination');
    }

    const seen = new Set();
    return out
      .filter((o) => (seen.has(o.sel) ? false : seen.add(o.sel)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }

  // ── Analysen ───────────────────────────────────────────────────────────

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /** Textdichte nach Readability-Prinzip: Zeichen abzüglich Linktext. */
  function density(el) {
    const total = (el.textContent || '').trim().length;
    if (total < 200) return 0;
    let link = 0;
    for (const a of el.querySelectorAll('a')) link += (a.textContent || '').length;
    const depth = el.querySelectorAll('*').length || 1;
    return ((total - link) / Math.sqrt(depth)) * (1 - link / total);
  }

  function contentRoots() {
    const cands = [...document.querySelectorAll('main, article, [role="main"], div, section')]
      .filter(visible)
      .map((el) => ({ el, d: density(el) }))
      .filter((x) => x.d > 20)
      .sort((a, b) => b.d - a.d)
      .slice(0, 5);
    return cands;
  }

  function layoutContext(el) {
    const notes = [];
    let p = el.parentElement;
    for (let i = 0; i < 4 && p && p !== document.documentElement; i++, p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === 'grid') {
        notes.push({
          el: p,
          hint: `grid — grid-template-columns: ${cs.gridTemplateColumns}`,
          fix: 'display: block !important  (am Container, nicht am Kind)',
        });
      } else if (cs.display === 'flex' && cs.flexDirection.startsWith('row')) {
        notes.push({ el: p, hint: 'flex row', fix: 'flex-direction: column !important' });
      } else if (cs.maxWidth !== 'none') {
        notes.push({ el: p, hint: `max-width: ${cs.maxWidth}`, fix: 'max-width: none !important' });
      }
    }
    return notes;
  }

  function sidebars() {
    const sel = 'aside, [role="complementary"], [class*="sidebar" i], [id*="sidebar" i], [class*="related" i], [class*="recommend" i]';
    return [...document.querySelectorAll(sel)].filter(visible);
  }

  function stickies() {
    return [...document.querySelectorAll('body *')]
      .filter((el) => {
        const cs = getComputedStyle(el);
        return (cs.position === 'sticky' || cs.position === 'fixed') && visible(el);
      })
      .sort((a, b) => (parseInt(getComputedStyle(b).zIndex) || 0) - (parseInt(getComputedStyle(a).zIndex) || 0))
      .slice(0, 12);
  }

  function shadowRoots() {
    const found = [];
    const walk = (root, path) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          found.push({ path: path + ' > ' + el.tagName.toLowerCase(), open: true });
          walk(el.shadowRoot, path + ' > ' + el.tagName.toLowerCase());
        }
      }
    };
    walk(document, '');
    // geschlossene Roots sind von außen nicht auffindbar — Heuristik:
    const customs = [...document.querySelectorAll('*')].filter(
      (el) => el.tagName.includes('-') && !el.shadowRoot && el.children.length === 0 && visible(el)
    );
    for (const el of customs.slice(0, 6)) found.push({ path: el.tagName.toLowerCase(), open: false });
    return found;
  }

  function inlineImportant() {
    return [...document.querySelectorAll('[style*="!important"]')].slice(0, 10);
  }

  // ── UI ─────────────────────────────────────────────────────────────────
  // Eigener Shadow Root mit all:initial, sonst frisst _reset.css das Panel.

  let host, root, panel;

  const CSS_UI = `
    :host { all: initial; }
    .p {
      position: fixed; inset-block-start: 12px; inset-inline-end: 12px;
      width: 420px; max-height: 84vh; overflow: auto; z-index: 2147483647;
      background: #101014; color: #d7d7cf;
      font: 12px/1.5 ui-monospace, "IBM Plex Mono", Menlo, monospace;
      border: 1px solid #35352c; padding: 10px 12px 14px;
      box-shadow: 0 8px 40px rgba(0,0,0,.5);
    }
    h2 { font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
         color: #8a8a7a; margin: 14px 0 6px; font-weight: 500; }
    h2:first-of-type { margin-top: 6px; }
    .hd { display: flex; justify-content: space-between; align-items: baseline;
          border-bottom: 1px solid #35352c; padding-bottom: 6px; }
    .hd b { color: #e8e455; font-weight: 500; }
    .r { padding: 4px 0; border-bottom: 1px dotted #2a2a22; }
    code { color: #9ecbff; cursor: pointer; word-break: break-all; }
    code:hover { color: #fff; background: #24242c; }
    .m { color: #6f6f62; }
    .ok { color: #7fd18e; } .warn { color: #e8b45c; } .bad { color: #e07a6a; }
    button { font: inherit; background: #24242c; color: #d7d7cf;
             border: 1px solid #3a3a30; padding: 3px 8px; cursor: pointer; }
    button:hover { background: #32323c; }
    textarea { width: 100%; height: 160px; background: #0a0a0c; color: #d7d7cf;
               border: 1px solid #35352c; font: inherit; padding: 6px; }
    .row { display: flex; gap: 6px; margin-top: 8px; }
  `;

  const bar = (v) => {
    const n = Math.round(v * 5);
    return `<span class="${v >= 0.7 ? 'ok' : v >= 0.4 ? 'warn' : 'bad'}">${'█'.repeat(n)}${'░'.repeat(5 - n)}</span>`;
  };

  function hi(el) {
    el.style.outline = '2px solid #e8e455';
    el.style.outlineOffset = '-2px';
    setTimeout(() => {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }, 1600);
    el.scrollIntoView({ block: 'center' });
  }

  function line(el, extra = '') {
    const s = suggest(el);
    const best = s[0];
    if (!best) return `<div class="r"><span class="bad">kein stabiler Selektor</span> ${extra}</div>`;
    return `<div class="r"><code data-sel="${best.sel.replace(/"/g, '&quot;')}">${best.sel}</code>
      <span class="m">×${best.n} · ${best.why}</span> ${bar(best.score)} ${extra}</div>`;
  }

  function render() {
    const roots = contentRoots();
    const main = roots[0]?.el;
    const ctx = main ? layoutContext(main) : [];
    const sh = shadowRoots();

    panel.innerHTML = `
      <div class="hd"><b>reduce · probe</b><span class="m">${location.hostname}</span></div>

      <h2>Content-Root (Textdichte)</h2>
      ${roots.map((r) => line(r.el, `<span class="m">d=${Math.round(r.d)}</span>`)).join('') || '<div class="r m">nichts gefunden</div>'}

      <h2>Layout-Kontext</h2>
      ${ctx.length
        ? ctx.map((c) => `<div class="r">${c.hint}<br><span class="m">→ ${c.fix}</span></div>`).join('')
        : '<div class="r m">kein Grid/Flex-Zwang — max-width am Content reicht</div>'}

      <h2>Sidebars &amp; Ballast</h2>
      ${sidebars().slice(0, 8).map((el) => line(el)).join('') || '<div class="r m">keine gefunden</div>'}

      <h2>Sticky / Fixed</h2>
      ${stickies().map((el) => line(el, `<span class="m">z=${getComputedStyle(el).zIndex}</span>`)).join('') || '<div class="r m">keine</div>'}

      <h2>Shadow DOM</h2>
      ${sh.length
        ? sh.slice(0, 8).map((s) => `<div class="r ${s.open ? 'warn' : 'bad'}">${s.path} <span class="m">${s.open ? 'offen — CSS erreicht es nicht ohne ::part' : 'evtl. geschlossen'}</span></div>`).join('')
        : '<div class="r ok">keins — reines CSS reicht</div>'}

      <h2>Inline !important</h2>
      ${inlineImportant().length
        ? `<div class="r warn">${inlineImportant().length} Element(e) — hier rettet dich die User-Origin von Stylus</div>`
        : '<div class="r ok">keins</div>'}

      <div class="row">
        <button id="gen">CSS-Entwurf</button>
        <button id="pick">Alt+Klick-Picker</button>
        <button id="close">schließen</button>
      </div>
      <div id="outwrap"></div>
    `;

    panel.querySelectorAll('code[data-sel]').forEach((c) => {
      c.addEventListener('click', () => {
        const el = document.querySelector(c.dataset.sel);
        if (el) hi(el);
      });
    });

    panel.querySelector('#close').onclick = () => host.remove();
    panel.querySelector('#pick').onclick = () => {
      pickMode = !pickMode;
      panel.querySelector('#pick').textContent = pickMode ? 'Picker AN — Alt+Klick' : 'Alt+Klick-Picker';
    };
    panel.querySelector('#gen').onclick = () => {
      const css = draft();
      panel.querySelector('#outwrap').innerHTML =
        `<h2>src/${location.hostname.replace(/^www\./, '')}.css</h2><textarea>${css}</textarea>
         <div class="row"><button id="copy">kopieren</button></div>`;
      panel.querySelector('#copy').onclick = () => {
        if (typeof GM_setClipboard === 'function') GM_setClipboard(css, 'text');
        else navigator.clipboard.writeText(css);
        panel.querySelector('#copy').textContent = 'kopiert ✓';
      };
    };
  }

  function draft() {
    const domain = location.hostname.replace(/^www\./, '');
    const roots = contentRoots();
    const main = roots[0]?.el;
    const mainSel = main ? suggest(main)[0] : null;
    const hide = sidebars()
      .map((el) => suggest(el)[0])
      .filter((s) => s && s.score >= 0.4)
      .map((s) => s.sel);

    const uniq = [...new Set(hide)];
    const lines = [`/* ${domain} — Entwurf aus probe, vor dem Commit prüfen */`, ''];

    if (mainSel) {
      lines.push(`/* expect: ${mainSel.n} */`);
      lines.push(`${mainSel.sel} {`);
      lines.push('  max-width: var(--rr-width) !important;');
      lines.push('  margin-inline: auto !important;');
      lines.push('}');
      lines.push('');
    }
    if (uniq.length) {
      lines.push(uniq.join(',\n') + ' {');
      lines.push('  display: none !important;');
      lines.push('}');
    }
    return lines.join('\n');
  }

  let pickMode = false;

  document.addEventListener(
    'click',
    (e) => {
      if (!pickMode || !e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.composedPath()[0];
      const s = suggest(el);
      panel.querySelector('#outwrap').innerHTML =
        `<h2>&lt;${el.tagName.toLowerCase()}&gt;</h2>` +
        (s.length
          ? s.map((o) => `<div class="r"><code data-sel="${o.sel.replace(/"/g, '&quot;')}">${o.sel}</code> <span class="m">×${o.n} · ${o.why}</span> ${bar(o.score)}</div>`).join('')
          : '<div class="r bad">kein stabiler Selektor — strukturell über den Parent gehen</div>');
    },
    true
  );

  function open() {
    if (host?.isConnected) {
      host.remove();
      return;
    }
    host = document.createElement('div');
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS_UI;
    panel = document.createElement('div');
    panel.className = 'p';
    root.append(style, panel);
    document.documentElement.append(host);
    render();
  }

  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('reduce · probe', open);

  addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && e.ctrlKey && e.code === 'KeyP') {
        e.preventDefault();
        open();
      }
    },
    true
  );
})();

