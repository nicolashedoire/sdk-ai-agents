---
layout: home

hero:
  name: SDK AI Agents
  text: Agentes governados que pensam antes de agir
  tagline: Raciocínio explícito com um estado mental que você pode inspecionar, decisões tipadas com Jev, conectores MCP — sobre uma base de event sourcing, replay, custos, novas tentativas e alertas de incidentes.
  image:
    src: /images/reasoning-loop.svg
    alt: O ciclo cognitivo em torno de um estado mental explícito
  actions:
    - theme: brand
      text: Começar
      link: /pt/guide/getting-started
    - theme: alt
      text: Como os agentes pensam
      link: /pt/guide/cognitive-agents
    - theme: alt
      text: Ver no GitHub
      link: https://github.com/nicolashedoire/sdk-ai-agents

features:
  - icon: 🧠
    title: Raciocínio, não apenas prompts
    details: Representar, comparar observações, formular hipóteses, simular, testar, revisar, criticar, buscar informação, comparar, decidir. Cada etapa é uma operação sobre um estado mental explícito, escolhida por um controlador e registrada como um evento.
    link: /pt/guide/cognitive-agents
    linkText: O ciclo cognitivo
  - icon: 🔬
    title: Acredita no que consegue justificar
    details: As observações guardam sua proveniência, as regras vêm com predições refutáveis, o seu próprio avaliador as testa, as regras refutadas são revisadas — e uma resposta só é firmada quando passa por uma salvaguarda escrita em código.
    link: /pt/guide/evidence-and-verification
    linkText: Evidências e verificação
  - icon: 🪞
    title: Raciocina como uma pessoa específica
    details: Sim, ele consegue imitar o modo como alguém raciocina. Explique alguns temas com suas próprias palavras e ele destila sua ordem de atenção, suas prioridades e seus reflexos em um perfil escrito nas instruções de cada etapa do raciocínio. Cada correção é acrescentada ao perfil, e a sua concordância mostra o quanto ele chega perto.
    link: /pt/guide/thinker-profiles
    linkText: Raciocinar como uma pessoa específica
  - icon: 🎯
    title: Decisões tipadas com Jev
    details: Injete qualquer contexto, faça perguntas de sim/não, de escolha única ou múltipla e de avaliação em escala, e receba probabilidades calibradas com as quais o seu código pode agir.
    link: /pt/guide/typed-decisions
    linkText: Decidir com confiança
  - icon: 🔌
    title: Um servidor MCP para qualquer coisa
    details: Transforme uma API web, uma pasta de documentos, um banco de dados somente leitura ou um agente em um servidor MCP com uma linha, governado e rastreado, e dê aos seus agentes as ferramentas de qualquer servidor MCP.
    link: /pt/guide/mcp
    linkText: Conecte seus sistemas
  - icon: 🛡️
    title: Governança desde a concepção
    details: O modelo propõe, o motor decide. Políticas, allowlists, orçamentos e aprovações humanas são verificados antes de cada ação.
    link: /pt/guide/governed-agents
    linkText: Agentes governados
  - icon: 🎞️
    title: Tudo é um evento
    details: Faça o replay de execuções sem chamar o LLM, reconstrua o estado mental de qualquer execução, compare execuções e transforme-as em testes de referência (golden tests).
    link: /pt/guide/observability
    linkText: Rastreabilidade e replay
  - icon: 💸
    title: Custos que você pode ver
    details: O consumo de tokens de cada chamada ao LLM e de cada decisão tipada é registrado e precificado por execução e por modelo.
    link: /pt/guide/costs
    linkText: Custos de API
  - icon: 🔁
    title: Novas tentativas que não se acumulam
    details: Uma política de novas tentativas por provedor antes do failover, novas tentativas para ferramentas idempotentes, e cada nova tentativa escrita no trace.
    link: /pt/guide/resilience
    linkText: Novas tentativas e fallback
  - icon: 🚨
    title: Incidentes que chegam até você
    details: Execuções com falha, ações bloqueadas e failovers de provedor viram incidentes com sua linha do tempo, enviados por e-mail ou webhook.
    link: /pt/guide/incidents
    linkText: Alertas de incidentes
---

<div class="vp-doc" style="max-width: 1152px; margin: 0 auto; padding: 48px 24px 0;">

## De um prompt a uma decisão que você pode auditar {#from-a-prompt-to-a-decision-you-can-audit}

Uma chamada clássica a um LLM vai direto da pergunta à resposta. Um agente cognitivo constrói uma imagem explícita do problema, explora várias opções, as coloca à prova, verifica fatos com ferramentas governadas e só então se compromete — e você pode ler cada etapa depois.

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

![Um estado mental reconstruído a partir do log de eventos](/images/mental-state.svg){.illustration}

## Um SDK, todas as camadas {#one-sdk-every-layer}

![Arquitetura do SDK](/images/architecture.svg){.illustration}

| Você precisa | Uma API de LLM pura | SDK AI Agents |
| --- | --- | --- |
| Raciocinar antes de responder | Geração em uma única passada | Hipóteses, simulação e crítica sobre um estado explícito |
| Raciocinar como uma pessoa específica | Um longo prompt de sistema | Um perfil de pensador versionado, refinado por feedback |
| Decisões rápidas e calibradas | Interpretar texto livre | Respostas tipadas com probabilidades e confiança (Jev) |
| Conectar as ferramentas da empresa | Código de integração sob medida para cada ferramenta | Servidor e cliente MCP, governados por políticas |
| Saber o que aconteceu | Logs, se houver | Log de eventos, replay, reconstrução do estado mental |
| Controlar riscos e gastos | Torcer para dar certo | Políticas, aprovações, orçamentos, custos por execução, alertas de incidentes |

</div>
