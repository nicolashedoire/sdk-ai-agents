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
| `includeStreamUsage` | OpenAI 自身の API では有効 | `true`：ストリーミングされた回答に使用量を要求し（`stream_options`）、その費用が数えられる。`false`：要求しない。デフォルトでは `https://api.openai.com/v1` と、`https://eu.api.openai.com/v1` などのリージョンのホスト（`baseURL` または `OPENAI_BASE_URL` から判断）で有効になる。互換サーバーはこのフィールドを拒否する（その場合、リクエストはこのフィールドなしで再送される。ただし、このフィールドを受け付ける OpenAI 自身の API には再送しない）か、無視することがあり、使用量のないストリーミングの呼び出しは未計測として扱われるためである。使用量を報告する互換サーバー（Azure OpenAI の v1 API は報告する）で費用予算を使う場合は `true` にする |
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

## 研究 {#studies}

研究は研究者です。対象を理解し、今日の知識と技術でそれをどう設計し直すかを提案し、どれを選ぶかを決める実験を設計します。[研究](../guide/studies) を参照してください。

| メソッド | 戻り値 | |
| --- | --- | --- |
| `createStudy(config)` | `Study` | 設定をチェックし、情報源を解決し、憲章を凍結する。設定が不正な場合や、情報源が定義済みのツールでない、またはテキストのクエリを受け取らない場合は `ValidationError` を投げる |

### `StudyConfig` {#studyconfig}

