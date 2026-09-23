import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

const repository = 'https://github.com/nicolashedoire/sdk-ai-agents';

export default withMermaid(
  defineConfig({
    title: 'SDK AI Agents',
    description:
      'Governed AI agents that think before they act: explicit reasoning, typed decisions with Jev, MCP connectors, event sourcing, costs, retries and incident alerts.',
    base: '/sdk-ai-agents/',
    cleanUrls: true,
    lastUpdated: true,
    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/sdk-ai-agents/logo.svg' }],
      ['meta', { name: 'theme-color', content: '#4F46E5' }],
      ['meta', { property: 'og:title', content: 'SDK AI Agents' }],
      ['meta', { property: 'og:description', content: 'Governed AI agents that think before they act.' }],
    ],
    themeConfig: {
      logo: '/logo.svg',
      nav: [
        { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
        { text: 'Reference', link: '/reference/sdk-api', activeMatch: '/reference/' },
        {
          text: 'v0.2.0',
          items: [
            { text: 'Changelog', link: `${repository}/blob/main/CHANGELOG.md` },
            { text: 'Contributing', link: '/contributing/development' },
          ],
        },
      ],
      sidebar: [
        {
          text: 'Start here',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Core concepts', link: '/guide/concepts' },
          ],
        },
        {
          text: 'Agents that think',
          items: [
            { text: 'Cognitive agents', link: '/guide/cognitive-agents' },
          { text: 'Evidence & verification', link: '/guide/evidence-and-verification' },
            { text: 'Thinker profiles', link: '/guide/thinker-profiles' },
            { text: 'Governed agents', link: '/guide/governed-agents' },
          ],
        },
        {
          text: 'Connect',
          items: [
            { text: 'Typed decisions (Jev)', link: '/guide/typed-decisions' },
            { text: 'MCP connectors', link: '/guide/mcp' },
          ],
        },
        {
          text: 'Operate',
          items: [
            { text: 'Traceability & replay', link: '/guide/observability' },
            { text: 'API costs', link: '/guide/costs' },
            { text: 'Retries & fallback', link: '/guide/resilience' },
            { text: 'Incident alerts', link: '/guide/incidents' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'SDK API', link: '/reference/sdk-api' },
            { text: 'Event catalog', link: '/reference/events' },
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Project overview', link: '/reference/project-overview' },
          ],
        },
        {
          text: 'Contributing',
          collapsed: true,
          items: [
            { text: 'Development guide', link: '/contributing/development' },
            { text: 'Source tree', link: '/contributing/source-tree' },
          ],
        },
      ],
      socialLinks: [{ icon: 'github', link: repository }],
      search: { provider: 'local' },
      editLink: { pattern: `${repository}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
      outline: { level: [2, 3] },
      footer: {
        message: 'Released under the MIT License.',
        copyright: 'Copyright © 2026 Nicolas Hedoire',
      },
    },
    mermaid: {
      theme: 'base',
      themeVariables: {
        primaryColor: '#EEF2FF',
        primaryBorderColor: '#6366F1',
        primaryTextColor: '#1E1B4B',
        lineColor: '#94A3B8',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      },
    },
  })
);
