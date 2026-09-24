# القرارات المُنمَّطة (Jev)

بعض الأسئلة لا تحتاج إلى نثر. *هل هذا عاجل؟ أي فريق؟ ما مدى الخطورة؟* يطرح **القرار المُنمَّط** على نموذج سؤالًا ضيقًا عن سياق ما، ويعيد إجابة مهيكلة ومعايَرة يمكن لشيفرتك أن تعمل بها.

تدمج حزمة SDK نموذج [TypeSafe Jev](https://docs.typesafe.ai)، أول نموذج من نوع «System One»، وأي واجهة خلفية تعرض العقد نفسه (`POST /v1/systemone`) — بما في ذلك النسخ المفتوحة المصدر المستضافة ذاتيًا.

![القرارات المُنمَّطة](/images/typed-decisions.svg){.illustration}

## الإعداد {#configure}

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  jev: {
    apiKey: process.env.TYPESAFE_API_KEY,
    model: 'jev-latest',        // pin 'jev-1.13.0' once you tune thresholds
    // baseUrl: 'http://localhost:8080', // a compatible self-hosted clone (no key needed)
  },
});
```

| الخيار | القيمة الافتراضية | |
| --- | --- | --- |
| `apiKey` | — | مفتاح TypeSafe لـ `api.typesafe.ai`، أو مفتاح AI Gateway للبوابة (انظر أدناه)؛ اختياري لنسخة مستضافة ذاتيًا لا تتطلّب مفتاحًا |
| `baseUrl` | `https://api.typesafe.ai` | أي خادم يعرض `POST /v1/systemone` |
| `model` | `jev-latest` | ثبّت معرّفًا ذا إصدار لتجميد السلوك |
| `timeoutMs` | `30000` | لكل محاولة |
| `maxRetries` | `2` | عند الرموز 408 و429 و5xx و529 وأخطاء الشبكة، مع احترام `retry-after` |
| `retryBaseDelayMs` | `500` | مدة الانتظار الأولى، وتتضاعف مع كل إعادة محاولة |
| `maxRetryDelayMs` | `30000` | الحدّ الأعلى لكل انتظار، بما في ذلك `retry-after` |
| `fetch` | `fetch` العامة | أدخِل وسيلة نقل تدعم الوكيل الوسيط (proxy) |

### عبر Vercel AI Gateway {#through-vercel-ai-gateway}

يُقدَّم Jev أيضًا عبر [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) باسم `typesafe-ai/jev`، مع API متوافقة مع TypeSafe. استخدم مفتاح AI Gateway بدل مفتاح TypeSafe؛ وتُحتسَب الطلبات على حسابك في Vercel بالسعر نفسه (0.042 دولار لكل مليون رمز مُدخَل، والمُخرَجات مجانية). ولدى AI Gateway أيضًا فئة مجانية برصيد شهري لمجموعة فرعية من النماذج: انظر [صفحة أسعارها](https://vercel.com/docs/ai-gateway/pricing) لمعرفة ما إذا كان Jev مشمولًا.

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  jev: {
    apiKey: process.env.AI_GATEWAY_API_KEY,
    baseUrl: 'https://ai-gateway.vercel.sh/typesafe',
    model: 'typesafe-ai/jev',
  },
});
```

لا يتغيّر شيء آخر: تعمل `sdk.decisions` والمتحكّم المُنمَّط والمقيِّم التقديري المُنمَّط بالطريقة نفسها، وتُبلَّغ التكاليف تحت `typesafe-ai/jev`.

أو استخدم أي واجهة خلفية تنفّذ `TypedDecisionClient` عبر `decisionClient`.

## أدخِل سياقك {#inject-your-context}

`context` هو ما يقيّمه النموذج: نص بسيط، أو بيانات مهيكلة — تذكرة دعم، أو سجل محادثة، أو سجل بيانات، أو حالة تطبيقك. أشِر إلى حقوله بأسمائها بين علامتَي backtick في أسئلتك.

```ts
const ticket = {
  customer: { plan: 'enterprise', since: '2021' },
  messages: ['I was charged twice', 'and the CSV export is broken. Fix this today!'],
};
```

## الاختيار الواحد {#single-choice}

```ts
const route = await sdk.decisions.choose({
  context: ticket,
  question: 'Which team should handle `messages`?',
  options: {
    billing: 'Payments, invoices, refunds',
    technical: 'Bugs, outages, integrations',
    sales: 'Pricing, upgrades',
  },
  minConfidence: 0.5,
});
// { choice: 'billing', confidence: 0.81, probabilities: { billing: 0.88, … }, confident: true, runId }
```

تُحسَب `confident` **في شيفرتك** من ثقة الإجابة. وحين تكون `false`، وجّه الطلب إلى إنسان أو إلى نموذج أقوى — هذا هو نمط *التوجيه المشروط بالثقة* (confidence-gated routing).

## الاختيار المتعدد {#multiple-choice}

هل يمكن أن تنطبق عدة خيارات في آن واحد؟ تحوّل `selectMany` كل خيار إلى سؤال نعم/لا مستقل، وترسلها **في طلب واحد**، وتطبّق عتبتك:

```ts
const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export', 'cancellation'],
  threshold: 0.5,
});
// { selected: ['double charge', 'broken export'], probabilities: { … } }
```

## نعم / لا والتقييمات {#yes-no-and-ratings}

```ts
const refund = await sdk.decisions.check({
  context: ticket,
  question: 'Is the customer asking for a refund?',
  criteria: { true: 'Explicitly asks for money back', false: 'No refund requested' },
  threshold: 0.8,
});

