---
layout: home

hero:
  name: SDK AI Agents
  text: "وكلاء خاضعون للحوكمة يفكّرون قبل أن يتصرّفوا"
  tagline: "استدلال صريح بحالة ذهنية يمكنك فحصها، وقرارات مُنمَّطة مع Jev، وموصِّلات MCP — فوق الاستناد إلى الأحداث (event sourcing)، وإعادة التشغيل، والتكاليف، وإعادة المحاولة، وتنبيهات الحوادث."
  image:
    src: /images/reasoning-loop.svg
    alt: "الحلقة المعرفية حول حالة ذهنية صريحة"
  actions:
    - theme: brand
      text: "ابدأ الآن"
      link: /ar/guide/getting-started
    - theme: alt
      text: "كيف يفكّر الوكلاء"
      link: /ar/guide/cognitive-agents
    - theme: alt
      text: "اعرضه على GitHub"
      link: https://github.com/nicolashedoire/sdk-ai-agents

features:
  - icon: 🧠
    title: "استدلال، لا مجرد كتابة موجّهات (prompts)"
    details: "التمثيل، ومقارنة الملاحظات، ووضع الفرضيات، والمحاكاة، والاختبار، والمراجعة، والنقد، والبحث عن المعلومات، والمقارنة، والقرار. كل خطوة عملية على حالة ذهنية صريحة، يختارها متحكّم وتُسجَّل حدثًا."
    link: /ar/guide/cognitive-agents
    linkText: "الحلقة المعرفية"
  - icon: 🔬
    title: "يؤمن بما يستطيع تبريره"
    details: "تحتفظ الملاحظات بمنشئها، وتأتي القواعد مع تنبؤات قابلة للتفنيد، ويختبرها مقيِّمك الخاص، وتُراجَع القواعد المدحوضة — ولا تُعتمَد الإجابة إلا حين تجتاز حارسًا مكتوبًا بالشيفرة."
    link: /ar/guide/evidence-and-verification
    linkText: "الأدلة والتحقّق"
  - icon: 🪞
    title: "يستدل على طريقة شخص معيّن"
    details: "نعم، يمكنه محاكاة طريقة استدلال شخص ما. اشرح بضعة مواضيع بكلماتك الخاصة، فيستخلص منها ترتيب انتباهك وأولوياتك وردود أفعالك في ملف يُكتَب في تعليمات كل خطوة من خطوات الاستدلال. يُضاف إليه كل تصحيح، ونسبة اتفاقك تُظهر مدى اقترابه منك."
    link: /ar/guide/thinker-profiles
    linkText: "الاستدلال على طريقة شخص معيّن"
  - icon: 🧭
    title: "باحث لا يحيد عن مساره"
    details: "أعطِه موضوعًا ليفهمه ويعيد تصميمه بوسائل اليوم. يبحث في مصادرك، ويميّز الوقائع المُثبَتة من الفرضيات وادعاءات الجِدّة، ويقترح التجارب التي من شأنها أن تحسم — مع ميثاق مُجمَّد وحارس يُبقيانه على هدفه."
    link: /ar/guide/studies
    linkText: "الدراسات"
  - icon: 🎯
    title: "قرارات مُنمَّطة مع Jev"
    details: "أدخِل أيّ سياق، واطرح أسئلة نعم/لا، واختيار واحد أو متعدد، وتقييم، واحصل على احتمالات معايَرة يمكن لشيفرتك أن تعمل بها."
    link: /ar/guide/typed-decisions
    linkText: "قرّر بثقة"
  - icon: 🔌
    title: "خادم MCP لأيّ شيء"
    details: "حوِّل واجهة API على الويب، أو مجلد مستندات، أو قاعدة بيانات للقراءة فقط، أو وكيلًا إلى خادم MCP في سطر واحد، خاضع للحوكمة ومُتتبَّع، وامنح وكلاءك أدوات أيّ خادم MCP."
    link: /ar/guide/mcp
    linkText: "اربط أنظمتك"
  - icon: 🛡️
    title: "الحوكمة من التصميم"
    details: "النموذج يقترح، والمحرّك يقرّر. تُفحَص السياسات، وقوائم السماح، والميزانيات، والموافقات البشرية قبل كل إجراء."
    link: /ar/guide/governed-agents
    linkText: "الوكلاء الخاضعون للحوكمة"
  - icon: 🎞️
    title: "كل شيء حدث"
    details: "أعِد تشغيل عمليات التشغيل دون استدعاء النموذج اللغوي (LLM)، وأعِد بناء الحالة الذهنية لأيّ تشغيل، وقارن بين عمليات التشغيل وحوِّلها إلى اختبارات مرجعية (golden tests)."
    link: /ar/guide/observability
    linkText: "التتبّع وإعادة التشغيل"
  - icon: 💸
    title: "تكاليف يمكنك رؤيتها"
    details: "يُسجَّل استهلاك الرموز (tokens) لكل استدعاء للنموذج اللغوي ولكل قرار مُنمَّط، ويُسعَّر لكل تشغيل ولكل نموذج."
    link: /ar/guide/costs
    linkText: "تكاليف API"
  - icon: 🔁
    title: "إعادة محاولة لا تتراكم"
    details: "سياسة واحدة لإعادة المحاولة لكل مزوّد قبل التحويل إلى البديل، وإعادة المحاولة للأدوات المتساوية القوة (idempotent)، وكل إعادة محاولة مكتوبة في الأثر."
    link: /ar/guide/resilience
    linkText: "إعادة المحاولة والبديل الاحتياطي"
  - icon: 🚨
    title: "حوادث تصل إليك"
    details: "تتحوّل عمليات التشغيل الفاشلة، والإجراءات المحظورة، والتحويلات بين المزوّدين إلى حوادث مع تسلسلها الزمني، تُرسَل بالبريد الإلكتروني أو عبر webhook."
    link: /ar/guide/incidents
    linkText: "تنبيهات الحوادث"
