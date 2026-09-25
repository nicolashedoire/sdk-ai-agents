# الأدوات

**الأداة** دالة يستطيع الوكيل استدعاءها: الاستعلام عن طلبية، أو قراءة ملف، أو البحث على الويب، أو سؤال وكيل آخر. تكتب أدواتك بنفسك، أو تأخذها جاهزة من **مصدر أدوات**: مجلد، أو قاعدة بيانات، أو واجهة API على الويب، أو الويب، أو وكيل، أو خادم MCP.

أيًّا كان منشؤها، يخضع كل استدعاء **للحوكمة**. يجب أن تكون الأداة من أدوات المستدعي، وتُفحَص معاملاتها، وتنطبق السياسات والميزانيات، ويمكن أن يُطلَب من إنسان أن يوافق عليه، ويمكن إعادة محاولة الإخفاقات، ويُكتَب كل شيء في سجل الأحداث.

## في سطر واحد {#in-one-line}

```ts
import { createSDK, folderTools, webTools } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });

const tools = [...folderTools({ root: './handbook' }), ...webTools()].map((definition) =>
  sdk.defineTool(definition)
);

const agent = sdk.createAgent({ name: 'helpdesk', model: 'gpt-5.4', tools });
```

يستطيع الوكيل الآن سرد ملفات دليل الموظفين وقراءتها والبحث فيها، والبحث على الويب وقراءة صفحاته: ثماني أدوات، كلها للقراءة فقط.

## أدواتك الخاصة {#your-own-tools}

يسجّل `sdk.defineTool` أداةً في حزمة SDK ويعيدها. يصف مخطط zod المعاملات؛ ويتلقّاها المعالج بعد التحقّق منها، ومع أنواعها في TypeScript.

```ts
import { z } from 'zod';

const lookupOrder = sdk.defineTool({
  name: 'lookup_order',
  description: 'Reads an order: status, items, amount.',
  schema: z.object({ orderId: z.string().describe('For example "o-1042"') }),
  handler: async ({ orderId }) => orders.get(orderId),
  metadata: { riskLevel: 'low', readOnly: true },
  retry: { maxRetries: 2 },
});

const refundOrder = sdk.defineTool({
  name: 'refund_order',
  description: 'Refunds an order. Only when the customer asked for a refund.',
  schema: z.object({ orderId: z.string(), amount: z.number().positive() }),
  handler: async ({ orderId, amount }, context) => payments.refund(orderId, amount, { signal: context?.signal }),
  metadata: { riskLevel: 'high', requiresApproval: true },
  version: '1.1.0',
});
```

