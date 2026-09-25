# خادم MCP لأيّ شيء

تحوّل كل وصفة نوعًا واحدًا من الأنظمة إلى خادم MCP **في سطر واحد**، بأمان. وكلها تعمل بالطريقة نفسها: **مصدر أدوات** يبني الأدوات (وأحيانًا الموارد)، و`serveMcpOverStdio` يقدّمها.

| ما تريد عرضه | السطر | الأدوات التي يحصل عليها النموذج |
| --- | --- | --- |
| [دالة تكتبها](#a-function) | `sdk.defineTool({ … })` | أدواتك |
| [واجهة API على الويب](#a-web-api-from-its-openapi-description) | `await openApiTools({ spec: 'https://…/openapi.json' })` | أداة لكل عملية، للقراءة فقط افتراضيًا |
| [مجلد مستندات](#a-folder-of-documents) | `folderTools({ root: './handbook' })` | `list_files`، `read_file`، `search_files` (+ موارد) |
| [قاعدة بيانات، للقراءة فقط](#a-read-only-database) | `databaseTools({ database: sqliteReadOnly(db) })` | `list_tables`، `describe_table`، `query` |
| [وكيل](#an-agent-your-reasoning-twin) | `cognitiveAgentTool(agent)` | `ask_<agent>` |
| [الويب](./web-research) | `webTools()` | `web_search`، `web_fetch`، `arxiv_search`، `wikipedia_search`، `github_search` |

هل أنت جديد على MCP؟ ابدأ بـ [أول خادم MCP لك في 5 دقائق](./mcp-first-server): فهي تبيّن كيف تشغّل خادمًا، وتختبره بـ Inspector، وتوصله بـ Claude Desktop أو Claude Code. كل ملف أدناه يُشغَّل ويوصَل بالطريقة نفسها.

## الهيكل المشترك بين كل الوصفات {#the-skeleton-every-recipe-shares}

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

// No model key needed unless a recipe uses an agent. The event log goes next to this file.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'my-server',
  tools: [/* ← the recipe goes here */],
});
```

يأخذ `tools` **تعريفات أدوات** (ما تعيده المصادر أدناه — وتعرّفها حزمة SDK لك) و**أسماء** أدوات عرّفتها بنفسك بـ `sdk.defineTool`. ولا يُعرَض أي شيء آخر أبدًا. ويأخذ `resources` (اختياري) مزوّدي مستندات، تستخدمهم وصفة المجلد.

أيًا كان المصدر، يمرّ كل استدعاء بالفحوص نفسها، بهذا الترتيب — المعاملات، و[السياسات](./mcp-deploy#governance-policies-budgets-approvals)، والموافقة، والميزانية — ويُكتَب في سجل الأحداث. ويُرفَض الاستدعاء غير الصالح قبل أن يُطلَب من أي أحد الموافقة عليه.

## دالة {#a-function}

أبسط مصدر: دالة تكتبها، كما في [الخادم الأول](./mcp-first-server).

```ts
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team',
  schema: z.object({ topic: z.string().describe('For example "billing"') }),
  metadata: { readOnly: true },
  handler: async ({ topic }) => directory.search(topic),
});

await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

| الحقل | الغرض منه |
| --- | --- |
| `name` | ما يستدعيه النموذج. استخدم الأحرف، والأرقام، و`_`، و`-`، حتى 64 حرفًا (قد ترفض عملاء MCP الأسماء الأخرى). |
| `description` | متى تُستخدَم الأداة، بكلمات بسيطة. يقرّر النموذج بناءً عليه. |
| `schema` | المعاملات، في صورة مخطط zod. تُعرَض نصوص `.describe()` على النموذج. وتُرفَض الاستدعاءات التي لا تطابقه. |
| `handler` | شيفرتك. تتلقّى المعاملات المُتحقَّق منها، وسياقًا فيه `signal` (يُلغى حين يتخلّى العميل). |
| `metadata.readOnly` | «هذه الأداة لا تغيّر شيئًا»: يُعرَض على العملاء بوصفه `readOnlyHint`. |
| `metadata.requiresApproval` | كل استدعاء ينتظر إنسانًا (انظر [الموافقات](./mcp-deploy#approvals-a-human-says-yes-first)). |
| `retry` | إعادة المحاولة عند الفشل، للأدوات المتساوية القوة (idempotent) فقط (يحصر `retryOn` الإخفاقات المعنية؛ ولا تُعاد محاولة المعاملات غير الصالحة أبدًا). |

## واجهة API على الويب، انطلاقًا من وصف OpenAPI الخاص بها {#a-web-api-from-its-openapi-description}

**ما تفعله.** تنشر واجهات API كثيرة وصفًا قابلًا للقراءة آليًا لنقاط نهايتها، يُسمّى مستند **OpenAPI** (غالبًا `openapi.json`). تقرؤه `openApiTools` وتحوّل **كل عملية إلى أداة**: يرى النموذج ملخّصها ومعاملاتها، واستدعاء الأداة يستدعي واجهة API.

```ts
import { openApiTools } from '@sdk-ai-agents/core';

await serveMcpOverStdio(sdk, {
  name: 'petstore',
  tools: await openApiTools({ spec: 'https://petstore3.swagger.io/api/v3/openapi.json' }),
});
```

**للقراءة فقط افتراضيًا.** لا تصبح أدواتٍ إلا عمليات `GET`. لإضافة عملية تغيّر شيئًا (`POST`، `PUT`، `PATCH`، `DELETE`)، اسردها بمعرّفها `operationId`:

```ts
const tools = await openApiTools({
  spec: './crm-openapi.json',
  headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  include: ['getCustomer', 'listInvoices', 'createNote'], // createNote is a POST
  prefix: 'crm_',
});
```

تُوسَم عملية الكتابة المسرودة بأنها **عالية المخاطر** و**تتطلّب موافقة**: كل استدعاء ينتظر إلى أن يوافق عليه إنسان (انظر [الموافقات](./mcp-deploy#approvals-a-human-says-yes-first)). وللوثوق بها دون موافقة، صرّح بذلك صراحةً: `metadata: (operation) => (operation.operationId === 'createNote' ? { requiresApproval: false } : undefined)`.

### الخيارات {#options}

| الخيار | القيمة الافتراضية | |
| --- | --- | --- |
| `spec` | — | عنوان URL (`https://…`)، أو مسار ملف، أو كائن سبق أن حلّلته. JSON فقط؛ أما YAML فحلّله بنفسك (مثلًا بالحزمة `yaml`) ومرّر الكائن. |
| `baseUrl` | أول إدخال في `servers` | وجهة الطلبات. يُحَلّ عنوان URL النسبي للخادم بالنسبة إلى عنوان URL الخاص بالمواصفة. |
| `headers` | — | تُضاف إلى كل طلب (المصادقة). لا تُعرَض على النموذج أبدًا، وتتغلّب على أي معامل ترويسة. تتطلّب `baseUrl` (ما لم تُنزَّل المواصفة من أصل واجهة API نفسها) وhttps لواجهة API وللمواصفة (http فقط على هذا الجهاز). |
| `include` | عمليات GET | قيم `operationId` المراد عرضها. حين تُعطى، **تحلّ محل** الافتراضي GET: فلا تصبح أدواتٍ إلا العمليات المسرودة. وهي الطريقة الوحيدة لعرض عملية كتابة. والمعرّف غير المعروف خطأ. |
| `exclude` | — | قيم `operationId` المراد استبعادها. |
| `tags` | — | العمليات التي تحمل أحد هذه الوسوم فقط. |
| `prefix` | — | بادئة أسماء الأدوات (`crm_getCustomer`)، للجمع بين عدة واجهات API. |
| `metadata` | GET: مخاطر منخفضة، للقراءة فقط · غيرها: مخاطر عالية، موافقة | `(operation) => ToolMetadata`. كل حقل تحدّده يحلّ محل الحقل الافتراضي؛ والحقل المتروك — أو `undefined` — يُبقيه، فلا يزيل الموافقةَ إلا `requiresApproval: false` صريح. |
| `retry` | — | إعادة المحاولة للعمليات التي للقراءة فقط (عمليات GET، ما لم تقل `metadata` غير ذلك)، عند أخطاء الخادم (5xx)، و429، وانتهاء المهلة، وإخفاقات الشبكة — ولا تكون أبدًا عند إجابات 4xx أو المعاملات غير الصالحة. |
| `timeoutMs` | `30000` | لكل طلب (ولتنزيل المواصفة). |
| `maxResponseBytes` | `100000` | الاستجابات الأطول تُقطَع وتُوسَم بـ `truncated: true`. |
| `maxSpecBytes` | `10000000` | أكبر مواصفة مقبولة. |
| `fetch` | `fetch` العامة | دالة HTTP الخاصة بك (وكيل وسيط، اختبارات). |

### ما يراه النموذج {#what-the-model-sees}

بالنسبة إلى العملية `getPetById` في Petstore، تتلقّى العملاء:

```json
{
  "name": "getPetById",
  "description": "Find pet by ID\n\nReturns a single pet.\n\n(GET /pet/{petId})",
  "inputSchema": {
    "type": "object",
    "properties": {
      "petId": { "type": "integer", "format": "int64", "description": "ID of pet to return" }
    },
    "required": ["petId"],
    "additionalProperties": false
  },
  "annotations": { "readOnlyHint": true }
}
```

تأتي أسماء الأدوات من `operationId` (بعد جعلها صالحة: `show pet!` يصبح `show_pet`؛ والعملية التي لا معرّف لها تصبح `get_pets_petId`؛ والمكرَّرات تحصل على `_2`). والمعاملات مسطّحة: واحد لكل معامل مسار واستعلام وترويسة، إضافة إلى `body` لجسم طلب JSON. ويعيد الاستدعاء حالة HTTP والجسم بعد تحليله:

```json
{ "status": 200, "data": { "id": 10, "name": "doggie", "status": "available" } }
```

### قواعد الأمان {#security-rules}

1. **للقراءة فقط افتراضيًا**: `GET` فقط؛ وأي شيء آخر يجب سرده في `include`، وعندها يتطلّب موافقة ما لم تقل غير ذلك.
2. **لا يستطيع النموذج تغيير المضيف، ولا الصعود في المسار.** عنوان URL الأساسي ملكك. ولا يمكن لقيمة مسار أن تحتوي على `/` أو `\` أو مقطع `.` / `..` — حتى لو كان مرمَّزًا بالنسبة المئوية، مرة أو عدة مرات، بجوار رموز هروب مشوّهة أو لا، لأن بعض الخوادم والوكلاء الوسطاء يفكّون ترميز `%2F` — فيُرفَض `../../admin`؛ ويُتحقَّق أيضًا من أن عنوان URL النهائي يبقى تحت عنوان URL الأساسي. وضمن هذه الحدود يختار النموذج القيم: أي عميل، أي طلبية.
3. **تُفحَص المعاملات قبل أي شيء آخر**: قبل السياسات والموافقات (فالاستدعاء غير الصالح لا ينتظر إنسانًا أبدًا)، ثم مرة أخرى حين يُبنى الطلب. تُرفَض المعاملات غير المعروفة والمطلوبة الناقصة؛ ويجب أن تكون القيم سلاسل نصية أو أرقامًا أو قيمًا منطقية (أو قوائم منها لمعاملات الاستعلام)؛ ولا يمكن لقيم الترويسات أن تحتوي على فواصل أسطر.
4. **لا تذهب بيانات اعتمادك إلا حيث قرّرت**: تضيف الخادمُ `headers`، وتتغلّب على معاملات الترويسات، ولا تظهر في أي مكان يستطيع النموذج قراءته. مع `headers`، يُرفَض الخادم المذكور في ملف مواصفة — مرّر `baseUrl` — ما لم تُنزَّل المواصفة من أصل واجهة API نفسها؛ ويُرفَض `http:` إلا على هذا الجهاز (`localhost`، `127.0.0.1`، `[::1]`) — لواجهة API، ولتنزيل المواصفة، لأن مواصفة عُدِّلت في طريقها قد تضيف عمليات تأذن بها بيانات اعتمادك.
5. **محدود**: مهلة لكل طلب، واستجابات تُقطَع عند `maxResponseBytes`، وحدّ لحجم المواصفة.
6. **لا تُتبَع عمليات إعادة التوجيه** (فقد تحمل إعادة التوجيه ترويسة `Authorization` الخاصة بك إلى موقع آخر): إجابة `3xx` خطأ، وكذلك إعادة التوجيه التي تتبعها دالة `fetch` مخصّصة رغم ذلك.
7. **الأخطاء أخطاء**: الحالة غير `2xx` تُفشل الاستدعاء مع الحالة وبداية الجسم. لا ترى عملاء MCP إلا «Tool execution failed» ما لم تعيّن `exposeErrorDetails: true` (فقد تحتوي الأجسام على تفاصيل داخلية)؛ ويحتوي سجل الأحداث دائمًا على الخطأ الكامل.
8. **تُعلَن كل عملية GET على أنها للقراءة فقط** (`readOnlyHint`). بعض واجهات API لديها عمليات GET ذات آثار جانبية (`GET /send-reminder`): استبعدها بـ `exclude`، أو عيّن لها `metadata` إلى `readOnly: false, requiresApproval: true`.
9. **تبقى الأوصاف الكبيرة محدودة**: لتوسيع `$ref` ميزانية لكل عملية وللمواصفة كاملة، ومخطط الأداة الذي يتجاوز 64,000 حرف يُستبدَل بأوصافه.

### الملف الكامل {#complete-file}

[`examples/mcp-openapi.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-openapi.ts)، مع عبارات الاستيراد الخاصة بحزمة مثبّتة:

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK, openApiTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const spec = process.env.OPENAPI_SPEC ?? 'https://petstore3.swagger.io/api/v3/openapi.json';
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

const tools = await openApiTools({
  spec,
  ...(process.env.API_BASE_URL ? { baseUrl: process.env.API_BASE_URL } : {}),
  ...(process.env.API_TOKEN ? { headers: { Authorization: `Bearer ${process.env.API_TOKEN}` } } : {}),
  timeoutMs: 15_000,
});

await serveMcpOverStdio(sdk, { name: 'web-api', tools });
```

مرّر الرمز عبر بيئة العميل، ولا تضعه في الملف أبدًا: `claude mcp add web-api -e API_TOKEN=… -- npx -y tsx /path/mcp-openapi.ts`.

### ما لا تفعله {#what-it-does-not-do}

- **OpenAPI 3.x فقط**: يُرفَض Swagger 2.0 (حوّله، مثلًا بـ `swagger2openapi`). ولا يُحلَّل YAML نيابةً عنك.
- **أجسام JSON فقط**: العملية التي تتطلّب جسمًا من نوع `multipart/form-data` أو جسم نموذج تُستبعَد (أو تُرفَض إن سردتها)؛ والجسم الاختياري من نوع آخر لا يُعرَض. وتُستبعَد معاملات ملفات تعريف الارتباط (cookies).
- **لا مسارات تسجيل دخول**: مرّر رمزًا في `headers`؛ ولا يُعالَج OAuth.
- **المراجع المحلية فقط**: لا تُحَلّ قيم `$ref` التي تشير إلى ملفات أو عناوين URL أخرى (فتصبح «أي قيمة»)؛ والمخطط الذي يشير إلى نفسه يُقطَع عند الدورة.
- لا تُفحَص الاستجابات مقابل المواصفة، ولا تُتبَع الصفحات، ولا يُستخدَم إلا أول خادم في المواصفة ما لم تمرّر `baseUrl`.

## مجلد مستندات {#a-folder-of-documents}

**ما تفعله.** تعرض الملفات النصية لمجلد واحد — دليل موظفين، أو ملاحظات، أو قاعدة شيفرة، أو مستندات مُصدَّرة — بثلاث أدوات: **سرد** الملفات، و**قراءة** أحدها، و**البحث** فيها عن نص. وتُعرَض الملفات نفسها أيضًا بوصفها **موارد**، يستطيع المستخدمون إرفاقها بمحادثة بأنفسهم.

```ts
import { folderResources, folderTools } from '@sdk-ai-agents/core';

const handbook = { root: '/Users/you/handbook', exclude: ['drafts/**'] };

await serveMcpOverStdio(sdk, {
  name: 'handbook',
  tools: folderTools(handbook),
  resources: folderResources(handbook),
});
```

### الخيارات {#options-1}

تأخذ `folderTools` و`folderResources` الخيارات نفسها (إضافة إلى `prefix` للأدوات):

| الخيار | القيمة الافتراضية | |
| --- | --- | --- |
| `root` | — | المجلد. استخدم مسارًا مطلقًا: فالعملاء يشغّلون الخوادم من أي مجلد عمل. |
| `name` | اسم المجلد | يُستخدَم في الأوصاف وفي معرّفات URI للموارد (`folder://<name>/…`). |
| `prefix` | — | بادئة أسماء الأدوات (`handbook_read_file`)، لتقديم عدة مجلدات. |
| `extensions` | صيغ النصوص | الامتدادات المعروضة، دون النقطة (`['md', 'txt']`). الافتراضي: `md`، `txt`، `csv`، `json`، `yaml`، `html`، الشيفرة المصدرية… (`DEFAULT_TEXT_EXTENSIONS`). أضف `''` للملفات التي بلا امتداد. |
| `include` | كل ما هو مسموح | أنماط glob للملفات المعروضة: `guide/**`، `**/*.md`. يطابق `*` داخل مجلد واحد، و`**` عبر المجلدات. تظل المجلدات مسرودة، حتى حين لا تحتوي على أي ملف مطابق. |
| `exclude` | — | أنماط glob للملفات والمجلدات المراد إخفاؤها في كل مكان: `drafts`، `private/*`، `**/node_modules`. المجلد المخفي يخفي كل ما بداخله. |
| `includeHidden` | `false` | عرض الأسماء التي تبدأ بنقطة (`.env`، `.git`…). اتركه معطّلًا. |
| `maxFileBytes` | `200000` | البايتات المقروءة من ملف واحد؛ والملفات الأطول تُقطَع (`truncated: true`). |
| `maxEntries` | `500` | الإدخالات التي يعيدها سرد واحد، بما فيها الموارد. |
| `maxDepth` | `8` | عمق المجلدات الفرعية المستكشَفة. |
| `maxMatches` | `50` | التطابقات التي يعيدها بحث واحد. |
| `maxSearchBytes` | `20000000` | البايتات التي يقرؤها بحث واحد، لكل الملفات مجتمعة. |
| `maxExaminedEntries` | `50000` | الأسماء التي يطّلع عليها سرد أو بحث واحد، معروضة كانت أم لا؛ وبعد تجاوزها تقول النتيجة `truncated: true`. |

### ما يراه النموذج {#what-the-model-sees-1}

أداة البحث، مختصرة:

```json
{ "name": "search_files",
  "description": "Finds the lines of the \"handbook\" folder that contain a text (case-insensitive), with file and line number.",
  "inputSchema": { "type": "object",
    "properties": { "query": { "type": "string", "minLength": 1, "maxLength": 200 },
                    "path": { "type": "string", "description": "Folder to search in; default: everywhere" } },
    "required": ["query"] },
  "annotations": { "readOnlyHint": true } }
```

يعيد البحث `{ "query": "laptop", "matches": [{ "path": "guide/onboarding.md", "line": 2, "text": "Ask IT for a laptop." }], "filesScanned": 6, "truncated": false }`. وتعيد القراءة `{ "path", "size", "content", "truncated" }`.

**الموارد**: يُسرَد كل ملف بالصيغة `folder://handbook/guide/onboarding.md` مع حجمه ونوعه (`text/markdown`، `text/csv`…). والتطبيقات التي تدعم الموارد تتيح للمستخدم اختيارها، مثلًا من قائمة المرفقات؛ وتختلف الطريقة حسب التطبيق.

### قواعد الأمان {#security-rules-1}

1. **المسارات النسبية فقط**؛ وتُرفَض المسارات المطلقة.
2. **لا شيء خارج المجلد**: يُحَلّ كل مسار إلى موقعه الحقيقي — بما في ذلك مقاطع `..` والروابط الرمزية — ويُرفَض إذا خرج من المجلد. والرابط إلى مجلد سبقت زيارته يُتخطّى، فلا تستطيع حلقة روابط أن تعلّق عملية سرد.
3. **الأسماء المخفية غير مرئية**: `.env`، و`.git`، و`.ssh`… تتصرّف كأنها غير موجودة، حتى عبر رابط.
4. **النصوص فقط**: لا تُعرَض إلا الامتدادات المسموح بها، ويُرفَض الملف الذي تحتوي أول 8 كيلوبايت منه على بايت صفري (ملف ثنائي).
5. **محدود**: القراءات، والسرود، والعمق، وتطابقات البحث، والبايتات الممسوحة، والأسماء المفحوصة (`maxExaminedEntries`، 50,000) كلها محدودة؛ والسرد أو البحث الذي توقّف مبكرًا يقول `truncated: true`.
6. **للقراءة فقط**: لا يُكتَب أي شيء أبدًا، ولا يُنقَل، ولا يُحذَف.
7. **مُتتبَّع**: كل قراءة لمورد تشغيلٌ في سجل الأحداث، مع معرّف URI، والحجم، وبصمة SHA-256 لما قُدِّم.
8. **المستبعَد مستبعَد**: استبعاد مجلد (`private`، `private/*`، `**/node_modules`) يخفي كل ما بداخله، سواء في السرد، أو البحث، أو القراءة بالمسار، أو القراءة بوصفه موردًا.
9. **متين**: يُتخطّى المجلد الفرعي الذي تتعذّر قراءته، وتذكر رسائل الخطأ اسم المجلد المشترك، لا مساره المطلق أبدًا.

### الملف الكامل {#complete-file-1}

مقتبس من [`examples/mcp-folder.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-folder.ts) (الذي يقدّم هذا التوثيق افتراضيًا):

```ts
import { join, resolve } from 'node:path';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, 'docs'));
const folder = { root, name: 'docs', exclude: ['**/node_modules/**'] };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'docs',
  tools: folderTools(folder),
  resources: folderResources(folder),
  instructions: 'Company documentation. Search it before answering questions about our processes.',
});
```

### ما لا تفعله {#what-it-does-not-do-1}

- **لا كتابة** من أي نوع.
- **لا PDF ولا Word ولا صور**: الملفات النصية فقط. حوّل المستندات إلى Markdown أو نص أولًا.
- **البحث عن سلسلة فرعية فقط**: لا بحث قائم على المعنى («دلالي»)، ولا ترتيب للنتائج.
- **لا إشعارات بالتغييرات**: ترى العملاء الملفات كما هي لحظة سردها.
- **يجب ألا يكون المجلد قابلًا للكتابة من أشخاص لا تثق بهم**: تُفحَص المسارات، ثم يُفتَح الملف؛ ومن يستطيع استبدال مجلد برابط في تلك اللحظة بالضبط قد يتمكّن نظريًا من التسلّل.
- **مع `include`، تظل المجلدات مسرودة** حتى حين لا تحتوي على أي ملف مطابق (فالتحقّق يعني قراءة كل مجلد فرعي).
- قراءات الموارد مُتتبَّعة لكنها لا تُفحَص بسياسات الأدوات: لا تعرض إلا المجلدات التي يسرّك مشاركتها.

## قاعدة بيانات للقراءة فقط {#a-read-only-database}

**ما تفعله.** تتيح للنموذج استكشاف قاعدة بيانات — سرد الجداول، ووصف أحدها، وتشغيل استعلام `SELECT` — و**عدم تغييرها أبدًا**. تعمل مع **SQLite** (الوحدة المدمجة `node:sqlite` في Node.js 22.13+، أو `better-sqlite3`) و**PostgreSQL** (`pg`).

::: code-group

```ts [SQLite]
import { DatabaseSync } from 'node:sqlite';
import { databaseTools, sqliteReadOnly } from '@sdk-ai-agents/core';

const db = new DatabaseSync('/data/shop.sqlite', { readOnly: true });

await serveMcpOverStdio(sdk, {
  name: 'shop',
  tools: databaseTools({ database: sqliteReadOnly(db), name: 'the shop database' }),
});
```

```ts [PostgreSQL]
import pg from 'pg';
import { databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
  }),
});
```

:::

### الخيارات {#options-2}

| خيار `databaseTools` | القيمة الافتراضية | |
| --- | --- | --- |
| `database` | — | `sqliteReadOnly(db)`، أو `postgresReadOnly({ pool })`، أو `postgresReadOnly({ client })`، أو `ReadOnlyDatabase` خاصة بك. |
| `name` | `the <dialect> database` | الاسم الذي يسمعه النموذج عنها: "the shop database". |
| `prefix` | — | بادئة أسماء الأدوات (`shop_query`)، لتقديم عدة قواعد بيانات. |
| `maxRows` | `100` (بحدّ أقصى `1000`) | الصفوف التي يعيدها استعلام واحد؛ وتقول `truncated: true` إنه كان هناك المزيد. |
| `maxTextLength` | `2000` | عدد الأحرف المحتفَظ بها لكل قيمة نصية. |
| `maxTables` | `500` | الجداول المسرودة. |
| `maxSqlLength` | `20000` | أطول SQL مقبول. |

| خيار `postgresReadOnly` | القيمة الافتراضية | |
| --- | --- | --- |
| `statementTimeoutMs` | `10000` | يوقف PostgreSQL أي استعلام يستغرق وقتًا أطول. |
| `schemas` | الكل عدا مخططات النظام | المخططات التي **تسردها وتصفها** `list_tables` و`describe_table`. ولا تقيّد ما يستطيع `query` قراءته: فهذه مهمة الدور (role). |

مع `{ client }`، أعطِ المحوِّل `pg.Client` **مخصّصًا**: لا يستخدمه تطبيقك لمعاملاته الخاصة (يُرفَض المجمَّع pool هنا؛ مرّره بوصفه `{ pool }`).

ليست لـ `sqliteReadOnly(db)` خيارات: افتح الملف للقراءة فقط (`{ readOnly: true }` مع `node:sqlite`، و`{ readonly: true }` مع better-sqlite3). وهي لا تعتمد إلا على `prepare` و`exec` ودوال العبارات المشتركة بين المشغّلَين؛ وتشغّلها مجموعة الاختبارات على قاعدة بيانات `node:sqlite` حقيقية، لا على better-sqlite3.

### ما يراه النموذج {#what-the-model-sees-2}

ثلاث أدوات: `list_tables`، و`describe_table { table }`، و`query { sql }`، موصوفة بأنها *"Runs one read-only SQL query (sqlite dialect) on the shop database and returns at most 100 rows; "truncated" is true when there were more. Statements that change data or schema are refused. Use list_tables and describe_table first."*، أي: «تشغّل استعلام SQL واحدًا للقراءة فقط (بلهجة sqlite) على قاعدة بيانات المتجر وتعيد 100 صف على الأكثر؛ وتكون "truncated" صحيحة حين يكون هناك المزيد. تُرفَض العبارات التي تغيّر البيانات أو المخطط. استخدم list_tables وdescribe_table أولًا.» ويعيد الاستعلام:

```json
{ "columns": ["name", "spent"],
  "rows": [{ "name": "Ada", "spent": 200.5 }, { "name": "Grace", "spent": 42 }],
  "rowCount": 2, "truncated": false }
