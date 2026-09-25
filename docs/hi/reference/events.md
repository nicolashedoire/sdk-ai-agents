# इवेंट सूची

हर इवेंट का एक ही लिफ़ाफ़ा (envelope) होता है:

```ts
interface Event {
  id: string;
  runId: string;
  type: EventType;
  timestamp: number;
  data: Record<string, unknown>;
  metadata?: { agentId?: string; agentVersion?: string; profileId?: string; profileVersion?: string; … };
}
```

## run का जीवनचक्र {#run-lifecycle}

| टाइप | डेटा |
| --- | --- |
| `run.started` | `input`, `mode` (`cognitive`; `study` किसी अध्ययन के run के लिए; `study-amendment` उस run के लिए जो किसी संशोधन को वर्गीकृत करता है; `tool` किसी एजेंट के बाहर की कॉल के लिए, जैसे MCP कॉल; `resource` किसी MCP रिसोर्स को पढ़ने के लिए; या नियंत्रित runs के लिए अनुपस्थित), `replayOf?` |
| `run.completed` | `output`, `decision?` (संज्ञानात्मक) |
| `run.failed` | `error`, `steps?`, `uri?` (विफल रिसोर्स पढ़ना) |
| `run.cancelled` / `run.stopped` | `reason` |

## तर्क और कार्रवाइयाँ {#reasoning-and-actions}

| टाइप | डेटा |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — या संज्ञानात्मक अंतिम उत्तर के लिए `intention` |
| `policy.checked` | `intention`, `validation`: किसी टूल कॉल पर एक्शन इंजन का फ़ैसला। नीति इंजन भी हर जाँची गई नीति के लिए एक इवेंट दर्ज करता है — `policyId`, `policyType`, `intention`, `conditionEvaluated?`, `validationResult`, `applied` (`true` जब नीति लागू हुई और उसने ठुकराया) और `reason` — टूल कॉल से पहले, और संज्ञानात्मक run के हर कदम से पहले उन बजट और timeout नीतियों के लिए जो किसी कदम पर लागू हो सकती हैं (तब `intention` होता है `{ type: 'continue' }`) |
| `policy.violated` | `intention`, `reason`, `violatedPolicies` (`allowed-tools` जब कॉल करने वाले ने ऐसा टूल इस्तेमाल किया जो उसे नहीं दिया गया था; बजट नीति का id जब उसका कॉल-बजट खत्म हो चुका हो), और `step` जब किसी बजट या timeout नीति ने संज्ञानात्मक run का कोई कदम ठुकराया हो, या `passage` जब अध्ययन का कोई चरण ठुकराया हो (तब `intention` होता है `{ type: 'continue' }`) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval` जब टूल के अपने `metadata.requiresApproval` ने इसकी माँग की), `reason?` (`cancelled before a decision` जब कॉल करने वाला हार मान गया या run रुक गया, `no decision within N ms` `approvalTimeoutMs` के बाद) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed` उस कॉल को भी दर्ज करता है जो अमान्य arguments के कारण (किसी भी नीति से पहले) ठुकराई गई, या इसलिए कि कॉल करने वाला मंज़ूरी के बाद चला गया |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `provider.answer_discarded` | `provider`, `model`, `requestedModel?`, `usage`, `reason` — ऐसा जवाब जिसका बिल vendor ने बनाया और उपयोग भी बताया, पर प्रदाता उसे इस्तेमाल नहीं कर सका (बिना किसी choice वाला OpenAI जवाब); लागत में और हर अवधि के बजट में गिना जाता है |
| `resource.read` | `uri`, `mimeType?`, `bytes`, सर्व की गई सामग्री का `sha256` (सामग्री खुद सहेजी नहीं जाती) |

