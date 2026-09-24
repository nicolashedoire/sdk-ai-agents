# Traduire la documentation

La documentation est rédigée en anglais et traduite en dix langues : français, espagnol, allemand, chinois simplifié, portugais du Brésil, japonais, coréen, russe, arabe et hindi. Le menu des langues, en haut de chaque page, permet de passer de l'une à l'autre.

::: tip En termes simples
L'anglais fait référence. Chaque autre langue est une copie des pages anglaises dont le texte est traduit et dont tout le reste est conservé à l'identique : le code, les liens, les tableaux et les ancres des titres. Une vérification exécutée par la CI refuse une modification qui laisse une traduction en retard.
:::

## Où se trouvent les éléments {#where-things-are}

| Quoi | Où |
| --- | --- |
| Pages en anglais | `docs/guide/`, `docs/reference/`, `docs/contributing/`, `docs/index.md` |
| Une traduction | Les mêmes fichiers sous `docs/<code>/`, par exemple `docs/fr/guide/memory.md` |
| Menus, boutons, textes de recherche | `docs/.vitepress/i18n/<code>.ts`, traduits à partir de `i18n/en.ts` |
| Langues et barre latérale | `docs/.vitepress/i18n/structure.ts` |
| La vérification | `docs/.vitepress/check-translations.ts`, lancée avec `npm run docs:check` |

## Les règles d'une traduction {#the-rules-of-a-translation}

1. **Traduire le texte, conserver le reste.** Les blocs de code restent identiques à l'anglais, commentaires compris, pour qu'un lecteur puisse copier le même code quelle que soit la langue. Les noms d'options, de fonctions, les types d'événements et les valeurs comme `committed` ne sont jamais traduits.
2. **Conserver l'ancre anglaise de chaque titre.** D'autres pages renvoient à des sections par leur ancre (`./memory#statuses`). Un titre traduit se termine par l'ancre anglaise :

   ```md
   ## Statuts {#statuses}
   ```

3. **Conserver les liens.** Les mêmes liens, vers les mêmes pages, dans le même dossier. Sur la page d'accueil, les liens du front matter reçoivent le préfixe de la langue (`/fr/guide/introduction`).
4. **Conserver la structure.** Le même nombre de tableaux et de lignes de tableau, les mêmes encadrés (`::: tip`), les mêmes images.
5. **Les diagrammes peuvent être traduits.** Dans un diagramme Mermaid, ne traduisez que les libellés ; conservez les noms des nœuds et les flèches. Mettez un libellé entre guillemets quand il contient des parenthèses, des virgules ou une autre ponctuation : `A["Tests (réels)"]`.
6. **Expliquer chaque chose.** Une traduction s'adresse, elle aussi, à quelqu'un qui ne connaît pas le sujet : des mots simples d'abord, les mêmes explications que la page anglaise.

## Vérifier une traduction {#check-a-translation}

```sh
npm run docs:check          # every language
npm run docs:check -- fr    # one language
npm run docs:build          # then build the site
```

`docs:check` signale, pour chaque langue et chaque page : les pages manquantes ou en trop, le code qui diffère de l'anglais, un titre sans la bonne ancre, un lien manquant ou en trop, un lien vers une page qui n'existe pas, un tableau ou un encadré qui diffère, un diagramme qui n'est pas du Mermaid valide, ainsi que du texte ou des textes d'interface encore en anglais. La CI l'exécute sur chaque pull request.

## Quand vous modifiez une page anglaise {#when-you-change-an-english-page}

La CI échoue tant que toutes les langues n'ont pas suivi. Pour un changement de formulation, mettez à jour le même passage dans chaque langue. Pour du code nouveau, un nouveau titre ou un nouveau lien, la vérification vous indique quelles pages et quelles lignes mettre à jour.

## Ajouter une langue {#add-a-language}

1. Ajoutez-la à `LANGUAGES` dans `docs/.vitepress/i18n/structure.ts` : son code, son étiquette [BCP 47](https://www.rfc-editor.org/info/bcp47), son nom dans sa propre langue, et `dir: 'rtl'` pour une langue qui s'écrit de droite à gauche.
2. Copiez `i18n/en.ts` vers `i18n/<code>.ts`, traduisez les textes, et importez le fichier dans `docs/.vitepress/config.mts`.
3. Traduisez chaque page dans `docs/<code>/`, puis lancez `npm run docs:check -- <code>`.

## Limites {#limits}

- **Les illustrations** (les images SVG) sont en anglais dans toutes les langues.
- **La recherche** indexe chaque langue séparément ; en chinois et en japonais, la recherche retrouve moins bien les mots entiers que dans les langues qui séparent les mots par des espaces.
- **La qualité.** Les traductions ont été rédigées par un modèle d'IA et vérifiées par la CI par rapport à la structure anglaise, sans relecture par des locuteurs natifs de chaque langue. Les corrections sont les bienvenues : utilisez « Modifier cette page sur GitHub » en bas de chaque page.
