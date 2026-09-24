# البنية المعمارية

![البنية المعمارية لحزمة SDK](/images/architecture.svg){.illustration}

## الطبقة المعرفية (v0.2) {#cognitive-layer-v0-2}

يضيف الإصدار 0.2 طبقة استدلال فوق بيئة التشغيل الخاضعة للحوكمة الموصوفة أدناه. وهي مبنية من أجزاء صغيرة قابلة للاستبدال:

| الجزء | الوحدة | المسؤولية |
| --- | --- | --- |
| `CognitiveAgent` | `src/cognition/cognitive-agent.ts` | حلقة التشغيل، والإلغاء، والمهلة الزمنية، والملاحظات الراجعة |
| `OperationSelector` | `src/cognition/operation-selector.ts` | يحسب العمليات المتاحة، ويسأل المتحكّم، ويفرض القرار النهائي |
| المتحكّمات | `src/cognition/cognitive-controller.ts`، `typed-decision-controller.ts` | اختيار العملية التالية بالقاعدة الإرشادية أو بالاستناد إلى Jev |
| `OperationPerformer` | `src/cognition/operation-performer.ts` | يوزّع العمل على مولّد الأفكار، أو الباحث عن المعلومات، أو مختبِر التنبؤات، أو المقيِّم التقديري |
| قبول الرقع | `src/cognition/patch-admission.ts`، `thought-fields.ts`، `thought-patch.ts` | مدخل وحيد لكل فكرة: الحقول المسموح بها لكل عملية، والحقول الخاصة بالمحرّك وحده، وحسم القرار |
| الأدلة | `src/cognition/observation-records.ts`، `evidence-transitions.ts`، `contradiction-transitions.ts` | منشأ الملاحظات، ومراجعات الحقائق، والمقارنات، ونتائج الاختبارات، والتناقضات وحلولها |
| عرض الحالة | `src/cognition/mental-state-view.ts` | عرض مضغوط للحالة من أجل موجّهات الأفكار ومجموعات بيانات المتحكّم: الجاهزية، والترتيب، والتجارب التي أُجريت بالفعل |
| `PredictionTester` | `src/cognition/outcome-evaluator.ts` | يشغّل `OutcomeEvaluator` الخاص بك على تنبؤ معلّق ويسجّل التقرير |
| حارس الاستنتاج | `src/cognition/decision-readiness.ts` | الترتيب، وفحص الجاهزية، وcommitted / provisional / abstain |
| `LLMThoughtGenerator` | `src/cognition/llm-thought-generator.ts`، `thought-prompts.ts` | موجّه واحد لكل عملية، وJSON صارم، وتحقّق Zod، وإصلاح واحد |
| `InformationSeeker` | `src/cognition/information-seeker.ts` | اختيار الأداة بمحرّك الاستدلال الأصيل، والتنفيذ عبر محرّك الإجراءات |
| المُختزِل (Reducer) | `src/cognition/mental-state-reducer.ts`، `hypothesis-transitions.ts` | تطبيق نقي وحتمي لرقع التفكير مع الثوابت، ذو إصدارات عبر `schemaVersion` |
| إعادة التشغيل | `src/cognition/mental-state-replay.ts` | إعادة بناء الحالة الذهنية ومجموعة بيانات المتحكّم من الأحداث |
| الملفات | `src/cognition/thinker-profile.ts`، `profile-distiller.ts`، `profile-learning.ts` | مخطط الملف، وعرضه، وتحسينه، واستخلاصه |
| المقيِّمات التقديرية | `src/cognition/hypothesis-assessor.ts` | `compare` بالقرارات المُنمَّطة: يُسأل عن الأدلة دون المفكّر، ويُسأل عن الملاءمة للمقترحات فقط |
| المُسجِّل والمصنع | `src/cognition/cognitive-run-recorder.ts`، `create-cognitive-agent.ts` | أشكال أحداث التشغيل المعرفي؛ وتجميع وكيل من إعداداته ومن خدمات حزمة SDK |

وحول ذلك: `src/decisions` (القرارات المُنمَّطة، وعميل Jev، وخدمة القرارات)، و`src/costs` (التسعير وتكاليف التشغيل)، و`src/resilience` (سياسة إعادة المحاولة والمزوّد الذي يعيد المحاولة)، و`src/incidents` (القواعد، والمُبلِّغون، ومخزن الأحداث المراقَب)، و`src/mcp` (الخادم والعميل، منشورَين بوصفهما `@sdk-ai-agents/core/mcp`).

