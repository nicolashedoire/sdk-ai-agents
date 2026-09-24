# 5 मिनट में आपका पहला MCP सर्वर

हम एक छोटा-सा MCP सर्वर बनाएँगे जो एक टीम-सूची से "बिलिंग का ज़िम्मेदार कौन है?" का जवाब देता है, उसे बिना किसी AI के परखेंगे, फिर उसे Claude Desktop और Claude Code से जोड़ेंगे। हर कमांड दी गई है; कुछ भी मानकर नहीं चला गया है। अगर कोई शब्द साफ़ न हो, तो देखें [MCP आसान भाषा में](./mcp)।

## आपको क्या चाहिए {#what-you-need}

- **Node.js 20.11 या उसके बाद का** — `node --version` से जाँचें। (SQLite वाली रेसिपी को 22.13+ चाहिए। MCP Inspector के दस्तावेज़ 22.19+ माँगते हैं।)
- एक टर्मिनल।
- किसी AI ऐप से सर्वर इस्तेमाल करने के लिए: [Claude Desktop](https://claude.ai/download) या [Claude Code](https://code.claude.com/docs)। पहले कदमों के लिए ज़रूरी नहीं।

किसी API key की ज़रूरत नहीं है: यह सर्वर किसी भाषा मॉडल को कॉल नहीं करता। इसे इस्तेमाल करने वाले AI एप्लिकेशन के पास अपनी key होती है।

## 1. प्रोजेक्ट बनाएँ {#_1-create-the-project}

```sh
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28 @modelcontextprotocol/sdk@^1.30.0
npm install --save-dev tsx
```

हर लाइन क्या करती है:

| कमांड | क्यों |
| --- | --- |
| `npm init -y` | `package.json` बनाती है, वह फ़ाइल जो आपके प्रोजेक्ट की dependencies की सूची रखती है। |
| `npm pkg set type=module` | आधुनिक JavaScript modules (`import`) इस्तेमाल करती है। SDK को इसकी ज़रूरत है। |
| `npm install @sdk-ai-agents/core …` | यह SDK, zod (arguments का वर्णन करने के लिए) और आधिकारिक MCP SDK इंस्टॉल करती है, 1.x के भीतर वर्ज़न 1.30 या उसके बाद का (वह वर्ज़न जिसके साथ यह SDK परखा गया है)। |
| `npm install --save-dev tsx` | TypeScript फ़ाइलों को बिना बिल्ड कदम के सीधे चलाती है। |

## 2. सर्वर लिखें {#_2-write-the-server}

`server.ts` नाम की एक फ़ाइल बनाएँ:

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';
import { z } from 'zod';

// 1. The data your tool reads. A real server would call an API or a database here.
const team = [
  { name: 'Ada', role: 'Billing', email: 'ada@example.com' },
  { name: 'Linus', role: 'Infrastructure', email: 'linus@example.com' },
  { name: 'Grace', role: 'Customer support', email: 'grace@example.com' },
];

// 2. The SDK. No model key: this server does not call a language model itself.
//    The event log (one file per call) is written next to this file, in events/.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

// 3. One tool: a name, a description the model reads, its arguments, and the code.
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team (billing, infrastructure, support…)',
  schema: z.object({
    topic: z.string().describe('What the person is in charge of, for example "billing"'),
  }),
  metadata: { readOnly: true },
  handler: async ({ topic }) =>
    team.filter((person) => person.role.toLowerCase().includes(topic.toLowerCase())),
});

// 4. Serve it. Only the tools listed here are visible to AI applications.
await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

इसे ऊपर से नीचे पढ़ें:

