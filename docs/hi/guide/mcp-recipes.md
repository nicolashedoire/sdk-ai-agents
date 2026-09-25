# किसी भी चीज़ के लिए MCP सर्वर

हर रेसिपी एक तरह के सिस्टम को **एक लाइन में**, सुरक्षित रूप से, MCP सर्वर में बदल देती है। ये सब एक ही तरह काम करती हैं: एक **टूल स्रोत** टूल (और कभी-कभी रिसोर्स) बनाता है, और `serveMcpOverStdio` उन्हें सर्व करता है।

| आप क्या उपलब्ध कराना चाहते हैं | लाइन | मॉडल को मिलने वाले टूल |
| --- | --- | --- |
| [आपका लिखा एक फ़ंक्शन](#a-function) | `sdk.defineTool({ … })` | आपके अपने |
| [एक वेब API](#a-web-api-from-its-openapi-description) | `await openApiTools({ spec: 'https://…/openapi.json' })` | हर operation के लिए एक, डिफ़ॉल्ट रूप से केवल-पढ़ने-योग्य |
| [दस्तावेज़ों का एक फ़ोल्डर](#a-folder-of-documents) | `folderTools({ root: './handbook' })` | `list_files`, `read_file`, `search_files` (+ रिसोर्स) |
| [एक डेटाबेस, केवल-पढ़ने-योग्य](#a-read-only-database) | `databaseTools({ database: sqliteReadOnly(db) })` | `list_tables`, `describe_table`, `query` |
| [एक एजेंट](#an-agent-your-reasoning-twin) | `cognitiveAgentTool(agent)` | `ask_<agent>` |
| [वेब](./web-research) | `webTools()` | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` |

MCP आपके लिए नया है? [5 मिनट में आपका पहला MCP सर्वर](./mcp-first-server) से शुरू करें: यह दिखाता है कि सर्वर कैसे चलाएँ, Inspector से उसे कैसे परखें और उसे Claude Desktop या Claude Code से कैसे जोड़ें। नीचे की हर फ़ाइल इसी तरह चलाई और जोड़ी जाती है।

## हर रेसिपी का साझा ढाँचा {#the-skeleton-every-recipe-shares}

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

// No model key needed unless a recipe uses an agent. The event log goes next to this file.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'my-server',
  tools: [/* ← the recipe goes here */],
});
```

`tools` में **टूल परिभाषाएँ** (जो नीचे के स्रोत लौटाते हैं — SDK उन्हें आपके लिए परिभाषित करता है) और उन टूल के **नाम** दिए जाते हैं जिन्हें आपने खुद `sdk.defineTool` से परिभाषित किया। इसके अलावा कभी कुछ उपलब्ध नहीं होता। `resources` (वैकल्पिक) में दस्तावेज़ देने वाले providers दिए जाते हैं, जिनका इस्तेमाल फ़ोल्डर वाली रेसिपी करती है।

स्रोत चाहे जो हो, हर कॉल इसी क्रम में एक जैसी जाँचों से गुज़रती है — arguments, [नीतियाँ](./mcp-deploy#governance-policies-budgets-approvals), मंज़ूरी, बजट — और इवेंट लॉग में लिखी जाती है। अमान्य कॉल किसी से मंज़ूरी माँगे जाने से पहले ही ठुकरा दी जाती है।

## एक फ़ंक्शन {#a-function}

सबसे सरल स्रोत: आपका लिखा एक फ़ंक्शन, जैसे [पहले सर्वर](./mcp-first-server) में।

```ts
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team',
  schema: z.object({ topic: z.string().describe('For example "billing"') }),
  metadata: { readOnly: true },
  handler: async ({ topic }) => directory.search(topic),
});

await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

| फ़ील्ड | यह किसलिए है |
| --- | --- |
| `name` | मॉडल जिसे कॉल करता है। अक्षर, अंक, `_` और `-` इस्तेमाल करें, 64 अक्षरों तक (MCP क्लाइंट दूसरे नाम ठुकरा सकते हैं)। |
| `description` | टूल कब इस्तेमाल करना है, आसान शब्दों में। मॉडल इसी से निर्णय लेता है। |
| `schema` | arguments, एक zod स्कीमा के रूप में। `.describe()` के टेक्स्ट मॉडल को दिखाए जाते हैं। मेल न खाने वाली कॉल ठुकरा दी जाती हैं। |
| `handler` | आपका कोड। इसे सत्यापित arguments मिलते हैं, और `signal` वाला एक context (जो क्लाइंट के हार मानने पर abort हो जाता है)। |
| `metadata.readOnly` | "यह टूल कुछ नहीं बदलता": क्लाइंट को `readOnlyHint` के रूप में दिखाया जाता है। |
| `metadata.requiresApproval` | हर कॉल किसी इंसान का इंतज़ार करती है (देखें [मंज़ूरियाँ](./mcp-deploy#approvals-a-human-says-yes-first))। |
| `retry` | विफलता पर दोबारा प्रयास, सिर्फ़ idempotent टूल के लिए (`retryOn` सीमित करता है कि किन विफलताओं पर; अमान्य arguments पर कभी दोबारा प्रयास नहीं होता)। |

## एक वेब API, उसके OpenAPI विवरण से {#a-web-api-from-its-openapi-description}

**यह क्या करता है।** कई API अपने endpoints का मशीन द्वारा पढ़ा जा सकने वाला विवरण प्रकाशित करते हैं, जिसे **OpenAPI** दस्तावेज़ कहते हैं (अक्सर `openapi.json`)। `openApiTools` इसे पढ़ता है और **हर operation को एक टूल में** बदल देता है: मॉडल उसका सारांश और उसके पैरामीटर देखता है, और टूल को कॉल करने से API कॉल होता है।

```ts
import { openApiTools } from '@sdk-ai-agents/core';

await serveMcpOverStdio(sdk, {
  name: 'petstore',
  tools: await openApiTools({ spec: 'https://petstore3.swagger.io/api/v3/openapi.json' }),
});
```

**डिफ़ॉल्ट रूप से केवल-पढ़ने-योग्य।** सिर्फ़ `GET` operations टूल बनते हैं। कुछ बदलने वाला operation (`POST`, `PUT`, `PATCH`, `DELETE`) जोड़ने के लिए, उसे उसके `operationId` से सूचीबद्ध करें:

```ts
const tools = await openApiTools({
  spec: './crm-openapi.json',
  headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  include: ['getCustomer', 'listInvoices', 'createNote'], // createNote is a POST
  prefix: 'crm_',
});
```

सूचीबद्ध लिखने वाला operation **उच्च जोखिम** वाला चिह्नित होता है और उसे **मंज़ूरी ज़रूरी** होती है: हर कॉल तब तक इंतज़ार करती है जब तक कोई इंसान उसे मंज़ूरी न दे (देखें [मंज़ूरियाँ](./mcp-deploy#approvals-a-human-says-yes-first))। बिना मंज़ूरी के उस पर भरोसा करने के लिए, यह स्पष्ट रूप से कहें: `metadata: (operation) => (operation.operationId === 'createNote' ? { requiresApproval: false } : undefined)`।

### विकल्प {#options}

| विकल्प | डिफ़ॉल्ट | |
| --- | --- | --- |
| `spec` | — | एक URL (`https://…`), एक फ़ाइल पाथ, या कोई ऑब्जेक्ट जिसे आप पहले ही पार्स कर चुके हों। सिर्फ़ JSON; YAML के लिए, उसे खुद पार्स करें (जैसे `yaml` पैकेज से) और ऑब्जेक्ट दें। |
| `baseUrl` | पहली `servers` प्रविष्टि | अनुरोध कहाँ जाते हैं। सापेक्ष (relative) सर्वर URL को spec के URL के आधार पर हल किया जाता है। |
| `headers` | — | हर अनुरोध में जोड़े जाते हैं (प्रमाणीकरण)। मॉडल को कभी नहीं दिखाए जाते, और किसी भी header argument पर हावी होते हैं। `baseUrl` ज़रूरी है (जब तक spec API के अपने origin से डाउनलोड न हो) और API तथा spec के लिए https (http सिर्फ़ इसी मशीन पर)। |
| `include` | GET operations | उपलब्ध कराने वाले `operationId`। दिए जाने पर यह GET वाले डिफ़ॉल्ट की **जगह ले लेता है**: सिर्फ़ सूचीबद्ध operations टूल बनते हैं। लिखने वाला operation उपलब्ध कराने का यही एकमात्र तरीका है। अज्ञात id एक error है। |
| `exclude` | — | छोड़ने वाले `operationId`। |
| `tags` | — | सिर्फ़ इनमें से किसी tag वाले operations। |
| `prefix` | — | टूल के नामों का prefix (`crm_getCustomer`), कई API को एक साथ जोड़ने के लिए। |
| `metadata` | GET: कम जोखिम, केवल-पढ़ने-योग्य · बाकी: उच्च जोखिम, मंज़ूरी | `(operation) => ToolMetadata`। आपका तय किया हर फ़ील्ड डिफ़ॉल्ट की जगह लेता है; छोड़ा गया फ़ील्ड — या `undefined` — उसे बनाए रखता है, इसलिए सिर्फ़ एक स्पष्ट `requiresApproval: false` ही मंज़ूरी हटाता है। |
| `retry` | — | सिर्फ़ केवल-पढ़ने-योग्य operations (GETs, जब तक `metadata` कुछ और न कहे) के लिए दोबारा प्रयास, सर्वर errors (5xx), 429, timeouts और नेटवर्क विफलताओं पर — 4xx उत्तरों या अमान्य arguments पर कभी नहीं। |
| `timeoutMs` | `30000` | हर अनुरोध के लिए (और spec डाउनलोड करने के लिए)। |
| `maxResponseBytes` | `100000` | ज़्यादा लंबे responses काट दिए जाते हैं और `truncated: true` चिह्नित होते हैं। |
| `maxSpecBytes` | `10000000` | स्वीकार की जाने वाली सबसे बड़ी spec। |
| `fetch` | ग्लोबल `fetch` | आपका अपना HTTP फ़ंक्शन (proxy, टेस्ट)। |

### मॉडल क्या देखता है {#what-the-model-sees}

Petstore के `getPetById` के लिए, क्लाइंट को यह मिलता है:

```json
{
  "name": "getPetById",
  "description": "Find pet by ID\n\nReturns a single pet.\n\n(GET /pet/{petId})",
  "inputSchema": {
    "type": "object",
    "properties": {
      "petId": { "type": "integer", "format": "int64", "description": "ID of pet to return" }
    },
    "required": ["petId"],
    "additionalProperties": false
  },
  "annotations": { "readOnlyHint": true }
}
```

टूल के नाम `operationId` से आते हैं (मान्य बनाए हुए: `show pet!` बन जाता है `show_pet`; बिना operationId वाला operation बन जाता है `get_pets_petId`; डुप्लिकेट को `_2` मिलता है)। arguments सपाट होते हैं: हर path, query और header पैरामीटर के लिए एक, और JSON request body के लिए `body`। कॉल HTTP स्टेटस और पार्स की हुई body लौटाती है:

```json
{ "status": 200, "data": { "id": 10, "name": "doggie", "status": "available" } }
```

### सुरक्षा नियम {#security-rules}

1. **डिफ़ॉल्ट रूप से केवल-पढ़ने-योग्य**: सिर्फ़ `GET`; बाकी सब कुछ `include` में सूचीबद्ध होना चाहिए, और तब उसे मंज़ूरी ज़रूरी होती है, जब तक आप कुछ और न कहें।
2. **मॉडल host नहीं बदल सकता, न ही पाथ में ऊपर जा सकता है।** base URL आपका है। path के मान में `/`, `\` या `.` / `..` खंड नहीं हो सकता — percent-encoded होने पर भी, एक या कई बार, बिगड़े escapes के बगल में हो या नहीं, क्योंकि कुछ सर्वर और proxies `%2F` को decode कर देते हैं — इसलिए `../../admin` ठुकरा दिया जाता है; अंतिम URL की भी जाँच होती है कि वह base URL के नीचे रहे। इन सीमाओं के भीतर मान मॉडल चुनता है: कौन-सा ग्राहक, कौन-सा ऑर्डर।
3. **arguments की जाँच सबसे पहले होती है**: नीतियों और मंज़ूरियों से पहले (अमान्य कॉल कभी किसी इंसान का इंतज़ार नहीं करती), फिर दोबारा तब जब अनुरोध बनाया जाता है। अज्ञात arguments और छूटे हुए ज़रूरी arguments ठुकराए जाते हैं; मान strings, numbers या booleans होने चाहिए (query पैरामीटर के लिए इनकी सूचियाँ); header के मानों में line breaks नहीं हो सकते।
4. **आपके credentials सिर्फ़ वहीं जाते हैं जहाँ आपने तय किया**: `headers` सर्वर जोड़ता है, वे header arguments पर हावी होते हैं, और ऐसी किसी जगह नहीं दिखते जिसे मॉडल पढ़ सके। `headers` के साथ, किसी spec फ़ाइल में नामित सर्वर ठुकरा दिया जाता है — `baseUrl` दें — जब तक spec API के अपने origin से डाउनलोड न हुई हो; और `http:` ठुकरा दिया जाता है, सिवाय इसी मशीन (`localhost`, `127.0.0.1`, `[::1]`) के — API के लिए भी, और spec डाउनलोड करने के लिए भी, क्योंकि रास्ते में बदली गई spec ऐसे operations जोड़ सकती है जिन्हें आपके credentials अधिकृत कर देंगे।
5. **सीमित**: हर अनुरोध का timeout, `maxResponseBytes` पर कटे responses, spec के आकार की सीमा।
6. **Redirects का पालन नहीं होता** (redirect आपका `Authorization` header किसी दूसरी साइट पर ले जा सकता है): `3xx` उत्तर एक error है, और वह redirect भी जिसका पालन किसी कस्टम `fetch` ने फिर भी कर लिया।
7. **Errors, errors ही हैं**: गैर-`2xx` स्टेटस कॉल को स्टेटस और body की शुरुआत के साथ विफल कर देता है। MCP क्लाइंट सिर्फ़ "Tool execution failed" देखते हैं, जब तक आप `exposeErrorDetails: true` सेट न करें (bodies में आंतरिक विवरण हो सकते हैं); इवेंट लॉग में हमेशा पूरा error होता है।
8. **हर GET को केवल-पढ़ने-योग्य घोषित किया जाता है** (`readOnlyHint`)। कुछ API में side effects वाले GETs होते हैं (`GET /send-reminder`): उन्हें `exclude` से छोड़ दें, या उनके लिए `metadata` को `readOnly: false, requiresApproval: true` पर सेट करें।
9. **बड़े विवरण भी सीमित रहते हैं**: `$ref` के विस्तार का हर operation और पूरी spec के लिए एक बजट है, और 64,000 अक्षरों से बड़े टूल स्कीमा की जगह उसके विवरण रख दिए जाते हैं।

### पूरी फ़ाइल {#complete-file}

[`examples/mcp-openapi.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-openapi.ts), इंस्टॉल किए गए पैकेज के imports के साथ:

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK, openApiTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const spec = process.env.OPENAPI_SPEC ?? 'https://petstore3.swagger.io/api/v3/openapi.json';
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

const tools = await openApiTools({
  spec,
  ...(process.env.API_BASE_URL ? { baseUrl: process.env.API_BASE_URL } : {}),
  ...(process.env.API_TOKEN ? { headers: { Authorization: `Bearer ${process.env.API_TOKEN}` } } : {}),
  timeoutMs: 15_000,
});

await serveMcpOverStdio(sdk, { name: 'web-api', tools });
```

token को क्लाइंट के environment के ज़रिए दें, फ़ाइल में कभी नहीं: `claude mcp add web-api -e API_TOKEN=… -- npx -y tsx /path/mcp-openapi.ts`।

### यह क्या नहीं करता {#what-it-does-not-do}

- **सिर्फ़ OpenAPI 3.x**: Swagger 2.0 ठुकरा दिया जाता है (उसे बदलें, जैसे `swagger2openapi` से)। YAML आपके लिए पार्स नहीं होता।
- **सिर्फ़ JSON bodies**: जिस operation को `multipart/form-data` या form body चाहिए, उसे छोड़ दिया जाता है (या अगर आप उसे सूचीबद्ध करें तो ठुकरा दिया जाता है); किसी दूसरे टाइप की वैकल्पिक body पेश नहीं की जाती। Cookie पैरामीटर छोड़ दिए जाते हैं।
- **कोई login flow नहीं**: `headers` में एक token दें; OAuth नहीं सँभाला जाता।
- **सिर्फ़ लोकल references**: दूसरी फ़ाइलों या URLs के `$ref` हल नहीं होते (वे "कोई भी मान" बन जाते हैं); खुद का हवाला देने वाला स्कीमा चक्र पर काट दिया जाता है।
- responses की जाँच spec के सामने नहीं होती, पेजों का पालन नहीं होता, और जब तक आप `baseUrl` न दें, spec का सिर्फ़ पहला सर्वर इस्तेमाल होता है।

## दस्तावेज़ों का एक फ़ोल्डर {#a-folder-of-documents}

**यह क्या करता है।** किसी एक फ़ोल्डर की टेक्स्ट फ़ाइलें देता है — एक हैंडबुक, नोट्स, एक codebase, एक्सपोर्ट किए गए दस्तावेज़ — तीन टूल के साथ: फ़ाइलों की **सूची**, किसी एक को **पढ़ना**, उनमें कोई टेक्स्ट **खोजना**। यही फ़ाइलें **रिसोर्स** के रूप में भी दी जाती हैं, जिन्हें उपयोगकर्ता खुद किसी बातचीत में जोड़ सकते हैं।

```ts
import { folderResources, folderTools } from '@sdk-ai-agents/core';

const handbook = { root: '/Users/you/handbook', exclude: ['drafts/**'] };

await serveMcpOverStdio(sdk, {
  name: 'handbook',
  tools: folderTools(handbook),
  resources: folderResources(handbook),
});
```

### विकल्प {#options-1}

`folderTools` और `folderResources` एक जैसे विकल्प लेते हैं (और टूल के लिए `prefix` भी):

| विकल्प | डिफ़ॉल्ट | |
| --- | --- | --- |
| `root` | — | फ़ोल्डर। absolute पाथ इस्तेमाल करें: क्लाइंट सर्वरों को किसी भी working directory से शुरू करते हैं। |
| `name` | फ़ोल्डर का नाम | विवरणों और रिसोर्स URIs (`folder://<name>/…`) में इस्तेमाल होता है। |
| `prefix` | — | टूल के नामों का prefix (`handbook_read_file`), कई फ़ोल्डर सर्व करने के लिए। |
| `extensions` | टेक्स्ट फ़ॉर्मेट | दिए जाने वाले extensions, बिना बिंदु के (`['md', 'txt']`)। डिफ़ॉल्ट: `md`, `txt`, `csv`, `json`, `yaml`, `html`, सोर्स कोड… (`DEFAULT_TEXT_EXTENSIONS`)। बिना extension वाली फ़ाइलों के लिए `''` जोड़ें। |
| `include` | जो कुछ भी अनुमत है | देने वाली फ़ाइलों के globs: `guide/**`, `**/*.md`। `*` एक फ़ोल्डर के भीतर मेल खाता है, `**` कई फ़ोल्डरों के पार। फ़ोल्डर फिर भी सूचीबद्ध होते हैं, भले ही उनमें कोई मेल खाने वाली फ़ाइल न हो। |
| `exclude` | — | हर जगह छिपाने वाली फ़ाइलों और फ़ोल्डरों के globs: `drafts`, `private/*`, `**/node_modules`। छिपा हुआ फ़ोल्डर अपने अंदर की हर चीज़ छिपा देता है। |
| `includeHidden` | `false` | बिंदु से शुरू होने वाले नाम (`.env`, `.git`…) भी दें। इसे बंद ही रहने दें। |
| `maxFileBytes` | `200000` | एक फ़ाइल से पढ़े जाने वाले bytes; ज़्यादा लंबी फ़ाइलें काट दी जाती हैं (`truncated: true`)। |
| `maxEntries` | `500` | एक सूची में लौटाई जाने वाली प्रविष्टियाँ, रिसोर्स सहित। |
| `maxDepth` | `8` | खोजी जाने वाली सब-फ़ोल्डरों की गहराई। |
| `maxMatches` | `50` | एक खोज में लौटाए जाने वाले मिलान। |
| `maxSearchBytes` | `20000000` | एक खोज में पढ़े जाने वाले bytes, सभी फ़ाइलें मिलाकर। |
| `maxExaminedEntries` | `50000` | एक सूची या खोज में देखे जाने वाले नाम, दिए जाएँ या नहीं; इससे आगे परिणाम `truncated: true` कहता है। |

### मॉडल क्या देखता है {#what-the-model-sees-1}

खोज वाला टूल, छोटा करके:

```json
{ "name": "search_files",
  "description": "Finds the lines of the \"handbook\" folder that contain a text (case-insensitive), with file and line number.",
  "inputSchema": { "type": "object",
    "properties": { "query": { "type": "string", "minLength": 1, "maxLength": 200 },
                    "path": { "type": "string", "description": "Folder to search in; default: everywhere" } },
    "required": ["query"] },
  "annotations": { "readOnlyHint": true } }
```

एक खोज `{ "query": "laptop", "matches": [{ "path": "guide/onboarding.md", "line": 2, "text": "Ask IT for a laptop." }], "filesScanned": 6, "truncated": false }` लौटाती है। पढ़ना `{ "path", "size", "content", "truncated" }` लौटाता है।

**रिसोर्स**: हर फ़ाइल `folder://handbook/guide/onboarding.md` के रूप में उसके आकार और टाइप (`text/markdown`, `text/csv`…) के साथ सूचीबद्ध होती है। रिसोर्स का समर्थन करने वाले एप्लिकेशन उपयोगकर्ता को उन्हें चुनने देते हैं, जैसे किसी attachment मेनू से; कैसे, यह एप्लिकेशन पर निर्भर करता है।

### सुरक्षा नियम {#security-rules-1}

1. **सिर्फ़ सापेक्ष (relative) पाथ**; absolute पाथ ठुकराए जाते हैं।
2. **फ़ोल्डर के बाहर कुछ नहीं**: हर पाथ को उसकी असली जगह तक हल किया जाता है — `..` खंड और symbolic links सहित — और अगर वह फ़ोल्डर से बाहर जाए तो ठुकरा दिया जाता है। पहले देखे जा चुके फ़ोल्डर का link छोड़ दिया जाता है, इसलिए links का चक्र किसी सूची को अटका नहीं सकता।
3. **छिपे नाम अदृश्य हैं**: `.env`, `.git`, `.ssh`… ऐसे व्यवहार करते हैं जैसे वे मौजूद ही न हों, link के ज़रिए भी।
4. **सिर्फ़ टेक्स्ट**: सिर्फ़ अनुमत extensions दिए जाते हैं, और जिस फ़ाइल के पहले 8 KB में शून्य byte हो (binary), वह ठुकरा दी जाती है।
5. **सीमित**: पढ़ना, सूचियाँ, गहराई, खोज के मिलान, स्कैन किए गए bytes और जाँचे गए नाम (`maxExaminedEntries`, 50,000), सब सीमित हैं; जल्दी रुकी सूची या खोज `truncated: true` कहती है।
6. **केवल-पढ़ने-योग्य**: कभी कुछ भी लिखा, खिसकाया या मिटाया नहीं जाता।
7. **ट्रेस किया हुआ**: रिसोर्स को हर बार पढ़ना इवेंट लॉग में एक run है, URI, आकार और सर्व की गई सामग्री के SHA-256 fingerprint के साथ।
8. **बाहर रखा मतलब बाहर**: किसी फ़ोल्डर (`private`, `private/*`, `**/node_modules`) को बाहर रखने से उसके अंदर की हर चीज़ छिप जाती है, चाहे वह सूचीबद्ध हो, खोजी जाए, पाथ से पढ़ी जाए या रिसोर्स के रूप में पढ़ी जाए।
9. **मज़बूत**: जो सब-फ़ोल्डर पढ़ा न जा सके उसे छोड़ दिया जाता है, और error संदेश साझा फ़ोल्डर का नाम बताते हैं, कभी उसका absolute पाथ नहीं।

### पूरी फ़ाइल {#complete-file-1}

[`examples/mcp-folder.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-folder.ts) से अनुकूलित (जो डिफ़ॉल्ट रूप से यही दस्तावेज़ सर्व करता है):

```ts
import { join, resolve } from 'node:path';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, 'docs'));
const folder = { root, name: 'docs', exclude: ['**/node_modules/**'] };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'docs',
  tools: folderTools(folder),
  resources: folderResources(folder),
  instructions: 'Company documentation. Search it before answering questions about our processes.',
});
```

### यह क्या नहीं करता {#what-it-does-not-do-1}

- किसी भी तरह का **लेखन नहीं**।
- **PDF, Word या चित्र नहीं**: सिर्फ़ टेक्स्ट फ़ाइलें। दस्तावेज़ों को पहले Markdown या टेक्स्ट में बदलें।
- **सिर्फ़ substring खोज**: अर्थ पर आधारित ("सिमेंटिक") खोज नहीं, कोई रैंकिंग नहीं।
- **बदलाव की सूचनाएँ नहीं**: क्लाइंट फ़ाइलों को वैसे ही देखते हैं जैसी वे सूची बनाते समय होती हैं।
- **फ़ोल्डर ऐसे लोगों द्वारा लिखने योग्य नहीं होना चाहिए जिन पर आपको भरोसा न हो**: पहले पाथ जाँचे जाते हैं, फिर फ़ाइल खोली जाती है; जो व्यक्ति ठीक उसी पल किसी फ़ोल्डर को link से बदल सके, वह सैद्धांतिक रूप से बच निकल सकता है।
- **`include` के साथ भी फ़ोल्डर सूचीबद्ध होते हैं**, भले ही उनमें कोई मेल खाने वाली फ़ाइल न हो (जाँचने का मतलब होगा हर सब-फ़ोल्डर पढ़ना)।
- रिसोर्स पढ़ना ट्रेस होता है लेकिन टूल की नीतियाँ उसकी जाँच नहीं करतीं: सिर्फ़ वही फ़ोल्डर दें जिन्हें साझा करने में आपको कोई दिक्कत न हो।

## एक केवल-पढ़ने-योग्य डेटाबेस {#a-read-only-database}

**यह क्या करता है।** मॉडल को किसी डेटाबेस को खोजने देता है — टेबलों की सूची, किसी एक का विवरण, एक `SELECT` क्वेरी चलाना — और उसे **कभी नहीं बदलने देता**। **SQLite** (Node.js 22.13+ का बिल्ट-इन `node:sqlite`, या `better-sqlite3`) और **PostgreSQL** (`pg`) के साथ काम करता है।

::: code-group

```ts [SQLite]
import { DatabaseSync } from 'node:sqlite';
import { databaseTools, sqliteReadOnly } from '@sdk-ai-agents/core';

const db = new DatabaseSync('/data/shop.sqlite', { readOnly: true });

await serveMcpOverStdio(sdk, {
  name: 'shop',
  tools: databaseTools({ database: sqliteReadOnly(db), name: 'the shop database' }),
});
```

```ts [PostgreSQL]
import pg from 'pg';
import { databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
  }),
});
```

:::

### विकल्प {#options-2}

| `databaseTools` विकल्प | डिफ़ॉल्ट | |
| --- | --- | --- |
| `database` | — | `sqliteReadOnly(db)`, `postgresReadOnly({ pool })` या `postgresReadOnly({ client })`, या आपका अपना `ReadOnlyDatabase`। |
| `name` | `the <dialect> database` | मॉडल को इसके बारे में कैसे बताया जाता है: "the shop database"। |
| `prefix` | — | टूल के नामों का prefix (`shop_query`), कई डेटाबेस सर्व करने के लिए। |
| `maxRows` | `100` (ज़्यादा से ज़्यादा `1000`) | एक क्वेरी में लौटाई जाने वाली पंक्तियाँ; `truncated: true` बताता है कि और भी थीं। |
| `maxTextLength` | `2000` | हर टेक्स्ट मान में रखे जाने वाले अक्षर। |
| `maxTables` | `500` | सूचीबद्ध टेबलें। |
| `maxSqlLength` | `20000` | स्वीकार किया जाने वाला सबसे लंबा SQL। |

| `postgresReadOnly` विकल्प | डिफ़ॉल्ट | |
| --- | --- | --- |
| `statementTimeoutMs` | `10000` | PostgreSQL इससे ज़्यादा देर चलने वाली हर क्वेरी को रोक देता है। |
| `schemas` | सिस्टम वालों को छोड़कर सभी | `list_tables` और `describe_table` द्वारा **सूचीबद्ध और वर्णित** स्कीमा। यह सीमित नहीं करता कि `query` क्या पढ़ सकती है: वह role का काम है। |

`{ client }` के साथ, adapter को एक **समर्पित** `pg.Client` दें: ऐसा जिसे आपका एप्लिकेशन अपने transactions के लिए इस्तेमाल न करता हो (वहाँ pool ठुकरा दिया जाता है; उसे `{ pool }` के रूप में दें)।

`sqliteReadOnly(db)` के कोई विकल्प नहीं हैं: फ़ाइल को read-only खोलें (`node:sqlite` के साथ `{ readOnly: true }`, better-sqlite3 के साथ `{ readonly: true }`)। यह सिर्फ़ `prepare`, `exec` और उन statement methods पर निर्भर करता है जो दोनों drivers में साझा हैं; टेस्ट सूट इसे असली `node:sqlite` डेटाबेस पर चलाता है, better-sqlite3 पर नहीं।

### मॉडल क्या देखता है {#what-the-model-sees-2}

तीन टूल: `list_tables`, `describe_table { table }` और `query { sql }`, जिनका वर्णन इस तरह है: *"Runs one read-only SQL query (sqlite dialect) on the shop database and returns at most 100 rows; "truncated" is true when there were more. Statements that change data or schema are refused. Use list_tables and describe_table first."* (यानी: shop डेटाबेस पर एक read-only SQL क्वेरी चलाता है और ज़्यादा से ज़्यादा 100 पंक्तियाँ लौटाता है; और पंक्तियाँ होने पर "truncated" true होता है। डेटा या स्कीमा बदलने वाले statements ठुकराए जाते हैं। पहले list_tables और describe_table इस्तेमाल करें।) एक क्वेरी यह लौटाती है:

```json
{ "columns": ["name", "spent"],
  "rows": [{ "name": "Ada", "spent": 200.5 }, { "name": "Grace", "spent": 42 }],
  "rowCount": 2, "truncated": false }
