# التتبّع وإعادة التشغيل

كل تشغيل — خاضع للحوكمة، أو معرفي، أو قرار مُنمَّط مباشر، أو استدعاء أداة MCP — هو **سجل أحداث لا يُضاف إليه إلا في نهايته** (append-only). لا شيء يحدث خارج السجل، وكل ما عداه مشتق منه.

```mermaid
flowchart LR
  subgraph Run["التشغيل"]
    direction TB
    A["run.started"] --> B["cognition.operation_selected"]
    B --> C["decision.evaluated"]
    C --> D["cognition.thought"]
    D --> E["policy.checked"]
    E --> F["tool.called"]
    F --> G["action.executed"]
    G --> H["run.completed"]
  end
  Run --> T["getTrace"]
  Run --> M["getMentalState"]
  Run --> R["replay"]
  Run --> K["getRunCost"]
  Run --> I["getIncidents"]
  Run --> DS["exportControllerDataset"]
```

## المخازن {#stores}

| المخزن | استخدمه لـ |
| --- | --- |
| `FileEventStore` (الافتراضي) | التطوير، وعملية واحدة — ملف JSON واحد لكل تشغيل |
| `SQLiteEventStore` | الحفظ المحلي مع الاستعلامات |
| `PostgreSQLEventStore` | بيئة الإنتاج: استعلامات مفهرسة، وتجميع، ونسخ احتياطي واستعادة |

::: code-group

```ts [File]
import { createSDK, FileEventStore } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey, eventStore: new FileEventStore('./events') });
```

```ts [SQLite]
import Database from 'better-sqlite3';
import { createSDK, SQLiteEventStore } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey, eventStore: new SQLiteEventStore({ db: new Database('events.db') }) });
```

```ts [PostgreSQL]
import pg from 'pg';
import { createSDK, PostgreSQLEventStore } from '@sdk-ai-agents/core';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sdk = createSDK({ apiKey, eventStore: new PostgreSQLEventStore({ pool }) });
```

:::

تنفّذ المخازن `IEventStore`؛ اكتب مخزنك الخاص لاستهداف أي قاعدة بيانات. يخزّن مخزن الملفات الأحداث مؤقتًا ويفرغها كل 100 ملّي ثانية؛ استدعِ `await store.destroy()` عند الإيقاف لكتابة ما هو معلّق. ويتجاهل قرّاء السجل (إعادة بناء الحالة الذهنية، والتكاليف، ومجموعات البيانات) الأحداث المكرَّرة ذات المعرّف نفسه.

## قراءة تشغيل {#read-a-run}

```ts
const trace = await sdk.getTrace(runId);          // status, timeline, summary
const text = await sdk.exportTrace(runId, 'text'); // human-readable timeline
const events = await sdk.getEvents(runId, { type: ['tool.called', 'policy.violated'] });
const state = await sdk.getMentalState(runId);    // cognitive runs
```

حالة التشغيل هي **آخر حدث من أحداث دورة الحياة** (`run.completed`، `run.failed`، `run.cancelled`). والأحداث المُلحَقة بعد ذلك — الملاحظات الراجعة، وتقارير الحوادث — لا تعيد فتحه أبدًا.

## التقدّم المباشر {#live-progress}

