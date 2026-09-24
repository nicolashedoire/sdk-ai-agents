import type { PageSlug, SidebarGroup } from './structure';

/** Every text of the site's interface, in one language. Page contents live in the Markdown files. */
export interface LocaleText {
  /** Shown under the title in search engines and link previews. */
  description: string;
  nav: { guide: string; reference: string; changelog: string; contributing: string };
  /** Titles of the sidebar groups. */
  groups: Record<SidebarGroup, string>;
  /** Titles of the pages in the sidebar. */
  pages: Record<PageSlug, string>;
  ui: {
    editLink: string;
    outline: string;
    previousPage: string;
    nextPage: string;
    lastUpdated: string;
    returnToTop: string;
    sidebarMenu: string;
    darkModeSwitch: string;
    lightModeSwitchTitle: string;
    darkModeSwitchTitle: string;
    languageMenu: string;
    skipToContent: string;
    footerMessage: string;
    notFound: { title: string; quote: string; linkLabel: string; linkText: string };
  };
  search: {
    buttonText: string;
    buttonAriaLabel: string;
    displayDetails: string;
    resetButtonTitle: string;
    backButtonTitle: string;
    noResultsText: string;
    selectText: string;
    selectKeyAriaLabel: string;
    navigateText: string;
    navigateUpKeyAriaLabel: string;
    navigateDownKeyAriaLabel: string;
    closeText: string;
    closeKeyAriaLabel: string;
  };
}
