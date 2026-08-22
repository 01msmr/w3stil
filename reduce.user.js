// ==UserScript==
// @name        reduce-ticker
// @namespace   msmr.co
// @version     0.17.0
// @description Kürzt Ressort-Chips und formatiert Tagesköpfe der Newsticker
// @author      msmr
// @license     MIT
// @match       https://www.heise.de/*
// @match       https://www.golem.de/*
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
 * BREITES @match, Ticker-Prüfung zur Laufzeit: heise ist eine Single-Page-App.
 * Wer von der Startseite in den Ticker navigiert, löst keinen Seitenladevorgang
 * aus — bei engem @match injiziert Tampermonkey dann nie und meldet "Dieses
 * Userscript wurde noch nicht ausgeführt". Das Skript lädt deshalb auf der
 * ganzen Domain und entscheidet über istTicker(), ob es etwas tut. Weil das
 * Dokument beim Routenwechsel erhalten bleibt, überlebt der MutationObserver
 * und greift auf der neuen Route ohne Zutun.
 *
 * Aus demselben Grund sind istTicker() und maci() FUNKTIONEN: bei SPA-
 * Navigation ändert sich location.pathname, ohne dass das Skript neu läuft.
 * Als Konstanten blieben sie beim Wechsel zwischen Haupt- und Mac-&-i-Ticker
 * auf dem Wert der zuerst geladenen Seite stehen — die Chips würden dann
 * falsch behandelt und das Snapping mit der falschen Reichweite arbeiten.
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
 * durch, weil nichts mehr zu ersetzen ist — keine Schleife. Entprellt per
 * requestAnimationFrame: seit marker() und uhr() selbst Elemente einfügen,
 * ist jeder Durchlauf teuer, und heises Anzeigen erzeugen dreistellige
 * Mutationszahlen pro Sekunde.
 *
 * Bewusst ohne Versions-Automatik: das Skript ist statisch, die Version wird
 * bei der seltenen Änderung von Hand erhöht. */

