# SDK API

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| オプション | 型 | 説明 |
| --- | --- | --- |
| `apiKey` | `string` | 主プロバイダーのキー（`llmProvider` を使う場合は不要）。キーがまったくなくてもツールと MCP サーバーは動作し、モデルを必要とする呼び出しは明確なエラーで失敗する |
| `provider` | `'openai' \| 'anthropic'` | 主プロバイダー。デフォルトは `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | 各ベンダーの `apiKey`、`defaultModel`、`baseURL`、`timeout`（`baseURL`：Azure OpenAI の v1 API やローカルのモデルサーバーなどの互換エンドポイント、またはプロキシ。`timeout`：回答を待つ最長時間をミリ秒で指定し、デフォルトは 10 分。ストリーミングされた回答では、その 2 つのイベントの間に待つ最長時間）。主プロバイダーは自分のベンダーの項目を使い、別のベンダーのフォールバックはそのベンダーの項目を使う。デフォルトのモデルは `gpt-5.4` と `claude-opus-5`。OpenAI の項目では `reasoningModels`、`reasoningEffort`、`nativeToolMessages`、`includeStreamUsage` も指定できる（[OpenAI のモデル](#openai-models) を参照） |
| `fallbackProviders` | `Array<{ provider, config? }>` | 主プロバイダーが失敗したときに、順番に試される。`config` は `providerConfig` より優先される。主プロバイダーと同じベンダーのフォールバックは、主プロバイダーの設定を引き継がない（全体の `apiKey` のみ）。別のベンダーのフォールバックには独自のキーが必要 |
| `llmProvider` | `LLMProvider` | 独自のプロバイダー（ローカルモデル、ゲートウェイ、テストダブル）。`nativeToolMessages` を宣言していれば、ツール呼び出しとその結果をネイティブ形式（`LLMMessage`）で、そうでなければテキストで受け取る。テキストをストリーミングすることもできる（[`LLMProvider`](#llmprovider) を参照） |
| `retry` | `Partial<RetryPolicy> \| false` | LLM のリトライポリシー。プロバイダーごとに、フォールバックの前に適用される。その `maxRetries` と `initialDelayMs` は `jev.maxRetries` と `jev.retryBaseDelayMs` のデフォルトにもなる。ほかのフィールドは Jev クライアントには届かず、`retry: false` の場合、Jev クライアントは独自の 2 回のリトライと 500 ms を使う。注入した `llmProvider` には明示的に設定した場合にのみ適用され、`llmProvider` として渡した `FallbackProvider` とその中のプロバイダーには適用されない |
| `jev` | `JevClientConfig` | 型付き決定のために TypeSafe Jev を有効にする。直接使うか、`baseUrl` と `model: 'typesafe-ai/jev'` を指定して [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) 経由で使う |
| `decisionClient` | `TypedDecisionClient` | 任意の型付き決定のバックエンド（`jev` より優先される） |
| `pricing` | `PricingTable` | 100 万トークンあたりの USD 価格。デフォルトの価格に上書きで統合される |
| `incidents` | `IncidentMonitorOptions` | 通知手段、ルール、重大度のしきい値、送信頻度の制限 |
| `eventStore` | `IEventStore` | デフォルトは `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | グローバルなポリシー |
| `goldenTracesDir`、`regressionTestSuitesDir`、`assertionsDir`、`impactAnalysesDir` | `string` | テスト成果物の保存先 |

### OpenAI のモデル {#openai-models}

OpenAI の推論モデル（o シリーズの `o1`、`o3`、`o4-mini`… と、GPT-5 以降の `gpt-5`、`gpt-5.4-mini`、`gpt-6-sol`…。日付付きやファインチューニング済みの `ft:o4-mini-…` なども含む）は、`max_tokens` を拒否し、推論の努力度が `none` でない限り `temperature` も拒否します。OpenAI プロバイダーは大文字・小文字を問わず名前でこれらを判別し、`maxTokens` を `max_completion_tokens`（推論トークンも数えます）として、推論の努力度とともに送ります。デフォルトの努力度はモデルによって異なるため、温度は一切送りません。エージェントやエンジンの温度は、これらのモデルでは無視されます。それ以外のモデルには、OpenAI 互換のどのサーバーも理解する `temperature` と `max_tokens` を送ります。

