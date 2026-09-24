# دليل التطوير

## المتطلبات المسبقة {#prerequisites}

### مطلوبة {#required}

- **Node.js**: 20.0.0+ (LTS)
- **npm**: مضمَّن مع Node.js
- **TypeScript**: 5.3.2+ (مثبّت محليًا عبر npm)

### اختيارية {#optional}

- **PostgreSQL**: 8.11.0+ (لـ PostgreSQLEventStore، تبعية نظيرة)
- **Git**: للتحكّم في الإصدارات

## تهيئة البيئة {#environment-setup}

### 1. استنساخ المستودع {#_1-clone-repository}

```bash
git clone https://github.com/nicolashedoire/sdk-ai-agents.git
cd sdk-ai-agents
```

### 2. تثبيت التبعيات {#_2-install-dependencies}

```bash
npm install
```

### 3. إعداد متغيّرات البيئة {#_3-configure-environment-variables}

أنشئ ملف `.env` في الجذر (اختياري، من أجل الأمثلة):

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## التطوير المحلي {#local-development}

### البناء {#build}

ترجم شيفرة TypeScript:

```bash
npm run build
```

ستكون الشيفرة المترجمة في `dist/`.

### وضع المراقبة {#watch-mode}

الترجمة في وضع المراقبة (إعادة ترجمة تلقائية):

```bash
npm run dev
```

### تشغيل الأمثلة {#run-examples}

```bash
# Quick start example
npm run example:quick-start

# Complete example
npm run example:complete

# Test API
npm run test:api
```

## الاختبار {#testing}

### تشغيل كل الاختبارات {#run-all-tests}

```bash
npm test
```

### وضع المراقبة {#watch-mode-1}

```bash
npm run test:watch
```

### التغطية {#coverage}

```bash
npm run test:coverage
```

### تشغيل ملف اختبار محدّد {#run-specific-test-file}

```bash
npx vitest src/__tests__/agent.test.ts
```

### اختبارات PostgreSQL {#postgresql-tests}

تتحقّق مجموعة الاختبارات من شيفرة SQL التي يرسلها مخزن أحداث PostgreSQL عبر اتصال يسجّلها. لتشغيلها أيضًا على خادم حقيقي، أعطِ عنوان URL لقاعدة بيانات: يعمل الاختبار في مخطط (schema) خاص به ويحذفه في النهاية. لا يضبط التكامل المستمر (CI) هذا المتغير، لذا يظهر الاختبار هناك على أنه متخطّى.

```bash
SDK_TEST_POSTGRES_URL=postgres://postgres@localhost:5432/postgres npx vitest run src/__tests__/postgresql-live.test.ts
```

## جودة الشيفرة {#code-quality}

### التدقيق (Linting) {#linting}

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### التنسيق {#formatting}

```bash
# Format code
npm run format
```

### الفحص الكامل (التدقيق + التنسيق) {#full-check-lint-format}

```bash
# Check everything
npm run check

# Fix everything automatically
npm run check:fix
```

## مهام التطوير الشائعة {#common-development-tasks}

### إضافة أداة جديدة {#adding-a-new-tool}

1. عرّف الأداة بـ `sdk.defineTool()`:

```typescript
const myTool = sdk.defineTool({
  name: 'my-tool',
  description: 'Description of my tool',
  schema: z.object({
    // Zod schema
  }),
  handler: async (params) => {
    // Tool implementation
  }
});
```

