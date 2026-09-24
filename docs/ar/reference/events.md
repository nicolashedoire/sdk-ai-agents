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
| `run.started` | `input`، و`mode` (`cognitive`، أو `tool` لاستدعاء خارج وكيل مثل استدعاء MCP، أو `resource` لقراءة مورد MCP، أو غائب لعمليات التشغيل الخاضعة للحوكمة)، و`replayOf?` |
| `run.completed` | `output`، و`decision?` (معرفي) |
| `run.failed` | `error`، و`steps?`، و`uri?` (قراءة مورد فاشلة) |
| `run.cancelled` / `run.stopped` | `reason` |

## الاستدلال والإجراءات {#reasoning-and-actions}

| النوع | البيانات |
| --- | --- |
| `intention.generated` | `message`، و`toolCalls`، و`model`، و`requestedModel`، و`usage` — أو `intention` لإجابة نهائية معرفية |
| `policy.checked` / `policy.violated` | `intention`، و`validation` / `reason`، و`violatedPolicies` (`allowed-tools` حين يستخدم مستدعٍ أداة لم تُعطَ له؛ ومعرّف سياسة الميزانية حين تُستنفَد ميزانية استدعاءاتها) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`، و`intention`، و`policyId` (`tool-requires-approval` حين طلبتها `metadata.requiresApproval` الخاصة بالأداة نفسها)، و`reason?` (`cancelled before a decision` حين تخلّى المستدعي أو توقّف التشغيل، و`no decision within N ms` بعد `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`، و`parameters`، و`result` / `error`، و`duration` — ويسجّل `action.failed` أيضًا الاستدعاء المرفوض بسبب معاملات غير صالحة (قبل أي سياسة) أو لأن مستدعيه غادر بعد موافقة |
| `tool.called` | `toolName`، و`parameters` |
| `tool.retry` | `toolName`، و`retry`، و`delayMs`، و`error` |
| `provider.fallback` | `primaryProvider`، و`usedProvider`، و`attemptedProviders` |
| `provider.retry` | `provider`، و`model`، و`retry`، و`delayMs`، و`error` |
| `provider.answer_discarded` | `provider`، و`model`، و`usage`، و`reason` — إجابة دفع المورّد كلفتها وأبلغ عن استهلاكها، لكن المزوّد لم يستطع استخدامها (إجابة من OpenAI بلا أي خيار)؛ تُحتسَب في التكاليف والميزانيات |
| `resource.read` | `uri`، و`mimeType?`، و`bytes`، و`sha256` للمحتوى المُقدَّم (لا يُخزَّن المحتوى نفسه) |

تنتمي `tool.failed` و`intention.rejected` و`error.occurred` إلى النوع `EventType`، لكن حزمة SDK لا تسجّلها أبدًا: استدعاء الأداة الفاشل حدثٌ من نوع `action.failed`، والاستدعاء الذي ترفضه سياسةٌ حدثٌ من نوع `policy.violated`، والذي يُرفض عند الموافقة حدثٌ من نوع `approval.rejected`.

## الإدراك المعرفي {#cognition}

| النوع | البيانات |
| --- | --- |
| `cognition.started` | `schemaVersion` (2؛ غائب في عمليات التشغيل الأقدم)، و`goal`، و`context?`، و`observations` (المقدَّمة مع المشكلة)، و`commitRules`، و`knowledge?` (`scope`، و`items` المستدعاة من عمليات تشغيل سابقة، و`error?` حين يفشل المخزن)، و`profile`، و`controller`، و`assessor`، و`evaluator?`، و`allowedTools`، و`limits` |
| `cognition.operation_selected` | `step`، و`operation`، و`controller`، و`available`، و`stepsRemaining`، و`forced?` (فرض المحرّك قرارًا)، و`confidence?`، و`probabilities?`، و`rationale?`، و`fallbackFrom?` |
| `cognition.thought` | `step`، و`operation`، و`patch`، و`issues`، و`failed`، و`ignoredFields?`، و`model?`، و`requestedModel?`، و`usage?` (`promptTokens`، `completionTokens`، `calls`، `unmeteredCalls?` — الاستدعاءات التي لم تُبلِغ عن عدد الرموز) |
| `cognition.operation_failed` | `step`، و`operation`، و`error`، و`recovery?` — وكذلك `model?`، و`requestedModel?`، و`usage?` لعملية قطعها إيقاف أو انتهاء مهلة بعد محاولات مدفوعة |
| `cognition.evaluated` | `step`، و`predictionId`، و`hypothesisId`، و`evaluator` (`id`، `version`)، و`verdict`، و`observed?`، و`summary?`، و`context?`، و`metrics?`، و`causeCandidates?`، و`reason?`، و`durationMs` — التقرير الكامل لاختبار تنبؤ |
| `cognition.concluded` | `decision`، و`status` (`committed`، `provisional`، `abstain`)، و`confidence`، و`steps`، و`evidenceRevision`، و`hypotheses`، و`predictions` |
| `cognition.knowledge_recorded` | `scope`، و`findings` (العبارة، والنوع، والنطاق، و`revises?`، و`difference?`، و`evidence`: كل اختبار مع `runId`، و`predictionId`، و`verdict`، و`expected`، و`observed`، والمقيِّم)، و`error?` حين يفشل المخزن. يُلحَق بعد `run.completed` أو `run.failed` أو `run.cancelled`، ولا يُلحَق إلا حين يكون التشغيل قد اختبر شيئًا |
| `cognition.feedback` | `feedback` (`verdict`، `agreement?`، `wrongAbout?`، …)، و`profileId`، و`profileVersionBefore`، و`profileVersionAfter` |
| `decision.evaluated` | `client`، و`purpose` (`operation_selection`، `hypothesis_assessment`، `direct`)، و`model`، و`state`، و`questions`، و`answers` (فارغة إذا رُفضت الإجابة)، و`usage?` (غائب إذا لم تُبلِغ الواجهة الخلفية عن عدد الرموز)، و`error?` (سبب رفض إجابة مدفوعة)، و`step?` |

## العمليات التشغيلية {#operations}

| النوع | البيانات |
| --- | --- |
| `incident.reported` | `incident`، و`deliveries`، و`suppressed?` (`throttled`، `below minimum severity`) |

الحالة الذهنية لتشغيل معرفي هي حصيلة طيّ رقع `cognition.thought` الخاصة به بترتيب `step`، انطلاقًا من الهدف والملاحظات الموجودة في `cognition.started`. تحمل رقعُ التفكير الملاحظاتِ الناتجة أثناء التشغيل، مع `sourceEventId` الذي يشير إلى حدث `action.executed` أو `cognition.evaluated` الذي يحتفظ بالحمولة الكاملة. وعمليات التشغيل التي لا تحتوي على `schemaVersion` يُعاد بناؤها بالقواعد التي سُجِّلت بها.
