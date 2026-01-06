# Comment Utiliser ce Template

Ce template fournit une structure de base pour démarrer rapidement un projet utilisant SDK_AI_Agents.

## Installation

### Option 1 : Copier le template manuellement

1. Copiez le dossier `starter-template` vers votre nouveau projet :
   ```bash
   cp -r templates/starter-template mon-nouveau-projet
   cd mon-nouveau-projet
   ```

2. Installez les dépendances :
   ```bash
   npm install
   ```

3. Créez le fichier `.env` :
   ```bash
   cp ENV_TEMPLATE.txt .env
   ```
   Puis éditez `.env` et ajoutez votre clé API OpenAI.

### Option 2 : Utiliser avec npm create (quand le SDK sera publié)

```bash
npm create @sdk-ai-agents/starter mon-nouveau-projet
cd mon-nouveau-projet
npm install
```

## Configuration Initiale

1. **Variables d'environnement** :
   - Copiez `ENV_TEMPLATE.txt` vers `.env`
   - Ajoutez votre clé API OpenAI : `OPENAI_API_KEY=sk-...`

2. **Personnalisation** :
   - Modifiez `package.json` pour changer le nom du projet
   - Personnalisez `src/index.ts` selon vos besoins

## Structure du Template

```
starter-template/
├── src/
│   ├── index.ts          # Code principal de votre agent
│   └── __tests__/        # Tests unitaires
├── package.json          # Dépendances et scripts
├── tsconfig.json         # Configuration TypeScript
├── biome.json            # Configuration linter/formatter
├── vitest.config.ts      # Configuration tests
├── README.md             # Documentation du projet
├── ENV_TEMPLATE.txt      # Template pour .env
└── .gitignore            # Fichiers à ignorer
```

## Scripts Disponibles

- `npm start` - Exécute le projet
- `npm run build` - Compile TypeScript
- `npm run dev` - Mode développement avec watch
- `npm test` - Lance les tests
- `npm run lint` - Vérifie le code
- `npm run format` - Formate le code

## Prochaines Étapes

1. **Définir vos tools** : Créez des tools personnalisés dans `src/index.ts`
2. **Créer des capabilities** : Organisez vos tools en capabilities
3. **Configurer des policies** : Ajoutez des règles de gouvernance
4. **Ajouter des tests** : Écrivez des tests dans `src/__tests__/`
5. **Personnaliser l'agent** : Ajustez la configuration selon vos besoins

## Documentation

Consultez la documentation complète du SDK :
- [Quick Start Guide](../../docs/QUICKSTART.md)
- [Concepts Clés](../../docs/CONCEPTS.md)

## Notes

- Le package `@sdk-ai-agents/core` doit être installé depuis npm (ou lié localement pendant le développement)
- Assurez-vous d'avoir Node.js >= 20.0.0
- Les erreurs TypeScript concernant `@sdk-ai-agents/core` sont normales tant que le package n'est pas installé