```

पंक्तियाँ आते ही मानों को पढ़ने योग्य बनाया जाता है: बहुत बड़े integers strings बन जाते हैं, तारीखें ISO strings, binary डेटा `<binary data, 3 bytes>` जैसा एक नोट, लंबे टेक्स्ट काटे जाते हैं, arrays में 100 आइटम रहते हैं (`… 400 more items`)। जब डेटाबेस खुद क्वेरी ठुकराता है ("no such column", "read-only", एक timeout), तो मॉडल को कारण मिलता है ताकि वह अपना SQL ठीक कर सके; कनेक्शन और सर्वर errors आपकी तरफ़ ही रहते हैं।

### सुरक्षा नियम: एक नहीं, चार ताले {#security-rules-four-locks-not-one}

यह जाँचना कि क्वेरी "SELECT से शुरू होती है" काफ़ी नहीं है: `WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone` `WITH` से शुरू होती है और डेटा मिटा देती है। इसलिए किसी क्वेरी को चार ताले पार करने होते हैं:

1. **statement की जाँच**: ठीक एक statement (strings के भीतर के semicolons, quoted नाम, comments, PostgreSQL के `$$` quotes और `E'…'` escape strings समझे जाते हैं), जो `SELECT`, `WITH` या `VALUES` से शुरू हो, बिना `$1` पैरामीटर के, संतुलित कोष्ठकों के साथ। `PRAGMA`, `ATTACH`, `EXPLAIN ANALYZE`, `COMMIT`… ठुकराए जाते हैं।
2. **डेटाबेस खुद लेखन ठुकराता है**:
   - SQLite: हर क्वेरी `PRAGMA query_only = ON` के साथ चलती है (बाद में पहले जैसा कर दिया जाता है), और better-sqlite3 के साथ लिखने वाला statement चलने से पहले ही ठुकरा दिया जाता है;
   - PostgreSQL: हर क्वेरी अपने अलग `BEGIN READ ONLY` transaction में चलती है — किसी दूसरे transaction के भीतर पहले से मौजूद कनेक्शन को पहले पहचाना जाता है (`transaction_timestamp()` statement से पुराना) और उस transaction को छुए बिना ठुकरा दिया जाता है — `SET LOCAL statement_timeout` के साथ, और हमेशा `ROLLBACK` और फिर `SELECT pg_advisory_unlock_all()` से खत्म होती है (advisory locks rollback के बाद भी बने रहते हैं; जो कनेक्शन उन्हें छोड़ न सके, उसे दोबारा इस्तेमाल नहीं किया जाता)। क्वेरी एक bound पैरामीटर वाली sub-query के रूप में भेजी जाती है, इसलिए सर्वर सिर्फ़ एक statement स्वीकार करता है। transactions कभी एक ही समय पर एक कनेक्शन साझा नहीं करते।
3. **सीमाएँ**: ज़्यादा से ज़्यादा `maxRows` पंक्तियाँ पढ़ी जाती हैं (SQLite बाकी कभी नहीं पढ़ता; PostgreSQL `LIMIT` पर रुक जाता है), पंक्तियाँ आते ही मानों की छोटी प्रतियाँ बनाई जाती हैं (हर कच्चा मान काटे जाने से पहले पूरा लोड होता है), PostgreSQL की क्वेरियों का timeout होता है।
4. **आप**: SQLite फ़ाइलें read-only खोलें; PostgreSQL से ऐसे role के साथ जुड़ें जो सिर्फ़ वही पढ़ सके जो आप दिखाना चाहते हैं — असली सीमा यही है, क्योंकि read-only transaction वह नहीं रोकता जो कोई फ़ंक्शन डेटाबेस के बाहर कर सकता है (जैसे `dblink` या कोई HTTP extension)। ऐसा role फिर भी system catalog (`pg_catalog`) पढ़ सकता है और `PUBLIC` को दिए गए फ़ंक्शन कॉल कर सकता है; बाहर तक पहुँचने वाले extensions के फ़ंक्शन की अनुमति वापस लें (`REVOKE EXECUTE ON FUNCTION dblink(text, text) FROM PUBLIC;`, और इसी तरह के):

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE shop TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON customers, orders TO mcp_reader;   -- only what the model may read
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
```

