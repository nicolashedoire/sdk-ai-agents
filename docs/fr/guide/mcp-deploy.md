# Déployer, sécuriser et dépanner

Votre serveur fonctionne sur votre machine ([premier serveur](./mcp-first-server), [recettes](./mcp-recipes)). Cette page explique comment le partager en HTTP, faire intervenir des règles et des humains dans la boucle, quelle liste de sécurité vérifier, et que faire quand quelque chose ne fonctionne pas.

## stdio ou HTTP ? {#stdio-or-http}

| | stdio | Streamable HTTP |
| --- | --- | --- |
| Fonctionnement | L'application d'IA lance votre serveur comme un programme sur le même ordinateur | Votre serveur tourne quelque part comme un service web |
| Qui peut l'utiliser | La personne qui se trouve devant cet ordinateur | Toute personne à qui vous donnez l'adresse et un jeton |
| Exposition réseau | Aucune | Un point d'accès HTTP à protéger |
| Idéal pour | Les outils personnels, les fichiers locaux, les essais | Une équipe, une API ou une base de données à l'échelle de l'entreprise |
| Pour le lancer | `serveMcpOverStdio(sdk, options)` | `createMcpServer(sdk, options)` + le transport HTTP du SDK MCP |

Commencez par stdio. Passez à HTTP quand plusieurs personnes ont besoin du même serveur.

## Servir en HTTP {#serve-over-http}

Le SDK MCP officiel fournit le transport HTTP ; `createMcpServer` lui donne un serveur gouverné. Ce fichier complet utilise le module `http` propre à Node — sans framework web — et fonctionne **sans état** (*stateless*) : chaque requête reçoit un nouveau serveur MCP, si bien que vous pouvez en faire tourner plusieurs copies derrière un répartiteur de charge.

```ts
import { timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { createMcpServer } from '@sdk-ai-agents/core/mcp';

const token = process.env.MCP_TOKEN;
if (!token) throw new Error('Set MCP_TOKEN: clients must send "Authorization: Bearer <token>"');
const port = Number(process.env.PORT ?? 3000);
// Requests must name this host: protects a local server from DNS rebinding attacks.
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

const folder = { root: resolve(process.argv[2] ?? 'docs'), name: 'docs' };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });
// Built once, shared by the server of every request.
const tools = folderTools(folder);
const resources = folderResources(folder);

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error('MCP request failed:', error);
    if (!response.headersSent) reply(response, 500, 'Internal server error');
  });
}).listen(port, '127.0.0.1');

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/mcp') return reply(response, 404, 'Not found');
  if (!allowedHosts.has(request.headers.host ?? '')) return reply(response, 403, 'Forbidden host');
  if (!sameSecret(request.headers.authorization ?? '', `Bearer ${token}`)) return reply(response, 401, 'Unauthorized');
  if (request.method !== 'POST') return reply(response, 405, 'Method not allowed');

  // Stateless: a client's cancellation arrives as a new request, which this fresh server
  // cannot tie to a call still in progress. A pending approval then ends only when the
  // client closes the connection, or after `approvalTimeoutMs` — until then a late "yes"
  // still runs the tool. Keep it well below the time your clients wait.
  const server = createMcpServer(sdk, { name: 'docs', tools, resources, approvalTimeoutMs: 20_000 });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  await server.connect(transport);
  await transport.handleRequest(request, response);
}

function reply(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

/** Compares secrets in constant time, so timing does not reveal how much of a guess is right. */
function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

À quoi sert chaque vérification :

| Vérification | Pourquoi |
| --- | --- |
| Chemin `/mcp` | Une seule adresse pour MCP ; tout le reste est refusé. |
| En-tête `Host` | Sinon, une page web que vous visitez pourrait faire appeler par votre navigateur un serveur sur `localhost` (« DNS rebinding »). Une fois le serveur déployé, listez plutôt votre nom d'hôte public. |
| Jeton porteur (*bearer token*) | Seuls les clients qui connaissent le jeton peuvent entrer. La comparaison se fait en temps constant. Générez un jeton aléatoire long ; gardez-le hors de votre code. |
| `POST` uniquement | En mode sans état, il n'y a pas de flux de longue durée à ouvrir avec `GET`. |
| Un serveur par requête | Rien n'est partagé entre les requêtes ; les définitions d'outils sont construites une fois et réutilisées (définir de nouveau la même définition est autorisé). Le prix à payer : le message « annuler » d'un client arrive sous forme d'une autre requête et ne peut pas atteindre l'appel qu'il annule — c'est la fermeture de la connexion, ou `approvalTimeoutMs`, qui y met fin à la place. |

Le fichier n'écoute que sur `127.0.0.1`. Pour le publier, placez-le derrière un proxy inverse qui termine **HTTPS** (Caddy, nginx, le répartiteur de charge de votre cloud), et ajoutez votre nom d'hôte à `allowedHosts`. N'envoyez jamais un jeton porteur en HTTP non chiffré sur un réseau.

Une version exécutable est fournie sous le nom [`examples/mcp-http.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-http.ts) (`MCP_TOKEN=… npm run example:mcp-http`). Elle a été vérifiée avec un vrai client : un appel sans le jeton reçoit `401`, un `Host` falsifié reçoit `403`, et un client muni du jeton liste et appelle les outils.

