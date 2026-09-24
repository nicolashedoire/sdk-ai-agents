# Nouvelles tentatives et repli

Les réseaux tombent, les fournisseurs limitent le débit, les outils dépassent leur délai. Le SDK retente ce qui peut l'être, bascule ce qui ne peut pas l'être, et **inscrit chaque nouvelle tentative dans l'exécution**, si bien que rien n'est caché.

```mermaid
flowchart LR
  R[Requête] --> P1{Fournisseur principal}
  P1 -- erreur transitoire --> W1["attente croissante (backoff)"] --> P1
  P1 -- tentatives épuisées --> P2{Fournisseur de repli}
  P2 -- erreur transitoire --> W2["attente croissante (backoff)"] --> P2
  P1 -- ok --> OK([Réponse])
  P2 -- ok --> OK
```

## Fournisseurs de LLM {#llm-providers}

Une politique de nouvelles tentatives s'applique à chaque fournisseur **individuellement, avant tout repli** :

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  fallbackProviders: [{ provider: 'anthropic', config: { apiKey: process.env.ANTHROPIC_API_KEY } }],
  retry: { maxRetries: 3, initialDelayMs: 500, maxDelayMs: 8_000 },
});
```

Un fournisseur de repli d'un autre éditeur a besoin de sa propre clé, dans son `config` ou dans `providerConfig` : la clé du fournisseur principal n'est jamais envoyée à un autre éditeur. Il reçoit le modèle de l'agent seulement s'il le sert, et sinon son propre `defaultModel`, `gpt-5.4` pour OpenAI et `claude-opus-5` pour Anthropic s'il n'est pas défini (Anthropic refuse un nom de modèle OpenAI, et inversement). L'événement `intention.generated` indique le fournisseur qui a répondu et le modèle utilisé.

| Option | Valeur par défaut | |
| --- | --- | --- |
| `maxRetries` | `2` | Nouvelles tentatives après la première tentative |
| `initialDelayMs` | `500` | Doublé à chaque nouvelle tentative (`multiplier`) |
| `maxDelayMs` | `8000` | Borne supérieure d'une attente entre deux tentatives |
| `maxRetryAfterMs` | `60000` | Plus long `retry-after` respecté (`maxDelayMs` quand un repli existe) |
| `jitter` | `true` | Rend aléatoire chaque attente dans [delay/2, delay] |
| `retryOn` | `isTransientError` | Votre propre prédicat |

Seules les erreurs **transitoires** donnent lieu à de nouvelles tentatives : 408, 409, 425, 429, 5xx, 529, les échecs de connexion et les dépassements de délai — y compris les erreurs de connexion d'OpenAI et d'Anthropic, reconnues par leur classe et par le code réseau de leur `cause`. Les erreurs d'authentification, de validation et de politique échouent immédiatement, tout comme une erreur 429 qui signifie que le compte n'a plus de crédit ou de quota (`insufficient_quota`, `credit_balance_exhausted`…) : attendre ne ferait pas revenir le crédit. Le message d'erreur reprend l'explication du fournisseur. Quand le fournisseur envoie `retry-after-ms` ou `retry-after`, le SDK attend cette durée au lieu d'appliquer sa propre attente croissante, jusqu'à `maxRetryAfterMs` (60 s par défaut). Quand des `fallbackProviders` sont configurés, cette borne est abaissée à `maxDelayMs` : un fournisseur qui demande une longue pause est laissé de côté au profit du repli au lieu de bloquer l'exécution. Une demande plus longue met fin aux nouvelles tentatives.

Quand la politique du SDK est active, les nouvelles tentatives propres aux clients OpenAI et Anthropic sont désactivées — **les nouvelles tentatives ne s'empilent jamais**. Chaque nouvelle tentative est enregistrée sous forme d'événement `provider.retry` avec le fournisseur, le modèle, la tentative, le délai et l'erreur. Passez `retry: false` pour conserver plutôt les réglages par défaut des fournisseurs.

Une exécution qui transmet son texte en streaming (`onText`) peut voir un appel au modèle échouer après l'arrivée d'une partie de la réponse. Une erreur que l'éditeur envoie au milieu du flux compte comme son équivalent HTTP : le `server_error` (500) d'OpenAI et les `rate_limit_error` (429), `api_error` (500), `timeout_error` (504) et `overloaded_error` (529) d'Anthropic donnent lieu à de nouvelles tentatives, pas les autres types. Une connexion qui se coupe au milieu du flux, un flux qui se termine avant que sa réponse soit complète et un flux qui n'envoie rien pendant tout le délai d'expiration du client (10 minutes par défaut ; `timeout` dans `providerConfig`, dans le `config` d'un repli ou dans les options de `OpenAIProvider` et de `AnthropicProvider`) sont des échecs de connexion. Avant la nouvelle tentative, ou avant le fournisseur de repli, `onTextRestart` indique à l'appelant de retirer le texte que la tentative échouée avait transmis : la tentative suivante écrit à nouveau la réponse (voir [Recevoir la réponse en streaming](./governed-agents#_7-streaming-the-answer)).

Un fournisseur que vous injectez avec `llmProvider` est utilisé tel quel, sauf si vous définissez `retry` explicitement, et un `FallbackProvider` n'est jamais enveloppé, pour que ses basculements restent visibles dans la trace. Ses fournisseurs ne sont pas enveloppés non plus, donc `retry` ne s'applique pas à eux : pour en relancer un avant de basculer, enveloppez-le dans `RetryingLLMProvider` et donnez à son client `maxRetries: 0`. Donnez à `maxRetryAfterMs` la valeur de `maxDelayMs`, comme le fait le SDK quand un repli peut prendre le relais, pour qu'un fournisseur qui demande une longue pause soit laissé au repli. Ces nouvelles tentatives ne sont pas enregistrées comme événements `provider.retry`.

## Outils {#tools}

Marquez les outils idempotents comme pouvant être retentés :

```ts
sdk.defineTool({
  name: 'lookup_metric',
  description: 'Reads a metric',
  schema: z.object({ metric: z.string() }),
  retry: { maxRetries: 2, initialDelayMs: 200 },
  handler: async ({ metric }) => warehouse.read(metric),
});
```

Seuls les échecs d'outils donnent lieu à de nouvelles tentatives — jamais un refus de politique ni une erreur de validation. Chaque nouvelle tentative est un événement `tool.retry`.

## Décisions typées {#typed-decisions}

Le client Jev retente les réponses 408, 429, 5xx et 529 ainsi que les erreurs réseau, **en respectant `retry-after`**, avec par défaut la politique de nouvelles tentatives du SDK (`jev.maxRetries` la remplace). Contrairement aux fournisseurs de LLM, il retente toute erreur 429, quelle qu'en soit la cause, jusqu'à `maxRetries`.

## Partout ailleurs {#anywhere-else}

`withRetry` est exporté pour votre propre code :

```ts
import { withRetry, DEFAULT_RETRY_POLICY } from '@sdk-ai-agents/core';

const data = await withRetry(() => fetchPartnerFeed(), DEFAULT_RETRY_POLICY, {
  onRetry: ({ retry, delayMs, error }) => logger.warn({ retry, delayMs, error }),
});
```