### पूरी फ़ाइलें {#complete-files}

[`examples/mcp-database.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-database.ts) (SQLite, कोई फ़ाइल न देने पर एक डेमो shop डेटाबेस बनाता है) और [`examples/mcp-postgres.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-postgres.ts):

```ts
import { join } from 'node:path';
import pg from 'pg';
import { FileEventStore, createSDK, databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL to a read-only PostgreSQL role');

const pool = new pg.Pool({ connectionString, max: 4 });
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
    maxRows: 100,
  }),
});
```

### यह क्या नहीं करता {#what-it-does-not-do-2}

- **कोई लेखन नहीं**, जानबूझकर। मॉडल को डेटा बदलने देने के लिए, उस एक बदलाव के लिए मंज़ूरी वाला एक समर्पित टूल लिखें।
- **क्वेरियों के भीतर प्रति-टेबल फ़िल्टर नहीं**: कोई क्वेरी वह सब पढ़ सकती है जो कनेक्शन पढ़ सकता है। एक role (PostgreSQL) या सिर्फ़ सही टेबलों वाली फ़ाइल की प्रति (SQLite) इस्तेमाल करें; कच्ची टेबलों की बजाय views उपलब्ध कराएँ।
- **SQLite: हमले की सतह क्वेरी है, फ़ाइल नहीं।** क्वेरियाँ आपके सर्वर प्रोसेस के भीतर, synchronous रूप से, बिना timeout और बिना memory सीमा के चलती हैं: जो भी SQL लिखता है — मॉडल, या उसे चलाने वाला कोई भी — ऐसी क्वेरी लिख सकता है जो कभी खत्म न हो (एक recursive `WITH`) या बहुत बड़े मान बनाए, और सर्वर को रोक या थका दे। पंक्तियाँ एक-एक करके पढ़ी जाती हैं और हर मान आते ही उसकी छोटी प्रति बना ली जाती है, ताकि परिणाम छोटा रहे और मूल मान मुक्त किए जा सकें — लेकिन हर कच्चा मान पहले पूरा लोड होता है, और कोई भी चीज़ उस काम को सीमित नहीं करती जो SQLite एक पंक्ति बनाने के लिए करता है। SQLite को अपने लिए या भरोसेमंद लोगों के लिए सर्व करें; इसे HTTP पर अविश्वसनीय क्लाइंट के लिए उपलब्ध न कराएँ। क्वेरियों को रोके जा सकने वाले worker thread में चलाने से यह सीमा हट जाएगी; यह अभी नहीं किया गया है।
- **कनेक्शन पर रजिस्टर किए गए SQLite फ़ंक्शन** मॉडल के SQL से **कॉल किए जा सकते हैं** (`db.function(…)`): जिस कनेक्शन को आप सर्व करते हैं, उस पर सिर्फ़ हानिरहित फ़ंक्शन रजिस्टर करें।
- **कोई bind पैरामीटर नहीं**: मॉडल मान SQL में ही लिखता है।
- किसी परिणाम में एक ही नाम वाले दो columns में से सिर्फ़ आखिरी रहता है: उन्हें aliases दें।
- दूसरे डेटाबेस (MySQL, SQL Server…): छोटा `ReadOnlyDatabase` interface खुद लागू करें, और उसे अपने दम पर लेखन ठुकराने वाला बनाएँ। `assertSingleQuery(sql, dialect)` सिर्फ़ SQLite और PostgreSQL का syntax समझता है; MySQL (हर string में backslash escapes, `#` comments) को अपनी अलग जाँच चाहिए।