توثّق بقية هذه الصفحة بيئة التشغيل الخاضعة للحوكمة (v0.1).

## الملخّص التنفيذي {#executive-summary}

يتبع SDK_AI_Agents بنية معمارية قائمة على الاستناد إلى الأحداث مع فصل صارم بين الاستدلال والفعل. وتخفي حزمة SDK التعقيد الداخلي خلف واجهة API بسيطة وبديهية.

## النمط المعماري {#architecture-pattern}

**النمط الرئيسي:** الاستناد إلى الأحداث (Event-Sourcing) مع فصل المسؤوليات

- **محرّك الاستدلال** (Reasoning Engine): يولّد النوايا من النموذج اللغوي (دون آثار جانبية)
- **محرّك الإجراءات** (Action Engine): ينفّذ النوايا بعد التحقّق منها
- **محرّك السياسات** (Policy Engine): يتحقّق من النوايا مقابل السياسات
- **مخزن الأحداث** (Event Store): مصدر الحقيقة الوحيد لجميع الأحداث

## نظرة عامة على المكوّنات {#component-overview}

### 1. طبقة SDK API (الواجهة، Facade) {#_1-sdk-api-layer-facade}

**المسؤوليات:**
- واجهة عامة بسيطة وبديهية
- تحويل استدعاءات API إلى أحداث داخلية
- إعدادات افتراضية ذكية
- إدارة دورة حياة حزمة SDK والوكلاء

**الملفات:**
- `src/sdk.ts`: التنفيذ الرئيسي (`SDKImpl`)
- `src/agent.ts`: تنفيذ الوكيل (`AgentImpl`)
- `src/index.ts`: التصديرات العامة

**الواجهات الرئيسية:**
```typescript
interface SDK {
  createAgent(config: AgentConfig): Agent
  defineTool(tool: ToolDefinition): Tool
  replay(runId: string): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  defineGlobalPolicy(policy: Policy): void
}

interface Agent {
  run(input: RunInput): Promise<RunResult>
}
```

### 2. محرّك الاستدلال {#_2-reasoning-engine}

**المسؤوليات:**
- التكامل مع مزوّد النموذج اللغوي (OpenAI/Anthropic)
- توليد نوايا مهيكلة من ردود النموذج اللغوي
- إدارة سياق المحادثة
- إطلاق أحداث الاستدلال

**الملف:** `src/engines/reasoning-engine.ts`

**القيود:**
- لا يستطيع أبدًا تنفيذ أداة مباشرةً
- لا يستطيع أبدًا التسبّب في أثر جانبي
- لا يولّد إلا نوايا مهيكلة

**التبعيات:**
- مزوّد النموذج اللغوي (نمط الاستراتيجية، Strategy Pattern)
- مخزن الأحداث (إطلاق الأحداث)

### 3. محرّك الإجراءات {#_3-action-engine}

**المسؤوليات:**
- استقبال النوايا والتحقّق منها
- تنفيذ الأدوات عبر سجل الأدوات (Tool Registry)
- تطبيق السياسات عبر محرّك السياسات
- إطلاق أحداث الإجراءات

**الملف:** `src/engines/action-engine.ts`

**القيود:**
- يجب أن يمرّ كل إجراء عبر محرّك الإجراءات
- التحقّق مطلوب قبل التنفيذ
- يُطلَق حدث لكل إجراء

**التبعيات:**
- محرّك السياسات (التحقّق)
- سجل الأدوات (التنفيذ)
- مخزن الأحداث (إطلاق الأحداث)
- مدير الموافقات (اختياري)
- متتبّع الميزانية (اختياري)

### 4. محرّك السياسات {#_4-policy-engine}

**المسؤوليات:**
- التحقّق من النوايا مقابل السياسات النشطة
- تطبيق السياسات العامة والخاصة
- فحص الميزانيات، والمهل الزمنية، وقوائم السماح
- إطلاق أحداث التحقّق

**الملف:** `src/engines/policy-engine.ts`

**القيود:**
- الرفض افتراضيًا: كل شيء ممنوع ما لم يُؤذَن به صراحةً
- فحص إلزامي قبل كل إجراء

**التبعيات:**
- مخزن الأحداث (إطلاق أحداث التحقّق)
- متتبّع الميزانية (اختياري)
- مقيِّم الشروط

### 5. محرّك إعادة التشغيل {#_5-replay-engine}

**المسؤوليات:**
- إعادة تشغيل عمليات التنفيذ انطلاقًا من الأحداث المحفوظة
- إعادة تشغيل حتمية دون استدعاء النموذج اللغوي
- توليد أحداث إعادة تشغيل جديدة

