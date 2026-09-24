# الوكلاء الخاضعون للحوكمة

يشغّل الوكيل الخاضع للحوكمة الحلقة التقليدية لاستدعاء الأدوات — مع فارق: **النموذج اللغوي لا يقترح إلا نوايا**. يتحقّق محرّك الإجراءات من كل نيّة مقابل المخططات والسياسات قبل أن يحدث أي شيء، ويسجّل كل خطوة. تستعرض هذه الصفحة الأدوات، والقدرات، والسياسات، والآثار، وإعادة التشغيل، وإيقاف التشغيل.

::: tip الاستدلال قبل الفعل
للقرارات المفتوحة، فضّل [الوكلاء المعرفيين](./cognitive-agents): فهم يتشاركون الأدوات والسياسات والآثار نفسها.
:::

## المتطلبات المسبقة {#prerequisites}

- Node.js 20+ مثبّت
- مفتاح OpenAI API (أو مزوّد نماذج لغوية آخر)
- معرفة أساسية بـ TypeScript/JavaScript

## التثبيت {#installation}

```bash
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## أول وكيل في 5 دقائق {#first-agent-in-5-minutes}

### الخطوة 1: تهيئة حزمة SDK {#step-1-initialize-the-sdk}

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### الخطوة 2: تعريف أداة {#step-2-define-a-tool}

الأداة قدرة يستطيع الوكيل استخدامها. ويجب التصريح بها صراحةً.

```typescript
import { defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  handler: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return a / b;
    }
  },
});
```

### الخطوة 3: إنشاء وكيل {#step-3-create-an-agent}

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
});
```

### الخطوة 4: تشغيل الوكيل {#step-4-run-the-agent}

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // Unique UUID for this execution
```

### الخطوة 5: عرض الأثر {#step-5-view-the-trace}

```typescript
const trace = await sdk.getTrace(result.runId);
console.log(trace.summary);
// {
//   totalEvents: 5,
//   duration: 1234,
//   intentionsGenerated: 1,
//   actionsExecuted: 1,
//   toolsCalled: 1
// }
```

## مثال كامل (10 أسطر) {#complete-example-10-lines}

```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });
const calc = sdk.defineTool({
  name: 'calculator', description: 'Math operations',
  schema: z.object({ op: z.enum(['add', 'multiply']), a: z.number(), b: z.number() }),
  handler: async ({ op, a, b }) => op === 'add' ? a + b : a * b
});
const agent = sdk.createAgent({ name: 'assistant', model: 'gpt-4', tools: [calc] });
const result = await agent.run({ message: 'What is 15 * 23?' });
console.log(await sdk.getTrace(result.runId));
```

## المفاهيم الأساسية {#key-concepts}

### 1. الأدوات {#_1-tools}

الأدوات هي الإجراءات الوحيدة التي يستطيع الوكيل تنفيذها. **لا شيء مأذون به افتراضيًا** (الرفض افتراضيًا، deny-by-default): يجب تسجيل الأداة قبل أن يتمكّن أي شيء من تشغيلها.

::: warning نطاق الوكيل الخاضع للحوكمة
يستطيع الوكيل الخاضع للحوكمة تنفيذ **أي أداة مسجَّلة في حزمة SDK** يذكر النموذج اسمها: قائمة `tools` الخاصة بالوكيل تحدّد ما يُعرَض على النموذج، لا ما يُسمَح له باستدعائه. قيّده بسياسة `allowlist` — فتُرفَض أي أداة أخرى قبل التنفيذ:

```ts
const agent = sdk.createAgent({
  name: 'support',
  model: 'gpt-4o',
  tools: [lookupCustomer],
  policies: [
    {
      id: 'support-tools',
      type: 'allowlist',
      scope: 'agent',
      enabled: true,
      rules: [{ condition: 'allowedTools', action: 'deny', metadata: { tools: ['lookup_customer'] } }],
    },
  ],
});
```

يُقيَّد الوكلاء المعرفيون وخوادم MCP بقائمة أدواتهم تلقائيًا.
:::

**الخصائص:**
- تعريف صريح بمخطط Zod
- تحقّق تلقائي من المُدخَلات
- دعم الإصدارات
- تتبّع كامل

**مثال:**
```typescript
const weatherTool = sdk.defineTool({
  name: 'get_weather',
  description: 'Gets weather for a location',
  schema: z.object({
    location: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  handler: async ({ location, unit }) => {
    // Your logic here
    return { temperature: 22, condition: 'sunny' };
  },
});
```

### 2. القدرات {#_2-capabilities}

تتيح لك القدرات تجميع الأدوات تجميعًا منطقيًا وإعادة استخدامها.

**مثال:**
```typescript
// Option 1: With tool names (tools already registered)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
});

