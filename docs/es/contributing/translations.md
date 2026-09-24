# Traducir la documentación

La documentación está escrita en inglés y traducida a diez idiomas: francés, español, alemán, chino simplificado, portugués de Brasil, japonés, coreano, ruso, árabe e hindi. El menú de idiomas de la parte superior de cada página permite cambiar entre ellos.

::: tip En palabras sencillas
El inglés es la referencia. Cada uno de los demás idiomas es una copia de las páginas en inglés con el texto traducido y todo lo demás idéntico: el código, los enlaces, las tablas y las anclas de los títulos. Una comprobación que ejecuta la CI rechaza cualquier cambio que deje atrás una traducción.
:::

## Dónde está cada cosa {#where-things-are}

| Qué | Dónde |
| --- | --- |
| Páginas en inglés | `docs/guide/`, `docs/reference/`, `docs/contributing/`, `docs/index.md` |
| Una traducción | Los mismos archivos en `docs/<code>/`, por ejemplo `docs/fr/guide/memory.md` |
| Menús, botones, textos de búsqueda | `docs/.vitepress/i18n/<code>.ts`, traducido a partir de `i18n/en.ts` |
| Idiomas y barra lateral | `docs/.vitepress/i18n/structure.ts` |
| La comprobación | `docs/.vitepress/check-translations.ts`, que se ejecuta con `npm run docs:check` |

## Las reglas de una traducción {#the-rules-of-a-translation}

1. **Traduce el texto, conserva el resto.** Los bloques de código se mantienen idénticos al inglés, comentarios incluidos, para que un lector pueda copiar el mismo código sea cual sea el idioma. Los nombres de opciones, los nombres de funciones, los tipos de eventos y los valores como `committed` nunca se traducen.
2. **Conserva el ancla inglesa de cada título.** Otras páginas enlazan a las secciones por su ancla (`./memory#statuses`). Un título traducido termina con el ancla inglesa:

   ```md
   ## Statuts {#statuses}
   ```

3. **Conserva los enlaces.** Los mismos enlaces, a las mismas páginas, en la misma carpeta. En la página de inicio, los enlaces del front matter llevan el prefijo del idioma (`/fr/guide/introduction`).
4. **Conserva la estructura.** El mismo número de tablas y de filas de tabla, los mismos recuadros destacados (`::: tip`), las mismas imágenes.
5. **Los diagramas se pueden traducir.** En un diagrama Mermaid, traduce solo las etiquetas; conserva los nombres de los nodos y las flechas. Pon una etiqueta entre comillas cuando contenga paréntesis, comas u otros signos de puntuación: `A["Tests (réels)"]`.
6. **Explica cada cosa.** Una traducción se escribe para alguien que tampoco conoce el tema: primero palabras sencillas, con las mismas explicaciones que la página en inglés.

## Comprobar una traducción {#check-a-translation}

```sh
npm run docs:check          # every language
npm run docs:check -- fr    # one language
npm run docs:build          # then build the site
```

`docs:check` informa, para cada idioma y cada página, de: las páginas que faltan o que sobran, el código que difiere del inglés, un título sin el ancla correcta, un enlace que falta o que sobra, un enlace a una página que no existe, una tabla o un recuadro destacado que difiere, un diagrama que no es Mermaid válido, y el texto o los textos de la interfaz que siguen en inglés. La CI lo ejecuta en cada pull request.

## Cuando cambias una página en inglés {#when-you-change-an-english-page}

La CI falla hasta que todos los idiomas se ponen al día. Para un cambio de redacción, actualiza el mismo pasaje en cada idioma. Para código nuevo, un título nuevo o un enlace nuevo, la comprobación te dice qué páginas y qué líneas hay que actualizar.

## Añadir un idioma {#add-a-language}

1. Añádelo a `LANGUAGES` en `docs/.vitepress/i18n/structure.ts`: su código, su etiqueta [BCP 47](https://www.rfc-editor.org/info/bcp47), su nombre en su propio idioma, y `dir: 'rtl'` para un idioma que se escribe de derecha a izquierda.
2. Copia `i18n/en.ts` a `i18n/<code>.ts`, traduce los textos e impórtalo en `docs/.vitepress/config.mts`.
3. Traduce cada página en `docs/<code>/` y después ejecuta `npm run docs:check -- <code>`.

## Límites {#limits}

- **Las ilustraciones** (las imágenes SVG) están en inglés en todos los idiomas.
- **La búsqueda** indexa cada idioma por separado; en chino y en japonés, la búsqueda encuentra peor las palabras completas que en los idiomas con espacios entre palabras.
- **Calidad.** Las traducciones las escribió un modelo de IA y la CI las comprobó contra la estructura en inglés; no las han revisado hablantes nativos de cada idioma. Las correcciones son bienvenidas: usa "Editar esta página en GitHub" al final de cada página.
