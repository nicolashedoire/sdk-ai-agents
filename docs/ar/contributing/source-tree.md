# شجرة الشيفرة المصدرية

## نظرة عامة {#overview}

حزمة SDK منظّمة في بنية نمطية واضحة مع فصل للمسؤوليات. توجد الشيفرة المصدرية الرئيسية في `src/` مع مجلدات فرعية لكل مجال وظيفي.

## بنية المجلدات الكاملة {#complete-directory-structure}

```
sdk-ai-agents/
├── src/
│   ├── sdk.ts                  # createSDK and the SDK facade
│   ├── agent.ts                # Governed agent (run loop)
│   ├── index.ts                # Public exports
│   ├── mcp.ts                  # Entry point of @sdk-ai-agents/core/mcp
│   ├── cognition/              # Cognitive agents: mental state, operations, controllers, profiles
│   ├── decisions/              # Typed decisions (Jev client, DecisionService)
│   ├── engines/                # Reasoning, action, policy and replay engines
│   ├── stores/                 # Event stores (file, SQLite, PostgreSQL)
│   ├── providers/              # LLM providers (OpenAI, Anthropic, fallback)
│   ├── managers/               # Approvals, budgets, golden traces, regressions
│   ├── registry/               # Tool and capability registries
│   ├── costs/                  # Pricing tables and run costs
│   ├── resilience/             # Retry policy and retrying provider
│   ├── incidents/              # Incident detection and notifiers
│   ├── mcp/                    # MCP server (tools and resources) and client
│   ├── tools/                  # Tool sources: OpenAPI, folder, read-only database, agents
│   ├── evaluators/             # Policy condition evaluation
│   ├── errors/                 # Error classes
│   ├── types/                  # Shared type definitions
│   ├── utils/                  # Helpers (ids, HTTP, trace analysis)
│   └── __tests__/              # Vitest suites and their in-memory test doubles (support/)
├── benchmarks/                 # Performance tests
├── docs/                       # This documentation (VitePress)
├── examples/                   # Runnable examples
├── templates/starter-template/ # Starter project using the SDK
└── .github/workflows/          # CI and documentation deployment
```

## المجلدات الحرجة {#critical-directories}

### `src/engines/` {#src-engines}

**الغرض:** يحتوي على المحرّكات الرئيسية لحزمة SDK التي تنسّق دورة حياة الوكيل.

**يحتوي على:**
- `reasoning-engine.ts`: يولّد النوايا من النموذج اللغوي (دون آثار جانبية)
- `action-engine.ts`: ينفّذ النوايا بعد أن يتحقّق منها محرّك السياسات
- `policy-engine.ts`: يتحقّق من النوايا مقابل السياسات المُعدّة
- `replay-engine.ts`: يعيد تشغيل عمليات التنفيذ انطلاقًا من الأحداث المحفوظة

**نقاط الدخول:** يستخدمها `AgentImpl` و`SDKImpl`

**التكامل:** تُحقَن المحرّكات في `AgentImpl` و`SDKImpl` عبر المُنشئ (constructor)

### `src/stores/` {#src-stores}

**الغرض:** تنفيذات الواجهة `IEventStore` لحفظ الأحداث.

**يحتوي على:**
- `event-store.ts`: الواجهة المشتركة `IEventStore`
- `file-event-store.ts`: تنفيذ قائم على الملفات (MVP)
- `sql-event-store.ts`: تنفيذ SQL عام
- `sqlite-event-store.ts`: تنفيذ لـ SQLite
- `postgresql-event-store.ts`: تنفيذ لـ PostgreSQL مع JSONB
- `observed-event-store.ts`: يسلّم كل حدث مُضاف إلى المستمعين مباشرةً (`onEvent`، `sdk.subscribe`)

**نقاط الدخول:** يستخدمها `SDKImpl` و`ReplayEngine`

**التكامل:** يُحقَن في `SDKImpl` عبر الإعدادات

### `src/providers/` {#src-providers}

**الغرض:** تنفيذات الواجهة `LLMProvider` لمختلف مزوّدي النماذج اللغوية.

**يحتوي على:**
- `llm-provider.ts`: الواجهة المشتركة `LLMProvider`
- `openai-provider.ts`: تنفيذ OpenAI
- `anthropic-provider.ts`: تنفيذ Anthropic
- `fallback-provider.ts`: مزوّد مع تحويل تلقائي إلى البديل
- `provider-factory.ts`: مصنع لإنشاء المزوّدين

**نقاط الدخول:** يستخدمها `ReasoningEngine`

