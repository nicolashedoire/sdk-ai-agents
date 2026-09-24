# प्रोजेक्ट एक नज़र में

**प्रकार:** Library (TypeScript SDK)
**आर्किटेक्चर:** ज़िम्मेदारियों के अलगाव के साथ इवेंट सोर्सिंग

## कार्यकारी सारांश {#executive-summary}

SDK_AI_Agents, AI एजेंटों के नियंत्रण (governance) के लिए एक बुनियादी ढाँचा है, जिसमें मूल रूप से इवेंट सोर्सिंग, रीप्ले और शुरू से ही सुरक्षा शामिल है। यह SDK AI एजेंटों को प्रयोग वाले टूल से बदलकर ऐसे निर्णय लेने वाले सिस्टम बनाता है जो नियंत्रित किए जा सकें, समझाए जा सकें और production के लिए तैयार हों।

## प्रोजेक्ट का वर्गीकरण {#project-classification}

- **Repository का प्रकार:** Monolith (एक ही सुसंगत codebase)
- **प्रोजेक्ट का प्रकार:** Library (TypeScript SDK)
- **मुख्य भाषा:** TypeScript 5.x
- **आर्किटेक्चर पैटर्न:** ज़िम्मेदारियों के अलगाव के साथ इवेंट सोर्सिंग (Reasoning Engine ≠ Action Engine)

## टेक्नोलॉजी स्टैक का सारांश {#technology-stack-summary}

| श्रेणी | टेक्नोलॉजी | वर्ज़न | कारण |
|----------|-----------|---------|---------------|
| भाषा | TypeScript | 5.3.2+ | सख़्त type-safety, ESM समर्थन |
| Runtime | Node.js | 20.0.0+ | LTS समर्थन, आधुनिक सुविधाएँ |
| पैकेज मैनेजर | npm | - | Node.js का मानक पैकेज मैनेजर |
| बिल्ड टूल | TypeScript Compiler | 5.3.2 | मूल TypeScript compilation |
| टेस्टिंग | Vitest | 1.0.4 | तेज़, Vite पर आधारित test runner |
| Linting/Formatting | Biome | 1.7.0 | तेज़, सब-कुछ-एक-में टूल |
| LLM प्रदाता | OpenAI SDK | 4.20.0 | OpenAI API इंटीग्रेशन |
| LLM प्रदाता | Anthropic SDK | 0.71.2 | Claude API इंटीग्रेशन |
| सत्यापन | Zod | 3.22.4 | टूल इनपुट के लिए स्कीमा सत्यापन |
| UUID | uuid | 9.0.1 | अद्वितीय ID बनाना |
| डेटाबेस (वैकल्पिक) | PostgreSQL | 8.11.0+ | Production इवेंट स्टोर (peer dependency) |

## मुख्य सुविधाएँ {#key-features}

### मुख्य क्षमताएँ {#core-capabilities}

1. **मूल रूप से इवेंट सोर्सिंग**
   - सभी इवेंट एक इवेंट स्टोर में सहेजे जाते हैं
   - LLM कॉल के बिना नियतात्मक रीप्ले
   - हर निर्णय की पूरी ट्रेसबिलिटी

2. **तर्क और कार्रवाई का अलगाव**
   - Reasoning Engine: इरादे बनाता है (कोई side effect नहीं)
   - Action Engine: सत्यापन के बाद इरादों को लागू करता है
   - शुरू से ही सुरक्षा: LLM कभी सीधा side effect पैदा नहीं करता

3. **भीतर से बना नियंत्रण**
   - Policy Engine: चलाने से पहले इरादों को सत्यापित करता है
   - Budget Tracker: हर एजेंट/टूल/अवधि के हिसाब से लागत और उपयोग का हिसाब रखता है
   - Approval Manager: महत्वपूर्ण कार्रवाइयों के लिए इंसानी मंज़ूरी का कार्य-प्रवाह
   - Audit Trail: नीति-निर्णयों की पूरी ट्रेसबिलिटी

4. **कई प्रदाताओं वाला LLM**
   - OpenAI और Anthropic के लिए LLMProvider abstraction
   - प्रदाताओं के बीच अपने-आप फ़ॉलबैक
   - हर प्रदाता का कॉन्फ़िगरेशन (temperature, maxTokens)

