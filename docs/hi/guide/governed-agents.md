# नियंत्रित एजेंट

एक नियंत्रित एजेंट पारंपरिक टूल-कॉलिंग चक्र चलाता है — एक फ़र्क के साथ: **LLM सिर्फ़ इरादे प्रस्तावित करता है**। कुछ भी होने से पहले एक्शन इंजन हर इरादे को स्कीमा और नीतियों के सामने सत्यापित करता है, और हर कदम दर्ज करता है। यह पेज टूल, क्षमताएँ, नीतियाँ, ट्रेस, रीप्ले और किसी run को रोकने के बारे में बताता है।

::: tip कार्रवाई से पहले तर्क
खुले सिरे वाले निर्णयों के लिए [संज्ञानात्मक एजेंट](./cognitive-agents) को तरजीह दें: वे वही टूल, नीतियाँ और ट्रेस साझा करते हैं।
:::

## पहले से ज़रूरी चीज़ें {#prerequisites}

- Node.js 20+ इंस्टॉल हो
- OpenAI API key (या कोई दूसरा LLM प्रदाता)
- TypeScript/JavaScript की बुनियादी जानकारी

## इंस्टॉलेशन {#installation}

```bash
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## 5 मिनट में पहला एजेंट {#first-agent-in-5-minutes}

### कदम 1: SDK शुरू करें {#step-1-initialize-the-sdk}

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### कदम 2: एक टूल परिभाषित करें {#step-2-define-a-tool}

टूल एक ऐसी क्षमता है जिसे एजेंट इस्तेमाल कर सकता है। इसे स्पष्ट रूप से घोषित करना ज़रूरी है।

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

### कदम 3: एक एजेंट बनाएँ {#step-3-create-an-agent}

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
});
```

