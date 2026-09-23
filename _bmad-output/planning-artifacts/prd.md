---
stepsCompleted: [1, 2, 3, 4, 6, 7, 8, 9]
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-SDK_AI_Agents-2026-01-06.md
  - _bmad-output/planning-artifacts/research/technical-ecosysteme-sdks-frameworks-agents-ia-research-2026-01-06.md
  - _bmad-output/analysis/brainstorming-session-2026-01-06.md
briefCount: 1
researchCount: 1
brainstormingCount: 1
projectDocsCount: 0
workflowType: 'prd'
lastStep: 8
---

# Product Requirements Document - SDK_AI_Agents

**Author:** Nicolashedoire
**Date:** 2026-01-06

## Executive Summary

SDK_AI_Agents creates the operational trust needed to deploy AI agents in production. While teams know how to make an AI "talk," they don't know how to make an AI act reliably, in a controlled, explainable, and secure way in production.

The problem isn't the LLM, but the architecture around the LLM. Technical teams cobble together fragile agents, reinvent their own frameworks, and handle security "on trust," with poor logs and virtually no tests.

SDK_AI_Agents transforms AI agents from experimental tools into governable, explainable, production-ready decision-making systems. It doesn't aim to be a better prompt framework or an LLM wrapper, but the governance infrastructure for AI agents where the agent proposes and the system decides.

**Vision in one sentence:** SDK_AI_Agents creates the operational trust needed to deploy AI agents in production.

### What makes this product special

SDK_AI_Agents stands out through eight strategic differentiators that converge toward operational trust:

#### Foundational technical differentiators

1. **Native event-sourcing** → Replay, audit, and behavior comparison in a single command
   - Every execution is traceable, replayable, and comparable
   - Unique in the market: impossible with LangChain or other frameworks

2. **Separation of reasoning/action** → Security by design (the LLM never causes a side effect)
   - The LLM generates structured intentions, never direct actions
   - All actions pass through a governed Action Engine

3. **Built-in governance by design** → Native policies, budgets, guardrails
   - Governance is not an option or a plugin: it is structural, built into the runtime
   - "Deny by default" security with explicit contracts for each capability

4. **Native testability of agents** → Golden traces, deterministic replay, non-regression
   - Agents become testable software objects, not probabilistic behaviors
   - QA, CI/CD, rollback, and continuous improvement become possible

#### Deep strategic differentiators

5. **Agent ≠ LLM** → A fundamental paradigm shift
   - An agent is not an LLM with tools
   - An agent is a governed decision-making system, of which the LLM is only one component
   - Justifies the existence of dedicated infrastructure, beyond orchestration frameworks

6. **Agent as software artifact** → Versionable, comparable, testable, auditable
   - Each run is an industrial software artifact, not probabilistic magic
   - Enables structured QA, CI/CD, rollback, and continuous improvement
   - Few tools go this far structurally

7. **Cognitive observability** → Observing the reasoning, not just the execution
   - Not just logs, metrics, spans
   - Understanding why this decision, which constraints came into play, which alternatives were considered
   - Observing how the agent reasons under constraint, not just what it does

8. **Security through impossibility** → A structural property, not a feature
   - No tool without explicit declaration
   - No action without a verified policy
   - No execution without a complete trace
   - Security is not a feature, it is a structural property

**Clear positioning:**
- ❌ Not a better LangChain
- ❌ Not an LLM wrapper
- ✅ Governance infrastructure for acting intelligence
- ✅ A structuring layer between AI and the real world (comparable to Terraform for infrastructure, Prisma for data)

**Evolution of the vision:**
SDK_AI_Agents is not a tool for creating agents, it is a governance infrastructure for acting intelligence. The vision has evolved:
- From "how to do it" to "how to own it" — owning the consequences of agents
- From runtime to a proof system — proving what they did, why, under which rules
- From dev tool to strategic infrastructure — a potential standard, not just an SDK

## Project Classification

**Technical Type:** `developer_tool`
- TypeScript/Node.js SDK/package for backend developers and tech leads
- Focus on governance, observability, and testability of AI agents

**Domain:** `general`
- General-purpose tool for developers working with AI agents
- Applicable to any domain requiring AI agents in production

**Complexity:** `low` (with advanced technical aspects)
- Simple API by default (10-line Quick Start)
- Sophisticated underlying architecture (event-sourcing, reasoning/action separation)
- Complexity managed by the SDK, not exposed to the developer

**Project Context:** Greenfield — new project

## Success Criteria

**Guiding principle:**

The success of SDK_AI_Agents is not measured by the number of agents created, but by the level of trust teams place in agents in production.

**Success = teams dare to entrust real actions to agents.**

### User Success

#### Time-to-Value Metrics

These metrics measure onboarding friction and speed of adoption:

| Metric | Target | Measurement |
|----------|-------|--------|
| Time to first working agent | < 30 minutes | From install to first successful `agent.run()` |
| Time to first agent in prod | < 1 day | From agent creation to production deployment |
| Time to understand an agent incident | < 5 minutes | From incident report to understanding via replay |
| Time to replay a run | < 10 seconds | From `sdk.replay(runId)` command to result |

#### Acquired Trust Metrics

These metrics validate that the user isn't just trying it out, but is truly engaging:

| Axis | Metric | MVP Target |
|-----|----------|-----------|
| **Trust** | % of agents authorized to perform real actions | > 50% of agents in prod |
| **Mastery** | % of incidents successfully reproduced via replay | 100% of incidents reproducible |
| **Deep adoption** | % of projects using policies + replay (not just run()) | > 60% of projects |

#### User Success Moments (Aha Moments)

**Aha Moment #1 - Developer (Alex):**
"I reproduced an incident in 30 seconds and understood exactly why the agent did that."

**Aha Moment #2 - Tech Lead (Sarah):**
"I can approve this agent PR without stress, because everything is traced and controlled."

**Aha Moment #3 - Product Engineer (Jordan):**
"I can improve the agent without breaking what was working."

**Aha Moment #4 - Tech Lead (Governance):**
"I can define a global rule and it applies to every agent."
➡️ Validates cross-cutting governance.

**Aha Moment #5 - Product (Comparison):**
"I can compare two versions of an agent the way I'd compare two features."
➡️ Validates that the agent becomes a product object, not magic behavior.

#### Adoption of Differentiating Features

| Feature | Success signal | MVP goal |
|---------|------------------|--------------|
| Event tracing | > 70% of agents | Agents with tracing enabled |
| Active policies | > 60% of projects | Projects with at least one policy defined |
| Tool scopes / allowlist | > 50% | Agents with controlled capabilities |
| Replay used | > 40% | Users who used replay at least once |
| Agent tests (golden traces) | > 30% | Projects with structured agent tests |

👉 **These figures are deliberately ambitious: these are features that "hurt" if left unused.**

#### Personas and Expected Outcomes

**Alex - Backend Developer:**
- Agent stable in production for > 1 week
- Incident debugging time < 5 minutes (vs. 4 hours before)
- Tech lead trust achieved

