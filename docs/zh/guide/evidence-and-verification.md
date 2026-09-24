# 证据与验证

认知智能体应当相信它能给出依据的东西，检验它所预测的东西，并在世界与之相悖时修改它的规则。因此，认知循环会追踪**每一条证据从哪里来**，把**证据和偏好分开**，用**真实的检验**来对照预测，并且只**确定**那些通过了一项用代码写成的就绪检查的答案。

::: tip 通俗地说
想象一位细心的调查员。他会记下**每条线索的来源**，同一个传闻不会算两次。他从几个案例中归纳出一条**规则**，然后事先说明如果规则正确**应该看到什么**，以及**什么会证明它是错的**。接着他去核实，用的是真实的测量，而不是他自己的看法。核实失败时，他不会装作没事：他会**修正规则**，并说明改了什么。只有当答案站得住脚时，他才会给出**确定的答案**；否则他会说“还不确定，缺的是这些”，或者“我无法得出结论”。下文用到的每个术语都在[关键术语通俗解释](./glossary#evidence-and-conclusions)中有说明。
:::

![观测、比较、演绎、检验、修正——然后是结论守卫](/images/evidence-loop.svg){.illustration style="max-width:860px"}

## 把你观测到的东西交给它 {#give-it-what-you-observed}

把你手头已有的测量值、案例或文档随问题一起传入。每一项都会成为一条带 id（`O1`、`O2`…）的**观测**，供推理引用。

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

工具结果和检验结果也会成为观测。它们的出处由引擎写入，从不由模型写入：

| 字段 | 含义 |
| --- | --- |
| `sourceKind` | `input`（随问题提供）、`tool`（一次受治理的工具调用）或 `evaluation`（一次预测检验） |
| `source`、`sourceEventId` | 工具或评估器，以及保存完整内容的事件（`action.executed`、`cognition.evaluated`） |
| `observedAt`、`context` | 在何时、何种情况下观测到的 |
| `summary` | 展示给模型的有长度上限的文本 |
| `fingerprint` | 完整内容的哈希值 |
| `originGroup` | 来源相同的观测**不是**相互独立的确认 |
| `duplicateOf` | 当来自同一来源的相同内容已经被观测过时设置 |

事实会引用它们所依据的观测（`observationRefs`）；从工具结果中提取的事实会自动与之关联，已知的事实不会被重复添加——新的来源会作为佐证加到它上面。模型被指示把一个断言 X 的来源解读为*该来源断言 X*，而不是 X 的证明。代码保证重复同样的证据不会增加任何分量：重复项不算作证据的变化，重复了早先观测的事实或检验会指向原始观测。

## 比较观测 {#compare-observations}

`compare_observations` 把观测（以及事实）相互联系起来。当至少存在两条可比较的观测——随问题提供或由工具返回，不含重复项和检验结果——并且自上次比较以来有新观测到来时，就会提供这个操作。

| 关系 | 含义 | 代码会做什么 |
| --- | --- | --- |
| `similarity` | 在某个方面有相同的值或行为 | 记录下来——相似不等于原因 |
| `difference` | 可以由情境解释的差异 | 记录下来 |
| `evolution` | 随时间发生的变化 | 记录下来 |
| `incompatibility` | 两者不可能同时成立 | 打开一个矛盾（跨来源时为 `source_disagreement`），仅一次 |
| `counterexample` | 打破某个假设的案例 | 作为该假设的反面证据保留，并打开一个矛盾，仅一次 |

## 规则、解释与提议 {#rules-explanations-and-proposals}

一个假设会说明它是哪一类论断、是如何推断出来的，以及它依据什么：

```json
{
  "statement": "Rolling time on this plane does not depend on the ball",
  "kind": "rule",
  "inference": "induction",
  "premiseRefs": ["O1", "O2"],
  "scope": "balls on this plane"
}
```

`kind` 可以是 `proposal`（要采取的行动或要做的选择，默认值）、`rule`（一种规律）或 `explanation`（一个原因）。关于什么是真的或曾经是真的陈述，永远不是提议：模型会被告知这一点，因为[结论守卫](#the-conclusion-guard)允许思考者的偏好帮助一个选择，但绝不帮助一个论断。`inference` 可以是 `induction`、`abduction` 或 `deduction`；这个标签永远不会让论断变成真的。

## 预测与结果评估器 {#predictions-and-the-outcome-evaluator}

`simulate` 会演绎出可能失败的**预测**：应该观测到什么（`expected`）、哪一个观测会证明假设是错的（`falsifier`）、在什么 `context` 下，以及评估器所需的结构化 `test` 参数。预测在检验**之前**记录，并且只检验一次。模型能看到已经做过的实验及其结果（状态视图中的 `experiments`），并被要求不要重复做过的实验，而是选择一个能让在考虑中的各假设给出不同结论的检验。

`OutcomeEvaluator` 拿它与世界对照——一个模拟器、一次测量、一套测试、一次查询：

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

有了评估器，`test_prediction` 就可用了。它调用的是**你的评估器，而不是语言模型**，把完整报告记录为一个 `cognition.evaluated` 事件，并把观测到的内容作为一条指向该事件的 `evaluation` 观测加入。

| 判定 | 效果 |
| --- | --- |
| `confirmed` | 这条观测被加入该假设的 `evidenceRefs` |
| `refuted` | 证伪条件被观测到了：假设被**否决**，这条观测作为反面证据保留，这次驳倒被记为一个已解决的 `refuted_prediction` 矛盾 |
| `inconclusive` | 记录下来；如果它观测到了什么，那就是新证据；其他一切不变 |

每次检验都会消耗一次 `limits.maxPredictionTests`。抛出异常或返回无效报告的评估器会得到 `inconclusive`，没有说明观测到了什么的 `refuted` 报告也是如此——失败的测量永远驳倒不了任何东西。不要把一个评判自己推理的模型当作评估器：自我批判可以为检验做准备，但不能替代检验。

## 修正 {#revision}

当证据否定一个假设时，`revise` 会要求给出一个**变体**：一个带有 `parentId` 的新假设，作用域（`scope`）更窄或增加了一个变量，并说明它带来的 `difference`——没有说明差异的变体会被拒绝。原假设保留它的 id、否决原因和反例；重述一个已经考虑过的假设（无论是否被否决）都会被拒绝。在斜面实验中，被驳倒的规则*“滚动时间不取决于球”*变成了*“对于刚性球，滚动时间不取决于质量”*，第二次检验证实了它。

## 证据不是偏好 {#evidence-is-not-preference}

| 分数 | 问题 | 谁能看到思考者画像？ |
| --- | --- | --- |
| `support` | 观测、事实、预测和批判对它的支持有多强？ | Jev：谁都看不到——关于证据的问题在发送时不带画像。LLM：模型被指示忽略偏好 |
| `preferenceFit` | 这项提议有多适合思考者？（仅限提议） | 是的，这正是它的用途 |

代码从不把这两个分数混在一起。规则和解释只按 `support` 排序；提议按 `(1 − w) · support + w · preferenceFit` 排序，其中 `w = limits.preferenceWeight`（默认 0.4）。因此，改变画像可以改变**选择哪个行动**，以及一个思考者明显偏好的选择能否在证据看似合理时被确定（参见[结论守卫](#the-conclusion-guard)）；使用 Jev 时，它无法改变**一个论断有多可信**；使用 LLM 作裁判时，这种分离依靠的是它的指令。状态的 `confidence` 跟随排名最高的假设的证据支持度：模型在思维中写下的 `confidence` 会被忽略。

`support` 是模型做出的判断，而不是经过校准的概率。真正被测量的是历史记录：哪些预测被证实，哪些被驳倒。

## 过时的评估 {#stale-assessments}

状态维护着一个 `evidenceRevision` 计数器。当有新的（非重复的）观测、新的事实、事实修订、矛盾、反例或有明确结论的检验结果到来时，它就会增加。在此之前做出的评估就**过时**了：`compare` 会被再次提供，过时的假设无法被确定。一次比较必须重新评估**每一个**在考虑中的假设——如果比较漏掉了某个假设，模型会被要求修复；修复后仍然漏掉假设的比较或者失败的比较，都不算作已完成。

## 矛盾与事实修订 {#contradictions-and-fact-revisions}

矛盾带有一个 `category`：`source_disagreement`、`temporal_change`、`context_difference`、`logical_incompatibility` 或 `refuted_prediction`。一个矛盾只能被解决**一次**，而且只有当解决方案**引用了能解决它的观测或事实**（`basisRefs`——其他引用会被报告并忽略）时才算解决；它可以说明采取了什么措施（`retracted`、`restricted`、`replaced`，默认是 `explained`）。解决方案与矛盾保存在一起。事实从不删除：它们会被 `retracted`，或被替换项 `superseded`，并附上原因。

## 结论守卫 {#the-conclusion-guard}

只有当一个答案的假设满足以下条件时，这个答案才能被**确定**：

- 经过了批判；
- 在证据最近一次变化之后评估过；
- 不涉及任何未解决的矛盾（没有指明对象的矛盾涉及一切）；
- 在检验预算还允许检验时，没有未经检验的预测；
- 证据 `support` 至少达到 `limits.decisionThreshold`——或者，对于**提议**（一个行动选择），它明显是思考者的选择（`preferenceFit` 至少达到 `limits.decisionThreshold`），同时它的证据支持度达到 `limits.minProposalSupport`（默认 0.35）。

之所以有第二条路径，是因为像*“你会接受这份工作吗？”*这样的问题几乎没有什么证据可以权衡：人是凭自己的优先事项来决定的，前提是事实并不与这个选择相悖，也就是说，前提是它的证据支持度不低于这个下限。规则和解释永远走不了这条路：偏好永远不会让一个论断成真。[像特定的人一样推理](./thinker-profiles#how-a-choice-is-ranked-and-committed)用一个带数字的例子完整演示了这一过程。`minProposalSupport` 不能超过 `decisionThreshold`；把它设为等于 `decisionThreshold` 即可关闭这条路径。

只有当某个假设通过守卫时，才会提供 `decide`。选择了另一个假设（或者没有选择任何假设）的决策，在预算还够时会被**推迟**；推迟算作一次失败尝试，连续两次之后就不再提供 `decide`。在最后一步，或者没有其他操作可做时，引擎仍然会要求给出决策，并对其作出裁定：

| `decision.status` | 何时 | `decision.missing` |
| --- | --- | --- |
| `committed` | 就绪检查通过 | `[]` |
| `provisional` | 预算用完时还有一个存活的假设 | 尚未确立的内容 |
| `abstain` | 没有选择任何假设、所选的假设已被否决，或者模型根本无法给出决策 | 原因——弃权的置信度为 0，它的答案由引擎写入（模型写下的内容保留在 `rationale` 中） |

```ts
const { decision } = await agent.think({ problem, observations });
if (decision?.status !== 'committed') {
  console.log('Not established yet:', decision?.missing);
}
```

运行状态仍然是 `completed`：明确的弃权是一种有效的结果。决策的置信度以其假设的证据支持度为上限。

## 不浪费的预算 {#a-budget-that-is-not-wasted}

没有改变它本该改变的任何东西的步骤——没有新假设（所有提议都被拒绝），没有新完成的模拟或批判，没有记录任何比较——漏掉了某个假设的比较，以及被推迟的决策，都算作其所属操作的失败尝试。当 `compare_observations`、`hypothesize`、`simulate`、`revise`、`critique`、`compare` 或 `decide` 连续失败两次，它就不再被提供，**直到另一个步骤带来新证据**——一个成功的步骤，或者引擎记录下的一个工具或检验结果；失败步骤自己写下的内容不算数——这样运行就会继续向前推进，而不是原地重复。`seek_information` 则按每个未决问题来计算：没有任何可用工具能回答的问题会立即被放弃（并附上原因），出错的工具调用会计入每个问题拥有的两次尝试，这样其他问题仍然能轮到。`test_prediction` 受其检验预算约束。

`limits.maxConsecutiveFailures` 统计的是模型或其工具的失败，包括修复后仍然漏掉假设的比较。被推迟的决策和没有改变任何东西的步骤会被记录为失败步骤，但从不计入这个次数。各组件（思维生成器、评分器、评估器）拿到的是状态的副本：它们无法改动已记录的内容，自定义组件给出的无效思维会被记录为一次失败的操作，而不会让运行停下来。

## 测试就是你的规范 {#tests-are-your-specification}

`src/__tests__/rule-discovery.test.ts` 使用一个脚本化的模型和一个确定性的物理试验台来运行整个循环——归纳、预测、被驳倒、修正、验证、确定——并检查每一个事件。`src/__tests__/epistemic-state.test.ts`、`epistemic-guards.test.ts` 和 `epistemic-liveness.test.ts` 逐条单独检查上述每条规则，而一份由上一版本记录的追踪记录则用来检查较早的运行能否原样重建。

## 较早的运行 {#older-runs}

运行会记录这些规则的版本（`cognition.started` 中的 `schemaVersion: 2`）。此前记录的运行没有版本：`getMentalState` 会用它们原来的规则重建它们，它们的新集合为空。

## 尚未实现 {#not-there-yet}

- **语义记忆。** [跨运行记忆](./memory)通过词语匹配来召回之前检验确立的东西；措辞不同的相关规则可能会被遗漏。
- **有针对性的过时判定。** 新证据会让所有评估都过时，而不只是与之相关的那些——这样做偏保守，但易于审计。
- **选择要探索的目标。** 控制器选择的是一个操作；目标（哪个未知项、哪条预测）是第一个符合条件的那个。
- **校准。** 目前还没有经过校准的预测置信度：`support` 是一种判断，被测量的是预测的历史记录。
- **经过验证的推断。** 推断标签（归纳、溯因、演绎）是声明出来的，没有经过形式化验证器的检查。
- **声明出来的类别。** 一个假设是论断还是行动选择，由模型在提出它时声明，没有类别的假设被当作提议。prompt 禁止把关于世界的陈述称作提议，但没有任何东西去验证这一点：一个被错误标注的论断可能会凭思考者的偏好被确定。
- **检验一个选择背后的原因。** 当目标问的是要做什么时，假设就是行动方案，而只有规则和解释才会有预测，所以结果评估器不会用于这类目标。
- **结构化检查。** 约束是自由文本，结论守卫不会检查它们；冲突不是由基于结构化数据的规则检测出来的；一个解决措施本身不会改变事实或假设。
