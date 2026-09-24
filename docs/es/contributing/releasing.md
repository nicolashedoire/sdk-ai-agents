# Publicar una versión

El SDK se publica en npm con el nombre `@sdk-ai-agents/core`. Nadie lo publica desde su propio ordenador: el flujo de trabajo `Release` de GitHub Actions ([`release.yml`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/.github/workflows/release.yml)) comprueba y publica una versión cuando se sube una etiqueta como `v0.3.0`.

::: tip En palabras sencillas
Publicar una versión lleva tres pasos: anotar el nuevo número de versión y lo que ha cambiado, fusionar ese cambio y después subir una etiqueta con el nombre de la versión. GitHub vuelve a ejecutar todas las comprobaciones y publica el paquete en npm, junto con una declaración firmada que indica qué commit y qué flujo de trabajo lo construyeron.
:::

## Qué hace el flujo de trabajo {#what-the-workflow-does}

| Job | Qué hace |
| --- | --- |
| `version` | Rechaza una etiqueta que no sea `v` seguida de la versión de `package.json`. Elige el dist-tag de npm: `latest`, o `next` para una versión preliminar como `0.4.0-beta.1`. |
| `verify` | En Node.js 20, 22 y 24, las comprobaciones de la CI: `npm ci`, lint, comprobación del formato, build, comprobación de tipos de los tests, tests y comprobación de las traducciones. |
| `publish` | En Node.js 24: `npm ci` y después `npm publish --provenance --access public`. Antes de enviar nada, `prepublishOnly` borra `dist/`, lo vuelve a construir y repite las comprobaciones (`npm run verify`). |

No se publica nada si falla un job. El flujo de trabajo arranca con una etiqueta y no con una release de GitHub porque `npm version` y `git tag` ya producen la etiqueta: basta con un solo push desde la terminal, y una release de GitHub se puede redactar después a partir de la etiqueta. Una etiqueta subida a un fork ejecuta las comprobaciones y no publica nada.

## Antes de la primera publicación {#before-the-first-release}

Estos pasos se hacen una sola vez, y los hace el propietario del repositorio.

1. **Crear la organización de npm.** El nombre del paquete tiene ámbito (scope): `@sdk-ai-agents`. En npmjs.com, con la cuenta que será propietaria del paquete, crea la organización `sdk-ai-agents` (el plan gratuito basta para paquetes públicos). Mientras no exista, npm responde "Scope not found" y no se puede publicar nada.
2. **Crear un token para la primera versión.** La publicación de confianza (sección siguiente) solo se puede configurar para un paquete que ya existe en npm, así que la primera versión se publica con un token. En npmjs.com, abre *Access Tokens* y genera un *granular access token*: permiso *Read and write* sobre el ámbito `@sdk-ai-agents`, la casilla *Bypass two-factor authentication* marcada (el flujo de trabajo no puede escribir un código) y una caducidad corta, por ejemplo una semana.
3. **Guardarlo en GitHub.** En la configuración del repositorio, *Secrets and variables* › *Actions*, crea el secreto de repositorio `NPM_TOKEN` con el token como valor.
4. Después de la primera publicación, pasa a la publicación de confianza y borra el token (ver más abajo).

## Publicar una versión {#release-a-version}

1. **Comprobar la rama que se publica.** En una rama `main` actualizada:

   ```sh
   npm run verify       # lint, format, build, type-check, tests, translations
   npm pack --dry-run   # the files that would be published
   ```

   El paquete solo contiene `dist/` (el JavaScript, las declaraciones de tipos y los source maps, que incluyen sus fuentes), `README.md`, `LICENSE`, `CHANGELOG.md` y `package.json`.

