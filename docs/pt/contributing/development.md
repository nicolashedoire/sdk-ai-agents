# Guia de desenvolvimento

## Pré-requisitos {#prerequisites}

### Obrigatórios {#required}

- **Node.js**: 20.0.0+ (LTS)
- **npm**: incluído com o Node.js
- **TypeScript**: 5.3.2+ (instalado localmente via npm)

### Opcionais {#optional}

- **PostgreSQL**: 8.11.0+ (para o PostgreSQLEventStore, peer dependency)
- **Git**: para o controle de versão

## Configuração do ambiente {#environment-setup}

### 1. Clonar o repositório {#_1-clone-repository}

```bash
git clone https://github.com/nicolashedoire/sdk-ai-agents.git
cd sdk-ai-agents
```

### 2. Instalar as dependências {#_2-install-dependencies}

```bash
npm install
```

### 3. Configurar as variáveis de ambiente {#_3-configure-environment-variables}

Crie um arquivo `.env` na raiz (opcional, para os exemplos):

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Desenvolvimento local {#local-development}

### Build {#build}

Compile o TypeScript:

```bash
npm run build
```

O código compilado ficará em `dist/`.

### Modo watch {#watch-mode}

Compile em modo watch (recompilação automática):

```bash
npm run dev
```

### Executar os exemplos {#run-examples}

```bash
# Quick start example
npm run example:quick-start

# Complete example
npm run example:complete

# Test API
npm run test:api
```

## Testes {#testing}

### Executar todos os testes {#run-all-tests}

```bash
npm test
```

### Modo watch {#watch-mode-1}

```bash
npm run test:watch
```

### Cobertura {#coverage}

```bash
npm run test:coverage
```

### Executar um arquivo de teste específico {#run-specific-test-file}

```bash
npx vitest src/__tests__/agent.test.ts
```

## Qualidade do código {#code-quality}

### Lint {#linting}

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### Formatação {#formatting}

```bash
# Format code
npm run format
```

### Verificação completa (lint + formatação) {#full-check-lint-format}

```bash
# Check everything
npm run check

# Fix everything automatically
npm run check:fix
```

## Tarefas comuns de desenvolvimento {#common-development-tasks}

### Adicionar uma nova ferramenta {#adding-a-new-tool}

1. Defina a ferramenta com `sdk.defineTool()`:

```typescript
const myTool = sdk.defineTool({
  name: 'my-tool',
  description: 'Description of my tool',
  schema: z.object({
    // Zod schema
  }),
  handler: async (params) => {
    // Tool implementation
  }
});
```

2. Adicione a ferramenta a um agente:

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-5.4',
  tools: [myTool]
});
```

### Adicionar uma nova política {#adding-a-new-policy}

1. Defina a política:

```typescript
const myPolicy: Policy = {
  id: 'my-policy',
  type: 'custom',
  rules: [{
    condition: 'toolName === "dangerous-tool"',
    action: 'require_approval'
  }],
  scope: 'global',
  enabled: true
};
```

2. Aplique a política:

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### Adicionar um novo armazenamento de eventos {#adding-a-new-event-store}

1. Implemente `IEventStore`:

```typescript
export class MyEventStore implements IEventStore {
  async append(runId: string, event: Event): Promise<void> {
    // Implementation
  }
  
  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    // Implementation
  }
  
  // ... other methods
}
```

2. Use-o no SDK:

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### Adicionar um novo provedor de LLM {#adding-a-new-llm-provider}

1. Implemente `LLMProvider`:

```typescript
export class MyProvider implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    // Implementation
  }
  
  supportsModel(model: string): boolean {
    // Implementation
  }
  
  getProviderName(): string {
    return 'my-provider';
  }
}
```

2. Adicione-o à `ProviderFactory`:

```typescript
// In provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## Processo de build {#build-process}

### Compilação TypeScript {#typescript-compilation}

O build usa diretamente o compilador TypeScript:

```bash
tsc
```

Configuração em `tsconfig.json`:
- **Target**: ES2022
- **Module**: ESNext
- **Module Resolution**: node
- **Strict Mode**: ativado
- **Source Maps**: ativados
- **Declaration Files**: ativados

### Estrutura de saída {#output-structure}

```
dist/
├── index.js              # Entry point
├── index.d.ts            # Type declarations
├── agent.js
├── agent.d.ts
├── sdk.js
├── sdk.d.ts
└── ...                   # Other compiled files
```

## Estratégia de testes {#testing-strategy}

### Testes unitários {#unit-tests}