| オプション | デフォルト | |
| --- | --- | --- |
| `name`、`object`、`objective` | — | 必須で、空であってはならない。`name` は研究のイベントとともに記録される（`metadata.studyName`）。目的は決して変わらない：新しい目的は新しい研究である |
| `question` | 手法の指針となる問いと能力の狙い（`language` で書かれる） | 指針となる問い |
| `needs`、`leads`、`analogues` | `[]` | 今日のニーズと基準。あなたの手がかり（検証すべき例で、それぞれに判定が下される）。分解すべき組み立てによるブレークスルー（`['Bitcoin']`） |
| `scope` | `{ exclude: [] }` | 範囲外のもの |
| `capability` | — | 目指す新しい能力。指定しなければ、研究が候補を提案する |
| `sources` | `[]` | 研究が検索に使う SDK のツールの名前。研究より前に定義しておく（たとえば `connectMcpServer` のツール）。情報源がなければ、何も確立できない |
| `model` | プロバイダーのデフォルト | すべての呼び出しのモデル |
| `llmProvider` | SDK のプロバイダー | この研究のためのプロバイダー |
| `language` | `'en'` | テキストと調査書の言語。言語タグで指定する（`fr`、`pt-BR`…） |
| `limits` | [`StudyLimits`](#studylimits) を参照 | 省略した制限はデフォルトのまま |
| `driftThreshold` | `1/3`（`DEFAULT_DRIFT_THRESHOLD`） | 工程の項目のうち、その工程が一度やり直される前に拒否されてよい割合（0 から 1） |
| `temperature`、`maxTokens` | `0.4`、— | 工程と検索の依頼の設定。監視役、追加指示、先行技術のチェックは 0 で動く |

憲章（`StudyCharter`）は `object`、`question`、`objective`、`needs`、`leads`、`scope`、`capability`、`analogues` を保持し、リストの中で重複する項目（大文字・小文字の違いは無視）は取り除かれます。憲章は凍結され、ハッシュ化されます。`name` は憲章に含まれません。

### `StudyLimits` {#studylimits}

実行ごとの制限です。`DEFAULT_STUDY_LIMITS` がデフォルト値を保持し、範囲外の値は `ValidationError` を投げます。

| 制限 | デフォルト | 範囲 | |
| --- | --- | --- | --- |
| `maxModelCalls` | 60 | 1 から 10 000 | モデル呼び出し（修復とチェックを含む）。達すると実行が止まる（`stoppedBy: 'maxModelCalls'`） |
| `maxSearches` | 20 | 0 から 10 000 | 検索。使い切ると、実行は検索せずに続く（注意事項 `searchesSkipped`） |
| `maxLoops` | 1 | 0 から 10 | 実行が差し戻せる、前の工程の数 |
| `timeoutMs` | 1 200 000（20 分） | 1 から 2 147 483 647 | 実行の長さ。達すると実行は中断される（`stoppedBy: 'timeoutMs'`） |
| `maxResultsPerSearch` | 5 | 1 から 50 | 1 回の検索から保持する結果の数 |

### `Study` {#study}

| メンバー | |
| --- | --- |
| `id` | `study_…`。研究ごとに新しくなる。そのイベントの `metadata.agentId` であり、その予算、ポリシー、ツール呼び出しのエージェント ID |
| `name`、`language`、`charter`、`charterHash` | 名前、言語、凍結された `StudyCharter`、その SHA-256（16 進数）。ハッシュは `study.started` と各追加指示に記録される |
| `amendments` | `StudyAmendment[]`：受け入れられたものと拒否されたもの、順番どおり |
| `run({ signal?, onEvent?, restart? })` | `Promise<StudyResult>`。最後の実行が止まったところから再開する：まず監視役がその実行が判定しないまま残したものを判定し、判定済みだが終わっていない工程は仕上げだけを行い、その後、完了していない工程が実行される。`restart` は研究を最初から始め直す：工程、結果、検索、逸脱ログ、番号付け、実行が消去され、憲章と追加指示は残る。制限、ポリシー、キャンセル、エラーは、その状態と行われたことのレポートとともに実行を終わらせる。例外を投げるのは、すでに実行が進行中の場合、処理できない `onEvent` の場合、イベントストアが失敗した場合だけ。`onEvent` は `agent.run` と同じように働く |
| `amend(text, { signal?, timeoutMs? })` | `Promise<StudyAmendment>`。それ以前の追加指示には決して照らさず（互いに矛盾する 2 つの追加指示がどちらも受け入れられることがある）、憲章だけに照らして、求められた順に 1 つずつ、予算のポリシーがまず確認される専用の実行（`mode: 'study-amendment'`）の中で分類される。受け入れられるのは `refines` だけで、それ以降のすべてのプロンプトに示される。`timeoutMs`（デフォルトは 60 000。その追加指示の順番が来たときから数える）と `signal` が分類に上限を設ける：それらを過ぎたとき、またはポリシーが分類を拒否したとき、追加指示は `unclassified` として拒否される。空のテキスト、`MAX_AMENDMENT_LENGTH`（500 文字）より長いテキスト、または順番が来たときにすでに `MAX_AMENDMENTS`（10）の追加指示が受け入れられている場合は `ValidationError` を投げる |
| `recordResult(cardId, { result, error?, conclusion? })` | `Promise<MechanismCard>`。カードのフィールド 10 と 11 を埋め、そのカードを書いた実行に `study.result_recorded` を記録する。未知のカードや空の `result` には `ValidationError` |
| `report()` | `StudyReport`：現時点のレポート。最後の実行以降に記録された結果も含む |

研究は `sdk.createStudy` で作成します。`Study` クラスはその型のためにエクスポートされており、研究を組み立てる材料は内部のものです。`MAX_AMENDMENTS` と `MAX_AMENDMENT_LENGTH` もエクスポートされており、`amend` のオプションの型である `StudyAmendOptions` も同様です。

### `StudyResult` {#studyresult}

`{ runId, status, stoppedBy?, error?, report, markdown }` — `status` は `completed`、制限または予算やタイムアウトのポリシーが実行を終わらせた場合は `stopped`（`stoppedBy` は `maxModelCalls`、`timeoutMs`、`policy` のいずれか）、エラーが終わらせた場合は `failed`、あるいは `cancelled` です。`error` は実行を終わらせた `Error`、`report` は終了時の `StudyReport`、`markdown` はそれを調査書にしたものです。

### `StudyReport` {#studyreport}

```ts
interface StudyReport {
  studyId: string;
  name: string;
  language: string;
  charter: StudyCharter;
  charterHash: string;
  amendments: StudyAmendment[];
  status: StudyStatus | 'notRun';
  stoppedBy?: StudyStopReason;
  error?: string;
  notices: StudyNotice[];                       // { code, message, details? }
  passages: StudyPassageState[];                // { passage, state, attempts, reopenedBy, runId? }
  observations: StudyObservation[];             // O1…
  pieces: StudyPiece[];                         // P1…
  chain: StudyChainStage[];                     // C1…
  threeStates: StudyPieceStates[];              // { piece, atItsTime, currentBest, proposal }
  historicalChoices: StudyHistoricalChoice[];   // H1…
  advances: StudyAdvance[];                     // V1…
  leadVerdicts: StudyLeadVerdict[];             // L1…
  unverifiedLeads: string[];
  independentLeads: StudyIndependentLead[];     // I1…
  references: StudyReference[];                 // R1…
  analogues: StudyAnalogue[];                   // B1…
  undeconstructedAnalogues: string[];
  constraints: StudyConstraint[];               // K1…
  revisableDecisions: StudyRevisableDecision[]; // D1…
  combinations: StudyCombination[];             // X1…
  capabilities: StudyCapability[];              // Y1…
  architectures: StudyArchitecture[];           // A1…: new capabilities, existing ones, improvements
  noveltyClaims: StudyNoveltyClaim[];           // N1…
  experiments: StudyExperiment[];               // E1…
  cards: MechanismCard[];                       // M1…
  results: StudySearchResult[];                 // S1…
  searches: StudySearch[];
  driftLog: StudyDriftEntry[];
  stats: StudyStats;
  runIds: string[];                             // runs of run() since the last restart, oldest first
}

interface StudyClaim {
  id: string;
  passage: StudyPassage;
  statement: string;
  status: 'established' | 'hypothesis' | 'novelty'; // after the study's checks
  declaredStatus?: StudyClaimStatus;                // the model's, when the study changed it
  statusReason?: StudyReason;
  sources: string[];                                // results listed in the prompt that wrote it
  unlistedSources?: string[];                       // cited, not listed in that prompt: they support nothing
  servesObjective: string;
  toVerify?: boolean;                               // prior art not assessed: a novelty, or a capability's assembly
  priorArtReason?: StudyReason;                     // a capability that is not a novelty: why not checked, or assemblyExists
  priorArt?: { closest: string; sources: string[]; verdict: 'novel' | 'partlyNovel' | 'exists' };
  unchecked?: boolean;                              // not judged by the guardian: kept out of later prompts
  runId: string;
}

interface StudyReason {
  code: StudyReasonCode;
  params?: Record<string, string>;
  message: string;                                  // the same reason, in English
}

interface StudyTrace {
  from: string[];                                   // records of the investigation it comes from
  unknownFrom?: string[];                           // cited, not listed in the design's prompt
  untraced?: boolean;                               // it cites none of the listed records
}
```

レポートのすべての理由は `StudyReason` です。主張と構成要素の `statusReason`、新規性ではない能力の `priorArtReason`、逸脱のエントリーと追加指示の `reason`、格下げされたアーキテクチャの `kindReason` がそうです。調査書はその `code` を研究の言語で表示します（`studyLabels(language).reasons`）。監視役やモデルが書いたテキストはコード `judged` を持ち、`params.text` に入ります。コード（`StudyReasonCode`）は次のとおりです。

| コード | 理由 |
| --- | --- |
| `noSourceConfigured`、`citesUnlisted`、`citesNothing` | `hypothesis` に引き下げられた `established` の主張または構成要素：情報源がない、またはそのプロンプトに一覧された ID を引用していない |
| `priorArtNotSearchedYet`、`priorArtNoSource`、`priorArtSearchBudget`、`priorArtNotSearched`、`priorArtSearchFailed`、`priorArtNoResult`、`priorArtNotAssessed`、`priorArtUnsupported` | 新規性の先行技術、または能力の組み立ての先行技術が、まだ確認すべきものである理由（その英語のテキストは「To verify against prior art:」で始まる） |
| `priorArtExists` | `hypothesis` に引き下げられた新規性：最も近い成果がすでにそれを実現している |
| `assemblyExists` | 新規性ではなく、組み立てがすでに存在する能力（その `priorArtReason` に入る） |
| `componentDocumented`、`componentUndocumented` | 新しいものとして示された構成要素 |
| `noServesObjective`、`invalidItem`、`notAnObject`、`notAUserLead` | スキーマに拒否された項目 |
| `leadAlreadyJudged` | すでに判定された手がかりにもう一度下された判定：捨てられるが、逸脱ではない（`study.passage_completed` の `duplicates`） |
| `designWithoutCapability` | 新しい能力を 1 つも含まない設計 |
| `amendmentUnclassified`、`amendmentCancelled`、`amendmentTimedOut`、`amendmentPolicy` | 分類できなかった追加指示 |
| `judged` | 監視役またはモデル自身の言葉 |

すべての項目は、それぞれ独自のフィールドを持つ `StudyClaim` です。

| 型 | 独自のフィールド |
| --- | --- |
| `StudyObservation` | `kind`（`behaviour`、`use`、`variation`、`failure`）、`conditions`、`era?` |
| `StudyPiece` | `name`、`function`、`inputs`、`outputs`、`relations`、`unknowns`、`parent?`（その部品が詳しく述べる部品） |
| `StudyChainStage` | `stage`、`pieces` |
| `StudyHistoricalChoice` | `choice`、`piece?`、`factors`（`hardware`、`tools`、`uses`、`knowledge`、`costs`、`compatibility`、`other`）、`era?` |
| `StudyAdvance` | `mechanism`、`date?`、`domain`（`object` または `other`）、`field?`、`evidence`、`conditions`、`availability`、`piece?` |
| `StudyLeadVerdict` | `lead`（憲章に書かれたとおり）、`verdict`（`relevant`、`partlyRelevant`、`notRelevant`）、`reasons` |
| `StudyIndependentLead` | `tool`、`kind`（`mathematical`、`technical`、`other`）、`piece?` |
| `StudyReference` | `name`、`piece?`、`date?` |
| `StudyAnalogue` | `breakthrough`、`named?`（それが分解する、憲章のブレークスルーの番号）、`domain?`、`date?`、`components`（2 つ以上の `{ name, date? }`）、`liftedConstraint`、`capability`、`pattern` |
| `StudyConstraint` | `constraint`、`state`（`remains`、`weakened`、`newRequirement`）、`piece?` |
| `StudyRevisableDecision` | `decision`、`because`（変わった条件）、`opens` |
| `StudyCombination` | `a`、`b`、`enables`（A によって B が何をできるようになるか）、`exchange`、`cost`、`changes`（`representation`、`distribution`、`responsibilities`、`trust`、`verification`、`other`） |
| `StudyCapability` | `capability`、`forWhom`、`hardToday`、`principle?` |
| `StudyArchitecture` | `name`、`kind`（`capability` または `improvement`）、`declaredKind?` と `kindReason?`（より速い、あるいは安いだけだと監視役が判断した能力）、`capability`（`what`、`forWhom`、`liftedConstraint`）、`principleChange?`（`principle`：`representation`、`distribution`、`responsibility`、`trust`、`verification`、`other` のいずれか。`change`）、`mechanism`、`components`（`StudyComponent[]`：`name`、`statement`、`date?`、`status`、`declaredStatus?`、`statusReason?`、`sources`、`unlistedSources?`、そして `StudyTrace`）、`assembly`（`component`、`gives`、`exchanges`、`cost`、そして `StudyTrace`）、`conditions`、`benefit`、`addedCost`、`counterexample`、`chain`（`stage`、`how`）、`uncoveredStages`（連鎖全体のうち、そのアーキテクチャが扱わない段階。研究がチェックしたもの）、`predictions` |
| `StudyThreeState` | `piece`、`state`（`atItsTime`、`currentBest`、`proposal`）、`architecture?` |
| `StudyNoveltyClaim` | `architecture?` |
| `StudyExperiment` | `name`、`architectures`、`protocol`、`measures`、`criteria`、`expected`（`architecture`、`result`）、`wholeChain` |
| `MechanismCard` | フィールド 1 から 9：`observation`、`mechanism`、`unknown`、`historicalChoice`、`evolution`、`newPossibility`、`proposedCombination`、`prediction`、`experiment`。あなたが記録した後のフィールド 10 と 11：`resultAndError?`（`result`、`error?`）、`conclusionAndMemory?`、そして `resultRecordedAt?` |

レポートのそのほかの項目は主張ではありません。

| 型 | フィールド |
| --- | --- |
| `StudyAmendment` | `number?`（受け入れられたものだけ。1 から）、`text`、`verdict`（`refines`、`conflicts`、`changesObjective`、`unclassified`）、`accepted`、`reason`（`StudyReason`）、`runId` |
| `StudyDriftEntry` | `passage`、`collection`、`item`（`id?`、`statement?`、`servesObjective?`）、`reason`（`StudyReason`）、`by`（`guardian`：目的から外れている。`schema`：その前に拒否された。たとえば `servesObjective` がない）、`attempt`（やり直しでは 2）、`runId` |
| `StudySearchResult` | `id`（`S1`…。同じ結果が再び見つかっても、リスタートまでは保たれる）、`title`、`locator`（URL またはその他の所在情報）、`date?`、`excerpt`、`tool`、`query`、`runId` |
| `StudySearch` | `passage`、`purpose`（`research` または `priorArt`）、`tool`、`query`、`servesObjective`、`claims?`、`resultIds`、`error?`、`throttled?`（制限によって失敗した）、`retry?`（制限された先行技術の検索の 2 回目の試行）、`skipped?`（`maxSearches`）、`runId` |
| `StudyPassageState` | `passage`、`state`（`complete`。`partial`：判定済みだが終わっていない。ループを待っているか、先行技術の検索が途中で打ち切られた。`unchecked`：監視役が判定していない項目がある。`notRun`）、`attempts`（やり直しの後は 2）、`keptAttempt?` と `discarded?`（`attempt`、`items`：より良い最初の試行のために破棄されたやり直し）、`reopenedBy`、`runId?` |
| `StudyNotice` | `code`（`noSources`、`stopped`、`failed`、`cancelled`、`passagesNotRun`、`uncheckedItems`、`searchesSkipped`、`leadsNotVerified`、`analoguesNotDeconstructed`、`noDesign`、`noCapability`、`minimumsNotMet`、`untracedAssembly`、`passagesOutdated`、`capabilitiesToVerify`、`capabilitiesExist`、`noveltiesToVerify`）、`params?`（`limit`、`error`、`count`）、`details?`（対象となる工程、`passage.collection` の組、手がかり、ブレークスルー、またはアーキテクチャ）、`message`（英語。調査書はコードを自分の言語で表示する） |
| `StudyStats` | 最後のリスタート以降：`runs` と `modelCalls`（`run()` の実行と、その中でベンダーが応答した呼び出し）、`searches`、`searchesSkipped`、`results`、`items`、`rejected`、`byStatus`（状態ごと）、`downgraded`（研究が状態を引き下げた主張）、`noveltiesToVerify`、`redos`、`loops`。そして `amendments`（`count`、`modelCalls`）：研究のすべての追加指示で、別に数えられる |

### `renderStudyMarkdown(report)` {#renderstudymarkdown-report}

レポートを、レポートの言語で書かれた読みやすい Markdown の調査書として返します。これは `StudyResult` の `markdown` と同じものです。それ以降に記録された結果を含めるには、`study.report()` に対して呼び出してください。その文言は `studyLabels(language)`（`StudyLabels`）から取られ、このドキュメントの 11 の言語で用意されています（`StudyLabelLanguage`）。それ以外の言語や未知の言語では英語の文言になり、`fr-CA` ではフランス語の文言になります。

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
  unmeteredTokens?: number;
  costUsd?: number;
}
```

| フィールド | |
| --- | --- |
| `totalUsd` | コストのわかっている呼び出しのコスト。`complete` が `false` のときは下限にすぎない |
| `complete` | 一部の呼び出しのコストが不明な場合、つまり `unpricedCalls` または `unmeteredCalls` が 0 より大きい場合は `false` |
| `unpricedModels`、`unpricedCalls` | `pricing` に価格のないモデルと、そのうちトークン数を報告した呼び出し |
| `unmeteredModels`、`unmeteredCalls` | 入力トークン数と出力トークン数の両方は報告しなかった呼び出しのモデルと、その呼び出し |
| `lines` | モデル、要求されたモデル、発生源ごとに 1 行。呼び出し回数、計測された呼び出しのトークン数、該当する場合は `unmeteredCalls`、それらの呼び出しのトークン数である `unmeteredTokens`、モデルに価格があり、その行のいずれかの呼び出しが計測されている場合は `costUsd`。モデル名を記録しなかった呼び出しの `model` は `(unknown)` |

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

実行は **イベントの意味で** 比較され、イベントの id では決して比較されません（id は実行ごとに新しくなります）。イベントは順番に対応づけられます。まず同一のイベント、次に種類と対象（ツール、操作、研究の工程、回答）が同じでデータが変わったイベント、最後に同じ対象で種類が変わったイベントです。比較しないもの：イベントの id、時刻、メタデータ、`incident.reported` イベント（通知の送信と抑制を記録するものです。インシデントを起こしたイベントは比較されます）、そして SDK が書き込み、実行ごとに変わる値（ツール呼び出しの所要時間、トークン使用量、リトライ前の待ち時間、承認の id、リプレイ元の実行、観察の時刻と元のイベント）。モデルがツール呼び出しの横に書くテキストは `intention.generated` の中でだけ比較されます。ツールのパラメーター、結果、入力は、キーの名前にかかわらず常に比較されます。30 から 60 に変わった `duration` 引数は変更です。同じことをもう一度行う実行は合格します。別の引数で呼ばれたツールは、呼び出しが起きた位置で報告されます（`parameters.metric: "churn" → "revenue"`）。同一の呼び出しの前に挿入された呼び出しは、追加された 1 つの呼び出しです。`action.executed` が `action.failed` になった場合は、消失と追加ではなく 1 つの変更です。

| オプション | 対象 | |
| --- | --- | --- |
| `ignoreEventTypes`、`validateAspects`（`intentions`、`actions`、`tools`、`policies`） | 検証 | 比較するイベントを減らす |
| `tolerance.dataFields` | 検証 | 比較から外すデータのフィールドを、どの深さでも追加する |
| `tolerance.timestampMs`、`ignoreTimestampDiff` | 検証 | タイミングは `timestampMs` があるときだけ、各実行の開始からの時間で比較する |
| `compareStructureOnly` | 検証 | データの差分は `fail` ではなく `partial` になる。追加、削除、移動されたイベントや種類の変わったイベントは引き続き `fail` |
| `tolerance.ignoreEventTypes`、`tolerance.ignoreDataFields` | リグレッション | 比較するイベントを減らし、データのフィールドを外す |
| `tolerance.criticalEventTypes` | リグレッション | 出現、消失、変更が重大とされる種類（デフォルト：`run.failed`、`action.failed`、`tool.failed`、`policy.violated`） |
| `tolerance.maxEventCountDiff` | リグレッション | この数までの、追加または削除された処理イベント（ポリシーのチェック、リトライ、承認）は許容する。結果の変更は決して許容しない |
| `tolerance.maxDurationDiff`、`severityThresholds` | リグレッション | 所要時間はどちらかがあるときだけチェックする。`maxDurationDiff` ms を超えて遅くなった実行はリグレッションとなり、到達した最も高いしきい値の重大度が付く。速くなった実行は決してリグレッションにならない |

### リグレッションスイート {#regression-suites}

| メソッド | 戻り値 | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | `regressionTestSuitesDir` に保存される。`agent`：この SDK のエージェントの id または名前。各ゴールデントレースは存在している必要がある。`input` のデフォルトは、基準の実行が受け取った入力。スイートは入力の `signal` とコールバック（`onEvent`、`onText`、`onTextRestart`）を保存しない |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | 新しいものから順に |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | エージェントのすべてのスイートを古い順に実行する。各テストは入力をエージェントに送り、その実行をゴールデントレースと比較する。`suites` にはスイートごとに 1 つの結果が入る |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | 1 つのスイートだけ |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode`：0 はすべてのテストが合格、1 はリグレッションを見つけたテストがある、2 は実行できなかったテストがある（エラーまたはタイムアウト）。オプションで `exitCode: false` にすると 0 になる |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | JUnit XML では、スイートごとに 1 つの `<testsuite>` がある。実行できなかったテスト（エラーまたはタイムアウト）は `<error>` になり、XML に含められない文字は取り除かれる |

