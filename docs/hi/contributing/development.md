# डेवलपमेंट गाइड

## पहले से ज़रूरी चीज़ें {#prerequisites}

### ज़रूरी {#required}

- **Node.js**: 20.0.0+ (LTS)
- **npm**: Node.js के साथ आता है
- **TypeScript**: 5.3.2+ (npm से लोकल रूप से इंस्टॉल)

### वैकल्पिक {#optional}

- **PostgreSQL**: 8.11.0+ (PostgreSQLEventStore के लिए, peer dependency)
- **Git**: वर्ज़न नियंत्रण के लिए

## Environment सेटअप {#environment-setup}

### 1. Repository क्लोन करें {#_1-clone-repository}

```bash
git clone https://github.com/nicolashedoire/sdk-ai-agents.git
cd sdk-ai-agents
```

### 2. Dependencies इंस्टॉल करें {#_2-install-dependencies}

```bash
npm install
```

### 3. Environment variables कॉन्फ़िगर करें {#_3-configure-environment-variables}

root पर एक `.env` फ़ाइल बनाएँ (वैकल्पिक, उदाहरणों के लिए):

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## लोकल डेवलपमेंट {#local-development}

### बिल्ड {#build}

TypeScript compile करें:

```bash
npm run build
```

compile किया गया कोड `dist/` में होगा।

### Watch मोड {#watch-mode}

watch मोड में compile करें (अपने-आप दोबारा compile होना):

```bash
npm run dev
```

### उदाहरण चलाएँ {#run-examples}

```bash
# Quick start example
npm run example:quick-start

# Complete example
npm run example:complete

# Test API
npm run example:test-api
```

## टेस्टिंग {#testing}

### सभी टेस्ट चलाएँ {#run-all-tests}

```bash
npm test
```

### Watch मोड {#watch-mode-1}

```bash
npm run test:watch
```

### कवरेज {#coverage}

```bash
npm run test:coverage
```

### कोई खास टेस्ट फ़ाइल चलाएँ {#run-specific-test-file}

```bash
npx vitest src/__tests__/agent.test.ts
```

## कोड की गुणवत्ता {#code-quality}

### Linting {#linting}

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### फ़ॉर्मेटिंग {#formatting}

```bash
# Format code
npm run format
```

### पूरी जाँच (Lint + Format) {#full-check-lint-format}

```bash
# Check everything
npm run check

# Fix everything automatically
npm run check:fix
```

## डेवलपमेंट के आम काम {#common-development-tasks}

### नया टूल जोड़ना {#adding-a-new-tool}

1. `sdk.defineTool()` से टूल परिभाषित करें:

```typescript
const myTool = sdk.defineTool({
  name: 'my-tool',
  description: 'Description of my tool',
  schema: z.object({
    // Zod schema
  }),
  handler: async (params) => {
    // Tool implementation
  }
});
```

2. टूल को किसी एजेंट में जोड़ें:

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-4',
  tools: [myTool]
});
```

### नई नीति जोड़ना {#adding-a-new-policy}

1. नीति परिभाषित करें:

```typescript
const myPolicy: Policy = {
  id: 'my-policy',
  type: 'custom',
  rules: [{
    condition: 'toolName === "dangerous-tool"',
    action: 'require_approval'
  }],
  scope: 'global',
  enabled: true
};
```

2. नीति लागू करें:

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### नया इवेंट स्टोर जोड़ना {#adding-a-new-event-store}

1. `IEventStore` लागू करें:

```typescript
export class MyEventStore implements IEventStore {
  async append(runId: string, event: Event): Promise<void> {
    // Implementation
  }
  
  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    // Implementation
  }
  
  // ... other methods
}
```

2. इसे SDK में इस्तेमाल करें:

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### नया LLM प्रदाता जोड़ना {#adding-a-new-llm-provider}

1. `LLMProvider` लागू करें:

```typescript
export class MyProvider implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    // Implementation
  }
  
  supportsModel(model: string): boolean {
    // Implementation
  }
  
  getProviderName(): string {
    return 'my-provider';
  }
}
```

2. इसे `ProviderFactory` में जोड़ें:

```typescript
// In provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## बिल्ड प्रक्रिया {#build-process}

### TypeScript compilation {#typescript-compilation}

बिल्ड सीधे TypeScript compiler इस्तेमाल करता है:

```bash
tsc
```

`tsconfig.json` में कॉन्फ़िगरेशन:
- **Target**: ES2022
- **Module**: ESNext
- **Module Resolution**: node
- **Strict Mode**: चालू
- **Source Maps**: चालू
- **Declaration Files**: चालू

### आउटपुट की संरचना {#output-structure}

```
dist/
├── index.js              # Entry point
├── index.d.ts            # Type declarations
├── agent.js
├── agent.d.ts
├── sdk.js
├── sdk.d.ts
└── ...                   # Other compiled files
```

## टेस्टिंग की रणनीति {#testing-strategy}

### यूनिट टेस्ट {#unit-tests}

- हर module के लिए यूनिट टेस्ट
- Vitest का इस्तेमाल
- कोई भी टेस्ट किसी असली सशुल्क सेवा को कॉल नहीं करता, और कोई भी module mock या spy इस्तेमाल नहीं करता: SDK के ports को `src/__tests__/support/` के टेस्ट डबल लागू करते हैं, और HTTP adapters, OpenAI और Anthropic प्रदाताओं सहित, लोकल सर्वरों के सामने चलते हैं। `no-mocks.test.ts` `vi.mock`, `vi.fn` और `vi.spyOn` को अस्वीकार करता है