- Testes unitários para cada módulo
- Usa o Vitest
- Nenhum teste chama um serviço pago real, e nenhum usa mocks de módulos nem espiões: as portas do SDK são implementadas pelos dublês de teste de `src/__tests__/support/`, e os adaptadores HTTP, incluindo os provedores OpenAI e Anthropic, rodam contra servidores locais. `no-mocks.test.ts` recusa `vi.mock`, `vi.fn` e `vi.spyOn`

### Testes de integração {#integration-tests}

- Testes de integração para fluxos completos
- O modelo é um provedor roteirizado, ou o cliente real da OpenAI ou da Anthropic falando com um servidor local que responde no formato do fornecedor; nenhum teste chama uma API real
- Testes com diferentes armazenamentos de eventos

### Exemplo de estrutura de teste {#example-test-structure}

```typescript
import { describe, it, expect } from 'vitest';
import { MyClass } from '../my-class';

describe('MyClass', () => {
  it('should do something', () => {
    const instance = new MyClass();
    expect(instance.method()).toBe(expected);
  });
});
```

## Depuração {#debugging}

### Source maps {#source-maps}

Os source maps são gerados automaticamente durante o build. Eles permitem depurar diretamente o código TypeScript.

### Depuração no VS Code {#vs-code-debugging}

Configuração de `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## Estilo de código {#code-style}

### Boas práticas de TypeScript {#typescript-best-practices}

- **Strict Mode**: sempre ativado
- **Segurança de tipos**: use tipos explícitos
- **Sem `any`**: evite `any`, use `unknown` se necessário
- **Interfaces vs. types**: prefira interfaces para objetos, types para uniões/interseções

### Convenções de nomenclatura {#naming-conventions}

- **Arquivos**: kebab-case (`my-file.ts`)
- **Classes**: PascalCase (`MyClass`)
- **Funções**: camelCase (`myFunction`)
- **Constantes**: UPPER_SNAKE_CASE (`MY_CONSTANT`)
- **Types/interfaces**: PascalCase (`MyType`)

### Organização do código {#code-organization}

- **Uma classe/interface por arquivo**
- **Tipos colocalizados**: tipos no mesmo arquivo ou em `types/`
- **Barrel exports**: `index.ts` para as exportações públicas

## Problemas comuns {#common-issues}

### Erros de TypeScript {#typescript-errors}

Se você receber erros de TypeScript:

1. Verifique se o `tsconfig.json` está correto
2. Verifique se todas as dependências estão instaladas
3. Limpe e recompile: `npm run clean && npm run build`

### Falhas nos testes {#test-failures}

Se os testes falharem:

1. Verifique se os dublês de teste de `src/__tests__/support/` ainda correspondem às interfaces que substituem
2. Verifique se as dependências estão atualizadas
3. Execute os testes em modo watch para ver os erros em tempo real

### Erros de build {#build-errors}

Se o build falhar:

1. Verifique os erros de TypeScript: `npm run build`
2. Verifique os erros de lint: `npm run lint`
3. Limpe a pasta `dist/`: `npm run clean`

## Processo de release {#release-process}

As versões são publicadas no npm pelo workflow `Release` quando uma tag de versão é enviada: os passos estão na página [Publicar uma versão](./releasing).

### Versionamento {#versioning}

O projeto usa versionamento semântico (SemVer):
- **MAJOR**: mudanças incompatíveis (breaking changes)
- **MINOR**: novos recursos compatíveis com versões anteriores
- **PATCH**: correções de bugs compatíveis com versões anteriores

Enquanto a versão começar com `0.`, uma mudança incompatível aumenta MINOR em vez disso (`0.2.0` → `0.3.0`) e todo o resto PATCH: veja [Publicar uma versão](./releasing#release-a-version).

### Lista de verificação antes do release {#pre-release-checklist}

- [ ] Todos os testes passam
- [ ] Código verificado pelo lint e formatado
- [ ] Documentação atualizada
- [ ] CHANGELOG.md atualizado
- [ ] Versão no `package.json` atualizada
- [ ] Versão exibida na documentação atualizada (`const version` em `docs/.vitepress/config.mts`)

### Build para release {#build-for-release}

```bash
# The checks of the CI but coverage and the docs build, on a fresh dist/
# (what prepublishOnly runs before npm publish)
npm run clean && npm run verify

# The files that would be published
npm pack --dry-run
```

## Recursos {#resources}

- **Documentação**: `docs/`
- **Exemplos**: `examples/`
- **Definições de tipos**: `src/types/`
- **Testes**: `src/__tests__/`

## Site da documentação {#documentation-site}

A documentação é um site VitePress em `docs/`, ilustrado com SVGs em `docs/public/images/`.

```bash
npm run docs:dev      # local preview with hot reload
npm run docs:build    # static build in docs/.vitepress/dist
npm run docs:preview  # serve the build
```

O workflow `Docs` do GitHub Actions o publica no GitHub Pages a cada push na `main`.
