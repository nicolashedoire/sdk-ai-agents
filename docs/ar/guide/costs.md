# تكاليف API

تسجّل حزمة SDK استهلاك الرموز (tokens) لكل استدعاء للنموذج **في التشغيل الذي أجراه** — اختيار الأدوات، والأفكار المعرفية، والقرارات المُنمَّطة — وتسعّره لكل نموذج.

```ts
const cost = await sdk.getRunCost(runId);
```

```json
{
  "runId": "run_7f3…",
  "currency": "USD",
  "totalUsd": 0.01842,
  "complete": true,
  "unpricedModels": [],
  "lines": [
    { "model": "gpt-4o", "source": "llm", "calls": 9, "inputTokens": 14210, "outputTokens": 2310, "costUsd": 0.0186 },
    { "model": "jev-1.13.0", "source": "decision", "calls": 7, "inputTokens": 5880, "outputTokens": 140, "costUsd": 0.00025 }
  ]
}
```

## الأسعار {#prices}

تتغيّر أسعار النماذج اللغوية كثيرًا وتعتمد على عقدك، لذا فهي **إعدادات، لا شيفرة**. لا تُوزَّع قيمًا افتراضيةً إلا الأسعار التي تم التحقّق منها مقابل توثيق المورّدين — واليوم، سعر Jev (0.042 دولار لكل مليون رمز مُدخَل، والمُخرَجات مجانية، تم التحقّق في 2026-09-23)، سواء تحت معرّفاته في TypeSafe (`jev-*`) أو عبر Vercel AI Gateway (`typesafe-ai/jev`).

```ts
const sdk = createSDK({
  apiKey,
  pricing: {
    // Illustrative values: use your provider's current prices or your contract.
    'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
});
```

المفاتيح معرّفات نماذج دقيقة أو بادئات تنتهي بـ `*`. كثيرًا ما يجيب المزوّدون بمعرّف ذي إصدار (`gpt-4o-2024-08-06`) بينما طلبت `gpt-4o`: تسجّل حزمة SDK الاثنين وتبحث أولًا عن المعرّف المُعاد، ثم عن الاسم المطلوب — المفاتيح الدقيقة قبل البادئات، والبادئة الأطول هي التي تفوز. انتبه للبادئات: `gpt-4o*` يطابق أيضًا `gpt-4o-mini` ما لم يوجد `gpt-4o-mini*`.

النموذج الذي لا سعر له يظل محسوبًا (الاستدعاءات والرموز) ومُدرَجًا في `unpricedModels`، ويُوسَم التقرير بـ `complete: false` — فحزمة SDK لا تخترع سعرًا أبدًا.

## من أين يأتي الاستهلاك {#where-usage-comes-from}

| الحدث | المصدر | الحقول |
| --- | --- | --- |
| `intention.generated` | الاستدلال الأصيل، واختيار الأدوات | `model`، `requestedModel`، `usage.promptTokens`، `usage.completionTokens` |
| `cognition.thought` | العمليات المعرفية، بما فيها الإصلاحات والمحاولات الفاشلة | `model`، `requestedModel`، `usage.calls` |
| `decision.evaluated` | Jev وغيره من الواجهات الخلفية للقرارات المُنمَّطة | `model`، `usage.inputTokens`، `usage.outputTokens` |

لأن الاستهلاك موجود في الأحداث، يمكنك أيضًا حساب التكاليف بنفسك بـ `computeRunCost(runId, events, pricing)`، وتجميعها لكل وكيل أو لكل يوم، أو تغذية نظام الفوترة لديك بها.

## الميزانيات {#budgets}

التكلفة جانب واحد فقط؛ إذ يمكن للسياسات أيضًا وضع سقف لـ **الخطوات والرموز واستدعاءات الأدوات** لكل وكيل وأداة وفترة — انظر [الوكلاء الخاضعون للحوكمة](./governed-agents). وللوكلاء المعرفيين حدودهم الخاصة (`maxSteps`، `maxToolCalls`، `timeoutMs`). يرفض `budgetLimit` مع `maxCost` استدعاءات الأدوات لدى وكيل خاضع للحوكمة بمجرّد أن تتجاوز كلفة استدعاءاته للنموذج الحدَّ خلال الفترة، وفق الأسعار أعلاه: لا يُرفض استدعاء النموذج نفسه أبدًا، ومع `toolName` لا تُرفض إلا تلك الأداة. وإذا لم يكن لنموذجٍ سعر، أو لم يُبلغ استدعاءٌ عن عدد رموزه، تعذّر فحص الحدّ فتُرفض استدعاءات الأدوات.