2. أضف الأداة إلى وكيل:

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-5.4',
  tools: [myTool]
});
```

### إضافة سياسة جديدة {#adding-a-new-policy}

1. عرّف السياسة:

```typescript
const myPolicy: Policy = {
  id: 'my-policy',
  type: 'custom',
  rules: [{
    condition: 'toolName === "dangerous-tool"',
    action: 'require_approval'
  }],
  scope: 'global',
  enabled: true
};
```

2. طبّق السياسة:

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### إضافة مخزن أحداث جديد {#adding-a-new-event-store}

1. نفّذ `IEventStore`:

```typescript
export class MyEventStore implements IEventStore {
  async append(runId: string, event: Event): Promise<void> {
    // Implementation
  }
  
  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    // Implementation
  }
  
  // ... other methods
}
```

2. استخدمه في حزمة SDK:

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### إضافة مزوّد نماذج لغوية جديد {#adding-a-new-llm-provider}

1. نفّذ `LLMProvider`:

```typescript
export class MyProvider implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    // Implementation
  }
  
  supportsModel(model: string): boolean {
    // Implementation
  }
  
  getProviderName(): string {
    return 'my-provider';
  }
}
```

لبثّ النص تدريجيًا (تشغيل مع `onText`)، استدعِ `request.onTextDelta` مع كل جزء فور أن يكتبه نموذجك، وأعِد مع ذلك الاستجابة كاملةً. المزوّد الذي لا يستطيع البث التدريجي يتجاهله: فتمرّر حزمة SDK النص حينئذٍ دفعةً واحدة.

```typescript
async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
  let content = '';
  for await (const piece of myModel.stream(request.messages, { signal: request.abortSignal })) {
    content += piece;
    request.onTextDelta?.(piece);
  }
  return { content, model: 'my-model' };
}
```

2. أضفه إلى `ProviderFactory`:

```typescript
// In provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## عملية البناء {#build-process}

### ترجمة TypeScript {#typescript-compilation}

يستخدم البناء مترجم TypeScript مباشرةً:

```bash
tsc
```

الإعدادات في `tsconfig.json`:
- **الهدف (Target)**: ES2022
- **الوحدات (Module)**: ESNext
- **حلّ الوحدات (Module Resolution)**: node
- **الوضع الصارم (Strict Mode)**: مفعّل
- **خرائط المصدر (Source Maps)**: مفعّلة
- **ملفات التصريح (Declaration Files)**: مفعّلة

### بنية المُخرَجات {#output-structure}

```
dist/
├── index.js              # Entry point
├── index.d.ts            # Type declarations
├── agent.js
├── agent.d.ts
├── sdk.js
├── sdk.d.ts
└── ...                   # Other compiled files
```

## استراتيجية الاختبار {#testing-strategy}

### اختبارات الوحدات {#unit-tests}

- اختبارات وحدات لكل وحدة برمجية
- تستخدم Vitest
- لا يستدعي أي اختبار خدمة مدفوعة حقيقية، ولا يستخدم أي اختبار محاكاة للوحدات (module mocks) أو دوال تجسّس (spies): تنفّذ البدائل الاختبارية في `src/__tests__/support/` منافذ حزمة SDK، وتعمل محوّلات HTTP، بما فيها مزوّدا OpenAI وAnthropic، مقابل خوادم محلية. ويرفض `no-mocks.test.ts` كلًّا من `vi.mock` و`vi.fn` و`vi.spyOn`

### اختبارات التكامل {#integration-tests}

- اختبارات تكامل لسير العمل الكامل
- النموذج إمّا مزوّد مُبرمَج السيناريو، وإمّا عميل OpenAI أو Anthropic الحقيقي يتحدّث إلى خادم محلي يجيب بصيغة المزوّد؛ ولا يستدعي أي اختبار واجهة API حقيقية
- اختبارات مع مخازن أحداث مختلفة

### مثال على بنية اختبار {#example-test-structure}

```typescript
import { describe, it, expect } from 'vitest';
import { MyClass } from '../my-class';

describe('MyClass', () => {
  it('should do something', () => {
    const instance = new MyClass();
    expect(instance.method()).toBe(expected);
  });
});
```

## تصحيح الأخطاء {#debugging}

### خرائط المصدر {#source-maps}

تُولَّد خرائط المصدر تلقائيًا أثناء البناء. وهي تتيح لك تصحيح أخطاء شيفرة TypeScript مباشرةً.

### تصحيح الأخطاء في VS Code {#vs-code-debugging}

