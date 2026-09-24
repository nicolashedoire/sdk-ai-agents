# 릴리스하기

이 SDK는 npm에 `@sdk-ai-agents/core`라는 이름으로 게시됩니다. 누구도 자기 컴퓨터에서 게시하지 않습니다. `v0.3.0` 같은 태그가 푸시되면 GitHub Actions의 `Release` 워크플로([`release.yml`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/.github/workflows/release.yml))가 버전을 검사하고 게시합니다.

::: tip 쉽게 말하면
릴리스는 세 단계입니다. 새 버전 번호와 바뀐 내용을 적고, 그 변경을 병합한 다음, 버전 이름을 붙인 태그를 푸시합니다. GitHub가 검사를 다시 실행하고 패키지를 npm에 게시하며, 어떤 커밋과 어떤 워크플로가 패키지를 빌드했는지 밝히는 서명된 증명도 함께 게시합니다.
:::

## 워크플로가 하는 일 {#what-the-workflow-does}

| 잡 | 하는 일 |
| --- | --- |
| `version` | `v` 뒤에 `package.json`의 버전이 붙은 형태가 아닌 태그, `main`에 없는 커밋에 붙은 태그, 그리고 `CHANGELOG.md`에 `## [x.y.z]` 섹션이 없는 릴리스를 거부합니다. npm dist-tag를 고릅니다. 보통은 `latest`, `0.4.0-beta.1` 같은 프리릴리스라면 `next`입니다. |
| `verify` | Node.js 20, 22, 24에서 커버리지와 문서 빌드를 제외한 CI 검사를 실행합니다. `npm ci`, lint, 포맷 검사, 빌드, 테스트 타입 검사, 테스트, 번역 검사입니다. |
| `pack` | 설치 스크립트 없이 의존성을 설치하고, `dist/`를 처음부터 빌드한 뒤 패키지를 만듭니다. `dist/`, `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md` 외의 파일이나 테스트 파일이 든 아카이브는 거부하고, 문제가 없으면 실행의 아티팩트로 보관합니다. |
| `publish` | npm에 인증할 수 있는 유일한 잡입니다. 코드를 체크아웃하지 않고, 아무것도 설치하지 않으며, 스크립트도 실행하지 않습니다. npm이 11.5.1 이상인지 확인한 뒤 `pack`의 아카이브를 `npm publish --provenance --access public --ignore-scripts`로 게시합니다. |

잡이 하나라도 실패하면 아무것도 게시되지 않습니다. 워크플로가 GitHub 릴리스가 아니라 태그로 시작하는 이유는 `npm version`과 `git tag`가 어차피 태그를 만들기 때문입니다. 터미널에서 푸시 한 번이면 충분하고, GitHub 릴리스는 나중에 태그를 바탕으로 작성할 수 있습니다. 포크에 푸시된 태그는 검사만 실행하고 아무것도 게시하지 않습니다. 이전 마이너 버전을 위한 수정(다른 브랜치에서 한 백포트)은 이 방식으로 릴리스할 수 없습니다. 그 태그는 `main`에 있지 않고, `latest`로 게시되면 최신 버전을 대체하게 됩니다. `prepublishOnly` 스크립트(`npm run clean && npm run verify`)는 수동 `npm publish`를 보호하며, 워크플로는 이를 실행하지 않습니다.

## 첫 릴리스 전에 {#before-the-first-release}

이 단계들은 저장소 소유자가 한 번만 수행합니다.

