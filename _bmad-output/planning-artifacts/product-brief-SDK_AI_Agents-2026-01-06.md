---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments: 
  - _bmad-output/analysis/brainstorming-session-2026-01-06.md
  - _bmad-output/planning-artifacts/research/technical-ecosysteme-sdks-frameworks-agents-ia-research-2026-01-06.md
date: 2026-01-06T10:48:57.000Z
author: Nicolashedoire
---

# Product Brief: SDK_AI_Agents

## Executive Summary

SDK_AI_Agents solves the fundamental problem of moving from experimental AI to operational AI. While teams today know how to make an AI "talk," they don't know how to make an AI act reliably, in a controlled, explainable, and secure way in production.

The problem isn't the LLM, but the architecture around the LLM. Technical teams cobble together fragile agents, reinvent their own frameworks, and handle security "on trust," with poor logs and virtually no tests.

SDK_AI_Agents transforms AI agents from experimental tools into governable, explainable, production-ready decision-making systems. It doesn't aim to be a better prompt framework or an LLM wrapper, but the governance infrastructure for AI agents where the agent proposes and the system decides.

**Vision in one sentence:** SDK_AI_Agents transforms AI agents from experimental tools into governable, explainable, production-ready decision-making systems.

### Clarified Value Proposition

**SDK_AI_Agents is the only SDK that transforms AI agents into governable decision-making systems with native replay, audit, and testability.**

**Differentiation in 3 measurable points:**

1. **Native event-sourcing** → Replay/audit in 1 command (unique in the market)
   - *Metric:* "With SDK_AI_Agents, you can replay any agent execution in 1 command. With LangChain, that's impossible."

2. **Separation of reasoning/action** → Security by design (no "free tools")
   - *Metric:* The LLM never directly causes a side effect. All actions pass through a governed Action Engine.

3. **Built-in governance** → Native policies, budgets, approvals (not plugins)
   - *Metric:* "Deny by default" security with explicit contracts for each capability.

**Clear positioning:**
- ❌ Not a better LangChain
- ❌ Not an LLM wrapper  
- ✅ The governance infrastructure for AI agents

**Initial target:**
- Teams that have already tried LangChain/Semantic Kernel and need governance
- Enterprises that cannot deploy without audit/traceability
- Tech leads responsible for security and costs

**Durable competitive advantage:**
A coherent architecture designed together, not features bolted on. Hard to copy without a complete redesign.

---

## Core Vision

### Problem Statement

SDK_AI_Agents solves the problem of moving from experimental AI to operational AI. Today, teams know how to make an AI "talk," but they don't know how to make an AI act reliably, in a controlled, explainable, and secure way in production.

The problem isn't the LLM. The problem is the architecture around the LLM.

**Who is most affected today:**

- **Backend / fullstack developers** who cobble together fragile agents
- **Tech leads / architects** responsible for reliability, security, and costs
- **Product teams** who want agents that are useful, not unpredictable
- **Enterprises** that cannot deploy agents without audit, control, and traceability

These are precisely the teams that want to go beyond the PoC, but are stuck.

### Problem Impact

**How teams solve this problem today:**

- Homegrown LLM + tools loops
- Partial or overly generic frameworks
- A lot of untestable glue code
- Security handled "on trust"
- Poor logs, opaque decisions
- Virtually no tests

Every team reinvents its own agent framework, often in production.

**Main frustrations with existing solutions:**

- ❌ Impossible to replay or understand a decision
- ❌ Dangerous tools called with no guardrails
- ❌ No standard for policies, budgets, approvals
- ❌ Observability limited to text logs
- ❌ Agent testing is nearly impossible
- ❌ Unpredictable AI costs
- ❌ Heavy technical debt from the start

**What happens if this problem isn't solved:**

- Agents stay confined to demos or passive assistants
- Enterprises don't dare entrust them with real actions
- Explosion of risks (security, costs, compliance)
- Gradual rejection of agents by technical teams
- Missed competitive advantage

👉 **Without a structuring solution, autonomous AI will remain underused.**

### Why Existing Solutions Fall Short

Existing solutions (LangChain, AutoGPT, Semantic Kernel, etc.) focus on orchestration and tool calling, but lack native governance, complete observability, and a clear separation between reasoning and action.

**Gaps identified in the current ecosystem:**

1. **Limited native governance** - Most frameworks lack a built-in policy system
2. **Incomplete observability** - Limited traceability, no standard reasoning graph
3. **Underused event sourcing** - A major opportunity for observability/audit
4. **Reasoning/action separation** - Few frameworks clearly separate these responsibilities
5. **Capability-based security** - Emerging but not standard

Existing frameworks make it possible to create agents, but not to govern, audit, or reliably test them in production.

**Concrete examples of gaps:**
- **LangChain:** No native replay, no reasoning/action separation, governance via external plugins
- **Semantic Kernel:** Basic filters, no event-sourcing, limited observability
- **AutoGPT/LangGraph:** Orchestration-focused, no native governance, no structured testability

### Proposed Solution

SDK_AI_Agents is an AI agent governance infrastructure that transforms agents from experimental tools into governable, explainable, production-ready decision-making systems.

**An ideal solution would make it possible to:**

- Design an agent as a decision-making system, not a chatbot
- Strictly separate reasoning from action
- Trace every decision, every tool, every constraint
- Replay and audit any execution
- Test an agent the way you test a critical system
- Integrate all of this without excessive complexity for the developer

**The simplest way to make a meaningful difference:**

👉 **Make observability, control, and replay native primitives, not options.**

In other words:
- Everything is an event
- Nothing is implicit
- No action is "magic"

**What makes our approach different:**

SDK_AI_Agents doesn't aim to be:
- A better prompt framework
- An LLM wrapper
- A magic orchestrator
- A better LangChain

👉 **It aims to be the governance infrastructure for AI agents.**

**Fundamental principle:** The agent doesn't "act." The agent proposes, the system decides.

**Two-level approach:**
- **Quick Start (10 lines):** For simple cases, a minimal and intuitive API
- **Power Features:** Advanced governance for production, enabled progressively

**Key message:** "Simple by default, powerful when needed. You start simple, you evolve toward governance without rewriting your code."

### Key Differentiators

**Key competitive advantages:**