**Sarah - Tech Lead / Architect:**
- 100% of agents use SDK_AI_Agents (standardization)
- 0 non-auditable incidents
- Regulatory compliance achieved

**Jordan - Product / Platform Engineer:**
- Working version comparison
- 0 regressions after improvements
- Measurable improvement metrics

### Business Success

#### Success at 3 Months - Problem Validation

**Objective:** Validate problem/solution fit

**Key indicators (proof, not volume):**
- ≥ 3 teams using the SDK in production
- ≥ 1 real incident replayed and understood
- User feedback stating: "It's the replay / tracing / policies that convinced us"

**Metrics:**
- **Active projects** with agents in prod: ≥ 3 projects
- **Number of traced runs / replays**: > 1000 traced runs
- **Strong qualitative feedback**: User testimonials, documented use cases
- **Voluntary adoption**: > 50% of users enable governance features

**Success criteria:**
- ✅ Validation that the problem is real and the solution works
- ✅ Satisfied early adopters who recommend the SDK
- ✅ Measurable proof of value (time saved, incidents avoided)

#### Success at 12 Months - Positioning Validation

**Objective:** Become a de facto standard for AI agent governance

**Indicators (validation of practice change):**
- SDK used as the standard foundation (not just one lib among others)
- Real-stakes use cases (non-trivial actions)
- Voluntary adoption of guardrails (not imposed)

**Metrics:**
- **Team retention**: > 80% of teams continue after 6 months
- **Average number of agents per project**: > 3 agents per project
- **Adoption of advanced features**: > 40% use advanced governance
- **Critical use cases**: > 20% of agents with real actions (not chat)

**Success criteria:**
- ✅ Positioning as the standard governance infrastructure
- ✅ Adoption by regulated companies (finance, healthcare)
- ✅ Active community with contributions

#### Metrics to Track (without optimizing at MVP)

To track in order to understand depth of usage:
- Number of agents per project (depth of usage)
- Team retention → next project
- Number of runs / replays per agent

To keep for later (post-MVP):
- Revenue
- Pricing
- ARR

👉 **At MVP, technical credibility and trust take priority over monetization.**

### Technical Success

#### MVP Technical Criteria

**Performance:**
- SDK overhead (excluding LLM/tools) < 5–10 ms
- Replay without an LLM call

**Reliability:**
- No tool executed without a corresponding event
- No non-traceable action
- No "orphan" run (without a complete trace)

**Relative determinism:**
- Replay = same logical sequence
- Same tool calls in the same order
- 👉 **Reproducibility matters more than raw speed.**

#### Non-Negotiable Technical Constraints

1. **Event log = source of truth**
   - No "hidden" logic
   - Everything is traceable and replayable

2. **Deny by default**
   - Tool, action, capability: everything must be explicitly authorized
   - Security through impossibility, not through configuration

3. **Stable, minimal API**
   - Few concepts, but solid ones
   - Type-safe, documented, predictable

#### MVP Validation KPIs (Strict Prioritization)

**Priority 1 - Critical (if these 3 are true → concept validated):**
1. 🔁 **Working and used replay**: 100% of runs replayable
2. 🔍 **Effortlessly understandable tracing**: > 80% of users understand traces
3. 🔐 **Genuinely active policies**: > 60% of projects with policies

**Priority 2 - Optimizable:**
4. ⏱️ **Acceptable time-to-first-agent**: < 30 minutes

👉 **If 1, 2, and 3 are true → the concept is validated. The rest is optimizable.**

### Measurable Outcomes

#### Quality & Reliability

| Metric | MVP Goal | Measurement |
|----------|--------------|--------|
| Agent incidents in prod | Significant ↓ | Number of incidents per month |
| Non-reproducible incidents | ≈ 0 | Incidents where replay is impossible |
| Agent rollback / hotfix | ↓ | Number of rollbacks needed |
| Agent deactivation out of fear | ↓ | Agents disabled due to lack of trust |

#### Business Impact (Post-MVP)

| KPI | 3-month target | 12-month target | Measurement |
|-----|--------------|---------------|--------|
| Development time | -40% | -60% | vs. in-house solution |
| AI costs | -20% | -30% | vs. baseline without monitoring |
| Time to production | -30% | -50% | vs. in-house solution |

## Product Scope

### MVP - Minimum Viable Product

**Guiding principle:**
The MVP must prove that an agent can act in production in a controlled, explainable, and replayable way.

**The MVP in one sentence:**
An event-driven agent runtime capable of executing tools in a controlled way, with native tracing and replay.

**The MVP must demonstrate:**
👉 **"I can understand, replay, and secure my agent's behavior."**

#### Core MVP Features

1. **Event-Driven Agent Runtime (CORE)**
   - Execute an agent via a simple loop (max steps)
   - Emit structured events at each step
   - Persist these events (at least in-memory + file)

2. **Typed and Controlled Tool Calling**
   - Explicit tool definition (`defineTool`)
   - Input validation (Zod / schema)
   - Tool registry with allowlist
   - Tool call visible in the events

3. **Minimal Policies (Security by Design)**
   - Tool allowlist (deny by default)
   - Max budget (tokens or steps)
   - Timeout / max steps

4. **Native Observability (Tracing First-Class)**
   - Readable traces (structured JSON)
   - Every run has a `runId`
   - Every decision, tool call, error is traced
   - Export possible (console + file)

5. **Execution Replay (MVP Killer Feature)**
   - Replay a run from its events
   - Without contacting the LLM again ("replay" mode)
   - Same sequence, same tool calls

6. **Minimal but Solid DX**
   - Quickstart in < 10 lines
   - 1 complete example (agent + tool + replay)
   - Clear, typed TypeScript API
   - Essential documentation

**MVP Checklist:**
- ✅ Event-driven agent runtime
- ✅ Typed tool calling + allowlist
- ✅ Simple policies (budget, steps, timeout)
- ✅ Structured tracing
- ✅ Execution replay
- ✅ 1 LLM provider (OpenAI or Anthropic)
- ✅ 1 complete real example
- ✅ Trace-based tests

### Growth Features (Post-MVP)

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

### Vision (Future)

**Phase 4 - Platform (12-24 months):**
- Plugin marketplace
- Web UI/Dashboard
- Multi-language support (Python)
- Ecosystem and community

**Explicitly out of MVP:**
- ❌ Multi-agent orchestration
- ❌ Vector memory / advanced RAG
- ❌ Web UI / dashboard
- ❌ Plugin marketplace
- ❌ Interactive human approval (structure exists, not the UI)
- ❌ Fine-tuning / training
- ❌ Advanced cost optimization
- ❌ Multi-language support (TypeScript only for MVP)

👉 **Including these would mean missing the MVP.**

## User Journeys

### Journey 1: Alex - From doubt to operational trust

**The hero:** Alex, senior backend developer at a 20-person B2B SaaS company. Stack: Node.js, TypeScript, PostgreSQL. He needs to integrate an agent that automates customer actions in the existing application.

