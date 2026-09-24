# Publicar uma versão

O SDK é publicado no npm com o nome `@sdk-ai-agents/core`. Ninguém o publica a partir do próprio computador: o workflow `Release` do GitHub Actions ([`release.yml`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/.github/workflows/release.yml)) verifica e publica uma versão quando uma tag como `v0.3.0` é enviada.

::: tip Em palavras simples
Publicar uma versão leva três passos: anotar o novo número de versão e o que mudou, fazer o merge dessa mudança e depois enviar uma tag com o nome da versão. O GitHub executa de novo todas as verificações e publica o pacote no npm, junto com uma declaração assinada que diz qual commit e qual workflow o construíram.
:::

## O que o workflow faz {#what-the-workflow-does}

| Job | O que faz |
| --- | --- |
| `version` | Recusa uma tag que não seja `v` seguido da versão do `package.json`, uma tag em um commit que não está na `main` e uma versão sem a sua seção `## [x.y.z]` no `CHANGELOG.md`. Escolhe a dist-tag do npm: `latest`, ou `next` para uma versão prévia como `0.4.0-beta.1`. |
| `verify` | No Node.js 20, 22 e 24, as verificações da CI exceto a cobertura e o build da documentação: `npm ci`, lint, verificação da formatação, build, verificação de tipos dos testes, testes e verificação das traduções. |
| `pack` | Instala as dependências sem os scripts de instalação delas, constrói `dist/` do zero e empacota o pacote. Recusa um arquivo que contenha algo além de `dist/`, `package.json`, `README.md`, `LICENSE` e `CHANGELOG.md`, ou um arquivo de teste, e depois o guarda como artefato da execução. |
| `publish` | O único job que pode se autenticar no npm: ele não faz checkout do código, não instala nada e não executa nenhum script. Verifica que o npm está na versão 11.5.1 ou posterior e publica o arquivo do `pack` com `npm publish --provenance --access public --ignore-scripts`. |

Nada é publicado se um job falhar. O workflow começa com uma tag, e não com um release do GitHub, porque `npm version` e `git tag` já produzem a tag: basta um único push a partir do terminal, e um release do GitHub ainda pode ser escrito a partir da tag depois. Uma tag enviada para um fork executa as verificações e não publica nada. Uma correção para uma versão menor mais antiga (um backport feito em outro branch) não pode ser publicada assim: a tag dela não está na `main`, e publicada como `latest` ela substituiria a versão mais recente. O script `prepublishOnly` (`npm run clean && npm run verify`) protege um `npm publish` manual; o workflow não o executa.

## Antes da primeira publicação {#before-the-first-release}

Estes passos são feitos uma única vez, pelo dono do repositório.

1. **Criar a organização no npm.** O nome do pacote tem escopo: `@sdk-ai-agents`. No npmjs.com, com a conta que será dona do pacote, crie a organização `sdk-ai-agents` (o plano gratuito basta para pacotes públicos). Enquanto ela não existir, o npm responde "Scope not found" e nada pode ser publicado.
2. **Criar um token para a primeira versão.** A publicação confiável (próxima seção) só pode ser configurada para um pacote que já existe no npm, então a primeira versão é publicada com um token. No npmjs.com, abra *Access Tokens* e gere um *granular access token*: permissão *Read and write* no escopo `@sdk-ai-agents`, a opção *Bypass two-factor authentication* marcada (o workflow não consegue digitar um código) e uma validade curta, uma semana por exemplo.
3. **Guardá-lo no GitHub.** Nas configurações do repositório, *Secrets and variables* › *Actions*, crie o secret de repositório `NPM_TOKEN` com o token como valor.
4. Depois da primeira publicação, passe para a publicação confiável e apague o token (veja abaixo).

## Publicar uma versão {#release-a-version}

1. **Verificar o branch a publicar.** Em uma `main` atualizada:

   ```sh
   npm run clean && npm run verify   # lint, format, build, type-check, tests, translations
   npm pack --dry-run                # the files that would be published
   ```

   O pacote contém apenas `dist/` (o JavaScript, as declarações de tipos e os source maps, que incluem seus fontes), `README.md`, `LICENSE`, `CHANGELOG.md` e `package.json`.