1. **Append-only event-driven architecture**
   - Replay, audit, behavior comparison
   - Complete traceability of every decision

2. **Reasoning / action separation**
   - The LLM never directly causes a side effect
   - Reasoning Engine separated from Action Engine, with governance

3. **Capabilities & policies by design**
   - "Deny by default" security
   - Explicit contracts with security metadata

4. **Cognitive observability**
   - We understand why the agent acts
   - Reasoning graph, belief evolution

5. **Native testability**
   - Golden traces, mock tools, deterministic mode
   - Executions as signable, comparable proofs

6. **Modern but production-first DX**
   - Simple to use, robust by design
   - Type-safe TypeScript API, complete documentation

**What's hard to copy:**

- **The mental model** (agent ≠ chatbot)
- **The event-sourced design applied to agents**
- **The deep integration between:**
  - Runtime
  - Security
  - Observability
  - Tests

The fact that everything is designed together, not bolted on afterward.

**This isn't a copied feature. It's a coherent, overall architecture.**

**Why now is the right time:**

- LLMs are now powerful enough to reason
- Enterprises want to move to action, not just conversation
- The first failures of unmanaged agents are creating awareness
- The market still lacks a serious, structuring standard
- The window is open to define the right abstraction

👉 **SDK_AI_Agents arrives at the exact moment when the need for industrialization becomes critical.**

### Quantifiable ROI

**Measurable value metrics:**

**Development time:**
- **-60% vs. in-house solution** - Reuse of components, no reinvention
- **Concrete example:** A team that takes 3 months to build a secure agent can do it in 1 month with SDK_AI_Agents, with better governance

**Risk reduction:**
- **0 security incidents related to tools** - Native governance with controlled capabilities
- **Complete audit trail** - Traceability of every decision for compliance

**AI costs:**
- **-30% via monitoring and optimization** - Built-in tracking of tokens and costs per run
- **Budgets and alerts** - Cost control before they explode

**Time to production:**
- **-50%** - Native tests, built-in observability, no glue code to write
- **Progressive deployment** - Fast MVP, advanced features added incrementally

**Quality and reliability:**
- **Native replay** - Debugging in minutes instead of hours
- **Structured tests** - Golden traces, mock tools, deterministic mode

### Adoption Strategy

**Reducing adoption friction:**

**1. Adapters for existing frameworks**
- Gradual migration from LangChain/Semantic Kernel
- Reuse of existing code, no complete rewrite
- Progressive adoption of governance features

**2. Immediate quick wins**
- The Event Store alone delivers value from day one
- Replay/audit available immediately
- No need to adopt all features at once

**3. Fast, visible ROI**
- Working replay from the very first run
- Automatic complete audit trail
- Built-in cost monitoring

**4. No complete rewrite**
- Progressive adoption of features
- Start with the Event Store for replay
- Add capabilities when you're ready
- Enable advanced governance based on your needs

**Adoption message:** "You don't have to change everything. Start simple, evolve progressively toward complete governance."

### Complexity and Learning Curve

**Clarifying complexity:**

**Simple API ≠ Simple architecture**
- The public API is designed to be intuitive (10-line Quick Start)
- The underlying architecture is sophisticated (event-sourcing, reasoning/action separation)
- Complexity is managed by the SDK, not exposed to the developer

**Progressive learning curve:**
- **Level 1 (Day 1):** Quick Start - Create a basic agent, understand the fundamental concepts
- **Level 2 (Week 1):** Event Store - Use replay, understand events
- **Level 3 (Month 1):** Capabilities - Define capabilities, understand governance
- **Level 4 (Month 2+):** Advanced governance - Policies, budgets, cognitive observability

**Documentation and examples:**
- Progressive guides by complexity level
- Concrete examples for each concept
- Step-by-step tutorials for common use cases

**Key message:** "You don't need to understand the whole architecture to get started. Learn progressively based on your needs."

### Performance and Scalability

**Impact of event-sourcing on performance:**

**Optimization strategies:**
- **Asynchronous writes** - Events are persisted in a non-blocking way
- **Periodic snapshots** - Reduced state projection time
- **Smart indexing** - Fast access to events for replay/audit
- **Compression** - Reduced storage footprint for events

**Target performance metrics:**
- **Added latency:** < 10ms per event (asynchronous writes)
- **Throughput:** Support for thousands of concurrent executions
- **Replay:** Complete execution replay in < 100ms

**Comparative benchmarks:**
- Performance vs. LangChain (to be validated with prototypes)
- Impact on end-to-end latency (to be measured)
- Horizontal scalability (to be tested)

**Accepted trade-offs:**
- Slight added latency for complete traceability
- Additional storage for events (offset by the value of replay/audit)
- Increased operational complexity (offset by native governance)

**Key message:** "Performance is optimized, but governance and traceability take priority. For high-performance use cases, specific optimizations are available."

### Risks and Mitigations

**Identified risks and mitigation strategies:**

**1. Risk of perceived complexity**
- **Risk:** Developers find the SDK too complex despite the simple API
- **Mitigation:** Progressive documentation, concrete examples, a very simple Quick Start
- **Indicator:** Time to first working agent < 15 minutes

**2. Performance risk**
- **Risk:** Event-sourcing adds too much latency for certain use cases
- **Mitigation:** Optimizations (asynchronous, snapshots), benchmarks, configuration options
- **Indicator:** Added latency < 10ms per event

**3. Risk of slow adoption**
- **Risk:** Teams prefer to stick with their in-house solutions
- **Mitigation:** Adapters for existing frameworks, fast visible ROI, quick wins
- **Indicator:** Progressive adoption rate > 20% after 3 months

**4. Risk of being copied by competitors**
- **Risk:** LangChain/Semantic Kernel add similar features
- **Mitigation:** Execution speed, coherent architecture, community, expertise
- **Indicator:** Technological lead maintained > 6 months

**5. Risk of unmet ROI**
- **Risk:** Announced metrics (-60% time, -30% costs) not validated
- **Mitigation:** Validation with early adopters, realistic metrics, documented use cases
- **Indicator:** Real ROI measured and documented after 6 months

**6. Risk of an immature market**
- **Risk:** The need for governance isn't yet strong enough
- **Mitigation:** Market education, concrete use cases, strategic partnerships
- **Indicator:** Number of interested enterprises > 50 after 6 months

