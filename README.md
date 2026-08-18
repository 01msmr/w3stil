# w3stil

Reduziertes Lese-Layout für häufig besuchte Seiten. Quelle sind plain-CSS-Dateien;
der Build erzeugt ein einzelnes UserCSS-Artefakt für [Stylus](https://add0n.com/stylus.html).

```
src/_reset.css        Basis, wird Domain-Sektionen ohne @no-reset vorangestellt
src/_tokens.css       domainübergreifende Konstanten, in JEDER Sektion
src/<domain>.css      nur das, was _reset.css nicht generisch löst
build.mjs             src/ → dist/reduce.user.css        (ohne Dependencies)
reduce.user.js        Userscript für Text-Kürzungen, die CSS nicht kann
tools/probe.user.js   Analyse-Overlay zum Schreiben neuer Regeln
tools/check.mjs       prüft, ob die Selektoren noch matchen (Playwright)
```

## Einrichten

Der Build braucht keine Abhängigkeiten — `node build.mjs` genügt. `npm install`
wird erst für `tools/check.mjs` und Stylelint gebraucht.

```bash
node build.mjs            # erzeugt dist/reduce.user.css
```

`dist/` ist gitignored: nach jedem Clone einmal bauen.

### Ohne eigenen Server benutzen

```bash
npm run dev               # baut bei jeder Änderung neu, serviert auf :8787
```

Dann `http://localhost:8787/reduce.user.css` im Browser öffnen. Stylus fängt
`.user.css`-URLs ab und zeigt einen Installationsdialog. Der Style bleibt
danach auch gespeichert, wenn der Server aus ist — nur Updates brauchen ihn.

**Neue Fassung einspielen:** dieselbe URL erneut öffnen und im Dialog
überschreiben. *Check for updates* allein reicht nicht, solange sich `@version`
nicht geändert hat — die Version kommt aus der Commit-Anzahl, ein Rebuild ohne
Commit erzeugt also dieselbe.

### Aus der Veröffentlichung benutzen

`https://w3.msmr.co/reduce.user.css` im Browser öffnen und installieren —
einmal pro Rechner. Stylus holt Updates danach selbstständig über `@updateURL`.
Wie die Datei dorthin kommt, steht unter [Veröffentlichen](#veröffentlichen).

### Was danach anders aussieht

| Seite | Zustand |
|---|---|
| `golem.de/ticker/` | vollständig umgebaut |
| `heise.de/newsticker?timeFrame=last-7-days` | vollständig umgebaut |
| `de.wikipedia.org` | nur mit Skin **Vector 2022** (Einstellungen → Aussehen) |
| Artikelseiten beider Portale | noch unverändert |


## Userscript: Text-Kürzungen im Ticker

Ein optionaler zweiter Baustein neben dem Style: `reduce.user.js` kürzt im
heise-Ticker die Ressort-Chips um „heise" und „Magazin" — aus „heise security"
wird „security", aus „Mac & i Magazin" wird „Mac & i"; „heise online" entfällt
ganz. Auf heise und golem formatiert es außerdem die Tagesköpfe einheitlich zu
„Montag, den 17. August 2026". Das kann nur
JavaScript: die Chips sind nackte Text-Spans ohne unterscheidbare Attribute,
CSS kann Text weder umschreiben noch nach Inhalt selektieren (kein
`:contains()`; auch die Artikel-URLs korrelieren nicht mit dem Ressort).

Installation: Tampermonkey oder Violentmonkey installieren, dann
`https://w3.msmr.co/reduce.user.js` öffnen — der Manager zeigt den
Installationsdialog. Updates laufen über die `@updateURL` im Skript.

Die Version im Skript wird von Hand gepflegt — es ist statisch und ändert
sich nur, wenn heise das Chip-Markup umbaut. Kein Build: die Datei liegt als
Quelle im Repo-Root, die Action kopiert sie unverändert auf den
`publish`-Branch (siehe [Veröffentlichen](#veröffentlichen)).

## Entwickeln

```bash
npm run dev          # watch + http://localhost:8787/reduce.user.css
```

Den lokalen Endpunkt einmalig als **zweiten** Style in Stylus installieren und den
produktiven so lange deaktivieren. Beim Speichern in `src/` baut der Watcher neu;
in Stylus *Check for updates* holt die neue Fassung. Alternativ direkt im
Stylus-Editor prototypen — aber siehe unten.

Neue Seite aufnehmen:

1. `tools/probe.user.js` auf der Zielseite ausführen — siehe unten.
2. Content-Root, Layout-Kontext und Sidebars ablesen; mit *Alt+Klick-Picker*
   einzelne Elemente prüfen. Der Balken zeigt die geschätzte Haltbarkeit.
3. *CSS-Entwurf* → kopieren → als `src/<domain>.css` speichern, überarbeiten.
4. `node build.mjs`, prüfen, committen.

### probe ausführen

**Eine Erweiterung genügt: Stylus.** `probe` braucht keine zweite, obwohl die
Datei auf `.user.js` endet — sie läuft als DevTools-Snippet.

1. Zielseite öffnen, `F12` → **Sources** → **Snippets** → *New snippet*.
2. Inhalt von `tools/probe.user.js` einfügen, einmalig speichern (`Ctrl+S`).
3. `Ctrl+Enter` führt es aus, das Overlay erscheint. Danach auf jeder Seite
   erneut `Ctrl+Enter` — das Snippet bleibt gespeichert, überlebt aber keinen
   Reload.

Das Skript ist dafür gebaut: der `GM_`-Menübefehl wird nur registriert, wenn ein
Userscript-Manager ihn anbietet, das Tastenkürzel `Ctrl+Alt+P` und der
Kopieren-Knopf funktionieren auch ohne. Einzige Einschränkung ohne Manager:
auf `http://`-Seiten schlägt das Kopieren fehl, weil `navigator.clipboard` einen
Secure Context verlangt — dann den Entwurf aus dem Overlay markieren und
von Hand kopieren.

Wer das Snippet nach jedem Reload nicht neu auslösen mag, legt dieselbe
Datei unverändert in Tampermonkey bzw. Violentmonkey an — seit dem
Chip-Userscript ist ohnehin ein Manager installiert — und lässt sie
deaktiviert, bis eine Domain dazukommt.

## Konventionen

**Dateiname = Matcher.** `heise.de.css` wird zu `domain("heise.de")` und matcht
alle Subdomains. Für exaktes Matching `heise.de!exact.css` — daraus wird ein
`regexp()`, das Subdomains ausschließt.

**Was gehört wohin.** In `_reset.css` nur Selektoren, die ein Redesign überleben:
Elemente, ARIA-Rollen, `:has()`-Strukturen. Alles Klassenbasierte in die
Site-Datei. Faustregel: taucht ein Selektor in der dritten Site-Datei auf,
gehört er nach `_reset.css`.

**Tokens statt doppelter Zahlen.** `src/_tokens.css` hält alles, was auf allen
Domains gleich sein soll: Mischverhältnisse der Zustandsflächen (gelesen,
Gelesen-Hover), Chip- und Trennlinien-Werte, Kopfgröße, das Häkchen-Icon samt
Größe. Der Build stellt die Datei **jeder** Sektion voran, auch solchen mit
`@no-reset` — es sind reine Custom Properties auf `:root`, sie verändern
nichts, solange eine Site-Datei sie nicht benutzt. Die Farbpaletten bleiben je
Domain in der Site-Datei. Größenfaktoren (`--w3-chip-font`, `--w3-plus-scale`)
sind bewusst einheitenlos und werden gegen die Zeilenschrift gerechnet: die
Label-Container erben je Domain verschiedene Schriftgrößen, ein `em` misst
dort nicht dasselbe.

**`expect`-Annotation.** Ein Kommentar direkt über einer Regel gibt `check.mjs`
die erwartete Trefferzahl mit:

```css
/* expect: 1 */
.article-content { … }

/* expect: 1..5 */
.teaser { … }
```

Ohne Annotation gilt nur „mindestens ein Treffer". Die Annotation fängt zusätzlich
den Fall ab, dass ein Selektor plötzlich 400 Elemente trifft.

**`@version` steigt aus der Git-Historie.** Sie setzt sich zusammen aus
`major.minor` der `package.json` und der Anzahl der Commits als Patch — also
`0.1.0`, `0.1.1`, `0.1.2` … Ein Rebuild ohne Commit erzeugt dieselbe Version,
und Stylus ignoriert Updates mit gleicher oder niedrigerer Nummer
stillschweigend. Major oder Minor bumpst du in der `package.json`; der Zähler
läuft dabei weiter, die Reihenfolge bleibt also monoton. Ohne Git greift
`major.minor.0`.

**`@no-reset`** als erste Zeile einer Site-Datei lässt `_reset.css` für diese
Domain weg:

```css
/* @no-reset
 * …
 */
```

Gedacht für Seiten, an denen ausdrücklich nur ein Ausschnitt verändert werden
soll. `_reset.css` greift ins Grundlayout ein — Seitenhintergrund, Schrift,
`aside` ausblenden — und lässt sich aus der Site-Datei heraus nicht
zurücknehmen: `!important` in derselben Kaskadenschicht ist nicht rückgängig zu
machen. `golem.de.css` und `heise.de.css` nutzen den Ausstieg, `wikipedia.org.css`
nicht.

**Kommentare fliegen aus `dist/`**, weil `_reset.css` in jeder Sektion landet und
sich sonst n-fach dupliziert. `node build.mjs --comments` behält sie.

## Der Fallstrick

Der Stylus-Editor schreibt in Stylus' eigenen Storage. Was du dort änderst,
**überschreibt das nächste Update kommentarlos**. Der Editor ist Prototyping-
Werkzeug; die Quelle ist dieses Repo. Trifft einen ungefähr zweimal.

## Wartung

`tools/check.mjs` lädt jede Domain und zählt die Treffer aller Selektoren aus
`src/`. Läuft wöchentlich in GitHub Actions und öffnet bei Drift ein Issue mit
Label `selector-drift`.

```bash
node tools/check.mjs              # alles
node tools/check.mjs golem.de     # eine Domain
node tools/check.mjs --json       # maschinenlesbar
```

Ausgabe: `✗` toter Selektor, `~` Trefferzahl außerhalb `expect`, `?` ungültige
Syntax, `!` Seite nicht erreichbar, `⊘` Consent-Wall oder Login-Interstitial.

### Consent-Walls

Seiten wie golem.de leiten einen frischen Browser auf eine Zustimmungsseite um —
dort matcht kein einziger Selektor, und der Check würde alles als tot melden.
Einmalig eine Session aufzeichnen:

```bash
node tools/auth.mjs golem.de      # Dialog wegklicken, Enter drücken
```

Landet in `.auth/<domain>.json`, ist gitignored und wird von `check.mjs`
automatisch verwendet. In CI fehlt die Datei; solche Domains werden dort
mit `⊘` übersprungen statt fälschlich als kaputt gemeldet.

## Rollback

Stylus hält keine Versionshistorie — ein fehlerhafter Deploy ist auf allen
Rechnern sofort aktiv. Reparatur: Fehler in `src/` beheben (ein `git revert`
genügt), committen, pushen — die Action baut daraufhin neu, und weil
`@version` aus dem Commit-Zähler kommt, ist die Korrektur automatisch neuer
als die kaputte Fassung.

## Veröffentlichen

Gebaut wird in der GitHub-Action, nicht auf dem Server: das Hosting ist Shared
Hosting mit eingeschränkter Shell, ein Node-Interpreter ist dort nicht
erreichbar — weder im PATH noch unter `/opt/plesk/node`. Die Action
force-pusht die beiden Auslieferungsdateien auf den Branch `publish`;
alles Weitere erledigt Plesk. `main` trägt nur Quellen, dort committet
niemand außer dir.

```
push auf main  →  Action baut, force-pusht publish (nur die zwei Dateien)
               →  Webhook  →  Plesk pullt publish, stellt nach /w3.msmr.co/repo bereit
               →  Bereitstellungsaktion kopiert zwei Dateien nach httpdocs
               →  Stylus/Tampermonkey holen Updates über @updateURL
```

Daraus folgt für die Arbeit am Repo: Artefakte **niemals von Hand bauen und
committen** — sie leben ausschließlich auf `publish`, das die Action bei jedem
Lauf komplett neu erzeugt. Auf `main` gibt es keine Bot-Commits mehr, der
lokale Stand bleibt nach dem Push aktuell; das frühere Rebase-Ritual vor jedem
zweiten Push entfällt.

Einrichtung in Plesk, unter **Websites & Domains → w3.msmr.co → Git**:

| Feld | Wert |
| --- | --- |
| URL | `https://github.com/01msmr/w3stil.git` |
| Verzweigung | `publish` |
| Bereitstellungsmodus | automatisch |
| Serverpfad | `/w3.msmr.co/repo` |
| Zusätzliche Bereitstellungsaktion | `cp -f reduce.user.css reduce.user.js /w3.msmr.co/httpdocs/` |

Die Webhook-URL aus dem Plesk-Dialog gehört bei GitHub unter *Settings →
Webhooks*, Content type `application/json`, nur das Push-Ereignis.

Entscheidend ist der **Serverpfad außerhalb des Dokumentenstamms**. Stünde er
auf `httpdocs`, kopierte Plesk das gesamte Repo ins Web — samt `src/`,
`package-lock.json` und allem, was künftig dazukommt. So landen dort nur die
zwei Dateien, und es gibt keine Ausschlussregel, die jemand pflegen müsste.

Das Verzeichnis muss vor der ersten Bereitstellung existieren, sonst bricht
Plesk mit `fatal: this operation must be run in a work tree` ab.

### Node.js in Plesk

Die Node-Anwendung der Domain gehört **deaktiviert**. w3stil ist keine
Anwendung, sondern eine statische Datei; eine aktivierte Node-Anwendung ohne
`app.js` schiebt nur Passenger zwischen Anfrage und Datei. Der Interpreter
bleibt zum Bauen trotzdem nutzbar.

## Was CSS hier nicht kann

Vier Grenzen, die uns Zeit gekostet haben und die bei jeder Erweiterung wieder
auftauchen. Alle vier sind live nachgemessen, nicht angelesen.

**`:visited` kann nur Farben — aber die reichen weiter als gedacht.** Erlaubt
sind ausschließlich Farbeigenschaften (`color`, `background-color`, Rahmen-,
Outline-, `text-decoration`-Farben); `content`, Maße, `opacity`, Transitions
werden still ignoriert, und der Alpha-Kanal darf sich nicht ändern: steht der
unbesuchte Zustand auf `background: none`, bleibt jede besuchte Fläche
wirkungslos — deshalb setzen die Zeilen-Regeln deckende Werte, obwohl optisch
dasselbe herauskäme. Entgegen der verbreiteten Lesart wirken die Farbwechsel
aber auch auf **Nachfahren** des Links und sogar auf deren **Pseudo-Elemente**
(beides live in Chrome verifiziert).

Das Gelesen-Häkchen im Uhrzeit-Chip entsteht genau daraus. Es ist IMMER
gerendert — ein `::before` mit SVG-Maske (Font Awesome „check"), gefärbt über
`background-color` — und wechselt per `:visited` allein die Farbe. Sichtbar
und unsichtbar macht es ein konstanter `mix-blend-mode: darken`: weiß ist nie
dunkler als der Untergrund und verschwindet, ohne transparent zu sein; die
dunkle Gelesen-Farbe gewinnt überall und deckt die Ziffern ab, die sich
zeitgleich in der Chipfarbe tarnen. Zwei Fallstricke aus der Praxis: das
Häkchen muss ÜBER den Ziffern liegen (getarnte, aber deckende Glyphen stanzen
sonst ihre Strichformen heraus), und eine Transition lässt sich für gelesene
Zeilen nicht gezielt schalten — Chip und Häkchen schalten deshalb hart.

Die Beschränkungen sind kein Bug, sondern der Schutz davor, dass eine Seite
die Browser-Historie ausliest. `getComputedStyle` liefert für besuchte Links
absichtlich die Werte des unbesuchten Zustands, `matches(':visited')` immer
`false` — geprüft werden kann nur mit dem Auge oder über einen Testkasten mit
bekannt besuchtem Ziel.

**`:has()` darf nicht in `:has()`.** Eine Regel wie
`main > *:has(.liste):has(+ *:has(.block))` fällt vollständig aus, ohne Warnung.
Wo ein zweites `:has()` nötig wäre, muss eine Klasse als Marker herhalten.

**Custom Properties vererben nur nach unten.** An `.ticker-list` deklarierte
Variablen sind in deren Elternelementen undefiniert; jede Deklaration, die sie
dort benutzt, fällt still aus — samt der Regel, in der sie steht. Deshalb hängen
alle Variablen an `body:has(…)`.

**Stylus injiziert in der User-Origin.** Der installierte Style schlägt damit
jedes `<style>`, das man zum Testen in die Seite hängt, auch mit `!important`.
Wer Änderungen im Browser ausprobiert, muss den installierten Style vorher
deaktivieren — sonst prüft man gegen die alte Fassung und sucht den Fehler an
der falschen Stelle.

## Grenzen

- **Shadow DOM.** CSS erreicht keine Shadow Roots. `probe` markiert sie; wo
  welche auftauchen, hilft nur `::part` — sofern die Seite Parts exportiert.
- **Inline `!important`.** Rettet dich die User-Origin-Kaskade von Stylus, die
  Author-`!important` schlägt. Deshalb bleibt das Layout ein Stylus-Style;
  `reduce.user.js` ergänzt nur die Text-Kürzungen, die CSS nicht kann.
- **Kein Safari.** Stylus gibt es dafür nicht. Falls das dazukommt: einen zweiten
  Emitter in `build.mjs` ergänzen, der `@match`-Metadaten statt
  `@-moz-document`-Sektionen schreibt, und die Ausgabe in der
  [Userscripts](https://github.com/quoid/userscripts)-App ablegen. `src/` bleibt
  unangetastet — das ist der Grund für den Build-Step.

