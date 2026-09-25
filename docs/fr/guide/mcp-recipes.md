# Un serveur MCP pour tout

Chaque recette transforme un type de système en serveur MCP **en une ligne**, en toute sécurité. Elles fonctionnent toutes de la même façon : une **source d'outils** construit les outils (et parfois des ressources), et `serveMcpOverStdio` les sert.

| Vous voulez exposer | La ligne | Les outils que reçoit le modèle |
| --- | --- | --- |
| [Une fonction que vous écrivez](#a-function) | `sdk.defineTool({ … })` | les vôtres |
| [Une API web](#a-web-api-from-its-openapi-description) | `await openApiTools({ spec: 'https://…/openapi.json' })` | un par opération, en lecture seule par défaut |
| [Un dossier de documents](#a-folder-of-documents) | `folderTools({ root: './handbook' })` | `list_files`, `read_file`, `search_files` (+ ressources) |
| [Une base de données, en lecture seule](#a-read-only-database) | `databaseTools({ database: sqliteReadOnly(db) })` | `list_tables`, `describe_table`, `query` |
| [Un agent](#an-agent-your-reasoning-twin) | `cognitiveAgentTool(agent)` | `ask_<agent>` |
| [Le Web](./web-research) | `webTools()` | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` |

MCP est nouveau pour vous ? Commencez par [Votre premier serveur MCP en 5 minutes](./mcp-first-server) : cette page montre comment lancer un serveur, le tester avec l'Inspector et le connecter à Claude Desktop ou à Claude Code. Chaque fichier ci-dessous se lance et se connecte de la même façon.

## Le squelette commun à toutes les recettes {#the-skeleton-every-recipe-shares}

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

// No model key needed unless a recipe uses an agent. The event log goes next to this file.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'my-server',
  tools: [/* ← the recipe goes here */],
});
```

`tools` accepte des **définitions d'outils** (ce que renvoient les sources ci-dessous — le SDK les définit pour vous) et des **noms** d'outils que vous avez définis vous-même avec `sdk.defineTool`. Rien d'autre n'est jamais exposé. `resources` (facultatif) accepte des fournisseurs de documents, utilisés par la recette du dossier.

Quelle que soit la source, chaque appel passe par les mêmes vérifications, dans cet ordre — arguments, [politiques](./mcp-deploy#governance-policies-budgets-approvals), approbation, budget — et est inscrit dans le journal d'événements. Un appel invalide est refusé avant que quiconque ne soit sollicité pour l'approuver.

## Une fonction {#a-function}

La source la plus simple : une fonction que vous écrivez, comme dans le [premier serveur](./mcp-first-server).

```ts
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team',
  schema: z.object({ topic: z.string().describe('For example "billing"') }),
  metadata: { readOnly: true },
  handler: async ({ topic }) => directory.search(topic),
});

await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

| Champ | À quoi il sert |
| --- | --- |
| `name` | Ce que le modèle appelle. Utilisez des lettres, des chiffres, `_` et `-`, jusqu'à 64 caractères (les clients MCP peuvent refuser d'autres noms). |
| `description` | Quand utiliser l'outil, en termes simples. Le modèle décide à partir de cette description. |
| `schema` | Les arguments, sous forme de schéma zod. Les textes de `.describe()` sont montrés au modèle. Les appels qui ne correspondent pas sont refusés. |
| `handler` | Votre code. Il reçoit les arguments validés, et un contexte avec `signal` (interrompu quand le client abandonne). |
| `metadata.readOnly` | « Cet outil ne modifie rien » : montré aux clients sous la forme `readOnlyHint`. |
| `metadata.requiresApproval` | Chaque appel attend la décision d'un humain (voir [approbations](./mcp-deploy#approvals-a-human-says-yes-first)). |
| `retry` | Nouvelles tentatives en cas d'échec, pour les outils idempotents uniquement (`retryOn` restreint les échecs concernés ; les arguments invalides ne donnent jamais lieu à une nouvelle tentative). |

## Une API web, à partir de sa description OpenAPI {#a-web-api-from-its-openapi-description}

**Ce que cela fait.** De nombreuses API publient une description lisible par une machine de leurs points d'accès, appelée document **OpenAPI** (souvent `openapi.json`). `openApiTools` la lit et transforme **chaque opération en outil** : le modèle voit son résumé et ses paramètres, et appeler l'outil appelle l'API.

```ts
import { openApiTools } from '@sdk-ai-agents/core';

await serveMcpOverStdio(sdk, {
  name: 'petstore',
  tools: await openApiTools({ spec: 'https://petstore3.swagger.io/api/v3/openapi.json' }),
});
```

**En lecture seule par défaut.** Seules les opérations `GET` deviennent des outils. Pour ajouter une opération qui modifie quelque chose (`POST`, `PUT`, `PATCH`, `DELETE`), listez-la par son `operationId` :

```ts
const tools = await openApiTools({
  spec: './crm-openapi.json',
  headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  include: ['getCustomer', 'listInvoices', 'createNote'], // createNote is a POST
  prefix: 'crm_',
});
```

Une opération d'écriture listée est marquée **à haut risque** et **soumise à approbation** : chaque appel attend qu'un humain l'approuve (voir [approbations](./mcp-deploy#approvals-a-human-says-yes-first)). Pour lui faire confiance sans approbation, dites-le explicitement : `metadata: (operation) => (operation.operationId === 'createNote' ? { requiresApproval: false } : undefined)`.

### Options {#options}

| Option | Valeur par défaut | |
| --- | --- | --- |
| `spec` | — | Une URL (`https://…`), un chemin de fichier, ou un objet que vous avez déjà analysé. JSON uniquement ; pour du YAML, analysez-le vous-même (par exemple avec le paquet `yaml`) et passez l'objet. |
| `baseUrl` | première entrée de `servers` | L'endroit où partent les requêtes. Une URL de serveur relative est résolue par rapport à l'URL de la spécification. |
| `headers` | — | Ajoutés à chaque requête (authentification). Jamais montrés au modèle, et ils l'emportent sur tout argument d'en-tête. Nécessitent `baseUrl` (sauf si la spécification est téléchargée depuis l'origine même de l'API) et HTTPS pour l'API et pour la spécification (HTTP uniquement sur cette machine). |
| `include` | les opérations GET | Les `operationId` à exposer. Quand cette option est fournie, elle **remplace** le choix par défaut des GET : seules les opérations listées deviennent des outils. C'est le seul moyen d'exposer une opération d'écriture. Un identifiant inconnu est une erreur. |
| `exclude` | — | Les `operationId` à écarter. |
| `tags` | — | Uniquement les opérations qui portent l'un de ces tags. |
| `prefix` | — | Préfixe des noms d'outils (`crm_getCustomer`), pour combiner plusieurs API. |
| `metadata` | GET : faible risque, lecture seule · autres : haut risque, approbation | `(operation) => ToolMetadata`. Chaque champ que vous définissez remplace celui par défaut ; un champ omis — ou `undefined` — le conserve, si bien que seul un `requiresApproval: false` explicite supprime une approbation. |
| `retry` | — | Nouvelles tentatives pour les opérations en lecture seule uniquement (les GET, sauf si `metadata` en dispose autrement), sur les erreurs serveur (5xx), 429, les dépassements de délai et les défaillances réseau — jamais sur les réponses 4xx ni sur des arguments invalides. |
| `timeoutMs` | `30000` | Par requête (et pour le téléchargement de la spécification). |
| `maxResponseBytes` | `100000` | Les réponses plus longues sont coupées et marquées `truncated: true`. |
| `maxSpecBytes` | `10000000` | Taille maximale de spécification acceptée. |
| `fetch` | `fetch` global | Votre propre fonction HTTP (proxy, tests). |

### Ce que voit le modèle {#what-the-model-sees}

Pour l'opération `getPetById` de la Petstore, les clients reçoivent :

```json
{
  "name": "getPetById",
  "description": "Find pet by ID\n\nReturns a single pet.\n\n(GET /pet/{petId})",
  "inputSchema": {
    "type": "object",
    "properties": {
      "petId": { "type": "integer", "format": "int64", "description": "ID of pet to return" }
    },
    "required": ["petId"],
    "additionalProperties": false
  },
  "annotations": { "readOnlyHint": true }
}
```

Les noms d'outils proviennent de `operationId` (rendus valides : `show pet!` devient `show_pet` ; une opération qui n'en a pas devient `get_pets_petId` ; les doublons reçoivent `_2`). Les arguments sont à plat : un par paramètre de chemin, de requête et d'en-tête, plus `body` pour un corps de requête JSON. Un appel renvoie le statut HTTP et le corps analysé :

```json
{ "status": 200, "data": { "id": 10, "name": "doggie", "status": "available" } }
```

### Règles de sécurité {#security-rules}

1. **En lecture seule par défaut** : uniquement `GET` ; tout le reste doit être listé dans `include`, et nécessite alors une approbation, sauf indication contraire de votre part.
2. **Le modèle ne peut ni changer d'hôte ni remonter dans le chemin.** L'URL de base vous appartient. Une valeur de chemin ne peut pas contenir `/`, `\` ni un segment `.` / `..` — même encodés en pourcentage, une ou plusieurs fois, à côté d'échappements mal formés ou non, puisque certains serveurs et proxys décodent `%2F` —, si bien que `../../admin` est refusé ; on vérifie aussi que l'URL finale reste sous l'URL de base. Dans ces limites, c'est le modèle qui choisit les valeurs : quel client, quelle commande.
3. **Les arguments sont vérifiés avant tout le reste** : avant les politiques et les approbations (un appel invalide n'attend jamais un humain), puis de nouveau lors de la construction de la requête. Les arguments inconnus et l'absence d'arguments obligatoires sont refusés ; les valeurs doivent être des chaînes, des nombres ou des booléens (des listes de ceux-ci pour les paramètres de requête) ; les valeurs d'en-tête ne peuvent pas contenir de sauts de ligne.
4. **Vos identifiants ne vont que là où vous l'avez décidé** : les `headers` sont ajoutés par le serveur, l'emportent sur les arguments d'en-tête, et n'apparaissent nulle part où le modèle pourrait les lire. Avec `headers`, un serveur désigné par un fichier de spécification est refusé — passez `baseUrl` —, sauf si la spécification a été téléchargée depuis l'origine même de l'API ; et `http:` est refusé sauf sur cette machine (`localhost`, `127.0.0.1`, `[::1]`) — pour l'API, et pour le téléchargement de la spécification, puisqu'une spécification altérée en chemin pourrait ajouter des opérations que vos identifiants autoriseraient.
5. **Borné** : un délai maximal par requête, des réponses coupées à `maxResponseBytes`, une limite de taille pour la spécification.
6. **Les redirections ne sont pas suivies** (une redirection pourrait transmettre votre en-tête `Authorization` à un autre site) : une réponse `3xx` est une erreur, tout comme une redirection qu'un `fetch` personnalisé aurait suivie malgré tout.
7. **Les erreurs sont des erreurs** : un statut autre que `2xx` fait échouer l'appel avec le statut et le début du corps. Les clients MCP ne voient que « Tool execution failed », à moins que vous ne définissiez `exposeErrorDetails: true` (les corps peuvent contenir des détails internes) ; le journal d'événements contient toujours l'erreur complète.
8. **Chaque GET est annoncé comme étant en lecture seule** (`readOnlyHint`). Certaines API ont des GET à effets de bord (`GET /send-reminder`) : écartez-les avec `exclude`, ou définissez pour eux `metadata` à `readOnly: false, requiresApproval: true`.
9. **Les grandes descriptions restent bornées** : le développement des `$ref` dispose d'un budget par opération et pour l'ensemble de la spécification, et le schéma d'un outil de plus de 64 000 caractères est remplacé par ses descriptions.

### Fichier complet {#complete-file}

[`examples/mcp-openapi.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-openapi.ts), avec les imports d'un paquet installé :

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK, openApiTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const spec = process.env.OPENAPI_SPEC ?? 'https://petstore3.swagger.io/api/v3/openapi.json';
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

const tools = await openApiTools({
  spec,
  ...(process.env.API_BASE_URL ? { baseUrl: process.env.API_BASE_URL } : {}),
  ...(process.env.API_TOKEN ? { headers: { Authorization: `Bearer ${process.env.API_TOKEN}` } } : {}),
  timeoutMs: 15_000,
});

await serveMcpOverStdio(sdk, { name: 'web-api', tools });
```

Transmettez le jeton par l'environnement du client, jamais dans le fichier : `claude mcp add web-api -e API_TOKEN=… -- npx -y tsx /path/mcp-openapi.ts`.

### Ce que cela ne fait pas {#what-it-does-not-do}

- **OpenAPI 3.x uniquement** : Swagger 2.0 est refusé (convertissez-le, par exemple avec `swagger2openapi`). Le YAML n'est pas analysé pour vous.
- **Corps JSON uniquement** : une opération qui exige un corps `multipart/form-data` ou de formulaire est écartée (ou refusée si vous la listez) ; un corps facultatif d'un autre type n'est pas proposé. Les paramètres de cookie sont écartés.
- **Pas de parcours de connexion** : passez un jeton dans `headers` ; OAuth n'est pas géré.
- **Références locales uniquement** : les `$ref` vers d'autres fichiers ou des URL ne sont pas résolues (elles deviennent « n'importe quelle valeur ») ; un schéma qui se référence lui-même est coupé au niveau du cycle.
- Les réponses ne sont pas vérifiées par rapport à la spécification, la pagination n'est pas suivie, et seul le premier serveur de la spécification est utilisé, à moins que vous ne passiez `baseUrl`.

## Un dossier de documents {#a-folder-of-documents}

**Ce que cela fait.** Propose les fichiers texte d'un dossier — un manuel, des notes, une base de code, une documentation exportée — avec trois outils : **lister** les fichiers, en **lire** un, y **rechercher** un texte. Les mêmes fichiers sont aussi proposés comme **ressources**, que les utilisateurs peuvent joindre eux-mêmes à une conversation.

```ts
import { folderResources, folderTools } from '@sdk-ai-agents/core';

const handbook = { root: '/Users/you/handbook', exclude: ['drafts/**'] };

await serveMcpOverStdio(sdk, {
  name: 'handbook',
  tools: folderTools(handbook),
  resources: folderResources(handbook),
});
```

### Options {#options-1}

`folderTools` et `folderResources` acceptent les mêmes options (plus `prefix` pour les outils) :

| Option | Valeur par défaut | |
| --- | --- | --- |
| `root` | — | Le dossier. Utilisez un chemin absolu : les clients lancent les serveurs depuis n'importe quel répertoire de travail. |
| `name` | le nom du dossier | Utilisé dans les descriptions et dans les URI des ressources (`folder://<name>/…`). |
| `prefix` | — | Préfixe des noms d'outils (`handbook_read_file`), pour servir plusieurs dossiers. |
| `extensions` | formats texte | Les extensions proposées, sans le point (`['md', 'txt']`). Par défaut : `md`, `txt`, `csv`, `json`, `yaml`, `html`, code source… (`DEFAULT_TEXT_EXTENSIONS`). Ajoutez `''` pour les fichiers sans extension. |
| `include` | tout ce qui est autorisé | Motifs glob des fichiers à proposer : `guide/**`, `**/*.md`. `*` correspond à des noms dans un seul dossier, `**` traverse les dossiers. Les dossiers restent listés, même quand ils ne contiennent aucun fichier correspondant. |
| `exclude` | — | Motifs glob des fichiers et dossiers à masquer partout : `drafts`, `private/*`, `**/node_modules`. Un dossier masqué masque tout ce qu'il contient. |
| `includeHidden` | `false` | Propose les noms qui commencent par un point (`.env`, `.git`…). Laissez cette option désactivée. |
| `maxFileBytes` | `200000` | Octets lus dans un fichier ; les fichiers plus longs sont coupés (`truncated: true`). |
| `maxEntries` | `500` | Entrées renvoyées par un listage, ressources comprises. |
| `maxDepth` | `8` | Profondeur de sous-dossiers explorée. |
| `maxMatches` | `50` | Correspondances renvoyées par une recherche. |
| `maxSearchBytes` | `20000000` | Octets lus par une recherche, tous fichiers confondus. |
| `maxExaminedEntries` | `50000` | Noms examinés par un listage ou une recherche, qu'ils soient proposés ou non ; au-delà, le résultat indique `truncated: true`. |

### Ce que voit le modèle {#what-the-model-sees-1}

L'outil de recherche, en abrégé :

```json
{ "name": "search_files",
  "description": "Finds the lines of the \"handbook\" folder that contain a text (case-insensitive), with file and line number.",
  "inputSchema": { "type": "object",
    "properties": { "query": { "type": "string", "minLength": 1, "maxLength": 200 },
                    "path": { "type": "string", "description": "Folder to search in; default: everywhere" } },
    "required": ["query"] },
  "annotations": { "readOnlyHint": true } }
```

Une recherche renvoie `{ "query": "laptop", "matches": [{ "path": "guide/onboarding.md", "line": 2, "text": "Ask IT for a laptop." }], "filesScanned": 6, "truncated": false }`. Une lecture renvoie `{ "path", "size", "content", "truncated" }`.

**Ressources** : chaque fichier est listé sous la forme `folder://handbook/guide/onboarding.md`, avec sa taille et son type (`text/markdown`, `text/csv`…). Les applications qui prennent en charge les ressources permettent à l'utilisateur de les choisir, par exemple depuis un menu de pièces jointes ; la manière de le faire dépend de l'application.

### Règles de sécurité {#security-rules-1}

1. **Chemins relatifs uniquement** ; les chemins absolus sont refusés.
2. **Rien en dehors du dossier** : chaque chemin est résolu vers son emplacement réel — segments `..` et liens symboliques compris — et refusé s'il sort du dossier. Un lien vers un dossier déjà visité est ignoré, si bien qu'une boucle de liens ne peut pas bloquer un listage.
3. **Les noms cachés sont invisibles** : `.env`, `.git`, `.ssh`… se comportent comme s'ils n'existaient pas, même à travers un lien.
4. **Texte uniquement** : seules les extensions autorisées sont proposées, et un fichier dont les 8 premiers Ko contiennent un octet nul (fichier binaire) est refusé.
5. **Borné** : les lectures, les listages, la profondeur, les correspondances de recherche, les octets parcourus et les noms examinés (`maxExaminedEntries`, 50 000) sont tous limités ; un listage ou une recherche qui s'est arrêté avant la fin indique `truncated: true`.
6. **Lecture seule** : rien n'est jamais écrit, déplacé ni supprimé.
7. **Tracé** : chaque lecture de ressource est une exécution dans le journal d'événements, avec l'URI, la taille et l'empreinte SHA-256 de ce qui a été servi.
8. **Exclu veut dire exclu** : exclure un dossier (`private`, `private/*`, `**/node_modules`) masque tout ce qu'il contient, qu'il soit listé, parcouru par une recherche, lu par son chemin ou lu comme ressource.
9. **Robuste** : un sous-dossier illisible est ignoré, et les messages d'erreur nomment le dossier partagé, jamais son chemin absolu.

### Fichier complet {#complete-file-1}

Adapté de [`examples/mcp-folder.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-folder.ts) (qui sert cette documentation par défaut) :

```ts
import { join, resolve } from 'node:path';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, 'docs'));
const folder = { root, name: 'docs', exclude: ['**/node_modules/**'] };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'docs',
  tools: folderTools(folder),
  resources: folderResources(folder),
  instructions: 'Company documentation. Search it before answering questions about our processes.',
});
```

### Ce que cela ne fait pas {#what-it-does-not-do-1}

- **Aucune écriture**, de quelque sorte que ce soit.
- **Pas de PDF, de Word ni d'images** : uniquement des fichiers texte. Convertissez d'abord les documents en Markdown ou en texte.
- **Recherche de sous-chaînes uniquement** : pas de recherche fondée sur le sens (« sémantique »), pas de classement.
- **Pas de notifications de changement** : les clients voient les fichiers tels qu'ils sont au moment où ils les listent.
- **Le dossier ne doit pas être modifiable par des personnes en qui vous n'avez pas confiance** : les chemins sont vérifiés, puis le fichier est ouvert ; quelqu'un capable de remplacer un dossier par un lien à cet instant précis pourrait, en théorie, passer entre les mailles.
- **Avec `include`, les dossiers restent listés** même quand ils ne contiennent aucun fichier correspondant (le vérifier obligerait à lire chaque sous-dossier).
- Les lectures de ressources sont tracées mais ne sont pas soumises aux politiques d'outils : ne proposez que des dossiers que vous acceptez de partager.

## Une base de données en lecture seule {#a-read-only-database}

**Ce que cela fait.** Permet au modèle d'explorer une base de données — lister les tables, en décrire une, exécuter une requête `SELECT` — et **ne jamais la modifier**. Fonctionne avec **SQLite** (le module intégré `node:sqlite` de Node.js 22.13+, ou `better-sqlite3`) et **PostgreSQL** (`pg`).

::: code-group

```ts [SQLite]
import { DatabaseSync } from 'node:sqlite';
import { databaseTools, sqliteReadOnly } from '@sdk-ai-agents/core';

const db = new DatabaseSync('/data/shop.sqlite', { readOnly: true });

await serveMcpOverStdio(sdk, {
  name: 'shop',
  tools: databaseTools({ database: sqliteReadOnly(db), name: 'the shop database' }),
});
```

```ts [PostgreSQL]
import pg from 'pg';
import { databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
  }),
});
```

:::

### Options {#options-2}

| Option de `databaseTools` | Valeur par défaut | |
| --- | --- | --- |
| `database` | — | `sqliteReadOnly(db)`, `postgresReadOnly({ pool })` ou `postgresReadOnly({ client })`, ou votre propre `ReadOnlyDatabase`. |
| `name` | `the <dialect> database` | La façon dont le modèle en entend parler : « the shop database ». |
| `prefix` | — | Préfixe des noms d'outils (`shop_query`), pour servir plusieurs bases de données. |
| `maxRows` | `100` (au plus `1000`) | Lignes renvoyées par une requête ; `truncated: true` indique qu'il y en avait davantage. |
| `maxTextLength` | `2000` | Caractères conservés par valeur texte. |
| `maxTables` | `500` | Tables listées. |
| `maxSqlLength` | `20000` | Longueur maximale de SQL acceptée. |

| Option de `postgresReadOnly` | Valeur par défaut | |
| --- | --- | --- |
| `statementTimeoutMs` | `10000` | PostgreSQL arrête toute requête qui dure plus longtemps. |
| `schemas` | tous sauf ceux du système | Schémas **listés et décrits** par `list_tables` et `describe_table`. Cela ne restreint pas ce que `query` peut lire : c'est au rôle PostgreSQL de le faire. |

Avec `{ client }`, donnez à l'adaptateur un `pg.Client` **dédié** : un client que votre application n'utilise pas pour ses propres transactions (un pool y est refusé ; passez-le sous la forme `{ pool }`).

`sqliteReadOnly(db)` n'a pas d'options : ouvrez le fichier en lecture seule (`{ readOnly: true }` avec `node:sqlite`, `{ readonly: true }` avec better-sqlite3). L'adaptateur ne s'appuie que sur `prepare`, `exec` et les méthodes d'instruction communes aux deux pilotes ; la suite de tests l'exécute sur une vraie base `node:sqlite`, pas sur better-sqlite3.

### Ce que voit le modèle {#what-the-model-sees-2}

Trois outils : `list_tables`, `describe_table { table }` et `query { sql }`, ce dernier décrit ainsi : *« Runs one read-only SQL query (sqlite dialect) on the shop database and returns at most 100 rows; "truncated" is true when there were more. Statements that change data or schema are refused. Use list_tables and describe_table first. »* (en français : « Exécute une seule requête SQL en lecture seule (dialecte sqlite) sur la base de données de la boutique et renvoie au plus 100 lignes ; "truncated" vaut true quand il y en avait davantage. Les instructions qui modifient les données ou le schéma sont refusées. Utilisez d'abord list_tables et describe_table. »). Une requête renvoie :

```json
{ "columns": ["name", "spent"],
  "rows": [{ "name": "Ada", "spent": 200.5 }, { "name": "Grace", "spent": 42 }],
  "rowCount": 2, "truncated": false }