**التكامل:** يُحقَن في `ReasoningEngine` عبر المُنشئ

### `src/managers/` {#src-managers}

**الغرض:** أصناف إدارة للميزات المتقدّمة (الموافقات، والميزانيات، والاختبارات، وغيرها).

**يحتوي على:**
- `approval-manager.ts`: إدارة الموافقات البشرية
- `budget-tracker.ts`: تتبّع الميزانية والاستهلاك
- `golden-trace-manager.ts`: إدارة الآثار المرجعية
- `regression-test-manager.ts`: إدارة مجموعات اختبار التراجعات
- `assertion-manager.ts`: إدارة التوكيدات السلوكية
- `impact-analysis-manager.ts`: إدارة تحليل التأثير

**نقاط الدخول:** يستخدمها `SDKImpl` و`PolicyEngine`

**التكامل:** تُحقَن في `SDKImpl` و`PolicyEngine` عبر المُنشئ

### `src/registry/` {#src-registry}

**الغرض:** سجلات لإدارة الأدوات والقدرات المتاحة.

**يحتوي على:**
- `tool-registry.ts`: إدارة الأدوات المتاحة (الرفض افتراضيًا)
- `capability-registry.ts`: إدارة القدرات (مجموعات الأدوات)

**نقاط الدخول:** يستخدمها `SDKImpl` و`ActionEngine`

**التكامل:** تُحقَن في `SDKImpl` و`ActionEngine` عبر المُنشئ

### `src/types/` {#src-types}

**الغرض:** تعريفات TypeScript لجميع أنواع حزمة SDK.

**يحتوي على:**
- أنواع Agent، وTool، وPolicy، وEvent، وRun، وSDK
- أنواع الميزات المتقدّمة (الرسم البياني للاستدلال، والبدائل، وغيرها)
- أنواع الاختبار (الأثر المرجعي، والتراجع، والتوكيد، وغيرها)

**نقاط الدخول:** تستوردها جميع الوحدات

**التكامل:** تُستخدَم في كامل قاعدة الشيفرة من أجل أمان الأنواع

### `src/utils/` {#src-utils}

**الغرض:** دوال مساعدة وأدوات عامة.

**يحتوي على:**
- `constants.ts`: الثوابت العامة
- `id.ts`: توليد المعرّفات الفريدة
- `zod-to-json-schema.ts`: تحويل Zod → JSON Schema
- أدوات مساعدة للرسم البياني للاستدلال، والبدائل، والأنماط، وغيرها
- أدوات مساعدة للاختبار (التحقّق، والتراجع، والتوكيد، وغيرها)

**نقاط الدخول:** تستوردها الوحدات التي تحتاج إليها

**التكامل:** تستخدمها المحرّكات، والمديرون، والوحدات الأخرى

### `src/cognition/` (v0.2) {#src-cognition-v0-2}

**الغرض:** الوكلاء المعرفيون — الحالة الذهنية الصريحة، والعمليات المعرفية، والمتحكّمات، وملفات المفكّرين.

**يحتوي على:** `cognitive-agent.ts` (حلقة التشغيل)، و`operation-selector.ts`، و`operation-performer.ts`، و`cognitive-controller.ts` (القاعدة الإرشادية)، و`typed-decision-controller.ts` (Jev)، و`hypothesis-assessor.ts`، و`information-seeker.ts`، و`llm-thought-generator.ts` و`thought-prompts.ts`، و`mental-state.ts` (المخططات والأنواع)، و`mental-state-reducer.ts` و`hypothesis-transitions.ts`، و`mental-state-replay.ts`، و`thinker-profile.ts`، و`profile-distiller.ts`، و`create-cognitive-agent.ts`.

### `src/decisions/` (v0.2) {#src-decisions-v0-2}

**الغرض:** القرارات المُنمَّطة — عقد Noul/Choice/Score، وعميل HTTP لـ TypeSafe Jev، و`DecisionService` الذي يقف خلف `sdk.decisions`.

### `src/costs/`، `src/resilience/`، `src/incidents/` (v0.2) {#src-costs-src-resilience-src-incidents-v0-2}

**الغرض:** التسعير وتقارير التكلفة لكل تشغيل؛ وسياسة إعادة المحاولة ومزوّد النماذج اللغوية الذي يعيد المحاولة؛ وقواعد الحوادث، والمُبلِّغون (البريد الإلكتروني، وwebhook، وResend)، ومخزن الأحداث المراقَب.