### कदम 4: एजेंट चलाएँ {#step-4-run-the-agent}

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // Unique UUID for this execution
```

### कदम 5: ट्रेस देखें {#step-5-view-the-trace}

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

## पूरा उदाहरण (10 लाइनें) {#complete-example-10-lines}

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

## मुख्य अवधारणाएँ {#key-concepts}

### 1. टूल {#_1-tools}

टूल ही वे एकमात्र कार्रवाइयाँ हैं जो एजेंट कर सकता है। **डिफ़ॉल्ट रूप से किसी भी चीज़ की अनुमति नहीं है** (deny-by-default): किसी टूल को कोई चला सके, इससे पहले उसका रजिस्टर होना ज़रूरी है।

::: warning नियंत्रित एजेंट का दायरा
एक नियंत्रित एजेंट **SDK में रजिस्टर किया गया कोई भी टूल** चला सकता है जिसका नाम मॉडल ले: एजेंट की `tools` सूची यह तय करती है कि मॉडल को क्या पेश किया जाता है, यह नहीं कि वह क्या कॉल कर सकता है। इसे एक `allowlist` नीति से सीमित करें — कोई भी दूसरा टूल चलने से पहले ही मना कर दिया जाता है:

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

संज्ञानात्मक एजेंट और MCP सर्वर अपने-आप अपनी टूल-सूची तक सीमित रहते हैं।
:::

**विशेषताएँ:**
- Zod स्कीमा के साथ स्पष्ट परिभाषा
- इनपुट का अपने-आप सत्यापन
- वर्ज़निंग समर्थित
- पूरी ट्रेसबिलिटी

**उदाहरण:**
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

### 2. क्षमताएँ {#_2-capabilities}

क्षमताओं से आप टूल को तार्किक रूप से समूहों में रख सकते हैं और उन्हें दोबारा इस्तेमाल कर सकते हैं।

**उदाहरण:**
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

### 3. नीतियाँ {#_3-policies}

नीतियाँ नियंत्रित करती हैं कि एजेंट क्या कर सकता है।

**नीतियों के प्रकार:**
- **Budget (बजट)**: कदमों या tokens की सीमा
- **Timeout (समय-सीमा)**: चलने की अधिकतम अवधि
- **Allowlist (अनुमति-सूची)**: अनुमति वाले टूल की सूची
- **Custom (अपनी)**: आपका अपना सत्यापनकर्ता

**उदाहरण:**
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

बजट और समय की सीमाएँ किसी नियंत्रित एजेंट के रन में हर टूल कॉल से पहले, उस रन की प्रगति के आधार पर जाँची जाती हैं: `maxSteps` पूरे हो चुके चरण गिनता है (पहली कॉल चरण 0 पर होती है), `maxTokens` मॉडल कॉल में लगे टोकन, और `maxDuration` रन शुरू होने के बाद बीता समय। सीमा टूल कॉल को ठुकरा देती है, जिससे रन विफल हो जाता है; वह कभी किसी मॉडल कॉल को बीच में नहीं रोकती। अवधि के हिसाब से टोकन और लागत बजट (`maxTokens` या `maxCost` के साथ `budgetLimit`) नियंत्रित एजेंटों की मॉडल कॉल के टोकन और लागत गिनते हैं, और रीप्ले भी `maxSteps`, `maxTokens` और `maxDuration` को मूल रन की तरह लागू करता है (अवधि वाले बजट मौजूदा अवधि की खपत देखते हैं)। संज्ञानात्मक एजेंटों की अपनी सीमाएँ हैं (`maxSteps`, `maxToolCalls`, `timeoutMs`)। नीति लागू होते समय (`defineGlobalPolicy`, एजेंट की `policies`) जाँची जाती है: `maxSteps`, `maxTokens` या `maxDuration` का मान 0 से बड़ी संख्या होना चाहिए, और `budgetLimit` को एक `period` और कम से कम एक सीमा (`maxTokens`, `maxToolCalls`, `maxCost`) चाहिए, हर एक 0 या उससे बड़ी संख्या (0 कुछ भी अनुमति नहीं देता)। कोई भी दूसरा मान, जैसे कॉन्फ़िग फ़ाइल से पढ़ी गई स्ट्रिंग (`'10'`), `NaN` या ऋणात्मक संख्या, फ़ील्ड का नाम बताने वाली `ValidationError` फेंकता है।

### 4. ट्रेस {#_4-traces}

हर execution एक पूरा, रीप्ले करने योग्य ट्रेस बनाता है।

**ट्रेस पाएँ:**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**ट्रेस एक्सपोर्ट करें:**
```typescript
// Text format
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// JSON format
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. रीप्ले {#_5-replay}

LLM से दोबारा संपर्क किए बिना किसी execution को रीप्ले करें।

**सीधा रीप्ले:**
```typescript
const replayResult = await sdk.replay(runId);
```

**बदलावों के साथ रीप्ले:**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. Execution रोकना {#_6-stopping-execution}

चल रहे execution को रोकें।

**एजेंट से:**
```typescript
await agent.stop(runId); // Stop a specific run
await agent.stop(); // Stop all runs of this agent
```

**SDK से:**
```typescript
await sdk.stopRun(runId);
```

## आम कार्य-प्रवाह {#typical-workflow}

1. अपनी API key के साथ **SDK शुरू करें**
2. अपने उपयोग के लिए ज़रूरी **टूल परिभाषित करें**
3. **क्षमताएँ बनाएँ** (वैकल्पिक, व्यवस्था के लिए)
4. नियंत्रण के लिए **नीतियाँ कॉन्फ़िगर करें**
5. टूल और नीतियों के साथ **एजेंट बनाएँ**
6. किसी इनपुट के साथ **एजेंट चलाएँ**
7. क्या हुआ यह समझने के लिए **ट्रेस का विश्लेषण करें**
8. डीबगिंग के लिए **ज़रूरत हो तो रीप्ले करें**

## अच्छे तरीके {#best-practices}

### टूल {#tools}
- ✅ सख़्त Zod स्कीमा इस्तेमाल करें
- ✅ हर टूल को साफ़-साफ़ डॉक्यूमेंट करें
- ✅ errors को ठीक से सँभालें
- ✅ टूल बदलने पर उनका वर्ज़न बदलें

### नीतियाँ {#policies}
- ✅ उचित बजट लागू करें
- ✅ सख़्त अनुमति-सूचियाँ इस्तेमाल करें
- ✅ production से पहले नीतियों को टेस्ट करें
- ✅ नीतियों को डॉक्यूमेंट करें

### क्षमताएँ {#capabilities}
- ✅ टूल को तार्किक रूप से समूहों में रखें
- ✅ क्षमताओं को कई एजेंटों में दोबारा इस्तेमाल करें
- ✅ क्षमताओं को डॉक्यूमेंट करें

### सुरक्षा {#security}
- ✅ **डिफ़ॉल्ट रूप से मना**: कोई भी अघोषित टूल चलाया नहीं जा सकता
- ✅ सत्यापन: सभी इनपुट Zod से सत्यापित होते हैं
- ✅ नीतियाँ: हर कार्रवाई से पहले जाँची जाती हैं
- ✅ ट्रेसबिलिटी: सभी कार्रवाइयाँ ट्रेस होती हैं

## उदाहरण {#examples}

### न्यूनतम उदाहरण {#minimal-example}
देखें [`examples/quick-start.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts)

### पूरा उदाहरण {#complete-example}
सभी सुविधाओं के लिए देखें [`examples/complete-example.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts)

## अगले कदम {#next-steps}

- 📚 [मुख्य अवधारणाएँ](./concepts) - आर्किटेक्चर को समझें
- 🏗️ [आर्किटेक्चर](../reference/architecture) - तकनीकी विवरण
- 📖 [SDK API](../reference/sdk-api) - हर विकल्प और method

## सहायता {#support}

- दस्तावेज़: `docs/`
- उदाहरण: `examples/`
- समस्याएँ: GitHub Issues

## समस्या-समाधान {#troubleshooting}

### त्रुटि: "Tool not found" {#error-tool-not-found}
→ पक्का करें कि किसी एजेंट में इस्तेमाल करने से पहले आपने टूल को `defineTool()` से रजिस्टर किया है।

### त्रुटि: "Policy violation" {#error-policy-violation}
→ अपनी नीतियाँ (बजट, timeout, अनुमति-सूची) जाँचें।

### त्रुटि: "Run cancelled" {#error-run-cancelled}
→ execution रोक दिया गया था। कारण देखने के लिए `getTrace()` से जाँचें।

### खाली ट्रेस {#empty-traces}
→ जाँचें कि इवेंट स्टोर ठीक से काम कर रहा है और इवेंट सहेजे जा रहे हैं।

## पहले एजेंट तक का समय {#time-to-first-agent}

**MVP लक्ष्य:** < 30 मिनट

**अनुमानित समय:**
- इंस्टॉलेशन: 2 मिनट
- पहला टूल: 5 मिनट
- पहला एजेंट: 3 मिनट
- पहला execution: 5 मिनट
- ट्रेस समझना: 10 मिनट
- **कुल: ~25 मिनट** ✅
