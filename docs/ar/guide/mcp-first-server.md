# أول خادم MCP لك في 5 دقائق

سنبني خادم MCP صغيرًا يجيب عن سؤال «من المسؤول عن الفوترة؟» انطلاقًا من قائمة بأعضاء الفريق، ونختبره دون أي ذكاء اصطناعي، ثم نوصله بـ Claude Desktop وClaude Code. كل أمر مذكور؛ ولا شيء مفترَض مسبقًا. إذا كانت كلمة ما غير واضحة، فانظر [MCP بكلمات بسيطة](./mcp).

## ما تحتاج إليه {#what-you-need}

- **Node.js 20.11 أو أحدث** — تحقّق بالأمر `node --version`. (تحتاج وصفة SQLite إلى 22.13+. ويطلب توثيق MCP Inspector الإصدار 22.19+.)
- طرفية (terminal).
- لاستخدام الخادم من تطبيق ذكاء اصطناعي: [Claude Desktop](https://claude.ai/download) أو [Claude Code](https://code.claude.com/docs). ليس ضروريًا للخطوات الأولى.

لا حاجة إلى أي مفتاح API: فهذا الخادم لا يستدعي نموذجًا لغويًا. وتطبيق الذكاء الاصطناعي الذي يستخدمه لديه نموذجه الخاص.

## 1. إنشاء المشروع {#_1-create-the-project}

```sh
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm pkg set type=module
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28 @modelcontextprotocol/sdk@^1.30.0
npm install --save-dev tsx
```

ما يفعله كل سطر:

| الأمر | لماذا |
| --- | --- |
| `npm init -y` | ينشئ `package.json`، الملف الذي يسرد تبعيات مشروعك. |
| `npm pkg set type=module` | يستخدم وحدات JavaScript الحديثة (`import`). وحزمة SDK تتطلّب ذلك. |
| `npm install github:nicolashedoire/sdk-ai-agents …` | يثبّت حزمة SDK هذه (غير منشورة على npm بعد، لذا من GitHub؛ وهي تبني نفسها)، وzod (لوصف المعاملات)، وحزمة MCP SDK الرسمية، الإصدار 1.30 أو أحدث ضمن 1.x (الإصدار الذي اختُبرت عليه حزمة SDK هذه). |
| `npm install --save-dev tsx` | يشغّل ملفات TypeScript مباشرةً، دون خطوة بناء. |

## 2. كتابة الخادم {#_2-write-the-server}

أنشئ ملفًا باسم `server.ts`:

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';
import { z } from 'zod';

// 1. The data your tool reads. A real server would call an API or a database here.
const team = [
  { name: 'Ada', role: 'Billing', email: 'ada@example.com' },
  { name: 'Linus', role: 'Infrastructure', email: 'linus@example.com' },
  { name: 'Grace', role: 'Customer support', email: 'grace@example.com' },
];

// 2. The SDK. No model key: this server does not call a language model itself.
//    The event log (one file per call) is written next to this file, in events/.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

// 3. One tool: a name, a description the model reads, its arguments, and the code.
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team (billing, infrastructure, support…)',
  schema: z.object({
    topic: z.string().describe('What the person is in charge of, for example "billing"'),
  }),
  metadata: { readOnly: true },
  handler: async ({ topic }) =>
    team.filter((person) => person.role.toLowerCase().includes(topic.toLowerCase())),
});

// 4. Serve it. Only the tools listed here are visible to AI applications.
await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

اقرأه من الأعلى إلى الأسفل:

1. **البيانات** — هنا قائمة في الملف؛ وفي الواقع، واجهة API أو ملفات أو قاعدة بيانات لديك.
2. **حزمة SDK** — تمرّر كل استدعاء عبر مسار المعالجة الخاضع للحوكمة وتكتبه في سجل الأحداث. يُكتَب السجل بجوار الملف (`import.meta.dirname`) لأن تطبيقات الذكاء الاصطناعي تشغّل الخوادم من مجلد عمل لا تختاره أنت.
3. **الأداة** — **الاسم** و**الوصف** هما ما يقرؤه النموذج ليقرّر متى يستدعيها، فاكتبهما لقارئ لا يعرف شيئًا عن شيفرتك. ويسرد **المخطط** المعاملات؛ فتحوّله حزمة SDK إلى JSON Schema التي تراها عملاء MCP، وترفض الاستدعاءات التي لا تطابقه. وتخبر `readOnly: true` العملاء أن الأداة لا تغيّر شيئًا.
4. **الخادم** — يتحدّث `serveMcpOverStdio` بروتوكول MCP عبر المُدخَل والمُخرَج القياسيين. قائمة `tools` مطلوبة: فالأداة التي لم تسردها لا تكون مرئية أبدًا، حتى لو كانت معرَّفة.

## 3. تشغيله {#_3-run-it}

```sh
npx tsx server.ts
```

يجب أن ترى هذا، ولا شيء غيره:

```text
MCP server "team" ready on stdio, waiting for a client
```

**يبدو متوقّفًا — وهذا طبيعي.** ينتظر خادم stdio أن يتحدّث إليه تطبيق ذكاء اصطناعي عبر مُدخَله. اضغط <kbd>Ctrl</kbd>+<kbd>C</kbd> لإيقافه. نادرًا ما ستشغّله بنفسك: فتطبيق الذكاء الاصطناعي هو من يفعل ذلك.

::: danger لا تطبع أبدًا إلى stdout
في خادم stdio، المُخرَج القياسي **هو** البروتوكول. استدعاء `console.log` في شيفرتك يُفسد الرسائل فينقطع اتصال العميل. استخدم `console.error` لرسائلك الخاصة: فهي تذهب إلى الخطأ القياسي، الذي تحتفظ به العملاء في سجلاتها.
:::

## 4. اختباره بـ MCP Inspector {#_4-test-it-with-the-mcp-inspector}

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) هو أداة الاختبار الرسمية: صفحة ويب (أو سطر أوامر) تعمل عميلًا لـ MCP، فتستطيع تجربة خادمك دون أي ذكاء اصطناعي. يطلب توثيقه Node.js 22.19 أو أحدث (تم التحقّق في 2026-09-24).

```sh
npx @modelcontextprotocol/inspector npx tsx server.ts
```

يطبع الأمر عنوانًا مع رمز يُستخدَم مرة واحدة؛ افتحه في متصفّحك، وانقر **Connect**، وافتح **Tools**، وانقر **List Tools**، واختر `find_colleague`، واكتب `billing` وشغّله. ستحصل على Ada.

هل تفضّل الطرفية؟ الفحوص نفسها من سطر الأوامر:

```sh
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name find_colleague --tool-arg topic=billing
```

كل ما يأتي بعد `inspector` (أو بعد `--cli`) هو الأمر الذي يشغّل خادمك.

## 5. وصله بـ Claude Desktop {#_5-connect-it-to-claude-desktop}

يقرأ Claude Desktop الخوادم التي يجب تشغيلها من ملف إعداد. افتحه من التطبيق: **Claude menu → Settings… → Developer → Edit Config**. والملف هو:

| النظام | المسار |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

أضف خادمك تحت `mcpServers`، مع **المسار المطلق** لـ `server.ts` (شغّل `pwd` في مجلد المشروع للحصول عليه؛ وعلى Windows، `cd`):

::: code-group

```json [macOS]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/you/my-mcp-server/server.ts"]
    }
  }
}
```

```json [Windows]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\you\\my-mcp-server\\server.ts"]
    }
  }
}
```

:::

ثم **أغلق Claude Desktop تمامًا وشغّله من جديد**: فهو لا يقرأ الملف إلا عند بدء التشغيل. يظهر خادمك في قائمة الموصِّلات (زر «+» في مربع الرسالة، ثم **Connectors**). اسأل: *«من المسؤول عن الفوترة في فريقي؟»* — يطلب Claude إذنك لاستخدام `find_colleague`، ثم يجيب «Ada».