**Potential failure scenarios:**
- **Scenario 1:** Adoption too slow → Pivot toward a more specific target (e.g., regulated enterprises)
- **Scenario 2:** Insufficient performance → Aggressive optimizations or configuration options
- **Scenario 3:** Fast copying by competitors → Accelerated roadmap, reinforced differentiation

**Contingency plan:**
- Continuous monitoring of risk indicators
- Fast adjustments based on user feedback
- Possible pivot toward more specific segments if needed

### Validating the Need

**Evidence of real need:**

**Market signals:**
- Frustrations expressed by developers on Twitter/GitHub (to be documented)
- Recurring questions about governance in LangChain/Semantic Kernel communities
- Enterprise requests for AI agent audit/traceability (to be validated)

**Identified early adopters:**
- Regulated enterprises (finance, healthcare) requiring complete audit
- Tech leads responsible for security seeking native governance
- Teams that have already tried LangChain and hit governance limits

**Market validation:**
- **Hypothesis 1:** Teams want governance but can't find a solution → To be validated via interviews
- **Hypothesis 2:** The need becomes critical with growing agent adoption → To be validated via market research
- **Hypothesis 3:** Enterprises are ready to pay for governance → To be validated via pricing tests

**Timing indicators:**
- Number of security incidents related to AI agents (growth = growing need)
- AI agent adoption in production (growth = need for governance)
- Governance requests in communities (growth = favorable timing)

**Key message:** "The need is real but must be validated with early adopters. The window of opportunity is open but could close if the market isn't ready."

### Prioritized Target and Segmentation

**Prioritized primary target:**