::: warning ツールと推論の努力度
SDK は Chat Completions を通じて OpenAI を呼び出します。Chat Completions では、GPT-5.4 以降のモデルは努力度が `none` のときにしかツールを呼び出しません。デフォルトのモデル `gpt-5.4` は、別の努力度を指定しない限り `none` を使います。GPT-5.5、GPT-5.6、GPT-6 Sol と Luna のデフォルトは `medium` なので、`reasoningEffort: 'none'` を指定しない限り、ツールを持つエージェントはこれらのモデルで失敗します（`Function tools with reasoning_effort are not supported`）。GPT-6 Astra は Chat Completions ではツールをまったく呼び出せません。SDK は指定された努力度をそのまま送ります。
:::

| オプション | デフォルト | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | モデルを指定しないリクエストと、エージェントのモデルに対応していないフォールバックが使うモデル |
| `reasoningModels` | 名前から判別 | `true` または `false`：このプロバイダーのすべてのモデルを推論モデルとして扱うか、扱わないか。リスト：挙げた名前（Azure のデプロイ、ゲートウェイのエイリアス）は推論モデルで、ほかは名前から判別される |
| `reasoningEffort` | モデルのデフォルト | `none`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max` のいずれか。推論モデルにだけ、そのまま送られる。各モデルが受け付けるのはこのうち一部の値で、API はそれ以外を拒否する |
| `includeStreamUsage` | OpenAI 自身の API では有効 | `true`：ストリーミングされた回答に使用量を要求し（`stream_options`）、その費用が数えられる。`false`：要求しない。デフォルトでは `https://api.openai.com/v1` と、`https://eu.api.openai.com/v1` などのリージョンのホスト（`baseURL` または `OPENAI_BASE_URL` から判断）で有効になる。互換サーバーはこのフィールドを拒否する（その場合、リクエストはこのフィールドなしで再送される）か、無視することがあり、使用量のないストリーミングの呼び出しは未計測として扱われるためである。使用量を報告する互換サーバー（Azure OpenAI の v1 API は報告する）で費用予算を使う場合は `true` にする |
| `nativeToolMessages` | `true` | 会話の中でアシスタントの `tool_calls` と `tool` メッセージを受け付けない互換サーバーでは `false`：それまでのツール呼び出しとその結果はテキストで送られる。ツールは引き続き提示され、応答に含まれるツール呼び出しも引き続き読み取られる。主プロバイダーまたはいずれかのフォールバックで `false` にすると、チェーン全体に適用される |

これらのオプションは `providerConfig.openai`、または OpenAI のフォールバックの `config` に指定します。別のベンダーのフォールバックは、自身の `config` が指定していないオプションを `providerConfig.openai` から取ります。主プロバイダーと同じベンダーのフォールバックは何も引き継ぎません。エージェントや実行は、`providerSettings.openai.reasoningEffort` で独自の努力度を指定できます。実行の値が最優先で、次にエージェント、最後にプロバイダーの値が使われます。認知エージェントはこれをツール選択にだけ適用し、ツールを提示しない思考には、エージェントの `reasoningEffort` オプションが使われます。

```ts
const sdk = createSDK({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  providerConfig: {
    openai: {
      baseURL: 'https://my-resource.openai.azure.com/openai/v1/',
      reasoningModels: ['analyst-o4-mini'], // a deployment name says nothing about its model
      reasoningEffort: 'low',
    },
  },
});

const analyst = sdk.createAgent({
  name: 'analyst',
  model: 'analyst-o4-mini',
  providerSettings: { openai: { reasoningEffort: 'high', maxTokens: 8_000 } },
});
```

### `LLMProvider` {#llmprovider}

独自のプロバイダーは `generateCompletion(request)`、`supportsModel(model)`、`getProviderName()` を実装し、`nativeToolMessages` を宣言することもできます。リクエストの 2 つのフィールドがストリーミングに関係します。

| `LLMRequest` のフィールド | |
| --- | --- |
| `onTextDelta?(delta)` | 呼び出し元がテキストを書かれるそばから受け取りたい場合（`onText` を指定した実行）に設定される。テキストの断片が届くたびに、その断片を渡してこれを呼び出し、その後、通常どおり完全な `LLMResponse` を返す。断片をつなげたものが、その `content` にならなければならない。ストリーミングできないプロバイダーはこれを無視し、SDK が `content` 全体を一度に渡す。これは例外をスローしてはならない（SDK 自身が設定するものは決してスローしない） |
| `onTextRestart?()` | すでにテキストをストリーミングした試行の後にもう一度試すとき（独自のリトライ）に、これを呼び出す。そのテキストは無効になり、次の断片から回答がやり直される。`RetryingLLMProvider` と `FallbackProvider` は、ラップしているプロバイダーのためにこれを呼び出す |

