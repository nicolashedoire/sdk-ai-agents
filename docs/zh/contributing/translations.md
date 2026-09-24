# 翻译文档

本文档以英文编写，并被翻译成十种语言：法语、西班牙语、德语、简体中文、巴西葡萄牙语、日语、韩语、俄语、阿拉伯语和印地语。每个页面顶部的语言菜单可以在它们之间切换。

::: tip 通俗地说
英文是参照标准。其他每种语言都是英文页面的副本：文本被翻译，其余一切保持不变——代码、链接、表格以及标题的锚点。CI 运行的一项检查会拒绝任何让某个译本落后的改动。
:::

## 各部分在哪里 {#where-things-are}

| 内容 | 位置 |
| --- | --- |
| 英文页面 | `docs/guide/`、`docs/reference/`、`docs/contributing/`、`docs/index.md` |
| 一个译本 | `docs/<code>/` 下的同名文件，例如 `docs/fr/guide/memory.md` |
| 菜单、按钮、搜索文本 | `docs/.vitepress/i18n/<code>.ts`，译自 `i18n/en.ts` |
| 语言和侧边栏 | `docs/.vitepress/i18n/structure.ts` |
| 检查 | `docs/.vitepress/check-translations.ts`，用 `npm run docs:check` 运行 |

## 翻译的规则 {#the-rules-of-a-translation}

1. **翻译文本，其余保留。** 代码块与英文保持完全一致，包括注释，这样无论使用哪种语言，读者都能复制同样的代码。选项名、函数名、事件类型以及 `committed` 这样的值永远不翻译。
2. **保留每个标题的英文锚点。** 其他页面通过锚点链接到某个小节（`./memory#statuses`）。翻译后的标题以英文锚点结尾：

   ```md
   ## Statuts {#statuses}
   ```

3. **保留链接。** 同样的链接，指向同样的页面，位于同样的文件夹中。在首页，front matter 中的链接要加上语言前缀（`/fr/guide/introduction`）。
4. **保留结构。** 表格和表格行的数量相同，提示框（`::: tip`）相同，图片相同。
5. **图表可以翻译。** 在 Mermaid 图表中，只翻译标签；保留节点名称和箭头。当标签包含括号、逗号或其他标点时，请给它加上引号：`A["Tests (réels)"]`。
6. **解释每一样东西。** 译文是写给同样不了解这个主题的人看的：先用通俗的话说，给出与英文页面相同的解释。

## 检查一个译本 {#check-a-translation}

```sh
npm run docs:check          # every language
npm run docs:check -- fr    # one language
npm run docs:build          # then build the site
```

`docs:check` 会针对每种语言和每个页面报告：缺失或多余的页面、与英文不同的代码、没有正确锚点的标题、缺失或多余的链接、指向不存在页面的链接、不同的表格或提示框、不是有效 Mermaid 的图表，以及仍然是英文的文本或界面文本。CI 会在每个 pull request 上运行它。

## 修改英文页面时 {#when-you-change-an-english-page}

在所有语言都跟上之前，CI 会一直失败。如果是措辞上的修改，请在每种语言中更新同一段内容。如果是新的代码、新的标题或新的链接，检查会告诉你需要更新哪些页面的哪些行。

## 添加一种语言 {#add-a-language}

1. 把它加入 `docs/.vitepress/i18n/structure.ts` 中的 `LANGUAGES`：它的代码、它的 [BCP 47](https://www.rfc-editor.org/info/bcp47) 标签、它用自身语言写出的名称，以及——对于从右向左书写的语言——`dir: 'rtl'`。
2. 把 `i18n/en.ts` 复制为 `i18n/<code>.ts`，翻译其中的文本，并在 `docs/.vitepress/config.mts` 中导入它。
3. 把每个页面翻译到 `docs/<code>/` 中，然后运行 `npm run docs:check -- <code>`。

## 局限 {#limits}

- **插图**（SVG 图片）在每种语言中都是英文的。
- **搜索**对每种语言分别建立索引；在中文和日文中，搜索对整词的匹配不如在词与词之间有空格的语言中那么好。
- **质量。** 这些译文由一个 AI 模型编写，并由 CI 对照英文结构进行检查，没有经过每种语言的母语者校对。欢迎指正：请使用每个页面底部的“在 GitHub 上编辑此页”。