(() => {
  'use strict';

  const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember'];

  // ── Laufzeit-Prüfungen (s. Kopfkommentar: SPA) ───────────────────────

  /* Alle drei Ticker: /newsticker, /mac-and-i/newsticker, golems /ticker. */
  const istTicker = () =>
    /^\/(mac-and-i\/)?newsticker/.test(location.pathname) ||
    /^\/ticker/.test(location.pathname);

  /* Auf dem Mac-&-i-Ticker trägt "Mac & i" keine Information — dort ist alles
   * Mac & i. Im Haupt-Ticker unterscheidet das Chip sehr wohl und bleibt. */
  const maci = () => location.pathname.startsWith('/mac-and-i');

  // ── Ressort-Chips ────────────────────────────────────────────────────

  /* Alle bekannten Auslieferungswege der Chips. Neue Fassung von heise?
   * Hier eine Zeile ergänzen — die Regeln stehen nur in chipText(). */
  const ZIELE = [
    'article h3 + div > span.whitespace-nowrap',
    '[data-component="Branding"]',
  ];

  /* null      → Element entfernen
   * undefined → unverändert lassen
   * String    → neuer Text
   *
   * Verglichen wird gegen den GETRIMMTEN Text: sonst gölte bloßer Leerraum
   * als Änderung, das Skript schriebe den Knoten neu, und die dadurch
   * ausgelöste Mutation triebe einen weiteren Durchlauf an. */
  const chipText = (roh) => {
    const t = roh.trim();
    if (!t) return undefined;
    if (/^heise\s+online$/i.test(t)) return null;
    if (maci() && /^mac\s*&\s*i(\s+magazin)?$/i.test(t)) return null;
    const kurz = t.replace(/^heise\s+/i, '').replace(/\s+Magazin$/i, '');
    return kurz === t ? undefined : kurz;
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
      /* Klasse am Link: WebKit wendet :visited nicht an, wenn der Selektor
       * ein :has() trägt — die Visited-Regeln hängen deshalb an a.w3-row. */
      chip.closest('a')?.classList.add('w3-row');
    }
    if (!maci()) return;
    for (const a of document.querySelectorAll(
      'article[data-teaser-name="HorizontalTimelineTeaser"] > a'
    )) {
      a.classList.add('w3-row');
      if (!a.querySelector(':scope > .w3-plate')) {
        const p = document.createElement('i');
        p.className = 'w3-plate';
        const c = document.createElement('i');
        c.className = 'w3-check';
        a.append(p, c);
      }
    }
  };

  /* Uhrzeit in zwei Spans (Stunden / ":Minuten"): CSS kann Text nicht dort
   * umbrechen, wo kein Umbruchpunkt ist. Auf Desktop bleiben die Spans
   * inline und unsichtbar; der Phone-Block der Styles stapelt sie zum
   * Quadrat-Chip. Der Text kann direkt im Chip liegen (golem, heise) oder
   * in einem Span darunter (Mac & i). */
  const uhr = () => {
    for (const chip of document.querySelectorAll(
      '.go-ticker-teaser__datetime, article > a > time, ' +
      'article[data-teaser-name="HorizontalTimelineTeaser"] > time'
    )) {
      if (chip.querySelector('.w3-hh')) continue;
      const knoten = [chip, ...chip.querySelectorAll(':scope > span')]
        .flatMap((el) => [...el.childNodes])
        .find((n) => n.nodeType === 3 && /^\s*\d{1,2}:\d{2}\s*$/.test(n.nodeValue));
      if (!knoten) continue;
      const [, hh, mm] = knoten.nodeValue.match(/(\d{1,2}):(\d{2})/);
      const h = document.createElement('span');
      h.className = 'w3-hh';
      h.textContent = hh;
      /* Der Doppelpunkt bekommt einen eigenen Span: der Phone-Block nimmt
       * ihn aus dem Fluss (absolute), damit die Ziffern im Quadrat ZENTRIERT
       * stehen, ohne dass er wegfällt — er hängt links vor den Minuten. */
      const m = document.createElement('span');
      m.className = 'w3-mm';
      const d = document.createElement('span');
      d.className = 'w3-colon';
      d.textContent = ':';
      m.append(d, mm);
      knoten.replaceWith(h, m);
    }
  };

  /* Der Vorspann vor dem ersten Doppelpunkt ("Kicker: Titel") bekommt auf
   * allen drei Tickern einen eigenen Span — CSS kann Text nicht teilen.
   * Mac & i setzt ihn unter dem Cursor normal statt fett, golem und der
   * heise-Ticker dimmen ihn. Nur der erste Doppelpunkt, nur wenn danach
   * Text folgt; einmalig je Titel. */
  const kicker = () => {
    for (const h3 of document.querySelectorAll(
      '.go-ticker-teaser__content, article:has(> a > time) h3, ' +
      'article[data-teaser-name="HorizontalTimelineTeaser"] h3'
    )) {
      if (h3.querySelector('.w3-kicker')) continue;
      /* Das Element, dessen DIREKTE Textknoten zusammengenommen den Titel
       * tragen — bei Mac & i der innere Span, bei golem der Content-Span
       * (Titel in mehreren Textknoten: "Kicker", ":", " ", "Titel"), beim
       * heise-Ticker die h3 selbst, auch wenn davor heise+-Bilder stehen.
       * Nur direkte Textknoten: Kindelemente (Bilder) bleiben stehen. */
      const texte = (el) => [...el.childNodes].filter((n) => n.nodeType === 3);
      let m = null;
      const blatt = [h3, ...h3.querySelectorAll('*')].find((el) => {
        m = texte(el).map((n) => n.nodeValue).join('')
          .match(/^(\s*[^:]{1,80}:)(\s+\S.*)$/s);
        return !!m;
      });
      if (!blatt) continue;
      const knoten = texte(blatt);
      const span = document.createElement('span');
      span.className = 'w3-kicker';
      span.textContent = m[1];
      blatt.insertBefore(span, knoten[0]);
      knoten[0].nodeValue = m[2];
      knoten.slice(1).forEach((n) => n.remove());
    }
  };

  const trim = () => {
    if (!istTicker()) return;
    chips();
    koepfe();
    marker();
    uhr();
    kicker();
  };

  /* Entprellt, s. Kopfkommentar. */
  let geplant = false;
  const anstossen = () => {
    if (geplant) return;
    geplant = true;
    requestAnimationFrame(() => {
      geplant = false;
      trim();
    });
  };

  trim();
  new MutationObserver(anstossen).observe(document.body, {
    childList: true,
    subtree: true,
  });

  // ── Titel-Rückstellung ───────────────────────────────────────────────
  /* Seitlich gezogene Titel gleiten nach 4 s Ruhe langsam auf ihre
   * Ausgangslage zurück. Nur mobil sind Titel überhaupt Scroller — auf
   * Desktop gibt es keinen Scrollweg, die Handler bleiben stumm. */

  /* Unter 500px scrollt die ganze Zeile (Uhr fährt mit weg), zwischen 500
   * und 700px nur der Titel — beide Sorten Scroller stehen in der Liste,
   * es feuert jeweils nur die, die tatsächlich Scrollweg hat. */
  const TITEL_SCROLLER =
    '.go-ticker-teaser, .go-ticker-teaser__content, ' +
    'article:has(> a > time) > a, article:has(> a > time) h3, ' +
    'article[data-teaser-name="HorizontalTimelineTeaser"], ' +
    'article[data-teaser-name="HorizontalTimelineTeaser"] h3';
  const RUECK_RUHE_MS = 4000;
  const RUECK_DAUER_MS = 750;

  const rueckTimer = new WeakMap(); // Ruhe-Timer je Titel
  const rueckFahrt = new WeakMap(); // Marke der laufenden Rückfahrt

  const zurueckgleiten = (el) => {
    rueckTimer.delete(el);
    const von = el.scrollLeft;
    if (von <= 0) return;
    const marke = {};
    rueckFahrt.set(el, marke);
    const start = performance.now();
    const schritt = (t) => {
      if (rueckFahrt.get(el) !== marke) return; // vom Finger unterbrochen
      const p = Math.min(1, (t - start) / RUECK_DAUER_MS);
      const weich = p < 0.5 ? 2 * p * p : 1 - (2 - 2 * p) ** 2 / 2;
      el.scrollLeft = von * (1 - weich);
      if (p < 1) requestAnimationFrame(schritt);
      else rueckFahrt.delete(el);
    };
    requestAnimationFrame(schritt);
  };

  /* scroll-Events bubbeln nicht — die Capture-Phase fängt sie trotzdem. */
  document.addEventListener('scroll', (ev) => {
    const el = ev.target;
    if (!(el instanceof Element) || !el.matches(TITEL_SCROLLER)) return;
    if (rueckFahrt.has(el)) return; // eigene Fahrt zählt nicht als Unruhe
    clearTimeout(rueckTimer.get(el));
    rueckTimer.set(el, setTimeout(() => zurueckgleiten(el), RUECK_RUHE_MS));
  }, true);

  /* Anfassen bricht eine laufende Rückfahrt ab — der Finger gewinnt. */
  for (const typ of ['pointerdown', 'touchstart', 'wheel']) {
    document.addEventListener(typ, (ev) => {
      const el = ev.target instanceof Element
        && ev.target.closest(TITEL_SCROLLER);
      if (el) rueckFahrt.delete(el);
    }, { capture: true, passive: true });
  }

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
    window.innerWidth < 700 ? (maci() ? -6 : 2) : 12;

  /* Anzieh-Reichweite: auf Seiten mit langen Tagen (golem, heise-Ticker)
   * greift der Snap nur nahe am Ziel — relativ zur Fensterhöhe, damit sich
   * das Verhalten kleinen Fenstern anpasst. Mac & i: unbegrenzt. */
  const reichweite = () =>
    maci() ? Infinity : Math.round(window.innerHeight * 0.3);

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

  /* Snap-Ziel ist die ORIGINALSTELLE des Kopfs im Fluss. Mobil kleben die
   * Köpfe (sticky) und melden per getBoundingClientRect ihre Klebe- bzw.
   * Endposition — die Fluss-Position wird deshalb rekonstruiert: für den
   * ersten Kindkopf aus der Oberkante seines Tages-Containers, sonst aus
   * dem nächsten sichtbaren Geschwister (golems Köpfe teilen sich einen
   * Container). Desktop-Köpfe sind nicht sticky → direkter Messwert. */
  const flussTop = (el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'sticky') return el.getBoundingClientRect().top;
    if (el === el.parentElement.firstElementChild) {
      return el.parentElement.getBoundingClientRect().top
        + parseFloat(cs.marginTop);
    }
    let n = el.nextElementSibling;
    while (n && n.getBoundingClientRect().height === 0) n = n.nextElementSibling;
    if (!n) return el.getBoundingClientRect().top;
    return n.getBoundingClientRect().top
      - el.getBoundingClientRect().height
      - parseFloat(cs.marginBottom);
  };

  // ── Klebe-Kontur ─────────────────────────────────────────────────────
  /* Die Tageskopf-Pille trägt ihren Rand nur im Klebe-Zustand. CSS kann
   * „klebt gerade" nicht abfragen (scroll-state-Queries fehlen in
   * WebKit); der Vergleich Ist-Position vs. Fluss-Position (flussTop)
   * liefert es exakt: klebt der Kopf, ist er nach unten versetzt. Die
   * Optik hängt an .w3-stuck im Style. */
  let stuckTick = false;
  const stuckPruefen = () => {
    stuckTick = false;
    if (!istTicker()) return;
    for (const el of document.querySelectorAll(SNAP_ZIELE)) {
      if (getComputedStyle(el).position !== 'sticky') {
        el.classList.remove('w3-stuck');
        continue;
      }
      const versatz = el.getBoundingClientRect().top - flussTop(el);
      el.classList.toggle('w3-stuck', versatz > 1);
    }
  };
  window.addEventListener('scroll', () => {
    if (!stuckTick) {
      stuckTick = true;
      requestAnimationFrame(stuckPruefen);
    }
  }, { passive: true });
  stuckPruefen();

  const snap = () => {
    if (!richtung || !istTicker()) return;
    const y = window.scrollY;
    const ziele = [...document.querySelectorAll(SNAP_ZIELE)]
      .map((el) => Math.round(flussTop(el) + y - luft()))
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
    if (faehrt || !istTicker()) return;
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
