# 发布版本

本 SDK 以 `@sdk-ai-agents/core` 为名发布在 npm 上。没有人从自己的电脑上发布它：当推送 `v0.3.0` 这样的标签时，GitHub Actions 的 `Release` 工作流（[`release.yml`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/.github/workflows/release.yml)）会检查并发布这个版本。

::: tip 通俗地说
发布一个版本分三步：写下新的版本号和改动内容，合并这项改动，然后推送一个以版本命名的标签。GitHub 会重新运行检查，把包发布到 npm，并附上一份签名声明，说明是哪个提交、哪个工作流构建了它。
:::

## 工作流做了什么 {#what-the-workflow-does}

| 作业 | 做什么 |
| --- | --- |
| `version` | 拒绝以下情况：`package.json` 中的版本号不是 `MAJOR.MINOR.PATCH` 或 `MAJOR.MINOR.PATCH-PRERELEASE`；标签不等于 `v` 加上这个版本号；标签打在不属于 `main` 的提交上。对于正式版本（非预发布版本），还拒绝缺少 `## [x.y.z]` 一节或 `## [Unreleased]` 下仍有内容的 `CHANGELOG.md`。选择 npm 的 dist-tag：通常是 `latest`，`0.4.0-beta.1` 这样的预发布版本则是 `next`。 |
| `verify` | 在 Node.js 20、22 和 24 上运行 CI 中除覆盖率和文档构建之外的检查：`npm ci`、lint、格式检查、构建、测试的类型检查、测试和翻译检查。 |
| `pack` | 安装依赖但不运行它们的安装脚本，从零构建 `dist/` 并打包。如果压缩包里除了 `dist/`、`package.json`、`README.md`、`LICENSE` 和 `CHANGELOG.md` 之外还有别的文件，或含有测试文件，就拒绝它；否则把它保存为本次运行的制品。 |
| `publish` | 唯一能向 npm 认证的作业：它不检出代码、不安装任何东西，也不运行任何脚本。它先检查 npm 版本不低于 11.5.1，再用 `npm publish --provenance --access public --ignore-scripts` 发布 `pack` 生成的压缩包。 |

只要有一个作业失败，就不会发布任何东西。工作流由标签而不是 GitHub release 触发，因为 `npm version` 和 `git tag` 本来就会产生标签：在终端里推送一次就够了，之后仍然可以基于这个标签撰写 GitHub release。推送到 fork 的标签只会运行检查，不会发布任何东西。针对较旧次版本的修复（在其他分支上做的向后移植）不能这样发布：它的标签不在 `main` 上，而且以 `latest` 发布会取代最新版本。`prepublishOnly` 脚本（`npm run clean && npm run verify`）保护手动执行的 `npm publish`；工作流不会运行它。

## 首次发布之前 {#before-the-first-release}

这些步骤由仓库所有者完成，只需做一次。

1. **创建 npm 组织。** 包名带有作用域 `@sdk-ai-agents`。在 npmjs.com 上，用将要拥有这个包的账号创建组织 `sdk-ai-agents`（对公开包来说，免费方案就够了）。在它存在之前，npm 会回答“Scope not found”，任何东西都无法发布。
2. **为第一个版本创建令牌。** 可信发布（见下一节）只能为已经存在于 npm 上的包配置，所以第一个版本要用令牌发布。在 npmjs.com 上打开 *Access Tokens*，生成一个 *granular access token*：对作用域 `@sdk-ai-agents` 授予 *Read and write* 权限，勾选 *Bypass two-factor authentication*（工作流无法输入验证码），并设置较短的有效期，例如一周。
3. **把它保存到 GitHub。** 在仓库设置的 *Secrets and variables* › *Actions* 中，创建仓库机密 `NPM_TOKEN`，值为这个令牌。
4. 首次发布之后，切换到可信发布并删除令牌（见下文）。

## 发布一个版本 {#release-a-version}

1. **检查要发布的分支。** 在已更新到最新的 `main` 上运行：

   ```sh
   npm run clean && npm run verify   # lint, format, build, type-check, tests, translations
   npm pack --dry-run                # the files that would be published
   ```

   包里只有 `dist/`（JavaScript、类型声明，以及内嵌源码的 source map）、`README.md`、`LICENSE`、`CHANGELOG.md` 和 `package.json`。