**الملف:** `src/engines/replay-engine.ts`

**القيود:**
- لا تستخدم إعادة التشغيل إلا الأحداث المحفوظة
- لا استدعاء للنموذج اللغوي أثناء إعادة التشغيل
- تعيد إعادة التشغيل إنتاج التسلسل المنطقي نفسه

**التبعيات:**
- مخزن الأحداث (قراءة الأحداث)
- محرّك الإجراءات (تنفيذ النوايا)

### 6. مخزن الأحداث {#_6-event-store}

**المسؤوليات:**
- حفظ الأحداث (بالإلحاق فقط، append-only)
- استرجاع الأحداث حسب runId
- تصفية الأحداث والاستعلام عنها
- تجريد لمختلف التنفيذات

**الملفات:**
- `src/stores/event-store.ts`: الواجهة `IEventStore`
- `src/stores/file-event-store.ts`: تنفيذ قائم على الملفات
- `src/stores/sql-event-store.ts`: تنفيذ SQL عام
- `src/stores/sqlite-event-store.ts`: تنفيذ لـ SQLite
- `src/stores/postgresql-event-store.ts`: تنفيذ لـ PostgreSQL

**الواجهة:**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  queryEvents?(filters?: EventFilters): Promise<EventQueryResult>
  backup?(): Promise<BackupData>
  restore?(backupData: BackupData): Promise<void>
}
```

### 7. سجل الأدوات {#_7-tool-registry}

**المسؤوليات:**
- إدارة الأدوات المُصرَّح بها
- التحقّق من مخطط المُدخَلات (Zod)
- تنفيذ الأدوات مع التحقّق
- قائمة سماح صارمة (الرفض افتراضيًا)

**الملف:** `src/registry/tool-registry.ts`

**القيود:**
- رفض تلقائي للأدوات غير المُصرَّح بها
- تحقّق إلزامي قبل التنفيذ
- قائمة سماح صارمة

**التبعيات:**
- Zod (التحقّق من المخططات)

### 8. سجل القدرات {#_8-capability-registry}

**المسؤوليات:**
- إدارة القدرات (مجموعات الأدوات)
- ربط الأداة ↔ القدرة

**الملف:** `src/registry/capability-registry.ts`

### 9. تجريد مزوّد النموذج اللغوي {#_9-llm-provider-abstraction}

**المسؤوليات:**
- تجريد الفروق بين مزوّدي النماذج اللغوية
- توحيد صيغ الطلبات والاستجابات
- دعم مزوّدين متعدّدين (OpenAI، Anthropic)
- تحويل تلقائي إلى البديل

**الملفات:**
- `src/providers/llm-provider.ts`: الواجهة `LLMProvider`
- `src/providers/openai-provider.ts`: تنفيذ OpenAI
- `src/providers/anthropic-provider.ts`: تنفيذ Anthropic
- `src/providers/fallback-provider.ts`: مزوّد مع بديل احتياطي
- `src/providers/provider-factory.ts`: مصنع لإنشاء المزوّدين

**الواجهة:**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
  readonly nativeToolMessages?: boolean // tool calls and results in the vendor's format
}
```

### 10. أصناف المديرين {#_10-manager-classes}

**المسؤوليات:**
- إدارة الميزات المتقدّمة
- التنسيق بين المكوّنات

**الملفات:**
- `src/managers/approval-manager.ts`: إدارة الموافقات البشرية
- `src/managers/budget-tracker.ts`: تتبّع الميزانية والاستهلاك
- `src/managers/golden-trace-manager.ts`: إدارة الآثار المرجعية
- `src/managers/regression-test-manager.ts`: إدارة مجموعات الاختبار
- `src/managers/assertion-manager.ts`: إدارة التوكيدات
- `src/managers/impact-analysis-manager.ts`: إدارة تحليل التأثير

## بنية البيانات {#data-architecture}

### أنواع الأحداث {#event-types}

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.stopped'
  | 'intention.generated'
  | 'intention.rejected' // never recorded by the SDK
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed' // never recorded by the SDK
  | 'resource.read'
  | 'provider.fallback'
  | 'provider.retry'
  | 'tool.retry'
  | 'incident.reported'
  | 'error.occurred' // never recorded by the SDK
  | 'cognition.started'
  | 'cognition.operation_selected'
  | 'cognition.thought'
  | 'cognition.operation_failed'
  | 'cognition.concluded'
  | 'cognition.evaluated'
  | 'cognition.feedback'
  | 'cognition.knowledge_recorded'
  | 'decision.evaluated';