## エージェント {#agents}

| メソッド | 戻り値 | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | ガバナンス付きエージェント：`run({ message, context?, signal?, onText?, onTextRestart? })`、`stop(runId?)`、`addTools()`、`setPolicy()`、`id`、`name`、`version`、`configHash`。モデルが SDK に登録されている別のツールの名前を挙げても、実行できるのは自分のツール（`tools`、`capabilities`）だけ。`signal` は実行をキャンセルする。`onText` はモデルが書くテキストを書かれるそばから受け取り、`onTextRestart` は失敗したモデル呼び出しがもう一度試されるときに捨てる部分を受け取る（[回答のストリーミング](../guide/governed-agents#_7-streaming-the-answer) を参照） |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`、`stop(runId?)`、`learnFromFeedback(runId, feedback)`、`getProfile()`、`setProfile()`。その思考は構造化されており、ストリーミングされない |
| `defineTool(definition)` | `Tool` | ツールを登録する。ハンドラーの型は、その Zod スキーマから決まる |
| `defineCapability(definition)` | `Capability` | ツールをグループにまとめる |
| `listTools()` | `Tool[]` | 登録されているすべてのツール |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | エージェントの外でのガバナンス付き実行（MCP サーバーが使う）：引数、ポリシー、承認、予算（呼び出しの開始時に数えられる）の順にチェックし、それからツールを実行する。`signal` は承認待ちをキャンセルし、ハンドラーにも届く。`approvalTimeoutMs` は、誰も判断しなかった承認をキャンセルする |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | `read()` を独立した 1 つの実行として行う：`run.started`、`resource.read`（URI、サイズ、SHA-256）、`run.completed` または `run.failed` |
| `stopRun(runId)` | `Promise<void>` | ガバナンス付きエージェントまたは認知エージェントの実行を停止する |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| オプション | デフォルト | |
| --- | --- | --- |
| `name`、`model` | — | 必須 |
| `profile` | `DEFAULT_THINKER_PROFILE` | エージェントがどのように推論するか |
| `tools`、`policies` | `[]` | ほかの場所と同じようにガバナンスされる。予算とタイムアウトのポリシーは各ステップの前にも確認される。[制限とポリシー](../guide/cognitive-agents#limits-and-policies) を参照 |
| `systemPrompt` | — | すべてのプロンプトに加える追加の指示 |
| `limits` | [認知エージェント](../guide/cognitive-agents#limits) を参照 | `maxSteps`、`timeoutMs`、`maxHypotheses`、`maxToolCalls`、`decisionThreshold`、`maxConsecutiveFailures`、`maxPredictionTests`、`preferenceWeight`、`minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`、`'typed'`、または `CognitiveController` |
| `controllerOptions` | — | `minConfidence`（0.35）、`readinessThreshold`（0.8）、`fallback`、`model` |
| `assessment` | `'auto'` | `compare` オペレーションに使う `'llm'`、`'typed'`、または独自の `HypothesisAssessor` |
| `knowledge` | — | 実行をまたぐ記憶：`{ store, scope, recallLimit? (10), record? (true) }`。[実行をまたぐ記憶](../guide/memory) を参照 |
| `evaluator` | — | 予測をテストする `OutcomeEvaluator`。`test_prediction` を有効にする |
| `generator` | `model` を使う LLM ジェネレーター | 独自の `ThoughtGenerator`（観測の比較も含む）。その思考も、エンジンの受け入れ規則を通る |
| `temperature`、`maxTokens`、`reasoningEffort` | `0.4`、—、— | 思考の生成の設定（`reasoningEffort`：OpenAI の推論モデルのみ） |
| `providerSettings` | — | ツール選択の設定（ネイティブの推論エンジン）。`openai.reasoningEffort` を含む |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` — `status` は `completed`、`failed`、`cancelled` のいずれかです。`decision.status` は `committed`、`provisional`、`abstain` のいずれかで、まだ確立されていないことが `decision.missing` に列挙されます。`state` は最終的な `MentalState` です。

### `OutcomeEvaluator` {#outcomeevaluator}

```ts
interface OutcomeEvaluator {
  readonly id: string;
  readonly version: string;
  evaluate(input: { prediction; hypothesis; state; abortSignal? }): Promise<{
    verdict: 'confirmed' | 'refuted' | 'inconclusive';
    observed?: unknown;
    summary?: string;
    context?: string;
    metrics?: Record<string, number>;
    causeCandidates?: string[];
    reason?: string;
  }>;
}
```

詳しくは [証拠と検証](../guide/evidence-and-verification) を参照してください。

## 推論とプロファイル {#reasoning-profiles}

| メソッド | 戻り値 |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — イベントから再構築される |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines 形式 |

## 型付き決定 — `sdk.decisions` {#typed-decisions-—-sdk-decisions}

バックエンドが設定されていない場合は、`ValidationError` を投げます。

| メソッド | 戻り値 |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` — 回答の型は質問から決まる。バックエンドがトークン数を報告しなかった場合、`usage` はない |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

質問を組み立てるヘルパー：`noul(instructions, criteria?)`、`choice(instructions, options)`、`score(instructions, levels)`。

## 運用 {#operations}

| メソッド | 戻り値 |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`、`rejectAction(...)`、`getPendingApprovals(runId?)` | 人による承認 |
| `getBudgetUsage(limit)`、`getPolicyAuditTrail(runId)` | 予算とポリシーの監査 |

### `RunCostReport` {#runcostreport}

`getRunCost(runId)` が返すもの。実行内のモデル呼び出しを、失敗したステップの分も含めて集計します。[API コスト](../guide/costs) を参照してください。

```ts
interface RunCostReport {
  runId: string;
  currency: 'USD';
  totalUsd: number;
  complete: boolean;
  lines: ModelCostLine[];
  unpricedModels: string[];
  unpricedCalls: number;
  unmeteredCalls: number;
  unmeteredModels: string[];
}

interface ModelCostLine {
  model: string;
  requestedModel?: string;
  source: 'llm' | 'decision';
  calls: number;
  unmeteredCalls?: number;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}
```

| フィールド | |
| --- | --- |
| `totalUsd` | コストのわかっている呼び出しのコスト。`complete` が `false` のときは下限にすぎない |
| `complete` | 一部の呼び出しのコストが不明な場合、つまり `unpricedCalls` または `unmeteredCalls` が 0 より大きい場合は `false` |
| `unpricedModels`、`unpricedCalls` | `pricing` に価格のないモデルと、そのうちトークン数を報告した呼び出し |
| `unmeteredModels`、`unmeteredCalls` | 入力トークン数も出力トークン数も報告しなかった呼び出しのモデルと、その呼び出し |
| `lines` | モデルと発生源ごとに 1 行。呼び出し回数、トークン数を報告した呼び出しのトークン数、該当する場合は `unmeteredCalls`、モデルに価格があり、その行のいずれかの呼び出しがトークン数を報告した場合は `costUsd`。モデル名を記録しなかった呼び出しの `model` は `(unknown)` |

## トレース、リプレイ、テスト {#traces-replay-and-testing}

| メソッド | |
| --- | --- |
| `getTrace(runId)`、`exportTrace(runId, 'json' \| 'text')`、`getEvents(runId, filters?)` | 実行を読む |
| `replay(runId, modifications?, { onEvent? })` | LLM を使わずに再実行する |
| `getReasoningGraph`、`exportReasoningGraph`、`getAlternatives`、`getDecisionPatterns`、`getTraceVisualization` | 決定を理解する |

### ゴールデントレース {#golden-traces}

| メソッド | 戻り値 | |
| --- | --- | --- |
| `createGoldenTrace(runId, { name, description?, metadata? })` | `Promise<GoldenTrace>` | 実行を基準として保存する。その実行を行ったガバナンス付きエージェントの名前（`agentName`）も記録する |
| `getGoldenTraces(agent?)`、`getGoldenTrace(id)`、`deleteGoldenTrace(id)`、`exportGoldenTrace(id, 'json' \| 'yaml')` | | `agent`：エージェントの id または名前 |
| `validateAgainstGoldenTrace(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | `pass`、`fail`、`partial` のいずれか。差分ごとに種類（`event_added`、`event_removed`、`event_modified`、`event_order_changed`）と位置が付く |
| `detectRegressions(runId, goldenTraceId, options?)` | `Promise<RegressionReport>` | 同じ差分をリグレッションとして、重大度と影響付きで返す。結果は `no_regression` または `regressions_detected` |
| `replayAndValidate(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | 実行をリプレイしてから、そのリプレイを検証する。リプレイはモデルを呼ばないため、`validateAspects: ['tools', 'policies']` で比較する |

実行は **イベントの意味で** 比較され、イベントの id では決して比較されません（id は実行ごとに新しくなります）。イベントは種類と対象（ツール、ポリシー、操作、回答）によって順番に対応づけられ、そのうえでデータが比較されます。比較しないもの：イベントの id、時刻、メタデータ、そしてデータのフィールド `agentId`、`approvalId`、`delayMs`、`duration`、`durationMs`、`elapsedMs`、`eventId`、`observedAt`、`recordedAt`、`replayOf`、`sourceEventId`、`usage`。同じことをもう一度行う実行は合格します。別の引数で呼ばれたツールは、呼び出しが起きた位置で報告されます（`parameters.metric: "churn" → "revenue"`）。`action.executed` が `action.failed` になった場合は、消失と追加ではなく 1 つの変更です。

| オプション | 対象 | |
| --- | --- | --- |
| `ignoreEventTypes`、`validateAspects`（`intentions`、`actions`、`tools`、`policies`） | 検証 | 比較するイベントを減らす |
| `tolerance.dataFields` | 検証 | 比較から外すデータのフィールドを、どの深さでも追加する |
| `tolerance.timestampMs`、`ignoreTimestampDiff` | 検証 | タイミングは `timestampMs` があるときだけ、各実行の開始からの時間で比較する |
| `compareStructureOnly` | 検証 | データの差分は `fail` ではなく `partial` になる |
| `tolerance.ignoreEventTypes`、`tolerance.ignoreDataFields` | リグレッション | 比較するイベントを減らし、データのフィールドを外す |
| `tolerance.criticalEventTypes` | リグレッション | 出現、消失、変更が重大とされる種類（デフォルト：`run.failed`、`action.failed`、`tool.failed`、`policy.violated`） |
| `tolerance.maxEventCountDiff` | リグレッション | この数までの、追加または削除された処理イベント（ポリシーのチェック、リトライ、承認）は許容する。結果の変更は決して許容しない |
| `tolerance.maxDurationDiff`、`severityThresholds` | リグレッション | 所要時間はどちらかがあるときだけチェックする。`maxDurationDiff` ms を超えて遅くなった実行はリグレッションとなり、到達した最も高いしきい値の重大度が付く。速くなった実行は決してリグレッションにならない |

### リグレッションスイート {#regression-suites}

| メソッド | 戻り値 | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | `regressionTestSuitesDir` に保存される。`agent`：この SDK のエージェントの id または名前。各ゴールデントレースは存在している必要がある。`input` のデフォルトは、基準の実行が受け取った入力 |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | 新しいものから順に |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | エージェントのすべてのスイートを古い順に実行する。各テストは入力をエージェントに送り、その実行をゴールデントレースと比較する。`suites` にはスイートごとに 1 つの結果が入る |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | 1 つのスイートだけ |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode`：0 はすべてのテストが合格、1 はリグレッションを見つけたテストがある、2 は実行できなかったテストがある（エラーまたはタイムアウト）。オプションで `exitCode: false` にすると 0 になる |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | JUnit XML では、スイートごとに 1 つの `<testsuite>` があり、タイムアウトはエラーとして数える |

エージェントの id はプロセスごとに新しくなるため、スイートはエージェントの **名前** も記録し、別のプロセスではその名前のエージェントで実行されます（そのエージェントが SDK にあれば、まずスイートのエージェント id を使います）。1 つの SDK の 2 つのエージェントが同じ名前を持つときは、id を指定してください。以前のバージョンで保存されたスイートは名前を持たないため、作成したプロセスでしか実行できません。オプション：`parallel`（1 つのスイートのテストを同時に実行）、`stopOnFirstFailure`（逐次実行のときだけ）、`filterTags`、`excludeTags`、`timeout`（テストごとの ms、デフォルトは 60 000。超えると実行はキャンセルされ、テストは `timeout` になる）、`detection`（上のリグレッションのオプション）。

### アサーション {#assertions}

| メソッド | 戻り値 | |
| --- | --- | --- |
| `defineAssertion(name, condition, { description?, severity?, tags?, agentId?, agentName? })` | `Promise<Assertion>` | すべての実行、または 1 つのエージェントの実行が対象。`agentId` で指定したこの SDK のエージェントは、その名前も記録される。評価できない条件は `ValidationError` で拒否される |
| `getAssertions(agent?, tags?)` | `Promise<Assertion[]>` | 新しいものから順に |
| `evaluateAssertions(runId, assertionIds?)` | `Promise<AssertionEvaluationReport>` | 指定したアサーション（未知の id はエラー）。指定しなければ、すべての実行が対象のものと、その実行のエージェントのもの |
| `deleteAssertion(assertionId)` | `Promise<void>` | |

| `condition.type` | 必要なもの | 合格する条件 |
| --- | --- | --- |
| `event_present`、`event_absent` | `eventType` または `eventTypes` | いずれかの種類が現れる／どれも現れない |
| `event_count` | `eventType` または `eventTypes`、それに `count`、または `minCount` と `maxCount` | その種類のイベントの数が範囲に収まる |
| `event_order` | `beforeEventType`、`afterEventType` | 一方の最初のイベントが、もう一方の最初のイベントより前にある |
| `event_value` | `eventType`、`valuePath`、`valueMatcher`（`eq`、`ne`、`gt`、`gte`、`lt`、`lte`、`contains`、`regex`） | その種類のすべてのイベントが一致する |
| `custom` | `customEvaluator(events) => boolean` | 関数が `true` を返す |

`custom` アサーションは関数を持ち、関数はファイルに書き出せません。そのため **保存されず**、定義した SDK インスタンスが存在する間だけ有効です。起動時にもう一度定義してください。ほかの種類は `assertionsDir` に保存されます。

### 比較と影響 {#comparisons-and-impact}

| メソッド | 戻り値 | |
| --- | --- | --- |
| `compareRuns(runId1, runId2, { ignoreEventTypes?, focusAspects?, compareStructureOnly?, includeMetadata? })` | `Promise<RunComparison>` | 上と同じく意味で対応づけた差分：`event_added`、`event_removed`、`event_modified`（種類が変わった）、`data_changed`、`sequence_changed` |
| `getComparisonReport(comparison, 'text' \| 'json' \| 'html')` | `Promise<string>` | |
| `analyzeImpact(beforeRunIds, afterRunIds, { metrics?, includeRecommendations? })` | `Promise<ImpactAnalysis>` | 変更前と変更後の平均：`duration`（ms）、`cost`（価格のあるモデル呼び出しの USD、`getRunCost` と同じ）、`quality`（失敗したアクションではないイベントの割合）、`success_rate`。振る舞いの変化も含む。`impactAnalysesDir` に保存される |
| `getImpactAnalysis(analysisId)` | `Promise<ImpactAnalysis>` | |
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | ガバナンス付きエージェント（その名前、またはこの SDK のエージェントの id）の実行のうち、各バージョン（`version` または `configHash`）で記録されたものに対する `analyzeImpact`。リプレイは除く。未知のバージョンはエラーになり、記録されているバージョンが一覧される |

ガバナンス付きエージェントの実行のライフサイクルイベント（`run.started`、`run.completed` など）は、その `agentName`、`agentVersion`、`configHash` を記録します。同じ名前の 2 つのエージェントは、2 つのバージョンまたは 2 つのプロセスにある 1 つのエージェントです。以前のバージョンで記録された実行には id とバージョンしかありません。

### すべての実行にまたがるクエリ {#queries-across-runs}

| メソッド | 戻り値 |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>`：一致するイベント（時刻順、最大 `limit` 件）、範囲内のイベント数、一致したイベント数 |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

フィルターには **範囲**（`runId`、これがなければすべての実行、`since`、`until`）と **条件**（`type`、`agentId`、`userId`、`sessionId`、`dataFilters`（`{ path, operator, value?, regex? }`）、`metadataFilters`（`{ field, operator, value? }`））があります。条件は `logic`（デフォルトは `and`、`or` は少なくとも 1 つ）で組み合わされ、そのあと `not` で反転されます。範囲が反転されることはありません。組み込みのストアはどれでも答えます。ファイルストアはすべての実行を読み、SQL のストアはデータベースに問い合わせます。すべての条件を満たす必要があるときは、データベース自身が種類と id で絞り込みます。

## リアルタイムのイベント {#live-events}

リスナーは `(event: Event) => unknown` です。リスナーはイベントを、ストアが受け付けた後で、1 つずつ、各実行の順番どおりに受け取ります。リスナーが Promise を返すと、次のイベントの前にその Promise が待たれます。実行がリスナーを待つことは決してなく、リスナーのエラーは報告されるだけで、実行の中に投げられることはありません。リスナーを待てるイベントは最大 `maxQueued` 個（デフォルトは 10 000）です。それを超えると、新しいイベントはそのリスナーについては破棄され、`LiveEventsDroppedError` で報告されます。[リアルタイムの進捗](../guide/observability#live-progress) を参照してください。

| API | |
| --- | --- |
| `RunInput.onEvent`：`agent.run({ message, onEvent })` | 実行のすべてのイベント。`run()` は、リスナーがそのそれぞれの処理を終えた後に解決される。ただし、実行が停止またはキャンセルされたとき、または `signal` が中断されたときは、それより早く解決される（そのときリスナーの購読は解除される）。リスナーは記録されない |
| `ThinkInput.onEvent`：`agent.think({ problem, onEvent })` | 認知エージェントの実行について同じ。その `limits.timeoutMs` でも待機が終わる |
| `replay(runId, modifications?, { onEvent })` | リプレイについて同じ。リプレイはキャンセルできないので、必ず待つ |
| `executeTool(name, params, { onEvent })` | 呼び出しのイベントと、そのツールが開始する実行のイベント（1 階層分まで）。ハンドラーはリスナーを `context.onEvent` として受け取り、`governedAgentTool` と `cognitiveAgentTool` はそれを自分のエージェントに渡す（リアルタイムのイベントに対応していないストアの上に手作業で組み立てたエージェントは、リスナーなしで動く）。`signal` で待機が終わる |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`：フィルターに一致するすべての実行のすべてのイベント（`agentId` は `metadata.agentId`）。返された関数を呼び出すまで続き、その関数を呼び出すと、まだ配信されていないイベントは破棄される |
| `new ObservedEventStore(store, { onListenerError? })` | イベントを配信する層。SDK は自分のストアをこれでラップするか、`eventStore` として渡されたものを使う（`MonitoredEventStore` の中にあるものも含む。その場合、そのインシデント報告も配信される）。その `subscribe(listener, options?)` は `{ unsubscribe(), close() }` を返す。`close()` は、リスナーがすでに受け取ったイベントの処理を終えるまで待つ。`onListenerError` は、リスナーのエラーとイベントの破棄を受け取る |

## ツール：`ToolDefinition` {#tools-tooldefinition}

| フィールド | |
| --- | --- |
| `name`、`description` | モデルが目にするもの |
| `schema` | 引数の Zod スキーマ。一致しない呼び出しは拒否される |
| `handler(params, context?)` | 検証済みの引数と `{ runId, agentId, signal?, onEvent? }` を受け取る。呼び出し元が待つのをやめると `signal` が中断される。呼び出し元がその呼び出しをリアルタイムで見ている場合は `onEvent` が設定される。ツールが開始する実行には、それを `onEvent` として渡す |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — 冪等なツールに限る。不正な引数がリトライされることはない |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true` にすると、すべての呼び出しが `approveAction` を待つ。`readOnly` は MCP クライアントに `readOnlyHint` として示される |
| `inputJsonSchema` | `schema` から導かれる JSON Schema の代わりに示す JSON Schema |
| `capability`、`version` | グループ、バージョン |

## ツールソース {#tool-sources}

どれも、すぐに使える `ToolDefinition` を返します。`sdk.defineTool` に渡すことも、エージェントに渡すことも、MCP サーバーの `tools` に直接渡すこともできます。[なんでも MCP サーバーにする](../guide/mcp-recipes) を参照してください。

| 関数 | 戻り値 | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | OpenAPI 3 の記述のオペレーションごとに 1 つのツール。`include` に列挙しない限り `GET` のみで、それ以外のメソッドはデフォルトで承認が必要。呼び出しは `{ status, data, truncated? }` を返す |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | 1 つのフォルダーに対する `list_files`、`read_file`、`search_files`。そのフォルダーの外には決して出ない。除外したフォルダーは、その中身をすべて隠す |
| `folderResources(options)` | `ResourceProvider` | 同じファイルを、MCP リソース `folder://<name>/<path>` として提供する |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`、`describe_table`、`query`（読み取り専用のステートメント 1 つ。最大 `maxRows` 行で、デフォルトは 100） |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | `node:sqlite` の `DatabaseSync` または `better-sqlite3` 用。`PRAGMA query_only = ON` でクエリを実行する |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | `pg` 用（専用のクライアント、またはプール）。各クエリは `BEGIN READ ONLY`（すでにトランザクションの中にある接続では拒否される）… `ROLLBACK` + `pg_advisory_unlock_all()` の中で、`SET LOCAL statement_timeout`（デフォルトは 10 秒）を付けて実行される。`schemas` が制限するのは、テーブルの一覧表示と説明だけ |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`：`{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`。呼び出し元がやめるとキャンセルされる。`exposeErrors` を指定しない限り、`error` は汎用的な内容になる |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | データベースアダプターが使うステートメントのチェック（SQLite と PostgreSQL の構文のみ） |

```ts
interface ReadOnlyDatabase {
  readonly dialect: string;
  listTables(options: { maxTables: number }): Promise<TableSummary[]>;
  describeTable(name: string): Promise<ColumnSummary[]>;
  /** Must refuse writes itself; rows converted with toJsonRow(row, maxTextLength) as they arrive. */
  query(sql: string, options: { maxRows: number; maxTextLength: number }): Promise<{ columns: string[]; rows: Array<Record<string, unknown>>; truncated: boolean }>;
}

interface ResourceProvider {
  handles(uri: string): boolean;
  list(): Promise<Array<{ uri: string; name: string; description?: string; mimeType?: string; size?: number }>>;
  read(uri: string): Promise<{ uri: string; mimeType?: string; text: string }>;
}
```

## MCP — `@sdk-ai-agents/core/mcp` {#mcp-—-sdk-ai-agents-core-mcp}

| 関数 | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `tools` に列挙したものだけを公開する MCP の `Server`。`tools` には、定義済みツールの名前と `ToolDefinition` のどちらか、または両方を指定する（`ToolDefinition` は自動的に SDK 上で定義される。同じ定義をもう一度渡すのはかまわないが、すでに使われている名前を持つ別のツールは拒否される）。`resources`：1 つまたは複数の `ResourceProvider`。すべての読み取りがトレースされる。呼び出しは `mcp:<name>`（または `agentId`）として実行される。`approvalTimeoutMs`（デフォルトは 50 000 ms）以内に誰も判断しない承認はキャンセルされる。入力の拒否はクライアントに説明され、それ以外の原因は `exposeErrorDetails` を指定した場合にだけ伝えられる。`progressToken` 付きの呼び出しは、イベントごとに `notifications/progress` を 1 つ受け取り、それらはすべて結果より前に送られる（[進捗通知](../guide/mcp-deploy#progress-notifications)） |
| `serveMcpOverStdio(sdk, options)` | 同じサーバーを stdin/stdout に接続したもの。stderr に「ready」の行を 1 行書き込み、stdin が終わると閉じる（進行中の呼び出しは中断され、承認待ちはキャンセルされる）。`approvalTimeoutMs` のデフォルトは、`createMcpServer` と同じく 50 000 |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — 任意の MCP サーバーのツールを、`ToolDefinition` として返す |

`GovernedToolHost` は、サーバーが SDK に求めるもの（`listTools`、`defineTool`、`executeTool`、`traceResourceRead`）です。`createSDK()` が返すオブジェクトは、これを実装しています。

## 構成要素 {#building-blocks}

SDK の構成要素は、独自のセットアップ向けにエクスポートされています。`JevClient`、`DecisionService`、`LLMThoughtGenerator`、`HeuristicController`、`TypedDecisionController`、`TypedHypothesisAssessor`、`PredictionTester`、`applyThought`、`assembleThought`、`assessReadiness`、`rankHypotheses`、`rebuildMentalState`、`describeMentalState`、`fingerprint`、`defineThinkerProfile`、`refineProfile`、`withRetry`、`RetryingLLMProvider`、`OpenAIProvider`、`AnthropicProvider`、`FallbackProvider`、`MonitoredEventStore`、`ObservedEventStore`、`EmailIncidentNotifier`、`WebhookIncidentNotifier`、`ResendEmailTransport`、`computeRunCost`、`FileEventStore`、`SQLiteEventStore`、`PostgreSQLEventStore`、そしてそれらの主な型です。
