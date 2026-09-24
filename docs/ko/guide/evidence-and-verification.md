# 증거와 검증

인지 에이전트는 정당화할 수 있는 것을 믿고, 예측한 것을 테스트하고, 세상이 동의하지 않으면 자신의 규칙을 바꿔야 합니다. 그래서 인지 루프는 **모든 증거가 어디서 왔는지** 추적하고, **증거와 선호를 분리**하고, 예측을 **실제 테스트**와 대조하며, 코드로 작성된 준비 검사를 통과한 답만 **확정**합니다.

::: tip 쉽게 말하면
꼼꼼한 수사관을 떠올려 보세요. 수사관은 **각 단서가 어디서 왔는지** 적어 두고, 같은 소문을 두 번 세지 않습니다. 여러 사건에서 **규칙**을 끌어낸 다음, 규칙이 맞다면 **무엇이 보여야 하는지**, 그리고 **무엇이 규칙을 틀렸다고 증명할지**를 미리 말합니다. 그런 다음 자신의 의견이 아니라 실제 측정으로 확인합니다. 확인에 실패하면 모른 척하지 않습니다. **규칙을 고치고** 무엇이 바뀌었는지 말합니다. 그리고 답이 버틸 때에만 **확고한 답**을 내놓습니다. 그렇지 않으면 "아직 확실하지 않습니다, 부족한 것은 이렇습니다" 또는 "결론을 내릴 수 없습니다"라고 말합니다. 아래에서 쓰는 모든 용어는 [쉽게 풀어 쓴 핵심 용어](./glossary#evidence-and-conclusions)에서 설명합니다.
:::

![관찰하고, 비교하고, 연역하고, 테스트하고, 수정한 다음 결론 가드](/images/evidence-loop.svg){.illustration style="max-width:860px"}

## 관찰한 것을 주세요 {#give-it-what-you-observed}

이미 가지고 있는 측정값, 사례, 문서를 문제와 함께 전달하세요. 각각은 추론에서 인용할 수 있는 id(`O1`, `O2`…)를 가진 **관찰**이 됩니다.

```ts
const result = await agent.think({
  problem: 'Does the rolling time on our plane depend on the ball?',
  observations: [
    {
      content: { material: 'steel', massKg: 0.1, seconds: 1.07 },
      summary: 'Steel ball, 100 g: 1.07 s',
      originGroup: 'bench',
    },
    {
      content: { material: 'steel', massKg: 0.4, seconds: 1.07 },
      summary: 'Steel ball, 400 g: 1.07 s',
      originGroup: 'bench',
    },
  ],
});
```

도구 결과와 테스트 결과도 관찰이 됩니다. 그 출처는 모델이 아니라 엔진이 기록합니다.

| 필드 | 의미 |
| --- | --- |
| `sourceKind` | `input`(문제와 함께 주어짐), `tool`(통제된 도구 호출) 또는 `evaluation`(예측 테스트) |
| `source`, `sourceEventId` | 도구 또는 평가기, 그리고 전체 페이로드를 담고 있는 이벤트(`action.executed`, `cognition.evaluated`) |
| `observedAt`, `context` | 언제, 어떤 상황에서 관찰되었는지 |
| `summary` | 모델에게 보여 주는, 길이가 제한된 텍스트 |
| `fingerprint` | 전체 내용의 해시 |
| `originGroup` | 같은 출처의 관찰은 독립적인 확인이 **아닙니다** |
| `duplicateOf` | 같은 출처의 같은 내용이 이미 관찰되었을 때 설정됩니다 |

사실은 자신이 읽혀 나온 관찰을 인용합니다(`observationRefs`). 도구 결과에서 뽑아낸 사실은 자동으로 그 결과에 연결되고, 이미 알려진 사실은 두 번 추가되지 않습니다. 대신 새 출처가 뒷받침 근거로 그 사실에 추가됩니다. 모델은 X를 주장하는 출처를 X의 증거가 아니라 *그 출처가 X를 주장한다*로 읽도록 지시받습니다. 코드는 같은 증거를 되풀이해도 무게가 더해지지 않도록 보장합니다. 중복은 증거의 변화로 세지 않으며, 이전 관찰을 되풀이하는 사실이나 테스트는 원본을 가리킵니다.

## 관찰 비교하기 {#compare-observations}

`compare_observations`는 관찰(과 사실)을 서로 관련짓습니다. 비교할 수 있는 관찰이 적어도 둘 있고(문제와 함께 주어졌거나 도구가 반환한 것으로, 중복과 테스트 결과는 제외), 마지막 비교 이후 새 관찰이 들어왔을 때 제시됩니다.

| 관계 | 의미 | 코드가 하는 일 |
| --- | --- | --- |
| `similarity` | 어떤 측면에서 값이나 동작이 같음 | 기록합니다. 유사성은 원인이 아닙니다 |
| `difference` | 맥락으로 설명되는 차이 | 기록합니다 |
| `evolution` | 시간에 따른 변화 | 기록합니다 |
| `incompatibility` | 둘이 동시에 성립할 수 없음 | 모순을 엽니다(출처가 다르면 `source_disagreement`). 한 번만 |
| `counterexample` | 가설을 깨는 사례 | 그 가설의 반대 증거로 보관하고, 모순을 엽니다. 한 번만 |

## 규칙, 설명, 제안 {#rules-explanations-and-proposals}

가설은 자신이 어떤 종류의 주장인지, 어떻게 추론되었는지, 무엇에 기대고 있는지를 밝힙니다.

```json
{
  "statement": "Rolling time on this plane does not depend on the ball",
  "kind": "rule",
  "inference": "induction",
  "premiseRefs": ["O1", "O2"],
  "scope": "balls on this plane"
}
```

`kind`는 `proposal`(취할 행동이나 내릴 선택, 기본값), `rule`(규칙성) 또는 `explanation`(원인)입니다. 무엇이 참인지 또는 참이었는지에 대한 진술은 절대 제안이 아닙니다. 모델도 그렇게 지시받습니다. [결론 가드](#the-conclusion-guard)는 사고자의 선호가 선택을 돕게는 하지만 주장을 돕게는 하지 않기 때문입니다. `inference`는 `induction`, `abduction` 또는 `deduction`이며, 이 레이블이 주장을 참으로 만들지는 않습니다.

## 예측과 결과 평가기 {#predictions-and-the-outcome-evaluator}

`simulate`는 틀릴 수 있는 **예측**을 연역합니다. 무엇이 관찰되어야 하는지(`expected`), 어떤 관찰이 가설을 틀렸다고 증명할지(`falsifier`), 어떤 `context`에서인지, 그리고 평가기에 필요한 구조화된 `test` 매개변수를 담습니다. 예측은 테스트되기 **전에** 기록되고, 한 번만 테스트됩니다. 모델은 이미 수행된 실험과 그 결과(상태 뷰의 `experiments`)를 보며, 실험을 되풀이하지 말고 현재 다루는 가설들의 예측이 엇갈리는 테스트를 고르도록 요청받습니다.

`OutcomeEvaluator`가 예측을 세상과 대조합니다. 시뮬레이터, 측정, 테스트 스위트, 쿼리가 그 역할을 합니다.

```ts
import type { OutcomeEvaluator } from '@sdk-ai-agents/core';

const bench: OutcomeEvaluator = {
  id: 'inclined-plane-bench',
  version: '1.0.0',
  async evaluate({ prediction }) {
    const run = await rollOnTheBench(prediction.test); // your measurement
    if (!run) return { verdict: 'inconclusive', reason: 'the bench is busy' };
    const refuted = Math.abs(run.seconds - run.expectedSeconds) / run.expectedSeconds > 0.1;
    return {
      verdict: refuted ? 'refuted' : 'confirmed',
      observed: run,
      summary: `${run.material} ball: ${run.seconds} s`,
      metrics: { seconds: run.seconds },
      ...(refuted ? { causeCandidates: ['material deforms', 'surface grip'] } : {}),
    };
  },
};

const agent = sdk.createCognitiveAgent({ name: 'physicist', model: 'gpt-4o', evaluator: bench });
```

평가기가 있으면 `test_prediction`을 사용할 수 있게 됩니다. 이 연산은 **언어 모델이 아니라 여러분의 평가기**를 호출하고, 전체 보고서를 `cognition.evaluated` 이벤트로 기록하고, 관찰된 것을 그 이벤트를 가리키는 `evaluation` 관찰로 추가합니다.

| 판정 | 효과 |
| --- | --- |
| `confirmed` | 관찰이 가설의 `evidenceRefs`에 추가됩니다 |
| `refuted` | 반증 조건이 관찰되었습니다. 가설은 **기각**되고, 관찰은 반대 증거로 보관되며, 반증은 해소된 `refuted_prediction` 모순으로 기록됩니다 |
| `inconclusive` | 기록됩니다. 관찰된 것이 있다면 새 증거가 되고, 그 밖에는 아무것도 바뀌지 않습니다 |

테스트마다 `limits.maxPredictionTests` 중 하나를 씁니다. 예외를 던지거나 잘못된 보고서를 반환하는 평가기는 `inconclusive`가 되며, 무엇이 관찰되었는지 말하지 않는 `refuted` 보고서도 마찬가지입니다. 실패한 측정은 아무것도 반증하지 않습니다. 자신의 추론을 판정하는 모델을 평가기로 쓰지 마세요. 자기 비판은 테스트를 준비할 수는 있어도 테스트를 대신할 수는 없습니다.

## 수정 {#revision}

증거가 가설과 모순되면, `revise`는 **변형**을 요청합니다. `parentId`를 가지고, `scope`를 좁히거나 변수를 추가하고, 그로 인한 `difference`를 밝히는 새 가설입니다. 차이를 밝히지 않는 변형은 거부됩니다. 원래 가설은 자신의 id, 기각 이유, 반례를 유지합니다. 이미 검토된 가설을 다시 제시하는 것은 기각 여부와 상관없이 거부됩니다. 경사면 테스트에서 반증된 규칙 *"굴러가는 시간은 공에 좌우되지 않는다"*는 *"단단한 공의 경우, 굴러가는 시간은 질량에 좌우되지 않는다"*가 되고, 두 번째 테스트가 이를 확인합니다.

## 증거는 선호가 아닙니다 {#evidence-is-not-preference}

| 점수 | 질문 | 누가 사고자 프로필을 보나요? |
| --- | --- | --- |
| `support` | 관찰, 사실, 예측, 비판이 이것을 얼마나 잘 뒷받침하는가? | Jev: 아무도 보지 않습니다. 증거 질문은 프로필 없이 전송됩니다. LLM: 모델은 선호를 무시하도록 지시받습니다 |
| `preferenceFit` | 이 제안이 사고자에게 얼마나 맞는가? (제안에만 해당) | 네, 그것이 이 점수의 목적입니다 |

코드는 두 점수를 절대 섞지 않습니다. 규칙과 설명은 `support`만으로 순위를 매기고, 제안은 `(1 − w) · support + w · preferenceFit`로 순위를 매깁니다. 여기서 `w = limits.preferenceWeight`(기본값 0.4)입니다. 따라서 프로필을 바꾸면 **어떤 행동이 선택되는지**, 그리고 사고자가 분명히 선호하는 선택이 그럴듯한 수준의 증거로 확정될 수 있는지가 바뀔 수 있습니다([결론 가드](#the-conclusion-guard) 참고). Jev를 쓰면 프로필이 **주장이 얼마나 믿을 만한지**를 바꿀 수 없고, LLM 판정자를 쓰면 이 분리는 그 지시문에 달려 있습니다. 상태의 `confidence`는 순위가 가장 높은 가설의 증거 지지도를 따릅니다. 모델이 사고 안에 쓴 `confidence`는 무시됩니다.

`support`는 모델의 판단이지, 보정된 확률이 아닙니다. 측정되는 것은 실적입니다. 어떤 예측이 확인되었고 어떤 예측이 반증되었는지입니다.

## 낡은 평가 {#stale-assessments}

상태는 `evidenceRevision` 카운터를 유지합니다. 이 카운터는 새로운(중복이 아닌) 관찰, 새 사실, 사실의 수정, 모순, 반례, 또는 결론이 난 테스트 결과가 들어올 때 증가합니다. 그 전에 이루어진 평가는 **낡은 것**이 됩니다. `compare`가 다시 제시되고, 낡은 가설은 확정될 수 없습니다. 비교는 현재 다루는 가설을 **모두** 다시 평가해야 합니다. 가설 하나를 건너뛴 비교는 수정하도록 요청받고, 그래도 가설을 건너뛰거나 실패한 비교는 완료로 세지 않습니다.

## 모순과 사실의 수정 {#contradictions-and-fact-revisions}

모순에는 `category`가 붙습니다. `source_disagreement`, `temporal_change`, `context_difference`, `logical_incompatibility` 또는 `refuted_prediction`입니다. 모순은 **한 번만** 해소되며, 해소가 그것을 정리하는 **관찰이나 사실을 인용할 때에만** 해소됩니다(`basisRefs`. 그 밖의 참조는 보고되고 무시됩니다). 해소는 무엇을 했는지 밝힐 수 있습니다(`retracted`, `restricted`, `replaced`, 또는 기본값인 `explained`). 해소 내용은 모순과 함께 보관됩니다. 사실은 절대 삭제되지 않습니다. 이유와 함께 `retracted`되거나 대체물로 `superseded`됩니다.

## 결론 가드 {#the-conclusion-guard}

답은 그 가설이 다음 조건을 모두 만족할 때에만 **확정**될 수 있습니다.

- 비판을 거쳤습니다.
- 증거가 마지막으로 바뀐 이후에 평가되었습니다.
- 해소되지 않은 모순에 관련되어 있지 않습니다(아무것도 지목하지 않는 모순은 모든 것에 관련됩니다).
- 테스트 예산이 허락하는 동안 테스트되지 않은 예측이 없습니다.
- 증거 `support`가 적어도 `limits.decisionThreshold`입니다. 또는 **제안**(행동 선택)의 경우, 분명히 사고자의 선택이면서(`preferenceFit`이 적어도 `limits.decisionThreshold`) 증거 지지도가 `limits.minProposalSupport`(기본값 0.35)에 이릅니다.

두 번째 경로가 있는 이유는, *"이 일자리를 받아들이겠습니까?"* 같은 질문에는 따져 볼 증거가 거의 없기 때문입니다. 사람은 사실이 그 선택에 반대하지 않는 한, 즉 증거 지지도가 하한 이상으로 유지되는 한, 자신의 우선순위로 이런 질문을 결정합니다. 규칙과 설명은 이 경로를 절대 타지 않습니다. 선호가 주장을 참으로 만들지는 않습니다. [특정 인물처럼 추론하기](./thinker-profiles#how-a-choice-is-ranked-and-committed)에서 숫자를 써서 예시를 풀어 봅니다. `minProposalSupport`는 `decisionThreshold`를 넘을 수 없습니다. 이 경로를 끄려면 `decisionThreshold`와 같은 값으로 설정하세요.

`decide`는 가설 하나가 통과할 때에만 제시됩니다. 다른 가설을 고르거나 아무것도 고르지 않는 결정은 예산이 남아 있는 동안 **연기**됩니다. 연기는 실패한 시도로 세며, 두 번 연속되면 `decide`는 제시되지 않습니다. 마지막 단계에서, 또는 다른 무엇도 할 수 없을 때, 엔진은 그래도 결정을 요청하고 다음과 같이 정리합니다.

| `decision.status` | 언제 | `decision.missing` |
| --- | --- | --- |
| `committed` | 준비 검사를 통과할 때 | `[]` |
| `provisional` | 살아 있는 가설이 있는데 예산이 바닥났을 때 | 아직 확립되지 않은 것 |
| `abstain` | 선택된 가설이 없거나, 선택된 가설이 기각되었거나, 모델이 결정을 전혀 내놓지 못했을 때 | 그 이유. 판단 유보의 신뢰도는 0이며, 그 답은 엔진이 작성합니다(모델이 쓴 내용은 `rationale`에 보관됩니다) |

```ts
const { decision } = await agent.think({ problem, observations });
if (decision?.status !== 'committed') {
  console.log('Not established yet:', decision?.missing);
}
```

실행 상태는 `completed`로 유지됩니다. 명시적인 판단 유보는 유효한 결과입니다. 결정의 신뢰도는 그 가설의 증거 지지도를 넘을 수 없습니다.

## 낭비되지 않는 예산 {#a-budget-that-is-not-wasted}

바꾸기로 되어 있던 것을 아무것도 바꾸지 못한 단계(모든 제안이 거부되어 새 가설이 없음, 새로 시뮬레이션하거나 비판한 것이 없음, 기록된 비교가 없음), 가설 하나를 건너뛴 비교, 연기된 결정은 모두 해당 연산의 실패한 시도로 셉니다. `compare_observations`, `hypothesize`, `simulate`, `revise`, `critique`, `compare` 또는 `decide`가 두 번 연속 실패하면, **다른 단계가 새 증거를 가져올 때까지** 더 이상 제시되지 않습니다. 새 증거란 성공한 단계, 또는 엔진이 기록한 도구나 테스트 결과를 말하며, 실패한 단계가 스스로 쓴 내용은 세지 않습니다. 그래서 실행은 같은 일을 되풀이하지 않고 앞으로 나아갑니다. `seek_information`은 대신 열린 질문 단위로 동작합니다. 사용 가능한 도구 중 답할 수 있는 것이 없는 질문은 (이유와 함께) 즉시 포기되고, 실패한 도구 호출은 각 질문에 주어지는 두 번의 시도에 포함되므로, 다른 질문들도 여전히 차례를 얻습니다. `test_prediction`은 테스트 예산으로 제한됩니다.

`limits.maxConsecutiveFailures`는 모델이나 그 도구의 실패를 셉니다. 수정 후에도 여전히 가설을 건너뛴 비교도 여기에 포함됩니다. 연기된 결정과 아무것도 바꾸지 못한 단계는 실패한 단계로 기록되지만 여기에는 절대 포함되지 않습니다. 구성 요소(사고 생성기, 가설 평가기, 결과 평가기)는 상태의 복사본을 받습니다. 기록된 내용을 바꿀 수 없으며, 커스텀 구성 요소가 만든 잘못된 사고는 실행을 멈추는 대신 실패한 연산으로 기록됩니다.

## 테스트가 곧 명세입니다 {#tests-are-your-specification}

`src/__tests__/rule-discovery.test.ts`는 스크립트로 동작하는 모델과 결정론적 물리 벤치로 루프 전체를 실행하고(귀납, 예측, 반증당함, 수정, 검증, 확정), 모든 이벤트를 검사합니다. `src/__tests__/epistemic-state.test.ts`, `epistemic-guards.test.ts`, `epistemic-liveness.test.ts`는 위의 각 규칙을 따로 검사하며, 이전 버전이 기록한 트레이스로 오래된 실행이 바뀌지 않고 재구성되는지 검사합니다.

## 오래된 실행 {#older-runs}

실행은 이 규칙들의 버전을 기록합니다(`cognition.started`의 `schemaVersion: 2`). 그 전에 기록된 실행에는 버전이 없습니다. `getMentalState`는 그런 실행을 원래 규칙으로 재구성하며, 새 컬렉션은 비어 있습니다.

## 아직 지원하지 않는 것 {#not-there-yet}

- **의미 기반 기억.** [실행 간 기억](./memory)은 이전 테스트가 확립한 것을 단어 일치로 불러옵니다. 관련이 있지만 다르게 표현된 규칙은 놓칠 수 있습니다.
- **대상을 좁힌 낡음 판정.** 새 증거는 관련된 평가만이 아니라 모든 평가를 낡은 것으로 만듭니다. 보수적이지만, 감사하기는 간단합니다.
- **무엇을 탐색할지 고르기.** 컨트롤러는 연산을 고릅니다. 대상(어떤 미지수, 어떤 예측)은 조건을 만족하는 첫 번째 것입니다.
- **보정.** 아직 보정된 예측 신뢰도는 없습니다. `support`는 판단이며, 측정되는 것은 예측의 실적입니다.
- **검증된 추론.** 추론 레이블(귀납, 가추, 연역)은 선언될 뿐, 형식 검증기로 확인되지 않습니다.
- **선언된 종류.** 가설이 주장인지 행동 선택인지는 모델이 제안할 때 선언하며, 종류가 없는 가설은 제안으로 봅니다. 프롬프트는 세상에 대한 진술을 제안이라고 부르는 것을 금지하지만, 이를 검증하는 장치는 없습니다. 잘못 레이블된 주장이 사고자의 선호로 확정될 수도 있습니다.
- **선택 뒤에 있는 원인 테스트하기.** 목표가 무엇을 할지를 묻는 경우 가설은 행동 방침이 되고, 예측은 규칙과 설명에만 붙으므로, 그런 목표에는 결과 평가기가 쓰이지 않습니다.
- **구조화된 검사.** 제약은 자유 텍스트이며 결론 가드가 검사하지 않습니다. 충돌은 구조화된 데이터에 대한 규칙으로 탐지되지 않습니다. 해소 행동이 그 자체로 사실이나 가설을 바꾸지는 않습니다.