| الحقل | |
| --- | --- |
| `name`، `description` | ما يراه النموذج ويقرّر بناءً عليه. استخدم الأحرف، والأرقام، و`_`، و`-`، حتى 64 حرفًا: فقد ترفض واجهات API الخاصة بالنماذج وعملاء MCP الأسماء الأخرى. |
| `schema` | المعاملات، في صورة مخطط zod؛ وتُعرَض نصوص `.describe()` على النموذج. والاستدعاء الذي لا يطابقه يُرفَض قبل أي سياسة أو موافقة أو ميزانية. |
| `handler(params, context?)` | شيفرتك. يحتوي `context` على `runId`، و`agentId`، و`signal` (الذي يُلغى حين يتخلّى المستدعي)، و`onEvent` (الذي يُعيَّن حين يتابع المستدعي الاستدعاء مباشرةً). |
| `metadata` | `riskLevel` (`low`، `medium`، `high`)، و`requiresApproval`، و`readOnly`، و`category`: انظر [كيف تخضع الاستدعاءات للحوكمة](#how-calls-are-governed). لا يُعيَّن أيٌّ منها افتراضيًا. |
| `retry` | `{ maxRetries, initialDelayMs? (200), maxDelayMs? (5,000), retryOn? }`، للأدوات المتساوية القوة (idempotent) فقط. |
| `version` | `1.0.0` افتراضيًا. وهو جزء من هاش إعداد الوكيل، فيمكن [مقارنة](../reference/sdk-api#comparisons-and-impact) عمليات التشغيل قبل التغيير وبعده. |
| `capability` | وسم للتجميع؛ وتعيّن المصادر المدمجة واحدًا (`web:search`، `folder:handbook`…). |

يُسجَّل الاسم مرة واحدة في كل نسخة SDK: يرمي `sdk.defineTool` خطأً عند اسم مأخوذ بالفعل، أيًّا كان الإصدار. أعطِ كل مصدر بادئة حين يمكن أن يتصادم مصدران. وكل الحقول موجودة في [واجهة SDK البرمجية](../reference/sdk-api#tools-tooldefinition).

## مصادر الأدوات المدمجة {#the-built-in-tool-sources}

يعيد كل مصدر تعريفات أدوات، جاهزة لـ `sdk.defineTool` (ويعيدها `connectMcpServer` في `tools` الخاصة به). ويستطيع كلٌّ منها إعادة تسمية أدواته: ببادئة (`prefix`؛ و`toolPrefix` لـ MCP)، أو بالاسم الكامل لأداة الوكيل (`name`).

| المصدر | يستطيع الوكيل | أسماء الأدوات | المخاطر، القراءة فقط | يحتاج إلى | التفاصيل |
| --- | --- | --- | --- | --- | --- |
| `folderTools({ root })` | سرد الملفات النصية لمجلد واحد، وقراءتها، والبحث فيها، دون الخروج منه أبدًا | `list_files`، `read_file`، `search_files` | منخفضة، للقراءة فقط | مجلد | [مجلد مستندات](./mcp-recipes#a-folder-of-documents) |
| `databaseTools({ database })` | سرد الجداول، ووصف أحدها، وتشغيل استعلام واحد للقراءة فقط: `SELECT`، أو `WITH … SELECT`، أو `VALUES` (100 صف على الأكثر افتراضيًا) | `list_tables`، `describe_table`، `query` | متوسطة، للقراءة فقط | `sqliteReadOnly(db)` (`node:sqlite` أو `better-sqlite3`) أو `postgresReadOnly({ pool })` (`pg`) | [قاعدة بيانات للقراءة فقط](./mcp-recipes#a-read-only-database) |
| `await openApiTools({ spec })` | استدعاء واجهة API على الويب، بأداة لكل عملية: عمليات `GET` افتراضيًا؛ ويستبدل بها `include` العمليات التي يسردها، وهو الطريقة الوحيدة للحصول على عمليات الكتابة | قيمة `operationId`، وإلا فالطريقة والمسار (`get_pets_petId`) | `GET`: منخفضة، للقراءة فقط. غيرها: عالية، مع موافقة إلزامية | وصف OpenAPI 3 (عنوان URL، أو ملف، أو كائن) | [واجهة API على الويب](./mcp-recipes#a-web-api-from-its-openapi-description) |
| `webTools()` | البحث على الويب، وقراءة صفحة أو ملف PDF، والبحث في arXiv وWikipedia وGitHub | `web_search`، `web_fetch`، `arxiv_search`، `wikipedia_search`، `github_search` | `web_fetch` متوسطة، والأخرى منخفضة؛ وكلها للقراءة فقط | لا شيء للبدء (DuckDuckGo)؛ و`unpdf` لملفات PDF؛ ورمز GitHub (token) للبحث في الشيفرة | [البحث على الويب](./web-research) |
| `governedAgentTool(agent)`، `cognitiveAgentTool(agent)` | سؤال وكيل آخر: يجيب الوكيل الخاضع للحوكمة عن `message`، ويستدلّ الوكيل المعرفي بشأن `problem` ويعيد قراره | `ask_<agent name>` | متوسطة، غير موسومة بأنها للقراءة فقط | وكيل، ومن ثَمّ مفتاح نموذج | [وكيل](./mcp-recipes#an-agent-your-reasoning-twin) |
| `await connectMcpServer({ name, transport })` | استخدام أدوات أي خادم MCP | أسماء الخادم، مسبوقة بـ `toolPrefix` | لا شيء معيَّن: تنطبق `metadata` على كل أداة مستوردة | `@sdk-ai-agents/core/mcp` و`@modelcontextprotocol/sdk`؛ و`close()` عند الانتهاء | [استخدام أدوات خادم MCP](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) |

أمران يختلفان في أدوات MCP: لا تتحقّق حزمة SDK إلا من أن معاملاتها تشكّل كائنًا (ويتحقّق الخادم من الباقي)، ولا تُستورَد تلميحات الخادم نفسه، مثل القراءة فقط: عيّن `metadata` بنفسك.

## إعطاء الأدوات لوكيل {#giving-tools-to-an-agent}

يأخذ `createAgent({ tools })` و`createCognitiveAgent({ tools })` أدواتٍ، لذا مرّر تعريفات المصدر عبر `sdk.defineTool` أولًا، كما في الأعلى. لا يستطيع الوكيل أن يشغّل إلا **أدواته هو**، أي أدوات `tools` وأدوات قدراته `capabilities`: وأي أداة أخرى يذكرها النموذج تُرفَض (`allowed-tools`).

```ts
const support = sdk.createAgent({
  name: 'support',
  model: 'gpt-5.4',
  tools: [lookupOrder, refundOrder, ...tools], // your tools and those of the sources above
});
```

أما `defineTool`، المستوردة من الحزمة، فتبني أداةً دون تسجيلها: وتسجّلها حزمة SDK حين يُنشأ وكيل يستخدمها. وإذا كانت أداة بهذا الاسم مسجَّلة بالفعل، فالمسجَّلة هي التي يُحتفَظ بها وتُشغَّل.

### القدرات {#capabilities}

القدرة اسمٌ لمجموعة من الأدوات تعطيها لعدة وكلاء. ووسم `capability` الخاص بأداة ليس قدرة: عرّف القدرة بـ `sdk.defineCapability`.

```ts
sdk.defineCapability({
  name: 'handbook',
  description: 'Read the team handbook',
  tools: folderTools({ root: './handbook', prefix: 'handbook_' }).map((tool) => sdk.defineTool(tool).name),
});

const onboarding = sdk.createAgent({ name: 'onboarding', model: 'gpt-5.4', capabilities: ['handbook'] });
```

### خارج الوكيل {#outside-an-agent}

يعيد `sdk.listTools()` كل أداة مسجَّلة في حزمة SDK. ويستدعي `sdk.executeTool(name, parameters, options?)` إحداها عبر مسار الحوكمة نفسه، في تشغيل مستقل (بمعرّف الوكيل `external` ما لم تعطِ `agentId`)، ويعيد ما أعاده المعالج:

```ts
const order = await sdk.executeTool('lookup_order', { orderId: 'o-1042' }, { agentId: 'backoffice' });
```

خياراته: يسجّل `runId` الاستدعاء داخل تشغيل موجود، ويحصر `allowedTools` ما يجوز لهذا المستدعي تشغيله، ويلغيه `signal`، ويحدّ `approvalTimeoutMs` مدة انتظار الموافقة، ويتابع `onEvent` الاستدعاء مباشرةً. والرفض يرمي خطأ `PolicyViolationError`؛ أما المعاملات غير الصالحة والمعالج الذي يفشل فيرميان خطأ `ToolExecutionError`.

وتخدم الأدوات نفسها في أماكن أخرى. تأخذ [الدراسة](./studies#research-through-your-sources) **أسماء** الأدوات المعرَّفة بوصفها مصادرها `sources`، ويقدّم خادم MCP التعريفات أو الأسماء التي تعطيه إياها إلى Claude Desktop، أو Claude Code، أو أي عميل MCP (انظر [خادم MCP لأيّ شيء](./mcp-recipes)).

## كيف تخضع الاستدعاءات للحوكمة {#how-calls-are-governed}

يمرّ الاستدعاء بهذه الخطوات، بهذا الترتيب، ويتوقّف عند أول رفض:

1. **أدوات المستدعي.** تُرفَض الأداة التي لم تُعطَ للمستدعي: أدوات الوكيل، أو مصادر الدراسة، أو قائمة خادم MCP، أو `allowedTools`. ويستطيع `executeTool` دون `allowedTools` أن يشغّل أي أداة مسجَّلة.
2. **المعاملات**، تُفحَص مقابل المخطط، قبل أن يُسأل أي أحد عن أي شيء.
3. **السياسات**: كل سياسة عامة وكل سياسة خاصة بالوكيل (انظر [الوكلاء الخاضعون للحوكمة](./governed-agents#_3-policies)).
4. **الموافقة**، حين تطلبها الأداة أو سياسة. والاستدعاء الذي ترفضه أي سياسة يُرفَض دون طلب موافقة: فالموافقة لا تتغلّب أبدًا على قاعدة رفض، ولا على قائمة سماح، ولا على ميزانية.
5. **الميزانية**: يُحتسَب الاستدعاء حين يبدأ، أيًّا كانت نتيجته.
6. **تشغيل الأداة**، مع إعادات المحاولة الخاصة بها.

### مستويات المخاطر {#risk-levels}

الحقل `riskLevel` وسم: يقول للناس وللشيفرة مقدار الحذر الواجب. **لا تقرؤه أي سياسة**، ولا يحظر استدعاءً ولا يبطئه. وللتصرّف بناءً عليه، أعطِ الأداة `requiresApproval`، أو حوّل الوسم إلى سياسة:

```ts
const highRisk = sdk
  .listTools()
  .filter((tool) => tool.metadata?.riskLevel === 'high')
  .map((tool) => tool.name);

sdk.defineGlobalPolicy({
  id: 'approve-high-risk',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: { type: 'condition', conditions: [{ field: 'intention.toolName', operator: 'in', value: highRisk }] },
      action: 'require_approval',
    },
  ],
});
```

تُؤخَذ القائمة لحظة تعريف السياسة: فعرّف الأدوات أولًا.

### الموافقات {#approvals}

ينتظر الاستدعاء إنسانًا حين يكون للأداة `requiresApproval: true` (وهو الافتراضي في `openApiTools` لعمليات الكتابة) أو حين تقول قاعدة في سياسة `require_approval`. ويظهر عندئذٍ في `sdk.getPendingApprovals()`؛ ويسمح `sdk.approveAction(id, who, reason?)` بتشغيله، ويرفضه `sdk.rejectAction(id, who, reason?)`. والاستدعاء الذي ترفضه أي سياسة يُرفَض دون طلب موافقة: فالموافقة لا تتغلّب أبدًا على قاعدة رفض، ولا على قائمة سماح، ولا على ميزانية. وإذا تخلّى المستدعي أولًا (تشغيل أُوقِف، أو `signal` أُلغي، أو انقضاء `approvalTimeoutMs`، وهو 50 ثانية افتراضيًا على خوادم MCP)، تُلغى الموافقة ولا تُشغَّل الأداة أبدًا. انظر [الموافقات](./mcp-deploy#approvals-a-human-says-yes-first).

### الأدوات التي للقراءة فقط {#read-only-tools}

يقول `readOnly: true` إن الأداة لا تغيّر شيئًا. ويراه عملاء MCP بوصفه `readOnlyHint`، ولا يعيد `openApiTools` إلا محاولة العمليات التي للقراءة فقط. وهو لا يخفّف أي سياسة، ولا يُتحقَّق منه: فالمعالج الموسوم بأنه للقراءة فقط ويكتب، يظلّ يكتب. والمصادر التي لا تفعل إلا القراءة تفرضه حيث تستطيع: فليس لدى `folderTools` أي وسيلة للكتابة، ويشغّل `sqliteReadOnly` و`postgresReadOnly` كل استعلام للقراءة فقط داخل قاعدة البيانات نفسها.

### إعادة المحاولة {#retries}

يعيد `retry` تشغيل المعالج الذي يفشل: عند أخطاء المعالج وحدها، ولا يكون ذلك أبدًا عند معاملات غير صالحة أو رفض. وكل إعادة محاولة حدث من نوع `tool.retry`، ويُحتسَب الاستدعاء مرة واحدة في ميزانيته. ويأخذ `openApiTools` و`webTools` و`connectMcpServer` خيار `retry` لأدواتها. انظر [إعادة المحاولة والبديل الاحتياطي](./resilience#tools).

### الميزانيات {#budgets}

تضع سياسة من نوع `budget` مع `budgetLimit` سقفًا لاستدعاءات الأدوات في كل فترة، لوكيل واحد (`agentId`)، أو لأداة واحدة (`toolName`)، أو للجميع:

```ts
sdk.defineGlobalPolicy({
  id: 'web-fetch-daily',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { toolName: 'web_fetch', period: 'day', maxToolCalls: 200 } },
    },
  ],
});
```

ويمكن لـ `budgetLimit` أيضًا أن يضع سقفًا بـ `maxTokens` و`maxCost`، يُحتسَبان على استدعاءات النموذج: فبمجرّد أن يتجاوز استهلاك الفترة أحد السقفين، تُرفَض استدعاءات الأدوات، ويرفضها `maxCost` أيضًا بمجرّد أن تكون كلفة استدعاء مجهولة (نموذج بلا سعر، أو استدعاء لم يُبلِغ عن عدد رموزه). انظر [تكاليف API](./costs#budgets).

### المخرجات غير الموثوقة {#untrusted-output}

ما تعيده الأداة يعود إلى النموذج، ويمكن لصفحة، أو ملف، أو إجابة من واجهة API أن تحتوي على تعليمات مكتوبة له (حقن الموجّهات، prompt injection). تَسِم أدوات الويب كل إجابة بـ `untrusted: true`، وتطلب أوصافها من النموذج ألّا يتبع أبدًا تعليمات يجدها فيها. أما المصادر الأخرى فتعيد محتواها كما هو. قل في موجّه النظام إن نتائج الأدوات بيانات، وأعطِ كل وكيل الأدوات التي يحتاجها فقط، واحمِ الأدوات التي تغيّر الأشياء بالموافقات. وتعرض الدراسة كل نتيجة على نموذجها بوصفها بيانات. انظر [قواعد الأمان لأدوات الويب](./web-research#security-rules).

### ما يسجّله الاستدعاء {#what-a-call-records}

| الحدث | متى |
| --- | --- |
| `action.executing` | يُقترَح الاستدعاء، قبل أي فحص |
| `policy.checked` | تُفحَص كل سياسة، ثم يصدر الحكم |
| `policy.violated` | رفض: أداة لم تُعطَ للمستدعي (`allowed-tools`)، أو سياسة، أو ميزانية مستنفَدة |
| `approval.requested`، `approval.approved`، `approval.rejected` | القرار البشري |
| `tool.called` | يبدأ المعالج |
| `tool.retry` | إعادة محاولة، مع تأخيرها والخطأ |
| `action.executed`، `action.failed` | النتيجة أو الخطأ (بما في ذلك المعاملات غير الصالحة)، مع المدة |

الاستدعاء الذي يتم بـ `executeTool` تشغيلٌ مستقل، ما لم تعطِ `runId`: `run.started` (بالوضع `tool`)، ثم `run.completed` أو `run.failed`. انظر [فهرس الأحداث](../reference/events#reasoning-and-actions).

## اختيار مصدر {#choosing-a-source}

| أحتاج إلى… | استخدم |
| --- | --- |
| شيفرتي أو خدمتي الخاصة | `sdk.defineTool` |
| مستندات في مجلد | `folderTools` |
| إجابات من قاعدة بيانات SQL، للقراءة فقط | `databaseTools` مع `sqliteReadOnly` أو `postgresReadOnly`؛ ومع PostgreSQL، اتصل أيضًا بدور لا يستطيع إلا القراءة |
| واجهة API على الويب تنشر وصف OpenAPI | `openApiTools` |
| واجهة API على الويب دون وصف كهذا | `sdk.defineTool`، مع `fetch` في المعالج |
| الويب، والأبحاث العلمية، ومقالات الموسوعة، والشيفرة على GitHub | `webTools` |
| إجابة وكيل آخر أو قراره | `governedAgentTool` أو `cognitiveAgentTool` |
| نظام لديه خادم MCP بالفعل | `connectMcpServer` |
| مصادر لدراسة | أدوات البحث من `webTools`، أو من خادم MCP |
| أدواتي في Claude Desktop أو Claude Code | الاتجاه المعاكس: [خادم MCP](./mcp-recipes) |
