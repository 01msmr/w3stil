// ==UserScript==
// @name        reduce-ticker
// @namespace   msmr.co
// @version     0.7.0
// @description Kürzt Ressort-Chips und formatiert Tagesköpfe der Newsticker
// @author      msmr
// @license     MIT
// @match       https://www.heise.de/newsticker*
// @match       https://www.heise.de/mac-and-i/newsticker*
// @match       https://www.golem.de/ticker*
// @run-at      document-idle
// @grant       none
// @noframes
// @updateURL   https://w3.msmr.co/reduce.user.js
// @downloadURL https://w3.msmr.co/reduce.user.js
// ==/UserScript==

/* Ergänzt reduce.user.css um das, was CSS nicht kann: Text umschreiben.
 * Die Ressort-Chips sind nackte Text-Spans ohne unterscheidbare Attribute —
 * per Stylesheet lässt sich weder "heise" noch "Magazin" gezielt entfernen
 * (kein :contains(), und die Artikel-URLs korrelieren nicht mit dem Ressort;
 * geprüft am 2026-08-18 über alle 280 Zeilen des Tickers).
 *
 * Aus "heise security" wird "security", aus "Mac & i Magazin" wird "Mac & i".
 * "heise online" verschwindet ganz: es ist das Standard-Ressort des Tickers
 * und trägt dort keine Information. Auf dem Mac-&-i-Ticker gilt dasselbe
 * für "Mac & i Magazin" (dort ist ALLES Mac & i); fremde Brandings wie
 * "heise security" bleiben und werden nur gekürzt.
 *
 * heise liefert die Chips über zwei verschiedene Auszeichnungen aus — mal als
 * span.whitespace-nowrap unter h3 + div, mal mit data-component="Branding".
 * Beide Wege laufen deshalb durch DIESELBE Entscheidungsfunktion (chipText).
 * Vorher hatte jeder Selektor seine eigene Regelmenge, und die des
 * Branding-Zweigs kannte den Entfernen-Fall nicht: Sobald heise auf Branding
 * umstellte, wurde aus "heise online" ein Chip mit der Aufschrift "ONLINE",
 * statt zu verschwinden. Kommt ein dritter Auslieferungsweg dazu, ist das
 * eine Zeile in ZIELE — keine zweite Regelmenge.
 *
 * Die Tagesköpfe verlieren ihr "Heute –"/"Gestern –" (das Datum daneben
 * sagt dasselbe) und werden auf beiden Seiten einheitlich als
 * "Montag, den 17. August 2026" ausgeschrieben. Nach dem Umformen matcht
 * das Datums-Muster nicht mehr — der MutationObserver läuft leer durch.
 *
 * Gelesen-Marker: das Skript injiziert in jeden Uhrzeit-Chip (golem,
 * heise-Ticker) ein leeres <i class="w3-check">, auf Mac & i zusätzlich
 * Platte und Häkchen in jeden Zeilen-Link. Die Optik kommt komplett aus
 * dem Style; hier entstehen nur die ECHTEN Elemente, weil WebKit
 * :visited-Farben nicht auf Pseudo-Elemente anwendet — auf iOS blieben
 * die Häkchen sonst unsichtbar.
 *
 * Richtungs-Snapping: nach jedem Scrollen gleitet die Seite zum nächsten
 * Tageskopf IN Scrollrichtung — nie rückwärts. Auf golem und dem
 * heise-Ticker (viele Zeilen je Tag) greift der Sog nur in einem engen
 * Bereich um das Ziel (~30% der Fensterhöhe, ≈250px), sonst ließe sich
 * das Innere langer Tage nie in Ruhe lesen; der kurze Mac-&-i-Ticker
 * zieht über jede Entfernung an. CSS-Snap (proximity) kann beides nicht:
 * sein Fangradius ist browserintern, und er springt auch gegen die
 * Scrollrichtung zurück. Während der Gleitfahrt sind Scroll-Ereignisse
 * stummgeschaltet, sonst fütterte die eigene Animation die Richtungslogik.
 *
 * "heise+ exklusiv" bleibt unangetastet: das Plus hängt am Markennamen, ohne
 * ihn bliebe nur "exklusiv" übrig. Einwortige Chips ("bestenlisten", "WTF")
 * ändern sich nicht.
 *
 * Der MutationObserver deckt nachgeladene Zeilen ab (Blättern, "mehr laden").
 * Er löst durch die eigenen Ersetzungen erneut aus, läuft dann aber leer
 * durch, weil nichts mehr zu ersetzen ist — keine Schleife.
 *
 * Bewusst ohne Versions-Automatik: das Skript ist statisch, die Version wird
 * bei der seltenen Änderung von Hand erhöht. */

