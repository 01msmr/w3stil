# w3stil

Reduziertes Lese-Layout für häufig besuchte Seiten. Quelle sind plain-CSS-Dateien;
der Build erzeugt ein einzelnes UserCSS-Artefakt für [Stylus](https://add0n.com/stylus.html).

```
src/_reset.css        Basis, wird jeder Domain-Sektion vorangestellt
src/<domain>.css      nur das, was _reset.css nicht generisch löst
build.mjs             src/ → dist/reduce.user.css        (ohne Dependencies)
tools/probe.user.js   Analyse-Overlay zum Schreiben neuer Regeln
tools/check.mjs       prüft, ob die Selektoren noch matchen (Playwright)
```

## Einrichten

```bash
npm install
npx playwright install chromium     # nur für tools/check.mjs
node build.mjs
```

Stylus installieren, dann `https://msmr.dev/w3stil/reduce.user.css` im Browser
öffnen — Stylus fängt `.user.css`-URLs ab und zeigt einen Installationsdialog.
Danach zieht es Updates selbstständig über `@updateURL`. Einmal pro Rechner.

`@updateURL` in `build.mjs` (Objekt `META`) auf die eigene Adresse anpassen.

## Entwickeln

```bash
npm run dev          # watch + http://localhost:8787/reduce.user.css
```

Den lokalen Endpunkt einmalig als **zweiten** Style in Stylus installieren und den
produktiven so lange deaktivieren. Beim Speichern in `src/` baut der Watcher neu;
in Stylus *Check for updates* holt die neue Fassung. Alternativ direkt im
Stylus-Editor prototypen — aber siehe unten.

Neue Seite aufnehmen:

1. `tools/probe.user.js` in Violentmonkey installieren, per `Ctrl+Alt+P` öffnen.
2. Content-Root, Layout-Kontext und Sidebars ablesen; mit *Alt+Klick-Picker*
   einzelne Elemente prüfen. Der Balken zeigt die geschätzte Haltbarkeit.
3. *CSS-Entwurf* → kopieren → als `src/<domain>.css` speichern, überarbeiten.
4. `node build.mjs`, prüfen, committen.

## Konventionen

**Dateiname = Matcher.** `heise.de.css` wird zu `domain("heise.de")` und matcht
alle Subdomains. Für exaktes Matching `heise.de!exact.css` — daraus wird ein
`regexp()`, das Subdomains ausschließt.

**Was gehört wohin.** In `_reset.css` nur Selektoren, die ein Redesign überleben:
Elemente, ARIA-Rollen, `:has()`-Strukturen. Alles Klassenbasierte in die
Site-Datei. Faustregel: taucht ein Selektor in der dritten Site-Datei auf,
gehört er nach `_reset.css`.

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

**`@version` steigt aus der Git-Historie.** Ein Rebuild ohne Commit erzeugt
dieselbe Version — Stylus ignoriert Updates mit gleicher oder niedrigerer Nummer
stillschweigend. Ohne Git-Repo greift ein `0.`-präfixierter Zeitstempel, der
immer unter jeder echten Version sortiert.

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
Rechnern sofort aktiv. Reparatur: Fehler in `src/` beheben, committen, pushen.
Weil `@version` aus dem Commit-Zeitstempel kommt, ist die Korrektur automatisch
neuer als die kaputte Fassung. Ein `git revert` allein reicht nicht, wenn du das
Artefakt nicht neu baust.

## Deploy

`.github/workflows/deploy.yml` baut bei Push auf `main` und rsynct
`dist/reduce.user.css` auf den Server. Benötigte Secrets:

| Secret | Beispiel |
| --- | --- |
| `DEPLOY_KEY` | privater SSH-Key (ed25519) |
| `DEPLOY_HOST` | `deploy@msmr.dev` |
| `DEPLOY_PATH` | `/var/www/msmr.dev/w3stil/` |

`fetch-depth: 0` im Checkout ist nötig, sonst kann `build.mjs` keine Version aus
der Historie ableiten.

Der Webserver muss `.user.css` als `text/css` ausliefern und sollte kurz cachen,
damit Stylus' Update-Check nicht auf einer alten Fassung sitzen bleibt.

nginx:

```nginx
location ~ \.user\.css$ {
    default_type text/css;
    add_header Cache-Control "public, max-age=300";
    add_header Access-Control-Allow-Origin "*";
}
```

Traefik/Docker, als Label am statischen Backend:

```yaml
- "traefik.http.middlewares.usercss.headers.customresponseheaders.Cache-Control=public, max-age=300"
```

Prüfen: `curl -sI https://msmr.dev/w3stil/reduce.user.css | grep -i content-type`
muss `text/css` liefern — bei `text/plain` zeigt Stylus keinen
Installationsdialog, sondern der Browser rendert Quelltext.

## Grenzen

- **Shadow DOM.** CSS erreicht keine Shadow Roots. `probe` markiert sie; wo
  welche auftauchen, hilft nur `::part` — sofern die Seite Parts exportiert.
- **Inline `!important`.** Rettet dich die User-Origin-Kaskade von Stylus, die
  Author-`!important` schlägt. Deshalb Stylus und kein Userscript.
- **Kein Safari.** Stylus gibt es dafür nicht. Falls das dazukommt: einen zweiten
  Emitter in `build.mjs` ergänzen, der `@match`-Metadaten statt
  `@-moz-document`-Sektionen schreibt, und die Ausgabe in der
  [Userscripts](https://github.com/quoid/userscripts)-App ablegen. `src/` bleibt
  unangetastet — das ist der Grund für den Build-Step.

