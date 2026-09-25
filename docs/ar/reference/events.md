# فهرس الأحداث

لكل حدث الغلاف نفسه:

```ts
interface Event {
  id: string;
  runId: string;
  type: EventType;
  timestamp: number;
  data: Record<string, unknown>;
  metadata?: { agentId?: string; agentVersion?: string; profileId?: string; profileVersion?: string; … };
}
```

## دورة حياة التشغيل {#run-lifecycle}

| النوع | البيانات |
| --- | --- |
| `run.started` | `input`، و`mode` (`cognitive`، أو `study` لتشغيل دراسة، أو `study-amendment` للتشغيل الذي يصنّف تعديلًا، أو `tool` لاستدعاء خارج وكيل مثل استدعاء MCP، أو `resource` لقراءة مورد MCP، أو غائب لعمليات التشغيل الخاضعة للحوكمة)، و`replayOf?` |
| `run.completed` | `output`، و`decision?` (معرفي) |
| `run.failed` | `error`، و`steps?`، و`uri?` (قراءة مورد فاشلة) |
| `run.cancelled` / `run.stopped` | `reason` |

## الاستدلال والإجراءات {#reasoning-and-actions}

| النوع | البيانات |
| --- | --- |
| `intention.generated` | `message`، و`toolCalls`، و`model`، و`requestedModel`، و`usage` — أو `intention` لإجابة نهائية معرفية |
| `policy.checked` | `intention`، و`validation`: حكم محرّك الإجراءات على استدعاء أداة. ويسجّل محرّك السياسات أيضًا حدثًا لكل سياسة يفحصها — `policyId`، و`policyType`، و`intention`، و`conditionEvaluated?`، و`validationResult`، و`applied` (`true` حين انطبقت السياسة ورفضت)، و`reason` — قبل استدعاء الأداة، وقبل كل خطوة من تشغيل معرفي لسياسات الميزانية والمهلة الزمنية التي يمكن أن تنطبق على خطوة (وتكون `intention` عندها `{ type: 'continue' }`) |
| `policy.violated` | `intention`، و`reason`، و`violatedPolicies` (`allowed-tools` حين يستخدم مستدعٍ أداة لم تُعطَ له؛ ومعرّف سياسة الميزانية حين تُستنفَد ميزانية استدعاءاتها)، و`step` حين ترفض سياسة ميزانية أو مهلة زمنية خطوةً من تشغيل معرفي، أو `passage` مرحلةً من دراسة (وتكون `intention` عندها `{ type: 'continue' }`) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`، و`intention`، و`policyId` (`tool-requires-approval` حين طلبتها `metadata.requiresApproval` الخاصة بالأداة نفسها)، و`reason?` (`cancelled before a decision` حين تخلّى المستدعي أو توقّف التشغيل، و`no decision within N ms` بعد `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`، و`parameters`، و`result` / `error`، و`duration` — ويسجّل `action.failed` أيضًا الاستدعاء المرفوض بسبب معاملات غير صالحة (قبل أي سياسة) أو لأن مستدعيه غادر بعد موافقة |
| `tool.called` | `toolName`، و`parameters` |
| `tool.retry` | `toolName`، و`retry`، و`delayMs`، و`error` |
| `provider.fallback` | `primaryProvider`، و`usedProvider`، و`attemptedProviders` |
| `provider.retry` | `provider`، و`model`، و`retry`، و`delayMs`، و`error` |
| `provider.answer_discarded` | `provider`، و`model`، و`requestedModel?`، و`usage`، و`reason` — إجابة دفع المورّد كلفتها وأبلغ عن استهلاكها، لكن المزوّد لم يستطع استخدامها (إجابة من OpenAI بلا أي خيار)؛ تُحتسَب في التكاليف وفي الميزانيات لكل فترة |
| `resource.read` | `uri`، و`mimeType?`، و`bytes`، و`sha256` للمحتوى المُقدَّم (لا يُخزَّن المحتوى نفسه) |

تنتمي `tool.failed` و`intention.rejected` و`error.occurred` إلى النوع `EventType`، لكن حزمة SDK لا تسجّلها أبدًا: استدعاء الأداة الفاشل حدثٌ من نوع `action.failed`، والاستدعاء الذي ترفضه سياسةٌ حدثٌ من نوع `policy.violated`، والذي يُرفض عند الموافقة حدثٌ من نوع `approval.rejected`.

## الإدراك المعرفي {#cognition}

| النوع | البيانات |
| --- | --- |
| `cognition.started` | `schemaVersion` (2؛ غائب في عمليات التشغيل الأقدم)، و`goal`، و`context?`، و`observations` (المقدَّمة مع المشكلة)، و`commitRules`، و`knowledge?` (`scope`، و`items` المستدعاة من عمليات تشغيل سابقة، و`error?` حين يفشل المخزن)، و`profile`، و`controller`، و`assessor`، و`evaluator?`، و`allowedTools`، و`limits` |
| `cognition.operation_selected` | `step`، و`operation`، و`controller`، و`available`، و`stepsRemaining`، و`forced?` (فرض المحرّك قرارًا)، و`confidence?`، و`probabilities?`، و`rationale?`، و`fallbackFrom?` |
| `cognition.thought` | `step`، و`operation`، و`patch`، و`issues`، و`failed`، و`ignoredFields?`، و`model?`، و`requestedModel?`، و`usage?` (`promptTokens`، `completionTokens`، `calls`، `unmeteredCalls?` — الاستدعاءات التي لم تُبلِغ عن رموز الإدخال والإخراج كليهما، `unmeteredTokens?` — رموزها) |
| `cognition.operation_failed` | `step`، و`operation`، و`error`، و`recovery?` — وكذلك `model?`، و`requestedModel?`، و`usage?` لعملية قطعها إيقاف أو انتهاء مهلة بعد محاولات مدفوعة |
| `cognition.evaluated` | `step`، و`predictionId`، و`hypothesisId`، و`evaluator` (`id`، `version`)، و`verdict`، و`observed?`، و`summary?`، و`context?`، و`metrics?`، و`causeCandidates?`، و`reason?`، و`durationMs` — التقرير الكامل لاختبار تنبؤ |
| `cognition.concluded` | `decision`، و`status` (`committed`، `provisional`، `abstain`)، و`confidence`، و`steps`، و`evidenceRevision`، و`hypotheses`، و`predictions` |
| `cognition.knowledge_recorded` | `scope`، و`findings` (العبارة، والنوع، والنطاق، و`revises?`، و`difference?`، و`evidence`: كل اختبار مع `runId`، و`predictionId`، و`verdict`، و`expected`، و`observed`، والمقيِّم)، و`error?` حين يفشل المخزن. يُلحَق بعد `run.completed` أو `run.failed` أو `run.cancelled`، ولا يُلحَق إلا حين يكون التشغيل قد اختبر شيئًا |
| `cognition.feedback` | `feedback` (`verdict`، `agreement?`، `wrongAbout?`، …)، و`profileId`، و`profileVersionBefore`، و`profileVersionAfter` |
| `decision.evaluated` | `client`، و`purpose` (`operation_selection`، `hypothesis_assessment`، `direct`)، و`model`، و`state`، و`questions`، و`answers` (فارغة إذا رُفضت الإجابة)، و`usage?` (غائب إذا لم تُبلِغ الواجهة الخلفية عن عدد الرموز)، و`error?` (سبب رفض إجابة مدفوعة)، و`step?` |

## الدراسات {#studies}

تسجّل عمليات تشغيل الدراسة (`mode: 'study'`) وعمليات التشغيل التي تصنّف تعديلاتها (`mode: 'study-amendment'`) هذه الأحداث. ويحمل كلٌّ منها `id` الدراسة بوصفه `metadata.agentId` واسمها بوصفه `metadata.studyName`. وتسجّل عمليات البحث أيضًا أحداث استدعاءات أدواتها الخاضعة للحوكمة (`action.executing`، و`policy.checked`، و`tool.called`، و`action.executed`) في تشغيل الدراسة. انظر [الدراسات](../guide/studies).

| النوع | البيانات |
| --- | --- |
| `study.started` | `name`، و`charter` (`object`، `question`، `objective`، `needs`، `leads`، `scope`، `capability?`، `analogues`)، و`charterHash` (SHA-256)، و`language`، و`model?`، و`sources` (أسماء الأدوات)، و`limits`، و`driftThreshold`، و`amendments` (المقبولة منها: `number`، `text`)، و`resumeAt?` (حين يُستأنَف تشغيل: أول مرحلة بقي فيها عمل) |
| `study.passage_started` | `passage`، و`number` (من 1 إلى 7)، و`amendments` (أرقام التعديلات المقبولة السارية)، و`reopenedBy?` و`focus?` و`reason?` حين تكون مرحلة لاحقة قد أعادت فتحها |
| `study.passage_completed` | `passage`، و`attempts` (2 حين أعادها الحارس)، و`keptAttempt?` (1 حين كانت المحاولة الأولى أفضل من الإعادة فاحتُفظ بها)، و`items` (كلٌّ منها مع `collection`، و`id`، و`statement`، و`status`، و`sources`، و`servesObjective`، وحقول الادعاء الأخرى، وحقوله الخاصة)، و`reopenedBy?`، و`reopen?` (`passage`، `focus`، `reason`: المرحلة السابقة التي تطلب إعادة فتحها؛ ولا تكون مكتملة إلى أن تُشغَّل من جديد)، و`resumed?` (استأنفها تشغيلٌ لإتمامها فقط) |
| `study.search` | `passage`، و`purpose` (`research`، أو `priorArt` للأعمال السابقة لادعاءات الجِدّة)، و`tool`، و`query`، و`servesObjective`، و`claims?` (ادعاءات الجِدّة التي يبحث عنها)، و`resultIds`، و`results` (`id`، `title`، `locator`، `date?`)، و`error?` (فشل البحث)، و`skipped?` (`maxSearches`: لم يُجرَ) |
| `study.model_called` | `purpose` (`passage`، `queries`، `check`، `priorArtQueries`، `priorArtCheck`، `amendment`)، و`passage?`، و`model?`، و`requestedModel?`، و`usage` (`promptTokens`، `completionTokens`، `calls`، `unmeteredCalls?`، `unmeteredTokens?`: حدث واحد للاستدعاء وإصلاحه)، و`failed?` (سبب تعذّر استخدام الرد) — يُحتسَب في التكاليف وفي الميزانيات لكل فترة |
| `study.drift_rejected` | `passage`، و`collection`، و`item` (`id?`، `statement?`، `servesObjective?`)، و`reason` (`code`، `params?`، `message`)، و`by` (`guardian`: حُكم عليه بأنه خارج عن الهدف؛ `schema`: رُفض قبل ذلك، مثلًا لغياب `servesObjective`)، و`attempt` (2 في الإعادة) |
| `study.capability_demoted` | `passage`، و`item` (معرّف البنية)، و`name`، و`reason` (`code`، `params?`، `message`): قدرة حكم عليها الحارس بأنها مجرد أسرع أو أرخص، فصارت الآن تحسينًا |
| `study.amendment_accepted` / `study.amendment_refused` | `number?` (للمقبول فقط)، و`text`، و`verdict` (`refines`، `conflicts`، `changesObjective`، `unclassified`)، و`accepted`، و`reason` (`code`، `params?`، `message`؛ ولـ `unclassified`: `amendmentUnclassified` أو `amendmentTimedOut` أو `amendmentCancelled` أو `amendmentPolicy`)، و`charterHash` — في التشغيل الخاص بالتعديل |
| `study.result_recorded` | `card`، و`resultAndError` (`result`، `error?`)، و`conclusionAndMemory?` — يُلحَق بالتشغيل الذي كتب البطاقة، بعد نهايته |
| `study.completed` | `status`، و`passages` (`passage`، `state`)، و`stats` لهذا التشغيل (`modelCalls` التي أجاب عنها المزوّد، `searches`، `searchesSkipped`، `redos`، `loops`، `steps`) |
| `study.failed` | `status` (`stopped` أو `failed` أو `cancelled`)، و`stoppedBy?`، و`error`، و`passages`، و`stats` لهذا التشغيل، و`partial: true` — ثم `run.failed`، أو `run.cancelled` |

`study.model_called` هو ما يقرؤه `getRunCost` والميزانيات بالنسبة إلى الدراسة. وحين يُقارَن تشغيلان، تُطابَق أحداث الدراسة بحسب المرحلة (و`study.model_called` بحسب الغرض والمرحلة)، ولا يُقارَن `usage` الخاص بـ `study.model_called`. ويحتوي تشغيل التعديل على `run.started`، و`policy.violated` حين ترفض سياسةُ ميزانية التصنيفَ، و`study.model_called` حين يجيب المزوّد، وحدث التعديل، و`run.completed`.

## العمليات التشغيلية {#operations}

| النوع | البيانات |
| --- | --- |
| `incident.reported` | `incident`، و`deliveries`، و`suppressed?` (`throttled`، `below minimum severity`) |

الحالة الذهنية لتشغيل معرفي هي حصيلة طيّ رقع `cognition.thought` الخاصة به بترتيب `step`، انطلاقًا من الهدف والملاحظات الموجودة في `cognition.started`. تحمل رقعُ التفكير الملاحظاتِ الناتجة أثناء التشغيل، مع `sourceEventId` الذي يشير إلى حدث `action.executed` أو `cognition.evaluated` الذي يحتفظ بالحمولة الكاملة. وعمليات التشغيل التي لا تحتوي على `schemaVersion` يُعاد بناؤها بالقواعد التي سُجِّلت بها.
