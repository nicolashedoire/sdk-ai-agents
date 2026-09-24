# Releasing

The SDK is published on npm as `@sdk-ai-agents/core`. Nobody publishes it from their own computer: the `Release` workflow of GitHub Actions ([`release.yml`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/.github/workflows/release.yml)) checks and publishes a version when a tag such as `v0.3.0` is pushed.

::: tip In plain words
A release takes three steps: write down the new version number and what changed, merge that change, then push a tag named after the version. GitHub runs the checks again and publishes the package on npm, together with a signed statement saying which commit and which workflow built it.
:::

## What the workflow does

| Job | What it does |
| --- | --- |
| `version` | Refuses a version in `package.json` that is not `MAJOR.MINOR.PATCH` or `MAJOR.MINOR.PATCH-PRERELEASE`, a tag that is not `v` followed by that version, and a tag on a commit that is not on `main`. For a release (not a pre-release), also refuses a `CHANGELOG.md` without its `## [x.y.z]` section or with anything left under `## [Unreleased]`. Chooses the npm dist-tag: `latest`, or `next` for a pre-release such as `0.4.0-beta.1`. |
| `verify` | On Node.js 20, 22 and 24, the checks of the CI except coverage and the documentation build: `npm ci`, lint, format check, build, type-check of the tests, tests and translation check. |
| `pack` | Installs the dependencies without their install scripts, builds `dist/` from scratch and packs the package. Refuses a tarball holding anything but `dist/`, `package.json`, `README.md`, `LICENSE` and `CHANGELOG.md`, or a test file, then keeps it as an artifact of the run. |
| `publish` | The only job that can authenticate with npm: it checks out no code, installs nothing and runs no script. It checks that npm is 11.5.1 or later, then publishes the tarball of `pack` with `npm publish --provenance --access public --ignore-scripts`. |

Nothing is published if one job fails. The workflow starts on a tag rather than on a GitHub release because `npm version` and `git tag` already produce the tag: one push from the terminal is enough, and a GitHub release can still be written from the tag afterwards. A tag pushed to a fork runs the checks and publishes nothing. A fix for an older minor version (a backport made on another branch) cannot be released this way: its tag is not on `main`, and published as `latest` it would replace the newest version. The `prepublishOnly` script (`npm run clean && npm run verify`) protects a manual `npm publish`; the workflow does not run it.

## Before the first release

These steps are done once, by the owner of the repository.

1. **Create the npm organization.** The package name is scoped: `@sdk-ai-agents`. On npmjs.com, with the account that will own the package, create the organization `sdk-ai-agents` (the free plan is enough for public packages). Until it exists, npm answers "Scope not found" and nothing can be published.
2. **Create a token for the first version.** Trusted publishing (next section) can only be set up for a package that already exists on npm, so the first version is published with a token. On npmjs.com, open *Access Tokens* and generate a *granular access token*: *Read and write* permission on the `@sdk-ai-agents` scope, *Bypass two-factor authentication* checked (the workflow cannot type a code), and a short expiration, a week for example.
3. **Store it in GitHub.** In the repository settings, *Secrets and variables* › *Actions*, create the repository secret `NPM_TOKEN` with the token as its value.
4. After the first release, switch to trusted publishing and delete the token (see below).

## Release a version

1. **Check the branch to release.** On an up-to-date `main`:

   ```sh
   npm run clean && npm run verify   # lint, format, build, type-check, tests, translations
   npm pack --dry-run                # the files that would be published
   ```

   The package contains only `dist/` (JavaScript, type declarations and source maps that include their sources), `README.md`, `LICENSE`, `CHANGELOG.md` and `package.json`.

