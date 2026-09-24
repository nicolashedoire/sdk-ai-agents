# Publier une version

Le SDK est publié sur npm sous le nom `@sdk-ai-agents/core`. Personne ne le publie depuis son propre ordinateur : le workflow `Release` de GitHub Actions ([`release.yml`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/.github/workflows/release.yml)) vérifie et publie une version quand un tag comme `v0.3.0` est poussé.

::: tip En termes simples
Une publication se fait en trois étapes : noter le nouveau numéro de version et ce qui a changé, fusionner ce changement, puis pousser un tag qui porte le nom de la version. GitHub relance toutes les vérifications et publie le paquet sur npm, avec une attestation signée qui indique quel commit et quel workflow l'ont construit.
:::

## Ce que fait le workflow {#what-the-workflow-does}

| Job | Ce qu'il fait |
| --- | --- |
| `version` | Refuse un tag qui n'est pas `v` suivi de la version de `package.json`. Choisit le dist-tag npm : `latest`, ou `next` pour une préversion comme `0.4.0-beta.1`. |
| `verify` | Sous Node.js 20, 22 et 24, les vérifications de la CI : `npm ci`, lint, vérification du formatage, build, vérification des types des tests, tests et vérification des traductions. |
| `publish` | Sous Node.js 24 : `npm ci`, puis `npm publish --provenance --access public`. Avant tout envoi, `prepublishOnly` supprime `dist/`, le reconstruit et relance les vérifications (`npm run verify`). |

Rien n'est publié si un job échoue. Le workflow démarre sur un tag plutôt que sur une release GitHub, car `npm version` et `git tag` produisent déjà le tag : un seul push depuis le terminal suffit, et une release GitHub peut toujours être rédigée à partir du tag ensuite. Un tag poussé sur un fork lance les vérifications et ne publie rien.

## Avant la première publication {#before-the-first-release}

Ces étapes se font une seule fois, par le propriétaire du dépôt.

