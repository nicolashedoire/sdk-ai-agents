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
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey` و`defaultModel` و`baseURL` و`timeout` لكل جهة (`baseURL`: نقطة نهاية متوافقة، مثل واجهة v1 من Azure OpenAI أو خادم نماذج محلي، أو وكيل proxy؛ `timeout`: أطول انتظار لإجابة، بالمللي ثانية، و10 دقائق افتراضيًا، وفي الإجابة المبثوثة أطول انتظار بين حدثين من أحداثها). يستخدم المزوّد الأساسي مدخل جهته، ويستخدم المزوّد الاحتياطي من جهة أخرى مدخل جهته هو. النماذج الافتراضية: `gpt-5.4` و`claude-opus-5`. ويقبل مدخل OpenAI أيضًا `reasoningModels` و`reasoningEffort` و`nativeToolMessages` و`includeStreamUsage`: انظر [نماذج OpenAI](#openai-models) |
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
| `includeStreamUsage` | على واجهة OpenAI البرمجية نفسها | `true`: يُطلَب من الإجابة المبثوثة استهلاكها (`stream_options`)، فتُحتسَب كلفتها؛ `false`: لا يُطلَب. وهو مفعّل افتراضيًا على `https://api.openai.com/v1` وعلى العناوين الإقليمية مثل `https://eu.api.openai.com/v1` (من `baseURL` أو `OPENAI_BASE_URL`)، إذ قد يرفض الخادم المتوافق هذا الحقل (فيُرسَل الطلب عندئذٍ من جديد دونه، إلا إلى واجهة OpenAI البرمجية نفسها التي تقبله) أو يتجاهله، والاستدعاء المبثوث الذي لا يأتي معه استهلاكه يُعَدّ غير مُقاس. ومع ميزانية للكلفة على خادم متوافق يُبلغ عن الاستهلاك (كما تفعل واجهة v1 من Azure OpenAI)، عيّن `true` |
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
| `createAgent(config)` | `AgentImpl` | وكيل خاضع للحوكمة: `run({ message, context?, signal?, onText?, onTextRestart? })`، و`stop(runId?)`، و`addTools()`، و`setPolicy()`، و`id`، و`name`، و`version`، و`configHash`. لا يستطيع تشغيل إلا أدواته الخاصة (`tools`، `capabilities`)، حتى لو ذكر النموذج أداة أخرى مسجَّلة في حزمة SDK؛ ويلغي `signal` التشغيل؛ ويتلقّى `onText` النص الذي يكتبه النموذج أثناء كتابته، و`onTextRestart` الجزء الذي يجب حذفه حين يُعاد تجريب استدعاء فاشل للنموذج (انظر [البث التدريجي للإجابة](../guide/governed-agents#_7-streaming-the-answer)) |
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
| `tools`، `policies` | `[]` | خاضعة للحوكمة كما في كل مكان آخر؛ وتُفحَص سياسات الميزانية والمهلة الزمنية أيضًا قبل كل خطوة، انظر [الحدود والسياسات](../guide/cognitive-agents#limits-and-policies) |
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
  unmeteredTokens?: number;
  costUsd?: number;
}
```

| الحقل | |
| --- | --- |
| `totalUsd` | كلفة الاستدعاءات المعروفة الكلفة؛ وهي مجرّد حدّ أدنى حين تكون `complete` مساوية لـ `false` |
| `complete` | `false` حين تكون كلفة بعض الاستدعاءات مجهولة: `unpricedCalls` أو `unmeteredCalls` أكبر من 0 |
| `unpricedModels`، `unpricedCalls` | النماذج التي لا سعر لها في `pricing`، واستدعاءاتها التي أبلغت عن رموزها |
| `unmeteredModels`، `unmeteredCalls` | نماذج الاستدعاءات التي لم تُبلِغ عن رموز الإدخال والإخراج كليهما، وتلك الاستدعاءات |
| `lines` | سطر لكل نموذج، ونموذج مطلوب، ومصدر: الاستدعاءات، ورموز الاستدعاءات المَقيسة، و`unmeteredCalls` إن وُجدت، و`unmeteredTokens` لرموز تلك الاستدعاءات، و`costUsd` حين يكون للنموذج سعر وبعض استدعاءات السطر مَقيس؛ وقيمة `model` هي `(unknown)` لاستدعاء لم يسجّل اسم نموذج |

## الآثار وإعادة التشغيل والاختبار {#traces-replay-and-testing}

| الدالة | |
| --- | --- |
| `getTrace(runId)`، `exportTrace(runId, 'json' \| 'text')`، `getEvents(runId, filters?)` | قراءة عمليات التشغيل |
| `replay(runId, modifications?, { onEvent? })` | إعادة التنفيذ دون النموذج اللغوي |
| `getReasoningGraph`، `exportReasoningGraph`، `getAlternatives`، `getDecisionPatterns`، `getTraceVisualization` | فهم القرارات |

### الآثار المرجعية {#golden-traces}

| الدالة | تعيد | |
| --- | --- | --- |
| `createGoldenTrace(runId, { name, description?, metadata? })` | `Promise<GoldenTrace>` | تحفظ تشغيلًا مرجعًا، مع اسم الوكيل الخاضع للحوكمة الذي نفّذه (`agentName`) |
| `getGoldenTraces(agent?)`، `getGoldenTrace(id)`، `deleteGoldenTrace(id)`، `exportGoldenTrace(id, 'json' \| 'yaml')` | | `agent`: معرّف وكيل أو اسمه |
| `validateAgainstGoldenTrace(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | `pass` أو `fail` أو `partial`، مع كل فرق (`event_added`، `event_removed`، `event_modified`، `event_order_changed`) وموضعه |
| `detectRegressions(runId, goldenTraceId, options?)` | `Promise<RegressionReport>` | الفروق نفسها في صورة تراجعات، لكلٍّ منها خطورة وأثر: `no_regression` أو `regressions_detected` |
| `replayAndValidate(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | تعيد تشغيل التشغيل ثم تتحقّق من إعادة التشغيل. لا تستدعي إعادة التشغيل أي نموذج: قارنها باستخدام `validateAspects: ['tools', 'policies']` |

تُقارَن عمليات التشغيل **بحسب ما تعنيه أحداثها**، ولا تُقارَن أبدًا بمعرّفات الأحداث (لكل تشغيل معرّفات جديدة). تُطابَق الأحداث بالترتيب: أولًا الأحداث المتطابقة، ثم الأحداث التي لها النوع والموضوع نفسهما (الأداة، أو العملية، أو الإجابة) وتغيّرت بياناتها، ثم الأحداث التي تغيّر نوعها للموضوع نفسه. ما لا يُقارَن أبدًا: معرّفات الأحداث، والأوقات، والبيانات الوصفية، وأحداث `incident.reported` (تسجّل إرسال التنبيهات وتقييدها؛ أما الحدث الذي أطلق الحادثة فيُقارَن)، والقيم التي يكتبها SDK وتتغيّر من تشغيل إلى آخر: مدة استدعاء أداة، واستهلاك الرموز، وفترات الانتظار قبل إعادة المحاولة، ومعرّفات الموافقات، والتشغيل الذي جاءت منه إعادة التشغيل، ووقت الملاحظة وحدثها المصدر. النص الذي يكتبه النموذج بجانب استدعاء أداة لا يُقارَن إلا في `intention.generated`. أما معاملات الأداة ونتيجتها ومُدخلها فتُقارَن دائمًا، أيًّا كانت أسماء مفاتيحها: الوسيط `duration` الذي تغيّر من 30 إلى 60 تغيير. التشغيل الذي يفعل الشيء نفسه مرة أخرى ينجح؛ والأداة التي تُستدعى بوسائط أخرى يُبلَّغ عنها حيث وقع الاستدعاء (`parameters.metric: "churn" → "revenue"`)؛ والاستدعاء المُدرَج قبل استدعاء مطابق استدعاءٌ واحد مضاف؛ و`action.executed` الذي صار `action.failed` تغيير واحد، لا فقدان وإضافة.

| الخيار | يخص | |
| --- | --- | --- |
| `ignoreEventTypes`، `validateAspects` (`intentions`، `actions`، `tools`، `policies`) | التحقق | مقارنة أحداث أقل |
| `tolerance.dataFields` | التحقق | حقول بيانات أخرى تُستبعَد، على أي عمق |
| `tolerance.timestampMs`، `ignoreTimestampDiff` | التحقق | لا يُقارَن التوقيت، نسبةً إلى بداية كل تشغيل، إلا مع `timestampMs` |
| `compareStructureOnly` | التحقق | فروق البيانات تعطي `partial` لا `fail`؛ أما الأحداث المضافة أو المحذوفة أو المنقولة أو التي تغيّر نوعها فتظل تُفشل التحقق |
| `tolerance.ignoreEventTypes`، `tolerance.ignoreDataFields` | التراجعات | مقارنة أحداث أقل، واستبعاد حقول بيانات |
| `tolerance.criticalEventTypes` | التراجعات | أنواع يكون ظهورها أو فقدانها أو تغيّرها حرجًا (افتراضيًا: `run.failed`، `action.failed`، `tool.failed`، `policy.violated`) |
| `tolerance.maxEventCountDiff` | التراجعات | يُتسامَح مع هذا العدد على الأكثر من أحداث سير العمل المضافة أو المحذوفة (فحوص السياسات، وإعادة المحاولات، والموافقات)؛ ولا يُتسامَح أبدًا مع تغيّر النتيجة |
| `tolerance.maxDurationDiff`، `severityThresholds` | التراجعات | لا تُفحَص المدة إلا مع أحدهما: التشغيل الأبطأ بأكثر من `maxDurationDiff` ملّي ثانية تراجُع، بخطورة أعلى عتبة بلغها؛ والتشغيل الأسرع لا يُعدّ تراجعًا أبدًا |

### مجموعات اختبار التراجعات {#regression-suites}

| الدالة | تعيد | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | تُحفَظ في `regressionTestSuitesDir`. `agent`: معرّف وكيل من هذه الحزمة أو اسمه. يجب أن يوجد كل أثر مرجعي؛ وقيمة `input` الافتراضية هي المُدخل الذي تلقّاه التشغيل المرجعي؛ ولا تحتفظ المجموعة بـ`signal` المُدخل ولا بدوال الاستدعاء فيه (`onEvent`، `onText`، `onTextRestart`) |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | الأحدث أولًا |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | كل مجموعات الوكيل، الأقدم أولًا: يرسل كل اختبار مُدخله إلى الوكيل ويقارن التشغيل بأثره المرجعي؛ وفي `suites` نتيجة واحدة لكل مجموعة |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | مجموعة واحدة |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode`: 0 نجحت كل الاختبارات، 1 وجد اختبار تراجعًا، 2 تعذّر تشغيل اختبار (خطأ أو انتهاء المهلة)؛ و`exitCode: false` في الخيارات يعطي 0 |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | في JUnit XML عنصر `<testsuite>` واحد لكل مجموعة؛ والاختبار الذي تعذّر تشغيله (خطأ أو انتهاء المهلة) عنصر `<error>`؛ وتُحذَف المحارف التي لا يستطيع XML احتواءها |

معرّفات الوكلاء جديدة في كل عملية: لذلك تسجّل المجموعة أيضًا **اسم** وكيلها، وتشغّلها عملية أخرى بوكيلها الذي يحمل هذا الاسم (بمعرّف وكيل المجموعة أولًا، إن كان ذلك الوكيل موجودًا في الحزمة). داخل الحزمة الواحدة، معرّف الوكيل له وحده: الوكيلان اللذان يحملان الاسم نفسه (إصداران مثلًا) يحتفظ كلٌّ منهما بمجموعاته وتوكيداته وآثاره المرجعية، والاسم يدلّ عليهم جميعًا. كل وكيل يُنشأ بـ`createAgent` يبقى في حزمته، لذا فإن التطبيق الذي ينشئ وكيلًا لكل طلب يجعل الاسم ملتبسًا: مرّر المعرّفات، أو أنشئ كل وكيل مرة واحدة وأعد استخدامه. المجموعات التي حفظتها إصدارات سابقة لا تحمل اسمًا: فلا تعمل إلا في العملية التي أنشأتها. الخيارات: `parallel` (اختبارات المجموعة في الوقت نفسه)، و`stopOnFirstFailure` (للتشغيل المتتابع فقط: لا يُشغَّل شيء بعد أول اختبار لا ينجح، بما في ذلك المجموعات التالية)، و`filterTags`، و`excludeTags`، و`timeout` (بالملّي ثانية لكل اختبار، 60 000 افتراضيًا، و2 147 483 647 على الأكثر؛ بعدها يُلغى التشغيل ويصير الاختبار `timeout`)، و`detection` (خيارات التراجعات أعلاه).

### التوكيدات {#assertions}

| الدالة | تعيد | |
| --- | --- | --- |
| `defineAssertion(name, condition, { description?, severity?, tags?, agentId?, agentName? })` | `Promise<Assertion>` | لكل عمليات التشغيل، أو لعمليات تشغيل وكيل واحد؛ والوكيل من هذه الحزمة المُعطى عبر `agentId` يُسجَّل اسمه أيضًا. يُرفَض الشرط الذي لا يمكن تقييمه بخطأ `ValidationError` |
| `getAssertions(agent?, tags?)` | `Promise<Assertion[]>` | الأحدث أولًا |
| `evaluateAssertions(runId, assertionIds?)` | `Promise<AssertionEvaluationReport>` | التوكيدات المُعطاة (المعرّف المجهول يرمي خطأً)، وإلا فتوكيدات كل عمليات التشغيل مع توكيدات وكيل هذا التشغيل |
| `deleteAssertion(assertionId)` | `Promise<void>` | |

| `condition.type` | يحتاج إلى | ينجح عندما |
| --- | --- | --- |
| `event_present`، `event_absent` | `eventType` أو `eventTypes` | يظهر أحد الأنواع / لا يظهر أيٌّ منها |
| `event_count` | `eventType` أو `eventTypes`، ثم `count`، أو `minCount` و`maxCount` | يناسب عددُ هذه الأحداث |
| `event_order` | `beforeEventType`، `afterEventType` | يأتي أول حدث من أحدهما قبل أول حدث من الآخر |
| `event_value` | `eventType`، `valuePath`، `valueMatcher` (`eq`، `ne`، `gt`، `gte`، `lt`، `lte`، `contains`، `regex`) | يطابق كل حدث من هذا النوع |
| `custom` | `customEvaluator(events) => boolean` | تعيد الدالة `true` |

يحمل توكيد `custom` دالة، والدالة لا يمكن كتابتها في ملف: لذلك **لا يُحفَظ**، ويبقى ما دامت نسخة SDK التي عرّفته قائمة؛ فعرّفه من جديد عند بدء التشغيل. أما الأنواع الأخرى فتُحفَظ في `assertionsDir`.

### المقارنات والأثر {#comparisons-and-impact}

| الدالة | تعيد | |
| --- | --- | --- |
| `compareRuns(runId1, runId2, { ignoreEventTypes?, focusAspects?, compareStructureOnly?, includeMetadata? })` | `Promise<RunComparison>` | الفروق، مُطابَقة بحسب المعنى كما أعلاه: `event_added`، `event_removed`، `event_modified` (تغيّر النوع)، `data_changed`، `sequence_changed` |
| `getComparisonReport(comparison, 'text' \| 'json' \| 'html')` | `Promise<string>` | |
| `analyzeImpact(beforeRunIds, afterRunIds, { metrics?, includeRecommendations? })` | `Promise<ImpactAnalysis>` | متوسطات قبل وبعد لـ`duration` (ملّي ثانية)، و`cost` (الدولارات الأمريكية لاستدعاءات النموذج التي لها سعر، كما في `getRunCost`)، و`quality` (نسبة الأحداث التي ليست إجراءات فاشلة)، و`success_rate`، مع التغيّرات في السلوك؛ ويُحفَظ في `impactAnalysesDir` |
| `getImpactAnalysis(analysisId)` | `Promise<ImpactAnalysis>` | |
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | `analyzeImpact` على عمليات تشغيل وكيل خاضع للحوكمة (اسمه، أو معرّف وكيل من هذه الحزمة) المُسجَّلة بكل إصدار: قيمة `version` أو `configHash` الخاصة به. يُحسَب كل وكيل يحمل هذا الاسم. تُستبعَد إعادات التشغيل؛ ويجب أن يختلف الإصداران وأن يختارا عمليات تشغيل مختلفة؛ والإصدار المجهول يرمي خطأً يسرد الإصدارات المُسجَّلة |

تسجّل أحداث دورة حياة عمليات تشغيل الوكيل الخاضع للحوكمة (`run.started`، `run.completed`…) قيم `agentName` و`agentVersion` و`configHash` الخاصة به: والوكيلان اللذان يحملان الاسم نفسه وكيل واحد في إصدارين، أو في عمليتين. يشمل الهاش النموذج، وموجّه النظام، و`maxSteps` و`timeout`، وإعدادات المزوّد، و`version`، والقدرات، والأدوات (الاسم، والوصف، والإصدار، ومخطط المعاملات، والبيانات الوصفية، وإعدادات إعادة المحاولة)، وسياسات الوكيل نفسه مع قواعدها؛ ويتغيّر مع `setPolicy` و`addTools`، ويسجّل كل تشغيل الهاش الذي بدأ به. أما عمليات التشغيل التي سجّلتها إصدارات سابقة فلا تحمل إلا المعرّف والإصدار.

### الاستعلامات عبر كل عمليات التشغيل {#queries-across-runs}

| الدالة | تعيد |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>`: الأحداث المطابقة بترتيبها الزمني (`limit` على الأكثر)، وعدد الأحداث في النطاق، وعدد المطابقة منها |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

للمرشّح **نطاق** — `runId` (ومن دونه: كل عمليات التشغيل)، و`since`، و`until` — و**شروط** — `type`، و`agentId`، و`userId`، و`sessionId`، و`dataFilters` (`{ path, operator, value?, regex? }`)، و`metadataFilters` (`{ field, operator, value? }`). تُجمَع الشروط بـ`logic` (`and` افتراضيًا؛ و`or`: شرط واحد على الأقل)، ثم تُنفى بـ`not`؛ أما النطاق فلا يُنفى أبدًا. يجيب كل مخزن مُضمَّن: مخزن الملفات يقرأ ملف كل تشغيل مرة واحدة في كل استعلام، ومخازن SQL تستعلم قاعدة البيانات. حين يجب أن تتحقّق كل الشروط، ترشّح قاعدة البيانات الأحداث بنفسها بحسب النوع والمعرّفات؛ ومع `or` أو `not` يعيد المخزن كل أحداث النطاق وتُفحَص الشروط في الذاكرة، وهذا أكثر كلفة مع قاعدة بيانات كبيرة. تحتفظ الأحداث التي تقع في الملّي ثانية نفسها بترتيب تشغيلها: عمليات التشغيل بحسب المعرّف، ثم بالترتيب الذي سجّلها به كل تشغيل.

## الأحداث المباشرة {#live-events}

المستمِع (listener) هو `(event: Event) => unknown`. يتلقّى حدثًا واحدًا في كل مرة، بترتيب كل تشغيل، بمجرّد أن يقبله المخزن؛ ويُنتظَر الوعد الذي يعيده قبل حدثه التالي. لا تنتظره عمليات التشغيل أبدًا، ويُبلَّغ عن أخطائه، ولا تُرمى أبدًا داخل التشغيل. ولا ينتظره إلا `maxQueued` حدثًا على الأكثر (10 000 افتراضيًا)؛ وبعد ذلك تُسقَط الأحداث الجديدة بالنسبة إليه ويُبلَّغ عنها بخطأ `LiveEventsDroppedError`. انظر [التقدّم المباشر](../guide/observability#live-progress).

| الواجهة | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | كل حدث من أحداث التشغيل؛ ولا تعيد `run()` نتيجتها إلا بعد أن يفرغ المستمِع من كل واحد منها، أو قبل ذلك حين يكون التشغيل قد أُوقِف أو أُلغي أو حين يُلغى `signal` (ويُلغى عندئذٍ اشتراك المستمِع). والمستمِع نفسه لا يُسجَّل |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | الشيء نفسه لتشغيل معرفي، تُنهي `limits.timeoutMs` الخاصة به الانتظارَ أيضًا |
| `replay(runId, modifications?, { onEvent })` | الشيء نفسه لإعادة تشغيل، وهي لا يمكن إلغاؤها: فتنتظر دائمًا |
| `executeTool(name, params, { onEvent })` | أحداث الاستدعاء، وأحداث عمليات التشغيل التي تبدؤها أداته، على مستوى واحد فقط: يتلقّى المعالج المستمِع بوصفه `context.onEvent`، وتمرّره `governedAgentTool` و`cognitiveAgentTool` إلى وكيلهما (أما الوكيل المبني يدويًا على مخزن دون أحداث مباشرة فيعمل من دونه). ويُنهي `signal` الانتظار |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: كل حدث من كل تشغيل يطابق المرشِّح (`agentId` هو `metadata.agentId`)، إلى أن تستدعي الدالة المُعادة، التي تُسقِط الأحداث التي لم تُسلَّم بعد. وتشغيلات مجموعات اختبار التراجعات وإعادات التشغيل تشغيلات حقيقية: فيتلقى المستمِع أحداثها أيضًا (لا تحفظ المجموعة `onEvent` ولا `onText` من مُدخَلها) |
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
