# واجهة SDK البرمجية

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| الخيار | النوع | الوصف |
| --- | --- | --- |
| `apiKey` | `string` | مفتاح المزوّد الأساسي (غير مطلوب مع `llmProvider`). دون أي مفتاح، تعمل الأدوات وخوادم MCP، وتفشل الاستدعاءات التي تحتاج إلى نموذج بخطأ واضح |
| `provider` | `'openai' \| 'anthropic'` | المزوّد الأساسي، والافتراضي `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey` و`defaultModel` و`baseURL` لكل جهة (`baseURL`: نقطة نهاية متوافقة، مثل واجهة v1 من Azure OpenAI أو خادم نماذج محلي، أو وكيل proxy). ولـ OpenAI، يطلب `includeStreamUsage` استهلاك الإجابة المبثوثة (`stream_options`): وافتراضيًا لا يُطلَب إلا على واجهة OpenAI نفسها، إذ قد يرفض الخادم المتوافق هذا الحقل أو يتجاهله. يستخدم المزوّد الأساسي مدخل جهته، ويستخدم المزوّد الاحتياطي من جهة أخرى مدخل جهته هو. النماذج الافتراضية: `gpt-5.4` و`claude-opus-5`. ويقبل مدخل OpenAI أيضًا `reasoningModels` و`reasoningEffort` و`nativeToolMessages`: انظر [نماذج OpenAI](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | تُجرَّب بالترتيب حين يفشل المزوّد الأساسي؛ ويتقدّم `config` على `providerConfig`. لا يرث المزوّد الاحتياطي من جهة المزوّد الأساسي نفسها أيًّا من إعداداته (سوى `apiKey` العام)؛ أما المزوّد من جهة أخرى فيحتاج إلى مفتاحه الخاص |
| `llmProvider` | `LLMProvider` | مزوّدك الخاص (نموذج محلي، أو بوابة، أو بديل اختباري). يتلقّى استدعاءات الأدوات ونتائجها بالصيغة الأصلية (`LLMMessage`) إن صرّح بـ `nativeToolMessages`، وإلا فنصًّا، ويمكنه أن يبثّ نصه تدريجيًا (انظر [`LLMProvider`](#llmprovider)) |
| `retry` | `Partial<RetryPolicy> \| false` | سياسة إعادة المحاولة للنموذج اللغوي، لكل مزوّد، قبل التحويل إلى البديل. وقيمتا `maxRetries` و`initialDelayMs` فيها هما أيضًا القيمتان الافتراضيتان لـ `jev.maxRetries` و`jev.retryBaseDelayMs`؛ أمّا حقولها الأخرى فلا تصل إلى عميل Jev، الذي يحتفظ مع `retry: false` بإعادتَي المحاولة و500 ms الخاصة به. لا تُطبَّق على `llmProvider` محقون إلا إذا عُيّنت صراحةً، ولا تُطبَّق أبدًا على `FallbackProvider` مُمرَّر بوصفه `llmProvider` ولا على مزوّداته |
| `jev` | `JevClientConfig` | يفعّل TypeSafe Jev للقرارات المُنمَّطة — مباشرةً، أو عبر [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) مع `baseUrl` و`model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | أي واجهة خلفية للقرارات المُنمَّطة (لها الأولوية على `jev`) |
| `pricing` | `PricingTable` | دولار أمريكي لكل مليون رمز، يُدمَج فوق القيم الافتراضية |
| `incidents` | `IncidentMonitorOptions` | المُبلِّغون، والقواعد، وعتبة الخطورة، والكبح |
| `eventStore` | `IEventStore` | الافتراضي `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | السياسات العامة |
| `goldenTracesDir`، `regressionTestSuitesDir`، `assertionsDir`، `impactAnalysesDir` | `string` | مواضع تخزين مخرجات الاختبار |

### نماذج OpenAI {#openai-models}

نماذج الاستدلال من OpenAI، أي سلسلة o (`o1`، `o3`، `o4-mini`…) وGPT-5 وما بعده (`gpt-5`، `gpt-5.4-mini`، `gpt-6-sol`…)، بما فيها النماذج المؤرَّخة أو المضبوطة بدقة (`ft:o4-mini-…`)، ترفض `max_tokens`، وترفض `temperature` ما لم يكن مستوى جهد استدلالها `none`. يتعرّف عليها مزوّد OpenAI من اسمها أيًّا كانت حالة الأحرف: فيرسل إليها `maxTokens` في صورة `max_completion_tokens`، الذي يحسب رموز استدلالها أيضًا، ومعه مستوى جهد الاستدلال. ولأن مستوى الجهد الافتراضي يختلف من نموذج إلى آخر، فإنه لا يرسل إليها درجة الحرارة أبدًا: تُتجاهَل درجة حرارة الوكيل أو المحرّك بالنسبة إليها. أما النماذج الأخرى فتتلقّى `temperature` و`max_tokens`، اللذين يعرفهما كل خادم متوافق مع OpenAI.

::: warning الأدوات ومستوى جهد الاستدلال
تستدعي الـ SDK خدمة OpenAI عبر Chat Completions، حيث لا تستدعي نماذج GPT-5.4 وما بعده الأدوات إلا بمستوى الجهد `none`. يستخدم النموذج الافتراضي `gpt-5.4` المستوى `none` ما لم تحدّد مستوى آخر. أما GPT-5.5 وGPT-5.6 وGPT-6 Sol وLuna فمستواها الافتراضي `medium`: يفشل عليها الوكيل الذي يملك أدوات (`Function tools with reasoning_effort are not supported`) ما لم تحدّد `reasoningEffort: 'none'`. ولا يستطيع GPT-6 Astra استدعاء الأدوات عبر Chat Completions إطلاقًا. وترسل الـ SDK مستوى الجهد الذي تحدّده كما هو.
:::

| الخيار | القيمة الافتراضية | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | نموذج الطلب الذي لا يسمّي نموذجًا، والمزوّد الاحتياطي الذي لا يخدم نموذج الوكيل |
| `reasoningModels` | يُستنتج من الاسم | `true` أو `false`: كل نماذج هذا المزوّد نماذج استدلال، أو لا شيء منها. قائمة: هذه الأسماء نماذج استدلال (عمليات نشر Azure، أسماء مستعارة في بوابة)، ويُتعرَّف على غيرها من اسمه |
| `reasoningEffort` | مستوى النموذج نفسه | `none` أو `minimal` أو `low` أو `medium` أو `high` أو `xhigh` أو `max`، ويُرسَل كما هو إلى نماذج الاستدلال وحدها. يقبل كل نموذج بعض هذه القيم، وترفض الواجهة البرمجية الباقي |
| `nativeToolMessages` | `true` | `false` لخادم متوافق لا يقبل في المحادثة `tool_calls` المساعد ولا رسائل `tool`: تُرسَل عندئذٍ استدعاءات الأدوات السابقة ونتائجها نصًّا، بينما تظل الأدوات معروضة وتظل استدعاءات الأدوات في الردود مقروءة. وتسري القيمة `false` على السلسلة كلها إن وُضعت على المزوّد الأساسي أو على أي مزوّد احتياطي |

توضع هذه الخيارات في `providerConfig.openai` أو في `config` الخاص بمزوّد OpenAI احتياطي. يأخذ المزوّد الاحتياطي من جهة أخرى من `providerConfig.openai` كل خيار لا يحدّده `config` الخاص به؛ أما المزوّد الاحتياطي من جهة المزوّد الأساسي نفسها فلا يأخذ أيًّا منها. ويحدّد الوكيل أو التشغيل مستوى الجهد الخاص به في `providerSettings.openai.reasoningEffort`: يتقدّم مستوى التشغيل، ثم مستوى الوكيل، ثم مستوى المزوّد. ولا يطبّقه الوكيل المعرفي إلا على اختيار الأدوات؛ أما أفكاره، التي لا تعرض أدوات، فتأخذ خياره `reasoningEffort`.

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

ينفّذ مزوّدك الخاص `generateCompletion(request)` و`supportsModel(model)` و`getProviderName()`، ويمكنه أن يصرّح بـ `nativeToolMessages`. حقلان من الطلب يخصّان البث التدريجي:

| حقل `LLMRequest` | |
| --- | --- |
| `onTextDelta?(delta)` | يُعيَّن حين يريد المستدعي النص أثناء كتابته (تشغيل مع `onText`). استدعِه مع كل جزء من النص فور وصوله، ثم أعِد `LLMResponse` كاملةً كالمعتاد: يجب أن تشكّل الأجزاء مجتمعةً `content` الخاص بها. المزوّد الذي لا يستطيع البث التدريجي يتجاهله، فتمرّر حزمة SDK محتوى `content` كاملًا دفعةً واحدة. ويجب ألّا يرمي استثناءً (والدالة التي تضعها حزمة SDK لا ترمي أبدًا) |
| `onTextRestart?()` | استدعِه حين تعيد المحاولة بعد محاولة كانت قد بثّت نصًّا (إعادة محاولة خاصة بك): يصبح ذلك النص لاغيًا، وتبدأ الأجزاء التالية الإجابة من جديد. ويستدعيه `RetryingLLMProvider` و`FallbackProvider` نيابةً عن المزوّدات التي يغلّفانها |

## الوكلاء {#agents}

| الدالة | تعيد | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | وكيل خاضع للحوكمة: `run({ message, context?, signal?, onText?, onTextRestart? })`، و`stop(runId?)`، و`addTools()`، و`setPolicy()`، و`id`، و`name`. لا يستطيع تشغيل إلا أدواته الخاصة (`tools`، `capabilities`)، حتى لو ذكر النموذج أداة أخرى مسجَّلة في حزمة SDK؛ ويلغي `signal` التشغيل؛ ويتلقّى `onText` النص الذي يكتبه النموذج أثناء كتابته، و`onTextRestart` الجزء الذي يجب حذفه حين يُعاد تجريب استدعاء فاشل للنموذج (انظر [البث التدريجي للإجابة](../guide/governed-agents#_7-streaming-the-answer)) |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`، و`stop(runId?)`، و`learnFromFeedback(runId, feedback)`، و`getProfile()`، و`setProfile()`. أفكاره مهيكلة ولا تُبثّ تدريجيًا |
| `defineTool(definition)` | `Tool` | يسجّل أداة؛ ويُستنتَج نوع المعالج من مخطط Zod الخاص بها |
| `defineCapability(definition)` | `Capability` | يجمّع الأدوات |
| `listTools()` | `Tool[]` | كل أداة مسجَّلة |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | تنفيذ خاضع للحوكمة خارج وكيل (يستخدمه خادم MCP): المعاملات، والسياسات، والموافقة، والميزانية (تُحتسَب حين يبدأ الاستدعاء)، ثم الأداة. يلغي `signal` موافقة معلّقة ويصل إلى المعالج؛ وتلغي `approvalTimeoutMs` موافقة لم يقرّر فيها أحد |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | يشغّل `read()` تشغيلًا مستقلًا: `run.started`، و`resource.read` (معرّف URI، والحجم، وSHA-256)، و`run.completed` أو `run.failed` |
| `stopRun(runId)` | `Promise<void>` | يوقف تشغيلًا خاضعًا للحوكمة أو معرفيًا |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| الخيار | القيمة الافتراضية | |
| --- | --- | --- |
| `name`، `model` | — | مطلوبان |
| `profile` | `DEFAULT_THINKER_PROFILE` | كيف يستدل الوكيل |
| `tools`، `policies` | `[]` | خاضعة للحوكمة كما في كل مكان آخر |
| `systemPrompt` | — | تعليمات إضافية لكل موجّه |
| `limits` | انظر [الوكلاء المعرفيون](../guide/cognitive-agents#limits) | `maxSteps`، `timeoutMs`، `maxHypotheses`، `maxToolCalls`، `decisionThreshold`، `maxConsecutiveFailures`، `maxPredictionTests`، `preferenceWeight`، `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'` أو `'typed'` أو `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0.35)، و`readinessThreshold` (0.8)، و`fallback`، و`model` |
| `assessment` | `'auto'` | `'llm'` أو `'typed'` أو `HypothesisAssessor` خاص بك لعملية `compare` |
| `knowledge` | — | الذاكرة عبر عمليات التشغيل: `{ store, scope, recallLimit? (10), record? (true) }`، انظر [الذاكرة عبر عمليات التشغيل](../guide/memory) |
| `evaluator` | — | `OutcomeEvaluator` يختبر التنبؤات؛ ويفعّل `test_prediction` |
| `generator` | مولّد يعتمد على النموذج اللغوي `model` | `ThoughtGenerator` الخاص بك (بما في ذلك مقارنات الملاحظات)؛ وتظل أفكاره تمرّ بقواعد القبول في المحرّك |
| `temperature`، `maxTokens`، `reasoningEffort` | `0.4`، —، — | إعدادات توليد الأفكار (`reasoningEffort`: لنماذج الاستدلال من OpenAI فقط) |
| `providerSettings` | — | إعدادات اختيار الأدوات (محرّك الاستدلال الأصيل)، بما فيها `openai.reasoningEffort` |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` — قيمة `status` هي `completed` أو `failed` أو `cancelled`؛ وقيمة `decision.status` هي `committed` أو `provisional` أو `abstain`، مع `decision.missing` الذي يسرد ما لم يثبت؛ و`state` هي `MentalState` النهائية.

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

انظر [الأدلة والتحقّق](../guide/evidence-and-verification).

## الاستدلال والملفات {#reasoning-profiles}

| الدالة | تعيد |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — يُعاد بناؤها من الأحداث |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — بصيغة JSON Lines |

## القرارات المُنمَّطة — `sdk.decisions` {#typed-decisions-—-sdk-decisions}

ترمي `ValidationError` حين لا تكون هناك واجهة خلفية مُعدّة.

| الدالة | تعيد |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` — تُستنتَج أنواع الإجابات من الأسئلة؛ ولا يوجد `usage` حين لا تُبلِغ الواجهة الخلفية عن عدد الرموز |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

الدوال المساعدة للأسئلة: `noul(instructions, criteria?)`، و`choice(instructions, options)`، و`score(instructions, levels)`.

## العمليات التشغيلية {#operations}

| الدالة | تعيد |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`، `rejectAction(...)`، `getPendingApprovals(runId?)` | الموافقات البشرية |
| `getBudgetUsage(limit)`، `getPolicyAuditTrail(runId)` | الميزانيات وتدقيق السياسات |

### `RunCostReport` {#runcostreport}

ما يُعيده `getRunCost(runId)`: استدعاءات النموذج في التشغيل، بما في ذلك الخطوات الفاشلة — انظر [تكاليف API](../guide/costs).

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

| الحقل | |
| --- | --- |
| `totalUsd` | كلفة الاستدعاءات المعروفة الكلفة؛ وهي مجرّد حدّ أدنى حين تكون `complete` مساوية لـ `false` |
| `complete` | `false` حين تكون كلفة بعض الاستدعاءات مجهولة: `unpricedCalls` أو `unmeteredCalls` أكبر من 0 |
| `unpricedModels`، `unpricedCalls` | النماذج التي لا سعر لها في `pricing`، واستدعاءاتها التي أبلغت عن رموزها |
| `unmeteredModels`، `unmeteredCalls` | نماذج الاستدعاءات التي لم تُبلِغ عن أي عدد لرموز الإدخال أو الإخراج، وتلك الاستدعاءات |
| `lines` | سطر لكل نموذج ومصدر: الاستدعاءات، ورموز الاستدعاءات التي أبلغت عنها، و`unmeteredCalls` إن وُجدت، و`costUsd` حين يكون للنموذج سعر وأبلغ بعض استدعاءات السطر عن رموزها؛ وقيمة `model` هي `(unknown)` لاستدعاء لم يسجّل اسم نموذج |

## الآثار وإعادة التشغيل والاختبار {#traces-replay-and-testing}

| الدالة | |
| --- | --- |
| `getTrace(runId)`، `exportTrace(runId, 'json' \| 'text')`، `getEvents(runId, filters?)` | قراءة عمليات التشغيل |
| `replay(runId, modifications?, { onEvent? })` | إعادة التنفيذ دون النموذج اللغوي |
| `getReasoningGraph`، `exportReasoningGraph`، `getAlternatives`، `getDecisionPatterns`، `getTraceVisualization` | فهم القرارات |
| `createGoldenTrace`، `getGoldenTraces`، `validateAgainstGoldenTrace`، `replayAndValidate`، `detectRegressions` | اختبار الوكلاء كما تُختبَر الشيفرة |

## الأحداث المباشرة {#live-events}

المستمِع (listener) هو `(event: Event) => unknown`. يتلقّى حدثًا واحدًا في كل مرة، بترتيب كل تشغيل، بمجرّد أن يقبله المخزن؛ ويُنتظَر الوعد الذي يعيده قبل حدثه التالي. لا تنتظره عمليات التشغيل أبدًا، ويُبلَّغ عن أخطائه، ولا تُرمى أبدًا داخل التشغيل. ولا ينتظره إلا `maxQueued` حدثًا على الأكثر (10 000 افتراضيًا)؛ وبعد ذلك تُسقَط الأحداث الجديدة بالنسبة إليه ويُبلَّغ عنها بخطأ `LiveEventsDroppedError`. انظر [التقدّم المباشر](../guide/observability#live-progress).

| الواجهة | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | كل حدث من أحداث التشغيل؛ ولا تعيد `run()` نتيجتها إلا بعد أن يفرغ المستمِع من كل واحد منها، أو قبل ذلك حين يكون التشغيل قد أُوقِف أو أُلغي أو حين يُلغى `signal` (ويُلغى عندئذٍ اشتراك المستمِع). والمستمِع نفسه لا يُسجَّل |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | الشيء نفسه لتشغيل معرفي، تُنهي `limits.timeoutMs` الخاصة به الانتظارَ أيضًا |
| `replay(runId, modifications?, { onEvent })` | الشيء نفسه لإعادة تشغيل، وهي لا يمكن إلغاؤها: فتنتظر دائمًا |
| `executeTool(name, params, { onEvent })` | أحداث الاستدعاء، وأحداث عمليات التشغيل التي تبدؤها أداته، على مستوى واحد فقط: يتلقّى المعالج المستمِع بوصفه `context.onEvent`، وتمرّره `governedAgentTool` و`cognitiveAgentTool` إلى وكيلهما (أما الوكيل المبني يدويًا على مخزن دون أحداث مباشرة فيعمل من دونه). ويُنهي `signal` الانتظار |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: كل حدث من كل تشغيل يطابق المرشِّح (`agentId` هو `metadata.agentId`)، إلى أن تستدعي الدالة المُعادة، التي تُسقِط الأحداث التي لم تُسلَّم بعد |
| `new ObservedEventStore(store, { onListenerError? })` | الطبقة التي تسلّم الأحداث؛ تغلّف حزمة SDK مخزنها بواحدة منها، أو تستخدم تلك التي تعطيها بوصفها `eventStore`، حتى داخل `MonitoredEventStore` (فتُسلَّم عندئذٍ تقارير الحوادث الخاصة به أيضًا). وتعيد `subscribe(listener, options?)` الخاصة بها `{ unsubscribe(), close() }`: تنتظر `close()` إلى أن يفرغ المستمِع من الأحداث التي أخذها بالفعل. ويتلقّى `onListenerError` أخطاء المستمِعات وحالات الإسقاط |

## الأدوات: `ToolDefinition` {#tools-tooldefinition}

| الحقل | |
| --- | --- |
| `name`، `description` | ما يراه النموذج |
| `schema` | مخطط Zod للمعاملات؛ وتُرفَض الاستدعاءات التي لا تطابقه |
| `handler(params, context?)` | يتلقّى المعاملات المُتحقَّق منها و`{ runId, agentId, signal?, onEvent? }` — ويُلغى `signal` حين يتخلّى المستدعي؛ ويُعيَّن `onEvent` حين يتابع المستدعي الاستدعاء مباشرةً: مرّره بوصفه `onEvent` لعمليات التشغيل التي تبدؤها الأداة |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — للأدوات المتساوية القوة (idempotent) فقط؛ ولا تُعاد محاولة المعاملات غير الصالحة أبدًا |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — تجعل `requiresApproval: true` كل استدعاء ينتظر `approveAction`؛ وتُعرَض `readOnly` على عملاء MCP بوصفها `readOnlyHint` |
| `inputJsonSchema` | JSON Schema تُعرَض بدل تلك المشتقة من `schema` |
| `capability`، `version` | التجميع، والإصدار |

## مصادر الأدوات {#tool-sources}

يعيد كل منها تعريفات `ToolDefinition` جاهزة: مرّرها إلى `sdk.defineTool`، أو إلى وكيل، أو مباشرةً إلى `tools` في خادم MCP. انظر [خادم MCP لأيّ شيء](../guide/mcp-recipes).

| الدالة | تعيد | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | أداة لكل عملية في وصف OpenAPI 3؛ `GET` فقط ما لم تُسرَد العملية في `include`؛ والطرق الأخرى تتطلّب موافقة افتراضيًا. يعيد الاستدعاء `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | `list_files`، و`read_file`، و`search_files` على مجلد واحد، ولا تخرج منه أبدًا؛ والمجلد المستبعَد يخفي كل ما يحتويه |
| `folderResources(options)` | `ResourceProvider` | الملفات نفسها بوصفها موارد MCP `folder://<name>/<path>` |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`، و`describe_table`، و`query` (عبارة واحدة للقراءة فقط، وبحدّ أقصى `maxRows` صفًا، والافتراضي 100) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | لـ `DatabaseSync` من `node:sqlite` أو لـ `better-sqlite3`؛ يشغّل الاستعلامات مع `PRAGMA query_only = ON` |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | لـ `pg` (عميل مخصّص، أو مجمَّع pool)؛ كل استعلام داخل `BEGIN READ ONLY` (ويُرفَض على اتصال موجود بالفعل داخل معاملة) … `ROLLBACK` + `pg_advisory_unlock_all()`، مع `SET LOCAL statement_timeout` (الافتراضي 10 ثوانٍ)؛ ولا تحدّ `schemas` إلا السرد والوصف |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`: `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`؛ ويُلغى مع المستدعي؛ و`error` عامّ ما لم تُفعَّل `exposeErrors` |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | فحص العبارة الذي تستخدمه محوِّلات قواعد البيانات (صياغة SQLite وPostgreSQL فقط) |

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

| الدالة | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `Server` لـ MCP يعرض بالضبط ما تسرده `tools`: أسماء الأدوات المعرَّفة و/أو تعريفات `ToolDefinition` (تُعرَّف على حزمة SDK نيابةً عنك؛ ويجوز تمرير التعريف نفسه مرة أخرى، وتُرفَض أداة أخرى باسم محجوز). `resources`: مزوّد `ResourceProvider` واحد أو أكثر؛ وكل قراءة مُتتبَّعة. تعمل الاستدعاءات بوصفها `mcp:<name>` (أو `agentId`)؛ وتُلغى الموافقة التي لا يقرّر فيها أحد خلال `approvalTimeoutMs` (الافتراضي 50 000 ملّي ثانية)؛ ويُشرَح رفض المُدخَلات للعميل، أما الأسباب الأخرى فلا تُشرَح إلا مع `exposeErrorDetails`. والاستدعاء الذي يحمل `progressToken` يتلقّى `notifications/progress` لكل حدث، تُرسَل كلها قبل النتيجة ([إشعارات التقدّم](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | الشيء نفسه، موصولًا بـ stdin/stdout؛ يكتب سطر «جاهز» واحدًا إلى stderr، ويُغلَق حين ينتهي stdin (تُجهَض الاستدعاءات الجارية، وتُلغى الموافقات المعلّقة). القيمة الافتراضية لـ `approvalTimeoutMs` هي 50 000، كما في `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — أدوات أي خادم MCP، في صورة تعريفات `ToolDefinition` |

`GovernedToolHost` هو ما يحتاجه الخادم من حزمة SDK (`listTools`، و`defineTool`، و`executeTool`، و`traceResourceRead`)؛ ويعيد `createSDK()` كائنًا ينفّذه.

## اللبنات الأساسية {#building-blocks}

مكوّنات حزمة SDK مُصدَّرة لأجل الإعدادات المخصّصة: `JevClient`، و`DecisionService`، و`LLMThoughtGenerator`، و`HeuristicController`، و`TypedDecisionController`، و`TypedHypothesisAssessor`، و`PredictionTester`، و`applyThought`، و`assembleThought`، و`assessReadiness`، و`rankHypotheses`، و`rebuildMentalState`، و`describeMentalState`، و`fingerprint`، و`defineThinkerProfile`، و`refineProfile`، و`withRetry`، و`RetryingLLMProvider`، و`OpenAIProvider`، و`AnthropicProvider`، و`FallbackProvider`، و`MonitoredEventStore`، و`ObservedEventStore`، و`EmailIncidentNotifier`، و`WebhookIncidentNotifier`، و`ResendEmailTransport`، و`computeRunCost`، و`FileEventStore`، و`SQLiteEventStore`، و`PostgreSQLEventStore`، وأنواعها الرئيسية.
