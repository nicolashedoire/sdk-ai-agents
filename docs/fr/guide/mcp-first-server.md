# Votre premier serveur MCP en 5 minutes

Nous allons construire un tout petit serveur MCP qui répond à « qui s'occupe de la facturation ? » à partir d'une liste d'équipe, le tester sans aucune IA, puis le brancher sur Claude Desktop et Claude Code. Chaque commande est donnée ; rien n'est supposé acquis. Si un mot n'est pas clair, voir [MCP expliqué simplement](./mcp).

## Ce dont vous avez besoin {#what-you-need}

- **Node.js 20.11 ou ultérieur** — vérifiez avec `node --version`. (La recette SQLite nécessite la version 22.13+. La documentation du MCP Inspector demande la version 22.19+.)
- Un terminal.
- Pour utiliser le serveur depuis une application d'IA : [Claude Desktop](https://claude.ai/download) ou [Claude Code](https://code.claude.com/docs). Inutile pour les premières étapes.

Aucune clé d'API n'est nécessaire : ce serveur n'appelle pas de modèle de langage. L'application d'IA qui l'utilise a le sien.

## 1. Créer le projet {#_1-create-the-project}

```sh
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28 @modelcontextprotocol/sdk@^1.30.0
npm install --save-dev tsx
```

Ce que fait chaque ligne :

| Commande | Pourquoi |
| --- | --- |
| `npm init -y` | Crée `package.json`, le fichier qui liste les dépendances de votre projet. |
| `npm pkg set type=module` | Utilise les modules JavaScript modernes (`import`). Le SDK l'exige. |
| `npm install @sdk-ai-agents/core …` | Installe ce SDK, zod (pour décrire les arguments) et le SDK MCP officiel, en version 1.30 ou ultérieure dans la branche 1.x (la version avec laquelle ce SDK est testé). |
| `npm install --save-dev tsx` | Exécute directement les fichiers TypeScript, sans étape de compilation. |

## 2. Écrire le serveur {#_2-write-the-server}

Créez un fichier nommé `server.ts` :

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';
import { z } from 'zod';

// 1. The data your tool reads. A real server would call an API or a database here.
const team = [
  { name: 'Ada', role: 'Billing', email: 'ada@example.com' },
  { name: 'Linus', role: 'Infrastructure', email: 'linus@example.com' },
  { name: 'Grace', role: 'Customer support', email: 'grace@example.com' },
];

// 2. The SDK. No model key: this server does not call a language model itself.
//    The event log (one file per call) is written next to this file, in events/.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

// 3. One tool: a name, a description the model reads, its arguments, and the code.
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team (billing, infrastructure, support…)',
  schema: z.object({
    topic: z.string().describe('What the person is in charge of, for example "billing"'),
  }),
  metadata: { readOnly: true },
  handler: async ({ topic }) =>
    team.filter((person) => person.role.toLowerCase().includes(topic.toLowerCase())),
});

// 4. Serve it. Only the tools listed here are visible to AI applications.
await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

Lisez-le de haut en bas :

1. **Les données** — ici une liste dans le fichier ; dans la réalité, votre API, vos fichiers ou votre base de données.
2. **Le SDK** — il fait passer chaque appel par le circuit gouverné et l'inscrit dans le journal d'événements. Le journal est placé à côté du fichier (`import.meta.dirname`), car les applications d'IA lancent les serveurs depuis un répertoire de travail que vous ne choisissez pas.
3. **L'outil** — le **nom** et la **description** sont ce que le modèle lit pour décider quand l'appeler : rédigez-les donc pour un lecteur qui ne connaît rien de votre code. Le **schéma** liste les arguments ; le SDK le transforme en JSON Schema, que voient les clients MCP, et refuse les appels qui n'y correspondent pas. `readOnly: true` indique aux clients que l'outil ne modifie rien.
4. **Le serveur** — `serveMcpOverStdio` parle MCP par l'entrée et la sortie standard. La liste `tools` est obligatoire : un outil que vous n'avez pas listé n'est jamais visible, même s'il est défini.

## 3. Le lancer {#_3-run-it}

```sh
npx tsx server.ts
```

Vous devriez voir ceci, et rien d'autre :

```text
MCP server "team" ready on stdio, waiting for a client
```

**Il semble bloqué — c'est normal.** Un serveur stdio attend qu'une application d'IA lui parle par son entrée. Appuyez sur <kbd>Ctrl</kbd>+<kbd>C</kbd> pour l'arrêter. Vous le lancerez rarement vous-même : c'est l'application d'IA qui s'en charge.

::: danger N'écrivez jamais sur stdout
Dans un serveur stdio, la sortie standard **est** le protocole. Un `console.log` dans votre code corrompt les messages et le client se déconnecte. Utilisez `console.error` pour vos propres messages : ils vont sur la sortie d'erreur standard, que les clients conservent dans leurs journaux.
:::

## 4. Le tester avec le MCP Inspector {#_4-test-it-with-the-mcp-inspector}

Le [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) est l'outil de test officiel : une page web (ou une ligne de commande) qui joue le rôle de client MCP, pour que vous puissiez essayer votre serveur sans aucune IA. Sa documentation demande Node.js 22.19 ou ultérieur (vérifié le 2026-09-24).