إذا لم يظهر:

- تحقّق من ملف JSON (فاصلة ناقصة تكفي لإفساده) ومن أن المسار مطلق؛
- إذا قال السجل إنه لا يمكن العثور على `npx` أو `node` (وهذا شائع حين يكون Node.js مثبّتًا بـ nvm)، فاستبدل `"npx"` بالمسار الكامل الذي يعطيه `which npx` (على macOS) أو `where npx` (على Windows)؛
- اقرأ السجلات: `~/Library/Logs/Claude/mcp*.log` على macOS، و`%APPDATA%\Claude\logs\mcp*.log` على Windows. يحتوي `mcp-server-team.log` على ما كتبه خادمك إلى الخطأ القياسي.

تأتي هذه المسارات والقوائم من توثيق MCP ([الاتصال بخوادم MCP المحلية](https://modelcontextprotocol.io/docs/develop/connect-local-servers)) كما كان في سبتمبر 2026؛ راجع تلك الصفحة إذا تغيّر Claude Desktop.

## 6. وصله بـ Claude Code {#_6-connect-it-to-claude-code}

أمر واحد، من أي مجلد (استبدل المسار):

```sh
claude mcp add team -- npx -y tsx /Users/you/my-mcp-server/server.ts
```

- كل ما يأتي بعد `--` هو الأمر الذي يشغّل خادمك.
- يُضاف الخادم للمشروع الحالي فقط (`--scope local`، القيمة الافتراضية). استخدم `--scope user` لكل مشاريعك، أو `--scope project` لكتابته في ملف `.mcp.json` يمكنك إيداعه في المستودع ومشاركته.
- متغيّرات البيئة (مثل رمز API يحتاجه خادمك): `claude mcp add team -e API_TOKEN=… -- npx -y tsx /path/server.ts`.
- تحقّق منه بـ `claude mcp list`، أو اكتب `/mcp` داخل Claude Code.

تم التحقّق في 2026-09-24 بالأمر `claude mcp add --help` (Claude Code 2.1.173) وبـ [توثيق MCP في Claude Code](https://code.claude.com/docs/en/mcp).

## 7. تطبيقات أخرى {#_7-other-applications}

تطلب معظم تطبيقات MCP الأشياء الثلاثة نفسها: **أمرًا** (`npx`)، و**معاملاته** (`-y`، و`tsx`، والمسار المطلق لـ `server.ts`)، و**متغيّرات بيئة** اختيارية. انظر توثيقها، مثلًا [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) أو [Cursor](https://cursor.com/docs/context/mcp).

## 8. انظر إلى ما حدث {#_8-see-what-happened}

يُكتَب كل استدعاء في سجل الأحداث: افتح مجلد `events/` بجوار `server.ts`. كل ملف استدعاء واحد — **تشغيل** واحد للهوية `mcp:team` — مع خطواته:

```text
run.started       → the call arrived
action.executing  → the call is being handled
policy.checked    → the rules were checked
tool.called       → the tool ran, with its arguments
action.executed   → its result
run.completed
```

يمكن قراءة عمليات التشغيل نفسها، وإعادة تشغيلها، وحساب تكلفتها، وتحويلها إلى تنبيهات ببقية حزمة SDK: انظر [التتبّع وإعادة التشغيل](./observability).

## إلى أين بعد ذلك {#where-to-go-next}

- استبدل قائمة الفريق بشيء حقيقي: [واجهة API على الويب، أو مجلد، أو قاعدة بيانات، أو وكيل — سطر واحد لكل منها](./mcp-recipes).
- شارك الخادم مع فريقك عبر HTTP، وأضف الموافقات والميزانيات: [النشر والتأمين واستكشاف الأعطال](./mcp-deploy).