```

Les valeurs sont rendues lisibles à mesure que les lignes arrivent : les très grands entiers deviennent des chaînes, les dates des chaînes ISO, les données binaires une note comme `<binary data, 3 bytes>`, les textes longs sont coupés, les tableaux conservent 100 éléments (`… 400 more items`). Quand la base de données refuse la requête elle-même (« no such column », « read-only », un dépassement de délai), le modèle reçoit la raison pour pouvoir corriger son SQL ; les erreurs de connexion et de serveur restent de votre côté.

### Règles de sécurité : quatre verrous, pas un seul {#security-rules-four-locks-not-one}

Vérifier qu'une requête « commence par SELECT » ne suffit pas : `WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone` commence par `WITH` et supprime des données. Une requête doit donc passer quatre verrous :

1. **La vérification de l'instruction** : exactement une instruction (les points-virgules à l'intérieur des chaînes, les noms entre guillemets, les commentaires, les guillemets `$$` de PostgreSQL et les chaînes d'échappement `E'…'` sont compris), commençant par `SELECT`, `WITH` ou `VALUES`, sans paramètres `$1`, avec des parenthèses équilibrées. `PRAGMA`, `ATTACH`, `EXPLAIN ANALYZE`, `COMMIT`… sont refusés.
2. **La base de données elle-même refuse les écritures** :
   - SQLite : chaque requête s'exécute avec `PRAGMA query_only = ON` (rétabli ensuite), et avec better-sqlite3, une instruction qui écrit est refusée avant de s'exécuter ;
   - PostgreSQL : chaque requête s'exécute dans sa propre transaction `BEGIN READ ONLY` — une connexion déjà engagée dans une autre transaction est d'abord détectée (`transaction_timestamp()` plus ancien que l'instruction) et refusée sans toucher à cette transaction — avec `SET LOCAL statement_timeout`, et se termine toujours par `ROLLBACK` puis `SELECT pg_advisory_unlock_all()` (les verrous consultatifs survivent à une annulation ; une connexion qui ne parvient pas à les libérer n'est pas réutilisée). La requête est envoyée sous forme de sous-requête avec un paramètre lié, si bien que le serveur n'accepte qu'une seule instruction. Les transactions ne partagent jamais une connexion au même moment.
3. **Des limites** : au plus `maxRows` lignes sont lues (SQLite ne lit jamais le reste ; PostgreSQL s'arrête au `LIMIT`), les valeurs sont coupées en copies courtes à mesure que les lignes arrivent (chaque valeur brute est tout de même chargée en entier avant d'être coupée), et les requêtes PostgreSQL ont un délai maximal.
4. **Vous** : ouvrez les fichiers SQLite en lecture seule ; connectez-vous à PostgreSQL avec un rôle qui ne peut lire que ce que vous voulez montrer — c'est la véritable frontière, car une transaction en lecture seule n'empêche pas ce qu'une fonction pourrait faire en dehors de la base de données (par exemple `dblink` ou une extension HTTP). Un tel rôle peut encore lire le catalogue système (`pg_catalog`) et appeler les fonctions accordées à `PUBLIC` ; révoquez celles des extensions qui communiquent avec l'extérieur (`REVOKE EXECUTE ON FUNCTION dblink(text, text) FROM PUBLIC;`, et ainsi de suite) :

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE shop TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON customers, orders TO mcp_reader;   -- only what the model may read
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
```