```

تُجعَل القيم مقروءة مع وصول الصفوف: الأعداد الصحيحة الكبيرة جدًا تصبح سلاسل نصية، والتواريخ سلاسل ISO، والبيانات الثنائية ملاحظة مثل `<binary data, 3 bytes>`، والنصوص الطويلة تُقطَع، والمصفوفات تحتفظ بـ 100 عنصر (`… 400 more items`). وحين ترفض قاعدة البيانات الاستعلام نفسه ("no such column"، "read-only"، انتهاء المهلة)، يحصل النموذج على السبب ليصلح SQL الخاص به؛ أما أخطاء الاتصال والخادم فتبقى لديك.

### قواعد الأمان: أربعة أقفال، لا قفل واحد {#security-rules-four-locks-not-one}

التحقّق من أن الاستعلام «يبدأ بـ SELECT» لا يكفي: `WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone` يبدأ بـ `WITH` ويحذف. لذلك يجب أن يجتاز الاستعلام أربعة أقفال:

1. **فحص العبارة**: عبارة واحدة بالضبط (مع فهم الفواصل المنقوطة داخل السلاسل النصية، والأسماء المقتبَسة، والتعليقات، وعلامات الاقتباس `$$` في PostgreSQL، والسلاسل ذات رموز الهروب `E'…'`)، تبدأ بـ `SELECT` أو `WITH` أو `VALUES`، دون معاملات `$1`، ومع أقواس متوازنة. تُرفَض `PRAGMA`، و`ATTACH`، و`EXPLAIN ANALYZE`، و`COMMIT`…
2. **قاعدة البيانات نفسها ترفض الكتابة**:
   - SQLite: يعمل كل استعلام مع `PRAGMA query_only = ON` (تُستعاد القيمة بعد ذلك)، ومع better-sqlite3 تُرفَض العبارة التي تكتب قبل تشغيلها؛
   - PostgreSQL: يعمل كل استعلام في معاملة `BEGIN READ ONLY` خاصة به — ويُكتشَف أولًا الاتصال الموجود بالفعل داخل معاملة أخرى (`transaction_timestamp()` أقدم من العبارة) ويُرفَض دون المساس بتلك المعاملة — مع `SET LOCAL statement_timeout`، وينتهي دائمًا بـ `ROLLBACK` ثم `SELECT pg_advisory_unlock_all()` (أقفال الاستشارة advisory locks تبقى بعد التراجع؛ والاتصال الذي لا يستطيع تحريرها لا يُعاد استخدامه). يُرسَل الاستعلام استعلامًا فرعيًا مع معامل مربوط، فلا يقبل الخادم إلا عبارة واحدة. ولا تتشارك المعاملات اتصالًا في الوقت نفسه أبدًا.
3. **الحدود**: لا يُقرَأ أكثر من `maxRows` صفًا (لا تقرأ SQLite البقية أبدًا؛ ويتوقّف PostgreSQL عند `LIMIT`)، وتُقطَع القيم في نسخ قصيرة مع وصول الصفوف (وتظل كل قيمة خام تُحمَّل كاملة قبل قطعها)، ولاستعلامات PostgreSQL مهلة زمنية.
4. **أنت**: افتح ملفات SQLite للقراءة فقط؛ واتصل بـ PostgreSQL بدور لا يستطيع إلا قراءة ما تريد عرضه — فهذا هو الحدّ الحقيقي، لأن المعاملة للقراءة فقط لا توقف ما قد تفعله دالة خارج قاعدة البيانات (مثل `dblink` أو امتداد HTTP). ويظل مثل هذا الدور قادرًا على قراءة فهرس النظام (`pg_catalog`) واستدعاء الدوال الممنوحة لـ `PUBLIC`؛ فاسحب صلاحيات دوال الامتدادات التي تصل إلى الخارج (`REVOKE EXECUTE ON FUNCTION dblink(text, text) FROM PUBLIC;`، وما شابه):

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE shop TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON customers, orders TO mcp_reader;   -- only what the model may read
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
```