2. **Elegir el número** según el [versionado semántico](https://semver.org/). Mientras la versión empiece por `0.`, un cambio que rompe código existente sube el número menor (`0.2.0` → `0.3.0`) y cualquier otro cambio el número de parche (`0.3.0` → `0.3.1`): quien instaló `^0.3.0` solo recibe automáticamente las versiones `0.3.x`.

3. **Actualizar el registro de cambios.** En una rama nueva, mueve las entradas de `## [Unreleased]` de `CHANGELOG.md` bajo un título con la versión y la fecha, y deja encima un `## [Unreleased]` vacío:

   ```md
   ## [Unreleased]

   ## [0.3.0] - 2026-10-01

   ### Added
   - …
   ```

4. **Cambiar la versión** sin crear todavía la etiqueta (la etiqueta debe apuntar al commit fusionado):

   ```sh
   npm version 0.3.0 --no-git-tag-version
   ```

   Esto actualiza `package.json` y `package-lock.json`. Cambia también `const version` en `docs/.vitepress/config.mts`, la versión que muestra el menú del sitio de documentación.

5. **Fusionar.** Haz el commit (`chore(release): 0.3.0`), abre una pull request, espera a la CI y fusiónala.

6. **Subir la etiqueta** en el commit fusionado:

   ```sh
   git switch main
   git pull
   git tag -a v0.3.0 -m "v0.3.0"
   git push origin v0.3.0
   ```

7. **Seguir la ejecución** en la pestaña *Actions* del repositorio, flujo de trabajo *Release*.

Sube una sola etiqueta cada vez: GitHub no inicia ningún flujo de trabajo cuando se suben más de tres etiquetas a la vez, cosa que `git push --tags` puede hacer. Una versión preliminar (`npm version 0.4.0-beta.1 --no-git-tag-version`, etiqueta `v0.4.0-beta.1`) se publica con el dist-tag `next`: se instala con `@sdk-ai-agents/core@next`, y `npm install @sdk-ai-agents/core` sigue dando la última versión estable.

## Comprobar el paquete publicado {#check-the-published-package}

```sh
npm view @sdk-ai-agents/core version dist-tags
```

La página del paquete en npmjs.com muestra una sección *Provenance* que enlaza con el commit y con la ejecución del flujo de trabajo que lo construyó. Para probar el paquete como lo haría un usuario, en una carpeta vacía:

```sh
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28
node -e "import('@sdk-ai-agents/core').then((sdk) => console.log(typeof sdk.createSDK))"
npm audit signatures
```

`function` significa que el paquete se carga. `npm audit signatures` comprueba las firmas del registro y las atestaciones de procedencia de los paquetes instalados.

## Pasar a la publicación de confianza {#switch-to-trusted-publishing}

Cuando la primera versión ya está en npm, el flujo de trabajo puede publicar sin ningún secreto: npm confía en la identidad OIDC que GitHub da a la ejecución del flujo de trabajo. No queda ningún secreto duradero que pueda filtrarse, y la procedencia se añade siempre.

1. En npmjs.com, abre los *Settings* del paquete, sección *Trusted publishing*, y añade un publicador de GitHub Actions: usuario `nicolashedoire`, repositorio `sdk-ai-agents`, archivo de flujo de trabajo `release.yml`, sin entorno. Permite que publique con `npm publish` (el flujo de trabajo publica directamente, no deja versiones en espera). Todos los campos distinguen mayúsculas y minúsculas.
2. En la misma configuración, en *Publishing access*, elige *Require two-factor authentication and disallow tokens*.
3. Borra el secreto `NPM_TOKEN` en GitHub y el token en npmjs.com.

El flujo de trabajo no cambia: npm 11.5.1 o posterior, incluido con Node.js 24, prueba primero la publicación de confianza y solo usa `NPM_TOKEN` cuando no está configurada. npm ha anunciado que publicar directamente con un granular access token dejará de funcionar en enero de 2027, así que este cambio es necesario de todos modos. Consulta la documentación de npm sobre la [publicación de confianza](https://docs.npmjs.com/trusted-publishers) y la [procedencia](https://docs.npmjs.com/generating-provenance-statements).

## Si algo sale mal {#if-something-goes-wrong}

- **Falla el job `version` o una comprobación.** No se ha publicado nada. Borra la etiqueta, corrige la causa con una pull request y pon la etiqueta en el nuevo commit fusionado:

  ```sh
  git tag -d v0.3.0
  git push origin :refs/tags/v0.3.0
  ```

- **`publish` falla con "Scope not found" o un 404.** La organización de npm todavía no existe, o el token no puede escribir en ella.
- **`publish` falla con un 403 que dice que la versión ya se publicó.** Un número de versión solo se puede usar una vez en npm: súbelo y vuelve a publicar.
- **Una versión publicada está rota.** Márcala con `npm deprecate @sdk-ai-agents/core@0.3.0 "Broken, use 0.3.1"` y publica una corrección. npm solo permite retirar una versión en las condiciones de su [política de retirada](https://docs.npmjs.com/policies/unpublish), y su número ya no se puede volver a usar nunca.
