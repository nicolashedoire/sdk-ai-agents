# SDK API

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| विकल्प | टाइप | विवरण |
| --- | --- | --- |
| `apiKey` | `string` | मुख्य प्रदाता की key (`llmProvider` के साथ ज़रूरी नहीं)। बिना किसी key के, टूल और MCP सर्वर काम करते हैं और जिन कॉल को मॉडल चाहिए वे एक साफ़ error के साथ विफल होती हैं |
| `provider` | `'openai' \| 'anthropic'` | मुख्य प्रदाता, डिफ़ॉल्ट `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | हर vendor की `apiKey`, `defaultModel` और `baseURL` (`baseURL`: कोई संगत endpoint, जैसे Azure OpenAI की v1 API या लोकल मॉडल सर्वर, या कोई proxy)। मुख्य प्रदाता अपने vendor की entry इस्तेमाल करता है, और दूसरे vendor का फ़ॉलबैक अपने vendor की |
| `fallbackProviders` | `Array<{ provider, config? }>` | मुख्य प्रदाता के विफल होने पर क्रम से आज़माए जाते हैं; `config`, `providerConfig` से ऊपर होता है। मुख्य प्रदाता के ही vendor का फ़ॉलबैक उसकी कोई सेटिंग नहीं लेता (सिर्फ़ global `apiKey`); दूसरे vendor के फ़ॉलबैक को अपनी key चाहिए |
| `llmProvider` | `LLMProvider` | आपका अपना प्रदाता (लोकल मॉडल, gateway, टेस्ट के लिए नकली प्रदाता)। अगर वह `nativeToolMessages` घोषित करे तो टूल कॉल और उनके नतीजे native format (`LLMMessage`) में पाता है, वरना text के रूप में |
| `retry` | `Partial<RetryPolicy> \| false` | LLM की retry नीति, हर प्रदाता के लिए, फ़ॉलबैक से पहले। इसके `maxRetries` और `initialDelayMs`, `jev.maxRetries` और `jev.retryBaseDelayMs` के डिफ़ॉल्ट भी हैं; इसके बाकी फ़ील्ड Jev क्लाइंट तक नहीं पहुँचते, और `retry: false` होने पर Jev क्लाइंट अपनी 2 retries और 500 ms रखता है। जोड़े गए `llmProvider` पर केवल तब लागू होती है जब इसे स्पष्ट रूप से सेट किया जाए, और `llmProvider` के रूप में दिए गए `FallbackProvider` या उसके प्रदाताओं पर कभी नहीं |
| `jev` | `JevClientConfig` | टाइप्ड निर्णयों के लिए TypeSafe Jev चालू करता है — सीधे, या `baseUrl` और `model: 'typesafe-ai/jev'` के साथ [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) के ज़रिए |
| `decisionClient` | `TypedDecisionClient` | कोई भी टाइप्ड-निर्णय backend (`jev` पर प्राथमिकता रखता है) |
| `pricing` | `PricingTable` | USD प्रति मिलियन tokens, डिफ़ॉल्ट के ऊपर मिलाया जाता है |
| `incidents` | `IncidentMonitorOptions` | Notifiers, नियम, गंभीरता का सीमा-मान, throttling |
| `eventStore` | `IEventStore` | डिफ़ॉल्ट `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | ग्लोबल नीतियाँ |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | टेस्टिंग से बनी चीज़ों का भंडारण |

## एजेंट {#agents}