1. **npm 조직을 만듭니다.** 패키지 이름에는 스코프 `@sdk-ai-agents`가 붙어 있습니다. npmjs.com에서 패키지를 소유할 계정으로 `sdk-ai-agents` 조직을 만드세요(공개 패키지라면 무료 요금제로 충분합니다). 조직이 없는 동안에는 npm이 "Scope not found"라고 답하고, 아무것도 게시할 수 없습니다.
2. **첫 버전용 토큰을 만듭니다.** 신뢰할 수 있는 게시(다음 섹션)는 이미 npm에 있는 패키지에만 설정할 수 있으므로, 첫 버전은 토큰으로 게시합니다. npmjs.com에서 *Access Tokens*를 열고 *granular access token*을 생성하세요. `@sdk-ai-agents` 스코프에 *Read and write* 권한을 주고, *Bypass two-factor authentication*을 체크하고(워크플로는 코드를 입력할 수 없습니다), 만료 기간은 짧게, 예를 들어 1주일로 정합니다.
3. **GitHub에 저장합니다.** 저장소 설정의 *Secrets and variables* › *Actions*에서 토큰을 값으로 하는 저장소 시크릿 `NPM_TOKEN`을 만드세요.
4. 첫 릴리스가 끝나면 신뢰할 수 있는 게시로 전환하고 토큰을 삭제하세요(아래 참고).

## 버전 릴리스하기 {#release-a-version}

1. **릴리스할 브랜치를 검사합니다.** 최신 상태의 `main`에서 실행합니다.

   ```sh
   npm run clean && npm run verify   # lint, format, build, type-check, tests, translations
   npm pack --dry-run                # the files that would be published
   ```

   패키지에는 `dist/`(JavaScript, 타입 선언, 소스를 포함한 source map), `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`만 들어 있습니다.

