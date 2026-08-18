// ==UserScript==
// @name        reduce-ticker
// @namespace   msmr.co
// @version     0.4.2
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
 * und traegt dort keine Information. Auf dem Mac-&-i-Ticker gilt dasselbe
 * fuer "Mac & i Magazin" (dort ist ALLES Mac & i); fremde Brandings wie
 * "heise security" bleiben und werden nur gekuerzt.
 *
 * Die Tagesköpfe verlieren ihr "Heute –"/"Gestern –" (das Datum daneben
 * sagt dasselbe) und werden auf beiden Seiten einheitlich als
 * "Montag, den 17. August 2026" ausgeschrieben. Nach dem Umformen matcht
 * das Datums-Muster nicht mehr — der MutationObserver läuft leer durch.
 *
 * Richtungs-Snapping: nach jedem Scrollen gleitet die Seite zum nächsten
 * Tageskopf IN Scrollrichtung — unabhängig von der Entfernung, nie
 * rückwärts. CSS-Snap (proximity) kann beides nicht: sein Fangradius ist
 * browserintern, und er springt auch gegen die Scrollrichtung zurück.
 * Während der Gleitfahrt sind Scroll-Ereignisse stummgeschaltet, sonst
 * fütterte die eigene Animation die Richtungslogik.
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

  const trim = () => {
    document
      .querySelectorAll('article h3 + div > span.whitespace-nowrap')
      .forEach((el) => {
        const t = el.textContent;
        if (/^heise\s+online$/i.test(t.trim())) {
          el.remove();
          return;
        }
        const kurz = t.replace(/^heise\s+/i, '').replace(/\s+Magazin$/i, '');
        if (kurz !== t) el.textContent = kurz;
      });

    document
      .querySelectorAll('[data-component="Branding"]')
      .forEach((el) => {
        const t = el.textContent.trim();
        if (/^mac & i( magazin)?$/i.test(t)) {
          el.remove();
          return;
        }
        const kurz = t.replace(/^heise\s+/i, '').replace(/\s+Magazin$/i, '');
        if (kurz !== t) el.textContent = kurz;
      });

    document
      .querySelectorAll('section > div:first-child > h2, .go-col:has(.ticker-list) > h2')
      .forEach((el) => {
        const t = el.textContent;
        let kurz = t.replace(/^\s*(heute|gestern)\s*[\u2013\u2014-]\s*/i, '');
        kurz = kurz.replace(
          /^(\S+),\s*(?:den\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/,
          (_, wd, d, m, y) => wd + ', den ' + (+d) + '. ' + MONATE[+m - 1] + ' ' + y
        );
        if (kurz !== t) el.textContent = kurz;
      });
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

  /* Oberstes Ziel auf Mac & i: die Oberkante der grauen Karte — direkt
   * unter heises erster Navi-Zeile, oberhalb des Weißraums über der
   * Logo-Kapsel. Dort snappt es ohne Luft. */
  const SNAP_KARTE =
    'div:has(> div > section > div > section > article[data-teaser-name="HorizontalTimelineTeaser"])';

  const RUHE_MS = 150;   // so lange muss das Scrollen stehen, bevor gesnappt wird
  const LUFT = 12;       // Zielposition: so viel Raum bleibt über dem Kopf

  let lastY = window.scrollY;
  let richtung = 0;
  let timer = null;
  let faehrt = false;

  const snap = () => {
    if (!richtung) return;
    const y = window.scrollY;
    const ziele = [...document.querySelectorAll(SNAP_ZIELE)]
      .map((el) => Math.round(el.getBoundingClientRect().top + y - LUFT))
      .concat([...document.querySelectorAll(SNAP_KARTE)]
        .map((el) => Math.round(el.getBoundingClientRect().top + y)))
      .sort((a, b) => a - b);
    const ziel = richtung > 0
      ? ziele.find((t) => t > y + 4)
      : [...ziele].reverse().find((t) => t < y - 4);
    if (ziel == null) return;

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
      lastY = window.scrollY;
    };
    const watch = setInterval(ende, 80);
    setTimeout(fertig, 1200); // Notausstieg, falls das Ziel nie exakt erreicht wird
  };

  window.addEventListener('scroll', () => {
    if (faehrt) return;
    const y = window.scrollY;

    /* Sub-Pixel-Jitter nach dem Andocken ist keine Nutzerabsicht. */
    if (Math.abs(y - lastY) > 2) richtung = y > lastY ? 1 : -1;
    lastY = y;
    clearTimeout(timer);
    timer = setTimeout(snap, RUHE_MS);
  }, { passive: true });
})();