**Opening scene - Friday 6:30 PM:**
A production bug related to the agent. The agent unexpectedly modified critical data. Alex can't reproduce the problem. He spends 4 hours digging through console logs, with no result. His tech lead asks for explanations he can't give. He feels powerless and frustrated.

**Rising action - Monday morning:**
He discovers SDK_AI_Agents via a technical article that mentions "native replay in 1 command." Intrigued, he installs the package: `npm install @sdk-ai-agents/core`. He follows the Quick Start and creates his first working agent in under 30 minutes. He's surprised by the simplicity of the API.

He gradually migrates his existing code. He defines his first capabilities with `defineTool()`, and immediately understands that every tool must be explicitly authorized. He configures simple policies: max token budget, timeout, tool allowlist. He sees that security is "deny by default" — exactly what he needed.

**Climax - Two weeks later, 2:23 PM:**
A similar incident occurs. This time, he runs `sdk.replay(runId)` and sees exactly what happened. He understands why the agent made that decision, which constraints came into play, and which alternatives were considered. He fixes the problem in 5 minutes instead of 4 hours.

His tech lead approves the PR without stress, because everything is traced. Alex can explain every decision, every tool call, every constraint. He finally feels in control.

**Resolution - Three months later:**
His agent runs in production without major incidents. He can replay any run, understand every decision, and iterate with confidence. He recommends SDK_AI_Agents to his colleagues. He has earned his tech lead's trust and feels at ease.

**What this journey reveals:**
- Quick Start in < 30 minutes
- Clear and intuitive API
- Native replay for debugging
- "Deny by default" security with capabilities
- Simple but effective policies
- Complete observability

---

### Journey 2: Sarah - From fear to organizational governance

**The hero:** Sarah, Tech Lead at a 50-200 person scale-up. Several teams develop AI agents, each with its own framework. She is responsible for security, reliability, and cost control.

**Opening scene - Emergency meeting:**
She discovers that an agent modified critical data with no traceability. She can't explain what happened or prove compliance. She temporarily blocks all agents in production. Teams are frustrated, innovation is stalled.

**Rising action - The following week:**
She evaluates SDK_AI_Agents for 2 weeks. She tests native governance, the complete audit trail, and the reasoning/action separation. She understands that the LLM never directly causes a side effect — all actions pass through a governed Action Engine.

She configures global policies that automatically apply to every agent in the organization. She defines max budgets, capability allowlists, and security constraints. She sees that governance is not an option or a plugin — it is structural, built into the runtime.

**Climax - Compliance audit, 2 months later:**
During a regulatory audit, she exports the complete audit trail for all agents. She demonstrates that every action is traceable, every decision explainable, and that security policies are applied automatically. The auditor validates compliance without complex workarounds.

She shows how she can define a global rule and have it apply to every agent. She shows how every run is a signable, archivable, comparable artifact. The auditor is impressed by the complete traceability.

**Resolution - Six months later:**
SDK_AI_Agents is the standard for every agent in the organization. She can define global rules that apply automatically, and she has full visibility into every agent. AI innovation is allowed, with governance. She finally feels in control.

**What this journey reveals:**
- Native governance with centralized policies
- Complete audit trail for compliance
- Visibility into all agents and their actions
- Cost and budget control
- Standardization without blocking innovation
- Reasoning/action separation for security

---

### Journey 3: Jordan - From uncertainty to confident product iteration

**The hero:** Jordan, Product Engineer at an AI-heavy SaaS company. He needs to improve an existing agent's behavior, but every prompt change is risky and he can't compare versions.

**Opening scene - Sprint planning:**
He modifies the prompt to improve the agent, but a regression appears in production. He can't compare the two versions or understand what changed. He has to roll back and lose the improvement. He feels frustrated and discouraged.

**Rising action - The following week:**
He migrates the agent to SDK_AI_Agents. He configures the capabilities and enables tracing. He modifies the prompt and runs tests with real scenarios. He compares before/after runs with `sdk.compare(runId1, runId2)`.

He sees exactly what changed: which decisions were made differently, which constraints came into play, which alternatives were considered. He understands why some improvements work and why some regressions appear.

**Climax - Feature launch, 1 month later:**
He precisely identifies the improvements and regressions. He adjusts the prompt to keep the improvements while avoiding the regressions. He deploys with confidence, because he measured the impact before going to production.

He can compare two versions of an agent the way he would compare two features. He can test scenarios before going to prod. He can improve the agent without regression. He finally feels in control of the agent's evolution.

**Resolution - Three months later:**
He can now iterate on the agent like a regular product feature. He compares versions, measures improvements, and avoids regressions. The agent evolves predictably and measurably. He feels at ease and productive.

**What this journey reveals:**
- Run comparison to measure improvements
- Structured tests before deployment
- Cognitive observability to understand behavior
- Fast iteration without risk
- Agent as a versionable software artifact

---

### Journey 4: Maya - Security & Compliance - From distrust to confident approval

**The hero:** Maya, Security & Compliance lead at a regulated (finance) company. She needs to validate the security and compliance of AI agents before deployment, but she can't audit AI behaviors with current tools.

**Opening scene - Validation meeting:**
A product team wants to deploy an agent to automate critical actions. Maya can't validate security or prove compliance. She blocks the deployment, frustrating the product team and slowing innovation. She feels stuck between security and innovation.

**Rising action - Evaluation, 2 weeks:**
She discovers SDK_AI_Agents through a recommendation from Sarah (Tech Lead). She evaluates the complete audit trail, the centralized and verifiable policies, and the traceability of every decision. She tests the reasoning/action separation and "deny by default" security.

She understands that every tool must be explicitly authorized, every action must pass through a verified policy, and every execution must be traced. She sees that security is not a feature — it is a structural property.

**Climax - Regulatory audit, 3 months later:**
During a regulatory audit, she exports the complete audit trail for all agents. She demonstrates that every action is traceable, every decision explainable, and that security policies are applied automatically. The auditor validates compliance without complex workarounds.

She shows how she can define global security policies that automatically apply to every agent. She shows how every run is a signable, archivable, comparable artifact. The auditor is impressed by the native governance.

**Resolution - Six months later:**
She can now approve AI agents with confidence. She defines global security policies that automatically apply to every agent. She no longer blocks AI innovation thanks to native governance, and compliance is achieved without additional complexity. She finally feels aligned with innovation.

**What this journey reveals:**
- Complete audit trail for regulatory compliance
- Centralized and verifiable policies
- Traceability of every decision and action
- "Deny by default" security with controlled capabilities
- Certifiable agents for regulated domains

---

### Journey 5: Sam - Product Manager - From hesitation to product confidence

**The hero:** Sam, Product Manager at an AI-heavy SaaS company. He needs to define AI features and measure user impact, but he can't trust agents for critical features because of their unpredictability.

**Opening scene - Incident post-mortem:**
He launches an AI feature that generates user incidents. He can't understand why the agent acts a certain way, nor measure the real impact. He has to disable the feature, frustrating users and the technical team. He feels powerless.