**Tech Leads / Architects responsible for security** (Target #1)
- **Why priority:** Technical decision-makers, budget, strong governance need
- **Message:** "Native governance for AI agents in production"
- **Value prop:** Security by design, complete audit, compliance

**Secondary segments:**

**Regulated enterprises** (Target #2)
- **Why:** Critical audit/traceability need
- **Message:** "Certifiable AI agents for finance/healthcare"
- **Value prop:** Complete audit trail, compliance, traceability

**Experienced backend developers** (Target #3)
- **Why:** Early adopters, technical influencers
- **Message:** "A modern SDK for production-ready AI agents"
- **Value prop:** Modern DX, type-safety, testability

**Product teams** (Target #4 - Support)
- **Why:** End users, product feedback
- **Message:** "Reliable and predictable AI agents"
- **Value prop:** Reliability, observability, cost control

**Message adaptation by segment:**
- Tech Leads: Focus on governance, security, ROI
- Regulated enterprises: Focus on compliance, audit, traceability
- Developers: Focus on DX, API, testability
- Product teams: Focus on reliability, costs, observability

**Roadmap by segment:**
- Phase 1: Tech Leads (governance MVP)
- Phase 2: Regulated enterprises (compliance features)
- Phase 3: Developers (improved DX)
- Phase 4: Product teams (advanced observability)

### ROI - Sources and Context

**Clarifying the announced metrics:**

**Sources of the metrics:**
- **Estimates based on:** Analysis of existing frameworks, observed patterns, developer feedback
- **To be validated with:** Early adopters, real use cases, comparative benchmarks
- **Methodology:** Comparison of in-house solution vs. SDK_AI_Agents on typical use cases

**Context of the metrics:**
- **-60% development time:** For teams building secure agents from scratch
- **-30% AI costs:** With built-in monitoring and optimization (use cases with reuse)
- **-50% time to production:** With native tests and built-in observability (vs. in-house solution)

**Realistic metrics:**
- **Favorable case:** New team, standard use case → High ROI
- **Average case:** Experienced team, gradual migration → Moderate ROI
- **Unfavorable case:** Highly optimized in-house solution, specific use case → Low ROI

**ROI validation:**
- **Phase 1:** Theoretical estimates (current)
- **Phase 2:** Validation with prototypes (MVP)
- **Phase 3:** Real measurements with early adopters (6 months)
- **Phase 4:** Documented use cases with metrics (12 months)

**Key message:** "The announced metrics are estimates based on market analysis. Real validation with early adopters will help refine these figures."

### User Value & Jobs to be Done

**Main Jobs to be Done identified:**

**Job #1: "I want to deploy an agent to production without risking my career"**
- **Stakeholder:** Tech Lead / Architect responsible for security
- **Critical moment:** When the agent must take real actions (not just respond)
- **SDK_AI_Agents value:** Native governance, complete audit trail, security by design
- **Validation:** Interviews with tech leads who have already deployed agents

**Job #2: "I want to understand why my agent made that decision"**
- **Stakeholder:** Developer / Product team
- **Critical moment:** When the agent produces an unexpected or erroneous result
- **SDK_AI_Agents value:** Native replay, cognitive observability, reasoning graph
- **Validation:** Concrete agent debugging use cases

**Job #3: "I want to test my agent the way I test my code"**
- **Stakeholder:** Developer responsible for quality
- **Critical moment:** When the agent must be deployed to production
- **SDK_AI_Agents value:** Native testability, golden traces, mock tools
- **Validation:** Comparison with current agent tests (virtually nonexistent)

**Moment when the need becomes critical:**
- **PoC phase:** Low need (experimentation, no risk)
- **Production phase:** Critical need (security, audit, compliance)
- **Scale phase:** Very critical need (costs, performance, governance)

**Validating the need with early adopters:**
- Identify 3-5 teams that have already deployed agents to production
- Interviews to understand frustrations and unmet needs
- Validation that SDK_AI_Agents solves their specific problems

### Architecture Trade-offs

**Explicit trade-offs:**

**Complexity vs. Governance**
- **Choice:** Complex event-driven architecture for native governance
- **Trade-off:** Increased operational complexity vs. total control
- **Justification:** Governance is the key differentiator, complexity is managed by the SDK

**Performance vs. Traceability**
- **Choice:** Event-sourcing with persistence of all events
- **Trade-off:** Slight added latency vs. complete traceability
- **Justification:** Replay/audit are differentiating features, performance optimized but secondary

**API Simplicity vs. Power**
- **Choice:** Simple API but sophisticated architecture
- **Trade-off:** Learning curve vs. available power
- **Justification:** Simple Quick Start, advanced features enabled progressively

**Technical roadmap (file → SQL → distributed):**

**Phase 1: File-based Event Store (MVP)**
- **Why:** Simplicity, portability, quick start
- **Limitations:** Vertical scalability, no sharing between instances
- **Migration:** Abstract EventStore interface enables transparent migration

**Phase 2: SQL-based Event Store (Production)**
- **Why:** Scalability, shared state, complex queries
- **Migration:** Export/import from file-based, progressive migration
- **Timing:** When horizontal scalability is needed

**Phase 3: Distributed Event Store (Scale)**
- **Why:** Horizontal scalability, high availability
- **Migration:** From SQL with progressive replication
- **Timing:** When thousands of concurrent executions are needed

**Horizontal scalability strategy:**
- **Short term:** Vertical scaling (file-based → SQL)
- **Medium term:** Horizontal scaling with distributed Event Store (Kafka-style)
- **Long term:** Microservices architecture with distributed Event Store

**Performance benchmarks:**
- **MVP:** Latency < 100ms for a complete agent execution
- **Production:** Support for hundreds of concurrent executions
- **Scale:** Support for thousands of concurrent executions with a distributed Event Store

### Validation & Evidence

**Sources of ROI metrics:**

**Metrics based on:**
- Comparative analysis of existing frameworks (LangChain, Semantic Kernel)
- Patterns observed in in-house solutions (complexity, development time)
- Developer feedback on current frustrations
- Estimate based on glue code reduction and component reuse

**Concrete use cases for validation:**

**Use case 1: Customer support agent with actions**
- **Current problem:** Impossible to replay decisions, no audit
- **SDK_AI_Agents solution:** Native replay, complete audit trail
- **Metric:** Debugging time reduced from 4h to 15min (to be validated)

**Use case 2: Internal automation agent with budgets**
- **Current problem:** Unpredictable AI costs, no control
- **SDK_AI_Agents solution:** Built-in monitoring, budgets, alerts
- **Metric:** 30% cost reduction via optimization (to be validated)

**Use case 3: Finance agent with compliance**
- **Current problem:** No audit trail, no decision traceability
- **SDK_AI_Agents solution:** Native event-sourcing, complete traceability
- **Metric:** Regulatory compliance achieved (to be validated)

**Measurable success criteria:**

**MVP Phase (3 months):**
- 10 teams use the SDK for production agents
- Time to first working agent < 15 minutes
- 0 governance-related security incidents

**Production Phase (6 months):**
- 50 teams use the SDK
- ROI measured: -40% development time (vs. in-house solution)
- Progressive adoption: 30% use the Event Store, 20% capabilities, 10% advanced governance

**Scale Phase (12 months):**
- 200+ teams use the SDK
- ROI validated with documented use cases
- Active community with contributions

### Detailed Developer Experience

**Quick Start < 5 minutes:**

**Objective:** First working agent in under 5 minutes

**Quick Start steps:**
1. Installation: `npm install @sdk-ai-agents/core` (30 seconds)
2. Configuration: LLM provider API key (1 minute)
3. Agent creation: 3 lines of code (1 minute)
4. First run: `agent.run({ input: "..." })` (30 seconds)
5. Replay: `sdk.replay(runId)` (30 seconds)

**Total:** < 5 minutes for a working agent with replay

**Developer tools:**

**CLI for development:**
- `sdk replay <runId>` - Replay an execution
- `sdk audit <runId>` - Complete audit trail
- `sdk compare <runId1> <runId2>` - Compare two executions
- `sdk visualize <runId>` - Visualize the reasoning graph

**Reasoning graph visualization:**
- Web interface to explore the thought graph
- Temporal navigation (see belief evolution)
- Filters by event type (reasoning, action, decision)

**Built-in debugging:**
- Breakpoints on specific events
- State inspection at a given moment
- "What if..." simulation with modifications

**Progressive documentation:**

**Level 1: Quick Start**
- 5-minute guide for the first agent
- Minimal necessary concepts
- Simple concrete examples

**Level 2: Fundamental concepts**
- Event-sourcing explained simply
- Reasoning/action separation
- Capabilities vs. tools

**Level 3: Advanced features**
- Complete governance
- Cognitive observability
- Time travel debugging

**Level 4: In-depth architecture**
- Design decisions and trade-offs
- Patterns and best practices
- Extensibility and plugins

**Developer support:**
- Complete documentation with examples
- FAQ based on real questions
- Active community (Discord/Slack)
- Issue resolution < 24h for critical bugs

**Key message:** "If a developer hits a bug at 2 AM, they quickly find the solution thanks to complete documentation and an active community."

## Target Users

### Primary Users

**Who really faces the problem:**

The problem is **not** experienced by:
- Occasional prompt engineers
- No-code users
- Teams that only build passive chatbots

👉 **The problem is experienced by teams that want to make an AI act in production.**

**Main user groups:**

1. **Backend / fullstack developers** - Implement AI features in existing applications
2. **Tech leads / software architects** - Define technical standards and ensure security/reliability
3. **Product engineers focused on AI platforms** - Design complex AI features at the product/technical interface

**Who gets the most value:**

👉 **The backend developer + tech lead duo.**

- The developer gains simplicity and peace of mind
- The tech lead gains control and governance
- This duo is what justifies adoption

#### Persona 1: Alex - Senior Backend Developer

**Role and context:**
- **Name:** Alex
- **Role:** Senior backend developer
- **Company:** B2B SaaS (20 people)
- **Stack:** Node.js, TypeScript, PostgreSQL, APIs
- **Team:** 3-15 developers
- **Context:** Tech startup or scale-up, strong pressure to ship fast but with technical debt

**Primary goal:**
Integrate an agent that automates customer actions in the existing application. The agent must be able to call APIs, modify data, trigger workflows.

**Problem experienced today:**
- Assembles LLM + tools loops "by hand"
- Fragile, barely testable code
- Difficulty explaining why the agent acts a certain way
- Fear of breaking something in production

**Concrete frustrations:**
- "I don't know how to test my agent"
- "If the agent does something stupid, I can't reproduce it"
- "I have to manage security, costs, and business logic all at once"
- "It quickly becomes unmanageable"

**Current workarounds:**
- Console logs
- Manual flags
- Disabling tools in prod
- Replaying "by hand" with copy-pasted prompts

**Main fears:**
- Breaking production
- Creating an uncontrollable agent
- Losing his tech lead's trust

**Vision of success:**
- Declare an agent as a software component
- Have guardrails by default
- Be able to debug an agent like an API
- Agent in prod with rare incidents
- His tech lead's trust

**Aha moment:**
"I can finally understand, replay, and secure my agent's behavior without rewriting everything."

**What Alex expects from SDK_AI_Agents:**
- A clear and intuitive API
- Automatic guardrails
- The ability to understand and replay a run
- Complete documentation and concrete examples

#### Persona 2: Sarah - Tech Lead / Software Architect

**Role and context:**
- **Name:** Sarah
- **Role:** Tech Lead / Software Architect
- **Company:** Scale-up or enterprise (50-200 people)
- **Team:** 10 to 50+ developers
- **Context:** Several AI projects in parallel, strong compliance and maintainability constraints

**Primary goal:**
Define technical standards for AI agent usage across the organization. Ensure security, reliability, and cost control. Responsible for what reaches production.

**Problem experienced today:**
- Every developer creates their own agent framework
- No standardization
- Major risks (security, costs, compliance)
- Impossible to audit an AI behavior
- No visibility into what agents are doing

**Concrete frustrations:**
- "I have no visibility into what the agents are doing"
- "I can't approve this kind of code with confidence"
- "Agents are too powerful and not controlled enough"
- "Every team reinvents the wheel"

**Current workarounds:**
- Partial refusal of autonomous AI
- Drastic restriction of tools
- Heavy human validation overlays
- Long and tedious approval processes

**Vision of success:**
- A common foundation for all agents
- Global rules applicable to everyone
- Actionable traces in case of incident
- Standardization without blocking innovation
- Regulatory compliance achieved

**Aha moment:**
"We can finally authorize autonomous agents without putting the company at risk."

**What Sarah expects from SDK_AI_Agents:**
- Native governance with centralized policies
- Complete audit trail for compliance
- Visibility into all agents and their actions
- Cost and budget control
- Standardization without excessive complexity

#### Persona 3: Jordan - Product Engineer / AI Platform Engineer

**Role and context:**
- **Name:** Jordan
- **Role:** Product Engineer / AI Platform Engineer
- **Company:** SaaS products with a strong AI component
- **Context:** Needs fast iteration + reliability, close collaboration with product and devs

**Primary goal:**
Design complex AI features. Work at the product/technical interface. Iterate frequently on agent behavior to improve the user experience.

**Problem experienced today:**
- Every prompt change is risky
- Impossible to compare two versions of an agent
- No clear framework for measuring improvement
- Hard to iterate without regressions

**Concrete frustrations:**
- "I don't know if my change actually improves the agent"
- "I can't easily compare two versions"
- "Every change can break something unexpectedly"

**Vision of success:**
- Compare two agent behaviors
- Test scenarios before going to prod
- Improve the agent without regression
- Clear improvement metrics

**Aha moment:**
"I can evolve the agent like a regular product feature."

**What Jordan expects from SDK_AI_Agents:**
- Run comparison to measure improvements
- Structured tests before deployment
- Observability to understand user behavior
- Fast iteration without risk

### Secondary Users

**Secondary users (influencers / indirect beneficiaries):**

They don't always write the code, but they carry significant weight in adoption decisions.

#### Security / Compliance Teams

**Role:** Validate the security and compliance of AI agents before deployment

**Benefits of SDK_AI_Agents:**
- Complete audit trail for regulatory compliance
- Centralized and verifiable policies
- Traceability of every decision and action
- "Deny by default" security with controlled capabilities

**Impact:**
- No longer block AI innovation thanks to native governance
- Can approve agents with confidence
- Compliance achieved without complex workarounds

**Influence:** High - Their approval is often required for production deployment

#### Product Teams

**Role:** Define features and measure user impact

**Benefits of SDK_AI_Agents:**
- Reliable and predictable agents
- Reduction in user incidents
- Observability to understand user behavior
- AI cost control

**Impact:**
- Can finally trust agents for critical features
- Fewer user incidents related to agents
- Better understanding of agent impact

**Influence:** Moderate - Define needs but don't always decide on the technical tool

#### Data / ML Teams (in support)

**Role:** Support product teams with ML/AI expertise

**Benefits of SDK_AI_Agents:**
- Standardized framework for AI agents
- Less support needed for integration
- Focus on business value rather than infrastructure

**Impact:**
- Less time spent on infrastructure, more on business value
- Simplified support thanks to standardization

**Influence:** Low - Support but don't decide directly

### User Journey

#### Journey 1: Alex (Developer) - First Agent in Production

**Discovery:**
- **Moment:** Alex is looking for a solution to secure his agent before going to prod
- **Source:** Technical article, tech lead recommendation, GitHub search
- **Need:** "I want to deploy my agent without risking my career"
- **Emotion:** Worry, need for a solution

**Onboarding:**
- **Moment:** Installation and first working agent
- **Actions:** `npm install`, Quick Start guide, first `agent.run()`
- **Time:** < 5 minutes for the first working agent
- **Emotion:** Surprise ("it's that simple?"), relief

**Core Usage:**
- **Moment:** Daily agent development
- **Actions:** Defining capabilities, configuring policies, tests
- **Frequency:** Daily during development
- **Emotion:** Growing confidence, productivity

**Success Moment (Aha):**
- **Moment:** First bug in production, using replay
- **Action:** `sdk.replay(runId)` → Immediate understanding of the problem
- **Result:** Bug fixed in 15 minutes instead of 4 hours
- **Emotion:** Euphoria, total confidence

**Long-term:**
- **Moment:** Agent stable in production for several weeks
- **Actions:** Cost monitoring, audit trail for compliance, improvement iterations
- **Result:** Reliable agent, rare incidents, tech lead trust
- **Emotion:** Peace of mind, pride

#### Journey 2: Sarah (Tech Lead) - Organizational Standardization

**Discovery:**
- **Moment:** Sarah wants to standardize AI agent usage across the organization
- **Source:** Internal need, research into governance solutions
- **Need:** "I want to authorize agents without putting the company at risk"
- **Emotion:** Security concern, need for control

**Onboarding:**
- **Moment:** Evaluating SDK_AI_Agents for organizational adoption
- **Actions:** Architecture review, governance testing, security validation
- **Time:** 1-2 weeks of evaluation
- **Emotion:** Caution, hope

**Core Usage:**
- **Moment:** Organizational deployment
- **Actions:** Configuring global policies, training teams, monitoring
- **Frequency:** Weekly for governance, daily for monitoring
- **Emotion:** Control regained, confidence

**Success Moment (Aha):**
- **Moment:** Successful compliance audit thanks to the complete audit trail
- **Action:** Export audit trail, demonstrate governance
- **Result:** Compliance achieved without complex workarounds
- **Emotion:** Relief, validation

**Long-term:**
- **Moment:** Successful standardization, several teams use SDK_AI_Agents
- **Actions:** Evolving policies, cost optimization, ongoing training
- **Result:** AI innovation authorized with governance, rare incidents
- **Emotion:** Satisfaction, organizational pride

#### Journey 3: Jordan (Product Engineer) - AI Feature Iteration

**Discovery:**
- **Moment:** Jordan wants to improve an existing agent's behavior
- **Source:** Need for iteration, research into comparison tools
- **Need:** "I want to improve the agent without regression"
- **Emotion:** Frustration with difficult iteration, need for confidence

**Onboarding:**
- **Moment:** Migrating an existing agent to SDK_AI_Agents
- **Actions:** Adapting existing code, configuring capabilities
- **Time:** 1-2 days for migration
- **Emotion:** Apprehension about migration, hope for improvement

**Core Usage:**
- **Moment:** Iterating on agent behavior
- **Actions:** Modifying prompts, comparing runs, testing scenarios
- **Frequency:** Several times a week during feature development
- **Emotion:** Productivity, confidence in iteration

**Success Moment (Aha):**
- **Moment:** Comparing two agent versions, clear measured improvement
- **Action:** `sdk.compare(runId1, runId2)` → Visible improvement metrics
- **Result:** Improvement measured and validated before deployment
- **Emotion:** Confidence, satisfaction

**Long-term:**
- **Moment:** Stable and high-performing AI feature
- **Actions:** Monitoring user behavior, ongoing optimizations
- **Result:** Feature evolves like a regular product feature, regressions avoided
- **Emotion:** Peace of mind, product satisfaction

**Conclusion:**

SDK_AI_Agents is aimed at mature technical teams, facing the reality of AI in production.

**This is not a tool for experimenting.**
**It is a tool for owning the consequences of autonomous AI.**

## Success Metrics

**Guiding principle:**

The success of SDK_AI_Agents is not measured by the number of agents created, but by the level of trust teams place in agents in production.

**Success = teams dare to entrust real actions to agents.**

### User Success Metrics

#### Expected User Outcomes

**Alex - Backend Developer:**

**Desired outcome:**
- Build a useful agent without creating an uncontrollable monster
- Save time without losing control

**How he knows it's working:**
- His agent is in production
- He can understand a decision, replay a run, fix without breaking everything

**"Aha" moment:**
"I reproduced an incident in 30 seconds and understood exactly why the agent did that."

**Success metrics for Alex:**
- Agent stable in production for > 1 week
- Incident debugging time < 5 minutes (vs. 4 hours before)
- Tech lead trust achieved

**Sarah - Tech Lead / Architect:**

**Desired outcome:**
- Authorize autonomous AI without putting the company at risk
- Standardize agent usage

**How she knows it's working:**
- All agents go through the same foundation
- Policies apply automatically
- Incidents are auditable

**"Aha" moment:**
"I can approve this agent PR without stress, because everything is traced and controlled."

**Success metrics for Sarah:**
- 100% of agents use SDK_AI_Agents (standardization)
- 0 non-auditable incidents
- Regulatory compliance achieved

**Jordan - Product / Platform Engineer:**

**Desired outcome:**
- Evolve agents like a product
- Measure, compare, improve without regression

**How he knows it's working:**
- He compares two versions of an agent
- He tests scenarios before going to prod

**"Aha" moment:**
"I can improve the agent without breaking what was working."

**Success metrics for Jordan:**
- Working version comparison
- 0 regressions after improvements
- Measurable improvement metrics

#### Value-Indicating Behaviors (Leading Indicators)

These behaviors show that the value is real, even before the business metrics.

**Key behavioral adoption:**

Users:
- ✅ Enable advanced tracing
- ✅ Define policies
- ✅ Use replay
- ✅ Write agent tests

👉 **If these features are used voluntarily, the product is useful.**

**Signals of real value:**
- Voluntary use of guardrails (not imposed)
- Progressive adoption of advanced features
- Sharing examples and use cases within the community
- Contributing to documentation and improvements

#### Key User Metrics (Product Metrics)

**"Time-to-Value" metrics:**

| Metric | Target | Measurement |
|----------|-------|--------|
| Time to first working agent | < 30 minutes | From install to first successful `agent.run()` |
| Time to first agent in prod | < 1 day | From agent creation to production deployment |
| Time to understand an agent incident | < 5 minutes | From incident report to understanding via replay |
| Time to replay a run | < 10 seconds | From `sdk.replay(runId)` command to result |

**Adoption metrics for differentiating features:**

| Feature | Success signal | Goal |
|---------|------------------|----------|
| Event tracing | > 70% of agents | Agents with tracing enabled |
| Active policies | > 60% of projects | Projects with at least one policy defined |
| Tool scopes / allowlist | > 50% | Agents with controlled capabilities |
| Replay used | > 40% | Users who used replay at least once |
| Agent tests (golden traces) | > 30% | Projects with structured agent tests |

👉 **These figures are deliberately ambitious: these are features that "hurt" if left unused.**

**Quality & Reliability:**

| Metric | Goal | Measurement |
|----------|----------|--------|
| Agent incidents in prod | Significant ↓ | Number of incidents per month |
| Non-reproducible incidents | ≈ 0 | Incidents where replay is impossible |
| Agent rollback / hotfix | ↓ | Number of rollbacks needed |
| Agent deactivation out of fear | ↓ | Agents disabled due to lack of trust |

### Business Objectives

#### Success at 3 Months (Early Success)

**Objective:** Validate problem/solution fit

**Key indicators:**
- Teams use SDK_AI_Agents in production
- Users talk about replay, tracing, policies
- The SDK is perceived as: "what let us dare to use autonomous AI"

**Metrics:**
- **Active projects** with agents in prod: > 10 projects
- **Number of traced runs / replays**: > 1000 traced runs
- **Strong qualitative feedback**: User testimonials, documented use cases
- **Voluntary adoption**: > 50% of users enable governance features

**Success criteria:**
- ✅ Validation that the problem is real and the solution works
- ✅ Satisfied early adopters who recommend the SDK
- ✅ Measurable proof of value (time saved, incidents avoided)

#### Success at 12 Months (Real Traction)

**Objective:** Become a de facto standard for AI agent governance

**Indicators:**
- SDK_AI_Agents is the common foundation for agents across organizations
- Adoption by more structured teams (enterprises)
- Advanced use of guardrails (complex policies, budgets, approvals)
- Critical use cases (real actions, not chat)

**Metrics:**
- **Team retention**: > 80% of teams continue after 6 months
- **Average number of agents per project**: > 3 agents per project
- **Adoption of advanced features**: > 40% use advanced governance
- **Critical use cases**: > 20% of agents with real actions (not chat)

**Success criteria:**
- ✅ Positioning as the standard governance infrastructure
- ✅ Adoption by regulated enterprises (finance, healthcare)
- ✅ Active community with contributions

### Key Performance Indicators

#### Strategic KPIs

**1. Adoption & Growth**

| KPI | 3-month target | 12-month target | Measurement |
|-----|--------------|---------------|--------|
| Active projects | > 10 | > 100 | Number of projects with agents in prod |
| Active users | > 50 | > 500 | Users who created at least one agent |
| Traced runs | > 1,000 | > 100,000 | Total number of runs with event tracing |

**2. Engagement & Value**

| KPI | 3-month target | 12-month target | Measurement |
|-----|--------------|---------------|--------|
| Governance feature adoption | > 50% | > 70% | % of projects with active policies |
| Replay usage | > 30% | > 50% | % of users who used replay |
| Agent tests | > 20% | > 40% | % of projects with structured tests |

**3. Quality & Reliability**

| KPI | 3-month target | 12-month target | Measurement |
|-----|--------------|---------------|--------|
| Incident reduction | -30% | -60% | vs. baseline before SDK_AI_Agents |
| Reproducible incidents | 100% | 100% | % of incidents where replay is possible |
| Debugging time | < 10 min | < 5 min | Average time to understand an incident |

**4. Business Impact**

| KPI | 3-month target | 12-month target | Measurement |
|-----|--------------|---------------|--------|
| Development time | -40% | -60% | vs. in-house solution |
| AI costs | -20% | -30% | vs. baseline without monitoring |
| Time to production | -30% | -50% | vs. in-house solution |

#### Validation KPIs (MVP Phase)

**Exclusive focus on:**

1. **⏱️ Time to first agent**: < 30 minutes
2. **🔁 Working replay**: 100% of runs replayable
3. **📊 Understandable tracing**: > 80% of users understand traces
4. **🔐 Simple but active policies**: > 60% of projects with policies

👉 **If these 4 points work, the rest will follow.**

### Contribution to Strategic Objectives

#### Market Positioning

**SDK_AI_Agents positions itself as:**
- The governance infrastructure for AI agents
- Not an experimentation tool, but a serious standard
- The solution for mature technical teams facing AI in production

**Measurable competitive advantage:**

Ability to:
- **Audit**: Complete audit trail for compliance
- **Replay**: Native replay in 1 command
- **Explain**: Cognitive observability with a reasoning graph
- **Secure**: Native governance with policies and capabilities

👉 **These dimensions are very hard to copy quickly.**

**Positioning metrics:**
- **Mentions as a standard**: Citations in technical articles, conferences
- **Favorable comparisons**: "SDK_AI_Agents vs LangChain" with governance advantages
- **Adoption by leaders**: Use by recognized enterprises

### Metrics Prioritization

#### Phase 1 - MVP

**Exclusive focus on:**
- ⏱️ Time to first agent: < 30 minutes
- 🔁 Working replay: 100% of runs replayable
- 📊 Understandable tracing: > 80% of users understand traces
- 🔐 Simple but active policies: > 60% of projects with policies

**MVP Metrics:**
- 10 projects use SDK_AI_Agents in production
- Average time to first agent < 30 minutes
- Replay works for 100% of runs
- > 60% of projects enable policies

#### Phase 2 - Adoption

**Focus on:**
- Adoption of governance features
- Voluntary use of guardrails
- Incident reduction
- Expansion toward critical use cases

**Adoption Metrics:**
- > 100 active projects
- > 70% adoption of governance features
- -60% incident reduction
- > 20% critical use cases

**One-sentence summary:**

**The success of SDK_AI_Agents is measured by the trust teams place in their agents in production.**

## MVP Scope

**Guiding principle of the MVP:**

The MVP must prove that an agent can act in production in a controlled, explainable, and replayable way.

**Anything that doesn't directly serve this objective is out of the MVP.**

**The main problem to solve (reminder):**

👉 Today, teams cannot make an AI act in production without losing control.

The MVP must therefore demonstrate a single thing:

👉 **"I can understand, replay, and secure my agent's behavior."**

**The MVP in one sentence:**

An event-driven agent runtime capable of executing tools in a controlled way, with native tracing and replay.

### Core Features

#### 1. Event-Driven Agent Runtime (CORE)

**Why?**
This is the backbone. Without it, there is no replay, no audit, no differentiation.

**Absolutely must work:**
- Execute an agent via a simple loop (max steps)
- Emit structured events at each step
- Persist these events (at least in-memory + file)

**If missing → incomplete MVP.**

**Aha moment:** "Every action of the agent is a traceable event."

#### 2. Typed and Controlled Tool Calling

**Why?**
This is where the danger begins. This is the core of the user's problem.

**Absolutely must work:**
- Explicit tool definition (`defineTool`)
- Input validation (Zod / schema)
- Tool registry with allowlist
- Tool call visible in the events

**Aha moment:**
"The agent can't do anything I haven't explicitly authorized."

#### 3. Minimal Policies (Security by Design)

**Why?**
Without policies, it's just one more framework.

**Mandatory MVP policies:**
- Tool allowlist (deny by default)
- Max budget (tokens or steps)
- Timeout / max steps

👉 **No human approval yet, but the structure must exist.**

**Aha moment:**
"Even if the agent goes off the rails, it is mechanically limited."

#### 4. Native Observability (Tracing First-Class)

**Why?**
This is the second pillar alongside tool calling.

**Absolutely must work:**
- Readable traces (structured JSON)
- Every run has a `runId`
- Every decision, tool call, error is traced
- Export possible (console + file)

**Aha moment:**
"I understand exactly what the agent did and why."

#### 5. Execution Replay (MVP Killer Feature)

**Why?**
This is the feature that changes everything.

**MVP Replay =**
- Replay a run from its events
- Without contacting the LLM again ("replay" mode)
- Same sequence, same tool calls

👉 **No UI needed. CLI or API is enough.**

**Ultimate aha moment:**
"I just replayed an incident in 5 seconds."

#### 6. Minimal but Solid DX

**Why?**
Without a clear DX, even a good core won't get used.

**Absolutely must work:**
- Quickstart in < 10 lines
- 1 complete example (agent + tool + replay)
- Clear, typed TypeScript API
- Essential documentation

**Aha moment:**
"I can create my first agent in under 30 minutes."

### MVP - Final Functional Scope (Checklist)

**MVP = YES ✅**

- ✅ Event-driven agent runtime
- ✅ Typed tool calling + allowlist
- ✅ Simple policies (budget, steps, timeout)
- ✅ Structured tracing
- ✅ Execution replay
- ✅ 1 LLM provider (OpenAI or Anthropic)
- ✅ 1 complete real example
- ✅ Trace-based tests

**MVP = NO ❌**

- ❌ "Magic" intelligence
- ❌ Premature abstractions
- ❌ Heavy enterprise features

### Out of Scope for MVP

**Saying no is strategic.**

**Explicitly out of MVP (version 2.0+):**

- ❌ **Multi-agent orchestration** - Focus on a single agent first
- ❌ **Vector memory / advanced RAG** - Basic memory is enough for MVP
- ❌ **Web UI / dashboard** - CLI and API are enough for MVP
- ❌ **Plugin marketplace** - Basic extensibility is enough
- ❌ **Interactive human approval** - Structure exists, not the UI
- ❌ **Fine-tuning / training** - Not in the MVP scope
- ❌ **Advanced cost optimization** - Basic monitoring is enough
- ❌ **Multi-language support** - TypeScript only for MVP (Python later)

👉 **Including these would mean missing the MVP.**

**Rationale for each exclusion:**
- **Multi-agent:** Added complexity without immediate MVP value
- **Advanced RAG:** Can be added via external integrations
- **UI/Dashboard:** CLI and API allow concept validation
- **Marketplace:** Basic extensibility is enough for MVP
- **Human approval:** Structure exists, UI can wait
- **Fine-tuning:** Out of governance scope
- **Cost optimization:** Basic monitoring validates the concept
- **Multi-language:** TypeScript allows complete validation

### MVP Success Criteria

**The MVP's "aha moment" (very important):**

If the user doesn't experience at least one of these moments, the MVP fails:

- 🔁 **"I can replay exactly what happened."**
- 🔍 **"I understand why the agent did that."**
- 🔐 **"The agent can't cause damage."**

**MVP success criteria:**

**1. Technical validation:**
- ✅ Event-driven runtime works
- ✅ Replay works for 100% of runs
- ✅ Policies block unauthorized actions
- ✅ Complete and readable tracing

**2. User validation:**
- ✅ Time to first working agent < 30 minutes
- ✅ Users understand the traces
- ✅ Replay used for incident debugging
- ✅ Positive feedback on control and security

**3. Problem/solution validation:**
- ✅ Users confirm the problem is solved
- ✅ Agents deployed to production with confidence
- ✅ Incidents resolved quickly thanks to replay
- ✅ Tech leads approve agent deployment

**4. MVP metrics:**
- ✅ 10 projects use SDK_AI_Agents in production
- ✅ > 60% of projects enable policies
- ✅ > 40% of users use replay
- ✅ Incident debugging time < 5 minutes

**Decision gate for post-MVP:**
- If MVP metrics are met → Proceed with advanced features
- If MVP metrics are not met → Iterate on the MVP, don't add features

### Future Vision

**If the MVP is a success:**

SDK_AI_Agents gradually becomes an **agent governance platform** with:

**Phase 2 - Production-Ready (3-4 months):**
- Advanced policies (human approval, complex budgets)
- Cognitive observability (reasoning graph)
- Complete capabilities system
- Multi-provider LLM support

**Phase 3 - Advanced Features (6-12 months):**
- Causal and temporal memory
- Time travel debugging
- Multi-agent orchestration
- Sector-specific compliance (finance, healthcare)

**Phase 4 - Platform (12-24 months):**
- Plugin marketplace
- Web UI/Dashboard
- Multi-language support (Python)
- Ecosystem and community

**But everything starts from the MVP:**
- Event log + tool control + replay

**2-3 year vision:**

SDK_AI_Agents becomes the **de facto standard for AI agent governance**, used by:
- Regulated enterprises (finance, healthcare, legal)
- Tech scale-ups with critical agents
- SaaS platforms integrating AI agents

**Positioning:**
- Governance infrastructure, not an experimentation tool
- A serious standard for production
- A reference for audit and compliance

### Build Order (Technical Roadmap)

**Recommended strict order:**

1. **Event model (TS types)** - Foundation
2. **EventStore + EventBus** - Event-driven infrastructure
3. **Minimal agent runtime** - Basic execution
4. **Tool system (defineTool + registry)** - Tool control
5. **MVP Policies** - Security by design
6. **JSON Tracing** - Observability
7. **Replay** - Killer feature
8. **Example + quickstart** - DX and validation

**MVP Milestones:**
- **Weeks 1-2:** Event model + basic EventStore
- **Weeks 3-4:** Agent runtime + Tool system
- **Weeks 5-6:** Policies + Tracing
- **Weeks 7-8:** Replay + Complete example
- **Weeks 9-10:** Tests, documentation, polish

**Final summary:**

The SDK_AI_Agents MVP is an event-driven agent engine capable of executing real actions in a controlled, observable, and replayable way.

**Everything else can wait.**

---

