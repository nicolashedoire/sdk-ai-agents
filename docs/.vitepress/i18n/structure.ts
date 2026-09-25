/**
 * What every language shares: the pages of the documentation and how the sidebar groups
 * them. Each language only provides its texts (see `types.ts`); links are built from here.
 */

export const LANGUAGES = [
  { code: 'fr', lang: 'fr-FR', label: 'Français' },
  { code: 'es', lang: 'es-ES', label: 'Español' },
  { code: 'de', lang: 'de-DE', label: 'Deutsch' },
  { code: 'zh', lang: 'zh-CN', label: '简体中文' },
  { code: 'pt', lang: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ja', lang: 'ja-JP', label: '日本語' },
  { code: 'ko', lang: 'ko-KR', label: '한국어' },
  { code: 'ru', lang: 'ru-RU', label: 'Русский' },
  { code: 'ar', lang: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'hi', lang: 'hi-IN', label: 'हिन्दी' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const SIDEBAR = [
  {
    group: 'start',
    pages: ['guide/introduction', 'guide/why', 'guide/getting-started', 'guide/concepts', 'guide/glossary'],
  },
  {
    group: 'think',
    pages: [
      'guide/cognitive-agents',
      'guide/evidence-and-verification',
      'guide/memory',
      'guide/thinker-profiles',
      'guide/governed-agents',
      'guide/studies',
    ],
  },
  {
    group: 'connect',
    pages: ['guide/typed-decisions', 'guide/mcp', 'guide/mcp-first-server', 'guide/mcp-recipes', 'guide/mcp-deploy'],
  },
  {
    group: 'operate',
    pages: ['guide/observability', 'guide/costs', 'guide/resilience', 'guide/incidents'],
  },
  {
    group: 'reference',
    pages: ['reference/sdk-api', 'reference/events', 'reference/architecture', 'reference/project-overview'],
  },
  {
    group: 'contributing',
    collapsed: true,
    pages: [
      'contributing/development',
      'contributing/source-tree',
      'contributing/translations',
      'contributing/releasing',
    ],
  },
] as const;

export type SidebarGroup = (typeof SIDEBAR)[number]['group'];
export type PageSlug = (typeof SIDEBAR)[number]['pages'][number];
