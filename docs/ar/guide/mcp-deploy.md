# النشر والتأمين واستكشاف الأعطال

خادمك يعمل على جهازك ([الخادم الأول](./mcp-first-server)، [الوصفات](./mcp-recipes)). تتناول هذه الصفحة مشاركته عبر HTTP، وإدخال القواعد والبشر في الحلقة، وقائمة التحقّق الأمنية، وما يجب فعله حين لا يعمل شيء ما.

## stdio أم HTTP؟ {#stdio-or-http}

| | stdio | Streamable HTTP |
| --- | --- | --- |
| كيف يعمل | يشغّل تطبيق الذكاء الاصطناعي خادمك برنامجًا على الحاسوب نفسه | يعمل خادمك في مكان ما بوصفه خدمة ويب |
| من يستطيع استخدامه | الشخص الموجود على ذلك الحاسوب | أي شخص تعطيه العنوان ورمزًا |
| التعرّض للشبكة | لا شيء | نقطة نهاية HTTP يجب حمايتها |
| الأنسب لـ | الأدوات الشخصية، والملفات المحلية، وتجربة الأشياء | فريق، أو واجهة API أو قاعدة بيانات على مستوى الشركة |
| يُشغَّل بـ | `serveMcpOverStdio(sdk, options)` | `createMcpServer(sdk, options)` + وسيلة نقل HTTP من حزمة MCP SDK |

ابدأ بـ stdio. وانتقل إلى HTTP حين يحتاج عدة أشخاص إلى الخادم نفسه.

## التقديم عبر HTTP {#serve-over-http}

توفّر حزمة MCP SDK الرسمية وسيلة نقل HTTP؛ ويعطيها `createMcpServer` خادمًا خاضعًا للحوكمة. يستخدم هذا الملف الكامل وحدة `http` الخاصة بـ Node — دون إطار عمل ويب — وهو **عديم الحالة** (stateless): يحصل كل طلب على خادم MCP جديد، فتستطيع تشغيل عدة نسخ خلف موازن أحمال.