エージェントの id はプロセスごとに新しくなるため、スイートはエージェントの **名前** も記録し、別のプロセスではその名前のエージェントで実行されます（そのエージェントが SDK にあれば、まずスイートのエージェント id を使います）。1 つの SDK の中では、エージェントの id はそのエージェントだけのものです。同じ名前の 2 つのエージェント（たとえば 2 つのバージョン）は、それぞれ自分のスイート、アサーション、ゴールデントレースを持ち、名前はそのすべてを指します。`createAgent` で作ったエージェントはすべて SDK に残るため、リクエストごとにエージェントを作るアプリケーションでは名前があいまいになります。id を渡すか、各エージェントを一度だけ作って再利用してください。以前のバージョンで保存されたスイートは名前を持たないため、作成したプロセスでしか実行できません。オプション：`parallel`（1 つのスイートのテストを同時に実行）、`stopOnFirstFailure`（逐次実行のときだけ。合格しなかった最初のテストのあとは、次のスイートも含めて何も実行しない）、`filterTags`、`excludeTags`、`timeout`（テストごとの ms、デフォルトは 60 000、最大 2 147 483 647。超えると実行はキャンセルされ、テストは `timeout` になる）、`detection`（上のリグレッションのオプション）。

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
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | ガバナンス付きエージェント（その名前、またはこの SDK のエージェントの id）の実行のうち、各バージョン（`version` または `configHash`）で記録されたものに対する `analyzeImpact`。その名前のエージェントはすべて対象になる。リプレイは除く。2 つのバージョンは異なり、異なる実行を選ぶ必要がある。未知のバージョンはエラーになり、記録されているバージョンが一覧される |