1. **डेटा** — यहाँ फ़ाइल में एक सूची; असल ज़िंदगी में, आपका API, फ़ाइलें या डेटाबेस।
2. **SDK** — यह हर कॉल को नियंत्रित पाइपलाइन से गुज़ारता है और उसे इवेंट लॉग में लिखता है। लॉग फ़ाइल के बगल में (`import.meta.dirname`) जाता है, क्योंकि AI ऐप सर्वरों को ऐसी working directory से शुरू करते हैं जिसे आप नहीं चुनते।
3. **टूल** — **नाम** और **विवरण** वह है जिसे मॉडल यह तय करने के लिए पढ़ता है कि इसे कब कॉल करना है, इसलिए इन्हें ऐसे पाठक के लिए लिखें जो आपके कोड के बारे में कुछ नहीं जानता। **स्कीमा** arguments की सूची देता है; SDK इसे उस JSON Schema में बदलता है जो MCP क्लाइंट देखते हैं, और मेल न खाने वाली कॉल ठुकरा देता है। `readOnly: true` क्लाइंट को बताता है कि टूल कुछ नहीं बदलता।
4. **सर्वर** — `serveMcpOverStdio` standard input और output पर MCP बोलता है। `tools` सूची ज़रूरी है: जो टूल आपने सूचीबद्ध नहीं किया वह कभी नहीं दिखता, भले ही वह परिभाषित हो।

## 3. इसे चलाएँ {#_3-run-it}

```sh
npx tsx server.ts
```

आपको सिर्फ़ यह दिखना चाहिए, और कुछ नहीं:

```text
MCP server "team" ready on stdio, waiting for a client
```

**यह अटका हुआ लगता है — यह सामान्य है।** एक stdio सर्वर इंतज़ार करता है कि कोई AI ऐप उसके input के ज़रिए उससे बात करे। इसे रोकने के लिए <kbd>Ctrl</kbd>+<kbd>C</kbd> दबाएँ। आप इसे शायद ही कभी खुद शुरू करेंगे: यह काम AI ऐप करता है।

::: danger stdout पर कभी कुछ न छापें
stdio सर्वर में, standard output **ही** प्रोटोकॉल है। आपके कोड में एक `console.log` संदेशों को बिगाड़ देता है और क्लाइंट डिस्कनेक्ट हो जाता है। अपने संदेशों के लिए `console.error` इस्तेमाल करें: यह standard error पर जाता है, जिसे क्लाइंट अपने लॉग में रखते हैं।
:::

## 4. MCP Inspector से इसे परखें {#_4-test-it-with-the-mcp-inspector}

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) आधिकारिक टेस्ट टूल है: एक वेब पेज (या कमांड लाइन) जो MCP क्लाइंट की तरह काम करता है, ताकि आप बिना किसी AI के अपना सर्वर आज़मा सकें। इसके दस्तावेज़ Node.js 22.19 या उसके बाद का माँगते हैं (2026-09-24 को जाँचा गया)।

```sh
npx @modelcontextprotocol/inspector npx tsx server.ts
```

कमांड एक बार इस्तेमाल होने वाले token के साथ एक पता छापती है; उसे अपने ब्राउज़र में खोलें, **Connect** पर क्लिक करें, **Tools** खोलें, **List Tools** पर क्लिक करें, `find_colleague` चुनें, `billing` टाइप करें और उसे चलाएँ। आपको Ada मिलती है।

टर्मिनल पसंद है? कमांड लाइन से वही जाँचें:

```sh
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name find_colleague --tool-arg topic=billing
```

`inspector` के बाद (या `--cli` के बाद) की हर चीज़ वह कमांड है जो आपका सर्वर शुरू करती है।

## 5. इसे Claude Desktop से जोड़ें {#_5-connect-it-to-claude-desktop}

Claude Desktop शुरू किए जाने वाले सर्वरों को एक कॉन्फ़िगरेशन फ़ाइल से पढ़ता है। इसे ऐप से खोलें: **Claude menu → Settings… → Developer → Edit Config**। फ़ाइल यह है:

| सिस्टम | पाथ |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

अपना सर्वर `mcpServers` के नीचे जोड़ें, `server.ts` के **absolute पाथ** के साथ (इसे पाने के लिए प्रोजेक्ट फ़ोल्डर में `pwd` चलाएँ; Windows पर, `cd`):

::: code-group

```json [macOS]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/you/my-mcp-server/server.ts"]
    }
  }
}
```

```json [Windows]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\you\\my-mcp-server\\server.ts"]
    }
  }
}
```

:::

फिर **Claude Desktop को पूरी तरह बंद करें और दोबारा शुरू करें**: यह फ़ाइल सिर्फ़ शुरू होते समय पढ़ता है। आपका सर्वर कनेक्टरों की सूची में दिखता है (संदेश बॉक्स का "+" बटन, फिर **Connectors**)। पूछें: *"मेरी टीम में बिलिंग का ज़िम्मेदार कौन है?"* — Claude `find_colleague` इस्तेमाल करने के लिए आपकी अनुमति माँगता है, फिर जवाब देता है "Ada"।