**Rising action - Discovery, 1 week:**
He discovers SDK_AI_Agents via Jordan (Product Engineer). He explores cognitive observability, AI cost control, and incident reduction. He understands that agents can be reliable and predictable with the right infrastructure.

He sees how cognitive observability makes it possible to understand why the agent acts, not just what it does. He sees how AI cost control makes it possible to manage budgets. He understands that agents can be observable and controllable.

**Climax - New feature launch, 2 months later:**
He launches a new AI feature with SDK_AI_Agents. He can observe user behavior via cognitive observability, measure real impact, and control AI costs. When an incident occurs, he can understand and fix it quickly thanks to replay.

He can compare two versions of an agent the way he would compare two features. He can test scenarios before going to prod. He can improve the agent without regression. He finally feels in control of the evolution of his AI features.

**Resolution - Six months later:**
He can now trust agents for critical features. He understands agent impact better thanks to observability, and incidents are reduced. He can iterate on AI features like regular product features. He feels at ease and productive.

**What this journey reveals:**
- Reliable and predictable agents
- Reduction of user incidents
- Observability to understand user behavior
- AI cost control
- Agents as iterable product features

---

### Journey 6: Dr. Chen - Data Scientist - From infrastructure support to business value

**The hero:** Dr. Chen, Data Scientist at a tech company. He supports product teams with his ML/AI expertise, but he spends too much time on agent infrastructure instead of focusing on business value.

**Opening scene - Sprint retrospective:**
He spends hours helping developers integrate AI agents, debugging infrastructure problems, and reinventing in-house solutions. He can't focus on improving models or on business value. He feels frustrated and worn out.

**Rising action - Migration, 1 month:**
He discovers SDK_AI_Agents via a technical recommendation. He appreciates the standardized framework, the native governance, and the ease of integration. He gradually migrates existing agents to SDK_AI_Agents.

He sees that the standardized framework drastically reduces the need for support. He sees that native governance simplifies integration. He understands that developers can now integrate AI agents without his constant help.

**Climax - Focus on value, 2 months later:**
He drastically reduces the time spent on infrastructure. Developers can integrate AI agents without his constant help, and he can focus on improving models and business value. Support is simplified thanks to standardization.

He now spends 80% of his time on business value instead of infrastructure. He can focus on improving models, optimizing performance, and ML innovation. He finally feels aligned with his mission.

**Resolution - Six months later:**
He now spends most of his time on business value. He can focus on improving models, optimizing performance, and ML innovation. The standardized framework reduces the need for constant support. He feels productive and fulfilled.

**What this journey reveals:**
- Standardized framework for AI agents
- Less support needed for integration
- Focus on business value rather than infrastructure
- Standardization simplifies support

---

### Journey 7: Taylor - DevOps/SRE - From reactive operations to intelligent monitoring

**The hero:** Taylor, DevOps/SRE at a tech company. He needs to operate and monitor AI agents in production, but he can't understand incidents or reproduce them with current tools.

**Opening scene - Critical incident, 3 AM:**
An AI agent causes a production incident. Taylor can't understand what happened or reproduce the problem. He spends hours digging through logs with no result, and the incident recurs. He feels powerless and exhausted.

**Rising action - Discovery, 1 week:**
He discovers SDK_AI_Agents through a recommendation from Sarah (Tech Lead). He explores native replay, complete observability, and the traceability of every decision. He configures monitoring and event-based alerts.

He sees how native replay makes it possible to replay any execution in seconds. He sees how complete observability makes it possible to understand every decision. He understands that agents can be observable and reproducible.

**Climax - Incident resolution, 1 month later:**
When an incident occurs, he can replay the full execution in seconds. He immediately understands what happened, why the agent made that decision, and how to fix the problem. He can even simulate "what if" scenarios to prevent future incidents.

He can now operate AI agents with confidence. He understands every incident thanks to replay, and he can prevent problems thanks to complete observability. Incident resolution time is reduced by 80%.

**Resolution - Three months later:**
He can now operate AI agents with confidence. He understands every incident thanks to replay, and he can prevent problems thanks to complete observability. Incident resolution time is reduced by 80%, and overall reliability improves. He finally feels in control.

**What this journey reveals:**
- Native replay for incident resolution
- Complete observability for monitoring
- Traceability of every decision
- Simulation of "what if" scenarios
- Drastic reduction in resolution time

---

### Journey 8: Jamie - Junior Developer - From intimidation to gradual mastery

**The hero:** Jamie, junior developer at a tech startup. He wants to learn how to build AI agents, but he finds existing frameworks too complex and intimidating. He is afraid of making mistakes that could impact production.

**Opening scene - First attempt, weekend:**
He tries to build his first agent with LangChain, but is overwhelmed by the complexity. He doesn't understand how to test his agent or how to secure the tools. He gives up, frustrated and discouraged. He feels incompetent.

**Rising action - Discovery, 1 week:**
He discovers SDK_AI_Agents via a tutorial. He follows the Quick Start and creates his first working agent in under 30 minutes. He is surprised by the simplicity of the API. He quickly grasps the concepts thanks to the simple API and clear documentation.

He defines his first capabilities with `defineTool()`, and immediately understands that every tool must be explicitly authorized. He configures simple policies: max budget, timeout, allowlist. He sees that security is "deny by default" — that's reassuring.

**Climax - First agent in prod, 1 month later:**
He creates an agent that automates a repetitive task. When he tests his agent, he can see exactly what's happening thanks to tracing. When he makes a mistake, he can understand and fix it quickly thanks to replay. He deploys his agent to production with confidence.

He can now build reliable and secure agents. He understands the concepts of governance, observability, and testability. He feels competent and confident.

**Resolution - Three months later:**
He becomes proficient at building AI agents. He understands the concepts of governance, observability, and testability. He can build reliable and secure agents, and he actively contributes to his team's AI innovation. He feels fulfilled and productive.

**What this journey reveals:**
- Accessible Quick Start for beginners
- Simple and intuitive API
- Clear documentation and concrete examples
- Reassuring "deny by default" security
- Progressive learning of concepts

---

### Journey Requirements Summary

These 8 user journeys reveal the capabilities SDK_AI_Agents needs:

**Core Capabilities (MVP):**
- Quick Start in < 30 minutes
- Clear and intuitive TypeScript API
- Native replay for debugging and audit
- Structured and understandable tracing
- Simple but effective policies
- "Deny by default" security with capabilities
- Complete observability of every decision

**Governance Capabilities:**
- Centralized and verifiable policies
- Complete audit trail for compliance
- Visibility into all agents and their actions
- Cost and budget control
- Standardization without blocking innovation

**Product Capabilities:**
- Run comparison to measure improvements
- Structured tests before deployment
- Cognitive observability to understand behavior
- Fast iteration without risk
- Agent as a versionable software artifact

**Operational Capabilities:**
- Event-based monitoring and alerts
- "What if" scenario simulation
- Fast incident resolution thanks to replay
- Simplified support thanks to standardization