const urgency = await sdk.decisions.rate({
  context: ticket,
  question: 'How urgent is this ticket?',
  levels: ['Can wait', 'This week', 'Today'], // lowest first, 2 to 10 levels
});
// { score: 1.82, normalized: 0.91, level: 'Today', confidence: 0.9 }
```

## أسئلة كثيرة، طلب واحد {#many-questions-one-request}

يقرأ Jev السياق مرة واحدة ويجيب عن كل الأسئلة بالتوازي. استخدم `ask` مع الدوال المساعدة `noul` و`choice` و`score` — وتُستنتَج أنواع الإجابات تلقائيًا:

```ts
import { choice, noul, score } from '@sdk-ai-agents/core';

const { answers } = await sdk.decisions.ask({
  context: ticket,
  questions: {
    urgent: noul('Does `messages` convey urgency?'),
    team: choice('Which team should handle it?', { billing: null, technical: null }),
    frustration: score('How frustrated is the customer?', ['Calm', 'Annoyed', 'Angry']),
  },
});
answers.urgent.noul;          // number
answers.team.choice;          // 'billing' | 'technical'
answers.frustration.score;    // number
```

## داخل الوكلاء المعرفيين {#inside-cognitive-agents}

مع وجود واجهة خلفية مُعدّة للقرارات، يستخدمها الوكلاء المعرفيون تلقائيًا:

- **المتحكّم** — عند كل خطوة، يسأل طلب واحد عن العملية المتاحة التالية (Choice) وعمّا إذا كان الاستدلال جاهزًا للقرار (Noul)؛
- **المقارنة** — تطلب `compare` دعم الأدلة لكل فرضية في طلب **دون** ملف المفكّر، ثم، للمقترحات فقط، ملاءمتها للمفكّر في طلب ثانٍ. تُبقى الدرجتان منفصلتين: الملاءمة تعيد ترتيب المقترحات (`limits.preferenceWeight`، 0.4 افتراضيًا) وتسمح باعتماد مقترح يفضّله المفكّر بوضوح بناءً على أدلة معقولة (`limits.minProposalSupport`)، ولا تمسّ أبدًا مصداقية ادعاء ما — انظر [الأدلة والتحقّق](./evidence-and-verification#evidence-is-not-preference).

يرجع كلاهما إلى النموذج اللغوي أو إلى المتحكّم الإرشادي حين يكون Jev غير متأكد أو غير متاح.

## التتبّع والتكلفة {#traceability-and-cost}

يُكتَب كل قرار مُنمَّط حدثًا من نوع `decision.evaluated` مع سياقه، وأسئلته، وإجاباته، واستهلاكه للرموز — في `runId` الذي تمرّره، أو في مسار مخصّص `decision_*`. سعر Jev هو **0.042 دولار لكل مليون رمز مُدخَل، والمُخرَجات مجانية** (كما هو موثّق في 2026-09-23)، لذا يتضمّنه `sdk.getRunCost(runId)` مباشرةً دون إعداد.

أمّا الإجابة التي لا تطابق الأسئلة (اختيار ليس من الخيارات، أو إجابة ناقصة أو من نوع خاطئ) فقد دُفعت كلفتها رغم ذلك: فتُسجَّل هي أيضًا، مع `error` و`answers` فارغة، قبل إطلاق الخطأ. وحين لا تُبلِغ الواجهة الخلفية عن أي عدد من الرموز، لا يحمل الحدث `usage`، وتُعرَض كلفة الاستدعاء على أنها مجهولة، لا على أنها 0 دولار أبدًا — انظر [تكاليف API](./costs#unknown-costs).

## الممارسة الجيدة {#good-practice}

يقرأ Jev حرفيًا، وهو ضعيف في الحساب والعدّ ومقارنة التواريخ. أبقِ الأرقام في الشيفرة، واطرح سؤالًا ذريًا واحدًا في كل مرة، واكتب معايير تصف كل خيار بدقة، وصفِّ السياق ليقتصر على ما يحتاجه السؤال. انظر [القيود المعروفة](https://docs.typesafe.ai/model-jaggedness/jev-1.13) لدى TypeSafe.
