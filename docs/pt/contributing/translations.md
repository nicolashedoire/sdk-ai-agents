# Traduzir a documentação

A documentação é escrita em inglês e traduzida para dez idiomas: francês, espanhol, alemão, chinês simplificado, português do Brasil, japonês, coreano, russo, árabe e hindi. O menu de idiomas no topo de cada página alterna entre eles.

::: tip Em palavras simples
O inglês é a referência. Todos os outros idiomas são uma cópia das páginas em inglês com o texto traduzido e todo o resto mantido idêntico: o código, os links, as tabelas e as âncoras dos títulos. Uma verificação executada pela CI recusa uma mudança que deixe uma tradução para trás.
:::

## Onde ficam as coisas {#where-things-are}

| O quê | Onde |
| --- | --- |
| Páginas em inglês | `docs/guide/`, `docs/reference/`, `docs/contributing/`, `docs/index.md` |
| Uma tradução | Os mesmos arquivos em `docs/<code>/`, por exemplo `docs/fr/guide/memory.md` |
| Menus, botões, textos da pesquisa | `docs/.vitepress/i18n/<code>.ts`, traduzido de `i18n/en.ts` |
| Idiomas e barra lateral | `docs/.vitepress/i18n/structure.ts` |
| A verificação | `docs/.vitepress/check-translations.ts`, executada com `npm run docs:check` |

## As regras de uma tradução {#the-rules-of-a-translation}

1. **Traduza o texto, mantenha o resto.** Os blocos de código permanecem idênticos ao inglês, incluindo os comentários, para que um leitor possa copiar o mesmo código, qualquer que seja o idioma. Os nomes de opções, de funções, os tipos de eventos e valores como `committed` nunca são traduzidos.
2. **Mantenha a âncora em inglês de cada título.** Outras páginas fazem links para seções pela âncora delas (`./memory#statuses`). Um título traduzido termina com a âncora em inglês:

   ```md
   ## Statuts {#statuses}
   ```

3. **Mantenha os links.** Os mesmos links, para as mesmas páginas, na mesma pasta. Na página inicial, os links do front matter recebem o prefixo do idioma (`/fr/guide/introduction`).
4. **Mantenha a estrutura.** O mesmo número de tabelas e de linhas de tabela, as mesmas caixas de destaque (`::: tip`), as mesmas imagens.
5. **Os diagramas podem ser traduzidos.** Em um diagrama Mermaid, traduza apenas os rótulos; mantenha os nomes dos nós e as setas. Coloque um rótulo entre aspas quando ele contiver parênteses, vírgulas ou outra pontuação: `A["Tests (réels)"]`.
6. **Explique cada coisa.** Uma tradução é escrita para alguém que também não conhece o assunto: palavras simples primeiro, as mesmas explicações da página em inglês.

## Verificar uma tradução {#check-a-translation}

```sh
npm run docs:check          # every language
npm run docs:check -- fr    # one language
npm run docs:build          # then build the site
```

`docs:check` relata, para cada idioma e página: páginas ausentes ou a mais, código diferente do inglês, um título sem a âncora correta, um link ausente ou a mais, um link para uma página que não existe, uma tabela ou caixa de destaque diferente, um diagrama que não é Mermaid válido, e textos ou textos de interface ainda em inglês. A CI a executa em cada pull request.

## Quando você altera uma página em inglês {#when-you-change-an-english-page}

A CI falha até que todos os idiomas acompanhem a mudança. Para uma mudança de redação, atualize o mesmo trecho em cada idioma. Para um código novo, um título novo ou um link novo, a verificação diz quais páginas e quais linhas atualizar.

## Adicionar um idioma {#add-a-language}

1. Adicione-o a `LANGUAGES` em `docs/.vitepress/i18n/structure.ts`: o seu código, a sua tag [BCP 47](https://www.rfc-editor.org/info/bcp47), o seu nome no próprio idioma e `dir: 'rtl'` para um idioma escrito da direita para a esquerda.
2. Copie `i18n/en.ts` para `i18n/<code>.ts`, traduza os textos e importe-o em `docs/.vitepress/config.mts`.
3. Traduza todas as páginas em `docs/<code>/` e, depois, execute `npm run docs:check -- <code>`.

## Limites {#limits}

- **As ilustrações** (as imagens SVG) estão em inglês em todos os idiomas.
- **A pesquisa** indexa cada idioma separadamente; em chinês e em japonês, a pesquisa encontra palavras inteiras com menos precisão do que nos idiomas com espaços entre as palavras.
- **Qualidade.** As traduções foram escritas por um modelo de IA e verificadas pela CI em relação à estrutura em inglês, não revisadas por falantes nativos de cada idioma. Correções são bem-vindas: use "Editar esta página no GitHub" no rodapé de cada página.
