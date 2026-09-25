# आर्किटेक्चर

![SDK का आर्किटेक्चर](/images/architecture.svg){.illustration}

## संज्ञानात्मक परत (v0.2) {#cognitive-layer-v0-2}

वर्ज़न 0.2 नीचे बताए गए नियंत्रित runtime के ऊपर तर्क की एक परत जोड़ता है। यह छोटे, बदले जा सकने वाले हिस्सों से बनी है:

| हिस्सा | Module | ज़िम्मेदारी |
| --- | --- | --- |
| `CognitiveAgent` | `src/cognition/cognitive-agent.ts` | run का चक्र, रद्द करना, timeout, फ़ीडबैक |
| `OperationSelector` | `src/cognition/operation-selector.ts` | उपलब्ध ऑपरेशन निकालता है, कंट्रोलर से पूछता है, अंतिम निर्णय थोपता है |
| कंट्रोलर | `src/cognition/cognitive-controller.ts`, `typed-decision-controller.ts` | अगले ऑपरेशन का ह्यूरिस्टिक और Jev-आधारित चुनाव |
| `OperationPerformer` | `src/cognition/operation-performer.ts` | काम को विचार जनरेटर, जानकारी खोजने वाले, पूर्वानुमान परखने वाले या आकलनकर्ता को भेजता है |
| पैच का प्रवेश | `src/cognition/patch-admission.ts`, `thought-fields.ts`, `thought-patch.ts` | हर विचार का एकमात्र प्रवेश-द्वार: हर ऑपरेशन के लिए अनुमत फ़ील्ड, सिर्फ़ इंजन वाले फ़ील्ड, निर्णय का निपटारा |
| साक्ष्य | `src/cognition/observation-records.ts`, `evidence-transitions.ts`, `contradiction-transitions.ts` | अवलोकनों का उद्गम, तथ्यों में संशोधन, तुलनाएँ, परीक्षण परिणाम, विरोधाभास और उनके समाधान |
| स्थिति का दृश्य | `src/cognition/mental-state-view.ts` | विचार के prompts और कंट्रोलर डेटासेट के लिए स्थिति का संक्षिप्त दृश्य: तैयारी, रैंकिंग, पहले से किए गए प्रयोग |
| `PredictionTester` | `src/cognition/outcome-evaluator.ts` | किसी लंबित पूर्वानुमान पर आपका `OutcomeEvaluator` चलाता है और रिपोर्ट दर्ज करता है |
| निष्कर्ष गार्ड | `src/cognition/decision-readiness.ts` | रैंकिंग, तैयारी-जाँच, committed / provisional / abstain |
| `LLMThoughtGenerator` | `src/cognition/llm-thought-generator.ts`, `thought-prompts.ts` | हर ऑपरेशन के लिए एक prompt, सख़्त JSON, Zod सत्यापन, एक सुधार |
| `InformationSeeker` | `src/cognition/information-seeker.ts` | मूल तर्क इंजन से टूल का चुनाव, एक्शन इंजन के ज़रिए execution |
| Reducer | `src/cognition/mental-state-reducer.ts`, `hypothesis-transitions.ts` | अपरिवर्तनीय नियमों के साथ विचार-पैचों का शुद्ध, नियतात्मक अनुप्रयोग, `schemaVersion` से वर्ज़न किया हुआ |
| रीप्ले | `src/cognition/mental-state-replay.ts` | इवेंट्स से मानसिक स्थिति का पुनर्निर्माण और कंट्रोलर डेटासेट |
| प्रोफ़ाइल | `src/cognition/thinker-profile.ts`, `profile-distiller.ts`, `profile-learning.ts` | प्रोफ़ाइल स्कीमा, प्रस्तुति, निखार, सार निकालना |
| आकलनकर्ता | `src/cognition/hypothesis-assessor.ts` | टाइप्ड निर्णयों के साथ `compare`: साक्ष्य विचारक के बिना पूछे जाते हैं, मेल सिर्फ़ प्रस्तावों के लिए पूछा जाता है |
| रिकॉर्डर और factory | `src/cognition/cognitive-run-recorder.ts`, `create-cognitive-agent.ts` | संज्ञानात्मक run के इवेंट्स का आकार; कॉन्फ़िगरेशन और SDK सेवाओं से एजेंट को जोड़कर बनाना |

