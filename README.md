# w3stil

Reduziertes Lese-Layout für häufig besuchte Seiten. Quelle sind plain-CSS-Dateien;
der Build erzeugt ein UserCSS-Artefakt für [Stylus](https://add0n.com/stylus.html)
und Safari-Fassungen für die Userscripts-App.

## Schnellstart

Style (Aussehen) und Userscript (Textkürzungen, Gelesen-Häkchen, Snapping)
gehören zusammen — beide installieren.

**Chrome, Vivaldi, Edge, Firefox (Desktop):**

1. [Stylus](https://add0n.com/stylus.html) und
   [Tampermonkey](https://www.tampermonkey.net/) installieren
   (Chrome/Vivaldi: „Nutzerskripte zulassen" aktivieren).
2. `https://w3.msmr.co/reduce.user.css` öffnen → in Stylus installieren.
3. `https://w3.msmr.co/reduce.user.js` öffnen → in Tampermonkey installieren.

Updates holen beide Erweiterungen selbst.

**Mac (Safari):**

1. App [Userscripts](https://apps.apple.com/de/app/userscripts/id1463298887)
   laden, als Verzeichnis **iCloud Drive → Userscripts** wählen; Erweiterung
   in Safari aktivieren und den Seiten erlauben.
2. `tools/ios-sync.sh` ausführen — füllt den Ordner.

Aktualisieren: Skript erneut ausführen, Seite neu laden.

**iPhone/iPad (Safari):**

1. Dieselbe App laden; Erweiterung unter Einstellungen → Apps → Safari →
   Erweiterungen aktivieren, golem.de/heise.de erlauben.
2. Dasselbe Verzeichnis wählen (iCloud Drive → Userscripts). Greift das
   nicht: Kurzbefehl
   [„copy Userscripts"](https://www.icloud.com/shortcuts/bb1852c5f7cd43d8960801817af6547e)
   kopiert die Dateien in den lokalen App-Ordner — per Auslöser „Wenn Safari
   geöffnet ist" (ab iOS 27 erste Aktion im Kurzbefehl) vollautomatisch.

Aktualisieren: läuft über iCloud bzw. Kurzbefehl, sobald am Mac
`tools/ios-sync.sh` gelaufen ist.

```
src/_reset.css        Basis, wird Domain-Sektionen ohne @no-reset vorangestellt
src/_tokens.css       domainübergreifende Konstanten, in JEDER Sektion
src/<domain>.css      nur das, was _reset.css nicht generisch löst
build.mjs             src/ → dist/reduce.user.css + dist/safari/  (ohne Dependencies)
reduce.user.js        Userscript: Text, Gelesen-Marker, Snapping
tools/probe.user.js   Analyse-Overlay zum Schreiben neuer Regeln
tools/check.mjs       prüft, ob die Selektoren noch matchen (Playwright)
tools/ios-sync.sh     baut und befüllt den Userscripts-Ordner (iCloud)
```

## Einrichten

`node build.mjs` genügt (keine Dependencies). `npm install` nur für
`check.mjs` und Stylelint. `dist/` ist gitignored — nach dem Clone einmal
bauen.

**Dev-Server:** `npm run dev` baut bei Änderungen neu und serviert auf
`:8787`; `http://localhost:8787/reduce.user.css` öffnen und in Stylus
installieren. Neue Fassung: dieselbe URL erneut öffnen und überschreiben —
die `@version` steigt nur mit Commits, ein Update-Check allein zieht einen
Rebuild ohne Commit nicht.

**Produktiv:** `https://w3.msmr.co/reduce.user.css` installieren; Updates
kommen über die `@updateURL`.

### Was danach anders aussieht

| Seite | Zustand |
|---|---|
| `golem.de/ticker/` | vollständig umgebaut |
| `heise.de/newsticker?timeFrame=last-7-days` | vollständig umgebaut |
| `heise.de/mac-and-i/newsticker` | vollständig umgebaut |
| `de.wikipedia.org` | nur mit Skin **Vector 2022** |
| Artikelseiten der Portale | unverändert |

## Userscript

`reduce.user.js` übernimmt, was CSS nicht kann:

- **Chips kürzen**: „heise "-Präfix und „ Magazin"-Suffix entfallen,
  „heise online" (und auf Mac & i „Mac & i Magazin") ganz. CSS kann Text
  weder umschreiben noch nach Inhalt selektieren.
- **Tagesköpfe**: einheitlich „Montag, den 17. August 2026".
- **Gelesen-Marker**: injiziert `<i class="w3-check">`/`w3-plate` und die
  Klasse `w3-row` — nötig, weil WebKit `:visited` weder auf Pseudo-Elemente
  noch auf `:has()`-Selektoren anwendet (siehe unten).
- **Richtungs-Snapping**: nach dem Scrollen gleitet die Seite zum nächsten
  Tageskopf in Scrollrichtung, nie rückwärts; auf golem/heise nur nahe am
  Ziel (~30% Fensterhöhe), auf Mac & i unbegrenzt.

Version wird von Hand gepflegt; kein Build, die Action kopiert die Datei
unverändert auf `publish`.

## iOS und Safari: die Userscripts-App

Safari kennt kein `@-moz-document`, Stylus existiert dort nicht. Der Build
erzeugt deshalb je Domain eine Datei in `dist/safari/`, gescoped über
`@match`-Metadaten im `==UserStyle==`-Block. Die App **Userscripts**
([App Store, iPhone/iPad und Mac](https://apps.apple.com/de/app/userscripts/id1463298887),
[Quellcode](https://github.com/quoid/userscripts)) liest sie aus einem
iCloud-Ordner; `reduce.user.js` läuft dort unverändert.

`tools/ios-sync.sh` pullt, baut und befüllt den Ordner. Der Mac liest ihn
direkt (Safari neu laden genügt); iOS synchronisiert über iCloud oder — wenn
die App den iCloud-Ordner nicht annimmt — über den Kurzbefehl aus dem
Schnellstart.

**iOS-Stolpersteine:**

- Der Verzeichnis-Wechsel der App greift teils erst nach frischem Download
  und App-Neustart.
- Zeigt die Dateien-App alte Stände: Ordnernamen antippen →
  „Geladenes entfernen" → „Jetzt laden".
- Symlinks in App-Ordner sind auf iOS nicht möglich.

Kurzbefehl von Hand: „Ordnerinhalt abrufen" (iCloud Drive → Userscripts) →
„Datei sichern" (fester Zielordner „Auf meinem iPhone → Userscripts",
„Überschreiben" an).

## Entwickeln

`npm run dev`, den lokalen Endpunkt als zweiten Style installieren, den
produktiven solange deaktivieren. Nicht im Stylus-Editor arbeiten — siehe
Fallstrick.

Neue Seite: `tools/probe.user.js` auf der Zielseite ausführen (Struktur,
Haltbarkeits-Schätzung, CSS-Entwurf), Entwurf als `src/<domain>.css`
speichern, überarbeiten, bauen, committen.

**probe ausführen:** als DevTools-Snippet (F12 → Sources → Snippets →
einfügen → `Ctrl+Enter`; überlebt keinen Reload) oder unverändert in
Tampermonkey/Violentmonkey, deaktiviert bis zum Bedarf. Ohne Manager
schlägt nur das Kopieren auf `http://`-Seiten fehl (Clipboard braucht
Secure Context).

## Konventionen

**Mobil ist eine Schicht, kein Fork.** `@media (max-width: 700px)`
überschreibt Variablen: Tokens in `_tokens.css`, Domain-Werte am Ende jeder
Site-Datei (Zeilenschrift 16px, Einzüge, Titel-Flucht), dazu seitlich
ziehbare Titel ohne Scrollbalken und flachere Tagesköpfe. Titel-Fluchten
sind gerechnet — bei Änderungen an Chip-Polsterung oder Schriftgröße
nachziehen. `@media (hover: none)` setzt alle Hover-Markierungen zurück
(Touch löst sonst beim Ziehen Hover aus).

**Dateiname = Matcher.** `heise.de.css` → `domain("heise.de")` inkl.
Subdomains; `heise.de!exact.css` → `regexp()` ohne Subdomains. Für einzelne
Unterseiten bestimmt die Datei ihren Matcher selbst:

```css
/* @no-reset
 * @matcher url-prefix("https://www.heise.de/mac-and-i/newsticker")
 */
```

`check.mjs` prüft solche Dateien gegen diese URL statt gegen die
Domain-Startseite.

**Was gehört wohin.** `_reset.css` nur redesign-feste Selektoren (Elemente,
ARIA, `:has()`-Strukturen); Klassenbasiertes in die Site-Datei. Faustregel:
taucht ein Selektor in der dritten Site-Datei auf, gehört er in den Reset.

**Tokens statt doppelter Zahlen.** `_tokens.css` hält, was auf allen Domains
gleich ist: Zustands-Mischverhältnisse, Chip- und Trennlinien-Werte,
Kopfgröße, Häkchen-Icon und -Größe. Der Build stellt sie jeder Sektion
voran (reine Custom Properties, wirkungslos bis zur Nutzung). Paletten
bleiben je Domain. Größenfaktoren (`--w3-chip-font`, `--w3-plus-scale`)
sind einheitenlos und rechnen gegen die Zeilenschrift — die Container erben
je Domain verschiedene Schriftgrößen.

**`expect`-Annotation.** Kommentar über einer Regel gibt `check.mjs` die
erwartete Trefferzahl mit (`/* expect: 1 */`, `/* expect: 1..5 */`). Ohne
Annotation gilt „mindestens ein Treffer".

**`@version` = `major.minor` aus `package.json` + Commit-Anzahl als Patch.**
Monoton, auch über Minor-Bumps; Stylus ignoriert gleiche oder niedrigere
Nummern still. Ohne Git: `major.minor.0`.

**Name + Namespace sind die Style-Identität.** Ändert sich eines, schlagen
Stylus-Updates still fehl und ein Neu-Install legt einen zweiten Eintrag
an. Nur ändern, wenn ein Neu-Install auf jedem Rechner es wert ist;
Reparatur: alle Einträge löschen, frisch von der Update-URL installieren.

**`@no-reset`** als erste Zeile lässt `_reset.css` für die Domain weg —
für Seiten, an denen nur ein Ausschnitt verändert wird (`!important`
derselben Kaskadenschicht ist nicht zurücknehmbar). golem und heise nutzen
es, wikipedia nicht.

**Kommentare fliegen aus `dist/`** (sonst n-fach dupliziert);
`node build.mjs --comments` behält sie.

## Der Fallstrick

Der Stylus-Editor schreibt in Stylus' Storage — das nächste Update
überschreibt Änderungen dort kommentarlos. Quelle ist dieses Repo.

## Wartung

`tools/check.mjs` lädt jede Domain und zählt die Treffer aller Selektoren;
läuft wöchentlich in GitHub Actions und öffnet bei Drift ein Issue
(`selector-drift`).

```bash
node tools/check.mjs              # alles
node tools/check.mjs golem.de     # eine Domain
node tools/check.mjs --json       # maschinenlesbar
```

Ausgabe: `✗` tot, `~` außerhalb `expect`, `?` ungültig, `!` unerreichbar,
`⊘` Consent-Wall.

**Consent-Walls:** einmalig `node tools/auth.mjs golem.de` (Dialog
wegklicken, Enter) — Session landet gitignored in `.auth/` und wird von
`check.mjs` genutzt; in CI werden solche Domains mit `⊘` übersprungen.

## Rollback

Stylus hält keine Versionshistorie. Reparatur: Fehler in `src/` beheben
oder `git revert`, pushen — die Action baut neu, der Commit-Zähler macht
die Korrektur automatisch zur höheren Version.

## Veröffentlichen

Gebaut wird in der GitHub-Action (das Shared Hosting hat kein Node). Sie
force-pusht die Auslieferungsdateien auf den Branch `publish`; `main` trägt
nur Quellen. Artefakte nie von Hand bauen und committen.

```
push auf main  →  Action baut, force-pusht publish
               →  Webhook  →  Plesk pullt publish nach /w3.msmr.co/repo
               →  Bereitstellungsaktion kopiert nach httpdocs
               →  Stylus/Tampermonkey holen Updates über @updateURL
```

Plesk (**Websites & Domains → w3.msmr.co → Git**):

| Feld | Wert |
| --- | --- |
| URL | `https://github.com/01msmr/w3stil.git` |
| Verzweigung | `publish` |
| Bereitstellungsmodus | automatisch |
| Serverpfad | `/w3.msmr.co/repo` |
| Zusätzliche Bereitstellungsaktion | `cp -f reduce.user.css reduce.user.js /w3.msmr.co/httpdocs/` |

Webhook-URL aus Plesk bei GitHub unter *Settings → Webhooks* eintragen
(Content type `application/json`, nur Push). Der Serverpfad liegt bewusst
außerhalb des Dokumentenstamms — sonst läge das ganze Repo im Web. Das
Verzeichnis muss vor der ersten Bereitstellung existieren. Die
Node-Anwendung der Domain bleibt deaktiviert (statische Datei, Passenger
stünde nur im Weg).

## Was CSS hier nicht kann

**`:visited` erlaubt nur deckende Farbwechsel** (`color`,
`background-color`, Rahmen-/Outline-/Dekorationsfarben; kein `content`,
keine Maße, keine Transitions, kein Alpha-Wechsel) — in Chrome auch auf
Nachfahren und deren Pseudo-Elemente. Darauf baut das Gelesen-Häkchen:
ein stets gerendertes Element mit SVG-Maske über den Ziffern, per
konstantem `mix-blend-mode: darken` unsichtbar solange weiß, sichtbar in
der Gelesen-Farbe; die Ziffern tarnen sich zeitgleich in der Chipfarbe.
Zwei Anforderungen daraus: das Häkchen liegt ÜBER den Ziffern (deckende
Glyphen stanzen sonst Löcher), und Chip wie Häkchen schalten hart
(Transitions sind unter `:visited` nicht steuerbar).

**WebKit ist strenger:** `:visited` wirkt dort weder auf Pseudo-Elemente
noch auf Selektoren mit `:has()`. Konsequenz: Häkchen/Platte sind echte,
vom Userscript injizierte Elemente, und alle Visited-Regeln hängen an der
Userscript-Klasse `a.w3-row`.

Prüfbar ist `:visited` nur mit dem Auge: `getComputedStyle` liefert
absichtlich die Unbesucht-Werte, `matches(':visited')` immer `false`.

**`:has()` darf nicht in `:has()`** — die Regel fällt komplett und ohne
Warnung aus; stattdessen eine Klasse als Marker verwenden.

**`:has(:visited)` matcht nie** (Historienschutz) — Zeilenflächen oder
Geschwister eines Links sind für den Gelesen-Zustand unerreichbar, wenn
die Uhr außerhalb des Links steht (Mac & i: gelöst über Link-Pseudos bzw.
injizierte Link-Kinder).

**Custom Properties vererben nur nach unten** — deshalb hängen alle
Variablen an `body:has(…)`.

**Stylus injiziert in der User-Origin** und schlägt jedes zum Testen
eingehängte `<style>`, auch mit `!important`. Zum Testen den installierten
Style deaktivieren.

## Grenzen

- **Shadow DOM.** CSS erreicht keine Shadow Roots; hilft nur `::part`,
  sofern die Seite Parts exportiert. `probe` markiert sie.
- **Inline `!important`.** Schlägt Author-CSS; nur die User-Origin von
  Stylus gewinnt dagegen. Deshalb bleibt das Layout ein Stylus-Style —
  die Safari-Fassungen (Author-Origin) können hier im Einzelfall
  unterliegen.