### Fichiers complets {#complete-files}

[`examples/mcp-database.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-database.ts) (SQLite ; crée une base de démonstration de boutique quand vous ne fournissez pas de fichier) et [`examples/mcp-postgres.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-postgres.ts) :

```ts
import { join } from 'node:path';
import pg from 'pg';
import { FileEventStore, createSDK, databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL to a read-only PostgreSQL role');

const pool = new pg.Pool({ connectionString, max: 4 });
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
    maxRows: 100,
  }),
});
```

### Ce que cela ne fait pas {#what-it-does-not-do-2}

- **Aucune écriture**, par conception. Pour permettre à un modèle de modifier des données, écrivez un outil dédié à cette seule modification, soumis à approbation.
- **Pas de filtre par table à l'intérieur des requêtes** : une requête peut lire tout ce que la connexion peut lire. Utilisez un rôle (PostgreSQL) ou une copie du fichier ne contenant que les bonnes tables (SQLite) ; exposez des vues plutôt que les tables brutes.
- **SQLite : la surface d'attaque, c'est la requête, pas le fichier.** Les requêtes s'exécutent dans le processus de votre serveur, de façon synchrone, sans délai maximal ni plafond de mémoire : quiconque écrit le SQL — le modèle, ou quiconque le manipule — peut écrire une requête qui ne se termine jamais (un `WITH` récursif) ou qui construit des valeurs énormes, et bloquer ou épuiser le serveur. Les lignes sont lues une par une et chaque valeur est coupée en une copie courte à son arrivée, si bien que le résultat reste petit et que les originaux peuvent être libérés — mais chaque valeur brute est d'abord chargée en entier, et rien ne borne le travail que fait SQLite pour produire une ligne. Servez SQLite à vous-même ou à des personnes de confiance ; ne l'exposez pas en HTTP à des clients non fiables. Exécuter les requêtes dans un thread de travail que l'on peut arrêter lèverait cette limite ; ce n'est pas encore fait.
- **Les fonctions SQLite enregistrées sur la connexion peuvent être appelées** par le SQL du modèle (`db.function(…)`) : n'enregistrez que des fonctions inoffensives sur une connexion que vous servez.
- **Pas de paramètres liés** : le modèle écrit les valeurs dans le SQL.
- Deux colonnes portant le même nom dans un résultat ne conservent que la dernière : donnez-leur des alias.
- Autres bases de données (MySQL, SQL Server…) : implémentez vous-même la petite interface `ReadOnlyDatabase`, et faites-lui refuser les écritures par ses propres moyens. `assertSingleQuery(sql, dialect)` ne comprend que les syntaxes SQLite et PostgreSQL ; MySQL (échappements par barre oblique inverse dans toutes les chaînes, commentaires `#`) nécessite sa propre vérification.