`tool.failed`, `intention.rejected` और `error.occurred` टाइप `EventType` का हिस्सा हैं, लेकिन SDK इन्हें कभी दर्ज नहीं करता: विफल टूल कॉल एक `action.failed` इवेंट होती है, किसी नीति द्वारा ठुकराई गई कॉल एक `policy.violated` इवेंट, और मंज़ूरी में अस्वीकार की गई कॉल एक `approval.rejected` इवेंट।

## संज्ञान (Cognition) {#cognition}

| टाइप | डेटा |
| --- | --- |
| `cognition.started` | `schemaVersion` (2; पुराने runs में अनुपस्थित), `goal`, `context?`, `observations` (समस्या के साथ दिए गए), `commitRules`, `knowledge?` (`scope`, पहले के runs से याद किए गए `items`, स्टोर विफल होने पर `error?`), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (इंजन ने निर्णय थोपा), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?` — वे कॉल जिन्होंने इनपुट और आउटपुट tokens दोनों नहीं बताए, `unmeteredTokens?` — उनके tokens) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` — और बिल हो चुके प्रयासों के बाद रोक या समय-सीमा से बीच में रुके ऑपरेशन के लिए `model?`, `requestedModel?`, `usage?` भी |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — किसी पूर्वानुमान के परीक्षण की पूरी रिपोर्ट |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (कथन, प्रकार, दायरा, `revises?`, `difference?`, `evidence`: हर परीक्षण `runId`, `predictionId`, `verdict`, `expected`, `observed`, मूल्यांकनकर्ता के साथ), स्टोर विफल होने पर `error?`। `run.completed`, `run.failed` या `run.cancelled` के बाद जोड़ा जाता है, और सिर्फ़ तब जब run ने कुछ परखा हो |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers` (उत्तर अस्वीकार होने पर खाली), `usage?` (backend ने tokens की गिनती न बताई हो तो नहीं होता), `error?` (बिल हो चुका उत्तर क्यों अस्वीकार हुआ), `step?` |

## अध्ययन {#studies}

किसी अध्ययन के runs (`mode: 'study'`) और उसके संशोधनों को वर्गीकृत करने वाले runs (`mode: 'study-amendment'`) ये इवेंट दर्ज करते हैं। हर इवेंट अध्ययन का `id` `metadata.agentId` के रूप में और उसका नाम `metadata.studyName` के रूप में रखता है। खोजें अपनी नियंत्रित टूल कॉल के इवेंट (`action.executing`, `policy.checked`, `tool.called`, `action.executed`) भी अध्ययन के run में दर्ज करती हैं। देखें [अध्ययन](../guide/studies)।

| टाइप | डेटा |
| --- | --- |
| `study.started` | `name`, `charter` (`object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability?`, `analogues`), `charterHash` (SHA-256), `language`, `model?`, `sources` (टूल के नाम), `limits`, `driftThreshold`, `amendments` (स्वीकार किए गए: `number`, `text`), `resumeAt?` (जब कोई run फिर से शुरू होता है: वह पहला चरण जिसमें काम बाकी है) |
| `study.passage_started` | `passage`, `number` (1 से 7), `amendments` (लागू, स्वीकार किए गए संशोधनों के क्रमांक), और `reopenedBy?`, `focus?`, `reason?` जब किसी बाद के चरण ने इसे दोबारा खोला हो |
| `study.passage_completed` | `passage`, `attempts` (2 जब संरक्षक ने इसे दोबारा करवाया), `keptAttempt?` (1 जब पहला प्रयास दोबारा किए गए प्रयास से बेहतर था और रखा गया), `items` (हर एक अपने `collection`, `id`, `statement`, `status`, `sources`, `servesObjective`, दावे के बाकी फ़ील्ड और अपने खुद के फ़ील्ड के साथ), `reopenedBy?`, `reopen?` (`passage`, `focus`, `reason`: पहले का वह चरण जिसे यह दोबारा खोलने को कहता है; जब तक यह फिर से न चले, यह पूरा नहीं है), `resumed?` (किसी run ने इसे सिर्फ़ पूरा करने के लिए फिर से शुरू किया) |
| `study.search` | `passage`, `purpose` (`research`, या नवीनताओं के पूर्व कार्य के लिए `priorArt`), `tool`, `query`, `servesObjective`, `claims?` (वे नवीनताएँ जिनके लिए यह खोजता है), `resultIds`, `results` (`id`, `title`, `locator`, `date?`), `error?` (खोज विफल हुई), `skipped?` (`maxSearches`: नहीं चली) |
| `study.model_called` | `purpose` (`passage`, `queries`, `check`, `priorArtQueries`, `priorArtCheck`, `amendment`), `passage?`, `model?`, `requestedModel?`, `usage` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?`, `unmeteredTokens?`: एक कॉल और उसके सुधार के लिए एक इवेंट), `failed?` (जवाब का इस्तेमाल क्यों नहीं हो सका) — लागत में और अवधि वाले बजट में गिना जाता है |
| `study.drift_rejected` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`code`, `params?`, `message`), `by` (`guardian`: उद्देश्य से भटका हुआ माना गया; `schema`: उससे पहले ही ठुकराया गया, जैसे `servesObjective` के बिना), `attempt` (दोबारा करने पर 2) |
| `study.capability_demoted` | `passage`, `item` (आर्किटेक्चर का id), `name`, `reason` (`code`, `params?`, `message`): ऐसी क्षमता जिसे संरक्षक ने सिर्फ़ तेज़ या सस्ता माना, अब एक बेहतरी |
| `study.amendment_accepted` / `study.amendment_refused` | `number?` (सिर्फ़ स्वीकार होने पर), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`code`, `params?`, `message`; `unclassified` के लिए: `amendmentUnclassified`, `amendmentTimedOut`, `amendmentCancelled` या `amendmentPolicy`), `charterHash` — संशोधन के अपने run में |
| `study.result_recorded` | `card`, `resultAndError` (`result`, `error?`), `conclusionAndMemory?` — कार्ड लिखने वाले run में, उसके खत्म होने के बाद जोड़ा जाता है |
| `study.completed` | `status`, `passages` (`passage`, `state`), इस run के `stats` (`modelCalls` जिनका विक्रेता ने जवाब दिया, `searches`, `searchesSkipped`, `redos`, `loops`, `steps`) |
| `study.failed` | `status` (`stopped`, `failed` या `cancelled`), `stoppedBy?`, `error`, `passages`, इस run के `stats`, `partial: true` — फिर `run.failed`, या `run.cancelled` |

