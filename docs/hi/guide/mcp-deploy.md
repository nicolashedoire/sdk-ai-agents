# डिप्लॉय करें, सुरक्षित करें और समस्या सुलझाएँ

आपका सर्वर आपकी मशीन पर काम करता है ([पहला सर्वर](./mcp-first-server), [रेसिपी](./mcp-recipes))। यह पेज बताता है कि उसे HTTP पर कैसे साझा करें, नियमों और इंसानों को प्रक्रिया में कैसे शामिल करें, सुरक्षा की जाँच-सूची क्या है, और कुछ काम न करे तो क्या करें।

## stdio या HTTP? {#stdio-or-http}

| | stdio | Streamable HTTP |
| --- | --- | --- |
| यह कैसे चलता है | AI ऐप आपके सर्वर को उसी कंप्यूटर पर एक प्रोग्राम के रूप में शुरू करता है | आपका सर्वर कहीं एक वेब सेवा के रूप में चलता है |
| इसे कौन इस्तेमाल कर सकता है | उस कंप्यूटर पर बैठा व्यक्ति | हर वह व्यक्ति जिसे आप पता और एक token दें |
| नेटवर्क पर खुलापन | कोई नहीं | सुरक्षित करने के लिए एक HTTP endpoint |
| किसके लिए सबसे अच्छा | निजी टूल, लोकल फ़ाइलें, चीज़ें आज़माना | एक टीम, कंपनी-भर का API या डेटाबेस |
| इसे किससे शुरू करें | `serveMcpOverStdio(sdk, options)` | `createMcpServer(sdk, options)` + MCP SDK का HTTP transport |

stdio से शुरू करें। जब कई लोगों को एक ही सर्वर चाहिए, तब HTTP पर जाएँ।

## HTTP पर सर्व करें {#serve-over-http}

आधिकारिक MCP SDK HTTP transport देता है; `createMcpServer` उसे एक नियंत्रित सर्वर देता है। यह पूरी फ़ाइल Node का अपना `http` module इस्तेमाल करती है — कोई वेब फ़्रेमवर्क नहीं — और **stateless** है: हर अनुरोध को एक नया MCP सर्वर मिलता है, इसलिए आप load balancer के पीछे इसकी कई प्रतियाँ चला सकते हैं।

```ts
import { timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { createMcpServer } from '@sdk-ai-agents/core/mcp';

const token = process.env.MCP_TOKEN;
if (!token) throw new Error('Set MCP_TOKEN: clients must send "Authorization: Bearer <token>"');
const port = Number(process.env.PORT ?? 3000);
// Requests must name this host: protects a local server from DNS rebinding attacks.
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

const folder = { root: resolve(process.argv[2] ?? 'docs'), name: 'docs' };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });
// Built once, shared by the server of every request.
const tools = folderTools(folder);
const resources = folderResources(folder);

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error('MCP request failed:', error);
    if (!response.headersSent) reply(response, 500, 'Internal server error');
  });
}).listen(port, '127.0.0.1');

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/mcp') return reply(response, 404, 'Not found');
  if (!allowedHosts.has(request.headers.host ?? '')) return reply(response, 403, 'Forbidden host');
  if (!sameSecret(request.headers.authorization ?? '', `Bearer ${token}`)) return reply(response, 401, 'Unauthorized');
  if (request.method !== 'POST') return reply(response, 405, 'Method not allowed');

  // Stateless: a client's cancellation arrives as a new request, which this fresh server
  // cannot tie to a call still in progress. A pending approval then ends only when the
  // client closes the connection, or after `approvalTimeoutMs` — until then a late "yes"
  // still runs the tool. Keep it well below the time your clients wait.
  const server = createMcpServer(sdk, { name: 'docs', tools, resources, approvalTimeoutMs: 20_000 });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  await server.connect(transport);
  await transport.handleRequest(request, response);
}

function reply(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

/** Compares secrets in constant time, so timing does not reveal how much of a guess is right. */
function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

हर जाँच किसलिए है:

| जाँच | क्यों |
| --- | --- |
| पाथ `/mcp` | MCP के लिए एक पता; बाकी सब ठुकरा दिया जाता है। |
| `Host` header | वरना आपके द्वारा खोला गया कोई वेब पेज आपके ब्राउज़र से `localhost` पर किसी सर्वर को कॉल करवा सकता है ("DNS rebinding")। डिप्लॉय करने पर, इसकी जगह अपना सार्वजनिक host नाम सूचीबद्ध करें। |
| Bearer token | सिर्फ़ token जानने वाले क्लाइंट ही अंदर आ पाते हैं। स्थिर समय (constant time) में तुलना की जाती है। एक लंबा random token बनाएँ; उसे अपने कोड से बाहर रखें। |
| सिर्फ़ `POST` | stateless मोड में `GET` से खोलने के लिए कोई लंबे समय तक चलने वाली स्ट्रीम नहीं होती। |
| हर अनुरोध के लिए एक सर्वर | अनुरोधों के बीच कुछ भी साझा नहीं होता; टूल परिभाषाएँ एक बार बनाई और दोबारा इस्तेमाल की जाती हैं (वही परिभाषा दोबारा परिभाषित करने की अनुमति है)। कीमत: क्लाइंट का "cancel" संदेश एक दूसरे अनुरोध के रूप में आता है और उस कॉल तक नहीं पहुँच सकता जिसे वह रद्द करता है — इसकी जगह कनेक्शन बंद होना, या `approvalTimeoutMs`, उसे खत्म करता है। |

फ़ाइल सिर्फ़ `127.0.0.1` पर सुनती है। इसे प्रकाशित करने के लिए, इसे ऐसे reverse proxy के पीछे रखें जो **HTTPS** को समाप्त करता हो (Caddy, nginx, आपके क्लाउड का load balancer), और अपना host नाम `allowedHosts` में जोड़ें। नेटवर्क पर कभी भी सादे HTTP पर bearer token न भेजें।

इसका चलाने योग्य वर्ज़न [`examples/mcp-http.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-http.ts) के रूप में आता है (`MCP_TOKEN=… npm run example:mcp-http`)। इसे एक असली क्लाइंट से जाँचा गया: बिना token की कॉल को `401` मिलता है, जाली `Host` को `403`, और token वाला क्लाइंट टूल की सूची देखता और उन्हें कॉल करता है।

