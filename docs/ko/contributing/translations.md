# 문서 번역하기

이 문서는 영어로 작성되며 열 개 언어로 번역됩니다. 프랑스어, 스페인어, 독일어, 중국어 간체, 브라질 포르투갈어, 일본어, 한국어, 러시아어, 아랍어, 힌디어입니다. 모든 페이지 상단의 언어 메뉴로 언어를 바꿀 수 있습니다.

::: tip 쉽게 말하면
영어가 기준입니다. 다른 모든 언어는 영어 페이지의 복사본으로, 텍스트는 번역되고 그 밖의 모든 것은 똑같이 유지됩니다. 코드, 링크, 표, 그리고 제목의 앵커가 그렇습니다. CI가 실행하는 검사는 번역을 뒤처지게 만드는 변경을 거부합니다.
:::

## 무엇이 어디에 있나 {#where-things-are}

| 무엇 | 어디 |
| --- | --- |
| 영어 페이지 | `docs/guide/`, `docs/reference/`, `docs/contributing/`, `docs/index.md` |
| 번역 | `docs/<code>/` 아래의 같은 파일, 예: `docs/fr/guide/memory.md` |
| 메뉴, 버튼, 검색 텍스트 | `docs/.vitepress/i18n/<code>.ts`, `i18n/en.ts`에서 번역 |
| 언어와 사이드바 | `docs/.vitepress/i18n/structure.ts` |
| 검사 | `docs/.vitepress/check-translations.ts`, `npm run docs:check`로 실행 |

## 번역의 규칙 {#the-rules-of-a-translation}

1. **텍스트는 번역하고, 나머지는 유지합니다.** 코드 블록은 주석을 포함해 영어와 똑같이 유지합니다. 그래야 독자가 어떤 언어로 읽든 같은 코드를 복사할 수 있습니다. 옵션 이름, 함수 이름, 이벤트 유형, 그리고 `committed` 같은 값은 절대 번역하지 않습니다.
2. **모든 제목의 영어 앵커를 유지합니다.** 다른 페이지는 앵커로 섹션에 링크합니다(`./memory#statuses`). 번역된 제목은 영어 앵커로 끝납니다.

   ```md
   ## Statuts {#statuses}
   ```

3. **링크를 유지합니다.** 같은 링크, 같은 페이지, 같은 폴더입니다. 홈 페이지에서는 front matter의 링크에 언어 접두사가 붙습니다(`/fr/guide/introduction`).
4. **구조를 유지합니다.** 표와 표 행의 수, 콜아웃 상자(`::: tip`), 이미지가 같아야 합니다.
5. **다이어그램은 번역할 수 있습니다.** Mermaid 다이어그램에서는 레이블만 번역하고, 노드 이름과 화살표는 유지합니다. 괄호, 쉼표 또는 그 밖의 문장 부호가 들어 있는 레이블은 따옴표로 감쌉니다: `A["Tests (réels)"]`.
6. **각각을 설명합니다.** 번역도 그 주제를 모르는 사람을 위해 씁니다. 쉬운 말을 먼저 쓰고, 영어 페이지와 같은 설명을 담습니다.

## 번역 검사하기 {#check-a-translation}

```sh
npm run docs:check          # every language
npm run docs:check -- fr    # one language
npm run docs:build          # then build the site
```

`docs:check`는 언어와 페이지마다 다음을 보고합니다. 빠지거나 남는 페이지, 영어와 다른 코드, 올바른 앵커가 없는 제목, 빠지거나 남는 링크, 존재하지 않는 페이지로의 링크, 달라진 표나 콜아웃 상자, 유효한 Mermaid가 아닌 다이어그램, 그리고 아직 영어로 남은 텍스트나 인터페이스 텍스트입니다. CI는 모든 풀 리퀘스트에서 이를 실행합니다.

## 영어 페이지를 바꿀 때 {#when-you-change-an-english-page}

모든 언어가 따라올 때까지 CI는 실패합니다. 표현을 바꿨다면 각 언어의 같은 구절을 업데이트하세요. 새 코드, 새 제목, 새 링크라면, 검사가 어떤 페이지의 어떤 줄을 업데이트해야 하는지 알려 줍니다.

## 언어 추가하기 {#add-a-language}

1. `docs/.vitepress/i18n/structure.ts`의 `LANGUAGES`에 추가합니다. 언어 코드, [BCP 47](https://www.rfc-editor.org/info/bcp47) 태그, 그 언어로 쓴 이름, 그리고 오른쪽에서 왼쪽으로 쓰는 언어라면 `dir: 'rtl'`을 적습니다.
2. `i18n/en.ts`를 `i18n/<code>.ts`로 복사하고, 텍스트를 번역하고, `docs/.vitepress/config.mts`에서 import합니다.
3. 모든 페이지를 `docs/<code>/`로 번역한 다음, `npm run docs:check -- <code>`를 실행합니다.

## 한계 {#limits}

- **그림**(SVG 이미지)은 모든 언어에서 영어입니다.
- **검색**은 언어마다 따로 색인합니다. 중국어와 일본어에서는 단어 사이에 공백이 있는 언어보다 검색이 온전한 단어를 잘 찾지 못합니다.
- **품질.** 번역은 AI 모델이 작성했고 CI가 영어 구조와 대조해 검사했지만, 모든 언어의 원어민이 교정하지는 않았습니다. 수정은 언제든 환영합니다. 각 페이지 하단의 "GitHub에서 이 페이지 편집하기"를 이용하세요.
