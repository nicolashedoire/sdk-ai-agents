# Technical Preferences

## Front-End Stack

Pour toutes les stories impliquant du développement front-end, utiliser :

### Stack Technique

- **Storybook**: Version 10
  - Pour le développement et la documentation de composants UI
  - Configuration et setup selon les meilleures pratiques Storybook 10

- **Tailwind CSS**: Dernière version stable
  - Pour le styling et le design system
  - Configuration avec les conventions Tailwind standard

- **shadcn/ui**: Dernière version
  - Composants UI réutilisables basés sur Radix UI
  - Installation et configuration selon la documentation officielle
  - Utilisation des composants shadcn/ui pour l'interface

### Stories Concernées

Les stories suivantes nécessiteront probablement du front-end :

**Epic 13 - Observabilité Cognitive:**
- Story 13.1: Graphe de Raisonnement Visualisable
- Story 13.2: Alternatives Envisagées par l'Agent
- Story 13.3: Patterns de Décision sur Plusieurs Runs
- Story 13.4: Visualisation des Traces

**Phase 4 (Future):**
- UI/Dashboard web (mentionné dans le PRD)

### Notes d'Implémentation

- Tous les composants UI doivent être développés dans Storybook d'abord
- Utiliser les composants shadcn/ui comme base
- Tailwind CSS pour le styling personnalisé
- Assurer la responsivité et l'accessibilité
- Documentation des composants dans Storybook

### Références

- Storybook 10: https://storybook.js.org/
- Tailwind CSS: https://tailwindcss.com/
- shadcn/ui: https://ui.shadcn.com/

