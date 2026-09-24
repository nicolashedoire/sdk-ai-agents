import { defineConfig, type DefaultTheme, type LocaleSpecificConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { text as ar } from './i18n/ar';
import { text as de } from './i18n/de';
import { text as en } from './i18n/en';
import { text as es } from './i18n/es';
import { text as fr } from './i18n/fr';
import { text as hi } from './i18n/hi';
import { text as ja } from './i18n/ja';
import { text as ko } from './i18n/ko';
import { text as pt } from './i18n/pt';
import { text as ru } from './i18n/ru';
import { LANGUAGES, SIDEBAR, type LanguageCode } from './i18n/structure';
import type { LocaleText } from './i18n/types';
import { text as zh } from './i18n/zh';

const repository = 'https://github.com/nicolashedoire/sdk-ai-agents';
const version = 'v0.2.0';

const TRANSLATIONS: Record<LanguageCode, LocaleText> = { fr, es, de, zh, pt, ja, ko, ru, ar, hi };

/** The site's interface in one language; `prefix` is '' for English and '/fr' for French. */
function localeConfig(text: LocaleText, prefix: string): LocaleSpecificConfig<DefaultTheme.Config> {
  return {
    description: text.description,
    themeConfig: {
      nav: [
        { text: text.nav.guide, link: `${prefix}/guide/introduction`, activeMatch: `${prefix}/guide/` },
        { text: text.nav.reference, link: `${prefix}/reference/sdk-api`, activeMatch: `${prefix}/reference/` },
        {
          text: version,
          items: [
            { text: text.nav.changelog, link: `${repository}/blob/main/CHANGELOG.md` },
            { text: text.nav.contributing, link: `${prefix}/contributing/development` },
          ],
        },
      ],
      sidebar: SIDEBAR.map((section) => ({
        text: text.groups[section.group],
        ...('collapsed' in section ? { collapsed: section.collapsed } : {}),
        items: section.pages.map((page) => ({ text: text.pages[page], link: `${prefix}/${page}` })),
      })),
      editLink: { pattern: `${repository}/edit/main/docs/:path`, text: text.ui.editLink },
      outline: { level: [2, 3], label: text.ui.outline },
      docFooter: { prev: text.ui.previousPage, next: text.ui.nextPage },
      lastUpdated: { text: text.ui.lastUpdated },
      returnToTopLabel: text.ui.returnToTop,
      sidebarMenuLabel: text.ui.sidebarMenu,
      darkModeSwitchLabel: text.ui.darkModeSwitch,
      lightModeSwitchTitle: text.ui.lightModeSwitchTitle,
      darkModeSwitchTitle: text.ui.darkModeSwitchTitle,
      langMenuLabel: text.ui.languageMenu,
      skipToContentLabel: text.ui.skipToContent,
      notFound: { ...text.ui.notFound },
      footer: { message: text.ui.footerMessage, copyright: 'Copyright © 2026 Nicolas Hedoire' },
    },
  };
}

function searchTranslations(text: LocaleText) {
  const { search } = text;
  return {
    button: { buttonText: search.buttonText, buttonAriaLabel: search.buttonAriaLabel },
    modal: {
      displayDetails: search.displayDetails,
      resetButtonTitle: search.resetButtonTitle,
      backButtonTitle: search.backButtonTitle,
      noResultsText: search.noResultsText,
      footer: {
        selectText: search.selectText,
        selectKeyAriaLabel: search.selectKeyAriaLabel,
        navigateText: search.navigateText,
        navigateUpKeyAriaLabel: search.navigateUpKeyAriaLabel,
        navigateDownKeyAriaLabel: search.navigateDownKeyAriaLabel,
        closeText: search.closeText,
        closeKeyAriaLabel: search.closeKeyAriaLabel,
      },
    },
  };
}

export default withMermaid(
  defineConfig({
    title: 'SDK AI Agents',
    base: '/sdk-ai-agents/',
    cleanUrls: true,
    lastUpdated: true,
    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/sdk-ai-agents/logo.svg' }],
      ['meta', { name: 'theme-color', content: '#4F46E5' }],
      ['meta', { property: 'og:title', content: 'SDK AI Agents' }],
      ['meta', { property: 'og:description', content: 'Governed AI agents that think before they act.' }],
    ],
    locales: {
      root: { label: 'English', lang: 'en-US', ...localeConfig(en, '') },
      ...Object.fromEntries(
        LANGUAGES.map((language) => [
          language.code,
          {
            label: language.label,
            lang: language.lang,
            ...('dir' in language ? { dir: language.dir } : {}),
            link: `/${language.code}/`,
            ...localeConfig(TRANSLATIONS[language.code], `/${language.code}`),
          },
        ])
      ),
    },
    themeConfig: {
      logo: '/logo.svg',
      socialLinks: [{ icon: 'github', link: repository }],
      search: {
        provider: 'local',
        options: {
          locales: Object.fromEntries([
            ['root', { translations: searchTranslations(en) }],
            ...LANGUAGES.map((language) => [
              language.code,
              { translations: searchTranslations(TRANSLATIONS[language.code]) },
            ]),
          ]),
        },
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