**Learning Capabilities:**
- Clear documentation and concrete examples
- Progressive learning of concepts
- Accessibility for developers of all levels

## Innovation & Novel Patterns

### Core Innovation #1: Agent ≠ LLM (Paradigm Shift)

**Nature of the innovation:**
This is not a feature or an architecture, but a new mental model.

**Why it's radical:**
- We're changing what an agent is, not how it's implemented
- We justify the existence of dedicated infrastructure
- We make direct comparisons with LangChain obsolete

**Positioning:**
As long as the market thinks "agent = LLM + tools," SDK_AI_Agents plays on a different level: an agent is a governed decision-making system, of which the LLM is only one component.

**Validation:**
- Strong signal: the user adopts the vocabulary (runs, policies, replay, decisions, traces)
- When they stop talking about a "magic prompt," it's won

**Risk:** Perceived complexity — "this is too complicated"
**Mitigation:** Simple API, ultra-short Quickstart, opt-in advanced layers

---

### Core Innovation #2: Native Event-Sourcing Applied to Agents

**Nature of the innovation:**
A concrete, demonstrable innovation, unique in the market.

**Unique capabilities:**
- Real replay in 1 command
- Real, complete audit
- Behavior comparison
- Native testability

**Why it's decisive:**
- Immediately observable
- Immediately useful
- Extremely hard to copy without a complete redesign

**Validation:**
- Strong signal: a user replays a real incident
- "Without replay, we would never have understood" = irrefutable validation

**Implicit innovation:** Replay as a product primitive
- Not a debug tool or a hack
- A central primitive usable by dev, product, QA
- Enables behavioral non-regression, continuous improvement, future certification

---

### Core Innovation #3: Security Through Impossibility

**Nature of the innovation:**
A structural innovation, invisible but powerful.

**Structural properties:**
- No undeclared tool
- No action without a verified policy
- No execution without a complete trace

**Why it's powerful:**
- Speaks to tech leads and enterprises
- Drastically reduces perceived risk
- Transforms "AI tool" → "acceptable infrastructure"

**Validation:**
- Strong signal: the tech lead authorizes more critical actions
- Fewer "fear feature flags"
- Fewer agent deactivations in prod
- Success is the release of fear

---

### Bonus Innovation: Cognitive Observability

**Nature of the innovation:**
Less immediately understood, but highly differentiating over the medium term.

**Unique capabilities:**
- Not just what the agent did
- But why, under what constraints, with what alternatives

**Why it's differentiating:**
- A second-read innovation: it becomes obvious after use, not at the pitch
- Makes it possible to understand the reasoning, not just the execution

**Validation:**
- Strong signal: the user uses traces to improve the agent
- Not just for debugging
- When traces become a product tool, it's validated

---

### Implicit Innovations

#### Implicit Innovation #1: The Agent as a Software Artifact

**Fundamental transformation:**
With SDK_AI_Agents, an agent becomes:
- Versionable
- Testable
- Comparable
- Auditable
- Deployable

**Impact:**
- Shift from emergent behavior to an industrial software object
- Fundamental for CI/CD, QA, product

#### Implicit Innovation #2: Trust Layer for AI

**Strategic positioning:**
SDK_AI_Agents is, in effect, a trust layer between AI and the real world.

**Why it's strong:**
- Very strong positioning, particularly B2B
- Addresses the need for operational trust
- Justifies the existence of dedicated infrastructure

---

### Market Context & Competitive Landscape

**Competitive positioning:**

**vs LangChain:**
- LangChain: orchestration and tool calling
- SDK_AI_Agents: native governance, native replay, reasoning/action separation
- Differentiation: "LangChain structurally cannot do X, Y, Z"

**vs Semantic Kernel:**
- Semantic Kernel: basic filters, no event-sourcing
- SDK_AI_Agents: native event-sourcing, cognitive observability
- Differentiation: complete event-driven architecture

**vs AutoGPT/LangGraph:**
- AutoGPT/LangGraph: orchestration-focused
- SDK_AI_Agents: native governance, structured testability
- Differentiation: agents as software artifacts

**Durable competitive advantage:**
- A coherent architecture designed together, not features bolted on
- Hard to copy without a complete redesign
- The mental model (agent ≠ chatbot) is hard for competitors to adopt

---

### Validation Approach

**Guiding principle:**
Validation through usage, not through discourse.

**Validation metrics:**

1. **Agent ≠ LLM paradigm:**
   - Adoption of the vocabulary (runs, policies, replay, decisions, traces)
   - Abandonment of the "magic prompt" vocabulary

2. **Event-sourcing / Replay:**
   - Real use of replay to resolve incidents
   - Testimonials: "Without replay, we would never have understood"

3. **Security by design:**
   - Authorization of more critical actions by tech leads
   - Reduction of "fear feature flags"
   - Reduction of agent deactivations in prod

4. **Cognitive observability:**
   - Use of traces to improve the agent (not just debugging)
   - Traces as a product tool

**Validation approach:**
- Talk about concrete problems
- Show before/after comparisons
- Avoid "philosophical" discourse upfront
- Demonstrate, don't argue

---

### Risk Mitigation

#### Risk #1: Perceived Complexity

**Risk:**
The paradigm is richer → risk of "this is too complicated" or "I just need a simple agent"

**Mitigation:**
- Simple API by default
- Ultra-short Quickstart (< 30 minutes)
- Opt-in advanced layers
- Progressive documentation by level

#### Risk #2: Innovation Too Far Ahead

**Risk:**
The market isn't yet fully mature for this level of governance

**Mitigation:**
- Talk about concrete problems (incidents, debugging, security)
- Show measurable before/after comparisons
- Avoid "philosophical" discourse upfront
- Focus on early adopters (tech leads, regulated companies)

#### Risk #3: Unfair Comparison with Existing Frameworks

**Risk:**
"Why not LangChain + X?"

**Mitigation:**
- Key answer: "Because LangChain structurally cannot do X, Y, Z"
- Demonstrate, don't argue
- Focus on concrete differentiators (replay, audit, native governance)
- Concrete use cases where SDK_AI_Agents is indispensable

#### Risk #4: Slow Adoption of the New Paradigm

**Risk:**
Developers are used to the "LLM + tools" model

**Mitigation:**
- Gradual migration from existing frameworks
- Adapters for compatibility
- Immediate quick wins (working replay from the very first run)
- Fast, visible ROI

## Developer Tool Specific Requirements

### Project-Type Overview

SDK_AI_Agents is a TypeScript/Node.js SDK/package for backend developers and tech leads. It is a conceptual infrastructure before being multi-language or multi-IDE. The MVP focuses on TypeScript/Node.js to validate the paradigm before extending to other languages.

**Key strategic decision:**
SDK_AI_Agents is first and foremost a conceptual infrastructure before being multi-language or multi-IDE.

### Language Support Matrix

#### MVP - TypeScript/Node.js (Top Priority)

**Decision:** Exclusive TypeScript/Node.js support for the MVP.