2. **번호를 고릅니다.** [유의적 버전](https://semver.org/)을 따릅니다. 버전이 `0.`으로 시작하는 동안에는 기존 코드를 깨뜨리는 변경은 마이너 번호를 올리고(`0.2.0` → `0.3.0`), 나머지는 패치 번호를 올립니다(`0.3.0` → `0.3.1`). `^0.3.0`을 설치한 사용자는 `0.3.x` 버전만 자동으로 받습니다.

3. **변경 이력을 갱신합니다.** 새 브랜치에서 `CHANGELOG.md`의 `## [Unreleased]` 항목을 버전과 날짜가 적힌 제목 아래로 옮기고, 그 위에 빈 `## [Unreleased]`를 남깁니다.

   ```md
   ## [Unreleased]

   ## [0.3.0] - 2026-10-01

   ### Added
   - …
   ```

   프리릴리스가 아닌 릴리스라면, 이 섹션이 없을 때 `version` 잡이 태그를 거부합니다.

4. **버전을 바꿉니다.** 태그는 아직 만들지 않습니다(태그는 병합된 커밋을 가리켜야 합니다).

   ```sh
   npm version 0.3.0 --no-git-tag-version
   ```

   이 명령은 `package.json`과 `package-lock.json`을 갱신합니다. 문서 사이트 메뉴에 표시되는 버전인 `docs/.vitepress/config.mts`의 `const version`도 바꾸세요.

5. **병합합니다.** 커밋하고(`chore(release): 0.3.0`), 풀 리퀘스트를 연 다음, CI를 기다렸다가 병합하세요.

6. **태그를 푸시합니다.** 병합된 커밋에 태그를 붙입니다.

   ```sh
   git switch main
   git pull
   git tag -a v0.3.0 -m "v0.3.0"
   git push origin v0.3.0
   ```

7. **실행을 지켜봅니다.** 저장소의 *Actions* 탭에서 *Release* 워크플로를 확인합니다.

8. **릴리스 후.** `templates/starter-template/package.json`의 `@sdk-ai-agents/core`를 새 버전(`^0.3.0`)으로 바꾸세요. 첫 릴리스 후에만 `docs/npm-install` 브랜치의 풀 리퀘스트도 병합하세요. 패키지가 npm에 올라가기 전까지 설치 안내는 GitHub에서 설치하도록 되어 있습니다.

태그는 한 번에 하나씩 푸시하세요. 한 번에 세 개가 넘는 태그가 푸시되면 GitHub는 워크플로를 하나도 시작하지 않는데, `git push --tags`가 그렇게 할 수 있습니다. 프리릴리스(`npm version 0.4.0-beta.1 --no-git-tag-version`, 태그 `v0.4.0-beta.1`)는 dist-tag `next`로 게시됩니다. `@sdk-ai-agents/core@next`로 설치하며, `npm install @sdk-ai-agents/core`는 계속 최신 안정 버전을 설치합니다.

## 게시된 패키지 확인하기 {#check-the-published-package}

```sh
npm view @sdk-ai-agents/core version dist-tags
```

npmjs.com의 패키지 페이지에는 *Provenance* 섹션이 있어, 패키지를 빌드한 커밋과 워크플로 실행으로 연결됩니다. 사용자처럼 패키지를 써 보려면 빈 폴더에서 다음을 실행합니다.

```sh
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28
node -e "import('@sdk-ai-agents/core').then((sdk) => console.log(typeof sdk.createSDK))"
npm audit signatures
```

`function`이 출력되면 패키지가 로드된다는 뜻입니다. `npm audit signatures`는 설치된 패키지들의 레지스트리 서명과 출처 증명(provenance attestation)을 검증합니다.

## 신뢰할 수 있는 게시로 전환하기 {#switch-to-trusted-publishing}

첫 버전이 npm에 올라가면 워크플로는 시크릿 없이도 게시할 수 있습니다. npm은 GitHub가 워크플로 실행에 부여하는 OIDC 신원을 신뢰합니다. 유출될 수 있는 장기 시크릿이 남지 않고, 출처 정보도 항상 추가됩니다.

1. npmjs.com에서 패키지의 *Settings*를 열고 *Trusted publishing* 섹션에서 GitHub Actions 게시자를 추가하세요. 사용자는 `nicolashedoire`, 저장소는 `sdk-ai-agents`, 워크플로 파일은 `release.yml`, 환경은 비워 둡니다. `npm publish`로 게시하도록 허용하세요(이 워크플로는 버전을 보류하지 않고 바로 게시합니다). 모든 필드는 대소문자를 구분합니다.
2. 같은 설정의 *Publishing access*에서 *Require two-factor authentication and disallow tokens*를 선택하세요.
3. GitHub의 시크릿 `NPM_TOKEN`과 npmjs.com의 토큰을 삭제하세요.

워크플로는 바뀌지 않습니다. npm 11.5.1 이상(`publish` 잡이 확인합니다)은 먼저 신뢰할 수 있는 게시를 시도하고, 그것이 설정되지 않았을 때만 `NPM_TOKEN`을 사용합니다. npm은 granular access token으로 직접 게시하는 방식이 2027년 1월에 더 이상 동작하지 않는다고 발표했으므로, 이 전환은 어차피 필요합니다. npm 문서의 [신뢰할 수 있는 게시](https://docs.npmjs.com/trusted-publishers)와 [출처 증명](https://docs.npmjs.com/generating-provenance-statements)을 참고하세요.

## 문제가 생겼을 때 {#if-something-goes-wrong}

- **`version` 잡이나 검사가 실패했습니다.** 아무것도 게시되지 않았습니다. 태그를 삭제하고, 풀 리퀘스트로 원인을 고친 다음, 새로 병합된 커밋에 태그를 다시 붙이세요.

  ```sh
  git tag -d v0.3.0
  git push origin :refs/tags/v0.3.0
  ```

- **`publish`가 "Scope not found" 또는 404로 실패했습니다.** npm 조직이 아직 없거나, 토큰에 그 조직에 쓸 권한이 없습니다.
- **`publish`가 버전이 이미 게시되었다는 403으로 실패했습니다.** npm에서 버전 번호는 한 번만 쓸 수 있습니다. 번호를 올리고 다시 릴리스하세요.
- **게시된 버전이 망가졌습니다.** `npm deprecate @sdk-ai-agents/core@0.3.0 "Broken, use 0.3.1"`로 사용 중단을 표시하고 수정 버전을 릴리스하세요. npm은 [게시 취소 정책](https://docs.npmjs.com/policies/unpublish)의 조건을 만족할 때만 버전 삭제를 허용하며, 그 번호는 다시는 쓸 수 없습니다.