## Un agent : votre jumeau de raisonnement {#an-agent-your-reasoning-twin}

**Ce que cela fait.** Expose un agent entier sous la forme d'un seul outil. L'usage le plus frappant : un [agent cognitif doté de votre profil de penseur](./thinker-profiles), pour que, depuis Claude Desktop, n'importe qui puisse demander *« que penserait Nicolas de l'idée de payer pour Jev ? »* et obtenir une réponse raisonnée **comme raisonne Nicolas**, avec sa justification et ce qui manque encore.

```ts
import { cognitiveAgentTool } from '@sdk-ai-agents/core';

const twin = sdk.createCognitiveAgent({
  name: 'nicolas',
  model: 'gpt-4o-mini',
  profile,                                     // how Nicolas reasons
  limits: { maxSteps: 6, timeoutMs: 50_000 },  // small: MCP clients do not wait forever
});

await serveMcpOverStdio(sdk, {
  name: 'nicolas-twin',
  tools: [cognitiveAgentTool(twin, { name: 'ask_nicolas', description: 'How Nicolas would reason about a question or a decision' })],
});
```

Cette recette nécessite une clé de modèle (`createSDK({ apiKey: process.env.OPENAI_API_KEY, … })`) : l'agent réfléchit avec un modèle de langage.

### Étape 1 — saisir votre façon de raisonner {#step-1-—-capture-how-you-reason}

