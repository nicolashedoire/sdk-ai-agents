# リリースの手順

この SDK は npm で `@sdk-ai-agents/core` という名前で公開されています。自分のコンピューターから公開する人はいません。`v0.3.0` のようなタグがプッシュされると、GitHub Actions の `Release` ワークフロー（[`release.yml`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/.github/workflows/release.yml)）がバージョンをチェックして公開します。

::: tip やさしく言うと
リリースは 3 つのステップです。新しいバージョン番号と変更内容を書き留め、その変更をマージし、バージョン名のタグをプッシュします。GitHub がすべてのチェックをもう一度実行し、パッケージを npm に公開します。その際、どのコミットとどのワークフローがビルドしたかを示す署名付きの証明も一緒に公開されます。
:::

## ワークフローがすること {#what-the-workflow-does}

| ジョブ | すること |
| --- | --- |
| `version` | `v` に続けて `package.json` のバージョンを書いたものでないタグ、`main` にないコミットに付いたタグ、そして `CHANGELOG.md` に `## [x.y.z]` セクションがないリリースを拒否します。npm の dist-tag を選びます。通常は `latest`、`0.4.0-beta.1` のようなプレリリースなら `next` です。 |
| `verify` | Node.js 20、22、24 で、カバレッジとドキュメントのビルドを除く CI のチェックを実行します。`npm ci`、lint、フォーマットのチェック、ビルド、テストの型チェック、テスト、翻訳のチェックです。 |
| `pack` | 依存関係をインストールスクリプトなしでインストールし、`dist/` を一から作り直してパッケージを作ります。`dist/`、`package.json`、`README.md`、`LICENSE`、`CHANGELOG.md` 以外のファイルやテストファイルを含むアーカイブは拒否し、問題がなければ実行のアーティファクトとして保存します。 |
| `publish` | npm で認証できる唯一のジョブです。コードのチェックアウトもインストールもせず、スクリプトも実行しません。npm が 11.5.1 以降であることを確認してから、`pack` のアーカイブを `npm publish --provenance --access public --ignore-scripts` で公開します。 |

どれか 1 つのジョブが失敗すると、何も公開されません。ワークフローが GitHub のリリースではなくタグで始まるのは、`npm version` と `git tag` がもともとタグを作るからです。ターミナルからのプッシュ 1 回で済み、GitHub のリリースは後からタグをもとに書くこともできます。フォークにプッシュされたタグはチェックを実行するだけで、何も公開しません。古いマイナーバージョン向けの修正（別のブランチで行うバックポート）は、この方法ではリリースできません。そのタグは `main` 上になく、`latest` として公開すると最新のバージョンを置き換えてしまうからです。`prepublishOnly` スクリプト（`npm run clean && npm run verify`）は手動の `npm publish` を守るためのもので、ワークフローはこれを実行しません。

## 最初のリリースの前に {#before-the-first-release}

これらのステップは、リポジトリのオーナーが一度だけ行います。

1. **npm の組織を作る。** パッケージ名にはスコープ `@sdk-ai-agents` が付いています。npmjs.com で、パッケージを所有するアカウントを使って組織 `sdk-ai-agents` を作成します（公開パッケージなら無料プランで足ります）。組織が存在しないうちは、npm は「Scope not found」と答え、何も公開できません。
2. **最初のバージョン用のトークンを作る。** 信頼できる公開（次のセクション）は、すでに npm に存在するパッケージにしか設定できません。そのため、最初のバージョンはトークンを使って公開します。npmjs.com で *Access Tokens* を開き、*granular access token* を生成します。スコープ `@sdk-ai-agents` に対する *Read and write* 権限を付け、*Bypass two-factor authentication* にチェックを入れ（ワークフローはコードを入力できません）、有効期限は短く、たとえば 1 週間にします。
3. **GitHub に保存する。** リポジトリの設定の *Secrets and variables* › *Actions* で、トークンを値とするリポジトリシークレット `NPM_TOKEN` を作成します。
4. 最初のリリースの後は、信頼できる公開に切り替えてトークンを削除します（下記を参照）。

## バージョンをリリースする {#release-a-version}

1. **リリースするブランチをチェックする。** 最新の `main` で次を実行します。

   ```sh
   npm run clean && npm run verify   # lint, format, build, type-check, tests, translations
   npm pack --dry-run                # the files that would be published
   ```

   パッケージに含まれるのは `dist/`（JavaScript、型宣言、ソースを内包した source map）、`README.md`、`LICENSE`、`CHANGELOG.md`、`package.json` だけです。