### الملفات الكاملة {#complete-files}

[`examples/mcp-database.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-database.ts) (SQLite، وينشئ قاعدة بيانات متجر تجريبية حين لا تعطيه ملفًا) و[`examples/mcp-postgres.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-postgres.ts):

```ts
import { join } from 'node:path';
import pg from 'pg';
import { FileEventStore, createSDK, databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL to a read-only PostgreSQL role');

const pool = new pg.Pool({ connectionString, max: 4 });
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
    maxRows: 100,
  }),
});
```

### ما لا تفعله {#what-it-does-not-do-2}

- **لا كتابة**، عن قصد. للسماح لنموذج بتغيير البيانات، اكتب أداة مخصّصة لذلك التغيير الواحد، مع موافقة.
- **لا مرشِّح لكل جدول داخل الاستعلامات**: يستطيع الاستعلام قراءة أي شيء يستطيع الاتصال قراءته. استخدم دورًا (PostgreSQL) أو نسخة من الملف لا تحتوي إلا على الجداول المناسبة (SQLite)؛ واعرض طرق عرض (views) بدل الجداول الخام.
- **SQLite: الاستعلام هو سطح الهجوم، لا الملف.** تعمل الاستعلامات داخل عملية خادمك، بشكل متزامن، دون مهلة زمنية ودون سقف للذاكرة: من يكتب SQL — النموذج، أو من يوجّهه — يستطيع كتابة استعلام لا ينتهي أبدًا (`WITH` تكراري) أو يبني قيمًا ضخمة، فيعطّل الخادم أو يستنزفه. تُقرَأ الصفوف واحدًا تلو الآخر وتُقطَع كل قيمة في نسخة قصيرة لحظة وصولها، فتبقى النتيجة صغيرة ويمكن تحرير الأصول — لكن كل قيمة خام تُحمَّل كاملة أولًا، ولا شيء يحدّ العمل الذي تقوم به SQLite لإنتاج صف. قدّم SQLite لنفسك أو لأشخاص تثق بهم؛ ولا تعرضها عبر HTTP لعملاء غير موثوقين. تشغيل الاستعلامات في خيط عامل (worker thread) يمكن إيقافه سيزيل هذا الحدّ؛ ولم يُنجَز ذلك بعد.
- **دوال SQLite المسجَّلة على الاتصال قابلة للاستدعاء** من SQL الذي يكتبه النموذج (`db.function(…)`): لا تسجّل إلا دوال غير ضارة على اتصال تقدّمه.
- **لا معاملات ربط**: يكتب النموذج القيم داخل SQL.
- العمودان اللذان لهما الاسم نفسه في نتيجة لا يُحتفَظ إلا بآخرهما: أعطهما أسماء مستعارة.
- قواعد البيانات الأخرى (MySQL، SQL Server…): نفّذ الواجهة الصغيرة `ReadOnlyDatabase` بنفسك، واجعلها ترفض الكتابة من تلقاء نفسها. لا تفهم `assertSingleQuery(sql, dialect)` إلا صياغة SQLite وPostgreSQL؛ أما MySQL (رموز الهروب بالشرطة المائلة العكسية في كل سلسلة نصية، وتعليقات `#`) فتحتاج إلى فحص خاص بها.