// Option 2: With Tool objects (auto-registration)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
});

// Usage in an agent
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-4',
  capabilities: ['math'],
});
```

### 3. السياسات {#_3-policies}

تتحكّم السياسات فيما يستطيع الوكيل فعله.

**أنواع السياسات:**
- **الميزانية** (Budget): حدّ لعدد الخطوات أو الرموز (tokens)
- **المهلة الزمنية** (Timeout): أقصى مدة للتنفيذ
- **قائمة السماح** (Allowlist): قائمة الأدوات المأذون بها
- **مخصّصة** (Custom): أداة تحقّق مخصّصة

**مثال:**
```typescript
// Global policy
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 },
  }],
  scope: 'global',
  enabled: true,
});

// Per-agent policy
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
  policies: [{
    id: 'timeout',
    type: 'timeout',
    rules: [{
      condition: 'maxDuration',
      action: 'deny',
      metadata: { value: 30000 }, // 30 seconds
    }],
    scope: 'agent',
    enabled: true,
  }],
});
```

تُفحص حدود الميزانية والمدة قبل كل استدعاء أداة في عملية تشغيل لوكيل خاضع للحوكمة، وفق تقدّم تلك العملية: يعدّ `maxSteps` الخطوات المنجزة (أول استدعاء في الخطوة 0)، ويعدّ `maxTokens` الرموز التي استهلكتها استدعاءات النموذج، ويقيس `maxDuration` الوقت منذ بدء التشغيل. يرفض الحدّ استدعاء الأداة، فتفشل عملية التشغيل؛ ولا يقاطع أبدًا استدعاءً للنموذج. وتحسب ميزانيات الرموز والكلفة لكل فترة (`budgetLimit` مع `maxTokens` أو `maxCost`) رموز استدعاءات النموذج لدى الوكلاء الخاضعين للحوكمة وكلفتها، وتطبّق إعادة التشغيل `maxSteps` و`maxTokens` و`maxDuration` كما طبّقتها العملية الأصلية (أما الميزانيات لكل فترة فتعتمد على استهلاك الفترة الحالية). وللوكلاء المعرفيين حدودهم الخاصة (`maxSteps` و`maxToolCalls` و`timeoutMs`). تُفحَص السياسة حين تُطبَّق (`defaultPolicies`، و`defineGlobalPolicy`، و`policies` الخاصة بالوكيل، و`setPolicy`): تُوضَع قاعدة `maxSteps` أو `maxTokens` في سياسة من نوع `budget`، وقاعدة `maxDuration` في سياسة من نوع `timeout`، مع `value` يكون عددًا منتهيًا أكبر من 0؛ ويحتاج `budgetLimit` إلى `period` (`hour` أو `day` أو `week` أو `month` أو `all`)، وإلى `agentId` و`toolName` نصّيين إن حُدِّدا، وإلى حدّ واحد على الأقل (`maxTokens` و`maxToolCalls` و`maxCost`)، كلٌّ منها عدد منتهٍ ≥ 0 (`maxToolCalls: 0` يرفض كل استدعاء، وحدّ الرموز أو الكلفة المساوي للصفر يرفضها بمجرّد احتساب أي شيء). وأي قيمة أخرى، كسلسلة نصية (`'10'`) مقروءة من ملف إعدادات، أو `NaN`، أو `0` لحدّ تشغيل، أو عدد سالب، تُطلق خطأ `ValidationError` يسمّي الحقل.

### 4. الآثار {#_4-traces}

يولّد كل تنفيذ أثرًا كاملًا قابلًا لإعادة التشغيل.

**استرجاع أثر:**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**تصدير أثر:**
```typescript
// Text format
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// JSON format
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. إعادة التشغيل {#_5-replay}

أعِد تشغيل تنفيذ ما دون الاتصال بالنموذج اللغوي مجددًا.

**إعادة تشغيل بسيطة:**
```typescript
const replayResult = await sdk.replay(runId);
```

**إعادة تشغيل مع تعديلات:**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. إيقاف التنفيذ {#_6-stopping-execution}

أوقف تنفيذًا جاريًا.

**من الوكيل:**
```typescript
await agent.stop(runId); // Stop a specific run
await agent.stop(); // Stop all runs of this agent
```

**من حزمة SDK:**
```typescript
await sdk.stopRun(runId);
```

## سير العمل النموذجي {#typical-workflow}

1. **هيّئ حزمة SDK** بمفتاح API الخاص بك
2. **عرّف الأدوات** اللازمة لحالة استخدامك
3. **أنشئ القدرات** (اختياري، من أجل التنظيم)
4. **اضبط السياسات** من أجل الحوكمة
5. **أنشئ الوكيل** بالأدوات والسياسات
6. **شغّل الوكيل** بمُدخَل
7. **حلّل الأثر** لتفهم ما حدث
8. **أعِد التشغيل عند الحاجة** لتصحيح الأخطاء

## أفضل الممارسات {#best-practices}

### الأدوات {#tools}
- ✅ استخدم مخططات Zod صارمة
- ✅ وثّق كل أداة بوضوح
- ✅ عالج الأخطاء كما ينبغي
- ✅ أصدِر نسخة جديدة من الأداة حين تتغيّر

### السياسات {#policies}
- ✅ طبّق ميزانيات معقولة
- ✅ استخدم قوائم سماح صارمة
- ✅ اختبر السياسات قبل بيئة الإنتاج
- ✅ وثّق السياسات

### القدرات {#capabilities}
- ✅ جمّع الأدوات تجميعًا منطقيًا
- ✅ أعِد استخدام القدرات عبر الوكلاء
- ✅ وثّق القدرات

### الأمان {#security}
- ✅ **الرفض افتراضيًا**: لا يمكن تنفيذ أي أداة غير مُصرَّح بها
- ✅ التحقّق: يُتحقَّق من جميع المُدخَلات بـ Zod
- ✅ السياسات: تُفحَص قبل كل إجراء
- ✅ التتبّع: جميع الإجراءات مُتتبَّعة

## أمثلة {#examples}

### مثال بالحدّ الأدنى {#minimal-example}
انظر [`examples/quick-start.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts)

### مثال كامل {#complete-example}
انظر [`examples/complete-example.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts) لجميع الميزات

## الخطوات التالية {#next-steps}

- 📚 [المفاهيم الأساسية](./concepts) - افهم البنية المعمارية
- 🏗️ [البنية المعمارية](../reference/architecture) - التفاصيل التقنية
- 📖 [واجهة SDK البرمجية](../reference/sdk-api) - كل خيار ودالة

## الدعم {#support}

- التوثيق: `docs/`
- الأمثلة: `examples/`
- المشكلات: GitHub Issues

## استكشاف الأعطال وإصلاحها {#troubleshooting}

### خطأ: "Tool not found" {#error-tool-not-found}
← تأكّد من أنك سجّلت الأداة بـ `defineTool()` قبل استخدامها في وكيل.

### خطأ: "Policy violation" {#error-policy-violation}
← تحقّق من سياساتك (الميزانية، والمهلة الزمنية، وقائمة السماح).

### خطأ: "Run cancelled" {#error-run-cancelled}
← أُوقف التنفيذ. تحقّق باستخدام `getTrace()` لترى السبب.

### آثار فارغة {#empty-traces}
← تحقّق من أن مخزن الأحداث يعمل على نحو صحيح ومن أن الأحداث تُحفَظ.

## الوقت اللازم لأول وكيل {#time-to-first-agent}

**هدف النسخة الأولية (MVP):** < 30 دقيقة

**الوقت المقدَّر:**
- التثبيت: دقيقتان
- الأداة الأولى: 5 دقائق
- الوكيل الأول: 3 دقائق
- التنفيذ الأول: 5 دقائق
- فهم الآثار: 10 دقائق
- **المجموع: نحو 25 دقيقة** ✅