1. **Créer l'organisation npm.** Le nom du paquet a une portée (scope) : `@sdk-ai-agents`. Sur npmjs.com, avec le compte qui possédera le paquet, créez l'organisation `sdk-ai-agents` (l'offre gratuite suffit pour des paquets publics). Tant qu'elle n'existe pas, npm répond « Scope not found » et rien ne peut être publié.
2. **Créer un jeton pour la première version.** La publication de confiance (section suivante) ne peut être configurée que pour un paquet qui existe déjà sur npm : la première version est donc publiée avec un jeton. Sur npmjs.com, ouvrez *Access Tokens* et générez un *granular access token* : permission *Read and write* sur la portée `@sdk-ai-agents`, case *Bypass two-factor authentication* cochée (le workflow ne peut pas saisir de code) et une expiration courte, une semaine par exemple.
3. **Le ranger dans GitHub.** Dans les paramètres du dépôt, *Secrets and variables* › *Actions*, créez le secret de dépôt `NPM_TOKEN` avec le jeton comme valeur.
4. Après la première publication, passez à la publication de confiance et supprimez le jeton (voir plus bas).

## Publier une version {#release-a-version}

1. **Vérifier la branche à publier.** Sur une branche `main` à jour :

   ```sh
   npm run verify       # lint, format, build, type-check, tests, translations
   npm pack --dry-run   # the files that would be published
   ```

   Le paquet ne contient que `dist/` (le JavaScript, les déclarations de types et les source maps, qui incluent leurs sources), `README.md`, `LICENSE`, `CHANGELOG.md` et `package.json`.

2. **Choisir le numéro** selon le [versionnage sémantique](https://semver.org/). Tant que la version commence par `0.`, un changement qui casse du code existant augmente le numéro mineur (`0.2.0` → `0.3.0`) et tout le reste le numéro de correctif (`0.3.0` → `0.3.1`) : les utilisateurs qui ont installé `^0.3.0` ne reçoivent automatiquement que les versions `0.3.x`.

3. **Mettre à jour le journal des modifications.** Sur une nouvelle branche, déplacez les entrées de `## [Unreleased]` dans `CHANGELOG.md` sous un titre portant la version et la date, et laissez un `## [Unreleased]` vide au-dessus :

   ```md
   ## [Unreleased]

   ## [0.3.0] - 2026-10-01

   ### Added
   - …
   ```

4. **Changer la version** sans créer le tag tout de suite (le tag doit pointer sur le commit fusionné) :

   ```sh
   npm version 0.3.0 --no-git-tag-version
   ```

   Cette commande met à jour `package.json` et `package-lock.json`. Changez aussi `const version` dans `docs/.vitepress/config.mts`, la version affichée dans le menu du site de documentation.

5. **Fusionner.** Committez (`chore(release): 0.3.0`), ouvrez une pull request, attendez la CI et fusionnez-la.

6. **Pousser le tag** sur le commit fusionné :

   ```sh
   git switch main
   git pull
   git tag -a v0.3.0 -m "v0.3.0"
   git push origin v0.3.0
   ```

7. **Suivre l'exécution** dans l'onglet *Actions* du dépôt, workflow *Release*.

Poussez un seul tag à la fois : GitHub ne lance aucun workflow quand plus de trois tags sont poussés en même temps, ce que `git push --tags` peut faire. Une préversion (`npm version 0.4.0-beta.1 --no-git-tag-version`, tag `v0.4.0-beta.1`) est publiée sous le dist-tag `next` : elle s'installe avec `@sdk-ai-agents/core@next`, et `npm install @sdk-ai-agents/core` continue de donner la dernière version stable.

## Vérifier le paquet publié {#check-the-published-package}

```sh
npm view @sdk-ai-agents/core version dist-tags
```

La page du paquet sur npmjs.com affiche une section *Provenance* qui renvoie au commit et à l'exécution du workflow qui l'a construit. Pour essayer le paquet comme le ferait un utilisateur, dans un dossier vide :

```sh
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28
node -e "import('@sdk-ai-agents/core').then((sdk) => console.log(typeof sdk.createSDK))"
npm audit signatures
```

`function` signifie que le paquet se charge. `npm audit signatures` vérifie les signatures du registre et les attestations de provenance des paquets installés.

## Passer à la publication de confiance {#switch-to-trusted-publishing}

Une fois la première version sur npm, le workflow peut publier sans aucun secret : npm fait confiance à l'identité OIDC que GitHub donne à l'exécution du workflow. Il ne reste aucun secret durable qui pourrait fuiter, et la provenance est toujours ajoutée.

1. Sur npmjs.com, ouvrez les *Settings* du paquet, section *Trusted publishing*, et ajoutez un éditeur GitHub Actions : utilisateur `nicolashedoire`, dépôt `sdk-ai-agents`, fichier de workflow `release.yml`, aucun environnement. Autorisez-le à publier avec `npm publish` (le workflow publie directement, il ne met pas de versions en attente). Chaque champ est sensible à la casse.
2. Dans les mêmes paramètres, sous *Publishing access*, choisissez *Require two-factor authentication and disallow tokens*.
3. Supprimez le secret `NPM_TOKEN` dans GitHub et le jeton sur npmjs.com.

Le workflow ne change pas : npm 11.5.1 ou ultérieur, fourni avec Node.js 24, essaie d'abord la publication de confiance et n'utilise `NPM_TOKEN` que lorsqu'elle n'est pas configurée. npm a annoncé que la publication directe avec un granular access token cessera de fonctionner en janvier 2027 : ce passage est donc nécessaire de toute façon. Voir la documentation de npm sur la [publication de confiance](https://docs.npmjs.com/trusted-publishers) et la [provenance](https://docs.npmjs.com/generating-provenance-statements).

## En cas de problème {#if-something-goes-wrong}

- **Le job `version` ou une vérification échoue.** Rien n'a été publié. Supprimez le tag, corrigez la cause par une pull request, puis posez le tag sur le nouveau commit fusionné :

  ```sh
  git tag -d v0.3.0
  git push origin :refs/tags/v0.3.0
  ```

- **`publish` échoue avec « Scope not found » ou une erreur 404.** L'organisation npm n'existe pas encore, ou le jeton ne peut pas y écrire.
- **`publish` échoue avec une erreur 403 indiquant que la version a déjà été publiée.** Un numéro de version ne peut servir qu'une fois sur npm : augmentez-le et publiez à nouveau.
- **Une version publiée est défectueuse.** Marquez-la avec `npm deprecate @sdk-ai-agents/core@0.3.0 "Broken, use 0.3.1"` et publiez un correctif. npm ne permet de retirer une version que dans les conditions de sa [politique de dépublication](https://docs.npmjs.com/policies/unpublish), et son numéro ne peut plus jamais servir.