ガバナンス付きエージェントの実行のライフサイクルイベント（`run.started`、`run.completed` など）は、その `agentName`、`agentVersion`、`configHash` を記録します。同じ名前の 2 つのエージェントは、2 つのバージョンまたは 2 つのプロセスにある 1 つのエージェントです。ハッシュは、モデル、システムプロンプト、`maxSteps` と `timeout`、プロバイダーの設定、`version`、ケイパビリティ、ツール（名前、説明、バージョン、パラメーターのスキーマ、メタデータ、リトライの設定）、エージェント自身のポリシーとそのルールを対象にします。`setPolicy` と `addTools` で変わり、各実行は開始時のハッシュを記録します。以前のバージョンで記録された実行には id とバージョンしかありません。

### すべての実行にまたがるクエリ {#queries-across-runs}

| メソッド | 戻り値 |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>`：一致するイベント（時刻順、最大 `limit` 件）、範囲内のイベント数、一致したイベント数 |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

フィルターには **範囲**（`runId`、これがなければすべての実行、`since`、`until`）と **条件**（`type`、`agentId`、`userId`、`sessionId`、`dataFilters`（`{ path, operator, value?, regex? }`）、`metadataFilters`（`{ field, operator, value? }`））があります。条件は `logic`（デフォルトは `and`、`or` は少なくとも 1 つ）で組み合わされ、そのあと `not` で反転されます。範囲が反転されることはありません。組み込みのストアはどれでも答えます。ファイルストアはクエリごとに各実行のファイルを 1 回だけ読み、SQL のストアはデータベースに問い合わせます。すべての条件を満たす必要があるときは、データベース自身が種類と id でイベントを絞り込みます。`or` や `not` を使うと、ストアは範囲内のすべてのイベントを返し、条件はメモリー上でチェックされるため、大きなデータベースではコストが上がります。同じミリ秒のイベントは実行の中での順序を保ちます。実行は id 順、各実行の中では記録された順です。

## リアルタイムのイベント {#live-events}

リスナーは `(event: Event) => unknown` です。リスナーはイベントを、ストアが受け付けた後で、1 つずつ、各実行の順番どおりに受け取ります。リスナーが Promise を返すと、次のイベントの前にその Promise が待たれます。実行がリスナーを待つことは決してなく、リスナーのエラーは報告されるだけで、実行の中に投げられることはありません。リスナーを待てるイベントは最大 `maxQueued` 個（デフォルトは 10 000）です。それを超えると、新しいイベントはそのリスナーについては破棄され、`LiveEventsDroppedError` で報告されます。[リアルタイムの進捗](../guide/observability#live-progress) を参照してください。

| API | |
| --- | --- |
| `RunInput.onEvent`：`agent.run({ message, onEvent })` | 実行のすべてのイベント。`run()` は、リスナーがそのそれぞれの処理を終えた後に解決される。ただし、実行が停止またはキャンセルされたとき、または `signal` が中断されたときは、それより早く解決される（そのときリスナーの購読は解除される）。リスナーは記録されない |
| `ThinkInput.onEvent`：`agent.think({ problem, onEvent })` | 認知エージェントの実行について同じ。その `limits.timeoutMs` でも待機が終わる |
| `StudyRunOptions.onEvent`：`study.run({ onEvent })` | 研究の実行について同じ。その `limits.timeoutMs` でも待機が終わる |
| `replay(runId, modifications?, { onEvent })` | リプレイについて同じ。リプレイはキャンセルできないので、必ず待つ |
| `executeTool(name, params, { onEvent })` | 呼び出しのイベントと、そのツールが開始する実行のイベント（1 階層分まで）。ハンドラーはリスナーを `context.onEvent` として受け取り、`governedAgentTool` と `cognitiveAgentTool` はそれを自分のエージェントに渡す（リアルタイムのイベントに対応していないストアの上に手作業で組み立てたエージェントは、リスナーなしで動く）。`signal` で待機が終わる |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`：フィルターに一致するすべての実行のすべてのイベント（`agentId` は `metadata.agentId`）。返された関数を呼び出すまで続き、その関数を呼び出すと、まだ配信されていないイベントは破棄される。リグレッションスイートの実行とリプレイも実際の実行なので、そのイベントもリスナーに届く（スイートは入力の `onEvent` と `onText` を保存しない） |
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