2. **Choose the number** following [semantic versioning](https://semver.org/). While the version starts with `0.`, a change that breaks existing code raises the minor number (`0.2.0` → `0.3.0`) and anything else the patch number (`0.3.0` → `0.3.1`): users who installed `^0.3.0` get only the `0.3.x` versions automatically.

3. **Update the changelog.** On a new branch, move the entries of `## [Unreleased]` in `CHANGELOG.md` under a heading with the version and the date, and leave an empty `## [Unreleased]` above it:

   ```md
   ## [Unreleased]

   ## [0.3.0] - 2026-10-01

   ### Added
   - …
   ```

   For a release (not a pre-release), the `version` job refuses a tag whose section is missing, or when `## [Unreleased]` still has anything under it, even an empty `###` heading.

4. **Change the version** without creating the tag yet (the tag must point to the merged commit):

   ```sh
   npm version 0.3.0 --no-git-tag-version
   ```

   This updates `package.json` and `package-lock.json`. Also change `const version` in `docs/.vitepress/config.mts`, the version shown in the menu of the documentation site.

5. **Merge.** Commit (`chore(release): 0.3.0`), open a pull request, wait for the CI and merge it.

6. **Push the tag** on the merged commit:

   ```sh
   git switch main
   git pull
   git tag -a v0.3.0 -m "v0.3.0"
   git push origin v0.3.0
   ```

7. **Follow the run** in the *Actions* tab of the repository, workflow *Release*.

8. **After the release.** Set `@sdk-ai-agents/core` in `templates/starter-template/package.json` to the new version (`^0.3.0`).

Push one tag at a time: GitHub starts no workflow when more than three tags are pushed at once, which `git push --tags` can do. A pre-release (`npm version 0.4.0-beta.1 --no-git-tag-version`, tag `v0.4.0-beta.1`) is published under the dist-tag `next`: it is installed with `@sdk-ai-agents/core@next`, and `npm install @sdk-ai-agents/core` keeps giving the latest stable version.

## Check the published package

```sh
npm view @sdk-ai-agents/core version dist-tags
```

The page of the package on npmjs.com shows a *Provenance* section that links to the commit and to the workflow run that built it. To try the package as a user would, in an empty folder:

```sh
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28
node -e "import('@sdk-ai-agents/core').then((sdk) => console.log(typeof sdk.createSDK))"
npm audit signatures
```

`function` means the package loads. `npm audit signatures` checks the registry signatures and the provenance attestations of the installed packages.

## Switch to trusted publishing

Once the first version is on npm, the workflow can publish without any secret: npm trusts the OIDC identity that GitHub gives to the workflow run. No long-lived secret is left that could leak, and provenance is always added.

1. On npmjs.com, open the package's *Settings*, section *Trusted publishing*, and add a GitHub Actions publisher: user `nicolashedoire`, repository `sdk-ai-agents`, workflow file `release.yml`, no environment. Let it publish with `npm publish` (the workflow publishes directly; it does not stage versions). Every field is case-sensitive.
2. In the same settings, under *Publishing access*, choose *Require two-factor authentication and disallow tokens*.
3. Delete the `NPM_TOKEN` secret in GitHub and the token on npmjs.com.

The workflow does not change: npm 11.5.1 or later, which the `publish` job checks for, tries trusted publishing first and only uses `NPM_TOKEN` when trusted publishing is not set up. npm has announced that publishing directly with a granular access token will stop working in January 2027, so this switch is needed anyway. See the npm documentation on [trusted publishing](https://docs.npmjs.com/trusted-publishers) and [provenance](https://docs.npmjs.com/generating-provenance-statements).

## If something goes wrong

- **The `version` job or a check fails.** Nothing was published. Delete the tag, fix the cause through a pull request, then tag the new merged commit:

  ```sh
  git tag -d v0.3.0
  git push origin :refs/tags/v0.3.0
  ```

- **`publish` fails with "Scope not found" or a 404.** The npm organization does not exist yet, or the token cannot write to it.
- **`publish` fails with a 403 saying the version was already published.** A version number can be used only once on npm: raise it and release again.
- **A published version is broken.** Mark it with `npm deprecate @sdk-ai-agents/core@0.3.0 "Broken, use 0.3.1"` and release a fix. npm only allows removing a version under the conditions of its [unpublish policy](https://docs.npmjs.com/policies/unpublish), and its number can never be used again.
- **`publish` failed for a passing reason** (npm unavailable, network). Re-run the failed jobs from the page of the run: `publish` downloads the tarball that `pack` keeps as an artifact for 7 days. After that, re-run all jobs.