2. **Escolher o número** seguindo o [versionamento semântico](https://semver.org/). Enquanto a versão começar com `0.`, uma mudança que quebra código existente aumenta o número menor (`0.2.0` → `0.3.0`) e todo o resto o número de patch (`0.3.0` → `0.3.1`): quem instalou `^0.3.0` recebe automaticamente apenas as versões `0.3.x`.

3. **Atualizar o histórico de mudanças.** Em um novo branch, mova as entradas de `## [Unreleased]` do `CHANGELOG.md` para baixo de um título com a versão e a data, e deixe um `## [Unreleased]` vazio acima dele:

   ```md
   ## [Unreleased]

   ## [0.3.0] - 2026-10-01

   ### Added
   - …
   ```

   Para uma versão (não uma versão prévia), o job `version` recusa uma tag cuja seção esteja faltando.

4. **Mudar a versão** sem criar a tag ainda (a tag deve apontar para o commit do merge):

   ```sh
   npm version 0.3.0 --no-git-tag-version
   ```

   Isso atualiza `package.json` e `package-lock.json`. Mude também `const version` em `docs/.vitepress/config.mts`, a versão mostrada no menu do site de documentação.

5. **Fazer o merge.** Faça o commit (`chore(release): 0.3.0`), abra um pull request, espere a CI e faça o merge.

6. **Enviar a tag** no commit do merge:

   ```sh
   git switch main
   git pull
   git tag -a v0.3.0 -m "v0.3.0"
   git push origin v0.3.0
   ```

7. **Acompanhar a execução** na aba *Actions* do repositório, workflow *Release*.

Envie uma tag de cada vez: o GitHub não inicia nenhum workflow quando mais de três tags são enviadas ao mesmo tempo, o que `git push --tags` pode fazer. Uma versão prévia (`npm version 0.4.0-beta.1 --no-git-tag-version`, tag `v0.4.0-beta.1`) é publicada com a dist-tag `next`: ela é instalada com `@sdk-ai-agents/core@next`, e `npm install @sdk-ai-agents/core` continua trazendo a última versão estável.

## Verificar o pacote publicado {#check-the-published-package}

```sh
npm view @sdk-ai-agents/core version dist-tags
```

A página do pacote no npmjs.com mostra uma seção *Provenance* com links para o commit e para a execução do workflow que o construíram. Para testar o pacote como um usuário faria, em uma pasta vazia:

```sh
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28
node -e "import('@sdk-ai-agents/core').then((sdk) => console.log(typeof sdk.createSDK))"
npm audit signatures
```

`function` significa que o pacote carrega. `npm audit signatures` verifica as assinaturas do registro e as atestações de proveniência dos pacotes instalados.

## Passar para a publicação confiável {#switch-to-trusted-publishing}

Quando a primeira versão já está no npm, o workflow pode publicar sem nenhum secret: o npm confia na identidade OIDC que o GitHub dá à execução do workflow. Não sobra nenhum secret duradouro que possa vazar, e a proveniência é sempre adicionada.

1. No npmjs.com, abra as *Settings* do pacote, seção *Trusted publishing*, e adicione um publicador do GitHub Actions: usuário `nicolashedoire`, repositório `sdk-ai-agents`, arquivo de workflow `release.yml`, sem ambiente. Permita que ele publique com `npm publish` (o workflow publica diretamente, não deixa versões em espera). Todos os campos diferenciam maiúsculas de minúsculas.
2. Nas mesmas configurações, em *Publishing access*, escolha *Require two-factor authentication and disallow tokens*.
3. Apague o secret `NPM_TOKEN` no GitHub e o token no npmjs.com.

O workflow não muda: o npm 11.5.1 ou posterior, que o job `publish` verifica, tenta primeiro a publicação confiável e só usa `NPM_TOKEN` quando ela não está configurada. O npm anunciou que publicar diretamente com um granular access token deixará de funcionar em janeiro de 2027, então essa mudança é necessária de qualquer forma. Veja a documentação do npm sobre [publicação confiável](https://docs.npmjs.com/trusted-publishers) e [proveniência](https://docs.npmjs.com/generating-provenance-statements).

## Se algo der errado {#if-something-goes-wrong}

- **O job `version` ou uma verificação falha.** Nada foi publicado. Apague a tag, corrija a causa por meio de um pull request e depois coloque a tag no novo commit do merge:

  ```sh
  git tag -d v0.3.0
  git push origin :refs/tags/v0.3.0
  ```

- **`publish` falha com "Scope not found" ou um 404.** A organização no npm ainda não existe, ou o token não pode escrever nela.
- **`publish` falha com um 403 dizendo que a versão já foi publicada.** Um número de versão só pode ser usado uma vez no npm: aumente-o e publique de novo.
- **Uma versão publicada está quebrada.** Marque-a com `npm deprecate @sdk-ai-agents/core@0.3.0 "Broken, use 0.3.1"` e publique uma correção. O npm só permite remover uma versão nas condições da sua [política de despublicação](https://docs.npmjs.com/policies/unpublish), e o número dela nunca mais pode ser usado.