تصل الأحداث أيضًا إلى شيفرتك **أثناء سير التشغيل**، بمجرّد أن يقبلها المخزن: لعرض التقدّم في واجهة مستخدم، أو بثّه إلى عميل، أو تغذية لوحة متابعة. وتتلقّاها عملاء MCP في صورة [إشعارات تقدّم](./mcp-deploy#progress-notifications).

```ts
const result = await agent.run({
  message: 'Refund order 1234',
  onEvent: (event) => console.log(event.type),
});

const answer = await cognitiveAgent.think({ problem, onEvent: (event) => socket.send(JSON.stringify(event)) });
const replay = await sdk.replay(runId, undefined, { onEvent: (event) => console.log(event.type) });

// Every run of the SDK, for as long as you listen
const unsubscribe = sdk.subscribe((event) => dashboard.push(event), { types: ['run.failed', 'approval.requested'] });
unsubscribe();
```

| أين | ما يتلقّاه المستمِع (listener) |
| --- | --- |
| `run({ onEvent })`، `think({ onEvent })` | كل حدث من أحداث ذلك التشغيل |
| `replay(runId, modifications, { onEvent })` | كل حدث من أحداث إعادة التشغيل |
| `executeTool(name, params, { onEvent })` | أحداث الاستدعاء، وأحداث عمليات تشغيل الوكلاء التي تبدؤها أداته (`governedAgentTool`، `cognitiveAgentTool`) |
| `sdk.subscribe(listener, { runId?, agentId?, types? })` | كل حدث من كل تشغيل يطابق المرشِّح، إلى أن تستدعي الدالة التي يعيدها |

ما هو مضمون:

- **ما قبله المخزن فقط.** يُستدعى المستمِع بعد أن ينجح `append` في المخزن، ولا يُستدعى أبدًا لحدث رفضه المخزن. مع مخازن SQL يكون الصف قد ثُبِّت (committed)؛ ومع مخزن الملفات يكون الحدث في ذاكرته المؤقتة: يعيده `getEvents` فورًا، ويصل إلى القرص خلال 100 ملّي ثانية (وتعطّل العملية في الأثناء يُضيّعه).
- **بالترتيب.** تصل أحداث التشغيل الواحد بالترتيب الذي سُجِّلت به؛ أما أحداث عمليات التشغيل المختلفة فتتداخل.
- **حدث واحد في كل مرة، والتشغيل لا ينتظر أبدًا.** حين يعيد مستمِعك وعدًا (promise)، ينتظر حدثه التالي إلى أن يستقرّ ذلك الوعد، فلا يستطيع مستمِع غير متزامن أن يغيّر ترتيب الأحداث. ويمضي التشغيل في الأثناء: المستمِع البطيء يتأخّر، ولا يبطّئ الوكيل. لا تعيد `run()` و`think()` و`replay()` و`executeTool()` نتيجتها إلا بعد أن يفرغ `onEvent` الخاص بها من كل حدث من أحداث التشغيل، فحين تعود تكون قد رأيت كل شيء. والوعد الذي لا يستقرّ أبدًا يمنعها من العودة: للعمل الذي تطلقه دون انتظاره، لا تُعِد الوعد (`onEvent: (event) => { void save(event); }`). ويُستدعى المستمِع المتزامن قبل أن يعود `append` الخاص بالحدث: فاجعله سريعًا.
- **الأخطاء تبقى خارج التشغيل.** المستمِع الذي يرمي خطأً أو يُرفَض وعده يُبلَّغ عنه على الخطأ القياسي (`console.error`) ويظل يتلقّى الأحداث التالية. لمعالجة أخطائه بنفسك، التقطها داخل المستمِع، أو أنشئ حزمة SDK مع `eventStore: new ObservedEventStore(store, { onListenerError })`.
- **نسخة.** يحصل كل مستمِع على نسخته الخاصة من الحدث، كما يعيد المخزن قراءته: تعديلها لا يغيّر شيئًا في السجل.
- **إلغاء الاشتراك فوري.** بعد استدعاء الدالة التي يعيدها `sdk.subscribe`، لا يُستدعى المستمِع مجددًا، ولا حتى للأحداث المنتظِرة بالفعل؛ ويمكن استدعاء تلك الدالة من داخل المستمِع.

يطابق المرشِّح `agentId` الحقلَ `metadata.agentId` في كل حدث: بعض الأحداث لا تحمل وكيلًا (`provider.retry`، ونهاية إعادة التشغيل)، فصفِّ حسب التشغيل للحصول عليها. ولا تُسلَّم النسخ الاحتياطية المُستعادة. ولوكيل مُجمَّع يدويًا على مخزنك الخاص (`new AgentImpl(…)`)، غلِّف المخزن بـ `ObservedEventStore` لاستخدام `onEvent`؛ أما `createSDK` فيفعل ذلك نيابةً عنك.

## إعادة التشغيل دون النموذج اللغوي {#replay-without-the-llm}

```ts
const replay = await sdk.replay(runId);
```

تعيد إعادة التشغيل تنفيذ النوايا المُسجَّلة عبر محرّك الإجراءات — بما في ذلك السياسات — **دون استدعاء النموذج اللغوي**. أعِد التشغيل مع تعديلات لاختبار سيناريوهات «ماذا لو»، مثلًا بعد تغيير سياسة.

تشغّل إعادة التشغيل الأدوات مجددًا، فعليًا. بالنسبة إلى الأدوات الموسومة بـ `requiresApproval`، لا تكرّر إعادة التشغيل إلا الاستدعاءات التي **وافق** عليها إنسان في التشغيل الأصلي — الأداة نفسها بالمعاملات نفسها — دون السؤال مجددًا؛ أما الاستدعاء الذي رُفض أو أُلغي أو لم تتم الموافقة عليه قط فيُرفَض، ولا يُشغَّل. والموافقات التي تتطلّبها *سياسة* تظل سارية وتنتظر قرارًا.

## فهم القرارات {#understand-decisions}

| الدالة | ما تحصل عليه |
| --- | --- |
| `getReasoningGraph(runId)` / `exportReasoningGraph(runId, 'graphviz')` | السلسلة نيّة ← سياسة ← إجراء في صورة رسم بياني |
| `getAlternatives(runId)` | البدائل التي نظر فيها الوكيل |
| `getDecisionPatterns(filters)` | أنماط القرار المتكرّرة عبر عمليات التشغيل |
| `getTraceVisualization(runId)` | بنية مجمّعة وجاهزة للعرض على خط زمني في واجهة مستخدم |
| `getPolicyAuditTrail(runId)` | كل تقييم لسياسة ونتيجته |

## اختبر الوكلاء كما تختبر الشيفرة {#test-agents-like-code}

حوِّل تشغيلًا جيدًا إلى **أثر مرجعي** (golden trace)، ثم تحقّق من عمليات التشغيل الجديدة مقابله:

```ts
const golden = await sdk.createGoldenTrace(runId, { name: 'refund flow', description: 'Expected behavior' });
const validation = await sdk.validateAgainstGoldenTrace(newRunId, golden.id);
const regressions = await sdk.detectRegressions(newRunId, golden.id);
```

تتوفّر أيضًا مجموعات اختبار التراجعات، والتوكيدات السلوكية، ومقارنة عمليات التشغيل، وتحليل التأثير قبل النشر — انظر [واجهة SDK البرمجية](../reference/sdk-api).