**Justification:**
- Dominant ecosystem for agent tooling
- Exceptional DX (typing, autocomplete, ergonomics)
- Consistent with the target audience (backend/fullstack/platform engineers)
- Speeds up early adopter feedback

**Technical specifications:**
- TypeScript 5.x with strict mode
- Node.js 20+ (LTS)
- ESM and CommonJS support
- Complete type-safety across the entire API

**No other language in the MVP.** This is a strategic decision, not a gap.

#### Post-MVP - Python

**Timing:** After paradigm validation and PMF.

**Justification:**
- Python is heavily ML/research-oriented
- The paradigm targets industrialization, not experimentation
- Risk of premature dilution

**Approach:**
- Python must inherit the design, not influence it
- Gradual migration after the TypeScript API stabilizes
- pip + poetry support if needed

#### Other Languages (Go, Rust, etc.)

**Decision:** Not in the short/medium term.

**Justification:**
- Unnecessary complexity
- Low initial ROI
- Risk of fragmenting the mental API

**Considered only if:** SDK_AI_Agents becomes a mature standard.

### Installation Methods

#### MVP - npm (Standard)

**Primary method:**
```bash
npm install @sdk-ai-agents/core
```

**Compatibility:**
- Automatically compatible with yarn and pnpm (no explicit choice needed)
- Never mention "yarn/pnpm support": it's implicit, not a product argument

**Specifications:**
- Package published on the npm registry
- Strict semantic versioning
- Monorepo workspace support

#### Post-MVP - Python

**Methods:**
- pip (standard)
- poetry (if needed)

**Timing:** Only after PMF and paradigm validation.

### API Surface

#### API Design Principles

**Clear and typed API:**
- Strict TypeScript for complete type-safety
- Native autocomplete via types
- Minimal but powerful API

**MVP API Structure:**

**Core SDK:**
- `createSDK()` - SDK initialization
- `createAgent()` - Agent creation
- `defineTool()` - Defining a capability/tool
- `agent.run()` - Running an agent

**Replay & Observability:**
- `sdk.replay(runId)` - Replay an execution
- `sdk.compare(runId1, runId2)` - Compare two runs
- `sdk.getTrace(runId)` - Retrieve the complete trace

**Policies:**
- `sdk.definePolicy()` - Defining a global policy
- Built-in policies: budgets, timeouts, allowlists

**API characteristics:**
- Few concepts, but solid ones
- Type-safe, documented, predictable
- Stable and minimal API

#### API Documentation

**Via TypeDoc:**
- Complete documentation generated from types
- Examples embedded in the documentation
- Easy navigation between concepts

### Code Examples

#### MVP - 3 Required Examples (No More)

**Example 1 - Minimal Quick Start**

**Objective:**
- Create an agent
- Declare 1 tool
- Run it
- View the events
- Replay it

**Specifications:**
- 1 file, < 100 lines
- Working in < 30 minutes
- Shows the fundamental concepts

**Example 2 - Real Case: Agent with Action**

**Objective:**
- Show controlled tool calling
- Show the policies
- Show the trace

**Suggested use cases:**
- Automated customer support
- Simple automation (API call)
- Agent with real actions

**This is where the "aha moment" happens.**

**Example 3 - Replay & Debug**

**Objective:**
- Replay an incident
- Compare two runs
- Understand a decision

**Specifications:**
- Shows native replay
- Shows run comparison
- Shows cognitive observability

**This example sells the product on its own.**

#### Out of MVP - Migration Examples

**Decision:** Not in the MVP.

**Justification:**
- Too early
- Risk of an unfavorable comparison before the paradigm is understood
- To be added post-MVP once the paradigm is adopted

**Future examples:**
- Migration from LangChain
- Migration from Semantic Kernel
- Migration from other frameworks

### Documentation Structure

#### MVP - Text + Code Documentation (Not Marketing)

**Recommended structure:**

**1. Quick Start (10 minutes, 10 lines)**
- A first working agent, quickly
- Minimal concepts needed
- Simple concrete example

**2. Key Concepts**
- Agent ≠ LLM
- Event log
- Governed tool calling
- Replay
- Policies

**Style:** Oriented toward "mental model," not "magic how-to"
- Every concept must answer: "Why does this exist? What problem does it avoid?"
- Crucial for conveying the paradigm shift

**3. API Reference**
- Via TypeDoc
- Complete documentation generated from types
- Embedded examples

**4. Practical Guides**
- "Adding a tool"
- "Enabling replay"
- "Limiting an agent"
- "Defining policies"

**Style:**
- No videos, no fluff
- Focus on conceptual understanding
- Concrete, demonstrative examples

#### Post-MVP - Advanced Documentation

**To add later:**
- Migration guides from existing frameworks
- Advanced use cases
- Patterns and best practices
- In-depth troubleshooting

### IDE Integration

#### MVP - No Dedicated IDE Integration

**Decision:** No IDE integration in the MVP.

**Justification:**
- Too early
- Low value without real adoption
- Diverts effort from the core (runtime, replay, policies)

**What's sufficient for MVP:**
- Native TypeScript autocomplete (via types)
- Standard TypeScript support in VS Code/WebStorm
- No need for a dedicated extension

#### Post-MVP - VS Code Extension

**Timing:**
- When the concepts are stable
- When the API is frozen
- When users explicitly ask for it

**Relevant features (later):**
- Trace inspection
- Run visualization
- Local replay
- Integrated debugging

### Migration Guide

#### MVP - No Migration Guide

**Decision:** No migration guide in the MVP.

**Justification:**
- Too early to compare with other frameworks
- Risk of an unfavorable comparison before paradigm adoption
- Focus on concept validation, not migration

#### Post-MVP - Migration Guides

**To add after PMF:**
- Migration from LangChain
- Migration from Semantic Kernel
- Migration from in-house solutions
- Gradual migration patterns

### Technical Architecture Considerations

#### MVP Priorities (Strict Order)

1. **TypeScript/Node.js** - Exclusive support
2. **Clear and typed API** - Complete type-safety
3. **Strong conceptual documentation** - Mental model above all
4. **Real, demonstrative examples** - 3 required examples
5. **Replay as a central feature** - The MVP's killer feature

#### Post-MVP Priorities

- Python support
- VS Code extension
- Visualization UI
- Migration examples

### Implementation Considerations

#### Implementation Principles

**Conceptual infrastructure first:**
- Validate the paradigm before extending
- TypeScript/Node.js as a solid foundation
- Stable API before multi-language

**Modern but production-first DX:**
- Simple to use, robust by design
- Type-safety everywhere
- Complete but concise documentation

**MVP Focus:**
- Core runtime (event-sourcing, replay, policies)
- Minimal but powerful API
- Demonstrative examples
- Conceptual documentation

## Project Scoping & Phased Development

### Non-Negotiable Principles

These 5 principles serve as a product guardrail, a scope filter, and a compass for all future decisions.

**Principle #1: Every action is an event**
- Every agent action generates a structured event
- The event log is the single source of truth
- Without an event, there is no traceability, no replay, no differentiation

