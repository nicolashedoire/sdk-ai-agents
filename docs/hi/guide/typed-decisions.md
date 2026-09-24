# टाइप्ड निर्णय (Jev)

कुछ सवालों के लिए लंबे-चौड़े गद्य की ज़रूरत नहीं होती। *क्या यह ज़रूरी है? कौन-सी टीम? कितना जोखिम?* एक **टाइप्ड निर्णय** किसी मॉडल से किसी संदर्भ के बारे में एक सीमित सवाल पूछता है और एक संरचित, कैलिब्रेटेड उत्तर लौटाता है जिस पर आपका कोड काम कर सके।

SDK [TypeSafe Jev](https://docs.typesafe.ai) को जोड़ता है, जो पहला "System One" मॉडल है, और ऐसे किसी भी backend को जो वही अनुबंध (`POST /v1/systemone`) देता हो — जिनमें खुद होस्ट किए गए ओपन-सोर्स क्लोन भी शामिल हैं।

![टाइप्ड निर्णय](/images/typed-decisions.svg){.illustration}

## कॉन्फ़िगर करें {#configure}

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

| विकल्प | डिफ़ॉल्ट | |
| --- | --- | --- |
| `apiKey` | — | `api.typesafe.ai` के लिए TypeSafe key, या gateway के लिए AI Gateway key (नीचे देखें); बिना key वाले खुद होस्ट किए गए क्लोन के लिए वैकल्पिक |
| `baseUrl` | `https://api.typesafe.ai` | कोई भी सर्वर जो `POST /v1/systemone` देता हो |
| `model` | `jev-latest` | व्यवहार को स्थिर करने के लिए वर्ज़न वाला id तय करें |
| `timeoutMs` | `30000` | हर प्रयास के लिए |
| `maxRetries` | `2` | 408, 429, 5xx, 529 और नेटवर्क errors पर, `retry-after` का पालन करते हुए |
| `retryBaseDelayMs` | `500` | पहला इंतज़ार, हर retry पर दोगुना |
| `maxRetryDelayMs` | `30000` | हर इंतज़ार की ऊपरी सीमा, `retry-after` समेत |
| `fetch` | ग्लोबल `fetch` | proxy को समझने वाला transport जोड़ें |

### Vercel AI Gateway के ज़रिए {#through-vercel-ai-gateway}

Jev [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) पर भी `typesafe-ai/jev` नाम से उपलब्ध है, TypeSafe-संगत API के साथ। TypeSafe key की जगह AI Gateway key इस्तेमाल करें; अनुरोधों का बिल आपके Vercel खाते पर उसी कीमत पर आता है ($0.042 प्रति मिलियन इनपुट tokens, आउटपुट मुफ़्त)। AI Gateway में कुछ मॉडलों के लिए मासिक क्रेडिट वाला एक मुफ़्त स्तर भी है: Jev उसमें शामिल है या नहीं, यह जानने के लिए [इसकी कीमतें](https://vercel.com/docs/ai-gateway/pricing) देखें।

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

और कुछ नहीं बदलता: `sdk.decisions`, टाइप्ड कंट्रोलर और टाइप्ड आकलनकर्ता वैसे ही काम करते हैं, और लागत `typesafe-ai/jev` के नाम से रिपोर्ट होती है।

या `decisionClient` के साथ `TypedDecisionClient` लागू करने वाला कोई भी backend लाएँ।

## अपना संदर्भ जोड़ें {#inject-your-context}

`context` वह है जिसका मॉडल मूल्यांकन करता है: सादा टेक्स्ट, या संरचित डेटा — एक टिकट, एक चैट लॉग, एक रिकॉर्ड, आपके ऐप की स्थिति। अपने सवालों में इसके फ़ील्ड का नाम backticks में लिखकर हवाला दें।

```ts
const ticket = {
  customer: { plan: 'enterprise', since: '2021' },
  messages: ['I was charged twice', 'and the CSV export is broken. Fix this today!'],
};
```

## एक विकल्प वाला सवाल {#single-choice}

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

`confident` की गणना उत्तर के विश्वास स्तर से **आपके कोड में** होती है। जब यह `false` हो, तो इसे किसी इंसान या ज़्यादा मज़बूत मॉडल की ओर भेजें — यह *विश्वास-आधारित रूटिंग* (confidence-gated routing) का पैटर्न है।

## कई विकल्पों वाला सवाल {#multiple-choice}

क्या एक साथ कई विकल्प लागू हो सकते हैं? `selectMany` हर विकल्प को उसके अपने हाँ/ना सवाल में बदल देता है, उन्हें **एक ही अनुरोध में** भेजता है, और आपका सीमा-मान लागू करता है:

```ts
const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export', 'cancellation'],
  threshold: 0.5,
});
// { selected: ['double charge', 'broken export'], probabilities: { … } }
```

## हाँ / ना और रेटिंग {#yes-no-and-ratings}

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

## कई सवाल, एक अनुरोध {#many-questions-one-request}

Jev संदर्भ को एक बार पढ़ता है और हर सवाल का जवाब समानांतर देता है। `noul`, `choice` और `score` helpers के साथ `ask` इस्तेमाल करें — उत्तरों के टाइप अपने-आप निकल आते हैं:

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

## संज्ञानात्मक एजेंटों के अंदर {#inside-cognitive-agents}

निर्णय backend कॉन्फ़िगर होने पर, संज्ञानात्मक एजेंट उसे अपने-आप इस्तेमाल करते हैं:

- **कंट्रोलर** — हर कदम पर, एक अनुरोध पूछता है कि कौन-सा उपलब्ध ऑपरेशन अगला है (Choice) और क्या तर्क निर्णय के लिए तैयार है (Noul);
- **तुलना** — `compare` एक अनुरोध में हर परिकल्पना का साक्ष्य-समर्थन पूछता है, विचारक की प्रोफ़ाइल के **बिना**, फिर, सिर्फ़ प्रस्तावों के लिए, एक दूसरे अनुरोध में विचारक से उनका मेल। दोनों अंक अलग रखे जाते हैं: मेल प्रस्तावों का क्रम बदलता है (`limits.preferenceWeight`, डिफ़ॉल्ट रूप से 0.4) और विचारक को साफ़ तौर पर पसंद आने वाले प्रस्ताव को विश्वसनीय साक्ष्य पर पक्का होने देता है (`limits.minProposalSupport`), किसी दावे की विश्वसनीयता को कभी नहीं — देखें [साक्ष्य और सत्यापन](./evidence-and-verification#evidence-is-not-preference)।

जब Jev अनिश्चित हो या उपलब्ध न हो, तो दोनों LLM या ह्यूरिस्टिक कंट्रोलर पर लौट आते हैं।

## ट्रेसबिलिटी और लागत {#traceability-and-cost}

हर टाइप्ड निर्णय अपने संदर्भ, सवालों, उत्तरों और token उपयोग के साथ एक `decision.evaluated` इवेंट के रूप में लिखा जाता है — आपके दिए `runId` में, या एक अलग `decision_*` स्ट्रीम में। Jev की कीमत **$0.042 प्रति मिलियन इनपुट tokens है, आउटपुट मुफ़्त** (2026-09-23 को दस्तावेज़ों के अनुसार), इसलिए `sdk.getRunCost(runId)` इसे शुरू से ही शामिल करता है। हर निर्णय अवधि वाले बजट में भी गिना जाता है — उस `agentId` के लिए जिसका वह नाम लेता है, और उन सीमाओं में जो किसी एजेंट का नाम नहीं लेतीं — और कोई बजट उसे कभी नहीं ठुकराता (देखें [API लागत](./costs#budgets))।

जो उत्तर सवालों से मेल नहीं खाता (ऐसा चुनाव जो विकल्पों में नहीं है, कोई गायब या गलत टाइप का उत्तर), उसका बिल फिर भी बना है: वह भी `error` और खाली `answers` के साथ दर्ज होता है, और उसके बाद error फेंका जाता है। जब backend tokens की कोई गिनती नहीं बताता, तो इवेंट में `usage` नहीं होता और कॉल की लागत अज्ञात बताई जाती है, कभी $0 नहीं — देखें [API लागत](./costs#unknown-costs)।

## अच्छे तरीके {#good-practice}

Jev शब्दशः पढ़ता है और गणित, गिनती और तारीखों की तुलना में कमज़ोर है। संख्याओं को कोड में रखें, एक बार में एक ही छोटा, अलग सवाल पूछें, ऐसे मानदंड लिखें जो हर विकल्प का सटीक वर्णन करें, और संदर्भ को उतना ही रखें जितना सवाल को चाहिए। TypeSafe की [ज्ञात सीमाएँ](https://docs.typesafe.ai/model-jaggedness/jev-1.13) देखें।