`study.model_called` वह इवेंट है जिसे `getRunCost` और बजट किसी अध्ययन के लिए पढ़ते हैं। जब दो runs की तुलना होती है, तो अध्ययन के इवेंट्स चरण के हिसाब से जोड़े जाते हैं (`study.model_called` प्रयोजन और चरण के हिसाब से), और `study.model_called` के `usage` की तुलना नहीं होती। किसी संशोधन के run में `run.started`, `policy.violated` (जब किसी बजट नीति ने वर्गीकरण ठुकराया), `study.model_called` (जब विक्रेता ने जवाब दिया), संशोधन का इवेंट और `run.completed` होते हैं।

## संचालन {#operations}

| टाइप | डेटा |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

किसी संज्ञानात्मक run की मानसिक स्थिति उसके `cognition.thought` पैचों को `step` के क्रम में लागू करने का नतीजा है, `cognition.started` के लक्ष्य और अवलोकनों से शुरू करके। run के दौरान बने अवलोकन विचार-पैचों में रहते हैं, और उनका `sourceEventId` उस `action.executed` या `cognition.evaluated` इवेंट की ओर इशारा करता है जिसमें पूरा payload है। बिना `schemaVersion` वाले runs उन्हीं नियमों से दोबारा बनाए जाते हैं जिनके साथ वे दर्ज हुए थे।