Expliquez quelques sujets avec vos propres mots, distillez-les une fois en un profil, et sauvegardez-le :

```ts
import { writeFileSync } from 'node:fs';

const profile = await sdk.distillThinkerProfile({
  id: 'nicolas',
  name: 'Nicolas',
  model: 'gpt-4o',
  samples: [
    { topic: 'Paying for a typed-decision API', reasoning: 'What does it really allow? Then the limits…', conclusion: 'Try an open clone first' },
    // a few more topics, in your own words
  ],
});
writeFileSync('nicolas.profile.json', JSON.stringify(profile, null, 2));
```

Voir [Raisonner comme une personne donnée](./thinker-profiles) pour savoir ce que contient un profil et comment le corriger au fil du temps.

### Étape 2 — le servir {#step-2-—-serve-it}

[`examples/mcp-agent.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-agent.ts) charge le profil depuis `PROFILE_FILE` (vérifié par rapport au schéma de profil) ou utilise un exemple intégré, et sert `ask_nicolas` :

```sh
claude mcp add nicolas-twin -e OPENAI_API_KEY=sk-… -e PROFILE_FILE=/path/nicolas.profile.json -- npx -y tsx /path/mcp-agent.ts
```

### Ce que voit le modèle et ce qu'il reçoit en retour {#what-the-model-sees-and-gets-back}

L'outil accepte `problem` (la question, jusqu'à 4 000 caractères) et un objet `context` facultatif (faits et contraintes, jusqu'à 20 000 caractères en JSON). Il renvoie la décision, pas l'état mental entier :

```json
{
  "runId": "run_6c01de53-…",
  "status": "completed",
  "decisionStatus": "committed",
  "answer": "Prototype with the open clone first; pay only if it falls short on real data.",
  "rationale": "…",
  "confidence": 0.78,
  "nextActions": ["Benchmark the clone on 50 real tickets"]
}
```

`decisionStatus` vaut `committed` (une réponse ferme), `provisional` (la meilleure réponse à ce stade, avec `missing` : ce qui n'est pas établi) ou `abstain`. Le raisonnement complet reste dans le journal d'événements sous `runId` : `sdk.getMentalState(runId)` montre chaque hypothèse et chaque critique. Quand une exécution échoue, `error` indique seulement qu'elle n'a pas abouti et où regarder (`exposeErrors: true` place le message lui-même dans le résultat : il peut contenir des détails propres au fournisseur).

### Options {#options-3}

| Option | Valeur par défaut | |
| --- | --- | --- |
| `name` | `ask_<agent name>` | Le nom de l'outil. |
| `description` | générique | Dites quand consulter cet agent : le modèle décide à partir de cette description. |
| `metadata` | risque moyen | Métadonnées de gouvernance, fusionnées champ par champ avec celles par défaut ; ajoutez `requiresApproval: true` pour confirmer chaque consultation. |
| `maxInputLength` | `4000` | Longueur maximale du problème (ou du message) acceptée. |
| `maxContextLength` | `20000` | Longueur maximale de `context`, en texte JSON. |
| `exposeErrors` | `false` | Place le message d'erreur d'une exécution en échec dans le résultat. |

`governedAgentTool(agent, options)` fait de même pour un agent créé avec `sdk.createAgent` : il accepte `message` (et `context`) et renvoie `{ runId, status, output, error }`.

### Bon à savoir {#good-to-know}

- **Cela prend du temps.** Une exécution cognitive fait plusieurs appels au modèle : comptez des dizaines de secondes, parfois des minutes. Beaucoup de clients annulent un appel au bout d'environ une minute (la valeur par défaut du SDK TypeScript officiel est de 60 secondes ; Claude Code permet de l'augmenter avec `MCP_TOOL_TIMEOUT`). Gardez des `limits` modestes pour un usage interactif, sauf si votre client réinitialise son délai à chaque [notification de progression](./mcp-deploy#progress-notifications) : chaque étape de l'agent en envoie une. **Quand le client abandonne, l'exécution est arrêtée** (pour les agents cognitifs comme pour les agents gouvernés) et enregistrée comme annulée : aucun autre appel au modèle n'est fait, et une approbation que l'agent attendait est annulée.
- **Cela coûte de l'argent** : chaque consultation représente plusieurs appels au modèle. Mettez-lui un [budget](./mcp-deploy#governance-policies-budgets-approvals) et consultez `sdk.getRunCost(runId)`.
- **Il imite une façon de raisonner, pas ce que sait la personne.** Le jumeau connaît ce qui figure dans le profil, la question et le contexte — pas la mémoire de la personne. Traitez ses réponses comme « comment aborderait-elle la question », et laissez la vraie personne le corriger avec `learnFromFeedback`.

## Plusieurs sources dans un même serveur {#several-sources-in-one-server}

Combinez les sources avec des préfixes pour que les noms n'entrent jamais en collision :

```ts
await serveMcpOverStdio(sdk, {
  name: 'company',
  tools: [
    ...(await openApiTools({ spec: './crm-openapi.json', prefix: 'crm_', headers })),
    ...folderTools({ root: '/srv/handbook', prefix: 'handbook_' }),
    ...databaseTools({ database: sqliteReadOnly(db), prefix: 'shop_' }),
    'find_colleague', // a tool you defined yourself
  ],
  resources: folderResources({ root: '/srv/handbook' }),
});
```

Deux outils portant le même nom sont refusés au démarrage, avec un message qui indique lequel.

## Les mêmes outils dans vos propres agents {#the-same-tools-in-your-own-agents}

Les sources sont de simples définitions d'outils : vos agents peuvent les utiliser sans MCP.

```ts
const tools = (await openApiTools({ spec: './crm-openapi.json' })).map((definition) => sdk.defineTool(definition));
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools });
```

Les mêmes règles s'appliquent : les opérations d'écriture que vous avez listées attendent une approbation, chaque appel est vérifié et enregistré.

Suite : [déployer, sécuriser et dépanner](./mcp-deploy).