## एक एजेंट: आपका तर्क-जुड़वाँ {#an-agent-your-reasoning-twin}

**यह क्या करता है।** एक पूरे एजेंट को एक टूल के रूप में उपलब्ध कराता है। सबसे प्रभावशाली उपयोग: [आपकी विचारक प्रोफ़ाइल वाला एक संज्ञानात्मक एजेंट](./thinker-profiles), ताकि Claude Desktop से कोई भी पूछ सके *"Jev के लिए पैसे देने के बारे में Nicolas क्या सोचेगा?"* और **Nicolas के तर्क करने के तरीके से** निकाला गया उत्तर पाए, उसके कारण और जो अभी कमी है उसके साथ।

```ts
import { cognitiveAgentTool } from '@sdk-ai-agents/core';

const twin = sdk.createCognitiveAgent({
  name: 'nicolas',
  model: 'gpt-4o-mini',
  profile,                                     // how Nicolas reasons
  limits: { maxSteps: 6, timeoutMs: 50_000 },  // small: MCP clients do not wait forever
});

await serveMcpOverStdio(sdk, {
  name: 'nicolas-twin',
  tools: [cognitiveAgentTool(twin, { name: 'ask_nicolas', description: 'How Nicolas would reason about a question or a decision' })],
});
```

इस रेसिपी को मॉडल key चाहिए (`createSDK({ apiKey: process.env.OPENAI_API_KEY, … })`): एजेंट एक भाषा मॉडल से सोचता है।