इसके आसपास: `src/decisions` (टाइप्ड निर्णय, Jev क्लाइंट, निर्णय सेवा), `src/costs` (कीमतें और run की लागत), `src/resilience` (retry नीति और दोबारा प्रयास करने वाला प्रदाता), `src/incidents` (नियम, notifiers, निगरानी वाला इवेंट स्टोर), `src/mcp` (सर्वर और क्लाइंट, `@sdk-ai-agents/core/mcp` के रूप में प्रकाशित) और `src/study` (अध्ययन, जो प्रदाताओं, इवेंट स्टोर, नियंत्रित टूल execution और लागत को दोबारा इस्तेमाल करते हैं, पर संज्ञानात्मक इंजन को नहीं)।

इस पेज का बाकी हिस्सा नियंत्रित runtime (v0.1) का वर्णन करता है।

## कार्यकारी सारांश {#executive-summary}

SDK_AI_Agents तर्क और कार्रवाई के बीच सख़्त अलगाव वाले इवेंट-सोर्सिंग आर्किटेक्चर का पालन करता है। SDK आंतरिक जटिलता को एक सरल, सहज API के पीछे छिपाता है।

## आर्किटेक्चर पैटर्न {#architecture-pattern}

**मुख्य पैटर्न:** ज़िम्मेदारियों के अलगाव के साथ इवेंट सोर्सिंग

- **Reasoning Engine**: LLM से इरादे बनाता है (कोई side effect नहीं)
- **Action Engine**: सत्यापन के बाद इरादों को लागू करता है
- **Policy Engine**: इरादों को नीतियों के सामने सत्यापित करता है
- **Event Store**: सभी इवेंट्स के लिए सच का एकमात्र स्रोत

## घटकों का अवलोकन {#component-overview}

### 1. SDK API परत (Facade) {#_1-sdk-api-layer-facade}

**ज़िम्मेदारियाँ:**
- सरल, सहज सार्वजनिक interface
- API → आंतरिक इवेंट्स की मैपिंग
- समझदारी वाला डिफ़ॉल्ट कॉन्फ़िगरेशन
- SDK और एजेंट के जीवनचक्र का प्रबंधन

**फ़ाइलें:**
- `src/sdk.ts`: मुख्य implementation (`SDKImpl`)
- `src/agent.ts`: एजेंट का implementation (`AgentImpl`)
- `src/index.ts`: सार्वजनिक exports

**मुख्य interfaces:**
```typescript
interface SDK {
  createAgent(config: AgentConfig): Agent
  defineTool(tool: ToolDefinition): Tool
  replay(runId: string): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  defineGlobalPolicy(policy: Policy): void
}

interface Agent {
  run(input: RunInput): Promise<RunResult>
}
```

### 2. Reasoning Engine {#_2-reasoning-engine}

**ज़िम्मेदारियाँ:**
- LLM प्रदाता (OpenAI/Anthropic) के साथ इंटीग्रेशन
- LLM के जवाबों से संरचित इरादे बनाना
- बातचीत के संदर्भ का प्रबंधन
- तर्क से जुड़े इवेंट्स जारी करना

**फ़ाइल:** `src/engines/reasoning-engine.ts`

**बाध्यताएँ:**
- कभी सीधे कोई टूल नहीं चला सकता
- कभी कोई side effect पैदा नहीं कर सकता
- सिर्फ़ संरचित इरादे बनाता है

**निर्भरताएँ:**
- LLM Provider (Strategy Pattern)
- Event Store (इवेंट जारी करना)

### 3. Action Engine {#_3-action-engine}

**ज़िम्मेदारियाँ:**
- इरादे प्राप्त करना और सत्यापित करना
- Tool Registry के ज़रिए टूल चलाना
- Policy Engine के ज़रिए नीतियाँ लागू करना
- कार्रवाई से जुड़े इवेंट्स जारी करना