```

### بنية الحدث {#event-structure}

```typescript
interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: Record<string, unknown>
  metadata?: EventMetadata
}
```

### تنفيذات مخزن الأحداث {#event-store-implementations}

1. **FileEventStore** (MVP)
   - حفظ قائم على الملفات
   - ملف JSON واحد لكل runId
   - تفريغ تلقائي على دفعات

2. **SQLEventStore** (بيئة الإنتاج)
   - تنفيذ SQL عام
   - دعم SQLite وPostgreSQL
   - فهارس من أجل الأداء

3. **PostgreSQLEventStore** (بيئة إنتاج متقدّمة)
   - يستخدم JSONB للتخزين الفعّال
   - فهارس GIN لاستعلامات JSON
   - دعم الاستعلامات المتقدّمة

## تصميم API {#api-design}

### تهيئة حزمة SDK {#sdk-initialization}

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### إنشاء الوكيل {#agent-creation}

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### تعريف الأداة {#tool-definition}

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### تنفيذ الوكيل {#agent-execution}

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## استراتيجية الاختبار {#testing-strategy}

### اختبارات الوحدات {#unit-tests}

- اختبارات وحدات لكل وحدة برمجية
- تستخدم Vitest
- محاكاة التبعيات الخارجية (mocking)

### اختبارات التكامل {#integration-tests}

- اختبارات تكامل لسير العمل الكامل
- اختبارات مع مخازن أحداث مختلفة
- اختبارات إعادة التشغيل

### الآثار المرجعية {#golden-traces}

- آثار مرجعية لاختبارات التراجع
- التحقّق من السلوك عبر إعادة التشغيل
- اكتشاف تلقائي للتراجعات

## بنية النشر {#deployment-architecture}

### توزيع الحزمة {#package-distribution}

- **اسم الحزمة**: `@sdk-ai-agents/core`
- **التوزيع**: npm
- **نقطة الدخول**: `dist/index.js`
- **تعريفات الأنواع**: `dist/index.d.ts`

### عملية البناء {#build-process}

1. ترجمة TypeScript (`tsc`)
2. توليد خرائط المصدر (source maps)
3. توليد ملفات التصريح
4. المُخرَجات في `dist/`

### التبعيات {#dependencies}

**وقت التشغيل:**
- `openai`: ^4.20.0
- `@anthropic-ai/sdk`: ^0.71.2
- `uuid`: ^9.0.1
- `zod`: ^3.22.4

**التبعيات النظيرة (Peer Dependencies):**
- `pg`: ^8.11.0 (لـ PostgreSQLEventStore)

**تبعيات التطوير:**
- `typescript`: ^5.3.2
- `vitest`: ^1.0.4
- `@biomejs/biome`: ^1.7.0

## اعتبارات الأمان {#security-considerations}

### الرفض افتراضيًا {#deny-by-default}

- يجب التصريح بجميع الأدوات صراحةً
- يجب أن تمرّ جميع الإجراءات عبر محرّك السياسات
- تحقّق إلزامي قبل التنفيذ

### فصل المسؤوليات {#separation-of-concerns}

- لا يستطيع محرّك الاستدلال تنفيذ الأدوات
- يتحقّق محرّك الإجراءات قبل التنفيذ
- يفحص محرّك السياسات جميع الإجراءات

### سجل التدقيق {#audit-trail}

- تُحفَظ جميع الأحداث
- تتبّع كامل للقرارات
- سجل تدقيق السياسات

## اعتبارات الأداء {#performance-considerations}

### أداء مخزن الأحداث {#event-store-performance}

- FileEventStore: تفريغ على دفعات (10 أحداث أو 100 ملّي ثانية)
- SQLEventStore: فهارس لاستعلامات سريعة
- PostgreSQLEventStore: JSONB + فهارس GIN

### الحِمل الإضافي لحزمة SDK {#sdk-overhead}

- حِمل إضافي ضئيل (< 5-10 ملّي ثانية باستثناء النموذج اللغوي والأدوات)
- إطلاق غير متزامن للأحداث
- تفريغ على دفعات من أجل الأداء

## اعتبارات مستقبلية {#future-considerations}

### قابلية التوسّع {#scalability}

- الانتقال إلى مخزن أحداث موزّع (على غرار Kafka)
- دعم النسخ المتعدّدة
- تجميع مخازن الأحداث في عناقيد (clustering)

### الميزات {#features}

- دعم مزوّدي نماذج لغوية إضافيين
- مخزن أحداث سحابي (S3، وغيره)
- لوحة مراقبة