5. **संज्ञानात्मक observability**
   - Reasoning Graph: तर्क की प्रक्रिया का दृश्य रूप
   - Alternatives Analysis: एजेंट द्वारा विचार किए गए विकल्प
   - Decision Patterns: कई runs में निर्णय के पैटर्न
   - Trace Visualization: दृश्य रूप के लिए ट्रेस की तैयारी

6. **टेस्टिंग और गुणवत्ता आश्वासन**
   - Golden Traces: टेस्टिंग के लिए संदर्भ ट्रेस
   - Regression Detection: रिग्रेशन का अपने-आप पता लगाना
   - Assertions: ट्रेस पर व्यवहार संबंधी assertions
   - CI/CD इंटीग्रेशन: टेस्ट परिणामों का एक्सपोर्ट (JUnit XML, JSON)

7. **उन्नत observability**
   - Run Comparison: दो executions की तुलना
   - Impact Analysis: डिप्लॉयमेंट से पहले/बाद के असर का विश्लेषण
   - Advanced Event Filtering: JSON paths के साथ इवेंट्स की उन्नत फ़िल्टरिंग

## आर्किटेक्चर की मुख्य बातें {#architecture-highlights}

### इवेंट स्टोर abstraction {#event-store-abstraction}

- **IEventStore**: सभी इवेंट स्टोर के लिए साझा interface
- **FileEventStore**: फ़ाइल पर आधारित implementation (MVP)
- **SQLEventStore**: सामान्य SQL implementation
- **SQLiteEventStore**: SQLite implementation
- **PostgreSQLEventStore**: JSONB के साथ PostgreSQL implementation

### इंजनों का आर्किटेक्चर {#engine-architecture}

- **ReasoningEngine**: LLM से इरादे बनाता है
- **ActionEngine**: सत्यापन के बाद इरादों को लागू करता है
- **PolicyEngine**: इरादों को नीतियों के सामने सत्यापित करता है
- **ReplayEngine**: इवेंट्स से executions को रीप्ले करता है

### Registry सिस्टम {#registry-system}

- **ToolRegistry**: उपलब्ध टूल सँभालता है
- **CapabilityRegistry**: क्षमताएँ (टूल के समूह) सँभालता है

### Manager सिस्टम {#manager-system}

- **ApprovalManager**: इंसानी मंज़ूरी का प्रबंधन
- **BudgetTracker**: बजट और उपयोग का हिसाब
- **GoldenTraceManager**: गोल्डन ट्रेस का प्रबंधन
- **RegressionTestManager**: रिग्रेशन टेस्ट सूट का प्रबंधन
- **AssertionManager**: व्यवहार संबंधी assertions का प्रबंधन
- **ImpactAnalysisManager**: असर के विश्लेषण का प्रबंधन

## डेवलपमेंट एक नज़र में {#development-overview}

### पहले से ज़रूरी चीज़ें {#prerequisites}

- Node.js 20.0.0+ (LTS)
- npm या उसके बराबर कोई टूल
- TypeScript 5.3.2+ (लोकल रूप से इंस्टॉल)

### शुरुआत करें {#getting-started}

```bash
# Installation
npm install

# Build
npm run build

# Tests
npm test

# Watch mode
npm run dev
```

### मुख्य कमांड {#key-commands}

- **इंस्टॉल:** `npm install`
- **बिल्ड:** `npm run build`
- **डेवलपमेंट:** `npm run dev` (watch मोड)
- **टेस्ट:** `npm test`
- **टेस्ट watch:** `npm run test:watch`
- **टेस्ट कवरेज:** `npm run test:coverage`
- **Lint:** `npm run lint`
- **फ़ॉर्मेट:** `npm run format`
- **जाँच:** `npm run check` (lint + format)

## Repository की संरचना {#repository-structure}

```
sdk-ai-agents/
├── src/                    # SDK source (cognition, decisions, engines, stores, providers, mcp…)
├── benchmarks/             # Performance tests
├── docs/                   # Documentation (VitePress)
├── examples/               # Runnable examples
└── templates/              # Starter project
```

`src/` के विवरण के लिए देखें [सोर्स ट्री](../contributing/source-tree)।

## दस्तावेज़ों का नक्शा {#documentation-map}

विस्तृत जानकारी के लिए देखें:

- [परिचय](../guide/introduction) - SDK किसलिए है
- [सोर्स ट्री](../contributing/source-tree) - डायरेक्टरी की संरचना
- [आर्किटेक्चर](./architecture) - विस्तृत आर्किटेक्चर
- [डेवलपमेंट गाइड](../contributing/development) - डेवलपमेंट का कार्य-प्रवाह