### क्लाइंट को HTTP सर्वर से जोड़ें {#connect-clients-to-an-http-server}

- **Claude Code**: `claude mcp add --transport http docs https://mcp.example.com/mcp --header "Authorization: Bearer <token>"`। साझा `.mcp.json` में, `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }` लिखें: Claude Code environment variables को फैला देता है, इसलिए token फ़ाइल से बाहर रहता है।
- **आपके अपने एजेंट**: `connectMcpServer({ name: 'docs', transport: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } })` — देखें [MCP आसान भाषा में](./mcp#use-the-tools-of-an-mcp-server-in-your-agents)।
- **दूसरे एप्लिकेशन**: उनके दस्तावेज़ों में "remote MCP server" या "custom connector" ढूँढें। कुछ सिर्फ़ ऐसे सर्वर स्वीकार करते हैं जो तय token की बजाय OAuth sign-in इस्तेमाल करते हों।

## नियंत्रण: नीतियाँ, बजट, मंज़ूरियाँ {#governance-policies-budgets-approvals}

हर MCP कॉल एक पहचान के तहत चलती है, `mcp:<server name>` (इसे `agentId` से बदलें)। नीतियाँ, बजट और अलर्ट किसी भी एजेंट की तरह इसे निशाना बना सकते हैं। हर तरह की नीति के लिए देखें [नियंत्रित एजेंट](./governed-agents)।

किसी एक सर्वर के लिए **कॉल का दैनिक बजट**:

```ts
sdk.defineGlobalPolicy({
  id: 'handbook-daily-budget',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { agentId: 'mcp:handbook', period: 'day', maxToolCalls: 500 } },
    },
  ],
});
```

दिन की 501वीं कॉल नीति के नाम के साथ ठुकरा दी जाती है, और यह इनकार इवेंट लॉग में होता है। कोई कॉल **शुरू होते ही** गिनी जाती है — एक ही कदम में जाँची और गिनी जाती है, इसलिए 20 एक साथ आने वाली कॉल 2 की सीमा के नीचे से नहीं निकल सकतीं — और यह **अपने नतीजे चाहे जो हो** गिनी जाती है, विफलताएँ भी। बजट प्रोसेस की memory में गिने जाते हैं: सर्वर दोबारा शुरू होने पर वे शून्य से फिर शुरू होते हैं, और HTTP सर्वर की हर प्रति अपनी कॉल खुद गिनती है। किसी भी नीति या बजट से पहले arguments की जाँच होती है: अमान्य कॉल बिना गिने या किसी का इंतज़ार किए ठुकरा दी जाती है।

### मंज़ूरियाँ: पहले कोई इंसान हाँ कहे {#approvals-a-human-says-yes-first}

कोई टूल चलने से पहले किसी इंसान के निर्णय का इंतज़ार करता है जब:

- उसकी परिभाषा में `metadata: { requiresApproval: true }` हो — `openApiTools` के लिखने वाले operations के लिए यही डिफ़ॉल्ट है;
- या कोई नीति इसकी माँग करे, आपके नामित टूल के लिए, उनकी परिभाषाओं को छुए बिना:

```ts
sdk.defineGlobalPolicy({
  id: 'approve-crm-writes',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: {
        type: 'condition',
        conditions: [{ field: 'intention.toolName', operator: 'in', value: ['crm_createNote', 'crm_updateCustomer'] }],
      },
      action: 'require_approval',
    },
  ],
});
```

जिस कॉल को कोई भी नीति ठुकराए, वह मंज़ूरी माँगे बिना ठुकरा दी जाती है: मंज़ूरी कभी किसी इनकार (deny), अनुमति-सूची या बजट पर हावी नहीं होती। इंतज़ार के दौरान, कॉल `sdk.getPendingApprovals()` में दिखती है। आपका कोड `sdk.approveAction(id, who, reason)` या `sdk.rejectAction(id, who, reason)` से निर्णय लेता है; दोनों दर्ज होते हैं (`approval.requested`, `approval.approved` या `approval.rejected`)। एक stdio सर्वर अपने ही टर्मिनल में नहीं पूछ सकता — standard input प्रोटोकॉल ढोता है — इसलिए निर्णय किसी दूसरे माध्यम से आता है। उदाहरण के लिए, इसी मशीन पर, सर्वर वाले प्रोसेस में ही, एक छोटा admin endpoint।

**admin endpoint तय करता है कि क्या चलेगा: इसे MCP endpoint की तरह ही सुरक्षित रखें।** वरना आपके ब्राउज़र में खुला कोई पेज `localhost` तक पहुँच सकता है (DNS rebinding) और आपकी ओर से मंज़ूरी दे सकता है। इसलिए यह सिर्फ़ `127.0.0.1` पर सुनता है, सिर्फ़ अपना `Host` स्वीकार करता है, `Origin` वाले हर अनुरोध को ठुकराता है (ब्राउज़र इसे जोड़ते हैं; scripts और `curl` नहीं) और एक गुप्त header माँगता है:

```ts
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const port = 4000;
const secret = process.env.ADMIN_SECRET ?? '';   // a long random value
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

createServer((request, response) => {
  const answer = (status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.headers.origin !== undefined) return answer(403, 'Forbidden origin');
  if (!allowedHosts.has(request.headers.host ?? '')) return answer(403, 'Forbidden host');
  const given = Buffer.from(String(request.headers['x-admin-secret'] ?? ''));
  const expected = Buffer.from(secret);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return answer(401, 'Unauthorized');
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/approvals') return answer(200, sdk.getPendingApprovals());
  const decision = /^\/approvals\/([^/]+)\/(approve|reject)$/.exec(url.pathname);
  if (request.method !== 'POST' || !decision) return answer(404, 'Not found');
  const [, id = '', verb] = decision;
  try {
    if (verb === 'approve') sdk.approveAction(id, 'admin', 'approved from the admin endpoint');
    else sdk.rejectAction(id, 'admin', 'rejected from the admin endpoint');
    return answer(200, { decided: id, verb });
  } catch (error) {
    return answer(409, error instanceof Error ? error.message : String(error)); // unknown, decided or cancelled
  }
}).listen(port, '127.0.0.1');
```

फिर `curl -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals` दिखाता है कि क्या इंतज़ार में है, और `curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals/<id>/approve` निर्णय लेता है। इस तरह बना एक पूरा सर्वर [`examples/mcp-approvals.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-approvals.ts) के रूप में आता है; इसे शुरू से अंत तक जाँचा गया (एक कॉल इंतज़ार करती है, जाली `Host`, कोई `Origin` या छूटा हुआ secret `403`/`401` पाते हैं, मंज़ूरी टूल चलाती है, और क्लाइंट के जाने पर प्रोसेस बंद हो जाता है)।

मंज़ूरी के इंतज़ार की सूचना पाने के लिए, Slack या ईमेल notifier के साथ `approval.requested` पर एक [घटना नियम](./incidents#rules) जोड़ें। लंबित मंज़ूरियाँ उस प्रोसेस की memory में रहती हैं जहाँ कॉल इंतज़ार करती है: HTTP सर्वर की कई प्रतियों के साथ, उसी प्रति के ज़रिए निर्णय लें जिसमें वह है (या मंज़ूरी वाले टूल के लिए एक ही प्रति चलाएँ)।

::: warning लंबित मंज़ूरी कितनी देर रहती है
कई क्लाइंट लगभग एक मिनट बाद कॉल रद्द कर देते हैं। लंबित मंज़ूरी रद्द हो जाती है — और टूल कभी नहीं चलता — जब:

- क्लाइंट कॉल रद्द कर दे (stdio, या stateful HTTP session);
- कनेक्शन बंद हो जाए: बाहर निकलने वाला stdio क्लाइंट, बंद किया गया HTTP अनुरोध;
- `approvalTimeoutMs` के भीतर किसी ने निर्णय न लिया हो — **डिफ़ॉल्ट रूप से 50 सेकंड**, जो ज़्यादातर क्लाइंट के इंतज़ार से कम है। अगर आपका क्लाइंट ज़्यादा देर इंतज़ार करता है (बढ़ाए गए `MCP_TOOL_TIMEOUT` वाला Claude Code), तो इसे `createMcpServer`/`serveMcpOverStdio` पर सेट करें।

**stateless HTTP सर्वर पर, सिर्फ़ आखिरी दो लागू होते हैं**: वह "cancel" अनुरोध को उस कॉल से नहीं जोड़ सकता जिसे वह रद्द करता है। जो क्लाइंट अपना कनेक्शन बंद किए बिना हार मान ले, वह मंज़ूरी को `approvalTimeoutMs` तक लंबित छोड़ देता है — और उस दौरान दिया गया "हाँ" फिर भी टूल चला देता है, जबकि कोई उत्तर का इंतज़ार नहीं कर रहा। `approvalTimeoutMs` को अपने क्लाइंट के इंतज़ार के समय से काफ़ी कम रखें (उदाहरण 20 s इस्तेमाल करता है), या मंज़ूरी वाले टूल को stdio या stateful session पर सर्व करें।

रद्द होने के बाद, देर से आया "हाँ" "already rejected" के साथ विफल होता है, और मंज़ूरी के बाद कॉल की एक बार और जाँच होती है: अगर क्लाइंट बीच में चला गया, तो टूल नहीं चलता। MCP के ज़रिए मंज़ूरियाँ जल्दी लिए जाने वाले निर्णयों के लिए ठीक हैं। घंटों लेने वाले निर्णयों के लिए, टूल से *एक अनुरोध दर्ज* करवाएँ जिसे आपकी टीम बाद में निपटाए।
:::

ज़्यादातर MCP एप्लिकेशन भी हर टूल कॉल से पहले उपयोगकर्ता से पूछते हैं (Claude Desktop डिफ़ॉल्ट रूप से ऐसा करता है)। वह पुष्टि एप्लिकेशन में होती है; SDK की मंज़ूरियाँ आपके सर्वर पर, आपके नियमों के तहत होती हैं, और दर्ज की जाती हैं। डेटा बदलने वाली हर चीज़ के लिए दोनों इस्तेमाल करें।

## प्रगति सूचनाएँ {#progress-notifications}

कोई क्लाइंट माँग सकता है कि उसे बताया जाए कि कॉल कैसी चल रही है: वह कॉल के साथ एक `progressToken` भेजता है (जब आप `onprogress` देते हैं, तो आधिकारिक TypeScript SDK ऐसा करता है)। तब सर्वर कॉल के हर इवेंट के लिए, और उस एजेंट के run के हर इवेंट के लिए जिसे कोई `cognitiveAgentTool` या `governedAgentTool` शुरू करता है, एक `notifications/progress` भेजता है, जिसमें एक `progress` होता है जो हर बार एक से बढ़ता है, और एक छोटा `message`:

```text
call started
tool ask_support called
agent started
step 1: model chose lookup_customer
step 1: tool lookup_customer called
step 1: tool lookup_customer done
step 2: model answered
agent completed
call completed
```

संदेश चरणों, टूल और संज्ञानात्मक ऑपरेशनों के नाम बताते हैं: मॉडल द्वारा चुना गया टूल, और एजेंट द्वारा कॉल किया गया हर टूल, एजेंट के वे टूल भी जिन्हें सर्वर उपलब्ध नहीं कराता। जो टूल अपने संदर्भ के `onEvent` के साथ कोई [अध्ययन](./studies) चलाता है, उसका वर्णन चरण के हिसाब से होता है (`study started`, `passage changes started`, `search in changes`, `report ready`), क्वेरी के हिसाब से कभी नहीं। संदेशों में कभी arguments, परिणाम या error के टेक्स्ट नहीं होते। कोई `total` नहीं है: किसी को पहले से पता नहीं होता कि एक run में कितने चरण लगेंगे। हर सूचना परिणाम से पहले भेजी जाती है, उसके बाद कभी नहीं। Streamable HTTP पर वे response की स्ट्रीम (SSE) पर जाती हैं; `enableJsonResponse: true` के साथ बनाया गया transport सादे JSON में जवाब देता है और उन्हें छोड़ देता है। जो क्लाइंट कोई `progressToken` नहीं भेजता, उसे कोई सूचना नहीं मिलती।

सिर्फ़ उस एजेंट run पर नज़र रखी जाती है जिसे कोई टूल शुरू करता है, एक ही स्तर तक: वह एजेंट अपने एजेंट टूल के ज़रिए जो runs शुरू करता है, उन पर नहीं, और लाइव इवेंट के बिना वाले स्टोर पर हाथ से बनाए गए एजेंट पर भी नहीं। कुछ भी मिलाकर एक नहीं किया जाता: हर इवेंट एक सूचना है, और एक लंबा संज्ञानात्मक run सैकड़ों सूचनाएँ भेज सकता है।

प्रगति क्या बदलती है, और क्या नहीं:

- **सिर्फ़ वे क्लाइंट ज़्यादा देर इंतज़ार करते हैं जो प्रगति मिलने पर अपना timeout फिर से शुरू (reset) करते हैं।** TypeScript SDK के साथ: `client.callTool(params, undefined, { onprogress, resetTimeoutOnProgress: true, maxTotalTimeout })`। जो क्लाइंट प्रगति दिखाता है पर तय timeout रखता है, वह पहले जितने ही समय पर हार मान लेता है। इस पर भरोसा करने से पहले जाँचें कि आपका एप्लिकेशन क्या करता है।
- **ऐसे क्लाइंट के साथ, मायने रखती है सबसे लंबी चुप्पी**, कॉल की लंबाई नहीं: मॉडल की एक कॉल, एक धीमा टूल, या एक मंज़ूरी। जब कोई टूल चल रहा हो या कोई मंज़ूरी इंतज़ार कर रही हो, तब कुछ नहीं भेजा जाता, इसलिए `approvalTimeoutMs` के 50 s फिर भी लागू होते हैं, और मॉडल या टूल की हर एक कॉल क्लाइंट के timeout के भीतर पूरी होनी चाहिए।
- **तब एजेंट ज़्यादा समय ले सकते हैं**: किसी संज्ञानात्मक एजेंट का `limits.timeoutMs` क्लाइंट के timeout से ज़्यादा हो सकता है, क्योंकि हर चरण सूचनाएँ भेजता है। दूसरे क्लाइंट के लिए, [एजेंट वाली रेसिपी](./mcp-recipes#an-agent-your-reasoning-twin) की छोटी सीमाएँ रखें।

## सुरक्षा जाँच-सूची {#security-checklist}

सर्वर साझा करने से पहले:

- [ ] **कम से कम उपलब्ध कराएँ।** `tools` में सिर्फ़ ज़रूरी टूल सूचीबद्ध करें; केवल-पढ़ने-योग्य स्रोतों को तरजीह दें; लिखने वाले operations एक-एक करके जोड़ें।
- [ ] **लेखन के लिए इंसान ज़रूरी।** लिखने वाले टूल पर `requiresApproval` चालू रखें, जब तक आपके पास कोई कारण न हो, और उस कारण को दर्ज करें।
- [ ] **नीचे की परत में न्यूनतम अधिकार।** केवल-पढ़ने वाले scopes वाले API tokens, सिर्फ़ SELECT वाला डेटाबेस role, ऐसा फ़ोल्डर जिसमें सिर्फ़ वही हो जो साझा किया जा सकता है। सर्वर की जाँचें दूसरा ताला हैं, पहला नहीं।
- [ ] **गोपनीय जानकारी कोड के बाहर।** Tokens environment variables से आते हैं (`claude mcp add … -e TOKEN=…`), कभी spec, विवरण या फ़ाइल से नहीं।
- [ ] **परिणाम अविश्वसनीय टेक्स्ट हैं।** कोई API, दस्तावेज़ या डेटाबेस जो लौटाता है वह मॉडल तक शब्दशः पहुँचता है — किसी पेज में "अपने निर्देशों को अनदेखा करो और…" लिखा हो सकता है। एक ही बातचीत को अविश्वसनीय स्रोत और बिना मंज़ूरी वाले ताकतवर लिखने वाले टूल, दोनों न दें।
- [ ] **HTTP सर्वर**: HTTPS, एक लंबा random token, `Host` की अनुमति-सूची, proxy के पीछे `127.0.0.1` पर सुनना।
- [ ] **Error के विवरण अंदर ही रहें** (`exposeErrorDetails` बंद, जो डिफ़ॉल्ट है)। इनपुट के इनकार (गलत argument, फ़ोल्डर के बाहर का पाथ, ऐसा SQL जो क्वेरी नहीं है) फिर भी क्लाइंट को समझाए जाते हैं।
- [ ] पैसे लगने वाली हर चीज़ पर **बजट**: एजेंट (मॉडल कॉल) और पैसे वाले API।
- [ ] पहले कुछ दिनों के बाद **इवेंट लॉग पढ़ें**: कौन-से टूल कॉल होते हैं, कौन-सी कॉल ठुकराई जाती हैं।

MCP प्रोजेक्ट हमलों और बचाव की एक विस्तृत गाइड रखता है: [Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)।

## समस्या-समाधान {#troubleshooting}

| लक्षण | संभावित कारण | समाधान |
| --- | --- | --- |
| क्लाइंट तुरंत डिस्कनेक्ट हो जाता है, या कहता है कि सर्वर ने अमान्य JSON भेजा | कोई चीज़ **standard output** पर लिखती है: आपके कोड या किसी library में एक `console.log` | `console.error` (standard error) इस्तेमाल करें। Stdout प्रोटोकॉल ढोता है। |
| `npx tsx server.ts` एक लाइन छापता है और अटका हुआ लगता है | सामान्य है: stdio सर्वर किसी क्लाइंट का इंतज़ार करता है | [Inspector](./mcp-first-server#_4-test-it-with-the-mcp-inspector) से परखें, या कोई ऐप जोड़ें। |
| सर्वर Claude Desktop में नहीं दिखता | config में JSON error, सापेक्ष पाथ, ऐप दोबारा शुरू नहीं किया गया | JSON जाँचें, absolute पाथ इस्तेमाल करें, ऐप बंद करके दोबारा शुरू करें, `mcp*.log` पढ़ें ([कहाँ](./mcp-first-server#_5-connect-it-to-claude-desktop))। |
| लॉग में `npx: command not found` / `node: not found` | ऐप को आपके shell का `PATH` नहीं दिखता (nvm के साथ आम है) | `npx` का पूरा पाथ इस्तेमाल करें (`which npx` / `where npx`)। |
| सूची में कोई टूल नहीं है | वह `tools` में नहीं है | उसका नाम या परिभाषा `tools` में जोड़ें: वरना कुछ भी उपलब्ध नहीं होता। |
| शुरू होते समय `Another tool named "x" is already defined` | दो स्रोत एक ही टूल नाम बनाते हैं | हर स्रोत को एक `prefix` दें। |
| `Tool execution failed: <name>` और इससे ज़्यादा कुछ नहीं | कारण में आंतरिक विवरण हो सकते हैं, इसलिए वह छिपा है | इवेंट लॉग में run पढ़ें, या डेवलपमेंट के दौरान `exposeErrorDetails: true` सेट करें। |
| कॉल का timeout हो जाता है | टूल धीमा है (अक्सर एक एजेंट) | एजेंट के `limits` छोटे करें; क्लाइंट का timeout बढ़ाएँ (Claude Code: `MCP_TOOL_TIMEOUT`); या ऐसा क्लाइंट इस्तेमाल करें जो [प्रगति सूचनाएँ](#progress-notifications) मिलने पर अपना timeout फिर से शुरू करता हो। |
| परिणाम कटे हुए हैं | आकार की सीमाएँ (`truncated: true`) या क्लाइंट की अपनी सीमा | `maxResponseBytes`, `maxRows`, `maxFileBytes` बढ़ाएँ; Claude Code: `MAX_MCP_OUTPUT_TOKENS`। |
| कोई लिखने वाला टूल "Approval no decision within 50000 ms" जवाब देता है | किसी ने समय पर मंज़ूरी नहीं दी | जल्दी मंज़ूरी दें (देखें [मंज़ूरियाँ](#approvals-a-human-says-yes-first)), `approvalTimeoutMs` बढ़ाएँ, या सोच-समझकर `requiresApproval: false` सेट करें। |
| `events/` या `golden-traces/` जैसे फ़ोल्डर अनपेक्षित जगहों पर दिखते हैं | इवेंट लॉग के लिए absolute पाथ नहीं (या SDK का पुराना वर्ज़न) | `eventStore: new FileEventStore(<absolute path>)` दें। मौजूदा वर्ज़न अपने दूसरे फ़ोल्डर सिर्फ़ इस्तेमाल होने पर बनाते हैं। |
| `Cannot find module 'node:sqlite'` | Node.js 22.13 से पुराना है | Node.js अपग्रेड करें, या `better-sqlite3` इस्तेमाल करें। |
| `… is not JSON. For a YAML spec, parse it yourself` | OpenAPI spec YAML में है | इसे पार्स करें (`yaml` पैकेज) और ऑब्जेक्ट को `spec` के रूप में दें। |
| `cannot resolve the server URL "/v3"` | spec में सापेक्ष सर्वर है और उसे फ़ाइल से लोड किया गया | `baseUrl` दें। |
| Inspector शुरू होने से मना करता है | इसके [दस्तावेज़](https://modelcontextprotocol.io/docs/tools/inspector) Node.js 22.19+ माँगते हैं (2026-09-24 को जाँचा गया) | Inspector चलाने के लिए Node.js अपग्रेड करें (आपका सर्वर 20+ पर रह सकता है)। |
| सिर्फ़ 2026-07-28 प्रोटोकॉल बोलने वाला क्लाइंट नहीं जुड़ पाता | सर्वर 2024-10-07 से 2025-11-25 तक के संशोधन स्वीकार करता है (MCP TypeScript SDK 1.30) | ऐसा क्लाइंट इस्तेमाल करें जो पहले के संशोधनों का समर्थन करता हो। अपने [दस्तावेज़ों](https://modelcontextprotocol.io/docs/tools/inspector) के अनुसार Inspector दोनों "युगों", legacy और 2026-07-28, पर बातचीत कर लेता है (2026-09-24 को जाँचा गया)। |
| घटना अलर्ट चालू होने पर, ठुकराई गई हर MCP कॉल एक अलर्ट बन जाती है | विफल MCP कॉल एक विफल run है | `when: (event) => event.metadata?.agentId !== 'mcp:docs'` से फ़िल्टर करें, या इसकी गंभीरता कम करें। |

### क्या हुआ, यह पढ़ना {#reading-what-happened}

हर कॉल और हर रिसोर्स को पढ़ना एक run है। डिफ़ॉल्ट फ़ाइल स्टोर के साथ, हर run आपके `events/` फ़ोल्डर में एक JSON फ़ाइल है; कोड से:

```ts
const store = new FileEventStore('/absolute/path/events');
for (const runId of await store.getRunIds()) {
  const events = await store.getEvents(runId);
  const first = events[0];
  if (first?.metadata?.agentId === 'mcp:docs') {
    console.log(runId, events.map((event) => event.type).join(' → '));
  }
}
```

एक टूल कॉल ऐसे पढ़ी जाती है: `run.started → action.executing → policy.checked → tool.called → action.executed → run.completed`; एक रिसोर्स को पढ़ना: `run.started → resource.read → run.completed`, जहाँ `resource.read` में URI, आकार और सर्व की गई चीज़ का SHA-256 होता है। देखें [इवेंट सूची](../reference/events)।