(() => {
  'use strict';

  const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember'];

  // ── Ressort-Chips ────────────────────────────────────────────────────

  /* Auf dem Mac-&-i-Ticker trägt "Mac & i" keine Information — dort ist alles
   * Mac & i. Im Haupt-Ticker unterscheidet das Chip sehr wohl und bleibt. */
  const MACI = location.pathname.startsWith('/mac-and-i');

  /* Alle bekannten Auslieferungswege der Chips. Neue Fassung von heise?
   * Hier eine Zeile ergänzen — die Regeln stehen nur in chipText(). */
  const ZIELE = [
    'article h3 + div > span.whitespace-nowrap',
    '[data-component="Branding"]',
  ];

  /* null      → Element entfernen
   * undefined → unverändert lassen
   * String    → neuer Text */
  const chipText = (roh) => {
    const t = roh.trim();
    if (!t) return undefined;
    if (/^heise\s+online$/i.test(t)) return null;
    if (MACI && /^mac\s*&\s*i(\s+magazin)?$/i.test(t)) return null;
    const kurz = t.replace(/^heise\s+/i, '').replace(/\s+Magazin$/i, '');
    return kurz === roh ? undefined : kurz;
  };

  const chips = () => {
    for (const sel of ZIELE) {
      for (const el of document.querySelectorAll(sel)) {
        /* textContent würde Kindknoten löschen. Enthält das Chip Elemente
         * (SVG, sr-only-Text), nur den ersten Textknoten anfassen. */
        const neu = chipText(el.textContent);
        if (neu === null) {
          el.remove();
        } else if (neu !== undefined) {
          const node = [...el.childNodes].find(
            (n) => n.nodeType === 3 && n.nodeValue.trim()
          );
          if (el.children.length && node) node.nodeValue = neu;
          else el.textContent = neu;
        }
      }
    }
  };

  // ── Tagesköpfe ───────────────────────────────────────────────────────

  const KOEPFE =
    'section > div:first-child > h2, ' +
    '.go-col:has(.ticker-list) > h2';

  const koepfe = () => {
    for (const el of document.querySelectorAll(KOEPFE)) {
      const t = el.textContent;
      let kurz = t.replace(/^\s*(heute|gestern)\s*[\u2013\u2014-]\s*/i, '');
      kurz = kurz.replace(
        /^(\S+),\s*(?:den\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/,
        (_, wd, d, m, y) => wd + ', den ' + (+d) + '. ' + MONATE[+m - 1] + ' ' + y
      );
      if (kurz !== t) el.textContent = kurz;
    }
  };

  // ── Gelesen-Marker (echte Elemente für :visited, s. Kopfkommentar) ──

  const marker = () => {
    for (const chip of document.querySelectorAll(
      '.go-ticker-teaser__datetime, article > a > time'
    )) {
      if (!chip.querySelector(':scope > .w3-check')) {
        const i = document.createElement('i');
        i.className = 'w3-check';
        chip.appendChild(i);
      }
    }
    if (!MACI) return;
    for (const a of document.querySelectorAll(
      'article[data-teaser-name="HorizontalTimelineTeaser"] > a'
    )) {
      if (!a.querySelector(':scope > .w3-plate')) {
        const p = document.createElement('i');
        p.className = 'w3-plate';
        const c = document.createElement('i');
        c.className = 'w3-check';
        a.append(p, c);
      }
    }
  };

  const trim = () => {
    chips();
    koepfe();
    marker();
  };

  trim();
  new MutationObserver(trim).observe(document.body, {
    childList: true,
    subtree: true,
  });

  // ── Richtungs-Snapping an den Tagesköpfen ────────────────────────────

  const SNAP_ZIELE =
    '.go-col:has(.ticker-list) > h2, ' +                       // golem
    'section:has(article > a > time) > div:first-child, ' +    // heise-Ticker
    'div:has(> section > article[data-teaser-name="HorizontalTimelineTeaser"]) > h2'; // Mac & i

  const RUHE_MS = 150;   // so lange muss das Scrollen stehen, bevor gesnappt wird

  /* Zielposition: so viel Raum bleibt über dem Kopf. Mobil fast nichts —
   * unter der iOS-Statusleiste soll kein Rest des Vortags stehen; auf
   * Mac & i sogar leicht negativ, der Kopf rückt bis an die Leiste. */
  const luft = () =>
    window.innerWidth < 700 ? (MACI ? -6 : 2) : 12;

  /* Anzieh-Reichweite: auf Seiten mit langen Tagen (golem, heise-Ticker)
   * greift der Snap nur nahe am Ziel — relativ zur Fensterhöhe, damit sich
   * das Verhalten kleinen Fenstern anpasst. Mac & i: unbegrenzt. */
  const BEGRENZT = !MACI;
  const reichweite = () =>
    BEGRENZT ? Math.round(window.innerHeight * 0.3) : Infinity;

  /* Richtung wird KUMULIERT gegen einen Referenzpunkt gemessen, nicht pro
   * Event: Trackpads liefern viele ~1px-Events, eine Schwelle pro Event
   * würde echte Scrolls als Jitter verwerfen und das Snapping lahmlegen. */
  let refY = window.scrollY;
  let richtung = 0;
  let timer = null;
  let faehrt = false;

  /* Verriegelung: nach jedem Andocken merkt sich das Skript den Landepunkt.
   * Solange die Position keine 24px davon entfernt ist, wird NICHT gesnappt
   * — egal, welche Events noch eintrudeln. Erst eine echte neue Scroll-
   * Bewegung über diese Schwelle hinaus entriegelt. Damit ist eine Kette
   * aus aufeinanderfolgenden Snaps kategorisch ausgeschlossen. */
  let riegel = null;

  const snap = () => {
    if (!richtung) return;
    const y = window.scrollY;
    const ziele = [...document.querySelectorAll(SNAP_ZIELE)]
      .map((el) => Math.round(el.getBoundingClientRect().top + y - luft()))
      .sort((a, b) => a - b);
    const ziel = richtung > 0
      ? ziele.find((t) => t > y + 4)
      : [...ziele].reverse().find((t) => t < y - 4);
    if (ziel == null) return;
    if (Math.abs(ziel - y) > reichweite()) return;

    faehrt = true;
    window.scrollTo({ top: ziel, behavior: 'smooth' });
    const ende = () => {
      if (Math.abs(window.scrollY - ziel) < 2) fertig();
    };
    const fertig = () => {
      clearInterval(watch);
      faehrt = false;

      /* Richtung nullen, sonst stößt das letzte Scroll-Event der eigenen
       * Gleitfahrt den nächsten Snap an und die Seite kettet sich bis zum
       * letzten Tageskopf durch. */
      richtung = 0;
      refY = window.scrollY;
      riegel = window.scrollY;
    };
    const watch = setInterval(ende, 80);
    setTimeout(fertig, 1200); // Notausstieg, falls das Ziel nie exakt erreicht wird
  };

  window.addEventListener('scroll', () => {
    if (faehrt) return;
    const y = window.scrollY;

    /* Verriegelt: refY bleibt auf dem Landepunkt stehen — beim Entriegeln
     * liegt die kumulierte Distanz dann sofort über der Schwelle und die
     * Richtung stimmt. */
    if (riegel !== null) {
      if (Math.abs(y - riegel) < 24) return;
      riegel = null;
    }

    const d = y - refY;
    if (Math.abs(d) > 4) {
      richtung = d > 0 ? 1 : -1;
      refY = y;
    }
    clearTimeout(timer);
    timer = setTimeout(snap, RUHE_MS);
  }, { passive: true });
})();