### `src/mcp/` و`src/mcp.ts` (v0.2) {#src-mcp-and-src-mcp-ts-v0-2}

**الغرض:** خادم MCP يعرض أدوات وموارد خاضعة للحوكمة (`mcp-server.ts`، `mcp-resources.ts`، `governed-tool-host.ts`)، وعميل MCP يستورد الأدوات (`mcp-client.ts`). يُنشَر بوصفه نقطة الدخول `@sdk-ai-agents/core/mcp` حتى لا تعتمد النواة على `@modelcontextprotocol/sdk`.

### `src/tools/` {#src-tools}

**الغرض:** مصادر أدوات تبني تعريفات `ToolDefinition` من نظام ما، دون أي اعتماد على MCP: `openapi-spec.ts` / `openapi-call.ts` / `openapi-tools.ts` (واجهات API على الويب)، و`folder-access.ts` / `folder-tools.ts` / `glob-pattern.ts` (المجلدات والموارد)، و`sql-statement-guard.ts` / `database-tools.ts` / `sqlite-read-only.ts` / `postgres-read-only.ts` / `sql-values.ts` (قواعد البيانات التي للقراءة فقط)، و`agent-tools.ts` (الوكلاء بوصفهم أدوات)، إضافة إلى `tool-names.ts` و`bounded-text.ts`.

### `src/__tests__/support/` {#src-tests-support}

**الغرض:** بدائل اختبارية تنفّذ منافذ (ports) حزمة SDK (مزوّد نماذج لغوية مُبرمَج السيناريو، وعميل قرارات في الذاكرة، وخادم HTTP محلي، وعميل PostgreSQL مُسجِّل، ومُحمِّل `node:sqlite`) — دون محاكاة للوحدات (module mocks).

## نقاط الدخول {#entry-points}

### نقطة الدخول الرئيسية {#main-entry}

- **`src/index.ts`**: نقطة الدخول العامة لحزمة SDK، تصدّر جميع واجهات API العامة

### نقاط دخول التطبيق {#application-entry-points}

- **`src/sdk.ts`**: التنفيذ الرئيسي لحزمة SDK (`SDKImpl`)
- **`src/agent.ts`**: تنفيذ الوكيل (`AgentImpl`)

## أنماط تنظيم الملفات {#file-organization-patterns}

### اصطلاحات التسمية {#naming-conventions}

- **الملفات**: kebab-case للملفات (مثلًا `reasoning-engine.ts`)
- **الأصناف**: PascalCase (مثلًا `ReasoningEngine`)
- **الواجهات**: PascalCase مع البادئة `I` عند الحاجة (مثلًا `IEventStore`)
- **الأنواع**: PascalCase (مثلًا `EventType`، `RunStatus`)
- **الدوال**: camelCase (مثلًا `generateCompletion`)

### تنظيم الوحدات {#module-organization}

- **صنف/واجهة واحدة لكل ملف**: يحتوي كل ملف على صنف أو واجهة رئيسية واحدة
- **أنواع متجاورة**: الأنواع المرتبطة في الملف نفسه أو في `types/`
- **تصديرات مجمِّعة (barrel exports)**: `index.ts` لتصدير واجهات API العامة

## ملفات الإعدادات {#configuration-files}

- **`package.json`**: التبعيات وسكربتات npm
- **`tsconfig.json`**: إعدادات TypeScript (الوضع الصارم، ESM)
- **`biome.json`**: إعدادات Biome (التدقيق/التنسيق)
- **`vitest.config.ts`**: إعدادات Vitest (الاختبار)

## ملاحظات للتطوير {#notes-for-development}

### إضافة ميزات جديدة {#adding-new-features}

1. **محرّك جديد**: أنشئه في `src/engines/`، واحقنه في `SDKImpl` أو `AgentImpl`
2. **مخزن جديد**: نفّذ `IEventStore` في `src/stores/`
3. **مزوّد جديد**: نفّذ `LLMProvider` في `src/providers/`
4. **مدير جديد**: أنشئه في `src/managers/`، واحقنه في `SDKImpl`
5. **أنواع جديدة**: أضفها إلى `src/types/`، وصدّرها من `types/index.ts`

### الاختبار {#testing}

- اختبارات الوحدات في `src/__tests__/`
- ملف اختبار واحد لكل وحدة مصدرية
- استخدم Vitest للاختبارات

### البناء {#build}

- تترجم TypeScript المجلد `src/` → `dist/`
- تُولَّد خرائط المصدر لتصحيح الأخطاء
- تُولَّد تصريحات TypeScript (`.d.ts`)
