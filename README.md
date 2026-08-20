# w3stil

Reduziertes Lese-Layout für häufig besuchte Seiten: die Newsticker von
golem.de, heise.de und Mac & i werden vollständig umgebaut, Wikipedia
(Skin Vector 2022) angepasst; Artikelseiten bleiben unverändert.

## Wie es funktioniert

Zwei Teile, die zusammengehören:

- **Style** — plain-CSS-Dateien in `src/`, aus denen `build.mjs` ein
  UserCSS-Artefakt für [Stylus](https://add0n.com/stylus.html) baut
  (Desktop-Browser) sowie je Domain eine Safari-Fassung für die
  [Userscripts](https://apps.apple.com/de/app/userscripts/id1463298887)-App
  (Mac, iPhone, iPad).
- **Userscript** — `reduce.user.js` übernimmt, was CSS nicht kann:
  kürzt Chip-Texte, vereinheitlicht Tagesköpfe, injiziert die
  Gelesen-Marker (WebKit wendet `:visited` weder auf Pseudo-Elemente noch
  auf `:has()` an), snappt beim Scrollen zum nächsten Tageskopf und
  stellt seitlich gezogene Titel nach 12 s Ruhe langsam zurück.

Veröffentlicht wird über GitHub Actions: ein Push auf `main` baut und
force-pusht die Auslieferungsdateien auf den Branch `publish`, von dort
gelangen sie per Webhook auf `https://w3.msmr.co/`. Stylus und
Tampermonkey holen Updates selbst über die `@updateURL`; die
Safari-Geräte werden mit `tools/ios-sync.sh` über iCloud versorgt.

## Installation

Style und Userscript gehören zusammen — beide installieren.

### Chrome, Vivaldi, Edge, Firefox (Desktop)

1. [Stylus](https://add0n.com/stylus.html) und
   [Tampermonkey](https://www.tampermonkey.net/) installieren
   (Chrome/Vivaldi: „Nutzerskripte zulassen" aktivieren).
2. `https://w3.msmr.co/reduce.user.css` öffnen → in Stylus installieren.
3. `https://w3.msmr.co/reduce.user.js` öffnen → in Tampermonkey installieren.

Updates holen beide Erweiterungen selbst.

### Mac (Safari)

1. App [Userscripts](https://apps.apple.com/de/app/userscripts/id1463298887)
   laden, als Verzeichnis **iCloud Drive → Userscripts** wählen; Erweiterung
   in Safari aktivieren und den Seiten erlauben.
2. `tools/ios-sync.sh` ausführen — füllt den Ordner.

Aktualisieren: Skript erneut ausführen, Seite neu laden.

### iPhone / iPad (Safari)

1. Dieselbe App laden; Erweiterung unter Einstellungen → Apps → Safari →
   Erweiterungen aktivieren, golem.de/heise.de erlauben.
2. Dasselbe Verzeichnis wählen (iCloud Drive → Userscripts). Greift das
   nicht: Kurzbefehl
   [„copy Userscripts"](https://www.icloud.com/shortcuts/bb1852c5f7cd43d8960801817af6547e)
   kopiert die Dateien in den lokalen App-Ordner — per Auslöser „Wenn Safari
   geöffnet ist" (ab iOS 27 erste Aktion im Kurzbefehl) vollautomatisch.

Aktualisieren: läuft über iCloud bzw. Kurzbefehl, sobald am Mac
`tools/ios-sync.sh` gelaufen ist.

## Aufbau

```
src/_reset.css        Basis, wird Domain-Sektionen vorangestellt (@no-reset schaltet ab)
src/_tokens.css       domainübergreifende Konstanten, in jeder Sektion
src/<domain>.css      nur das, was _reset.css nicht generisch löst
build.mjs             src/ → dist/reduce.user.css + dist/safari/  (ohne Dependencies)
reduce.user.js        Userscript: Text, Gelesen-Marker, Snapping
tools/probe.user.js   Analyse-Overlay zum Schreiben neuer Regeln
tools/check.mjs       prüft per Playwright, ob die Selektoren noch matchen
tools/ios-sync.sh     baut und befüllt den Userscripts-Ordner (iCloud);
                      warnt, wenn der Checkout hinter origin/main liegt
```

Der Dateiname bestimmt den Matcher (`heise.de.css` → Domain inkl.
Subdomains); Mobil ist keine eigene Fassung, sondern eine
Variablen-Schicht per `@media`; die Zeilenhöhe ist fest (`--w3-row-h`,
48px — das Polster ergibt sich aus `calc((h - 1lh) / 2)`). Unter 500px
(iPhone, nicht iPad) stapelt der Uhrzeit-Chip Stunden über `:Minuten`
im Quadrat (Ziffern zentriert, der Doppelpunkt zählt dabei nicht mit;
die Spans injiziert das Userscript — sie tragen auf allen Breiten die
betonte Minute in voller Textfarbe), und überlange Zeilen scrollen als
Ganzes — die Uhr fährt mit weg, ihr Platz gehört dem Titel. Zwischen
500 und 700px scrollt stattdessen nur der Titel (ohne Scrollbalken,
Zieh-Fläche = volle Zeilenhöhe). Eine scroll-getriebene Maske
(`--w3-title-fade-*` in `_tokens.css`) blendet jede tatsächlich
abgeschnittene Kante über eine feste Zone auf 10 % Deckkraft ab —
rechts am Anfang, beidseitig mittendrin, links am Ende. `main` trägt
nur Quellen — `dist/` ist gitignored und wird ausschließlich von der
Action gebaut.