どれも、すぐに使える `ToolDefinition` を返します。エージェントに渡す前に `sdk.defineTool` に通すか（エージェントが受け取るのは `Tool[]` です）、MCP サーバーの `tools` に直接渡してください。[ツール](../guide/tools) と [なんでも MCP サーバーにする](../guide/mcp-recipes) を参照してください。

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
| `webTools({ include?, prefix?, search?, circuitBreaker?, throttleWaitMs?, language?, userAgent?, timeoutMs?, callTimeoutMs?, maxResponseBytes?, maxRedirects?, hostIntervalMs?, robots?, allowPrivateNetwork?, lookup?, maxPdfBytes?, maxPdfPages?, cache?, retry?, arxiv?, wikipedia?, github? })` | `ToolDefinition[]` | `web_search`、`web_fetch`、`arxiv_search`、`wikipedia_search`、`github_search`。読み取り専用（`web_fetch` は中リスク、それ以外は低リスク）。検索結果は `{ id, title, url, date?, excerpt, source }`、ページは `{ url, finalUrl, title?, date?, language?, contentType, content, truncated, untrusted: true, hint? }`。`allowPrivateNetwork` を指定しない限り、公開インターネットの外のアドレスには接続しない。robots.txt を尊重し、各呼び出しは `callTimeoutMs`（60 秒）以内に収まる。[Web で調べる](../guide/web-research) を参照 |
| `duckDuckGo({ region?, minIntervalMs?, baseUrl? })` | `SearchProvider` | `web_search` のデフォルトのプロバイダーで、キーは不要：DuckDuckGo の HTML ページ。検索の間隔は、前の検索が終わってから 4 秒 |
| `searxng({ baseUrl, engines?, categories?, minIntervalMs? })` | `SearchProvider` | SearXNG インスタンスの JSON API。結果は `searxng:<engine>` という名前を持ち、`publishedDate` で日付が付く |
| `brave({ apiKey, baseUrl?, minIntervalMs? })`、`tavily(…)`、`serper(…)` | `SearchProvider` | Brave Search、Tavily、Serper の API。それぞれのキーを使う |
| `citableUrl(url)`、`normalizeUrl(url)` | `string \| undefined` | 検索結果が引用されるときの URL（トラッキング用のパラメーターとフラグメントを取り除く）と、その id と重複の判定に使われる URL（さらにホストを小文字にし、末尾のスラッシュを取り除く）。http(s) 以外には `undefined` |
| `isPublicAddress(address)` | `boolean` | IP アドレスが公開インターネット上にあるかどうか（`allowPrivateNetwork` の背後にあるチェック） |

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