```ts
import { timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { createMcpServer } from '@sdk-ai-agents/core/mcp';

const token = process.env.MCP_TOKEN;
if (!token) throw new Error('Set MCP_TOKEN: clients must send "Authorization: Bearer <token>"');
const port = Number(process.env.PORT ?? 3000);
// Requests must name this host: protects a local server from DNS rebinding attacks.
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

const folder = { root: resolve(process.argv[2] ?? 'docs'), name: 'docs' };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });
// Built once, shared by the server of every request.
const tools = folderTools(folder);
const resources = folderResources(folder);

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error('MCP request failed:', error);
    if (!response.headersSent) reply(response, 500, 'Internal server error');
  });
}).listen(port, '127.0.0.1');

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/mcp') return reply(response, 404, 'Not found');
  if (!allowedHosts.has(request.headers.host ?? '')) return reply(response, 403, 'Forbidden host');
  if (!sameSecret(request.headers.authorization ?? '', `Bearer ${token}`)) return reply(response, 401, 'Unauthorized');
  if (request.method !== 'POST') return reply(response, 405, 'Method not allowed');

  // Stateless: a client's cancellation arrives as a new request, which this fresh server
  // cannot tie to a call still in progress. A pending approval then ends only when the
  // client closes the connection, or after `approvalTimeoutMs` — until then a late "yes"
  // still runs the tool. Keep it well below the time your clients wait.
  const server = createMcpServer(sdk, { name: 'docs', tools, resources, approvalTimeoutMs: 20_000 });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  await server.connect(transport);
  await transport.handleRequest(request, response);
}

function reply(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

/** Compares secrets in constant time, so timing does not reveal how much of a guess is right. */
function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

الغرض من كل فحص:

| الفحص | لماذا |
| --- | --- |
| المسار `/mcp` | عنوان واحد لـ MCP؛ وكل ما عداه مرفوض. |
| ترويسة `Host` | لولاها لاستطاعت صفحة ويب تزورها أن تجعل متصفّحك يستدعي خادمًا على `localhost` («إعادة ربط DNS»، DNS rebinding). عند النشر، اسرد اسم مضيفك العام بدلًا من ذلك. |
| رمز Bearer | لا يدخل إلا العملاء الذين يعرفون الرمز. تتم المقارنة في زمن ثابت. ولّد رمزًا عشوائيًا طويلًا؛ وأبقِه خارج شيفرتك. |
| `POST` فقط | في الوضع عديم الحالة لا يوجد مسار بث طويل العمر يُفتَح بـ `GET`. |
| خادم لكل طلب | لا شيء يُتشارَك بين الطلبات؛ وتُبنى تعريفات الأدوات مرة واحدة ويُعاد استخدامها (إعادة تعريف التعريف نفسه مسموحة). الثمن: رسالة «الإلغاء» من العميل تصل طلبًا آخر ولا تستطيع بلوغ الاستدعاء الذي تلغيه — فيُنهيه بدلًا من ذلك إغلاق الاتصال، أو `approvalTimeoutMs`. |

يستمع الملف على `127.0.0.1` فقط. لنشره، ضعه خلف وكيل عكسي (reverse proxy) يُنهي **HTTPS** (Caddy، أو nginx، أو موازن الأحمال في سحابتك)، وأضف اسم مضيفك إلى `allowedHosts`. ولا ترسل أبدًا رمز Bearer عبر HTTP غير مشفّر على شبكة.

تُوزَّع نسخة قابلة للتشغيل باسم [`examples/mcp-http.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-http.ts) (`MCP_TOKEN=… npm run example:mcp-http`). وقد تم التحقّق منها بعميل حقيقي: الاستدعاء دون الرمز يحصل على `401`، و`Host` المزوَّر يحصل على `403`، والعميل الذي يملك الرمز يسرد الأدوات ويستدعيها.

### وصل العملاء بخادم HTTP {#connect-clients-to-an-http-server}