| Method | लौटाता है | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | नियंत्रित एजेंट: `run({ message, context?, signal? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`। यह सिर्फ़ अपने टूल (`tools`, `capabilities`) चला सकता है, भले ही मॉडल SDK में रजिस्टर किसी दूसरे टूल का नाम ले; `signal` run को रद्द करता है |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()` |
| `defineTool(definition)` | `Tool` | एक टूल रजिस्टर करता है; handler का टाइप उसके Zod स्कीमा से निकलता है |
| `defineCapability(definition)` | `Capability` | टूल को समूह में रखता है |
| `listTools()` | `Tool[]` | हर रजिस्टर किया गया टूल |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs? })` | `Promise<unknown>` | एजेंट के बाहर नियंत्रित execution (MCP सर्वर इसका इस्तेमाल करता है): arguments, नीतियाँ, मंज़ूरी, बजट (कॉल शुरू होते ही गिना जाता है), फिर टूल। `signal` लंबित मंज़ूरी रद्द करता है और handler तक पहुँचता है; `approvalTimeoutMs` ऐसी मंज़ूरी रद्द करता है जिस पर किसी ने निर्णय नहीं लिया |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | `read()` को उसके अपने run के रूप में चलाता है: `run.started`, `resource.read` (URI, आकार, SHA-256), `run.completed` या `run.failed` |
| `stopRun(runId)` | `Promise<void>` | किसी नियंत्रित या संज्ञानात्मक run को रोकता है |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| विकल्प | डिफ़ॉल्ट | |
| --- | --- | --- |
| `name`, `model` | — | ज़रूरी |
| `profile` | `DEFAULT_THINKER_PROFILE` | एजेंट कैसे तर्क करता है |
| `tools`, `policies` | `[]` | हर जगह की तरह नियंत्रित |
| `systemPrompt` | — | हर prompt के लिए अतिरिक्त निर्देश |
| `limits` | देखें [संज्ञानात्मक एजेंट](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` या एक `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0.35), `readinessThreshold` (0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `compare` ऑपरेशन के लिए `'llm'`, `'typed'` या आपका अपना `HypothesisAssessor` |
| `knowledge` | — | runs के बीच स्मृति: `{ store, scope, recallLimit? (10), record? (true) }`, देखें [runs के बीच स्मृति](../guide/memory) |
| `evaluator` | — | पूर्वानुमानों को परखने वाला एक `OutcomeEvaluator`; `test_prediction` चालू करता है |
| `generator` | `model` पर LLM जनरेटर | आपका अपना `ThoughtGenerator` (अवलोकनों की तुलना सहित); इसके विचार फिर भी इंजन के प्रवेश-नियमों से होकर गुज़रते हैं |
| `temperature`, `maxTokens` | `0.4`, — | विचार बनाने की सेटिंग |
| `providerSettings` | — | टूल के चुनाव की सेटिंग (मूल तर्क इंजन) |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` — `status` होता है `completed`, `failed` या `cancelled`; `decision.status` होता है `committed`, `provisional` या `abstain`, और `decision.missing` उन बातों की सूची देता है जो स्थापित नहीं हुईं; `state` अंतिम `MentalState` है।

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

देखें [साक्ष्य और सत्यापन](../guide/evidence-and-verification)।

## तर्क और प्रोफ़ाइल {#reasoning-profiles}

| Method | लौटाता है |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — इवेंट्स से दोबारा बनाई गई |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines |

## टाइप्ड निर्णय — `sdk.decisions` {#typed-decisions-—-sdk-decisions}

कोई backend कॉन्फ़िगर न होने पर `ValidationError` फेंकता है।

| Method | लौटाता है |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage, runId }` — उत्तरों का टाइप सवालों से निकलता है |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

सवाल बनाने वाले helpers: `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`।

## संचालन {#operations}

| Method | लौटाता है |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | इंसानी मंज़ूरियाँ |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | बजट और नीतियों का ऑडिट |

## ट्रेस, रीप्ले और टेस्टिंग {#traces-replay-and-testing}

| Method | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | runs पढ़ें |
| `replay(runId, modifications?)` | LLM के बिना दोबारा चलाएँ |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | निर्णयों को समझें |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | एजेंटों को कोड की तरह टेस्ट करें |

## टूल: `ToolDefinition` {#tools-tooldefinition}

| फ़ील्ड | |
| --- | --- |
| `name`, `description` | मॉडल क्या देखता है |
| `schema` | arguments का Zod स्कीमा; मेल न खाने वाली कॉल ठुकरा दी जाती हैं |
| `handler(params, context?)` | सत्यापित arguments और `{ runId, agentId, signal? }` पाता है — कॉल करने वाले के हार मानने पर `signal` abort हो जाता है |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — सिर्फ़ idempotent टूल; अमान्य arguments पर कभी दोबारा प्रयास नहीं होता |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true` हर कॉल को `approveAction` का इंतज़ार कराता है; `readOnly` MCP क्लाइंट को `readOnlyHint` के रूप में दिखाया जाता है |
| `inputJsonSchema` | `schema` से निकले JSON Schema की जगह दिखाया जाने वाला JSON Schema |
| `capability`, `version` | समूह, वर्ज़न |

## टूल स्रोत {#tool-sources}

हर एक पहले से तैयार `ToolDefinition` लौटाता है: इन्हें `sdk.defineTool` को, किसी एजेंट को, या सीधे किसी MCP सर्वर के `tools` को दें। देखें [किसी भी चीज़ के लिए MCP सर्वर](../guide/mcp-recipes)।

| फ़ंक्शन | लौटाता है | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | OpenAPI 3 विवरण के हर operation के लिए एक टूल; `include` में सूचीबद्ध न हो तो सिर्फ़ `GET`; दूसरे methods को डिफ़ॉल्ट रूप से मंज़ूरी चाहिए। एक कॉल `{ status, data, truncated? }` लौटाती है |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | एक फ़ोल्डर पर `list_files`, `read_file`, `search_files`, उसके बाहर कभी नहीं; बाहर रखा गया फ़ोल्डर अपने अंदर की हर चीज़ छिपा देता है |
| `folderResources(options)` | `ResourceProvider` | वही फ़ाइलें MCP रिसोर्स `folder://<name>/<path>` के रूप में |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query` (एक केवल-पढ़ने वाला statement, ज़्यादा से ज़्यादा `maxRows` पंक्तियाँ, डिफ़ॉल्ट 100) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | `node:sqlite` के `DatabaseSync` या `better-sqlite3` के लिए; क्वेरियों को `PRAGMA query_only = ON` के साथ चलाता है |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | `pg` के लिए (एक समर्पित client, या एक pool); हर क्वेरी `BEGIN READ ONLY` में (किसी transaction के भीतर पहले से मौजूद कनेक्शन पर ठुकराई जाती है) … `ROLLBACK` + `pg_advisory_unlock_all()`, `SET LOCAL statement_timeout` के साथ (डिफ़ॉल्ट 10 s); `schemas` सिर्फ़ सूची और विवरण को सीमित करता है |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`: `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`; कॉल करने वाले के साथ रद्द होता है; `exposeErrors` न हो तो `error` सामान्य रहता है |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | डेटाबेस adapters द्वारा इस्तेमाल की जाने वाली statement-जाँच (सिर्फ़ SQLite और PostgreSQL syntax) |

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

| फ़ंक्शन | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | MCP `Server` जो ठीक वही उपलब्ध कराता है जो `tools` में सूचीबद्ध है: परिभाषित टूल के नाम और/या `ToolDefinition` (आपके लिए SDK पर परिभाषित; वही परिभाषा दोबारा दी जा सकती है, पहले से लिए गए नाम वाला कोई दूसरा टूल ठुकरा दिया जाता है)। `resources`: एक या कई `ResourceProvider`; हर पढ़ना ट्रेस होता है। कॉल `mcp:<name>` (या `agentId`) के रूप में चलती हैं; जिस मंज़ूरी पर `approvalTimeoutMs` (डिफ़ॉल्ट 50 000 ms) के भीतर कोई निर्णय न ले, वह रद्द हो जाती है; इनपुट के इनकार क्लाइंट को समझाए जाते हैं, दूसरे कारण सिर्फ़ `exposeErrorDetails` के साथ |
| `serveMcpOverStdio(sdk, options)` | वही, stdin/stdout से जुड़ा; stderr पर एक "ready" लाइन लिखता है, और stdin खत्म होने पर बंद हो जाता है (चल रही कॉल abort हो जाती हैं, लंबित मंज़ूरियाँ रद्द)। `approvalTimeoutMs` का डिफ़ॉल्ट 50 000 है, `createMcpServer` की तरह |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — किसी भी MCP सर्वर के टूल, `ToolDefinition` के रूप में |

`GovernedToolHost` वह है जो सर्वर को SDK से चाहिए (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` ऐसा ऑब्जेक्ट लौटाता है जो इसे लागू करता है।

## बुनियादी घटक {#building-blocks}

SDK के बुनियादी घटक कस्टम सेटअप के लिए एक्सपोर्ट किए गए हैं: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, और उनके मुख्य टाइप।