```sh
npx @modelcontextprotocol/inspector npx tsx server.ts
```

La commande affiche une adresse accompagnée d'un jeton à usage unique ; ouvrez-la dans votre navigateur, cliquez sur **Connect**, ouvrez **Tools**, cliquez sur **List Tools**, choisissez `find_colleague`, tapez `billing` et lancez-le. Vous obtenez Ada.

Vous préférez le terminal ? Les mêmes vérifications en ligne de commande :

```sh
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name find_colleague --tool-arg topic=billing
```

Tout ce qui suit `inspector` (ou `--cli`) est la commande qui lance votre serveur.

## 5. Le connecter à Claude Desktop {#_5-connect-it-to-claude-desktop}

Claude Desktop lit la liste des serveurs à lancer dans un fichier de configuration. Ouvrez-le depuis l'application : **menu Claude → Settings… → Developer → Edit Config**. Le fichier se trouve ici :

| Système | Chemin |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Ajoutez votre serveur sous `mcpServers`, avec le **chemin absolu** de `server.ts` (lancez `pwd` dans le dossier du projet pour l'obtenir ; sous Windows, `cd`) :

::: code-group

```json [macOS]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/you/my-mcp-server/server.ts"]
    }
  }
}
```

```json [Windows]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\you\\my-mcp-server\\server.ts"]
    }
  }
}
```

:::

Ensuite, **quittez complètement Claude Desktop et relancez-le** : il ne lit le fichier qu'au démarrage. Votre serveur apparaît dans la liste des connecteurs (le bouton « + » de la zone de saisie, puis **Connectors**). Demandez : *« Qui s'occupe de la facturation dans mon équipe ? »* — Claude vous demande l'autorisation d'utiliser `find_colleague`, puis répond « Ada ».

S'il n'apparaît pas :

- vérifiez le JSON (une virgule manquante suffit à le casser) et que le chemin est bien absolu ;
- si le journal indique que `npx` ou `node` est introuvable (fréquent quand Node.js a été installé avec nvm), remplacez `"npx"` par le chemin complet donné par `which npx` (macOS) ou `where npx` (Windows) ;
- lisez les journaux : `~/Library/Logs/Claude/mcp*.log` sous macOS, `%APPDATA%\Claude\logs\mcp*.log` sous Windows. `mcp-server-team.log` contient ce que votre serveur a écrit sur la sortie d'erreur standard.

Ces chemins et ces menus proviennent de la documentation de MCP ([Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)) en septembre 2026 ; consultez cette page si Claude Desktop a changé.

## 6. Le connecter à Claude Code {#_6-connect-it-to-claude-code}

Une seule commande, depuis n'importe quel dossier (remplacez le chemin) :

```sh
claude mcp add team -- npx -y tsx /Users/you/my-mcp-server/server.ts
```

- Tout ce qui suit `--` est la commande qui lance votre serveur.
- Le serveur est ajouté pour le projet courant uniquement (`--scope local`, la valeur par défaut). Utilisez `--scope user` pour tous vos projets, ou `--scope project` pour l'inscrire dans un fichier `.mcp.json` que vous pouvez versionner et partager.
- Variables d'environnement (par exemple un jeton d'API dont votre serveur a besoin) : `claude mcp add team -e API_TOKEN=… -- npx -y tsx /path/server.ts`.
- Vérifiez-le avec `claude mcp list`, ou tapez `/mcp` dans Claude Code.

Vérifié le 2026-09-24 avec `claude mcp add --help` (Claude Code 2.1.173) et la [documentation MCP de Claude Code](https://code.claude.com/docs/en/mcp).

## 7. Autres applications {#_7-other-applications}

La plupart des applications MCP demandent les trois mêmes informations : une **commande** (`npx`), ses **arguments** (`-y`, `tsx`, le chemin absolu de `server.ts`) et d'éventuelles **variables d'environnement**. Consultez leur documentation, par exemple celle de [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) ou de [Cursor](https://cursor.com/docs/context/mcp).

## 8. Voir ce qui s'est passé {#_8-see-what-happened}

Chaque appel est inscrit dans le journal d'événements : ouvrez le dossier `events/` à côté de `server.ts`. Chaque fichier correspond à un appel — une **exécution** de l'identité `mcp:team` — avec ses étapes :

```text
run.started       → the call arrived
action.executing  → the call is being handled
policy.checked    → the rules were checked
tool.called       → the tool ran, with its arguments
action.executed   → its result
run.completed
```

Ces mêmes exécutions peuvent être lues, rejouées, chiffrées et transformées en alertes avec le reste du SDK : voir [Traçabilité et rejeu](./observability).

## Pour aller plus loin {#where-to-go-next}

- Remplacez la liste d'équipe par quelque chose de réel : [une API web, un dossier, une base de données ou un agent — une ligne chacun](./mcp-recipes).
- Partagez le serveur avec votre équipe en HTTP, ajoutez des approbations et des budgets : [Déployer, sécuriser et dépanner](./mcp-deploy).
