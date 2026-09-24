# Ein Release veröffentlichen

Das SDK wird auf npm als `@sdk-ai-agents/core` veröffentlicht. Niemand veröffentlicht es vom eigenen Rechner aus: Der GitHub-Actions-Workflow `Release` ([`release.yml`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/.github/workflows/release.yml)) prüft und veröffentlicht eine Version, sobald ein Tag wie `v0.3.0` gepusht wird.

::: tip In einfachen Worten
Ein Release besteht aus drei Schritten: die neue Versionsnummer und die Änderungen festhalten, diese Änderung mergen und dann einen Tag mit dem Namen der Version pushen. GitHub führt die Prüfungen erneut aus und veröffentlicht das Paket auf npm, zusammen mit einer signierten Erklärung, welcher Commit und welcher Workflow es gebaut haben.
:::

## Was der Workflow tut {#what-the-workflow-does}

| Job | Was er tut |
| --- | --- |
| `version` | Lehnt eine Version in `package.json` ab, die nicht `MAJOR.MINOR.PATCH` oder `MAJOR.MINOR.PATCH-PRERELEASE` ist, einen Tag, der nicht aus `v` und dieser Version besteht, und einen Tag auf einem Commit, der nicht auf `main` liegt. Bei einem Release (keiner Vorabversion) lehnt er außerdem eine `CHANGELOG.md` ohne ihren Abschnitt `## [x.y.z]` oder mit Resten unter `## [Unreleased]` ab. Wählt den npm-Dist-Tag: `latest`, oder `next` für eine Vorabversion wie `0.4.0-beta.1`. |
| `verify` | Unter Node.js 20, 22 und 24 die Prüfungen der CI außer Coverage und Build der Dokumentation: `npm ci`, Lint, Formatprüfung, Build, Typprüfung der Tests, Tests und Prüfung der Übersetzungen. |
| `pack` | Installiert die Abhängigkeiten ohne ihre Installationsskripte, baut `dist/` von Grund auf und packt das Paket. Lehnt ein Archiv ab, das etwas anderes als `dist/`, `package.json`, `README.md`, `LICENSE` und `CHANGELOG.md` oder eine Testdatei enthält, und bewahrt es dann als Artefakt des Laufs auf. |
| `publish` | Der einzige Job, der sich bei npm authentifizieren kann: Er checkt keinen Code aus, installiert nichts und führt kein Skript aus. Er prüft, dass npm mindestens Version 11.5.1 hat, und veröffentlicht dann das Archiv von `pack` mit `npm publish --provenance --access public --ignore-scripts`. |

Schlägt ein Job fehl, wird nichts veröffentlicht. Der Workflow startet bei einem Tag und nicht bei einem GitHub-Release, weil `npm version` und `git tag` den Tag ohnehin erzeugen: Ein einziger Push aus dem Terminal genügt, und ein GitHub-Release lässt sich danach immer noch aus dem Tag erstellen. Ein in einen Fork gepushter Tag führt die Prüfungen aus und veröffentlicht nichts. Eine Korrektur für eine ältere Minor-Version (ein Backport auf einem anderen Branch) lässt sich so nicht veröffentlichen: Ihr Tag liegt nicht auf `main`, und als `latest` veröffentlicht würde sie die neueste Version ersetzen. Das Skript `prepublishOnly` (`npm run clean && npm run verify`) schützt ein manuelles `npm publish`; der Workflow führt es nicht aus.

## Vor dem ersten Release {#before-the-first-release}

Diese Schritte erledigt der Eigentümer des Repositorys ein einziges Mal.

