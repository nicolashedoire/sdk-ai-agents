---
layout: home

hero:
  name: SDK AI Agents
  text: 先思考、后行动的受治理智能体
  tagline: 显式推理，心智状态随时可查；基于 Jev 的类型化决策；MCP 连接器——全部构建在事件溯源、回放、成本、重试和事故告警之上。
  image:
    src: /images/reasoning-loop.svg
    alt: 围绕显式心智状态运转的认知循环
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: 智能体如何思考
      link: /zh/guide/cognitive-agents
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/nicolashedoire/sdk-ai-agents

features:
  - icon: 🧠
    title: 是推理，而不只是写 prompt
    details: 表征问题、比较观测、提出假设、模拟、检验、修正、批判、寻求信息、比较、决策。每一步都是对显式心智状态的一次操作，由控制器选择，并记录为一个事件。
    link: /zh/guide/cognitive-agents
    linkText: 认知循环
  - icon: 🔬
    title: 只相信有依据的结论
    details: 观测保留出处，规则附带可证伪的预测，由你自己的评估器来检验，被驳倒的规则会被修正——只有通过一道用代码写成的守卫，答案才会被确定。
    link: /zh/guide/evidence-and-verification
    linkText: 证据与验证
  - icon: 🪞
    title: 像特定的人一样推理
    details: 是的，它可以模仿某个人的推理方式。用你自己的话讲解几个话题，它就会把你的关注顺序、优先事项和思维习惯提炼成一份画像，写进每个推理步骤的指令里。每一次纠正都会加进这份画像，而你给出的认同度会显示它模仿得有多接近。
    link: /zh/guide/thinker-profiles
    linkText: 像特定的人一样推理
  - icon: 🧭
    title: 不偏离航向的研究员
    details: 交给它一个对象，让它理解这个对象，并用今天的手段重新设计它。它搜索你的来源，把已确立的事实与假设和创新点区分开，并提出能做出裁决的实验——一份冻结的章程和一位守护者让它始终紧扣目标。
    link: /zh/guide/studies
    linkText: 研究
  - icon: 🎯
    title: 基于 Jev 的类型化决策
    details: 注入任意上下文，提出是/否、单选、多选和评分问题，得到经过校准、你的代码可以直接据此行动的概率。
    link: /zh/guide/typed-decisions
    linkText: 有把握地做决策
  - icon: 🔌
    title: 把任何系统变成 MCP 服务器
    details: 一行代码就能把 Web API、文档文件夹、只读数据库或智能体变成 MCP 服务器，受治理且全程可追踪；还能让你的智能体使用任何 MCP 服务器的工具。
    link: /zh/guide/mcp
    linkText: 连接你的系统
  - icon: 🛡️
    title: 治理内建于设计
    details: 模型负责提议，引擎负责定夺。每个动作执行之前，都会检查策略、允许列表、预算和人工审批。
    link: /zh/guide/governed-agents
    linkText: 受治理智能体
  - icon: 🎞️
    title: 一切皆事件
    details: 无需调用 LLM 即可回放运行，重建任意一次运行的心智状态，比较不同的运行，并把它们变成黄金测试。
    link: /zh/guide/observability
    linkText: 可追溯性与回放
  - icon: 💸
    title: 看得见的成本
    details: 每次 LLM 调用和类型化决策的 token 用量都会被记录下来，并按运行、按模型计价。
    link: /zh/guide/costs
    linkText: API 成本
  - icon: 🔁
    title: 不会叠加的重试
    details: 故障转移之前，每个提供商只执行一套重试策略；幂等的工具可以重试；每一次重试都写入追踪记录。
    link: /zh/guide/resilience
    linkText: 重试与回退
  - icon: 🚨
    title: 事故及时送达你
    details: 失败的运行、被拦截的动作和提供商故障转移都会变成附带时间线的事故，通过邮件或 webhook 发送给你。
    link: /zh/guide/incidents
    linkText: 事故告警
---

<div class="vp-doc" style="max-width: 1152px; margin: 0 auto; padding: 48px 24px 0;">

## 从 prompt 到可审计的决策 {#from-a-prompt-to-a-decision-you-can-audit}

经典的 LLM 调用从问题直接跳到答案。认知智能体则会为问题建立一幅显式的图景，探索多个选项，对它们反复施压，用受治理的工具核实事实，然后才下结论——而且事后你可以逐步阅读它的每一步。

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY, jev: { apiKey: process.env.TYPESAFE_API_KEY } });

const lookupMetric = sdk.defineTool({ /* name, description, zod schema, handler */ });
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools: [lookupMetric] });
const { answer, decision, state, runId } = await analyst.think({
  problem: 'Should we build or buy our analytics module?',
});

console.log(answer);                          // the decision, in plain words
console.log(state.hypotheses);                // every option considered, with its support
console.log(await sdk.getRunCost(runId));     // what it cost, per model
```

![从事件日志重建的心智状态](/images/mental-state.svg){.illustration}

## 一个 SDK，覆盖每一层 {#one-sdk-every-layer}

![SDK 的架构](/images/architecture.svg){.illustration}

| 你需要 | 原始的 LLM API | SDK AI Agents |
| --- | --- | --- |
| 回答之前先推理 | 一次性生成 | 在显式状态上提出假设、模拟和批判 |
| 像特定的人一样推理 | 一段很长的系统 prompt | 带版本的思考者画像，通过反馈不断完善 |
| 紧扣目标的研究 | 随着指令累积而跑题的聊天 | 研究：冻结的章程、每次调用都重建的 prompt、守护者、对照来源检查的论断 |
| 快速、经过校准的决策 | 解析自由文本 | 带概率和置信度的类型化答案（Jev） |
| 连接公司的工具 | 每个工具各写一套胶水代码 | MCP 服务器和客户端，受策略治理 |
| 知道发生了什么 | 日志（如果有的话） | 事件日志、回放、心智状态重建 |
| 控制风险和开销 | 听天由命 | 策略、审批、预算、按运行计算的成本、事故告警 |

</div>