- **Claude Code**: `claude mcp add --transport http docs https://mcp.example.com/mcp --header "Authorization: Bearer <token>"`. وفي ملف `.mcp.json` مشترك، اكتب `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }`: فـ Claude Code يوسّع متغيّرات البيئة، فيبقى الرمز خارج الملف.
- **وكلاؤك**: `connectMcpServer({ name: 'docs', transport: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } })` — انظر [MCP بكلمات بسيطة](./mcp#use-the-tools-of-an-mcp-server-in-your-agents).
- **التطبيقات الأخرى**: ابحث عن «remote MCP server» أو «custom connector» في توثيقها. بعضها لا يقبل إلا الخوادم التي تستخدم تسجيل الدخول عبر OAuth بدل رمز ثابت.

## الحوكمة: السياسات والميزانيات والموافقات {#governance-policies-budgets-approvals}

يعمل كل استدعاء MCP تحت هوية واحدة، `mcp:<server name>` (غيّرها بـ `agentId`). ويمكن للسياسات والميزانيات والتنبيهات أن تستهدفها مثل أي وكيل. انظر [الوكلاء الخاضعون للحوكمة](./governed-agents) لكل أنواع السياسات.

**ميزانية يومية للاستدعاءات** لخادم واحد:

```ts
sdk.defineGlobalPolicy({
  id: 'handbook-daily-budget',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { agentId: 'mcp:handbook', period: 'day', maxToolCalls: 500 } },
    },
  ],
});
```

يُرفَض الاستدعاء رقم 501 في اليوم مع اسم السياسة، ويكون الرفض في سجل الأحداث. يُحتسَب الاستدعاء **حين يبدأ** — يُفحَص ويُحتسَب في خطوة واحدة، فلا يستطيع 20 استدعاءً متزامنًا أن تتسلّل كلها تحت حدّ قدره 2 — ويُحتسَب **أيًا كانت نتيجته**، بما في ذلك الإخفاقات. تُحتسَب الميزانيات في ذاكرة العملية: فتبدأ من الصفر مجددًا حين يُعاد تشغيل الخادم، وكل نسخة من خادم HTTP تحتسب استدعاءاتها الخاصة. وقبل أي سياسة أو ميزانية، تُفحَص المعاملات: فيُرفَض الاستدعاء غير الصالح دون أن يُحتسَب أو ينتظر أحدًا.

### الموافقات: إنسان يقول نعم أولًا {#approvals-a-human-says-yes-first}

تنتظر الأداة قرارًا بشريًا قبل تشغيلها حين:

- يحتوي تعريفها على `metadata: { requiresApproval: true }` — وهو الافتراضي لعمليات الكتابة في `openApiTools`؛
- أو تطلب ذلك سياسة، للأدوات التي تسمّيها، دون المساس بتعريفاتها:

```ts
sdk.defineGlobalPolicy({
  id: 'approve-crm-writes',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: {
        type: 'condition',
        conditions: [{ field: 'intention.toolName', operator: 'in', value: ['crm_createNote', 'crm_updateCustomer'] }],
      },
      action: 'require_approval',
    },
  ],
});
```

أثناء الانتظار، يظهر الاستدعاء في `sdk.getPendingApprovals()`. وتقرّر شيفرتك بـ `sdk.approveAction(id, who, reason)` أو `sdk.rejectAction(id, who, reason)`؛ ويُسجَّل كلاهما (`approval.requested`، و`approval.approved` أو `approval.rejected`). لا يستطيع خادم stdio أن يسأل في طرفيته الخاصة — فالمُدخَل القياسي يحمل البروتوكول — لذا يأتي القرار من قناة أخرى. مثلًا، نقطة نهاية إدارية صغيرة على هذا الجهاز، في العملية نفسها التي يعمل فيها الخادم.

**نقطة النهاية الإدارية تقرّر ما يعمل: احمِها كما تحمي نقطة نهاية MCP.** لولا ذلك لاستطاعت صفحة مفتوحة في متصفّحك الوصول إلى `localhost` (إعادة ربط DNS) والموافقة نيابةً عنك. لذلك فهي تستمع على `127.0.0.1` فقط، ولا تقبل إلا `Host` الخاص بها، وترفض أي طلب يحمل `Origin` (تضيفه المتصفّحات؛ ولا تضيفه السكربتات و`curl`)، وتتطلّب ترويسة سرية:

```ts
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const port = 4000;
const secret = process.env.ADMIN_SECRET ?? '';   // a long random value
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

createServer((request, response) => {
  const answer = (status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.headers.origin !== undefined) return answer(403, 'Forbidden origin');
  if (!allowedHosts.has(request.headers.host ?? '')) return answer(403, 'Forbidden host');
  const given = Buffer.from(String(request.headers['x-admin-secret'] ?? ''));
  const expected = Buffer.from(secret);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return answer(401, 'Unauthorized');
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/approvals') return answer(200, sdk.getPendingApprovals());
  const decision = /^\/approvals\/([^/]+)\/(approve|reject)$/.exec(url.pathname);
  if (request.method !== 'POST' || !decision) return answer(404, 'Not found');
  const [, id = '', verb] = decision;
  try {
    if (verb === 'approve') sdk.approveAction(id, 'admin', 'approved from the admin endpoint');
    else sdk.rejectAction(id, 'admin', 'rejected from the admin endpoint');
    return answer(200, { decided: id, verb });
  } catch (error) {
    return answer(409, error instanceof Error ? error.message : String(error)); // unknown, decided or cancelled
  }
}).listen(port, '127.0.0.1');
```

بعد ذلك يسرد `curl -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals` ما ينتظر، ويقرّر `curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals/<id>/approve`. ويُوزَّع خادم كامل مبني بهذه الطريقة باسم [`examples/mcp-approvals.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-approvals.ts)؛ وقد تم التحقّق منه من البداية إلى النهاية (استدعاء ينتظر، و`Host` المزوَّر أو `Origin` أو السر الناقص يحصل على `403`/`401`، والموافقة تشغّل الأداة، وتنتهي العملية حين يغادر العميل).

لتُبلَّغ حين تكون موافقة بانتظارك، أضف [قاعدة حوادث](./incidents#rules) على `approval.requested` مع مُبلِّغ Slack أو بريد إلكتروني. تعيش الموافقات المعلّقة في ذاكرة العملية التي ينتظر فيها الاستدعاء: مع عدة نسخ من خادم HTTP، قرّر عبر النسخة التي تحتفظ بها (أو شغّل نسخة واحدة للأدوات التي تحتاج إلى موافقة).

::: warning كم تدوم الموافقة المعلّقة
تلغي عملاء كثيرة الاستدعاء بعد نحو دقيقة. تُلغى الموافقة المعلّقة — ولا تعمل الأداة أبدًا — حين:

- يلغي العميل الاستدعاء (stdio، أو جلسة HTTP ذات حالة)؛
- يُغلَق الاتصال: عميل stdio يخرج، أو طلب HTTP يُغلَق؛
- لا يقرّر أحد خلال `approvalTimeoutMs` — **50 ثانية افتراضيًا**، وهي أقل مما تنتظره معظم العملاء. عيّنها على `createMcpServer`/`serveMcpOverStdio` إذا كان عميلك ينتظر مدة أطول (Claude Code مع `MCP_TOOL_TIMEOUT` مرفوعة).

**على خادم HTTP عديم الحالة، لا ينطبق إلا الأخيران**: فهو لا يستطيع ربط طلب «إلغاء» بالاستدعاء الذي يلغيه. والعميل الذي يتخلّى دون إغلاق اتصاله يترك الموافقة معلّقة إلى أن تنقضي `approvalTimeoutMs` — و«نعم» المعطاة في تلك الفترة تظل تشغّل الأداة، مع أن أحدًا لا ينتظر الإجابة. أبقِ `approvalTimeoutMs` أقل بكثير من الوقت الذي تنتظره عملاؤك (يستخدم المثال 20 ثانية)، أو قدّم الأدوات التي تحتاج إلى موافقة عبر stdio أو جلسة ذات حالة.

بعد الإلغاء، تفشل «نعم» المتأخرة بالرسالة «already rejected»، ويُفحَص الاستدعاء مرة أخرى بعد الموافقة: إذا غادر العميل في الأثناء، لا تعمل الأداة. الموافقات عبر MCP تناسب القرارات السريعة. أما للقرارات التي تستغرق ساعات، فاجعل الأداة *تقدّم طلبًا* يعالجه فريقك لاحقًا.
:::

تسأل معظم تطبيقات MCP المستخدمَ أيضًا قبل كل استدعاء أداة (يفعل Claude Desktop ذلك افتراضيًا). يحدث ذلك التأكيد في التطبيق؛ أما موافقات حزمة SDK فتحدث على خادمك، وفق قواعدك، وتُسجَّل. استخدم الاثنين لكل ما يغيّر البيانات.

## إشعارات التقدّم {#progress-notifications}

يستطيع العميل أن يطلب إطلاعه على سير الاستدعاء: فيرسل `progressToken` مع الاستدعاء (تفعل ذلك حزمة TypeScript SDK الرسمية حين تمرّر `onprogress`). فيرسل الخادم عندئذٍ `notifications/progress` لكل حدث من أحداث الاستدعاء، ومن أحداث تشغيل الوكيل الذي تبدؤه `cognitiveAgentTool` أو `governedAgentTool`، مع `progress` يزيد بواحد في كل مرة و`message` قصيرة:

```text
call started
tool ask_support called
agent started
step 1: model chose lookup_customer
step 1: tool lookup_customer called
step 1: tool lookup_customer done
step 2: model answered
agent completed
call completed
```

تسمّي الرسائل الخطوات، والأدوات، والعمليات المعرفية: الأداة التي اختارها النموذج، وكل أداة يستدعيها الوكيل، بما في ذلك أدوات الوكيل التي لا يعرضها الخادم. والأداة التي تشغّل [دراسة](./studies) مع `onEvent` الخاص بسياقها تُوصَف بالمراحل (`study started`، `passage changes started`، `search in changes`)، لا بالاستعلامات أبدًا. ولا تحمل الرسائل أبدًا معاملات أو نتائج أو نصوص أخطاء. لا يوجد `total`: فلا أحد يعرف مسبقًا كم خطوة سيستغرقها التشغيل. يُرسَل كل إشعار قبل النتيجة، ولا يُرسَل بعدها أبدًا. وعبر Streamable HTTP تنتقل الإشعارات على بث الاستجابة (SSE)؛ أما وسيلة النقل المُنشأة بـ `enableJsonResponse: true` فتجيب بـ JSON عادي وتُسقطها. والعميل الذي لا يرسل `progressToken` لا يتلقّى أيًّا منها.

لا يُتابَع إلا تشغيل الوكيل الذي تبدؤه أداة، على مستوى واحد فقط: فلا تُتابَع عمليات التشغيل التي يبدؤها ذلك الوكيل بدوره عبر أدوات وكيل خاصة به، ولا الوكيل المبني يدويًا على مخزن دون أحداث مباشرة. ولا يُدمَج شيء: كل حدث إشعار، وقد يرسل تشغيل معرفي طويل المئات منها.

ما تغيّره إشعارات التقدّم، وما لا تغيّره:

- **لا تنتظر مدة أطول إلا العملاء التي تعيد ضبط مهلتها عند إشعارات التقدّم.** مع حزمة TypeScript SDK: `client.callTool(params, undefined, { onprogress, resetTimeoutOnProgress: true, maxTotalTimeout })`. أما العميل الذي يعرض التقدّم لكنه يحتفظ بمهلة ثابتة فيتخلّى في اللحظة نفسها كما من قبل. تحقّق مما يفعله تطبيقك قبل أن تعتمد على ذلك.
- **مع عميل كهذا، ما يهمّ هو أطول فترة صمت**، لا مدة الاستدعاء: استدعاء واحد للنموذج، أو أداة بطيئة واحدة، أو موافقة. لا يُرسَل شيء أثناء عمل أداة أو أثناء انتظار موافقة، لذا تظل مهلة `approvalTimeoutMs` البالغة 50 ثانية سارية، ويجب أن يتّسع كل استدعاء منفرد للنموذج أو لأداة ضمن مهلة العميل.
- **يستطيع الوكلاء عندئذٍ أن يستغرقوا وقتًا أطول**: يمكن أن تتجاوز `limits.timeoutMs` لوكيل معرفي مهلةَ العميل، لأن كل خطوة ترسل إشعارات. أما للعملاء الأخرى، فأبقِ الحدود الصغيرة في [وصفة الوكيل](./mcp-recipes#an-agent-your-reasoning-twin).

## قائمة التحقّق الأمنية {#security-checklist}

قبل أن تشارك خادمًا:

- [ ] **اعرض الحدّ الأدنى.** لا تسرد في `tools` إلا الأدوات اللازمة؛ وفضّل المصادر التي للقراءة فقط؛ وأضف عمليات الكتابة واحدة واحدة.
- [ ] **الكتابة تحتاج إلى إنسان.** أبقِ `requiresApproval` على أدوات الكتابة ما لم يكن لديك سبب، وسجّل ذلك السبب.
- [ ] **أقل الصلاحيات في الطبقة التحتية.** رموز API بنطاقات للقراءة فقط، ودور قاعدة بيانات لا يملك إلا SELECT، ومجلد لا يحتوي إلا على ما يجوز مشاركته. فحوص الخادم قفل ثانٍ، لا القفل الأول.
- [ ] **الأسرار خارج الشيفرة.** تأتي الرموز من متغيّرات البيئة (`claude mcp add … -e TOKEN=…`)، ولا تأتي أبدًا من المواصفة أو الوصف أو الملف.
- [ ] **النتائج نص غير موثوق.** ما تعيده واجهة API أو مستند أو قاعدة بيانات يصل إلى النموذج حرفيًا — فقد تحتوي صفحة على «تجاهل تعليماتك و…». لا تعطِ المحادثة نفسها مصادر غير موثوقة وأدوات كتابة قوية معًا دون موافقة.
- [ ] **خوادم HTTP**: HTTPS، ورمز عشوائي طويل، وقائمة سماح لـ `Host`، والاستماع على `127.0.0.1` خلف الوكيل.
- [ ] **تفاصيل الأخطاء تبقى في الداخل** (`exposeErrorDetails` معطّلة، وهو الافتراضي). ويظل رفض المُدخَل (معامل خاطئ، مسار خارج المجلد، SQL ليس استعلامًا) مشروحًا للعميل.
- [ ] **الميزانيات** على كل ما يكلّف مالًا: الوكلاء (استدعاءات النموذج) وواجهات API المدفوعة.
- [ ] **اقرأ سجل الأحداث** بعد الأيام الأولى: أي الأدوات تُستدعى، وأي الاستدعاءات تُرفَض.

يحتفظ مشروع MCP بدليل مفصّل للهجمات والدفاعات: [Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices).

## استكشاف الأعطال وإصلاحها {#troubleshooting}

| العَرَض | السبب المحتمل | الإصلاح |
| --- | --- | --- |
| ينقطع اتصال العميل فورًا، أو يقول إن الخادم أرسل JSON غير صالح | شيء ما يكتب إلى **المُخرَج القياسي**: `console.log` في شيفرتك أو في مكتبة | استخدم `console.error` (الخطأ القياسي). فـ stdout يحمل البروتوكول. |
| يطبع `npx tsx server.ts` سطرًا واحدًا ويبدو متوقّفًا | أمر طبيعي: خادم stdio ينتظر عميلًا | اختبره بـ [Inspector](./mcp-first-server#_4-test-it-with-the-mcp-inspector)، أو وصّل تطبيقًا. |
| لا يظهر الخادم في Claude Desktop | خطأ JSON في الإعداد، أو مسار نسبي، أو لم يُعَد تشغيل التطبيق | تحقّق من JSON، واستخدم مسارات مطلقة، وأغلق التطبيق وأعد تشغيله، واقرأ `mcp*.log` ([أين](./mcp-first-server#_5-connect-it-to-claude-desktop)). |
| `npx: command not found` / `node: not found` في السجلات | لا يرى التطبيق `PATH` الخاص بصدفتك (شائع مع nvm) | استخدم المسار الكامل لـ `npx` (`which npx` / `where npx`). |
| أداة غائبة عن القائمة | ليست في `tools` | أضف اسمها أو تعريفها إلى `tools`: فلا شيء يُعرَض بخلاف ذلك. |
| `Another tool named "x" is already defined` عند بدء التشغيل | مصدران ينتجان اسم الأداة نفسه | أعطِ كل مصدر `prefix`. |
| `Tool execution failed: <name>` ولا شيء أكثر | قد يحتوي السبب على تفاصيل داخلية، لذا فهو مخفي | اقرأ التشغيل في سجل الأحداث، أو عيّن `exposeErrorDetails: true` أثناء التطوير. |
| تنتهي مهلة الاستدعاءات | الأداة بطيئة (غالبًا وكيل) | `limits` أصغر للوكيل؛ وارفع مهلة العميل (Claude Code: `MCP_TOOL_TIMEOUT`)؛ أو استخدم عميلًا يعيد ضبط مهلته عند [إشعارات التقدّم](#progress-notifications). |
| النتائج مقطوعة | حدود الحجم (`truncated: true`) أو حدّ العميل الخاص | ارفع `maxResponseBytes`، و`maxRows`، و`maxFileBytes`؛ وفي Claude Code: `MAX_MCP_OUTPUT_TOKENS`. |
| أداة كتابة تجيب «Approval no decision within 50000 ms» | لم يوافق عليها أحد في الوقت المحدّد | وافق عليها أسرع (انظر [الموافقات](#approvals-a-human-says-yes-first))، أو ارفع `approvalTimeoutMs`، أو عيّن `requiresApproval: false` عن قصد. |
| تظهر مجلدات مثل `events/` أو `golden-traces/` في أماكن غير متوقّعة | لا مسار مطلق لسجل الأحداث (أو إصدار أقدم من حزمة SDK) | مرّر `eventStore: new FileEventStore(<absolute path>)`. والإصدارات الحالية لا تنشئ مجلداتها الأخرى إلا عند استخدامها. |
| `Cannot find module 'node:sqlite'` | Node.js أقدم من 22.13 | حدّث Node.js، أو استخدم `better-sqlite3`. |
| `… is not JSON. For a YAML spec, parse it yourself` | مواصفة OpenAPI بصيغة YAML | حلّلها (الحزمة `yaml`) ومرّر الكائن بوصفه `spec`. |
| `cannot resolve the server URL "/v3"` | للمواصفة خادم نسبي وقد حُمِّلت من ملف | مرّر `baseUrl`. |
| يرفض Inspector البدء | يطلب [توثيقه](https://modelcontextprotocol.io/docs/tools/inspector) Node.js 22.19+ (تم التحقّق في 2026-09-24) | حدّث Node.js لتشغيل Inspector (يمكن لخادمك البقاء على 20+). |
| عميل لا يتحدّث إلا بروتوكول 2026-07-28 لا يستطيع الاتصال | يقبل الخادم المراجعات من 2024-10-07 إلى 2025-11-25 (MCP TypeScript SDK 1.30) | استخدم عميلًا يدعم المراجعات الأقدم. يتفاوض Inspector على «الحقبتين» كلتيهما، القديمة و2026-07-28، وفقًا لـ [توثيقه](https://modelcontextprotocol.io/docs/tools/inspector) (تم التحقّق في 2026-09-24). |
| مع تفعيل تنبيهات الحوادث، يصبح كل استدعاء MCP مرفوض تنبيهًا | استدعاء MCP الفاشل تشغيل فاشل | صفِّ بـ `when: (event) => event.metadata?.agentId !== 'mcp:docs'`، أو اخفض درجة خطورته. |

### قراءة ما حدث {#reading-what-happened}

كل استدعاء وكل قراءة لمورد تشغيل. مع مخزن الملفات الافتراضي، يكون كل تشغيل ملف JSON واحدًا في مجلد `events/` لديك؛ ومن الشيفرة:

```ts
const store = new FileEventStore('/absolute/path/events');
for (const runId of await store.getRunIds()) {
  const events = await store.getEvents(runId);
  const first = events[0];
  if (first?.metadata?.agentId === 'mcp:docs') {
    console.log(runId, events.map((event) => event.type).join(' → '));
  }
}
```

يُقرَأ استدعاء الأداة هكذا: `run.started → action.executing → policy.checked → tool.called → action.executed → run.completed`؛ وقراءة المورد: `run.started → resource.read → run.completed`، حيث يحتوي `resource.read` على معرّف URI، والحجم، وبصمة SHA-256 لما قُدِّم. انظر [فهرس الأحداث](../reference/events).
