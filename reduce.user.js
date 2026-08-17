// ==UserScript==
// @name        reduce-ticker
// @namespace   msmr.co
// @version     0.2.0
// @description Kürzt Ressort-Chips und formatiert Tagesköpfe der Newsticker
// @author      msmr
// @license     MIT
// @match       https://www.heise.de/newsticker*
// @match       https://www.golem.de/ticker*
// @run-at      document-idle
// @grant       none
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
 * und traegt dort keine Information.
 *
 * Die Tagesköpfe verlieren ihr "Heute –"/"Gestern –" (das Datum daneben
 * sagt dasselbe) und werden auf beiden Seiten einheitlich als
 * "Montag, den 17. August 2026" ausgeschrieben. Nach dem Umformen matcht
 * das Datums-Muster nicht mehr — der MutationObserver läuft leer durch.
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
})();
