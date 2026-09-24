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
| `run.started` | `input`, `mode` (`cognitive`; `tool` किसी एजेंट के बाहर की कॉल के लिए, जैसे MCP कॉल; `resource` किसी MCP रिसोर्स को पढ़ने के लिए; या नियंत्रित runs के लिए अनुपस्थित), `replayOf?` |
| `run.completed` | `output`, `decision?` (संज्ञानात्मक) |
| `run.failed` | `error`, `steps?`, `uri?` (विफल रिसोर्स पढ़ना) |
| `run.cancelled` / `run.stopped` | `reason` |

## तर्क और कार्रवाइयाँ {#reasoning-and-actions}

| टाइप | डेटा |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — या संज्ञानात्मक अंतिम उत्तर के लिए `intention` |
| `policy.checked` / `policy.violated` | `intention`, `validation` / `reason`, `violatedPolicies` (`allowed-tools` जब कॉल करने वाले ने ऐसा टूल इस्तेमाल किया जो उसे नहीं दिया गया था; बजट नीति का id जब उसका कॉल-बजट खत्म हो चुका हो) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval` जब टूल के अपने `metadata.requiresApproval` ने इसकी माँग की), `reason?` (`cancelled before a decision` जब कॉल करने वाला हार मान गया या run रुक गया, `no decision within N ms` `approvalTimeoutMs` के बाद) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed` उस कॉल को भी दर्ज करता है जो अमान्य arguments के कारण (किसी भी नीति से पहले) ठुकराई गई, या इसलिए कि कॉल करने वाला मंज़ूरी के बाद चला गया |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `resource.read` | `uri`, `mimeType?`, `bytes`, सर्व की गई सामग्री का `sha256` (सामग्री खुद सहेजी नहीं जाती) |

`tool.failed`, `intention.rejected` और `error.occurred` टाइप `EventType` का हिस्सा हैं, लेकिन SDK इन्हें कभी दर्ज नहीं करता: विफल टूल कॉल एक `action.failed` इवेंट होती है, और ठुकराई गई टूल कॉल एक `policy.violated` या `approval.rejected` इवेंट।

## संज्ञान (Cognition) {#cognition}

| टाइप | डेटा |
| --- | --- |
| `cognition.started` | `schemaVersion` (2; पुराने runs में अनुपस्थित), `goal`, `context?`, `observations` (समस्या के साथ दिए गए), `commitRules`, `knowledge?` (`scope`, पहले के runs से याद किए गए `items`, स्टोर विफल होने पर `error?`), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (इंजन ने निर्णय थोपा), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — किसी पूर्वानुमान के परीक्षण की पूरी रिपोर्ट |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (कथन, प्रकार, दायरा, `revises?`, `difference?`, `evidence`: हर परीक्षण `runId`, `predictionId`, `verdict`, `expected`, `observed`, मूल्यांकनकर्ता के साथ), स्टोर विफल होने पर `error?`। `run.completed`, `run.failed` या `run.cancelled` के बाद जोड़ा जाता है, और सिर्फ़ तब जब run ने कुछ परखा हो |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers`, `usage`, `step?` |

## संचालन {#operations}

| टाइप | डेटा |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

किसी संज्ञानात्मक run की मानसिक स्थिति उसके `cognition.thought` पैचों को `step` के क्रम में लागू करने का नतीजा है, `cognition.started` के लक्ष्य और अवलोकनों से शुरू करके। run के दौरान बने अवलोकन विचार-पैचों में रहते हैं, और उनका `sourceEventId` उस `action.executed` या `cognition.evaluated` इवेंट की ओर इशारा करता है जिसमें पूरा payload है। बिना `schemaVersion` वाले runs उन्हीं नियमों से दोबारा बनाए जाते हैं जिनके साथ वे दर्ज हुए थे।