---

<div class="vp-doc" style="max-width: 1152px; margin: 0 auto; padding: 48px 24px 0;">

## من موجّه (prompt) إلى قرار يمكنك تدقيقه {#from-a-prompt-to-a-decision-you-can-audit}

ينتقل الاستدعاء التقليدي لنموذج لغوي مباشرةً من السؤال إلى الإجابة. أما الوكيل المعرفي فيبني صورة صريحة للمشكلة، ويستكشف عدة خيارات، ويُخضعها للاختبار، ويتحقّق من الوقائع بأدوات خاضعة للحوكمة، ثم يلتزم بعد ذلك فقط — ويمكنك قراءة كل خطوة لاحقًا.

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY, jev: { apiKey: process.env.TYPESAFE_API_KEY } });

const lookupMetric = sdk.defineTool({ /* name, description, zod schema, handler */ });
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools: [lookupMetric] });
const { answer, decision, state, runId } = await analyst.think({
  problem: 'Should we build or buy our analytics module?',
});

console.log(answer);                          // the decision, in plain words
console.log(state.hypotheses);                // every option considered, with its support
console.log(await sdk.getRunCost(runId));     // what it cost, per model
```

![حالة ذهنية أُعيد بناؤها من سجل الأحداث](/images/mental-state.svg){.illustration}

## حزمة SDK واحدة لكل الطبقات {#one-sdk-every-layer}

![البنية المعمارية لحزمة SDK](/images/architecture.svg){.illustration}

| ما تحتاج إليه | واجهة API خام لنموذج لغوي | SDK AI Agents |
| --- | --- | --- |
| الاستدلال قبل الإجابة | توليد في محاولة واحدة | فرضيات ومحاكاة ونقد على حالة صريحة |
| الاستدلال على طريقة شخص معيّن | موجّه نظام (system prompt) طويل | ملف مفكّر ذو إصدارات، يُحسَّن بالملاحظات الراجعة |
| بحث يبقى على هدفه | محادثة تنحرف كلما تراكمت التعليمات | دراسة: ميثاق مُجمَّد، وموجّهات يُعاد بناؤها عند كل استدعاء، وحارس، وادعاءات يُتحقَّق منها مقابل المصادر |
| قرارات سريعة ومعايَرة | تحليل نص حر | إجابات مُنمَّطة مع احتمالات ودرجة ثقة (Jev) |
| ربط أدوات الشركة | شيفرة ربط مخصّصة لكل أداة | خادم MCP وعميل MCP، خاضعان للسياسات |
| معرفة ما حدث | سجلات، إن وُجدت | سجل الأحداث، وإعادة التشغيل، وإعادة بناء الحالة الذهنية |
| التحكّم في المخاطر والإنفاق | الأمل | السياسات، والموافقات، والميزانيات، وتكاليف كل تشغيل، وتنبيهات الحوادث |

</div>
