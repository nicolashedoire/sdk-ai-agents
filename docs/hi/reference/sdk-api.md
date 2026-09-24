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
| `providerConfig` | `{ openai?, anthropic? }` | हर vendor की `apiKey`, `defaultModel`, `baseURL` और `timeout` (`baseURL`: कोई संगत endpoint, जैसे Azure OpenAI की v1 API या लोकल मॉडल सर्वर, या कोई proxy; `timeout`: किसी जवाब का सबसे लंबा इंतज़ार, मिलीसेकंड में, डिफ़ॉल्ट रूप से 10 मिनट, और स्ट्रीम किए गए जवाब के लिए उसके दो इवेंट के बीच का सबसे लंबा इंतज़ार)। मुख्य प्रदाता अपने vendor की entry इस्तेमाल करता है, और दूसरे vendor का फ़ॉलबैक अपने vendor की। डिफ़ॉल्ट मॉडल: `gpt-5.4` और `claude-opus-5`। OpenAI की entry `reasoningModels`, `reasoningEffort`, `nativeToolMessages` और `includeStreamUsage` भी लेती है: देखें [OpenAI मॉडल](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | मुख्य प्रदाता के विफल होने पर क्रम से आज़माए जाते हैं; `config`, `providerConfig` से ऊपर होता है। मुख्य प्रदाता के ही vendor का फ़ॉलबैक उसकी कोई सेटिंग नहीं लेता (सिर्फ़ global `apiKey`); दूसरे vendor के फ़ॉलबैक को अपनी key चाहिए |
| `llmProvider` | `LLMProvider` | आपका अपना प्रदाता (लोकल मॉडल, gateway, टेस्ट के लिए नकली प्रदाता)। अगर वह `nativeToolMessages` घोषित करे तो टूल कॉल और उनके नतीजे native format (`LLMMessage`) में पाता है, वरना text के रूप में, और अपना text स्ट्रीम कर सकता है (देखें [`LLMProvider`](#llmprovider)) |
| `retry` | `Partial<RetryPolicy> \| false` | LLM की retry नीति, हर प्रदाता के लिए, फ़ॉलबैक से पहले। इसके `maxRetries` और `initialDelayMs`, `jev.maxRetries` और `jev.retryBaseDelayMs` के डिफ़ॉल्ट भी हैं; इसके बाकी फ़ील्ड Jev क्लाइंट तक नहीं पहुँचते, और `retry: false` होने पर Jev क्लाइंट अपनी 2 retries और 500 ms रखता है। जोड़े गए `llmProvider` पर केवल तब लागू होती है जब इसे स्पष्ट रूप से सेट किया जाए, और `llmProvider` के रूप में दिए गए `FallbackProvider` या उसके प्रदाताओं पर कभी नहीं |
| `jev` | `JevClientConfig` | टाइप्ड निर्णयों के लिए TypeSafe Jev चालू करता है — सीधे, या `baseUrl` और `model: 'typesafe-ai/jev'` के साथ [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) के ज़रिए |
| `decisionClient` | `TypedDecisionClient` | कोई भी टाइप्ड-निर्णय backend (`jev` पर प्राथमिकता रखता है) |
| `pricing` | `PricingTable` | USD प्रति मिलियन tokens, डिफ़ॉल्ट के ऊपर मिलाया जाता है |
| `incidents` | `IncidentMonitorOptions` | Notifiers, नियम, गंभीरता का सीमा-मान, throttling |
| `eventStore` | `IEventStore` | डिफ़ॉल्ट `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | ग्लोबल नीतियाँ |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | टेस्टिंग से बनी चीज़ों का भंडारण |

### OpenAI मॉडल {#openai-models}

OpenAI के reasoning मॉडल — o सीरीज़ (`o1`, `o3`, `o4-mini`…) और GPT-5 व उसके बाद के मॉडल (`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…), तारीख़ वाले या fine-tuned (`ft:o4-mini-…`) भी — `max_tokens` को ठुकरा देते हैं, और `temperature` को भी, जब तक उनका reasoning effort `none` न हो। OpenAI प्रदाता उन्हें नाम से पहचानता है, अक्षर छोटे हों या बड़े: वह उन्हें `maxTokens` को `max_completion_tokens` के रूप में भेजता है, जिसमें उनके reasoning tokens भी गिने जाते हैं, और साथ में reasoning effort भी। चूँकि डिफ़ॉल्ट effort हर मॉडल का अलग होता है, वह उन्हें temperature कभी नहीं भेजता: उनके लिए एजेंट या engine का temperature अनदेखा होता है। बाकी मॉडलों को `temperature` और `max_tokens` मिलते हैं, जिन्हें हर OpenAI-संगत सर्वर जानता है।

::: warning टूल और reasoning effort
SDK, OpenAI को Chat Completions के ज़रिए बुलाता है, जहाँ GPT-5.4 और उसके बाद के मॉडल सिर्फ़ effort `none` पर ही टूल बुलाते हैं। डिफ़ॉल्ट मॉडल `gpt-5.4` तब तक `none` इस्तेमाल करता है जब तक आप कोई दूसरा effort तय न करें। GPT-5.5, GPT-5.6 और GPT-6 Sol व Luna का डिफ़ॉल्ट `medium` है: जब तक आप `reasoningEffort: 'none'` तय न करें, टूल वाला एजेंट इन पर विफल होता है (`Function tools with reasoning_effort are not supported`)। GPT-6 Astra, Chat Completions से टूल बिल्कुल नहीं बुला सकता। SDK आपका तय किया effort बिना बदले भेजता है।
:::

| विकल्प | डिफ़ॉल्ट | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | उस request का मॉडल जो कोई मॉडल नहीं बताती, और उस फ़ॉलबैक का जो एजेंट का मॉडल सर्व नहीं करता |
| `reasoningModels` | नाम से पहचाना जाता है | `true` या `false`: इस प्रदाता के सभी मॉडल reasoning मॉडल हैं, या कोई भी नहीं है। एक सूची: ये नाम reasoning मॉडल हैं (Azure deployments, gateway aliases), बाकी नाम से पहचाने जाते हैं |
| `reasoningEffort` | मॉडल का अपना | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` या `max`, बिना बदले सिर्फ़ reasoning मॉडलों को भेजा जाता है। हर मॉडल इनमें से कुछ मान स्वीकार करता है, और API बाकी को ठुकरा देती है |
| `includeStreamUsage` | OpenAI की अपनी API पर | `true`: स्ट्रीम किए गए जवाब से उसका उपयोग माँगा जाता है (`stream_options`), ताकि उसकी लागत गिनी जाए; `false`: नहीं माँगा जाता। डिफ़ॉल्ट रूप से `https://api.openai.com/v1` पर और `https://eu.api.openai.com/v1` जैसे क्षेत्रीय hosts पर चालू (`baseURL` या `OPENAI_BASE_URL` से), क्योंकि कोई संगत सर्वर इस फ़ील्ड को ठुकरा सकता है (तब request इसके बिना दोबारा भेजी जाती है) या अनदेखा कर सकता है, और बिना उपयोग वाली स्ट्रीम की गई कॉल बिना माप वाली (unmetered) गिनी जाती है। लागत बजट के साथ ऐसे संगत सर्वर पर जो उपयोग बताता है (Azure OpenAI की v1 API बताती है), `true` सेट करें |
| `nativeToolMessages` | `true` | ऐसे संगत सर्वर के लिए `false` जो बातचीत में assistant के `tool_calls` और `tool` messages स्वीकार नहीं करता: तब पिछली टूल कॉल और उनके नतीजे text के रूप में भेजे जाते हैं, जबकि टूल अब भी पेश किए जाते हैं और जवाबों की टूल कॉल अब भी पढ़ी जाती हैं। मुख्य प्रदाता या किसी भी फ़ॉलबैक पर `false` पूरी chain पर लागू होता है |

ये विकल्प `providerConfig.openai` में या OpenAI फ़ॉलबैक के `config` में रखे जाते हैं। दूसरे vendor का फ़ॉलबैक हर वह विकल्प `providerConfig.openai` से लेता है जो उसका `config` तय नहीं करता; मुख्य प्रदाता के ही vendor का फ़ॉलबैक कोई विकल्प नहीं लेता। कोई एजेंट या run अपना effort `providerSettings.openai.reasoningEffort` में तय करता है: पहले run का मान चलता है, फिर एजेंट का, फिर प्रदाता का। संज्ञानात्मक एजेंट इसे सिर्फ़ टूल के चुनाव पर लागू करता है; उसके विचार, जो कोई टूल पेश नहीं करते, उसका `reasoningEffort` विकल्प लेते हैं।

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

आपका अपना प्रदाता `generateCompletion(request)`, `supportsModel(model)` और `getProviderName()` लागू करता है, और `nativeToolMessages` घोषित कर सकता है। अनुरोध के दो फ़ील्ड स्ट्रीमिंग से जुड़े हैं:

| `LLMRequest` फ़ील्ड | |
| --- | --- |
| `onTextDelta?(delta)` | तब सेट होता है जब कॉल करने वाले को text लिखे जाते समय ही चाहिए (`onText` वाला run)। text का हर टुकड़ा आते ही उसके साथ इसे कॉल करें, फिर हमेशा की तरह पूरा `LLMResponse` लौटाएँ: सारे टुकड़े जोड़ने पर उसका `content` बनना चाहिए। जो प्रदाता स्ट्रीम नहीं कर सकता वह इसे अनदेखा करता है, और SDK पूरा `content` एक ही टुकड़े में आगे भेजता है। इसे error नहीं फेंकनी चाहिए (SDK का अपना कभी नहीं फेंकता) |
| `onTextRestart?()` | इसे तब कॉल करें जब आप ऐसे प्रयास के बाद दोबारा प्रयास करें जो पहले ही text स्ट्रीम कर चुका था (आपका अपना retry): वह text रद्द हो जाता है, और अगले टुकड़े जवाब फिर से शुरू करते हैं। `RetryingLLMProvider` और `FallbackProvider` इसे उन प्रदाताओं की ओर से कॉल करते हैं जिन्हें वे लपेटते हैं |

## एजेंट {#agents}

| Method | लौटाता है | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | नियंत्रित एजेंट: `run({ message, context?, signal?, onText?, onTextRestart? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`, `version`, `configHash`। यह सिर्फ़ अपने टूल (`tools`, `capabilities`) चला सकता है, भले ही मॉडल SDK में रजिस्टर किसी दूसरे टूल का नाम ले; `signal` run को रद्द करता है; `onText` मॉडल का लिखा text लिखे जाते समय ही पाता है, और `onTextRestart` वह हिस्सा जिसे किसी विफल मॉडल कॉल के दोबारा आज़माए जाने पर हटाना है (देखें [जवाब स्ट्रीम करना](../guide/governed-agents#_7-streaming-the-answer)) |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()`। इसके विचार संरचित होते हैं और स्ट्रीम नहीं किए जाते |
| `defineTool(definition)` | `Tool` | एक टूल रजिस्टर करता है; handler का टाइप उसके Zod स्कीमा से निकलता है |
| `defineCapability(definition)` | `Capability` | टूल को समूह में रखता है |
| `listTools()` | `Tool[]` | हर रजिस्टर किया गया टूल |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | एजेंट के बाहर नियंत्रित execution (MCP सर्वर इसका इस्तेमाल करता है): arguments, नीतियाँ, मंज़ूरी, बजट (कॉल शुरू होते ही गिना जाता है), फिर टूल। `signal` लंबित मंज़ूरी रद्द करता है और handler तक पहुँचता है; `approvalTimeoutMs` ऐसी मंज़ूरी रद्द करता है जिस पर किसी ने निर्णय नहीं लिया |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | `read()` को उसके अपने run के रूप में चलाता है: `run.started`, `resource.read` (URI, आकार, SHA-256), `run.completed` या `run.failed` |
| `stopRun(runId)` | `Promise<void>` | किसी नियंत्रित या संज्ञानात्मक run को रोकता है |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| विकल्प | डिफ़ॉल्ट | |
| --- | --- | --- |
| `name`, `model` | — | ज़रूरी |
| `profile` | `DEFAULT_THINKER_PROFILE` | एजेंट कैसे तर्क करता है |
| `tools`, `policies` | `[]` | हर जगह की तरह नियंत्रित; बजट और timeout नीतियाँ हर कदम से पहले भी जाँची जाती हैं, देखें [सीमाएँ और नीतियाँ](../guide/cognitive-agents#limits-and-policies) |
| `systemPrompt` | — | हर prompt के लिए अतिरिक्त निर्देश |
| `limits` | देखें [संज्ञानात्मक एजेंट](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` या एक `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0.35), `readinessThreshold` (0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `compare` ऑपरेशन के लिए `'llm'`, `'typed'` या आपका अपना `HypothesisAssessor` |
| `knowledge` | — | runs के बीच स्मृति: `{ store, scope, recallLimit? (10), record? (true) }`, देखें [runs के बीच स्मृति](../guide/memory) |
| `evaluator` | — | पूर्वानुमानों को परखने वाला एक `OutcomeEvaluator`; `test_prediction` चालू करता है |
| `generator` | `model` पर LLM जनरेटर | आपका अपना `ThoughtGenerator` (अवलोकनों की तुलना सहित); इसके विचार फिर भी इंजन के प्रवेश-नियमों से होकर गुज़रते हैं |
| `temperature`, `maxTokens`, `reasoningEffort` | `0.4`, —, — | विचार बनाने की सेटिंग (`reasoningEffort`: सिर्फ़ OpenAI के reasoning मॉडल) |
| `providerSettings` | — | टूल के चुनाव की सेटिंग (मूल तर्क इंजन), `openai.reasoningEffort` समेत |

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
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` — उत्तरों का टाइप सवालों से निकलता है; जब backend tokens की गिनती नहीं बताता, तो `usage` नहीं होता |
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

### `RunCostReport` {#runcostreport}

`getRunCost(runId)` क्या लौटाता है: run की मॉडल कॉल, विफल कदमों सहित — देखें [API लागत](../guide/costs)।

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

| फ़ील्ड | |
| --- | --- |
| `totalUsd` | उन कॉल की लागत जिनकी लागत ज्ञात है; जब `complete` `false` हो, तो यह सिर्फ़ एक निचली सीमा है |
| `complete` | `false` जब कुछ कॉल की लागत अज्ञात हो: `unpricedCalls` या `unmeteredCalls` 0 से ज़्यादा |
| `unpricedModels`, `unpricedCalls` | `pricing` में बिना कीमत वाले मॉडल, और उनकी वे कॉल जिन्होंने अपने tokens बताए |
| `unmeteredModels`, `unmeteredCalls` | उन कॉल के मॉडल जिन्होंने न इनपुट tokens की गिनती बताई न आउटपुट tokens की, और वे कॉल |
| `lines` | हर मॉडल और स्रोत के लिए एक: कॉल, उन कॉल के tokens जिन्होंने उन्हें बताया, अगर हों तो `unmeteredCalls`, मॉडल की कीमत हो और पंक्ति की किसी कॉल ने अपने tokens बताए हों तो `costUsd`; जिस कॉल ने कोई मॉडल नाम दर्ज नहीं किया, उसका `model` `(unknown)` होता है |

## ट्रेस, रीप्ले और टेस्टिंग {#traces-replay-and-testing}

| Method | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | runs पढ़ें |
| `replay(runId, modifications?, { onEvent? })` | LLM के बिना दोबारा चलाएँ |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | निर्णयों को समझें |

### गोल्डन ट्रेस {#golden-traces}

| Method | लौटाता है | |
| --- | --- | --- |
| `createGoldenTrace(runId, { name, description?, metadata? })` | `Promise<GoldenTrace>` | किसी run को संदर्भ के रूप में रखता है, उसे चलाने वाले नियंत्रित एजेंट के नाम (`agentName`) के साथ |
| `getGoldenTraces(agent?)`, `getGoldenTrace(id)`, `deleteGoldenTrace(id)`, `exportGoldenTrace(id, 'json' \| 'yaml')` | | `agent`: किसी एजेंट का id या नाम |
| `validateAgainstGoldenTrace(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | `pass`, `fail` या `partial`, हर अंतर (`event_added`, `event_removed`, `event_modified`, `event_order_changed`) और उसकी जगह के साथ |
| `detectRegressions(runId, goldenTraceId, options?)` | `Promise<RegressionReport>` | वही अंतर रिग्रेशन के रूप में, हर एक की गंभीरता और असर के साथ: `no_regression` या `regressions_detected` |
| `replayAndValidate(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | run को रीप्ले करता है, फिर रीप्ले को सत्यापित करता है। रीप्ले कोई मॉडल कॉल नहीं करता: उसकी तुलना `validateAspects: ['tools', 'policies']` के साथ करें |

runs की तुलना **उनके इवेंट्स के अर्थ से** होती है, इवेंट id से कभी नहीं (हर run में नए id होते हैं)। इवेंट्स को क्रम से उनके प्रकार और विषय — टूल, नीति, ऑपरेशन, जवाब — के आधार पर जोड़ा जाता है, फिर उनके डेटा की तुलना होती है। जिनकी तुलना कभी नहीं होती: इवेंट id, समय, metadata, और डेटा फ़ील्ड `agentId`, `approvalId`, `delayMs`, `duration`, `durationMs`, `elapsedMs`, `eventId`, `observedAt`, `recordedAt`, `replayOf`, `sourceEventId` और `usage`। वही काम दोबारा करने वाला run पास होता है; दूसरे arguments के साथ कॉल किया गया टूल वहीं बताया जाता है जहाँ कॉल हुई (`parameters.metric: "churn" → "revenue"`); `action.executed` जो `action.failed` बन गया, वह एक ही बदलाव है, कोई कमी और एक जोड़ नहीं।

| विकल्प | किसके लिए | |
| --- | --- | --- |
| `ignoreEventTypes`, `validateAspects` (`intentions`, `actions`, `tools`, `policies`) | सत्यापन | कम इवेंट्स की तुलना करें |
| `tolerance.dataFields` | सत्यापन | किसी भी गहराई पर और डेटा फ़ील्ड छोड़ें |
| `tolerance.timestampMs`, `ignoreTimestampDiff` | सत्यापन | समय की तुलना, हर run की शुरुआत के सापेक्ष, सिर्फ़ `timestampMs` होने पर होती है |
| `compareStructureOnly` | सत्यापन | डेटा के अंतर `fail` नहीं, `partial` देते हैं |
| `tolerance.ignoreEventTypes`, `tolerance.ignoreDataFields` | रिग्रेशन | कम इवेंट्स की तुलना करें, डेटा फ़ील्ड छोड़ें |
| `tolerance.criticalEventTypes` | रिग्रेशन | वे प्रकार जिनका आना, गायब होना या बदलना गंभीर है (डिफ़ॉल्ट: `run.failed`, `action.failed`, `tool.failed`, `policy.violated`) |
| `tolerance.maxEventCountDiff` | रिग्रेशन | जोड़े या हटाए गए प्रक्रिया इवेंट्स (नीति जाँच, दोबारा कोशिशें, मंज़ूरियाँ) इस संख्या तक सहे जाते हैं; नतीजे का बदलना कभी नहीं |
| `tolerance.maxDurationDiff`, `severityThresholds` | रिग्रेशन | अवधि की जाँच इनमें से किसी एक के होने पर ही होती है: जो run `maxDurationDiff` ms से ज़्यादा धीमा हो, वह रिग्रेशन है, पहुँची हुई सबसे ऊँची सीमा की गंभीरता के साथ; तेज़ run कभी रिग्रेशन नहीं होता |

### रिग्रेशन सूट {#regression-suites}

| Method | लौटाता है | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | `regressionTestSuitesDir` में सहेजा जाता है। `agent`: इस SDK के किसी एजेंट का id या नाम। हर गोल्डन ट्रेस मौजूद होना चाहिए; `input` डिफ़ॉल्ट रूप से वह इनपुट है जो संदर्भ run को मिला था |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | सबसे नए पहले |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | एजेंट के सभी सूट, सबसे पुराना पहले: हर टेस्ट अपना इनपुट एजेंट को भेजता है और run की तुलना अपने गोल्डन ट्रेस से करता है; `suites` में हर सूट का एक नतीजा होता है |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | एक सूट |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode`: 0 सभी टेस्ट पास, 1 किसी टेस्ट को रिग्रेशन मिला, 2 कोई टेस्ट चल नहीं सका (त्रुटि या समय-सीमा खत्म); विकल्पों में `exitCode: false` देने पर 0 |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | JUnit XML में हर सूट का एक `<testsuite>`, समय-सीमा खत्म होना त्रुटि गिना जाता है |

एजेंट के id हर प्रोसेस में नए होते हैं: इसलिए सूट अपने एजेंट का **नाम** भी दर्ज करता है, और कोई दूसरा प्रोसेस उसे उसी नाम वाले अपने एजेंट के साथ चलाता है (पहले सूट के एजेंट id से, अगर वह एजेंट SDK में हो)। अगर एक SDK के दो एजेंटों का नाम एक ही हो, तो id दें। पुराने versions के सहेजे सूट में नाम नहीं होता: वे सिर्फ़ उसी प्रोसेस में चलते हैं जिसने उन्हें बनाया। विकल्प: `parallel` (एक सूट के टेस्ट एक साथ), `stopOnFirstFailure` (सिर्फ़ क्रमवार runs में), `filterTags`, `excludeTags`, `timeout` (हर टेस्ट के लिए ms, डिफ़ॉल्ट 60 000; इसके बाद run रद्द होता है और टेस्ट `timeout` होता है) और `detection` (ऊपर के रिग्रेशन विकल्प)।

### Assertions {#assertions}

| Method | लौटाता है | |
| --- | --- | --- |
| `defineAssertion(name, condition, { description?, severity?, tags?, agentId?, agentName? })` | `Promise<Assertion>` | सभी runs के लिए, या किसी एक एजेंट के runs के लिए; `agentId` से दिया गया इस SDK का एजेंट अपना नाम भी दर्ज करता है। जिस शर्त को जाँचा न जा सके, उसे `ValidationError` के साथ ठुकराया जाता है |
| `getAssertions(agent?, tags?)` | `Promise<Assertion[]>` | सबसे नए पहले |
| `evaluateAssertions(runId, assertionIds?)` | `Promise<AssertionEvaluationReport>` | दी गई assertions (अनजान id पर त्रुटि), नहीं तो सभी runs वाली assertions और उस run के एजेंट की assertions |
| `deleteAssertion(assertionId)` | `Promise<void>` | |

| `condition.type` | ज़रूरत | पास होती है जब |
| --- | --- | --- |
| `event_present`, `event_absent` | `eventType` या `eventTypes` | कोई एक प्रकार आता है / कोई नहीं आता |
| `event_count` | `eventType` या `eventTypes`, फिर `count`, या `minCount` और `maxCount` | ऐसे इवेंट्स की संख्या सही बैठती है |
| `event_order` | `beforeEventType`, `afterEventType` | एक का पहला इवेंट दूसरे के पहले इवेंट से पहले आता है |
| `event_value` | `eventType`, `valuePath`, `valueMatcher` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `regex`) | उस प्रकार का हर इवेंट मेल खाता है |
| `custom` | `customEvaluator(events) => boolean` | फ़ंक्शन `true` लौटाता है |

`custom` assertion में एक फ़ंक्शन होता है, जिसे फ़ाइल में नहीं लिखा जा सकता: इसलिए वह **सहेजी नहीं जाती** और तभी तक रहती है जब तक उसे परिभाषित करने वाला SDK instance रहता है; शुरुआत में उसे दोबारा परिभाषित करें। बाकी प्रकार `assertionsDir` में सहेजे जाते हैं।

### तुलना और असर {#comparisons-and-impact}

| Method | लौटाता है | |
| --- | --- | --- |
| `compareRuns(runId1, runId2, { ignoreEventTypes?, focusAspects?, compareStructureOnly?, includeMetadata? })` | `Promise<RunComparison>` | ऊपर की तरह अर्थ से मिलाए गए अंतर: `event_added`, `event_removed`, `event_modified` (प्रकार बदला), `data_changed`, `sequence_changed` |
| `getComparisonReport(comparison, 'text' \| 'json' \| 'html')` | `Promise<string>` | |
| `analyzeImpact(beforeRunIds, afterRunIds, { metrics?, includeRecommendations? })` | `Promise<ImpactAnalysis>` | पहले और बाद के औसत: `duration` (ms), `cost` (जिन मॉडल कॉल की कीमत है उनके USD, `getRunCost` की तरह), `quality` (उन इवेंट्स का हिस्सा जो विफल actions नहीं हैं) और `success_rate`, व्यवहार के बदलावों के साथ; `impactAnalysesDir` में सहेजा जाता है |
| `getImpactAnalysis(analysisId)` | `Promise<ImpactAnalysis>` | |
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | किसी नियंत्रित एजेंट (उसका नाम, या इस SDK के किसी एजेंट का id) के उन runs पर `analyzeImpact` जो हर version के साथ दर्ज हुए: उसका `version` या उसका `configHash`। रीप्ले शामिल नहीं होते; अनजान version पर त्रुटि आती है, जिसमें दर्ज versions की सूची होती है |

किसी नियंत्रित एजेंट के runs के जीवनचक्र इवेंट (`run.started`, `run.completed`…) उसका `agentName`, `agentVersion` और `configHash` दर्ज करते हैं: एक ही नाम वाले दो एजेंट दो versions में, या दो प्रोसेस में, एक ही एजेंट हैं। पुराने versions के दर्ज किए runs में सिर्फ़ id और version होते हैं।

### सभी runs पर क्वेरी {#queries-across-runs}

| Method | लौटाता है |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>`: मेल खाने वाले इवेंट्स समय के क्रम में (ज़्यादा से ज़्यादा `limit`), दायरे के इवेंट्स की संख्या, मेल खाने वालों की संख्या |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

किसी फ़िल्टर में एक **दायरा** होता है — `runId` (इसके बिना, सभी runs), `since`, `until` — और कुछ **शर्तें** — `type`, `agentId`, `userId`, `sessionId`, `dataFilters` (`{ path, operator, value?, regex? }`) और `metadataFilters` (`{ field, operator, value? }`)। शर्तों को `logic` से जोड़ा जाता है (डिफ़ॉल्ट `and`; `or`: कम से कम एक), फिर `not` से उलटा जाता है; दायरा कभी नहीं उलटा जाता। हर built-in स्टोर जवाब देता है: फ़ाइल स्टोर हर run पढ़ता है, SQL स्टोर डेटाबेस से पूछते हैं, जो सभी शर्तें ज़रूरी होने पर खुद प्रकार और id से छाँटता है।

## लाइव इवेंट {#live-events}

एक listener `(event: Event) => unknown` होता है। उसे एक बार में एक इवेंट मिलता है, हर run के क्रम में, जैसे ही स्टोर उसे स्वीकार कर लेता है; वह जो promise लौटाता है, उसके पूरा होने का इंतज़ार उसके अगले इवेंट से पहले किया जाता है। कोई run कभी उसका इंतज़ार नहीं करता, और उसके errors की सूचना दी जाती है, उन्हें कभी run में नहीं फेंका जाता। ज़्यादा से ज़्यादा `maxQueued` इवेंट (डिफ़ॉल्ट रूप से 10 000) उसका इंतज़ार करते हैं; उससे आगे, नए इवेंट उसके लिए छोड़ दिए जाते हैं और उनकी सूचना एक `LiveEventsDroppedError` के साथ दी जाती है। देखें [लाइव प्रगति](../guide/observability#live-progress)।

| API | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | run का हर इवेंट; `run()` तब resolve होता है जब listener उनमें से हर एक को निपटा चुका हो, या उससे पहले, जब run रोका या रद्द किया गया हो या `signal` abort हो (तब listener की सदस्यता खत्म कर दी जाती है)। listener दर्ज नहीं किया जाता |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | संज्ञानात्मक run के लिए भी यही, जिसका `limits.timeoutMs` भी इंतज़ार खत्म करता है |
| `replay(runId, modifications?, { onEvent })` | रीप्ले के लिए भी यही, जिसे रद्द नहीं किया जा सकता: वह हमेशा इंतज़ार करता है |
| `executeTool(name, params, { onEvent })` | कॉल के इवेंट, और उसके टूल द्वारा शुरू किए गए runs के इवेंट, सिर्फ़ एक स्तर तक: handler को listener `context.onEvent` के रूप में मिलता है, जिसे `governedAgentTool` और `cognitiveAgentTool` अपने एजेंट को देते हैं (लाइव इवेंट के बिना वाले स्टोर पर हाथ से बनाया गया एजेंट इसके बिना चलता है)। `signal` इंतज़ार खत्म करता है |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: फ़िल्टर से मेल खाने वाले हर run का हर इवेंट (`agentId` का मतलब `metadata.agentId` है), जब तक आप लौटाया गया फ़ंक्शन कॉल नहीं करते, जो अभी तक न पहुँचाए गए इवेंट छोड़ देता है |
| `new ObservedEventStore(store, { onListenerError? })` | वह परत जो इवेंट पहुँचाती है; SDK अपने स्टोर को ऐसी एक परत में लपेटता है, या वह परत इस्तेमाल करता है जो आप `eventStore` के रूप में देते हैं, `MonitoredEventStore` के अंदर भी (तब उसकी घटना रिपोर्ट भी पहुँचाई जाती हैं)। इसका `subscribe(listener, options?)` `{ unsubscribe(), close() }` लौटाता है: `close()` तब तक इंतज़ार करता है जब तक listener उन इवेंट्स को निपटा न ले जो वह पहले ही ले चुका है। `onListenerError` को listener के errors और इवेंट छोड़े जाने की सूचनाएँ मिलती हैं |

## टूल: `ToolDefinition` {#tools-tooldefinition}

| फ़ील्ड | |
| --- | --- |
| `name`, `description` | मॉडल क्या देखता है |
| `schema` | arguments का Zod स्कीमा; मेल न खाने वाली कॉल ठुकरा दी जाती हैं |
| `handler(params, context?)` | सत्यापित arguments और `{ runId, agentId, signal?, onEvent? }` पाता है — कॉल करने वाले के हार मानने पर `signal` abort हो जाता है; `onEvent` तब सेट होता है जब कॉल करने वाला कॉल को लाइव देख रहा हो: इसे टूल द्वारा शुरू किए गए runs के `onEvent` के रूप में दें |
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
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | MCP `Server` जो ठीक वही उपलब्ध कराता है जो `tools` में सूचीबद्ध है: परिभाषित टूल के नाम और/या `ToolDefinition` (आपके लिए SDK पर परिभाषित; वही परिभाषा दोबारा दी जा सकती है, पहले से लिए गए नाम वाला कोई दूसरा टूल ठुकरा दिया जाता है)। `resources`: एक या कई `ResourceProvider`; हर पढ़ना ट्रेस होता है। कॉल `mcp:<name>` (या `agentId`) के रूप में चलती हैं; जिस मंज़ूरी पर `approvalTimeoutMs` (डिफ़ॉल्ट 50 000 ms) के भीतर कोई निर्णय न ले, वह रद्द हो जाती है; इनपुट के इनकार क्लाइंट को समझाए जाते हैं, दूसरे कारण सिर्फ़ `exposeErrorDetails` के साथ। `progressToken` वाली कॉल को हर इवेंट के लिए एक `notifications/progress` मिलता है, और ये सभी परिणाम से पहले भेजे जाते हैं ([प्रगति सूचनाएँ](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | वही, stdin/stdout से जुड़ा; stderr पर एक "ready" लाइन लिखता है, और stdin खत्म होने पर बंद हो जाता है (चल रही कॉल abort हो जाती हैं, लंबित मंज़ूरियाँ रद्द)। `approvalTimeoutMs` का डिफ़ॉल्ट 50 000 है, `createMcpServer` की तरह |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — किसी भी MCP सर्वर के टूल, `ToolDefinition` के रूप में |

`GovernedToolHost` वह है जो सर्वर को SDK से चाहिए (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` ऐसा ऑब्जेक्ट लौटाता है जो इसे लागू करता है।

## बुनियादी घटक {#building-blocks}

SDK के बुनियादी घटक कस्टम सेटअप के लिए एक्सपोर्ट किए गए हैं: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `ObservedEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, और उनके मुख्य टाइप।