### कदम 1 — दर्ज करें कि आप कैसे तर्क करते हैं {#step-1-—-capture-how-you-reason}

कुछ विषयों को अपने शब्दों में समझाएँ, एक बार उनसे प्रोफ़ाइल का सार निकालें, और उसे सहेजें:

```ts
import { writeFileSync } from 'node:fs';

const profile = await sdk.distillThinkerProfile({
  id: 'nicolas',
  name: 'Nicolas',
  model: 'gpt-4o',
  samples: [
    { topic: 'Paying for a typed-decision API', reasoning: 'What does it really allow? Then the limits…', conclusion: 'Try an open clone first' },
    // a few more topics, in your own words
  ],
});
writeFileSync('nicolas.profile.json', JSON.stringify(profile, null, 2));
```

प्रोफ़ाइल में क्या होता है और समय के साथ उसे कैसे सुधारें, इसके लिए देखें [किसी खास व्यक्ति की तरह तर्क करें](./thinker-profiles)।

### कदम 2 — इसे सर्व करें {#step-2-—-serve-it}

[`examples/mcp-agent.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-agent.ts) प्रोफ़ाइल को `PROFILE_FILE` से लोड करता है (प्रोफ़ाइल स्कीमा के सामने जाँचकर) या एक बिल्ट-इन उदाहरण इस्तेमाल करता है, और `ask_nicolas` सर्व करता है:

```sh
claude mcp add nicolas-twin -e OPENAI_API_KEY=sk-… -e PROFILE_FILE=/path/nicolas.profile.json -- npx -y tsx /path/mcp-agent.ts
```

### मॉडल क्या देखता है और उसे क्या वापस मिलता है {#what-the-model-sees-and-gets-back}

टूल `problem` (सवाल, 4,000 अक्षरों तक) और एक वैकल्पिक `context` ऑब्जेक्ट (तथ्य और बाध्यताएँ, JSON के रूप में 20,000 अक्षरों तक) लेता है। यह निर्णय लौटाता है, पूरी मानसिक स्थिति नहीं:

```json
{
  "runId": "run_6c01de53-…",
  "status": "completed",
  "decisionStatus": "committed",
  "answer": "Prototype with the open clone first; pay only if it falls short on real data.",
  "rationale": "…",
  "confidence": 0.78,
  "nextActions": ["Benchmark the clone on 50 real tickets"]
}
```

`decisionStatus` होता है `committed` (एक पक्का उत्तर), `provisional` (अब तक का सबसे अच्छा उत्तर, `missing` के साथ: जो स्थापित नहीं हुआ) या `abstain`। पूरा तर्क `runId` के तहत इवेंट लॉग में रहता है: `sdk.getMentalState(runId)` हर परिकल्पना और आलोचना दिखाता है। जब कोई run विफल होता है, तो `error` सिर्फ़ इतना बताता है कि वह पूरा नहीं हुआ और कहाँ देखना है (`exposeErrors: true` संदेश को ही परिणाम में रख देता है: उसमें प्रदाता के विवरण हो सकते हैं)।

### विकल्प {#options-3}

| विकल्प | डिफ़ॉल्ट | |
| --- | --- | --- |
| `name` | `ask_<agent name>` | टूल का नाम। |
| `description` | सामान्य | बताएँ कि इस एजेंट से कब सलाह लेनी है: मॉडल इसी से निर्णय लेता है। |
| `metadata` | मध्यम जोखिम | नियंत्रण मेटाडेटा, डिफ़ॉल्ट पर फ़ील्ड-दर-फ़ील्ड मिलाया जाता है; हर सलाह की पुष्टि के लिए `requiresApproval: true` जोड़ें। |
| `maxInputLength` | `4000` | स्वीकार की जाने वाली सबसे लंबी समस्या (या संदेश)। |
| `maxContextLength` | `20000` | सबसे लंबा `context`, JSON टेक्स्ट के रूप में। |
| `exposeErrors` | `false` | विफल run का error संदेश परिणाम में रखें। |

`governedAgentTool(agent, options)` यही काम `sdk.createAgent` से बनाए गए एजेंट के लिए करता है: यह `message` (और `context`) लेता है और `{ runId, status, output, error }` लौटाता है।

### जानने लायक बातें {#good-to-know}

- **इसमें समय लगता है।** एक संज्ञानात्मक run मॉडल की कई कॉल करता है: दसियों सेकंड मानकर चलें, कभी-कभी मिनट। कई क्लाइंट लगभग एक मिनट बाद कॉल रद्द कर देते हैं (आधिकारिक TypeScript SDK का डिफ़ॉल्ट 60 सेकंड है; Claude Code इसे `MCP_TOOL_TIMEOUT` से बढ़ाने देता है)। इंटरैक्टिव उपयोग के लिए `limits` छोटे रखें, जब तक कि आपका क्लाइंट [प्रगति सूचनाएँ](./mcp-deploy#progress-notifications) मिलने पर अपना timeout फिर से शुरू न करता हो: एजेंट का हर चरण एक सूचना भेजता है। **जब क्लाइंट हार मान लेता है, तो run रोक दिया जाता है** (संज्ञानात्मक और नियंत्रित, दोनों एजेंटों में) और रद्द के रूप में दर्ज होता है: मॉडल की आगे कोई कॉल नहीं होती, और जिस मंज़ूरी का एजेंट इंतज़ार कर रहा था वह रद्द हो जाती है।
- **इसमें पैसा लगता है**: हर सलाह मॉडल की कई कॉल है। इस पर एक [बजट](./mcp-deploy#governance-policies-budgets-approvals) लगाएँ और `sdk.getRunCost(runId)` जाँचें।
- **यह तर्क करने के तरीके की नकल करता है, उस व्यक्ति के ज्ञान की नहीं।** जुड़वाँ वही जानता है जो प्रोफ़ाइल, सवाल और संदर्भ में है — उस व्यक्ति की स्मृति नहीं। इसके उत्तरों को "वे इसे कैसे देखते" के रूप में लें, और असली व्यक्ति को `learnFromFeedback` से इसे सुधारने दें।

## एक सर्वर में कई स्रोत {#several-sources-in-one-server}

स्रोतों को prefixes के साथ जोड़ें ताकि नाम कभी न टकराएँ:

```ts
await serveMcpOverStdio(sdk, {
  name: 'company',
  tools: [
    ...(await openApiTools({ spec: './crm-openapi.json', prefix: 'crm_', headers })),
    ...folderTools({ root: '/srv/handbook', prefix: 'handbook_' }),
    ...databaseTools({ database: sqliteReadOnly(db), prefix: 'shop_' }),
    'find_colleague', // a tool you defined yourself
  ],
  resources: folderResources({ root: '/srv/handbook' }),
});
```

एक ही नाम वाले दो टूल शुरू होते समय ही ठुकरा दिए जाते हैं, एक संदेश के साथ जो बताता है कि कौन-सा।

## आपके अपने एजेंटों में वही टूल {#the-same-tools-in-your-own-agents}

स्रोत सादी टूल परिभाषाएँ हैं: आपके एजेंट इन्हें MCP के बिना इस्तेमाल कर सकते हैं।

```ts
const tools = (await openApiTools({ spec: './crm-openapi.json' })).map((definition) => sdk.defineTool(definition));
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools });
```

वही नियम लागू होते हैं: आपके सूचीबद्ध किए लिखने वाले operations मंज़ूरी का इंतज़ार करते हैं, हर कॉल जाँची और दर्ज की जाती है।

आगे: [डिप्लॉय करें, सुरक्षित करें और समस्या सुलझाएँ](./mcp-deploy)।