`web_search` はプロバイダーに順番に問い合わせます。例外を投げたプロバイダーは次のプロバイダーに引き継ぎます。`SearchThrottledError`（`retryAfterMs?`：求めた待ち時間）を投げたか、HTTP 429 を返したプロバイダーは、その待ち時間または `throttleWaitMs`（10 秒）だけ待った後に、もう一度だけ試されます。ただし、呼び出しの期限にその余裕があるときに限り、30 秒を超える待ち時間を求めたときは試されません。それでも制限されている（または 3 回続けて失敗した）プロバイダーは、`circuitBreaker.cooldownMs`（2 分）のあいだ、または求めた待ち時間のほうが長ければそのあいだ飛ばされます。あるホストへのリクエストは、プロセス全体で一度に 1 つずつ送られ、それぞれ前のリクエストが終わってから `minIntervalMs` 後に送られます（DuckDuckGo はデフォルトで 4 秒）。Web ツールは、意図的に拒否したものには `WebRequestRefusedError`（`reason`：`private-address`、`scheme`、`downgrade`、`redirects`、`robots`、`content-type`、`too-large`、`unreadable`、`pacing`）を、2xx 以外の応答には `WebHttpError`（`status`）を、タイムアウトには `WebTimeoutError`（リクエスト、呼び出しの期限、または抽出の時間予算）を、準備の不足には `WebConfigurationError`（`unpdf`、GitHub のトークン）を、どのプロバイダーも答えなかったときには `SearchUnavailableError`（`failures`。すべてが制限されていたときは `throttled`、飛ばされたプロバイダーがいつ再び試されるかは `retryAfterMs?`）を投げます。`retry` は、拒否、準備の不足、どのプロバイダーも答えなかった検索、制限（HTTP 429、`SearchThrottledError`）を決してリトライしません。

```ts
interface SearchProvider {
  readonly name: string;
  /** The origin of a baseUrl you gave it: its requests there may reach a private network. */
  readonly configuredOrigin?: string;
  /** Send every request through `web`: timeouts, byte caps, pacing and address checks. */
  search(request: SearchRequest, web: WebClient): Promise<SearchHit[]>;
}

interface SearchRequest {
  query: string;
  maxResults: number;
  site?: string;
  freshness?: 'day' | 'week' | 'month' | 'year';
  language?: string;
  signal?: AbortSignal;
}

interface SearchHit { title: string; url: string; excerpt: string; date?: string; source?: string }

interface WebClient {
  request(url: string, init?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    minIntervalMs?: number;
    signal?: AbortSignal;
    maxBytes?: number;
  }): Promise<{ status: number; url: string; headers: Record<string, string>; body: Buffer; truncated: boolean }>;
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