**फ़ाइल:** `src/engines/action-engine.ts`

**बाध्यताएँ:**
- हर कार्रवाई को Action Engine से होकर गुज़रना होगा
- चलाने से पहले सत्यापन ज़रूरी
- हर कार्रवाई के लिए इवेंट जारी होता है

**निर्भरताएँ:**
- Policy Engine (सत्यापन)
- Tool Registry (execution)
- Event Store (इवेंट जारी करना)
- Approval Manager (वैकल्पिक)
- Budget Tracker (वैकल्पिक)

### 4. Policy Engine {#_4-policy-engine}

**ज़िम्मेदारियाँ:**
- सक्रिय नीतियों के सामने इरादों को सत्यापित करना
- ग्लोबल और खास नीतियाँ लागू करना
- बजट, timeouts, अनुमति-सूचियाँ जाँचना
- सत्यापन से जुड़े इवेंट्स जारी करना

**फ़ाइल:** `src/engines/policy-engine.ts`

**बाध्यताएँ:**
- डिफ़ॉल्ट रूप से मना: जब तक स्पष्ट रूप से अनुमति न हो, सब कुछ मना है
- हर कार्रवाई से पहले अनिवार्य जाँच

**निर्भरताएँ:**
- Event Store (सत्यापन इवेंट जारी करना)
- Budget Tracker (वैकल्पिक)
- Condition Evaluator

### 5. Replay Engine {#_5-replay-engine}

**ज़िम्मेदारियाँ:**
- सहेजे गए इवेंट्स से executions को रीप्ले करना
- LLM कॉल के बिना नियतात्मक रीप्ले
- नए रीप्ले इवेंट बनाना

**फ़ाइल:** `src/engines/replay-engine.ts`

**बाध्यताएँ:**
- रीप्ले सिर्फ़ सहेजे गए इवेंट्स इस्तेमाल करता है
- रीप्ले के दौरान कोई LLM कॉल नहीं
- रीप्ले वही तार्किक क्रम दोहराता है

**निर्भरताएँ:**
- Event Store (इवेंट पढ़ना)
- Action Engine (इरादों को लागू करना)

### 6. Event Store {#_6-event-store}

**ज़िम्मेदारियाँ:**
- इवेंट्स सहेजना (सिर्फ़ जोड़ना, append-only)
- runId से इवेंट्स निकालना
- इवेंट्स को फ़िल्टर करना और उन पर क्वेरी करना
- अलग-अलग implementations के लिए abstraction

**फ़ाइलें:**
- `src/stores/event-store.ts`: `IEventStore` interface
- `src/stores/file-event-store.ts`: फ़ाइल पर आधारित implementation
- `src/stores/sql-event-store.ts`: सामान्य SQL implementation
- `src/stores/sqlite-event-store.ts`: SQLite implementation
- `src/stores/postgresql-event-store.ts`: PostgreSQL implementation
- `src/stores/observed-event-store.ts`: जोड़ा गया हर इवेंट लाइव अपने listeners तक पहुँचाता है (`onEvent`, `sdk.subscribe`)

