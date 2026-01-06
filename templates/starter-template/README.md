# My AI Agent Project

Projet de démarrage utilisant SDK_AI_Agents pour créer des agents IA gouvernables et traçables.

## 🚀 Quick Start

### 1. Installation

```bash
npm install
```

### 2. Configuration

Copiez le fichier `.env.example` vers `.env` et ajoutez votre clé API OpenAI :

```bash
cp .env.example .env
```

Éditez `.env` et ajoutez votre clé :

```
OPENAI_API_KEY=sk-your-key-here
```

### 3. Exécution

```bash
npm start
```

Ou en mode développement avec watch :

```bash
npm run dev
```

## 📚 Documentation

- [Quick Start Guide](https://github.com/nicolashedoire/SDK_AI_Agents/blob/main/docs/QUICKSTART.md)
- [Concepts Clés](https://github.com/nicolashedoire/SDK_AI_Agents/blob/main/docs/CONCEPTS.md)
- [Documentation Complète](https://github.com/nicolashedoire/SDK_AI_Agents)

## 🛠️ Scripts Disponibles

- `npm start` - Exécute le projet
- `npm run build` - Compile TypeScript
- `npm run dev` - Mode développement avec watch
- `npm test` - Lance les tests
- `npm run test:watch` - Tests en mode watch
- `npm run lint` - Vérifie le code avec Biome
- `npm run lint:fix` - Corrige automatiquement les erreurs
- `npm run format` - Formate le code
- `npm run check` - Vérifie le code et le format
- `npm run clean` - Nettoie le dossier dist

## 📁 Structure du Projet

```
.
├── src/
│   ├── index.ts          # Point d'entrée principal
│   └── __tests__/        # Tests unitaires
├── dist/                 # Code compilé (généré)
├── .env                  # Variables d'environnement (à créer)
├── .env.example          # Exemple de configuration
├── package.json          # Dépendances et scripts
├── tsconfig.json         # Configuration TypeScript
├── biome.json            # Configuration Biome (linter/formatter)
└── vitest.config.ts      # Configuration Vitest (tests)
```

## 🎯 Prochaines Étapes

1. **Définir vos tools** : Créez des tools personnalisés dans `src/index.ts`
2. **Créer des capabilities** : Organisez vos tools en capabilities
3. **Configurer des policies** : Ajoutez des règles de gouvernance
4. **Ajouter des tests** : Écrivez des tests dans `src/__tests__/`
5. **Personnaliser l'agent** : Ajustez la configuration selon vos besoins

## 📖 Exemples

Consultez les exemples dans le dépôt SDK_AI_Agents :
- [Quick Start Example](https://github.com/nicolashedoire/SDK_AI_Agents/blob/main/examples/quick-start.ts)
- [Complete Example](https://github.com/nicolashedoire/SDK_AI_Agents/blob/main/examples/complete-example.ts)

## 🤝 Contribution

Ce projet utilise SDK_AI_Agents. Pour contribuer au SDK, consultez le [guide de contribution](https://github.com/nicolashedoire/SDK_AI_Agents/blob/main/CONTRIBUTING.md).

## 📄 License

MIT