### इंटीग्रेशन टेस्ट {#integration-tests}

- पूरे कार्य-प्रवाहों के लिए इंटीग्रेशन टेस्ट
- मॉडल या तो स्क्रिप्ट किया गया प्रदाता है, या असली OpenAI या Anthropic client जो vendor के format में जवाब देने वाले लोकल सर्वर से बात करता है; कोई भी टेस्ट असली API को कॉल नहीं करता
- अलग-अलग इवेंट स्टोर के साथ टेस्ट

### टेस्ट की संरचना का उदाहरण {#example-test-structure}

```typescript
import { describe, it, expect } from 'vitest';
import { MyClass } from '../my-class';

describe('MyClass', () => {
  it('should do something', () => {
    const instance = new MyClass();
    expect(instance.method()).toBe(expected);
  });
});
```

## डीबगिंग {#debugging}

### Source maps {#source-maps}

बिल्ड के दौरान source maps अपने-आप बनते हैं। इनसे आप सीधे TypeScript कोड को डीबग कर सकते हैं।

### VS Code में डीबगिंग {#vs-code-debugging}

`.vscode/launch.json` कॉन्फ़िगरेशन:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## कोड की शैली {#code-style}

### TypeScript के अच्छे तरीके {#typescript-best-practices}

- **Strict Mode**: हमेशा चालू
- **Type Safety**: स्पष्ट टाइप इस्तेमाल करें
- **`any` नहीं**: `any` से बचें, ज़रूरत हो तो `unknown` इस्तेमाल करें
- **Interfaces बनाम Types**: ऑब्जेक्ट के लिए interfaces, unions/intersections के लिए types को तरजीह दें

### नाम रखने की परिपाटी {#naming-conventions}

- **फ़ाइलें**: kebab-case (`my-file.ts`)
- **Classes**: PascalCase (`MyClass`)
- **फ़ंक्शन**: camelCase (`myFunction`)
- **Constants**: UPPER_SNAKE_CASE (`MY_CONSTANT`)
- **Types/Interfaces**: PascalCase (`MyType`)

### कोड की व्यवस्था {#code-organization}

- **हर फ़ाइल में एक class/interface**
- **साथ रखे गए टाइप**: टाइप उसी फ़ाइल में या `types/` में
- **Barrel exports**: सार्वजनिक exports के लिए `index.ts`

## आम समस्याएँ {#common-issues}

### TypeScript errors {#typescript-errors}

अगर आपको TypeScript errors मिलते हैं:

1. जाँचें कि `tsconfig.json` सही है
2. जाँचें कि सभी dependencies इंस्टॉल हैं
3. साफ़ करके दोबारा बिल्ड करें: `npm run clean && npm run build`

### टेस्ट विफल होना {#test-failures}

अगर टेस्ट विफल होते हैं:

1. जाँचें कि `src/__tests__/support/` के टेस्ट डबल अब भी उन interfaces से मेल खाते हैं जिनकी जगह वे लेते हैं
2. जाँचें कि dependencies अप-टू-डेट हैं
3. errors को उसी समय देखने के लिए टेस्ट watch मोड में चलाएँ

### बिल्ड errors {#build-errors}

अगर बिल्ड विफल होता है:

1. TypeScript errors जाँचें: `npm run build`
2. linting errors जाँचें: `npm run lint`
3. `dist/` फ़ोल्डर साफ़ करें: `npm run clean`

## रिलीज़ प्रक्रिया {#release-process}

### वर्ज़निंग {#versioning}

प्रोजेक्ट सिमेंटिक वर्ज़निंग (SemVer) इस्तेमाल करता है:
- **MAJOR**: पुराने इस्तेमाल को तोड़ने वाले बदलाव
- **MINOR**: पुराने इस्तेमाल के साथ संगत नई सुविधाएँ
- **PATCH**: पुराने इस्तेमाल के साथ संगत bug fixes

### रिलीज़ से पहले की जाँच-सूची {#pre-release-checklist}

- [ ] सभी टेस्ट पास होते हैं
- [ ] कोड lint और format किया गया है
- [ ] दस्तावेज़ अप-टू-डेट हैं
- [ ] CHANGELOG.md अपडेट किया गया है
- [ ] `package.json` में वर्ज़न अपडेट किया गया है

### रिलीज़ के लिए बिल्ड {#build-for-release}

```bash
# Clean
npm run clean

# Build
npm run build

# Test
npm test

# Check
npm run check
```

## संसाधन {#resources}

- **दस्तावेज़**: `docs/`
- **उदाहरण**: `examples/`
- **टाइप परिभाषाएँ**: `src/types/`
- **टेस्ट**: `src/__tests__/`

## दस्तावेज़ों की साइट {#documentation-site}

दस्तावेज़ `docs/` में एक VitePress साइट है, जिसमें `docs/public/images/` के SVGs से चित्र दिए गए हैं।

```bash
npm run docs:dev      # local preview with hot reload
npm run docs:build    # static build in docs/.vitepress/dist
npm run docs:preview  # serve the build
```

`Docs` GitHub Actions workflow इसे `main` पर हर push के साथ GitHub Pages पर प्रकाशित करता है।