1. **Die npm-Organisation anlegen.** Der Paketname hat einen Scope: `@sdk-ai-agents`. Legen Sie auf npmjs.com mit dem Konto, dem das Paket gehören soll, die Organisation `sdk-ai-agents` an (der kostenlose Tarif reicht für öffentliche Pakete). Solange sie nicht existiert, antwortet npm mit „Scope not found“, und nichts kann veröffentlicht werden.
2. **Ein Token für die erste Version erstellen.** Trusted Publishing (nächster Abschnitt) lässt sich nur für ein Paket einrichten, das bereits auf npm existiert; die erste Version wird deshalb mit einem Token veröffentlicht. Öffnen Sie auf npmjs.com *Access Tokens* und erzeugen Sie ein *granular access token*: Berechtigung *Read and write* für den Scope `@sdk-ai-agents`, *Bypass two-factor authentication* angehakt (der Workflow kann keinen Code eingeben) und eine kurze Gültigkeit, zum Beispiel eine Woche.
3. **Es in GitHub hinterlegen.** Legen Sie in den Einstellungen des Repositorys unter *Secrets and variables* › *Actions* das Repository-Secret `NPM_TOKEN` mit dem Token als Wert an.
4. Wechseln Sie nach dem ersten Release zu Trusted Publishing und löschen Sie das Token (siehe unten).

## Eine Version veröffentlichen {#release-a-version}

1. **Den zu veröffentlichenden Branch prüfen.** Auf einem aktuellen `main`:

   ```sh
   npm run clean && npm run verify   # lint, format, build, type-check, tests, translations
   npm pack --dry-run                # the files that would be published
   ```

   Das Paket enthält nur `dist/` (JavaScript, Typdeklarationen und Source Maps, die ihre Quellen enthalten), `README.md`, `LICENSE`, `CHANGELOG.md` und `package.json`.