**Interface:**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  queryEvents?(filters?: EventFilters): Promise<EventQueryResult>
  backup?(): Promise<BackupData>
  restore?(backupData: BackupData): Promise<void>
  subscribe?(listener: LiveEventListener, filter?: LiveEventFilter): EventSubscription
}
```

### 7. Tool Registry {#_7-tool-registry}

**ज़िम्मेदारियाँ:**
- घोषित टूल का प्रबंधन
- इनपुट स्कीमा का सत्यापन (Zod)
- सत्यापन के साथ टूल चलाना
- सख़्त अनुमति-सूची (डिफ़ॉल्ट रूप से मना)

**फ़ाइल:** `src/registry/tool-registry.ts`

**बाध्यताएँ:**
- अघोषित टूल का अपने-आप इनकार
- चलाने से पहले अनिवार्य सत्यापन
- सख़्त अनुमति-सूची

**निर्भरताएँ:**
- Zod (स्कीमा सत्यापन)

### 8. Capability Registry {#_8-capability-registry}

**ज़िम्मेदारियाँ:**
- क्षमताओं (टूल के समूहों) का प्रबंधन
- टूल ↔ क्षमता का जुड़ाव

**फ़ाइल:** `src/registry/capability-registry.ts`

### 9. LLM प्रदाता abstraction {#_9-llm-provider-abstraction}

**ज़िम्मेदारियाँ:**
- LLM प्रदाताओं के बीच के अंतर छिपाना
- अनुरोध/जवाब के फ़ॉर्मेट को एक जैसा बनाना
- कई प्रदाताओं का समर्थन (OpenAI, Anthropic)
- अपने-आप फ़ॉलबैक

**फ़ाइलें:**
- `src/providers/llm-provider.ts`: `LLMProvider` interface
- `src/providers/openai-provider.ts`: OpenAI implementation
- `src/providers/anthropic-provider.ts`: Anthropic implementation
- `src/providers/fallback-provider.ts`: फ़ॉलबैक वाला प्रदाता
- `src/providers/provider-factory.ts`: प्रदाता बनाने के लिए factory

**Interface:**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
  readonly nativeToolMessages?: boolean // tool calls and results in the vendor's format
}
```

### 10. Manager classes {#_10-manager-classes}

**ज़िम्मेदारियाँ:**
- उन्नत सुविधाओं का प्रबंधन
- घटकों के बीच तालमेल

**फ़ाइलें:**
- `src/managers/approval-manager.ts`: इंसानी मंज़ूरी का प्रबंधन
- `src/managers/budget-tracker.ts`: बजट और उपयोग का हिसाब
- `src/managers/golden-trace-manager.ts`: गोल्डन ट्रेस का प्रबंधन
- `src/managers/regression-test-manager.ts`: टेस्ट सूट का प्रबंधन
- `src/managers/assertion-manager.ts`: assertions का प्रबंधन
- `src/managers/impact-analysis-manager.ts`: असर के विश्लेषण का प्रबंधन

## डेटा आर्किटेक्चर {#data-architecture}

### इवेंट के टाइप {#event-types}

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.stopped'
  | 'intention.generated'
  | 'intention.rejected' // never recorded by the SDK
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed' // never recorded by the SDK
  | 'resource.read'
  | 'provider.fallback'
  | 'provider.retry'
  | 'provider.answer_discarded'
  | 'tool.retry'
  | 'incident.reported'
  | 'error.occurred' // never recorded by the SDK
  | 'cognition.started'
  | 'cognition.operation_selected'
  | 'cognition.thought'
  | 'cognition.operation_failed'
  | 'cognition.concluded'
  | 'cognition.evaluated'
  | 'cognition.feedback'
  | 'cognition.knowledge_recorded'
  | 'decision.evaluated'
  | 'study.started'
  | 'study.passage_started'
  | 'study.passage_completed'
  | 'study.search'
  | 'study.model_called'
  | 'study.drift_rejected'
  | 'study.amendment_accepted'
  | 'study.amendment_refused'
  | 'study.result_recorded'
  | 'study.completed'
  | 'study.failed';
