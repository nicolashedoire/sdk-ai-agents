# सोर्स ट्री

## एक नज़र में {#overview}

SDK एक साफ़ मॉड्यूलर संरचना में व्यवस्थित है, जिसमें ज़िम्मेदारियाँ अलग-अलग हैं। मुख्य सोर्स कोड `src/` में है, हर कार्यात्मक क्षेत्र के लिए सब-फ़ोल्डरों के साथ।

## डायरेक्टरी की पूरी संरचना {#complete-directory-structure}

```
sdk-ai-agents/
├── src/
│   ├── sdk.ts                  # createSDK and the SDK facade
│   ├── agent.ts                # Governed agent (run loop)
│   ├── index.ts                # Public exports
│   ├── mcp.ts                  # Entry point of @sdk-ai-agents/core/mcp
│   ├── cognition/              # Cognitive agents: mental state, operations, controllers, profiles
│   ├── decisions/              # Typed decisions (Jev client, DecisionService)
│   ├── study/                  # Studies: charter, passages, guardian, claim statuses, dossier
│   ├── engines/                # Reasoning, action, policy and replay engines
│   ├── stores/                 # Event stores (file, SQLite, PostgreSQL)
│   ├── providers/              # LLM providers (OpenAI, Anthropic, fallback)
│   ├── managers/               # Approvals, budgets, golden traces, regressions
│   ├── registry/               # Tool and capability registries
│   ├── costs/                  # Pricing tables and run costs
│   ├── resilience/             # Retry policy and retrying provider
│   ├── incidents/              # Incident detection and notifiers
│   ├── mcp/                    # MCP server (tools and resources) and client
│   ├── tools/                  # Tool sources: OpenAPI, folder, read-only database, agents
│   ├── evaluators/             # Policy condition evaluation
│   ├── errors/                 # Error classes
│   ├── types/                  # Shared type definitions
│   ├── utils/                  # Helpers (ids, HTTP, trace analysis)
│   └── __tests__/              # Vitest suites and their in-memory test doubles (support/)
├── benchmarks/                 # Performance tests
├── docs/                       # This documentation (VitePress)
├── examples/                   # Runnable examples
├── templates/starter-template/ # Starter project using the SDK
└── .github/workflows/          # CI and documentation deployment
```

## महत्वपूर्ण डायरेक्टरी {#critical-directories}

### `src/engines/` {#src-engines}

**उद्देश्य:** SDK के मुख्य इंजन रखता है जो किसी एजेंट के जीवनचक्र का संचालन करते हैं।

**इसमें है:**
- `reasoning-engine.ts`: LLM से इरादे बनाता है (कोई side effect नहीं)
- `action-engine.ts`: Policy Engine के सत्यापन के बाद इरादों को लागू करता है
- `policy-engine.ts`: कॉन्फ़िगर की गई नीतियों के सामने इरादों को सत्यापित करता है
- `replay-engine.ts`: सहेजे गए इवेंट्स से executions को रीप्ले करता है

**Entry points:** `AgentImpl` और `SDKImpl` इन्हें इस्तेमाल करते हैं

**इंटीग्रेशन:** इंजन constructor के ज़रिए `AgentImpl` और `SDKImpl` में डाले (inject) जाते हैं

### `src/stores/` {#src-stores}

**उद्देश्य:** इवेंट्स को सहेजने के लिए `IEventStore` interface के implementations।

**इसमें है:**
- `event-store.ts`: साझा `IEventStore` interface
- `file-event-store.ts`: फ़ाइल पर आधारित implementation (MVP)
- `sql-event-store.ts`: सामान्य SQL implementation
- `sqlite-event-store.ts`: SQLite implementation
- `postgresql-event-store.ts`: JSONB के साथ PostgreSQL implementation
- `observed-event-store.ts`: जोड़ा गया हर इवेंट लाइव अपने listeners तक पहुँचाता है (`onEvent`, `sdk.subscribe`)