2. **Die Nummer wählen**, nach [semantischer Versionierung](https://semver.org/). Solange die Version mit `0.` beginnt, erhöht eine Änderung, die bestehenden Code bricht, die Minor-Nummer (`0.2.0` → `0.3.0`) und alles andere die Patch-Nummer (`0.3.0` → `0.3.1`): Wer `^0.3.0` installiert hat, bekommt automatisch nur die Versionen `0.3.x`.

3. **Das Änderungsprotokoll aktualisieren.** Verschieben Sie auf einem neuen Branch die Einträge unter `## [Unreleased]` in `CHANGELOG.md` unter eine Überschrift mit Version und Datum, und lassen Sie darüber ein leeres `## [Unreleased]` stehen:

   ```md
   ## [Unreleased]

   ## [0.3.0] - 2026-10-01

   ### Added
   - …
   ```

   Bei einem Release (keiner Vorabversion) lehnt der Job `version` einen Tag ab, dessen Abschnitt fehlt oder wenn unter `## [Unreleased]` noch etwas steht, selbst eine leere `###`-Überschrift.

4. **Die Version ändern**, ohne den Tag schon zu erstellen (der Tag muss auf den gemergten Commit zeigen):

   ```sh
   npm version 0.3.0 --no-git-tag-version
   ```

   Das aktualisiert `package.json` und `package-lock.json`. Ändern Sie auch `const version` in `docs/.vitepress/config.mts`, die Version, die das Menü der Dokumentationsseite anzeigt.

5. **Mergen.** Committen Sie (`chore(release): 0.3.0`), öffnen Sie einen Pull Request, warten Sie auf die CI und mergen Sie ihn.

6. **Den Tag pushen**, auf dem gemergten Commit:

   ```sh
   git switch main
   git pull
   git tag -a v0.3.0 -m "v0.3.0"
   git push origin v0.3.0
   ```

7. **Den Lauf verfolgen**, im Tab *Actions* des Repositorys, Workflow *Release*.

8. **Nach dem Release.** Setzen Sie `@sdk-ai-agents/core` in `templates/starter-template/package.json` auf die neue Version (`^0.3.0`).

Pushen Sie immer nur einen Tag auf einmal: GitHub startet keinen Workflow, wenn mehr als drei Tags gleichzeitig gepusht werden, was mit `git push --tags` passieren kann. Eine Vorabversion (`npm version 0.4.0-beta.1 --no-git-tag-version`, Tag `v0.4.0-beta.1`) wird unter dem Dist-Tag `next` veröffentlicht: Sie wird mit `@sdk-ai-agents/core@next` installiert, und `npm install @sdk-ai-agents/core` liefert weiterhin die neueste stabile Version.

## Das veröffentlichte Paket prüfen {#check-the-published-package}

```sh
npm view @sdk-ai-agents/core version dist-tags
```

Die Seite des Pakets auf npmjs.com zeigt einen Abschnitt *Provenance*, der auf den Commit und den Workflow-Lauf verweist, die es gebaut haben. Um das Paket so auszuprobieren, wie es ein Nutzer tun würde, in einem leeren Ordner:

```sh
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28
node -e "import('@sdk-ai-agents/core').then((sdk) => console.log(typeof sdk.createSDK))"
npm audit signatures
```

`function` bedeutet, dass das Paket geladen wird. `npm audit signatures` prüft die Signaturen der Registry und die Provenance-Attestierungen der installierten Pakete.

## Zu Trusted Publishing wechseln {#switch-to-trusted-publishing}

Sobald die erste Version auf npm ist, kann der Workflow ganz ohne Secret veröffentlichen: npm vertraut der OIDC-Identität, die GitHub dem Workflow-Lauf gibt. Es bleibt kein langlebiges Secret übrig, das durchsickern könnte, und die Provenance wird immer hinzugefügt.

1. Öffnen Sie auf npmjs.com die *Settings* des Pakets, Abschnitt *Trusted publishing*, und fügen Sie einen GitHub-Actions-Publisher hinzu: Benutzer `nicolashedoire`, Repository `sdk-ai-agents`, Workflow-Datei `release.yml`, keine Umgebung. Erlauben Sie ihm, mit `npm publish` zu veröffentlichen (der Workflow veröffentlicht direkt und stellt keine Versionen zurück). Alle Felder unterscheiden Groß- und Kleinschreibung.
2. Wählen Sie in denselben Einstellungen unter *Publishing access* die Option *Require two-factor authentication and disallow tokens*.
3. Löschen Sie das Secret `NPM_TOKEN` in GitHub und das Token auf npmjs.com.

Der Workflow ändert sich nicht: npm 11.5.1 oder neuer, was der Job `publish` prüft, versucht zuerst Trusted Publishing und verwendet `NPM_TOKEN` nur, wenn es nicht eingerichtet ist. npm hat angekündigt, dass direktes Veröffentlichen mit einem granular access token im Januar 2027 nicht mehr funktionieren wird; der Wechsel ist also ohnehin nötig. Siehe die npm-Dokumentation zu [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) und [Provenance](https://docs.npmjs.com/generating-provenance-statements).

## Wenn etwas schiefgeht {#if-something-goes-wrong}

- **Der Job `version` oder eine Prüfung schlägt fehl.** Es wurde nichts veröffentlicht. Löschen Sie den Tag, beheben Sie die Ursache über einen Pull Request und setzen Sie den Tag dann auf den neuen gemergten Commit:

  ```sh
  git tag -d v0.3.0
  git push origin :refs/tags/v0.3.0
  ```

- **`publish` scheitert mit „Scope not found“ oder einem 404.** Die npm-Organisation existiert noch nicht, oder das Token darf nicht in sie schreiben.
- **`publish` scheitert mit einem 403, laut dem die Version bereits veröffentlicht wurde.** Eine Versionsnummer lässt sich auf npm nur einmal verwenden: Erhöhen Sie sie und veröffentlichen Sie erneut.
- **Eine veröffentlichte Version ist fehlerhaft.** Markieren Sie sie mit `npm deprecate @sdk-ai-agents/core@0.3.0 "Broken, use 0.3.1"` und veröffentlichen Sie eine Korrektur. npm erlaubt das Entfernen einer Version nur unter den Bedingungen seiner [Unpublish-Richtlinie](https://docs.npmjs.com/policies/unpublish), und ihre Nummer kann nie wieder verwendet werden.
- **`publish` ist aus einem vorübergehenden Grund gescheitert** (npm nicht erreichbar, Netzwerk). Starten Sie die fehlgeschlagenen Jobs auf der Seite des Laufs neu: `publish` lädt das Archiv herunter, das `pack` 7 Tage lang als Artefakt aufbewahrt. Danach starten Sie alle Jobs neu.