**Principle #2: No action without a policy**
- Every action must pass through a verified policy
- "Deny by default" security: everything is forbidden except what is explicitly authorized
- No tool without declaration, no action without validation

**Principle #3: The LLM never causes a side effect**
- The LLM generates structured intentions, never direct actions
- Strict separation of reasoning/action: Reasoning Engine ≠ Action Engine
- All actions pass through a governed Action Engine

**Principle #4: Replay must be possible without the LLM**
- Native replay from events only
- No need to contact the LLM again to replay
- Same sequence, same tool calls, relative determinism

**Principle #5: Security is deny-by-default**
- Security through impossibility, not through configuration
- A structural property, not an optional feature
- No execution without a complete trace

**How these principles are used:**
- A guardrail against scope dilution
- A filter for evaluating every new feature
- A compass for architectural decisions
- A product coherence check

### MVP Strategy & Philosophy

**MVP Approach:** Problem-Solving MVP with Platform architecture

**Justification:**
- Solves a critical problem: understanding, replaying, and securing an agent in production
- Lays an irreversible foundation for future expansion
- Balances immediate value with durable architecture

**MVP Objective:**
Demonstrate: "I can understand, replay, and secure my agent's behavior."

**MVP Exit Criteria:**
1. Working replay: 100% of runs replayable
2. Understandable tracing: > 80% of users understand traces
3. Active policies: > 60% of projects with policies
4. Time-to-first-agent: < 30 minutes

### MVP Feature Set (Phase 1)

#### Must-Have MVP (Non-Negotiable)

**1. Event-Driven Runtime (CORE)**
- **Why must-have:** Without it → no replay, no differentiation
- **Specifications:**
  - Execute an agent via a simple loop (max steps)
  - Emit structured events at each step
  - Persist these events (in-memory + file)
  - Minimal event schema, 1 simple projection, no DSL

**2. Working Replay**
- **Why must-have:** Killer feature, immediate proof
- **Specifications:**
  - Replay a run from its events
  - Without contacting the LLM again ("replay" mode)
  - Same sequence, same tool calls
  - Relative determinism

**3. Controlled Tool Calling**
- **Why must-have:** The core of the real risk
- **Specifications:**
  - Explicit tool definition (`defineTool`)
  - Input validation (Zod / schema)
  - Tool registry with allowlist
  - Tool call visible in the events

**4. Simple but Active Policies**
- **Why must-have:** Real governance, not decorative
- **Specifications:**
  - Tool allowlist (deny by default)
  - Max budget (tokens or steps)
  - Timeout / max steps
  - Policies genuinely enforced, not cosmetic

**5. Structured Tracing**
- **Why must-have:** Human understanding, not blind debugging
- **Specifications:**
  - Readable traces (structured JSON)
  - Every run has a `runId`
  - Every decision, tool call, error is traced
  - Export possible (console + file)

**If even one of these elements is missing, the MVP doesn't validate the core promise.**

#### Core User Journeys Supported (MVP)

**Essential journeys for MVP:**
1. **Alex (Developer)** - First agent in production with replay
2. **Sarah (Tech Lead)** - Organizational governance with policies
3. **Jordan (Product Engineer)** - Product iteration with run comparison

### Post-MVP Features

#### Phase 2 - Production-Ready (3-4 months post-MVP)

**Features:**
- Advanced policies (human approval, complex budgets)
- Cognitive observability (reasoning graph)
- Complete capabilities system
- Multi-provider LLM support (Anthropic, others)
- SQL-based Event Store (scalability)
- Performance optimizations

#### Phase 3 - Advanced Features (6-12 months)

**Features:**
- Causal and temporal memory
- Time travel debugging
- Multi-agent orchestration
- Sector-specific compliance (finance, healthcare)
- Distributed Event Store (Kafka-style)
- Complete cognitive observability

#### Phase 4 - Platform (12-24 months)

**Features:**
- Plugin marketplace
- Web UI/Dashboard
- Multi-language support (Python)
- Ecosystem and community
- Cloud provider integrations
- Advanced developer tools (CLI, IDE extensions)

### Risk Mitigation Strategy

#### Risk #1: Adoption of the New Paradigm (THE MOST CRITICAL)

**Risk:**
"Agent ≠ LLM" is a strength… and a risk. Possible misunderstanding, rejection out of habit, unfair comparison with LangChain.

**MVP Mitigation (Essential):**
- Simple API despite the complex core
- A Quickstart that works without explaining the whole philosophy
- Before/after oriented examples, not "theory"
- Conceptual but accessible documentation

**Success criterion:**
👉 **If the user doesn't reach replay within 10 minutes, you lose.**

#### Risk #2: Complexity of the Event-Driven Architecture

**Risk:**
Possible over-design, temptation toward premature abstraction.

**MVP Mitigation:**
- Minimal event schema
- 1 simple projection
- No DSL
- No magic config
- Event-sourcing must be invisible to the user

#### Risk #3: Event-Sourcing Performance

**Risk:**
Event-sourcing performance (secondary risk at MVP).

**MVP Mitigation:**
- In-memory / file event store (simple)
- No premature optimization
- LLM and tool calls dominate the cost
- Replay is offline / async

**Risk ranking (real order):**
1. ❗ **Paradigm adoption** (critical)
2. ⚠️ **Internal complexity** (manageable)
3. 🟡 **Performance** (non-blocking for MVP)

### Resource Requirements

#### MVP Team Size & Skills

**Recommended minimal team:**
- 1-2 backend TypeScript developers (full-time)
- 1 architect (part-time)
- 1 security expert (consultant)

**Required skills:**
- Advanced TypeScript/Node.js
- Event-sourcing and CQRS patterns
- Distributed architecture
- LLM integration and optimization
- Security and governance

**MVP Timeline:**
- 2-3 months for a working MVP
- Focus on paradigm validation

### Success Gates & Decision Points

#### Gate 1: MVP Validation (Month 3)

**Validation criteria:**
- ✅ Working replay: 100% of runs replayable
- ✅ Understandable tracing: > 80% of users understand traces
- ✅ Active policies: > 60% of projects with policies
- ✅ Time-to-first-agent: < 30 minutes
- ✅ ≥ 3 teams using the SDK in production
- ✅ ≥ 1 real incident replayed and understood

**Decision:**
- If criteria are met → Proceed with Phase 2
- If criteria are not met → Iterate on the MVP, don't add features

#### Gate 2: Production-Ready (Month 7)

**Validation criteria:**
- ✅ > 10 projects in production
- ✅ > 70% adoption of governance features
- ✅ -60% incident reduction
- ✅ Positive user feedback

**Decision:**
- If criteria are met → Proceed with Phase 3
- If criteria are not met → Iterate on Phase 2

#### Gate 3: Real Traction (Month 12)

**Validation criteria:**
- ✅ > 100 active projects
- ✅ > 80% team retention
- ✅ Adoption by regulated companies
- ✅ Active community