अगर यह नहीं दिखता:

- JSON जाँचें (एक छूटा हुआ comma ही उसे तोड़ने के लिए काफ़ी है) और यह भी कि पाथ absolute है;
- अगर लॉग कहता है कि `npx` या `node` नहीं मिल रहा (यह आम है जब Node.js को nvm से इंस्टॉल किया गया हो), तो `"npx"` की जगह `which npx` (macOS) या `where npx` (Windows) से मिला पूरा पाथ लिखें;
- लॉग पढ़ें: macOS पर `~/Library/Logs/Claude/mcp*.log`, Windows पर `%APPDATA%\Claude\logs\mcp*.log`। `mcp-server-team.log` में वह है जो आपके सर्वर ने standard error पर लिखा।

ये पाथ और मेनू सितंबर 2026 तक के MCP दस्तावेज़ों ([Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)) से लिए गए हैं; अगर Claude Desktop बदल गया हो, तो वह पेज देखें।

## 6. इसे Claude Code से जोड़ें {#_6-connect-it-to-claude-code}

एक कमांड, किसी भी फ़ोल्डर से (पाथ बदलें):

```sh
claude mcp add team -- npx -y tsx /Users/you/my-mcp-server/server.ts
```

- `--` के बाद की हर चीज़ वह कमांड है जो आपका सर्वर शुरू करती है।
- सर्वर सिर्फ़ मौजूदा प्रोजेक्ट के लिए जोड़ा जाता है (`--scope local`, डिफ़ॉल्ट)। अपने सभी प्रोजेक्ट के लिए `--scope user` इस्तेमाल करें, या इसे एक `.mcp.json` फ़ाइल में लिखने के लिए `--scope project`, जिसे आप commit और साझा कर सकते हैं।
- Environment variables (जैसे कोई API token जिसकी आपके सर्वर को ज़रूरत है): `claude mcp add team -e API_TOKEN=… -- npx -y tsx /path/server.ts`।
- इसे `claude mcp list` से जाँचें, या Claude Code के अंदर `/mcp` टाइप करें।

2026-09-24 को `claude mcp add --help` (Claude Code 2.1.173) और [Claude Code MCP दस्तावेज़ों](https://code.claude.com/docs/en/mcp) से जाँचा गया।

## 7. दूसरे एप्लिकेशन {#_7-other-applications}

ज़्यादातर MCP एप्लिकेशन यही तीन चीज़ें माँगते हैं: एक **कमांड** (`npx`), उसके **arguments** (`-y`, `tsx`, `server.ts` का absolute पाथ) और वैकल्पिक **environment variables**। उनके दस्तावेज़ देखें, जैसे [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) या [Cursor](https://cursor.com/docs/context/mcp)।

## 8. देखें कि क्या हुआ {#_8-see-what-happened}

हर कॉल इवेंट लॉग में लिखी जाती है: `server.ts` के बगल वाला `events/` फ़ोल्डर खोलें। हर फ़ाइल एक कॉल है — `mcp:team` पहचान का एक **run** — अपने कदमों के साथ:

```text
run.started       → the call arrived
action.executing  → the call is being handled
policy.checked    → the rules were checked
tool.called       → the tool ran, with its arguments
action.executed   → its result
run.completed
```

इन्हीं runs को बाकी SDK के साथ पढ़ा, रीप्ले किया, उनकी लागत निकाली और उन्हें अलर्ट में बदला जा सकता है: देखें [ट्रेसबिलिटी और रीप्ले](./observability)।

## आगे कहाँ जाएँ {#where-to-go-next}

- टीम-सूची की जगह कोई असली चीज़ लगाएँ: [एक वेब API, एक फ़ोल्डर, एक डेटाबेस या एक एजेंट — हर एक के लिए एक लाइन](./mcp-recipes)।
- सर्वर को HTTP पर अपनी टीम के साथ साझा करें, मंज़ूरियाँ और बजट जोड़ें: [डिप्लॉय करें, सुरक्षित करें और समस्या सुलझाएँ](./mcp-deploy)।