```

### इवेंट की संरचना {#event-structure}

```typescript
interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: Record<string, unknown>
  metadata?: EventMetadata
}
```

### इवेंट स्टोर के implementations {#event-store-implementations}

1. **FileEventStore** (MVP के लिए)
   - फ़ाइल पर आधारित सहेजना
   - हर runId की एक JSON फ़ाइल
   - बैच में अपने-आप लिखना (flush)

2. **SQLEventStore** (production के लिए)
   - सामान्य SQL implementation
   - SQLite और PostgreSQL का समर्थन
   - प्रदर्शन के लिए indexes

3. **PostgreSQLEventStore** (उन्नत production के लिए)
   - कुशल भंडारण के लिए JSONB इस्तेमाल करता है
   - JSON क्वेरियों के लिए GIN indexes
   - उन्नत क्वेरी का समर्थन

## API डिज़ाइन {#api-design}

### SDK शुरू करना {#sdk-initialization}

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### एजेंट बनाना {#agent-creation}

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### टूल की परिभाषा {#tool-definition}

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### एजेंट चलाना {#agent-execution}

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## टेस्टिंग की रणनीति {#testing-strategy}

### यूनिट टेस्ट {#unit-tests}

- हर module के लिए यूनिट टेस्ट
- Vitest का इस्तेमाल
- बाहरी निर्भरताओं की mocking

### इंटीग्रेशन टेस्ट {#integration-tests}

- पूरे कार्य-प्रवाहों के लिए इंटीग्रेशन टेस्ट
- अलग-अलग इवेंट स्टोर के साथ टेस्ट
- रीप्ले टेस्ट

### गोल्डन ट्रेस {#golden-traces}

- रिग्रेशन टेस्ट के लिए संदर्भ ट्रेस
- रीप्ले के ज़रिए व्यवहार का सत्यापन
- रिग्रेशन का अपने-आप पता लगाना

## डिप्लॉयमेंट आर्किटेक्चर {#deployment-architecture}

### पैकेज का वितरण {#package-distribution}

- **पैकेज का नाम**: `@sdk-ai-agents/core`
- **वितरण**: npm
- **Entry point**: `dist/index.js`
- **टाइप परिभाषाएँ**: `dist/index.d.ts`

### बिल्ड प्रक्रिया {#build-process}

1. TypeScript का compilation (`tsc`)
2. Source maps बनाए जाते हैं
3. Declaration फ़ाइलें बनाई जाती हैं
4. आउटपुट `dist/` में

### निर्भरताएँ {#dependencies}

**Runtime:**
- `openai`: ^4.20.0
- `@anthropic-ai/sdk`: ^0.71.2
- `uuid`: ^9.0.1
- `zod`: ^3.22.4

**Peer dependencies:**
- `pg`: ^8.11.0 (PostgreSQLEventStore के लिए)

**Dev dependencies:**
- `typescript`: ^5.3.2
- `vitest`: ^1.0.4
- `@biomejs/biome`: ^1.7.0

## सुरक्षा से जुड़ी बातें {#security-considerations}

### डिफ़ॉल्ट रूप से मना (Deny-by-Default) {#deny-by-default}

- सभी टूल स्पष्ट रूप से घोषित होने चाहिए
- सभी कार्रवाइयों को Policy Engine से होकर गुज़रना होगा
- चलाने से पहले अनिवार्य सत्यापन

### ज़िम्मेदारियों का अलगाव {#separation-of-concerns}

- Reasoning Engine टूल नहीं चला सकता
- Action Engine चलाने से पहले सत्यापन करता है
- Policy Engine सभी कार्रवाइयों की जाँच करता है

### ऑडिट ट्रेल {#audit-trail}

- सभी इवेंट सहेजे जाते हैं
- निर्णयों की पूरी ट्रेसबिलिटी
- नीतियों का ऑडिट ट्रेल

## प्रदर्शन से जुड़ी बातें {#performance-considerations}

### इवेंट स्टोर का प्रदर्शन {#event-store-performance}

- FileEventStore: बैच में लिखना (10 इवेंट या 100ms)
- SQLEventStore: तेज़ क्वेरी के लिए indexes
- PostgreSQLEventStore: JSONB + GIN indexes

### SDK का अतिरिक्त भार {#sdk-overhead}

- न्यूनतम अतिरिक्त भार (< 5-10ms, LLM/टूल को छोड़कर)
- एसिंक्रोनस इवेंट जारी करना
- प्रदर्शन के लिए बैच में लिखना

## भविष्य की बातें {#future-considerations}

### स्केलेबिलिटी {#scalability}

- वितरित इवेंट स्टोर (Kafka जैसा) की ओर जाना
- कई instances का समर्थन
- इवेंट स्टोर की clustering

### सुविधाएँ {#features}

- अतिरिक्त LLM प्रदाताओं का समर्थन
- क्लाउड इवेंट स्टोर (S3, आदि)
- निगरानी डैशबोर्ड