إعدادات `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## أسلوب كتابة الشيفرة {#code-style}

### أفضل ممارسات TypeScript {#typescript-best-practices}

- **الوضع الصارم**: مفعّل دائمًا
- **أمان الأنواع**: استخدم أنواعًا صريحة
- **لا `any`**: تجنّب `any`، واستخدم `unknown` عند الضرورة
- **الواجهات مقابل الأنواع**: فضّل الواجهات (interfaces) للكائنات، والأنواع (types) للاتحادات والتقاطعات

### اصطلاحات التسمية {#naming-conventions}

- **الملفات**: kebab-case (`my-file.ts`)
- **الأصناف**: PascalCase (`MyClass`)
- **الدوال**: camelCase (`myFunction`)
- **الثوابت**: UPPER_SNAKE_CASE (`MY_CONSTANT`)
- **الأنواع/الواجهات**: PascalCase (`MyType`)

### تنظيم الشيفرة {#code-organization}

- **صنف/واجهة واحدة لكل ملف**
- **أنواع متجاورة**: الأنواع في الملف نفسه أو في `types/`
- **تصديرات مجمِّعة (barrel exports)**: `index.ts` للتصديرات العامة

## المشكلات الشائعة {#common-issues}

### أخطاء TypeScript {#typescript-errors}

إذا ظهرت لك أخطاء TypeScript:

1. تحقّق من أن `tsconfig.json` صحيح
2. تحقّق من أن جميع التبعيات مثبّتة
3. نظّف وأعِد البناء: `npm run clean && npm run build`

### إخفاق الاختبارات {#test-failures}

إذا أخفقت الاختبارات:

1. تحقّق من أن البدائل الاختبارية في `src/__tests__/support/` ما زالت مطابقة للواجهات التي تحلّ محلها
2. تحقّق من أن التبعيات محدّثة
3. شغّل الاختبارات في وضع المراقبة لترى الأخطاء لحظيًا

### أخطاء البناء {#build-errors}

إذا فشل البناء:

1. تحقّق من أخطاء TypeScript: `npm run build`
2. تحقّق من أخطاء التدقيق: `npm run lint`
3. نظّف مجلد `dist/`: `npm run clean`

## عملية الإصدار {#release-process}

تُنشر النسخ على npm بواسطة سير العمل `Release` عند دفع وسم نسخة: الخطوات مشروحة في صفحة [إصدار نسخة جديدة](./releasing).

### الإصدارات {#versioning}

يستخدم المشروع الترقيم الدلالي للإصدارات (SemVer):
- **MAJOR**: تغييرات كاسرة للتوافق
- **MINOR**: ميزات جديدة متوافقة مع الإصدارات السابقة
- **PATCH**: إصلاحات أخطاء متوافقة مع الإصدارات السابقة

ما دامت النسخة تبدأ بـ `0.`، فإن التغيير الكاسر للتوافق يرفع MINOR بدلًا من ذلك (`0.2.0` ← `0.3.0`)، وأي تغيير آخر يرفع PATCH: انظر [إصدار نسخة جديدة](./releasing#release-a-version).

### قائمة التحقّق قبل الإصدار {#pre-release-checklist}

- [ ] جميع الاختبارات ناجحة
- [ ] الشيفرة مدقّقة ومنسّقة
- [ ] التوثيق محدّث
- [ ] CHANGELOG.md محدّث
- [ ] الإصدار في `package.json` محدّث
- [ ] النسخة المعروضة في التوثيق محدّثة (`const version` في `docs/.vitepress/config.mts`)

### البناء للإصدار {#build-for-release}

```bash
# The checks of the CI but coverage and the docs build, on a fresh dist/
# (what prepublishOnly runs before npm publish)
npm run clean && npm run verify

# The files that would be published
npm pack --dry-run
```

## الموارد {#resources}

- **التوثيق**: `docs/`
- **الأمثلة**: `examples/`
- **تعريفات الأنواع**: `src/types/`
- **الاختبارات**: `src/__tests__/`

## موقع التوثيق {#documentation-site}

التوثيق موقع VitePress في `docs/`، مصوَّر برسوم SVG موجودة في `docs/public/images/`.

```bash
npm run docs:dev      # local preview with hot reload
npm run docs:build    # static build in docs/.vitepress/dist
npm run docs:preview  # serve the build
```

ينشره سير عمل GitHub Actions المسمّى `Docs` على GitHub Pages مع كل دفع (push) إلى `main`.