**Entry points:** `SDKImpl` और `ReplayEngine` इन्हें इस्तेमाल करते हैं

**इंटीग्रेशन:** कॉन्फ़िगरेशन के ज़रिए `SDKImpl` में डाले जाते हैं

### `src/providers/` {#src-providers}

**उद्देश्य:** अलग-अलग LLM प्रदाताओं के लिए `LLMProvider` interface के implementations।

**इसमें है:**
- `llm-provider.ts`: साझा `LLMProvider` interface
- `openai-provider.ts`: OpenAI implementation
- `anthropic-provider.ts`: Anthropic implementation
- `fallback-provider.ts`: अपने-आप फ़ॉलबैक वाला प्रदाता
- `provider-factory.ts`: प्रदाता बनाने के लिए factory

**Entry points:** `ReasoningEngine` इन्हें इस्तेमाल करता है

**इंटीग्रेशन:** constructor के ज़रिए `ReasoningEngine` में डाले जाते हैं

### `src/managers/` {#src-managers}

**उद्देश्य:** उन्नत सुविधाओं (मंज़ूरियाँ, बजट, टेस्ट, आदि) के प्रबंधन की classes।

**इसमें है:**
- `approval-manager.ts`: इंसानी मंज़ूरी का प्रबंधन
- `budget-tracker.ts`: बजट और उपयोग का हिसाब
- `golden-trace-manager.ts`: गोल्डन ट्रेस का प्रबंधन
- `regression-test-manager.ts`: रिग्रेशन टेस्ट सूट का प्रबंधन
- `assertion-manager.ts`: व्यवहार संबंधी assertions का प्रबंधन
- `impact-analysis-manager.ts`: असर के विश्लेषण का प्रबंधन

**Entry points:** `SDKImpl` और `PolicyEngine` इन्हें इस्तेमाल करते हैं

**इंटीग्रेशन:** constructor के ज़रिए `SDKImpl` और `PolicyEngine` में डाले जाते हैं

### `src/registry/` {#src-registry}

**उद्देश्य:** उपलब्ध टूल और क्षमताओं के प्रबंधन के लिए registries।

**इसमें है:**
- `tool-registry.ts`: उपलब्ध टूल का प्रबंधन (डिफ़ॉल्ट रूप से मना)
- `capability-registry.ts`: क्षमताओं (टूल के समूहों) का प्रबंधन

**Entry points:** `SDKImpl` और `ActionEngine` इन्हें इस्तेमाल करते हैं

**इंटीग्रेशन:** constructor के ज़रिए `SDKImpl` और `ActionEngine` में डाले जाते हैं

### `src/types/` {#src-types}

**उद्देश्य:** SDK के सभी टाइप की TypeScript परिभाषाएँ।

**इसमें है:**
- Agent, Tool, Policy, Event, Run, SDK के टाइप
- उन्नत सुविधाओं (Reasoning Graph, Alternatives, आदि) के टाइप
- टेस्टिंग (Golden Trace, Regression, Assertion, आदि) के टाइप

**Entry points:** सभी modules इन्हें import करते हैं

**इंटीग्रेशन:** type-safety के लिए पूरे codebase में इस्तेमाल होते हैं

### `src/utils/` {#src-utils}

**उद्देश्य:** उपयोगी फ़ंक्शन और helpers।

**इसमें है:**
- `constants.ts`: ग्लोबल constants
- `id.ts`: अद्वितीय ID बनाना
- `zod-to-json-schema.ts`: Zod → JSON Schema रूपांतरण
- Reasoning Graph, Alternatives, Patterns, आदि के लिए utilities
- टेस्टिंग (Validation, Regression, Assertion, आदि) के लिए utilities

**Entry points:** जिन modules को इनकी ज़रूरत है, वे इन्हें import करते हैं

**इंटीग्रेशन:** इंजन, managers और दूसरे modules इन्हें इस्तेमाल करते हैं