## وكيل: توأمك الاستدلالي {#an-agent-your-reasoning-twin}

**ما تفعله.** تعرض وكيلًا كاملًا في صورة أداة واحدة. أكثر الاستخدامات لفتًا للنظر: [وكيل معرفي بملف المفكّر الخاص بك](./thinker-profiles)، بحيث يستطيع أي شخص من Claude Desktop أن يسأل *«ماذا كان Nicolas سيرى في الدفع مقابل Jev؟»* ويحصل على إجابة مستدَلّ عليها **بالطريقة التي يستدل بها Nicolas**، مع مسوّغها وما لا يزال ناقصًا.

```ts
import { cognitiveAgentTool } from '@sdk-ai-agents/core';

const twin = sdk.createCognitiveAgent({
  name: 'nicolas',
  model: 'gpt-4o-mini',
  profile,                                     // how Nicolas reasons
  limits: { maxSteps: 6, timeoutMs: 50_000 },  // small: MCP clients do not wait forever
});

await serveMcpOverStdio(sdk, {
  name: 'nicolas-twin',
  tools: [cognitiveAgentTool(twin, { name: 'ask_nicolas', description: 'How Nicolas would reason about a question or a decision' })],
});
```

تحتاج هذه الوصفة إلى مفتاح نموذج (`createSDK({ apiKey: process.env.OPENAI_API_KEY, … })`): فالوكيل يفكّر بنموذج لغوي.