2. **番号を選ぶ。** [セマンティック バージョニング](https://semver.org/)に従います。バージョンが `0.` で始まる間は、既存のコードを壊す変更ではマイナー番号を上げ（`0.2.0` → `0.3.0`）、それ以外ではパッチ番号を上げます（`0.3.0` → `0.3.1`）。`^0.3.0` をインストールしたユーザーが自動的に受け取るのは `0.3.x` のバージョンだけです。

3. **変更履歴を更新する。** 新しいブランチで、`CHANGELOG.md` の `## [Unreleased]` の項目を、バージョンと日付の見出しの下に移し、その上に空の `## [Unreleased]` を残します。

   ```md
   ## [Unreleased]

   ## [0.3.0] - 2026-10-01

   ### Added
   - …
   ```

   プレリリースでないリリースでは、この見出しがないと `version` ジョブがタグを拒否します。

4. **バージョンを変える。** タグはまだ作りません（タグはマージされたコミットを指す必要があります）。

   ```sh
   npm version 0.3.0 --no-git-tag-version
   ```

   これで `package.json` と `package-lock.json` が更新されます。ドキュメントサイトのメニューに表示されるバージョン、`docs/.vitepress/config.mts` の `const version` も変更します。

5. **マージする。** コミット（`chore(release): 0.3.0`）し、プルリクエストを開き、CI を待ってからマージします。

6. **タグをプッシュする。** マージされたコミットにタグを付けます。

   ```sh
   git switch main
   git pull
   git tag -a v0.3.0 -m "v0.3.0"
   git push origin v0.3.0
   ```

7. **実行を見守る。** リポジトリの *Actions* タブで、*Release* ワークフローを確認します。

タグは 1 つずつプッシュしてください。一度に 4 つ以上のタグがプッシュされると GitHub はワークフローを 1 つも起動せず、`git push --tags` ではそうなることがあります。プレリリース（`npm version 0.4.0-beta.1 --no-git-tag-version`、タグ `v0.4.0-beta.1`）は dist-tag `next` で公開されます。`@sdk-ai-agents/core@next` でインストールでき、`npm install @sdk-ai-agents/core` は引き続き最新の安定版を返します。

## 公開されたパッケージをチェックする {#check-the-published-package}

```sh
npm view @sdk-ai-agents/core version dist-tags
```

npmjs.com のパッケージのページには *Provenance* セクションがあり、パッケージをビルドしたコミットとワークフローの実行へのリンクが表示されます。ユーザーと同じようにパッケージを試すには、空のフォルダーで次を実行します。

```sh
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28
node -e "import('@sdk-ai-agents/core').then((sdk) => console.log(typeof sdk.createSDK))"
npm audit signatures
```

`function` と表示されれば、パッケージは読み込めています。`npm audit signatures` は、インストールしたパッケージのレジストリ署名と来歴の証明（provenance attestation）を検証します。

## 信頼できる公開に切り替える {#switch-to-trusted-publishing}

最初のバージョンが npm に載れば、ワークフローはシークレットなしで公開できます。npm は、GitHub がワークフローの実行に与える OIDC の ID を信頼します。漏れるおそれのある長期間有効なシークレットは残らず、来歴の情報も必ず付きます。

1. npmjs.com でパッケージの *Settings* を開き、*Trusted publishing* セクションで GitHub Actions の発行者を追加します。ユーザーは `nicolashedoire`、リポジトリは `sdk-ai-agents`、ワークフローファイルは `release.yml`、環境はなしです。`npm publish` での公開を許可してください（このワークフローは直接公開し、バージョンを保留しません）。どのフィールドも大文字と小文字を区別します。
2. 同じ設定の *Publishing access* で、*Require two-factor authentication and disallow tokens* を選びます。
3. GitHub のシークレット `NPM_TOKEN` と、npmjs.com のトークンを削除します。

ワークフローは変わりません。npm 11.5.1 以降（`publish` ジョブが確認します）は、まず信頼できる公開を試し、それが設定されていないときだけ `NPM_TOKEN` を使います。npm は、granular access token による直接の公開が 2027 年 1 月に使えなくなると発表しているので、いずれにしてもこの切り替えは必要です。npm のドキュメントの[信頼できる公開](https://docs.npmjs.com/trusted-publishers)と[来歴](https://docs.npmjs.com/generating-provenance-statements)も参照してください。

## うまくいかないとき {#if-something-goes-wrong}

- **`version` ジョブまたはチェックが失敗した。** 何も公開されていません。タグを削除し、プルリクエストで原因を直してから、新しくマージされたコミットにタグを付けます。

  ```sh
  git tag -d v0.3.0
  git push origin :refs/tags/v0.3.0
  ```

- **`publish` が「Scope not found」または 404 で失敗した。** npm の組織がまだ存在しないか、トークンにその組織への書き込み権限がありません。
- **`publish` が、そのバージョンはすでに公開済みだという 403 で失敗した。** npm では同じバージョン番号は一度しか使えません。番号を上げて、もう一度リリースします。
- **公開したバージョンが壊れている。** `npm deprecate @sdk-ai-agents/core@0.3.0 "Broken, use 0.3.1"` で非推奨にし、修正版をリリースします。npm でバージョンを削除できるのは[公開取り消しのポリシー](https://docs.npmjs.com/policies/unpublish)の条件を満たすときだけで、その番号は二度と使えません。