### `src/cognition/` (v0.2) {#src-cognition-v0-2}

**उद्देश्य:** संज्ञानात्मक एजेंट — स्पष्ट मानसिक स्थिति, संज्ञानात्मक ऑपरेशन, कंट्रोलर, विचारक प्रोफ़ाइल।

**इसमें है:** `cognitive-agent.ts` (run का चक्र), `operation-selector.ts`, `operation-performer.ts`, `cognitive-controller.ts` (ह्यूरिस्टिक), `typed-decision-controller.ts` (Jev), `hypothesis-assessor.ts`, `information-seeker.ts`, `llm-thought-generator.ts` और `thought-prompts.ts`, `mental-state.ts` (स्कीमा और टाइप), `mental-state-reducer.ts` और `hypothesis-transitions.ts`, `mental-state-replay.ts`, `thinker-profile.ts`, `profile-distiller.ts`, `create-cognitive-agent.ts`।

### `src/study/` {#src-study}

**उद्देश्य:** अध्ययन (`sdk.createStudy`) — एक शोधकर्ता जो किसी वस्तु को समझता है, फिर उसे नए सिरे से डिज़ाइन करने का प्रस्ताव रखता है, संज्ञानात्मक इंजन से अलग।

**इसमें है:** `study.ts` (`Study` class: runs, संरक्षक, संशोधन, पूर्व कार्य की खोज), `passages.ts` (सात चरण, उनके संग्रह और स्कीमा), `study-config.ts` (कॉन्फ़िगरेशन, फ़्रीज़ किया गया चार्टर और उसका hash), `study-prompts.ts` और `study-replies.ts` (हर कॉल पर नए सिरे से बने prompts, अपने स्कीमा के सामने पढ़े गए जवाब), `study-claims.ts` (कोड में जाँची गई दावों की स्थितियाँ), `study-sources.ts` (स्रोत, क्वेरी पैरामीटर, परिणाम), `study-model.ts` और `study-run.ts` (मॉडल कॉल, सीमाएँ, इवेंट), `study-report.ts`, `study-markdown.ts` और `study-labels.ts` (रिपोर्ट, और ग्यारह भाषाओं में डोज़ियर), `study-types.ts`।

### `src/decisions/` (v0.2) {#src-decisions-v0-2}

**उद्देश्य:** टाइप्ड निर्णय — Noul/Choice/Score अनुबंध, TypeSafe Jev HTTP क्लाइंट और `sdk.decisions` के पीछे का `DecisionService`।

### `src/costs/`, `src/resilience/`, `src/incidents/` (v0.2) {#src-costs-src-resilience-src-incidents-v0-2}

**उद्देश्य:** कीमतें और हर run की लागत की रिपोर्ट; retry नीति और दोबारा प्रयास करने वाला LLM प्रदाता; घटना के नियम, notifiers (ईमेल, वेबहुक, Resend) और निगरानी वाला इवेंट स्टोर।

### `src/mcp/` और `src/mcp.ts` (v0.2) {#src-mcp-and-src-mcp-ts-v0-2}

**उद्देश्य:** नियंत्रित टूल और रिसोर्स उपलब्ध कराने वाला MCP सर्वर (`mcp-server.ts`, `mcp-resources.ts`, `governed-tool-host.ts`) और टूल इम्पोर्ट करने वाला MCP क्लाइंट (`mcp-client.ts`)। `@sdk-ai-agents/core/mcp` entry point के रूप में प्रकाशित, ताकि मुख्य पैकेज `@modelcontextprotocol/sdk` पर निर्भर न रहे।

### `src/tools/` {#src-tools}

