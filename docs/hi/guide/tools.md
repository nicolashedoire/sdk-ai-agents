# टूल

**टूल** एक फ़ंक्शन है जिसे एजेंट कॉल कर सकता है: कोई ऑर्डर देखना, कोई फ़ाइल पढ़ना, वेब पर खोजना, किसी दूसरे एजेंट से पूछना। आप अपने टूल खुद लिखते हैं, या उन्हें किसी **टूल स्रोत** से पहले से तैयार लेते हैं: एक फ़ोल्डर, एक डेटाबेस, एक वेब API, वेब, एक एजेंट या एक MCP सर्वर।

टूल कहीं से भी आया हो, हर कॉल **नियंत्रित** होती है। कॉल किया गया टूल कॉल करने वाले के टूल में से एक होना चाहिए, उसके arguments जाँचे जाते हैं, नीतियाँ और बजट लागू होते हैं, किसी इंसान से उसे मंज़ूरी देने के लिए कहा जा सकता है, विफलताओं पर दोबारा प्रयास हो सकता है, और सब कुछ इवेंट लॉग में लिखा जाता है।

## एक लाइन में {#in-one-line}

```ts
import { createSDK, folderTools, webTools } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });

const tools = [...folderTools({ root: './handbook' }), ...webTools()].map((definition) =>
  sdk.defineTool(definition)
);

const agent = sdk.createAgent({ name: 'helpdesk', model: 'gpt-5.4', tools });
```

अब एजेंट हैंडबुक की फ़ाइलों की सूची देख सकता है, उन्हें पढ़ और खोज सकता है, और वेब पर खोज सकता है और उसे पढ़ सकता है: आठ टूल, सभी केवल-पढ़ने-योग्य।

## आपके अपने टूल {#your-own-tools}

`sdk.defineTool` SDK में एक टूल रजिस्टर करता है और उसे लौटाता है। zod स्कीमा arguments का वर्णन करता है; handler उन्हें सत्यापित और टाइप्ड रूप में पाता है।

```ts
import { z } from 'zod';

const lookupOrder = sdk.defineTool({
  name: 'lookup_order',
  description: 'Reads an order: status, items, amount.',
  schema: z.object({ orderId: z.string().describe('For example "o-1042"') }),
  handler: async ({ orderId }) => orders.get(orderId),
  metadata: { riskLevel: 'low', readOnly: true },
  retry: { maxRetries: 2 },
});

const refundOrder = sdk.defineTool({
  name: 'refund_order',
  description: 'Refunds an order. Only when the customer asked for a refund.',
  schema: z.object({ orderId: z.string(), amount: z.number().positive() }),
  handler: async ({ orderId, amount }, context) => payments.refund(orderId, amount, { signal: context?.signal }),
  metadata: { riskLevel: 'high', requiresApproval: true },
  version: '1.1.0',
});
```