### الخطوة 1 — التقط طريقة استدلالك {#step-1-—-capture-how-you-reason}

اشرح بضعة مواضيع بكلماتك الخاصة، واستخلصها في ملف مرة واحدة، واحفظه:

```ts
import { writeFileSync } from 'node:fs';

const profile = await sdk.distillThinkerProfile({
  id: 'nicolas',
  name: 'Nicolas',
  model: 'gpt-4o',
  samples: [
    { topic: 'Paying for a typed-decision API', reasoning: 'What does it really allow? Then the limits…', conclusion: 'Try an open clone first' },
    // a few more topics, in your own words
  ],
});
writeFileSync('nicolas.profile.json', JSON.stringify(profile, null, 2));
```

انظر [الاستدلال على طريقة شخص معيّن](./thinker-profiles) لمعرفة ما يحتويه الملف وكيف تصحّحه بمرور الوقت.

### الخطوة 2 — قدّمه {#step-2-—-serve-it}

يحمّل [`examples/mcp-agent.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-agent.ts) الملف من `PROFILE_FILE` (مع التحقّق منه مقابل مخطط الملف) أو يستخدم مثالًا مدمجًا، ويقدّم `ask_nicolas`:

```sh
claude mcp add nicolas-twin -e OPENAI_API_KEY=sk-… -e PROFILE_FILE=/path/nicolas.profile.json -- npx -y tsx /path/mcp-agent.ts
```

### ما يراه النموذج وما يعود إليه {#what-the-model-sees-and-gets-back}

تأخذ الأداة `problem` (السؤال، حتى 4,000 حرف) وكائن `context` اختياريًا (الوقائع والقيود، حتى 20,000 حرف بصيغة JSON). وتعيد القرار، لا الحالة الذهنية كاملة:

```json
{
  "runId": "run_6c01de53-…",
  "status": "completed",
  "decisionStatus": "committed",
  "answer": "Prototype with the open clone first; pay only if it falls short on real data.",
  "rationale": "…",
  "confidence": 0.78,
  "nextActions": ["Benchmark the clone on 50 real tickets"]
}
```

قيمة `decisionStatus` هي `committed` (إجابة حاسمة)، أو `provisional` (أفضل إجابة حتى الآن، مع `missing`: ما لم يثبت)، أو `abstain`. ويبقى الاستدلال الكامل في سجل الأحداث تحت `runId`: يعرض `sdk.getMentalState(runId)` كل فرضية وكل نقد. وحين يفشل تشغيل، لا يقول `error` إلا إنه لم يكتمل وأين يجب البحث (تضع `exposeErrors: true` الرسالة نفسها في النتيجة: وقد تحتوي على تفاصيل المزوّد).

### الخيارات {#options-3}

| الخيار | القيمة الافتراضية | |
| --- | --- | --- |
| `name` | `ask_<agent name>` | اسم الأداة. |
| `description` | عامّ | قل متى يُستشار هذا الوكيل: فالنموذج يقرّر بناءً عليه. |
| `metadata` | مخاطر متوسطة | بيانات الحوكمة الوصفية، تُدمَج حقلًا بحقل فوق الافتراضي؛ أضف `requiresApproval: true` لتأكيد كل استشارة. |
| `maxInputLength` | `4000` | أطول مشكلة (أو رسالة) مقبولة. |
| `maxContextLength` | `20000` | أطول `context`، بوصفه نص JSON. |
| `exposeErrors` | `false` | وضع رسالة خطأ التشغيل الفاشل في النتيجة. |

تفعل `governedAgentTool(agent, options)` الشيء نفسه لوكيل أُنشئ بـ `sdk.createAgent`: فهي تأخذ `message` (و`context`) وتعيد `{ runId, status, output, error }`.

### من المفيد معرفته {#good-to-know}

- **يستغرق وقتًا.** يجري التشغيل المعرفي عدة استدعاءات للنموذج: احسب عشرات الثواني، وأحيانًا دقائق. تلغي عملاء كثيرة الاستدعاء بعد نحو دقيقة (القيمة الافتراضية في حزمة TypeScript SDK الرسمية 60 ثانية؛ ويتيح لك Claude Code رفعها بـ `MCP_TOOL_TIMEOUT`). أبقِ `limits` صغيرة للاستخدام التفاعلي، ما لم يكن عميلك يعيد ضبط مهلته عند [إشعارات التقدّم](./mcp-deploy#progress-notifications): فكل خطوة من خطوات الوكيل ترسل إشعارًا. **حين يتخلّى العميل، يُوقَف التشغيل** (للوكلاء المعرفيين والخاضعين للحوكمة على حدّ سواء) ويُسجَّل ملغى: لا تُجرى استدعاءات أخرى للنموذج، وتُلغى الموافقة التي كان الوكيل ينتظرها.
- **يكلّف مالًا**: كل استشارة عدة استدعاءات للنموذج. ضع عليه [ميزانية](./mcp-deploy#governance-policies-budgets-approvals) وتحقّق من `sdk.getRunCost(runId)`.
- **يحاكي طريقة استدلال، لا ما يعرفه الشخص.** يعرف التوأم ما في الملف، والسؤال، والسياق — لا ذاكرة الشخص. تعامَل مع إجاباته على أنها «كيف كان سيتناول هذا الأمر»، ودع الشخص الحقيقي يصحّحه بـ `learnFromFeedback`.

## عدة مصادر في خادم واحد {#several-sources-in-one-server}

اجمع المصادر ببادئات كي لا تتصادم الأسماء أبدًا:

```ts
await serveMcpOverStdio(sdk, {
  name: 'company',
  tools: [
    ...(await openApiTools({ spec: './crm-openapi.json', prefix: 'crm_', headers })),
    ...folderTools({ root: '/srv/handbook', prefix: 'handbook_' }),
    ...databaseTools({ database: sqliteReadOnly(db), prefix: 'shop_' }),
    'find_colleague', // a tool you defined yourself
  ],
  resources: folderResources({ root: '/srv/handbook' }),
});
```

تُرفَض أداتان لهما الاسم نفسه عند بدء التشغيل، مع رسالة تقول أيهما.

## الأدوات نفسها في وكلائك {#the-same-tools-in-your-own-agents}

المصادر تعريفات أدوات عادية: يستطيع وكلاؤك استخدامها دون MCP.

```ts
const tools = (await openApiTools({ spec: './crm-openapi.json' })).map((definition) => sdk.defineTool(definition));
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools });
```

تنطبق القواعد نفسها: عمليات الكتابة التي سردتها تنتظر الموافقة، وكل استدعاء يُفحَص ويُسجَّل.

التالي: [النشر والتأمين واستكشاف الأعطال](./mcp-deploy).
