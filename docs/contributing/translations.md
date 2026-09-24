# Translating the docs

The documentation is written in English and translated into ten languages: French, Spanish, German, Simplified Chinese, Brazilian Portuguese, Japanese, Korean, Russian, Arabic and Hindi. The language menu at the top of every page switches between them.

::: tip In plain words
English is the reference. Every other language is a copy of the English pages with the text translated and everything else kept identical: the code, the links, the tables and the headings' anchors. A check run by the CI refuses a change that leaves a translation behind.
:::

## Where things are

| What | Where |
| --- | --- |
| English pages | `docs/guide/`, `docs/reference/`, `docs/contributing/`, `docs/index.md` |
| A translation | The same files under `docs/<code>/`, for example `docs/fr/guide/memory.md` |
| Menus, buttons, search texts | `docs/.vitepress/i18n/<code>.ts`, translated from `i18n/en.ts` |
| Languages and sidebar | `docs/.vitepress/i18n/structure.ts` |
| The check | `docs/.vitepress/check-translations.ts`, run with `npm run docs:check` |

## The rules of a translation

1. **Translate the text, keep the rest.** Code blocks stay identical to English, comments included, so that a reader can copy the same code whatever the language. Option names, function names, event types and values such as `committed` are never translated.
2. **Keep the English anchor of every heading.** Other pages link to sections by their anchor (`./memory#statuses`). A translated heading ends with the English anchor:

   ```md
   ## Statuts {#statuses}
   ```

3. **Keep the links.** The same links, to the same pages, in the same folder. On the home page, links in the front matter get the language prefix (`/fr/guide/introduction`).
4. **Keep the structure.** Same number of tables and table rows, same callout boxes (`::: tip`), same images.
5. **Diagrams can be translated.** In a Mermaid diagram, translate the labels only; keep the node names and arrows. Put a label in quotes when it contains parentheses, commas or other punctuation: `A["Tests (réels)"]`.
6. **Explain each thing.** A translation is written for someone who does not know the subject either: plain words first, the same explanations as the English page.

## Check a translation

```sh
npm run docs:check          # every language
npm run docs:check -- fr    # one language
npm run docs:build          # then build the site
```

`docs:check` reports, for each language and page: missing or extra pages, code that differs from English, a heading without the right anchor, a missing or extra link, a link to a page that does not exist, a table or callout box that differs, a diagram that is not valid Mermaid, and text or interface texts still in English. The CI runs it on every pull request.

## When you change an English page

The CI fails until every language follows. For a change of wording, update the same passage in each language. For new code, a new heading or a new link, the check tells you which pages and which lines to update.

## Add a language

1. Add it to `LANGUAGES` in `docs/.vitepress/i18n/structure.ts`: its code, its [BCP 47](https://www.rfc-editor.org/info/bcp47) tag, its name in its own language, and `dir: 'rtl'` for a language written from right to left.
2. Copy `i18n/en.ts` to `i18n/<code>.ts`, translate the texts, and import it in `docs/.vitepress/config.mts`.
3. Translate every page into `docs/<code>/`, then run `npm run docs:check -- <code>`.

## Limits

- **Illustrations** (the SVG images) are in English in every language.
- **Search** indexes each language apart; in Chinese and Japanese, search matches whole words less well than in languages with spaces between words.
- **Quality.** The translations were written by an AI model and checked against the English structure by the CI, not proofread by native speakers of every language. Corrections are welcome: use "Edit this page on GitHub" at the bottom of each page.