| फ़ील्ड | |
| --- | --- |
| `name`, `description` | मॉडल जो देखता है और जिसके आधार पर निर्णय लेता है। अक्षर, अंक, `_` और `-` इस्तेमाल करें, 64 अक्षरों तक: मॉडल API और MCP क्लाइंट दूसरे नाम ठुकरा सकते हैं। |
| `schema` | arguments, एक zod स्कीमा के रूप में; `.describe()` के टेक्स्ट मॉडल को दिखाए जाते हैं। मेल न खाने वाली कॉल किसी भी दूसरी चीज़ से पहले ठुकरा दी जाती है। |
| `handler(params, context?)` | आपका कोड। `context` में `runId`, `agentId` और `signal` होते हैं; `signal` तब abort हो जाता है जब कॉल करने वाला हार मान ले। |
| `metadata` | `riskLevel` (`low`, `medium`, `high`), `requiresApproval`, `readOnly`, `category`: देखें [कॉल कैसे नियंत्रित होती हैं](#how-calls-are-governed)। डिफ़ॉल्ट रूप से कोई नहीं। |
| `retry` | `{ maxRetries, initialDelayMs? (200), maxDelayMs? (5,000), retryOn? }`, सिर्फ़ idempotent टूल के लिए। |
| `version` | डिफ़ॉल्ट रूप से `1.0.0`। यह एजेंट के कॉन्फ़िगरेशन hash का हिस्सा है, इसलिए किसी बदलाव से पहले और बाद के runs की [तुलना](../reference/sdk-api#comparisons-and-impact) की जा सकती है। |
| `capability` | समूह बनाने के लिए एक लेबल; बिल्ट-इन स्रोत एक लेबल सेट करते हैं (`web:search`, `folder:handbook`…)। |

एक नाम हर SDK में एक ही बार रजिस्टर होता है: जो नाम पहले से लिया जा चुका हो, उसके लिए `sdk.defineTool` error फेंकता है, वर्ज़न चाहे जो हो। जब दो स्रोतों के नाम टकरा सकते हों, तो हर स्रोत को एक prefix दें। हर फ़ील्ड [SDK API](../reference/sdk-api#tools-tooldefinition) में है।

## बिल्ट-इन टूल स्रोत {#the-built-in-tool-sources}

हर स्रोत टूल परिभाषाएँ लौटाता है, जो `sdk.defineTool` के लिए तैयार होती हैं (`connectMcpServer` उन्हें अपने `tools` में लौटाता है)। हर स्रोत अपने टूल के नाम बदल सकता है: एक prefix से (`prefix`; MCP के लिए `toolPrefix`), या किसी एजेंट के टूल का पूरा नाम देकर (`name`)।

| स्रोत | एजेंट क्या कर सकता है | टूल के नाम | जोखिम, केवल-पढ़ने-योग्य | ज़रूरत | विवरण |
| --- | --- | --- | --- | --- | --- |
| `folderTools({ root })` | किसी एक फ़ोल्डर की टेक्स्ट फ़ाइलों की सूची देखना, उन्हें पढ़ना और उनमें खोजना, उस फ़ोल्डर के बाहर कभी नहीं | `list_files`, `read_file`, `search_files` | कम, केवल-पढ़ने-योग्य | एक फ़ोल्डर | [दस्तावेज़ों का एक फ़ोल्डर](./mcp-recipes#a-folder-of-documents) |
| `databaseTools({ database })` | टेबलों की सूची देखना, किसी एक का विवरण देखना, एक `SELECT` चलाना (डिफ़ॉल्ट रूप से 100 पंक्तियाँ) | `list_tables`, `describe_table`, `query` | मध्यम, केवल-पढ़ने-योग्य | `sqliteReadOnly(db)` (`node:sqlite` या `better-sqlite3`) या `postgresReadOnly({ pool })` (`pg`) | [एक केवल-पढ़ने-योग्य डेटाबेस](./mcp-recipes#a-read-only-database) |
| `await openApiTools({ spec })` | किसी वेब API को कॉल करना, हर operation के लिए एक टूल; `include` में सूचीबद्ध न हो तो सिर्फ़ `GET` | `operationId`, वह न हो तो method और path (`get_pets_petId`) | `GET`: कम, केवल-पढ़ने-योग्य। बाकी: उच्च, मंज़ूरी ज़रूरी | एक OpenAPI 3 विवरण (URL, फ़ाइल या ऑब्जेक्ट) | [एक वेब API](./mcp-recipes#a-web-api-from-its-openapi-description) |
| `webTools()` | वेब पर खोजना, कोई पेज या PDF पढ़ना, arXiv, Wikipedia और GitHub में खोजना | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` | `web_fetch` मध्यम, बाकी कम; सभी केवल-पढ़ने-योग्य | शुरू करने के लिए कुछ नहीं (DuckDuckGo); PDF के लिए `unpdf`; code खोजने के लिए एक GitHub token | [वेब पर शोध](./web-research) |
| `governedAgentTool(agent)`, `cognitiveAgentTool(agent)` | किसी दूसरे एजेंट से पूछना: नियंत्रित एजेंट किसी `message` का जवाब देता है, संज्ञानात्मक एजेंट किसी `problem` पर तर्क करता है और अपना निर्णय लौटाता है | `ask_<agent name>` | मध्यम, केवल-पढ़ने-योग्य चिह्नित नहीं | एक एजेंट, इसलिए एक मॉडल key | [एक एजेंट](./mcp-recipes#an-agent-your-reasoning-twin) |
| `await connectMcpServer({ name, transport })` | किसी भी MCP सर्वर के टूल इस्तेमाल करना | सर्वर के नाम, `toolPrefix` के बाद | कुछ भी सेट नहीं: `metadata` हर इम्पोर्ट किए गए टूल पर लागू होता है | `@sdk-ai-agents/core/mcp` और `@modelcontextprotocol/sdk`; काम पूरा होने पर `close()` | [किसी MCP सर्वर के टूल इस्तेमाल करें](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) |

MCP टूल के लिए दो बातें अलग हैं: SDK सिर्फ़ यह जाँचता है कि उनके arguments एक ऑब्जेक्ट हों (बाकी की जाँच सर्वर करता है), और सर्वर के अपने संकेत, जैसे केवल-पढ़ने-योग्य होना, इम्पोर्ट नहीं किए जाते: `metadata` खुद सेट करें।

## एजेंट को टूल देना {#giving-tools-to-an-agent}

`createAgent({ tools })` और `createCognitiveAgent({ tools })` टूल लेते हैं, इसलिए किसी स्रोत की परिभाषाओं को पहले `sdk.defineTool` से गुज़ारें, जैसा ऊपर किया गया है। एजेंट **सिर्फ़ अपने टूल** चला सकता है, यानी `tools` के टूल और उसकी `capabilities` के टूल: मॉडल जिस किसी दूसरे टूल का नाम ले, वह ठुकरा दिया जाता है (`allowed-tools`)।

```ts
const support = sdk.createAgent({
  name: 'support',
  model: 'gpt-5.4',
  tools: [lookupOrder, refundOrder, ...tools], // your tools and those of the sources above
});
```

पैकेज से इम्पोर्ट किया गया `defineTool` टूल को रजिस्टर किए बिना बनाता है: SDK उसे तब रजिस्टर करता है जब उसे इस्तेमाल करने वाला कोई एजेंट बनाया जाता है। अगर उस नाम का कोई टूल पहले से रजिस्टर है, तो रजिस्टर वाला टूल ही रखा जाता है और वही चलता है।

### क्षमताएँ {#capabilities}

क्षमता टूल के एक समूह को एक नाम देती है, ताकि उसे कई एजेंटों को दिया जा सके। किसी टूल का `capability` लेबल क्षमता नहीं है: क्षमता को `sdk.defineCapability` से परिभाषित करें।

```ts
sdk.defineCapability({
  name: 'handbook',
  description: 'Read the team handbook',
  tools: folderTools({ root: './handbook', prefix: 'handbook_' }).map((tool) => sdk.defineTool(tool).name),
});

const onboarding = sdk.createAgent({ name: 'onboarding', model: 'gpt-5.4', capabilities: ['handbook'] });
```

### किसी एजेंट के बाहर {#outside-an-agent}

`sdk.listTools()` SDK में रजिस्टर हर टूल लौटाता है। `sdk.executeTool(name, parameters, options?)` उनमें से एक को उसी नियंत्रित पाइपलाइन से होकर कॉल करता है, एक अलग run के रूप में (एजेंट id `external`, जब तक आप `agentId` न दें), और वही लौटाता है जो handler ने लौटाया:

```ts
const order = await sdk.executeTool('lookup_order', { orderId: 'o-1042' }, { agentId: 'backoffice' });
```

इसके विकल्प: `runId` कॉल को किसी मौजूदा run के भीतर दर्ज करता है, `allowedTools` सीमित करता है कि यह कॉल करने वाला क्या चला सकता है, `signal` कॉल को रद्द करता है, `approvalTimeoutMs` मंज़ूरी के इंतज़ार की सीमा तय करता है, और `onEvent` कॉल को लाइव देखता है। अस्वीकृति पर `PolicyViolationError` फेंका जाता है; अमान्य arguments और विफल होने वाले handler पर `ToolExecutionError`।

यही टूल दूसरी जगहों पर भी काम आते हैं। कोई [अध्ययन](./studies#research-through-your-sources) परिभाषित टूल के **नाम** अपने `sources` के रूप में लेता है, और कोई MCP सर्वर आपकी दी हुई परिभाषाएँ या नाम Claude Desktop, Claude Code या किसी भी MCP क्लाइंट को सर्व करता है (देखें [किसी भी चीज़ के लिए MCP सर्वर](./mcp-recipes))।

## कॉल कैसे नियंत्रित होती हैं {#how-calls-are-governed}

एक कॉल इन कदमों से, इसी क्रम में, गुज़रती है, और पहली अस्वीकृति पर रुक जाती है:

1. **कॉल करने वाले के टूल।** जो टूल कॉल करने वाले को दिया नहीं गया, वह ठुकरा दिया जाता है: किसी एजेंट के टूल, किसी अध्ययन के स्रोत, किसी MCP सर्वर की सूची, या `allowedTools`। `allowedTools` के बिना `executeTool` कोई भी रजिस्टर टूल चला सकता है।
2. **arguments**, जो स्कीमा के सामने जाँचे जाते हैं, किसी से कुछ भी पूछे जाने से पहले।
3. **नीतियाँ**: हर ग्लोबल नीति और एजेंट की हर नीति (देखें [नियंत्रित एजेंट](./governed-agents#_3-policies))।
4. **मंज़ूरी**, जब टूल या कोई नीति इसकी माँग करे।
5. **बजट**: कॉल शुरू होते ही गिन ली जाती है, उसका नतीजा चाहे जो हो।
6. **टूल चलता है**, अपने दोबारा प्रयासों के साथ।

### जोखिम स्तर {#risk-levels}

`riskLevel` एक लेबल है: यह लोगों और कोड को बताता है कि कितनी सावधानी बरतनी है। **कोई नीति इसे नहीं पढ़ती**, और यह किसी कॉल को न रोकता है, न धीमा करता है। इसके आधार पर कुछ करने के लिए, टूल को `requiresApproval` दें, या लेबल को एक नीति में बदलें:

```ts
const highRisk = sdk
  .listTools()
  .filter((tool) => tool.metadata?.riskLevel === 'high')
  .map((tool) => tool.name);

sdk.defineGlobalPolicy({
  id: 'approve-high-risk',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: { type: 'condition', conditions: [{ field: 'intention.toolName', operator: 'in', value: highRisk }] },
      action: 'require_approval',
    },
  ],
});
```

सूची उसी समय ली जाती है जब नीति परिभाषित होती है: इसलिए पहले टूल परिभाषित करें।

### मंज़ूरियाँ {#approvals}

कोई कॉल किसी इंसान का इंतज़ार करती है जब टूल में `requiresApproval: true` हो (लिखने वाले operations के लिए `openApiTools` का डिफ़ॉल्ट) या किसी नीति का नियम `require_approval` कहे। वह `sdk.getPendingApprovals()` में दिखती है; `sdk.approveAction(id, who, reason?)` उसे चलने देता है, `sdk.rejectAction(id, who, reason?)` उसे ठुकरा देता है। अगर कॉल करने वाला पहले ही हार मान ले (रोका गया run, abort हुआ `signal`, `approvalTimeoutMs`, जो MCP सर्वरों पर डिफ़ॉल्ट रूप से 50 s है), तो मंज़ूरी रद्द हो जाती है और टूल कभी नहीं चलता। देखें [मंज़ूरियाँ](./mcp-deploy#approvals-a-human-says-yes-first)।

### केवल-पढ़ने-योग्य टूल {#read-only-tools}

`readOnly: true` कहता है कि टूल कुछ नहीं बदलता। MCP क्लाइंट इसे `readOnlyHint` के रूप में देखते हैं, और `openApiTools` सिर्फ़ केवल-पढ़ने-योग्य operations पर दोबारा प्रयास करता है। यह कोई नीति ढीली नहीं करता और इसकी जाँच नहीं होती: केवल-पढ़ने-योग्य चिह्नित जो handler लिखता है, वह फिर भी लिखता है। जो स्रोत सिर्फ़ पढ़ते हैं, वे जहाँ संभव हो वहाँ इसे लागू करते हैं: `folderTools` के पास लिखने का कोई तरीका नहीं है, और `sqliteReadOnly` और `postgresReadOnly` हर क्वेरी को खुद डेटाबेस के भीतर केवल-पढ़ने-योग्य रूप में चलाते हैं।

### दोबारा प्रयास {#retries}

`retry` विफल होते handler को फिर से चलाता है: सिर्फ़ handler के errors पर, अमान्य arguments या किसी अस्वीकृति पर कभी नहीं। हर दोबारा प्रयास एक `tool.retry` इवेंट है, और कॉल अपने बजट में एक ही बार गिनी जाती है। `openApiTools`, `webTools` और `connectMcpServer` अपने टूल के लिए एक `retry` विकल्प लेते हैं। देखें [दोबारा प्रयास और फ़ॉलबैक](./resilience#tools)।

### बजट {#budgets}

`budgetLimit` वाली `budget` नीति हर अवधि में टूल कॉल की संख्या सीमित करती है, किसी एक एजेंट (`agentId`), किसी एक टूल (`toolName`) या सभी के लिए:

```ts
sdk.defineGlobalPolicy({
  id: 'web-fetch-daily',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { toolName: 'web_fetch', period: 'day', maxToolCalls: 200 } },
    },
  ],
});
```

`maxTokens` और `maxCost` मॉडल कॉल गिनते हैं, और बजट खर्च हो जाने पर टूल कॉल ठुकरा देते हैं। देखें [API लागत](./costs#budgets)।

### अविश्वसनीय आउटपुट {#untrusted-output}

टूल जो लौटाता है, वह मॉडल के पास वापस जाता है, और किसी पेज, किसी फ़ाइल या किसी API के जवाब में मॉडल के लिए लिखे गए निर्देश हो सकते हैं (prompt injection)। वेब टूल हर जवाब को `untrusted: true` चिह्नित करते हैं, और उनके विवरण मॉडल से कहते हैं कि उसमें मिले निर्देशों का कभी पालन न करे। दूसरे स्रोत अपनी सामग्री जैसी है वैसी लौटाते हैं। system prompt में लिखें कि टूल के परिणाम डेटा हैं, हर एजेंट को सिर्फ़ वही टूल दें जिनकी उसे ज़रूरत है, और चीज़ें बदलने वाले टूल को मंज़ूरियों से सुरक्षित रखें। कोई अध्ययन हर परिणाम को अपने मॉडल के सामने डेटा के रूप में दिखाता है। देखें [वेब टूल के सुरक्षा नियम](./web-research#security-rules)।

### कॉल क्या दर्ज करती है {#what-a-call-records}

| इवेंट | कब |
| --- | --- |
| `action.executing` | कॉल प्रस्तावित होती है, किसी भी जाँच से पहले |
| `policy.checked` | हर जाँची गई नीति, फिर फ़ैसला |
| `policy.violated` | एक अस्वीकृति: ऐसा टूल जो कॉल करने वाले को दिया नहीं गया (`allowed-tools`), कोई नीति, खर्च हो चुका बजट |
| `approval.requested`, `approval.approved`, `approval.rejected` | इंसान का निर्णय |
| `tool.called` | handler शुरू होता है |
| `tool.retry` | एक दोबारा प्रयास, उसकी देरी और error के साथ |
| `action.executed`, `action.failed` | परिणाम या error (अमान्य arguments सहित), अवधि के साथ |

`executeTool` से की गई कॉल अपना एक अलग run होती है, जब तक आप `runId` न दें: `run.started` (मोड `tool`), फिर `run.completed` या `run.failed`। देखें [इवेंट सूची](../reference/events#reasoning-and-actions)।

## स्रोत चुनना {#choosing-a-source}

| मुझे चाहिए… | इस्तेमाल करें |
| --- | --- |
| मेरा अपना कोड या सेवा | `sdk.defineTool` |
| किसी फ़ोल्डर के दस्तावेज़ | `folderTools` |
| किसी SQL डेटाबेस से जवाब, लिखने के किसी भी जोखिम के बिना | `databaseTools`, `sqliteReadOnly` या `postgresReadOnly` के साथ |
| एक वेब API जो OpenAPI विवरण प्रकाशित करता है | `openApiTools` |
| ऐसा वेब API जिसका ऐसा कोई विवरण नहीं है | `sdk.defineTool`, handler में `fetch` के साथ |
| वेब, शोध-पत्र, विश्वकोश के लेख, GitHub पर code | `webTools` |
| किसी दूसरे एजेंट का जवाब या निर्णय | `governedAgentTool` या `cognitiveAgentTool` |
| ऐसा सिस्टम जिसका पहले से एक MCP सर्वर है | `connectMcpServer` |
| किसी अध्ययन के लिए स्रोत | `webTools` के खोज टूल, या किसी MCP सर्वर के खोज टूल |
| Claude Desktop या Claude Code में मेरे टूल | उल्टी दिशा: [एक MCP सर्वर](./mcp-recipes) |