**Decision:**
- If criteria are met → Proceed with Phase 4 (Platform)
- If criteria are not met → Focus on adoption and improvement

## Functional Requirements

### MVP vs Post-MVP Segmentation

**Guiding principle:**
The MVP must be judged on ≈ 5 fundamental promises, not on 78 FRs. These 5 promises are:
1. I can create an agent simply
2. I can control what it is allowed to do
3. I can see exactly what it did
4. I can replay what happened
5. I can explain an incident

**Everything else is an accelerator, not a foundation.**

### Agent Lifecycle Management

**FR1:** A developer can create an agent with a minimal configuration
**FR2:** A developer can initialize an SDK with basic parameters
**FR3:** A developer can start an agent's execution with an initial input
**FR4:** A developer can stop a running execution
**FR5:** A developer can stop an execution using its runId
**FR6:** A developer can configure an agent with specific capabilities
**FR7:** A developer can define execution constraints (max steps, timeout)

### Tool & Capability Management

**FR8:** A developer can define a tool with a validation schema
**FR9:** A developer can explicitly declare the tools available to an agent
**FR10:** A developer can validate a tool's inputs before execution
**FR11:** A developer can restrict authorized tools via an allowlist
**FR12:** A developer can organize tools into logical capabilities
**FR13:** A developer can reuse tools across multiple agents
**FR14:** A developer can version tools independently
**FR15:** The system prevents the execution of an undeclared tool (deny by default)

### Policies & Governance

**FR16:** A developer can define a global policy that applies to all agents
**FR17:** A developer can define a policy specific to one agent
**FR18:** A developer can define a maximum budget (tokens or steps) for an agent
**FR19:** A developer can define a timeout for an execution
**FR20:** A developer can define an allowlist of authorized tools
**FR21:** The system automatically applies policies before each action
**FR22:** The system blocks an action if it violates a policy
**FR23:** A developer can review the policies applied to an execution
**FR24:** The system traces every policy check in the events

### Runtime - Reasoning/Action Separation

**FR25:** The system separates reasoning (LLM) from action (tool execution)
**FR26:** The LLM generates structured intentions, never direct actions
**FR27:** All actions pass through a governed Action Engine
**FR28:** The system validates every intention before execution
**FR29:** The system can reject an intention if it violates a policy
**FR30:** The system traces every intention generated by the LLM
**FR31:** The system traces every action executed by the Action Engine
**FR32:** A developer can understand why an action was accepted or rejected
**FR33:** The system guarantees that no side effect comes directly from the LLM
**FR34:** A developer can inspect the reasoning → validation → action sequence

### Tracing & Observability

**FR35:** The system generates a structured event for every execution step
**FR36:** Every execution has a unique, traceable runId
**FR37:** A developer can retrieve the complete trace of an execution via its runId
**FR38:** A developer can export traces in a structured format (JSON)
**FR39:** A developer can view traces via console or file
**FR40:** The system traces every decision made by the agent
**FR41:** A developer can understand why the agent made a specific decision *(MVP)*
**FR42:** A developer can see the constraints that affected a decision *(MVP)*
**FR43:** A developer can see the alternatives considered by the agent *(Post-MVP)*
**FR44:** A developer can visualize the agent's reasoning graph *(Post-MVP)*
**FR45:** A developer can analyze decision patterns across multiple runs *(Post-MVP)*

### Replay & Comparison

**FR46:** A developer can replay a complete execution from its runId
**FR47:** Replay works without contacting the LLM again (replay mode)
**FR48:** Replay reproduces the same sequence of actions and tool calls
**FR49:** A developer can compare two executions to identify differences *(Post-MVP)*
**FR50:** A developer can replay an execution with context modifications
**FR51:** A developer can test "what if" scenarios by replaying with different parameters
**FR52:** The system guarantees relative reproducibility of replays
**FR53:** A developer can use replay to debug an incident
**FR54:** A developer can analyze the impact of a change before/after deployment *(Post-MVP)*

### Event Sourcing & Persistence

**FR55:** The system persists all events of an execution
**FR56:** The event log is the single source of truth for an execution
**FR57:** A developer can rebuild the complete state of an execution from its events
**FR58:** The system persists events at minimum in memory and file
**FR59:** A developer can export the complete event log of an execution
**FR60:** The system guarantees that no event is lost during an execution
**FR61:** A developer can query events by runId
**FR62:** The system can filter events by type or criteria

### Testing & Quality Assurance

**FR63:** A developer can filter events by advanced criteria *(Post-MVP)*
**FR64:** A developer can create trace-based tests (golden traces)
**FR65:** A developer can validate that an agent behaves as expected via replay
**FR66:** A developer can detect regressions by comparing traces
**FR67:** A developer can run non-regression tests on agents
**FR68:** The system supports test integration in a CI/CD pipeline
**FR69:** A developer can define assertions on an agent's behavior

### Developer Experience & Quick Start

**FR70:** A developer can create their first working agent in under 30 minutes
**FR71:** A developer can use the SDK with a minimal API (< 10 lines for the Quick Start)
**FR72:** The API is fully typed with TypeScript (complete type-safety)
**FR73:** A developer can understand the key concepts via the documentation
**FR74:** The SDK provides at least one complete working example
**FR75:** A developer can install the SDK via npm with a single command

### Run Lifecycle Management

**FR76:** The system can expose an execution's current state (pending, running, completed, failed, cancelled)
**FR77:** A developer can query a run's state using its runId

### Versioning & Audit

**FR78:** A developer can associate a version (or configuration hash) with an agent or an execution

### MVP Scope Summary

#### 🟢 MVP - Absolute Must-Haves (≈ 40 FRs)

These FRs must work perfectly, with no compromise:

**Basic agent lifecycle:** FR1-FR7
**Tool & capability management:** FR8-FR15
**Simple but active policies:** FR16-FR24
**Reasoning/action separation runtime:** FR25-FR34
**Readable structured tracing:** FR35-FR40, FR41-FR42
**Working replay without LLM:** FR46-FR48, FR50-FR53
**Event sourcing as source of truth:** FR55-FR62
**Minimal DX + Quick Start:** FR70-FR75
**Run lifecycle management:** FR76-FR77
**Basic versioning:** FR78

👉 **If these FRs are solid → the MVP is validated.**

#### 🟡 Post-MVP (Phase 1.5 / V1)

These FRs are extremely powerful, but can come later:

**Advanced cognitive observability:** FR43-FR45
**Detailed comparison:** FR49, FR54
**Advanced event filtering:** FR63
**Advanced testing, golden traces at scale:** FR64-FR69

👉 **They turn the SDK into a mature platform, but are not required to prove value.**

### Validation Checklist

**Validation checklist (honest and accurate):**

✔️ All MVP capabilities are covered
✔️ Critical user journeys are properly addressed
✔️ Key innovations are not "marketing," but functional
✔️ Non-negotiable principles are respected structurally
✔️ The list is implementation-agnostic (excellent point)

👉 **This document is already an architectural foundation, not just a feature list.**
