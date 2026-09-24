# API लागत

SDK मॉडल की हर कॉल का token उपयोग **उसी run में दर्ज करता है जिसने वह कॉल की** — टूल का चुनाव, संज्ञानात्मक विचार और टाइप्ड निर्णय — और हर मॉडल के हिसाब से उसकी कीमत निकालता है।

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

## कीमतें {#prices}

LLM की कीमतें अक्सर बदलती हैं और आपके अनुबंध पर निर्भर करती हैं, इसलिए वे **कॉन्फ़िगरेशन हैं, कोड नहीं**। डिफ़ॉल्ट के रूप में सिर्फ़ वही कीमतें आती हैं जिन्हें विक्रेता के दस्तावेज़ों से सत्यापित किया गया है — आज, Jev ($0.042 प्रति मिलियन इनपुट tokens, आउटपुट मुफ़्त, 2026-09-23 को जाँचा गया), उसके TypeSafe ids (`jev-*`) के तहत भी और Vercel AI Gateway (`typesafe-ai/jev`) के ज़रिए भी।

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

Keys सटीक मॉडल ids होते हैं या `*` पर खत्म होने वाले prefixes। प्रदाता अक्सर वर्ज़न वाले id (`gpt-4o-2024-08-06`) के साथ जवाब देते हैं, जबकि आपने `gpt-4o` माँगा था: SDK दोनों दर्ज करता है और पहले लौटाया गया id ढूँढता है, फिर माँगा गया नाम — prefixes से पहले सटीक keys, और सबसे लंबा prefix जीतता है। prefixes के साथ सावधान रहें: `gpt-4o*` `gpt-4o-mini` से भी मेल खाता है, जब तक `gpt-4o-mini*` मौजूद न हो।

जिस मॉडल की कोई कीमत नहीं है, वह भी गिना जाता है (कॉल और tokens) और `unpricedModels` में सूचीबद्ध होता है, और रिपोर्ट `complete: false` चिह्नित होती है — SDK कभी कोई कीमत गढ़ता नहीं।

## उपयोग का हिसाब कहाँ से आता है {#where-usage-comes-from}

| इवेंट | स्रोत | फ़ील्ड |
| --- | --- | --- |
| `intention.generated` | मूल तर्क, टूल का चुनाव | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `cognition.thought` | संज्ञानात्मक ऑपरेशन, सुधार और विफल प्रयासों सहित | `model`, `requestedModel`, `usage.calls` |
| `decision.evaluated` | Jev और दूसरे टाइप्ड-निर्णय backends | `model`, `usage.inputTokens`, `usage.outputTokens` |

क्योंकि उपयोग इवेंट्स में रहता है, आप `computeRunCost(runId, events, pricing)` से खुद भी लागत निकाल सकते हैं, उसे हर एजेंट या हर दिन के हिसाब से जोड़ सकते हैं, या उसे अपनी बिलिंग में भेज सकते हैं।

## बजट {#budgets}

लागत सिर्फ़ एक पहलू है; नीतियाँ हर एजेंट, टूल और अवधि के लिए **कदमों, tokens और टूल कॉल** की सीमा भी तय कर सकती हैं — देखें [नियंत्रित एजेंट](./governed-agents)। संज्ञानात्मक एजेंटों की अपनी सीमाएँ होती हैं (`maxSteps`, `maxToolCalls`, `timeoutMs`)। `maxCost` वाला `budgetLimit`, ऊपर की कीमतों के हिसाब से, किसी नियंत्रित एजेंट की मॉडल कॉल का खर्च अवधि में सीमा से ऊपर जाते ही उसकी टूल कॉल ठुकरा देता है: मॉडल कॉल ख़ुद कभी नहीं ठुकराई जाती, और `toolName` के साथ सिर्फ़ वही टूल ठुकराया जाता है। अगर किसी मॉडल की कीमत नहीं है, या कोई कॉल अपने टोकन नहीं बताती, तो सीमा जाँची नहीं जा सकती और टूल कॉल ठुकरा दी जाती हैं। जो `maxCost` 0 या उससे बड़ी परिमित संख्या नहीं है (जैसे कॉन्फ़िग फ़ाइल से पढ़ी गई स्ट्रिंग `'0.5'`, `NaN`, ऋणात्मक राशि, `Infinity`, `null`), उसे नीति लागू होते समय ही `ValidationError` के साथ अस्वीकार कर दिया जाता है। `agentId` वाली सीमा उसी एजेंट की मॉडल कॉल गिनती है; बिना `agentId` वाली सीमा सभी नियंत्रित एजेंटों की मॉडल कॉल गिनती है।
