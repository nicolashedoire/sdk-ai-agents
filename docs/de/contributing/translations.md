# Die Dokumentation übersetzen

Die Dokumentation ist auf Englisch geschrieben und in zehn Sprachen übersetzt: Französisch, Spanisch, Deutsch, vereinfachtes Chinesisch, brasilianisches Portugiesisch, Japanisch, Koreanisch, Russisch, Arabisch und Hindi. Das Sprachmenü oben auf jeder Seite wechselt zwischen ihnen.

::: tip In einfachen Worten
Englisch ist die Referenz. Jede andere Sprache ist eine Kopie der englischen Seiten, in der der Text übersetzt und alles andere unverändert gelassen wird: der Code, die Links, die Tabellen und die Anker der Überschriften. Eine Prüfung in der CI lehnt jede Änderung ab, die eine Übersetzung zurücklässt.
:::

## Wo die Dinge liegen {#where-things-are}

| Was | Wo |
| --- | --- |
| Englische Seiten | `docs/guide/`, `docs/reference/`, `docs/contributing/`, `docs/index.md` |
| Eine Übersetzung | Dieselben Dateien unter `docs/<code>/`, zum Beispiel `docs/fr/guide/memory.md` |
| Menüs, Schaltflächen, Suchtexte | `docs/.vitepress/i18n/<code>.ts`, übersetzt aus `i18n/en.ts` |
| Sprachen und Seitenleiste | `docs/.vitepress/i18n/structure.ts` |
| Die Prüfung | `docs/.vitepress/check-translations.ts`, ausgeführt mit `npm run docs:check` |

## Die Regeln einer Übersetzung {#the-rules-of-a-translation}

1. **Den Text übersetzen, den Rest beibehalten.** Codeblöcke bleiben mit dem Englischen identisch, Kommentare eingeschlossen, damit Leser unabhängig von der Sprache denselben Code kopieren können. Namen von Optionen, Funktionen, Ereignistypen und Werte wie `committed` werden nie übersetzt.
2. **Den englischen Anker jeder Überschrift beibehalten.** Andere Seiten verlinken Abschnitte über ihren Anker (`./memory#statuses`). Eine übersetzte Überschrift endet mit dem englischen Anker:

   ```md
   ## Statuts {#statuses}
   ```

3. **Die Links beibehalten.** Dieselben Links, auf dieselben Seiten, im selben Ordner. Auf der Startseite erhalten die Links im Front Matter das Sprachpräfix (`/fr/guide/introduction`).
4. **Die Struktur beibehalten.** Gleiche Anzahl an Tabellen und Tabellenzeilen, dieselben Hinweisboxen (`::: tip`), dieselben Bilder.
5. **Diagramme dürfen übersetzt werden.** Übersetzen Sie in einem Mermaid-Diagramm nur die Beschriftungen; behalten Sie Knotennamen und Pfeile bei. Setzen Sie eine Beschriftung in Anführungszeichen, wenn sie Klammern, Kommas oder andere Satzzeichen enthält: `A["Tests (réels)"]`.
6. **Jede Sache erklären.** Eine Übersetzung wird für jemanden geschrieben, der das Thema ebenfalls nicht kennt: zuerst einfache Worte, dieselben Erklärungen wie auf der englischen Seite.

## Eine Übersetzung prüfen {#check-a-translation}

```sh
npm run docs:check          # every language
npm run docs:check -- fr    # one language
npm run docs:build          # then build the site
```

`docs:check` meldet für jede Sprache und Seite: fehlende oder überzählige Seiten, Code, der vom Englischen abweicht, eine Überschrift ohne den richtigen Anker, einen fehlenden oder überzähligen Link, einen Link auf eine Seite, die nicht existiert, eine Tabelle oder Hinweisbox, die abweicht, ein Diagramm, das kein gültiges Mermaid ist, sowie Text oder Oberflächentexte, die noch auf Englisch sind. Die CI führt die Prüfung bei jedem Pull Request aus.

## Wenn Sie eine englische Seite ändern {#when-you-change-an-english-page}

Die CI schlägt fehl, bis jede Sprache nachgezogen hat. Bei einer geänderten Formulierung aktualisieren Sie dieselbe Passage in jeder Sprache. Bei neuem Code, einer neuen Überschrift oder einem neuen Link sagt Ihnen die Prüfung, welche Seiten und welche Zeilen zu aktualisieren sind.

## Eine Sprache hinzufügen {#add-a-language}

1. Fügen Sie sie zu `LANGUAGES` in `docs/.vitepress/i18n/structure.ts` hinzu: ihren Code, ihr [BCP-47](https://www.rfc-editor.org/info/bcp47)-Tag, ihren Namen in ihrer eigenen Sprache und `dir: 'rtl'` für eine Sprache, die von rechts nach links geschrieben wird.
2. Kopieren Sie `i18n/en.ts` nach `i18n/<code>.ts`, übersetzen Sie die Texte und importieren Sie die Datei in `docs/.vitepress/config.mts`.
3. Übersetzen Sie jede Seite nach `docs/<code>/` und führen Sie dann `npm run docs:check -- <code>` aus.

## Grenzen {#limits}

- **Illustrationen** (die SVG-Bilder) sind in jeder Sprache auf Englisch.
- **Die Suche** indiziert jede Sprache getrennt; auf Chinesisch und Japanisch findet die Suche ganze Wörter schlechter als in Sprachen mit Leerzeichen zwischen den Wörtern.
- **Qualität.** Die Übersetzungen wurden von einem KI-Modell geschrieben und von der CI gegen die englische Struktur geprüft, nicht von Muttersprachlern jeder Sprache Korrektur gelesen. Korrekturen sind willkommen: Verwenden Sie „Diese Seite auf GitHub bearbeiten“ unten auf jeder Seite.