2. **选择版本号**，遵循[语义化版本](https://semver.org/)。只要版本号以 `0.` 开头，破坏现有代码的改动就提升次版本号（`0.2.0` → `0.3.0`），其他改动提升补丁号（`0.3.0` → `0.3.1`）：安装了 `^0.3.0` 的用户只会自动获得 `0.3.x` 版本。

3. **更新更新日志。** 在一个新分支上，把 `CHANGELOG.md` 中 `## [Unreleased]` 下的条目移到一个写有版本号和日期的标题下，并在它上方留一个空的 `## [Unreleased]`：

   ```md
   ## [Unreleased]

   ## [0.3.0] - 2026-10-01

   ### Added
   - …
   ```

   对于正式版本（非预发布版本），缺少这一节，或 `## [Unreleased]` 下仍有任何内容（哪怕只是一个空的 `###` 标题）时，`version` 作业会拒绝该标签。

4. **修改版本号**，暂时不创建标签（标签必须指向合并后的提交）：

   ```sh
   npm version 0.3.0 --no-git-tag-version
   ```

   这会更新 `package.json` 和 `package-lock.json`。同时修改 `docs/.vitepress/config.mts` 中的 `const version`，也就是文档站点菜单里显示的版本。

5. **合并。** 提交（`chore(release): 0.3.0`），打开一个拉取请求，等待 CI 通过后合并。

6. **推送标签**，打在合并后的提交上：

   ```sh
   git switch main
   git pull
   git tag -a v0.3.0 -m "v0.3.0"
   git push origin v0.3.0
   ```

7. **跟踪运行情况**：在仓库的 *Actions* 标签页中查看 *Release* 工作流。

8. **发布之后。** 把 `templates/starter-template/package.json` 中的 `@sdk-ai-agents/core` 改为新版本（`^0.3.0`）。

每次只推送一个标签：一次推送超过三个标签时，GitHub 不会启动任何工作流，而 `git push --tags` 可能会这样做。预发布版本（`npm version 0.4.0-beta.1 --no-git-tag-version`，标签 `v0.4.0-beta.1`）以 dist-tag `next` 发布：用 `@sdk-ai-agents/core@next` 安装，而 `npm install @sdk-ai-agents/core` 仍然给出最新的稳定版本。

## 检查已发布的包 {#check-the-published-package}

```sh
npm view @sdk-ai-agents/core version dist-tags
```

npmjs.com 上的包页面会显示一个 *Provenance* 部分，链接到构建它的提交和工作流运行。要像用户那样试用这个包，在一个空文件夹中运行：

```sh
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28
node -e "import('@sdk-ai-agents/core').then((sdk) => console.log(typeof sdk.createSDK))"
npm audit signatures
```

输出 `function` 表示包可以加载。`npm audit signatures` 会校验已安装包的注册表签名和来源证明（provenance attestation）。

## 切换到可信发布 {#switch-to-trusted-publishing}

第一个版本上线 npm 之后，工作流就可以在没有任何机密的情况下发布：npm 信任 GitHub 为工作流运行颁发的 OIDC 身份。不再有可能泄露的长期机密，而且总会附上来源信息。

1. 在 npmjs.com 上打开这个包的 *Settings*，在 *Trusted publishing* 部分添加一个 GitHub Actions 发布者：用户 `nicolashedoire`，仓库 `sdk-ai-agents`，工作流文件 `release.yml`，不填环境。允许它用 `npm publish` 发布（这个工作流直接发布，不会暂存版本）。所有字段都区分大小写。
2. 在同一设置页的 *Publishing access* 中，选择 *Require two-factor authentication and disallow tokens*。
3. 删除 GitHub 中的机密 `NPM_TOKEN` 和 npmjs.com 上的令牌。

工作流本身不需要改动：npm 11.5.1 或更高版本（`publish` 作业会检查这一点）会先尝试可信发布，只有在未配置时才使用 `NPM_TOKEN`。npm 已宣布，使用 granular access token 直接发布将在 2027 年 1 月停止工作，所以无论如何都需要做这次切换。参见 npm 文档中关于[可信发布](https://docs.npmjs.com/trusted-publishers)和[来源证明](https://docs.npmjs.com/generating-provenance-statements)的说明。

## 出问题时 {#if-something-goes-wrong}

- **`version` 作业或某项检查失败。** 什么都没有发布。删除标签，通过拉取请求修复问题，然后在新的合并提交上重新打标签：

  ```sh
  git tag -d v0.3.0
  git push origin :refs/tags/v0.3.0
  ```

- **`publish` 因“Scope not found”或 404 失败。** npm 组织还不存在，或者令牌无权写入它。
- **`publish` 因 403 失败，提示该版本已经发布过。** 一个版本号在 npm 上只能使用一次：提升版本号后重新发布。
- **已发布的版本有问题。** 用 `npm deprecate @sdk-ai-agents/core@0.3.0 "Broken, use 0.3.1"` 将其标记为弃用，并发布一个修复版本。npm 只允许在其[撤销发布政策](https://docs.npmjs.com/policies/unpublish)规定的条件下删除版本，而且这个版本号永远不能再使用。
- **`publish` 因暂时性原因失败**（npm 不可用、网络问题）。在运行页面上重新运行失败的作业：`publish` 会下载 `pack` 作为制品保存 7 天的压缩包。超过 7 天后，请重新运行所有作业。