### Connecter des clients à un serveur HTTP {#connect-clients-to-an-http-server}

- **Claude Code** : `claude mcp add --transport http docs https://mcp.example.com/mcp --header "Authorization: Bearer <token>"`. Dans un `.mcp.json` partagé, écrivez `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }` : Claude Code développe les variables d'environnement, si bien que le jeton reste hors du fichier.
- **Vos propres agents** : `connectMcpServer({ name: 'docs', transport: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } })` — voir [MCP expliqué simplement](./mcp#use-the-tools-of-an-mcp-server-in-your-agents).
- **Autres applications** : cherchez « remote MCP server » ou « custom connector » dans leur documentation. Certaines n'acceptent que les serveurs qui utilisent une connexion OAuth plutôt qu'un jeton fixe.

## Gouvernance : politiques, budgets, approbations {#governance-policies-budgets-approvals}

Chaque appel MCP s'exécute sous une identité unique, `mcp:<server name>` (modifiable avec `agentId`). Les politiques, les budgets et les alertes peuvent la cibler comme n'importe quel agent. Voir [Agents gouvernés](./governed-agents) pour tous les types de politiques.

**Un budget quotidien d'appels** pour un serveur :

```ts
sdk.defineGlobalPolicy({
  id: 'handbook-daily-budget',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { agentId: 'mcp:handbook', period: 'day', maxToolCalls: 500 } },
    },
  ],
});
```

Le 501e appel de la journée est refusé avec le nom de la politique, et le refus figure dans le journal d'événements. Un appel est décompté **dès qu'il commence** — vérifié et décompté en une seule étape, si bien que 20 appels simultanés ne peuvent pas tous passer sous une limite de 2 — et il compte **quelle qu'en soit l'issue**, échecs compris. Les budgets sont comptés dans la mémoire du processus : ils repartent de zéro au redémarrage du serveur, et chaque copie d'un serveur HTTP compte ses propres appels. Avant toute politique ou tout budget, les arguments sont vérifiés : un appel invalide est refusé sans être décompté ni attendre qui que ce soit.

### Approbations : un humain dit oui d'abord {#approvals-a-human-says-yes-first}

Un outil attend la décision d'un humain avant de s'exécuter quand :

- sa définition contient `metadata: { requiresApproval: true }` — la valeur par défaut pour les opérations d'écriture de `openApiTools` ;
- ou une politique la demande, pour des outils que vous nommez, sans toucher à leurs définitions :

```ts
sdk.defineGlobalPolicy({
  id: 'approve-crm-writes',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: {
        type: 'condition',
        conditions: [{ field: 'intention.toolName', operator: 'in', value: ['crm_createNote', 'crm_updateCustomer'] }],
      },
      action: 'require_approval',
    },
  ],
});
```

Pendant l'attente, l'appel apparaît dans `sdk.getPendingApprovals()`. Votre code décide avec `sdk.approveAction(id, who, reason)` ou `sdk.rejectAction(id, who, reason)` ; les deux sont enregistrés (`approval.requested`, `approval.approved` ou `approval.rejected`). Un serveur stdio ne peut pas poser la question dans son propre terminal — l'entrée standard transporte le protocole —, donc la décision doit venir d'un autre canal. Par exemple, un petit point d'accès d'administration sur cette machine, dans le même processus que le serveur.

**Le point d'accès d'administration décide de ce qui s'exécute : protégez-le comme le point d'accès MCP.** Sinon, une page ouverte dans votre navigateur pourrait atteindre `localhost` (DNS rebinding) et approuver à votre place. Il n'écoute donc que sur `127.0.0.1`, n'accepte que son propre `Host`, refuse toute requête portant un en-tête `Origin` (les navigateurs en ajoutent un ; les scripts et `curl` non) et exige un en-tête secret :

```ts
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const port = 4000;
const secret = process.env.ADMIN_SECRET ?? '';   // a long random value
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

createServer((request, response) => {
  const answer = (status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.headers.origin !== undefined) return answer(403, 'Forbidden origin');
  if (!allowedHosts.has(request.headers.host ?? '')) return answer(403, 'Forbidden host');
  const given = Buffer.from(String(request.headers['x-admin-secret'] ?? ''));
  const expected = Buffer.from(secret);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return answer(401, 'Unauthorized');
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/approvals') return answer(200, sdk.getPendingApprovals());
  const decision = /^\/approvals\/([^/]+)\/(approve|reject)$/.exec(url.pathname);
  if (request.method !== 'POST' || !decision) return answer(404, 'Not found');
  const [, id = '', verb] = decision;
  try {
    if (verb === 'approve') sdk.approveAction(id, 'admin', 'approved from the admin endpoint');
    else sdk.rejectAction(id, 'admin', 'rejected from the admin endpoint');
    return answer(200, { decided: id, verb });
  } catch (error) {
    return answer(409, error instanceof Error ? error.message : String(error)); // unknown, decided or cancelled
  }
}).listen(port, '127.0.0.1');
```

Ensuite, `curl -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals` liste ce qui est en attente, et `curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals/<id>/approve` tranche. Un serveur complet construit de cette façon est fourni sous le nom [`examples/mcp-approvals.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-approvals.ts) ; il a été vérifié de bout en bout (un appel attend, un `Host` falsifié, un `Origin` ou un secret absent reçoivent `403`/`401`, l'approbation exécute l'outil, et le processus se termine quand le client s'en va).

Pour être averti quand une approbation est en attente, ajoutez une [règle d'incident](./incidents#rules) sur `approval.requested` avec un notificateur Slack ou e-mail. Les approbations en attente vivent dans la mémoire du processus où l'appel attend : avec plusieurs copies d'un serveur HTTP, décidez via la copie qui la détient (ou ne faites tourner qu'une seule copie pour les outils qui nécessitent une approbation).

::: warning Combien de temps dure une approbation en attente
Beaucoup de clients annulent un appel au bout d'environ une minute. Une approbation en attente est annulée — et l'outil ne s'exécute jamais — quand :

- le client annule l'appel (stdio, ou une session HTTP avec état) ;
- la connexion se ferme : un client stdio qui se termine, une requête HTTP qui est fermée ;
- personne n'a décidé dans le délai `approvalTimeoutMs` — **50 secondes par défaut**, moins que ce qu'attendent la plupart des clients. Définissez-le sur `createMcpServer`/`serveMcpOverStdio` si votre client attend plus longtemps (Claude Code avec un `MCP_TOOL_TIMEOUT` augmenté).

**Sur un serveur HTTP sans état, seuls les deux derniers cas s'appliquent** : il ne peut pas relier une requête « annuler » à l'appel qu'elle annule. Un client qui abandonne sans fermer sa connexion laisse l'approbation en attente jusqu'à `approvalTimeoutMs` — et un « oui » donné dans cet intervalle exécute encore l'outil, alors que plus personne n'attend la réponse. Gardez `approvalTimeoutMs` bien en dessous du temps d'attente de vos clients (l'exemple utilise 20 s), ou servez les outils qui nécessitent une approbation via stdio ou une session avec état.

Une fois l'approbation annulée, un « oui » tardif échoue avec « already rejected », et l'appel est vérifié une fois de plus après l'approbation : si le client est parti entre-temps, l'outil ne s'exécute pas. Les approbations via MCP conviennent aux décisions rapides. Pour les décisions qui prennent des heures, faites en sorte que l'outil *soumette une demande* que votre équipe traitera plus tard.
:::

La plupart des applications MCP demandent aussi à l'utilisateur son accord avant chaque appel d'outil (Claude Desktop le fait par défaut). Cette confirmation a lieu dans l'application ; les approbations du SDK ont lieu sur votre serveur, selon vos règles, et sont enregistrées. Utilisez les deux pour tout ce qui modifie des données.

## Liste de contrôle de sécurité {#security-checklist}

Avant de partager un serveur :

- [ ] **Exposez le minimum.** Ne listez dans `tools` que les outils nécessaires ; préférez les sources en lecture seule ; ajoutez les opérations d'écriture une par une.
- [ ] **Les écritures exigent un humain.** Conservez `requiresApproval` sur les outils d'écriture, sauf si vous avez une raison de ne pas le faire, et consignez cette raison.
- [ ] **Le moindre privilège en dessous.** Des jetons d'API aux droits en lecture seule, un rôle de base de données limité à SELECT, un dossier qui ne contient que ce qui peut être partagé. Les vérifications du serveur sont un second verrou, pas le premier.
- [ ] **Les secrets hors du code.** Les jetons proviennent de variables d'environnement (`claude mcp add … -e TOKEN=…`), jamais de la spécification, de la description ou du fichier.
- [ ] **Les résultats sont du texte non fiable.** Ce que renvoie une API, un document ou une base de données parvient mot pour mot au modèle — une page peut contenir « ignore tes instructions et… ». Ne donnez pas à une même conversation à la fois des sources non fiables et de puissants outils d'écriture sans approbation.
- [ ] **Serveurs HTTP** : HTTPS, un jeton aléatoire long, une liste d'autorisation des `Host`, une écoute sur `127.0.0.1` derrière le proxy.
- [ ] **Les détails des erreurs restent à l'intérieur** (`exposeErrorDetails` désactivé, la valeur par défaut). Les refus liés à l'entrée (argument incorrect, chemin hors du dossier, SQL qui n'est pas une requête) sont tout de même expliqués au client.
- [ ] **Des budgets** sur tout ce qui coûte de l'argent : les agents (appels au modèle) et les API payantes.
- [ ] **Lisez le journal d'événements** après les premiers jours : quels outils sont appelés, quels appels sont refusés.

Le projet MCP tient à jour un guide détaillé des attaques et des défenses : [Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices).

## Dépannage {#troubleshooting}

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| Le client se déconnecte aussitôt, ou dit que le serveur a envoyé du JSON invalide | Quelque chose écrit sur la **sortie standard** : un `console.log` dans votre code ou dans une bibliothèque | Utilisez `console.error` (la sortie d'erreur standard). Stdout transporte le protocole. |
| `npx tsx server.ts` affiche une ligne et semble bloqué | C'est normal : un serveur stdio attend un client | Testez avec l'[Inspector](./mcp-first-server#_4-test-it-with-the-mcp-inspector), ou connectez une application. |
| Le serveur n'apparaît pas dans Claude Desktop | Erreur JSON dans la configuration, chemin relatif, application non redémarrée | Vérifiez le JSON, utilisez des chemins absolus, quittez puis relancez l'application, lisez `mcp*.log` ([où](./mcp-first-server#_5-connect-it-to-claude-desktop)). |
| `npx: command not found` / `node: not found` dans les journaux | L'application ne voit pas le `PATH` de votre shell (fréquent avec nvm) | Utilisez le chemin complet de `npx` (`which npx` / `where npx`). |
| Un outil manque dans la liste | Il ne figure pas dans `tools` | Ajoutez son nom ou sa définition à `tools` : rien n'est exposé autrement. |
| `Another tool named "x" is already defined` au démarrage | Deux sources produisent le même nom d'outil | Donnez un `prefix` à chaque source. |
| `Tool execution failed: <name>` et rien de plus | La cause peut contenir des détails internes, elle est donc masquée | Lisez l'exécution dans le journal d'événements, ou définissez `exposeErrorDetails: true` pendant le développement. |
| Les appels dépassent le délai | L'outil est lent (souvent un agent) | Des `limits` d'agent plus petites ; augmentez le délai du client (Claude Code : `MCP_TOOL_TIMEOUT`). |
| Les résultats sont coupés | Limites de taille (`truncated: true`) ou limite propre au client | Augmentez `maxResponseBytes`, `maxRows`, `maxFileBytes` ; Claude Code : `MAX_MCP_OUTPUT_TOKENS`. |
| Un outil d'écriture répond « Approval no decision within 50000 ms » | Personne ne l'a approuvé à temps | Approuvez-le plus vite (voir [approbations](#approvals-a-human-says-yes-first)), augmentez `approvalTimeoutMs`, ou définissez délibérément `requiresApproval: false`. |
| Des dossiers comme `events/` ou `golden-traces/` apparaissent à des endroits inattendus | Pas de chemin absolu pour le journal d'événements (ou une ancienne version du SDK) | Passez `eventStore: new FileEventStore(<absolute path>)`. Les versions actuelles ne créent leurs autres dossiers qu'au moment de leur utilisation. |
| `Cannot find module 'node:sqlite'` | Node.js antérieur à 22.13 | Mettez Node.js à jour, ou utilisez `better-sqlite3`. |
| `… is not JSON. For a YAML spec, parse it yourself` | La spécification OpenAPI est en YAML | Analysez-la (paquet `yaml`) et passez l'objet comme `spec`. |
| `cannot resolve the server URL "/v3"` | La spécification a un serveur relatif et a été chargée depuis un fichier | Passez `baseUrl`. |
| L'Inspector refuse de démarrer | Sa [documentation](https://modelcontextprotocol.io/docs/tools/inspector) demande Node.js 22.19+ (vérifié le 2026-09-24) | Mettez Node.js à jour pour lancer l'Inspector (votre serveur peut rester en 20+). |
| Un client qui ne parle que le protocole 2026-07-28 ne peut pas se connecter | Le serveur accepte les révisions 2024-10-07 à 2025-11-25 (SDK TypeScript de MCP 1.30) | Utilisez un client qui prend en charge les révisions antérieures. L'Inspector négocie les deux « ères », l'ancienne et 2026-07-28, selon sa [documentation](https://modelcontextprotocol.io/docs/tools/inspector) (vérifié le 2026-09-24). |
| Avec les alertes d'incident activées, chaque appel MCP refusé devient une alerte | Un appel MCP en échec est une exécution en échec | Filtrez avec `when: (event) => event.metadata?.agentId !== 'mcp:docs'`, ou abaissez sa gravité. |

### Lire ce qui s'est passé {#reading-what-happened}

Chaque appel et chaque lecture de ressource est une exécution. Avec le magasin de fichiers par défaut, chaque exécution correspond à un fichier JSON dans votre dossier `events/` ; depuis le code :

```ts
const store = new FileEventStore('/absolute/path/events');
for (const runId of await store.getRunIds()) {
  const events = await store.getEvents(runId);
  const first = events[0];
  if (first?.metadata?.agentId === 'mcp:docs') {
    console.log(runId, events.map((event) => event.type).join(' → '));
  }
}
```

Un appel d'outil se lit `run.started → action.executing → policy.checked → tool.called → action.executed → run.completed` ; une lecture de ressource, `run.started → resource.read → run.completed`, où `resource.read` contient l'URI, la taille et le SHA-256 de ce qui a été servi. Voir le [catalogue des événements](../reference/events).
