# Templates SDK_AI_Agents

Ce dossier contient des templates de projet pour démarrer rapidement avec SDK_AI_Agents.

## Templates Disponibles

### starter-template

Template de base pour créer un nouveau projet utilisant SDK_AI_Agents.

**Inclut :**
- Structure de projet TypeScript complète
- Configuration Biome (linter/formatter)
- Configuration Vitest (tests)
- Exemple d'agent fonctionnel
- Tests unitaires de base
- Documentation complète

**Utilisation :**

```bash
cp -r starter-template mon-nouveau-projet
cd mon-nouveau-projet
npm install
cp ENV_TEMPLATE.txt .env
# Éditez .env et ajoutez votre clé API
npm start
```

Consultez [starter-template/USAGE.md](./starter-template/USAGE.md) pour plus de détails.

## Créer un Nouveau Template

Pour créer un nouveau template :

1. Créez un nouveau dossier dans `templates/`
2. Ajoutez la structure de base
3. Créez un fichier `USAGE.md` avec les instructions
4. Documentez le template dans ce README

## Contribution

Les templates sont maintenus avec le SDK principal. Pour proposer un nouveau template ou améliorer un existant, ouvrez une issue ou une pull request.