**उद्देश्य:** टूल स्रोत जो किसी सिस्टम से `ToolDefinition` बनाते हैं, MCP पर किसी निर्भरता के बिना: `openapi-spec.ts` / `openapi-call.ts` / `openapi-tools.ts` (वेब API), `folder-access.ts` / `folder-tools.ts` / `glob-pattern.ts` (फ़ोल्डर और रिसोर्स), `sql-statement-guard.ts` / `database-tools.ts` / `sqlite-read-only.ts` / `postgres-read-only.ts` / `sql-values.ts` (केवल-पढ़ने-योग्य डेटाबेस), `agent-tools.ts` (टूल के रूप में एजेंट), और साथ में `tool-names.ts` और `bounded-text.ts`।

### `src/__tests__/support/` {#src-tests-support}

**उद्देश्य:** SDK के ports लागू करने वाले टेस्ट डबल (स्क्रिप्ट किया गया LLM प्रदाता, in-memory निर्णय क्लाइंट, लोकल HTTP सर्वर, रिकॉर्ड करने वाला PostgreSQL क्लाइंट, `node:sqlite` loader) — कोई module mock नहीं।

## Entry points {#entry-points}

### मुख्य entry {#main-entry}

- **`src/index.ts`**: SDK का सार्वजनिक entry point, सभी सार्वजनिक API एक्सपोर्ट करता है

### एप्लिकेशन के entry points {#application-entry-points}

- **`src/sdk.ts`**: SDK का मुख्य implementation (`SDKImpl`)
- **`src/agent.ts`**: एजेंट का implementation (`AgentImpl`)

## फ़ाइलों को व्यवस्थित करने के पैटर्न {#file-organization-patterns}

### नाम रखने की परिपाटी {#naming-conventions}

- **फ़ाइलें**: फ़ाइलों के लिए kebab-case (जैसे `reasoning-engine.ts`)
- **Classes**: PascalCase (जैसे `ReasoningEngine`)
- **Interfaces**: PascalCase, ज़रूरत हो तो `I` prefix के साथ (जैसे `IEventStore`)
- **टाइप**: PascalCase (जैसे `EventType`, `RunStatus`)
- **फ़ंक्शन**: camelCase (जैसे `generateCompletion`)

### Modules की व्यवस्था {#module-organization}

- **हर फ़ाइल में एक class/interface**: हर फ़ाइल में एक मुख्य class या interface होता है
- **साथ रखे गए टाइप**: जुड़े हुए टाइप उसी फ़ाइल में या `types/` में
- **Barrel exports**: सार्वजनिक API एक्सपोर्ट करने के लिए `index.ts`

## कॉन्फ़िगरेशन फ़ाइलें {#configuration-files}

- **`package.json`**: Dependencies और npm scripts
- **`tsconfig.json`**: TypeScript कॉन्फ़िगरेशन (strict mode, ESM)
- **`biome.json`**: Biome कॉन्फ़िगरेशन (linting/formatting)
- **`vitest.config.ts`**: Vitest कॉन्फ़िगरेशन (टेस्टिंग)

## डेवलपमेंट के लिए नोट्स {#notes-for-development}

### नई सुविधाएँ जोड़ना {#adding-new-features}

1. **नया इंजन**: `src/engines/` में बनाएँ, `SDKImpl` या `AgentImpl` में डालें
2. **नया स्टोर**: `src/stores/` में `IEventStore` लागू करें
3. **नया प्रदाता**: `src/providers/` में `LLMProvider` लागू करें
4. **नया manager**: `src/managers/` में बनाएँ, `SDKImpl` में डालें
5. **नए टाइप**: `src/types/` में जोड़ें, `types/index.ts` से एक्सपोर्ट करें

### टेस्टिंग {#testing}

- यूनिट टेस्ट `src/__tests__/` में
- हर सोर्स module के लिए एक टेस्ट फ़ाइल
- टेस्ट के लिए Vitest इस्तेमाल करें

### बिल्ड {#build}

- TypeScript `src/` → `dist/` compile करता है
- डीबगिंग के लिए source maps बनाए जाते हैं
- TypeScript declarations (`.d.ts`) बनाए जाते हैं
