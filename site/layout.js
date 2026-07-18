import { getCanonicalPath, getCanonicalUrl } from './url.js';
import { renderSearchDialog, renderSearchScript, renderSearchStyles } from './search.js';

const routes = {
  home: getCanonicalPath('/'),
  docs: getCanonicalPath('/docs/'),
  guide: getCanonicalPath('/docs/guide/'),
  reference: getCanonicalPath('/docs/reference/'),
  demo: getCanonicalPath('/demo/'),
};

function navLink(route, label, active) {
  const current = active === route ? ' aria-current="page" class="nav-link is-current"' : ' class="nav-link"';
  return `<a href="${routes[route]}"${current}>${label}</a>`;
}

export function renderHead(
  title,
  additionalStyles = '',
  description = 'Portable, schema-driven graph execution for browser and Node.js hosts.',
  canonicalPath = '/',
) {
  return `
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${description}">
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M5 10.5 16 4l11 6.5v11L16 28 5 21.5z' fill='none' stroke='%234058bd' stroke-width='2.2'/%3E%3Cpath d='m5 10.5 11 6.3 11-6.3M16 16.8V28' fill='none' stroke='%234058bd' stroke-width='2.2'/%3E%3Ccircle cx='16' cy='16.8' r='2.7' fill='%234058bd'/%3E%3C/svg%3E">
    <link rel="canonical" href="${getCanonicalUrl(canonicalPath)}">
    <title>${title} · Symbiote Engine</title>
    <script>
      (() => {
        let theme = 'light';
        try {
          theme = localStorage.getItem('symbiote-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        } catch {}
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.add('is-shell-enhanced');
      })();
    </script>
    <style>
      :root {
        color-scheme: light;
        --page: #ffffff;
        --surface: #f7f7f8;
        --surface-soft: #f0f0f2;
        --surface-code: #f7f7f8;
        --ink: #3d3d45;
        --muted: #68686e;
        --line: #e3e3e5;
        --line-strong: #a6a6ad;
        --brand: #4058bd;
        --brand-strong: #2f449e;
        --brand-soft: #ebedf9;
        --mint: #1c7a65;
        --mint-soft: #e5f5f1;
        --amber: #a36200;
        --amber-soft: #fef5e6;
        --danger: #b82d3e;
        --focus: #4058bd;
        --shadow: none;
        --shadow-small: none;
        --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --bg-color: var(--page);
        --text-color: var(--ink);
        --border-color: var(--line);
        --primary-color: var(--ink);
        --primary-light: var(--brand);
        --primary-light-hover: var(--brand-strong);
        --code-bg: var(--surface);
        --nav-link-color: var(--muted);
        --accent-border: var(--brand);
        --font-mono: var(--mono);
      }

      :root[data-theme="dark"] {
        color-scheme: dark;
        --page: #1c1d22;
        --surface: #222329;
        --surface-soft: #2a2b33;
        --surface-code: #222329;
        --ink: #e0e0d8;
        --muted: #9b9ba3;
        --line: #303137;
        --line-strong: #50525d;
        --brand: #8192ff;
        --brand-strong: #acb7ff;
        --brand-soft: #25283d;
        --mint: #33ccaa;
        --mint-soft: #14352f;
        --amber: #ffd075;
        --amber-soft: #382d18;
        --danger: #ff8c9c;
        --focus: #8192ff;
        --shadow: none;
        --shadow-small: none;
      }

      *, *::before, *::after { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        min-width: 0;
        background: var(--page);
        color: var(--ink);
        font-family: var(--sans);
        line-height: 1.62;
        text-rendering: optimizeLegibility;
      }
      [hidden] { display: none !important; }
      a { color: var(--brand); text-underline-offset: 0.18em; }
      a:hover { text-decoration-thickness: 0.12em; }
      button, input { font: inherit; }
      button { color: inherit; }
      :focus-visible {
        outline: 2px solid var(--focus);
        outline-offset: 2px;
      }
      .skip-link {
        position: fixed;
        left: 1rem;
        top: 0.5rem;
        z-index: 1000;
        padding: 0.65rem 0.9rem;
        border-radius: 0.6rem;
        background: var(--ink);
        color: var(--page);
        transform: translateY(-180%);
      }
      .skip-link:focus { transform: translateY(0); }

      .site-header {
        position: sticky;
        top: 0;
        z-index: 50;
        border-bottom: 1px solid transparent;
        background: var(--page);
        height: 64px;
        box-sizing: border-box;
        transition: border-bottom-color 160ms ease;
      }
      .site-header.is-scrolled { border-bottom-color: var(--line); }
      .header-inner {
        width: min(1216px, calc(100% - 4rem));
        height: 64px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        box-sizing: border-box;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
        color: var(--ink);
        font-weight: 600;
        text-decoration: none;
      }
      .brand-mark {
        width: 1.5rem;
        height: 1.5rem;
        flex: 0 0 auto;
        color: var(--brand);
      }
      .brand-label {
        font-size: 1.05rem;
        letter-spacing: -0.01em;
      }
      .header-search {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        min-width: 8.8rem;
        height: 2.5rem;
        margin-right: auto;
        padding: 0 0.8rem;
        border: 0;
        border-radius: 0.8rem;
        background: var(--surface-soft);
        color: var(--muted);
        cursor: pointer;
        text-decoration: none;
      }
      .header-search:hover { color: var(--ink); }
      .header-search-icon { width: 1.15rem; height: 1.15rem; flex: 0 0 auto; }
      .header-search-label { font-size: 0.95rem; }
      .header-search kbd {
        margin-left: auto;
        padding: 0.08rem 0.38rem;
        border: 1px solid var(--line);
        border-radius: 0.38rem;
        background: var(--page);
        color: var(--muted);
        font-size: 0.72rem;
        line-height: 1.35;
      }
      .header-actions { display: flex; align-items: center; gap: 1.5rem; }
      .site-nav { display: flex; align-items: center; gap: 1.5rem; }
      .nav-link {
        color: var(--muted);
        font-size: 0.9rem;
        font-weight: 500;
        text-decoration: none;
        transition: color 150ms ease;
      }
      .nav-link:hover, .nav-link.is-current {
        background: none;
        color: var(--ink);
        box-shadow: none;
      }
      .icon-button {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--muted);
        transition: color 150ms ease;
      }
      .icon-button:hover {
        color: var(--ink);
        background: none;
        border: none;
      }
      [data-theme-toggle] { display: none; }
      .is-shell-enhanced [data-theme-toggle] { display: inline-flex; }
      .nav-toggle { display: none; }

      main { min-width: 0; }
      .content-shell {
        width: min(1152px, calc(100% - 2rem));
        margin: 0 auto;
        padding: clamp(2.5rem, 6vw, 5.8rem) 0;
      }
      .content-shell--narrow { width: min(920px, calc(100% - 2rem)); }
      h1, h2, h3, h4 {
        margin-top: 0;
        color: var(--ink);
        line-height: 1.12;
        letter-spacing: -0.025em;
      }
      h1 { font-size: clamp(2.2rem, 6vw, 4.8rem); }
      h2 { font-size: clamp(1.8rem, 4vw, 3rem); }
      h3 { font-size: clamp(1.15rem, 2vw, 1.45rem); }
      p { margin: 0 0 1rem; }
      code, pre { font-family: var(--mono); }
      :not(pre) > code {
        border: 1px solid var(--line);
        border-radius: 0.35rem;
        background: var(--surface-soft);
        padding: 0.08rem 0.34rem;
        font-size: 0.88em;
      }
      pre {
        max-width: 100%;
        overflow-x: auto;
        padding: 1.1rem 1.2rem;
        border: 1px solid var(--line);
        border-radius: 0.8rem;
        background: var(--surface);
        color: var(--ink);
        line-height: 1.55;
      }
      pre code { font-size: 0.86rem; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 0.78rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
      th { background: var(--surface-soft); }
      .table-scroll { max-width: 100%; overflow-x: auto; }
      .callout {
        margin: 1.5rem 0;
        padding: 1.05rem 1.15rem;
        border: 1px solid var(--line);
        border-left: 0.3rem solid var(--brand);
        border-radius: 0.72rem;
        background: var(--surface);
      }
      .callout--warning { border-left-color: var(--amber); background: var(--amber-soft); }

      .site-footer {
        border-top: 1px solid var(--line);
        background: var(--page);
      }
      .footer-inner {
        width: min(1152px, calc(100% - 2rem));
        margin: 0 auto;
        padding: 2.2rem 0;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1.5rem;
        color: var(--muted);
        font-size: 0.9rem;
      }
      .footer-inner p { margin: 0; max-width: 38rem; }

      @media (max-width: 760px) {
        .header-repository,
        .is-shell-enhanced [data-theme-toggle] { display: none; }
        .header-inner { min-height: 4rem; height: auto; }
        .brand-label { max-width: 9.4rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        html:not(.is-shell-enhanced) .header-inner { flex-wrap: wrap; padding: 0.65rem 0; }
        html:not(.is-shell-enhanced) .header-actions { width: 100%; }
        html:not(.is-shell-enhanced) .site-nav {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        html:not(.is-shell-enhanced) .nav-link { text-align: center; }
        .is-shell-enhanced .nav-toggle { display: inline-grid; }
        .is-shell-enhanced .site-nav {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 1rem;
          width: min(17rem, calc(100vw - 2rem));
          display: none;
          padding: 0.55rem;
          border: 1px solid var(--line);
          border-radius: 0.85rem;
          background: var(--surface);
          box-shadow: none;
        }
        .is-shell-enhanced .site-nav.is-open { display: grid; }
        .nav-link { display: block; padding: 0.72rem 0.8rem; }
        .footer-inner { flex-direction: column; }
      }

      @media (max-width: 380px) {
        .header-inner, .content-shell, .footer-inner { width: min(100% - 1.25rem, 1152px); }
        .brand-label { max-width: none; }
        .header-actions { gap: 0.35rem; }
        .header-search { min-width: 0; width: 2.5rem; padding: 0; justify-content: center; }
        .header-search-label, .header-search kbd { display: none; }
      }

      @media (prefers-reduced-motion: reduce) {
        html { scroll-behavior: auto; }
        *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
      }

      ${renderSearchStyles()}

      ${additionalStyles}
    </style>
  </head>`;
}

export function renderHeader(active = 'home') {
  return `
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="${routes.home}" aria-label="Symbiote Engine home">
        <svg class="brand-mark" viewBox="0 0 32 32" role="img" aria-label="Symbiote Engine mark">
          <path d="M5 10.5 16 4l11 6.5v11L16 28 5 21.5z" fill="none" stroke="currentColor" stroke-width="2.2"/>
          <path d="m5 10.5 11 6.3 11-6.3M16 16.8V28" fill="none" stroke="currentColor" stroke-width="2.2"/>
          <circle cx="16" cy="16.8" r="2.7" fill="currentColor"/>
        </svg>
        <span class="brand-label">Symbiote Engine</span>
      </a>
      <button class="header-search" type="button" data-search-open aria-haspopup="dialog" aria-controls="site-search-dialog" aria-label="Search documentation" title="Search documentation">
        <svg class="header-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4.5 4.5"></path>
        </svg>
        <span class="header-search-label">Search</span>
        <kbd aria-hidden="true">⌘ K</kbd>
      </button>
      <div class="header-actions">
        <nav class="site-nav" id="site-navigation" aria-label="Primary navigation">
          ${navLink('guide', 'Guide', active)}
          ${navLink('reference', 'Reference', active)}
          ${navLink('demo', 'Demo', active)}
        </nav>
        <a class="icon-button header-repository" href="https://github.com/RND-PRO/symbiote-engine" target="_blank" rel="noopener" aria-label="GitHub Repository" title="GitHub Repository">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
          </svg>
        </a>
        <button class="icon-button" type="button" data-theme-toggle aria-label="Switch color theme" title="Switch color theme">◐</button>
        <button class="icon-button nav-toggle" type="button" data-nav-toggle aria-controls="site-navigation" aria-expanded="false" aria-label="Navigation">☰</button>
      </div>
    </div>
  </header>${renderSearchDialog()}`;
}

export function renderFooter() {
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <p>Portable graph execution with explicit host boundaries.</p>
      <p>Symbiote Engine · MIT License</p>
    </div>
  </footer>`;
}

export function renderScripts() {
  return `
  <script>
    (() => {
      const root = document.documentElement;
      const header = document.querySelector('.site-header');
      const themeButton = document.querySelector('[data-theme-toggle]');
      const navButton = document.querySelector('[data-nav-toggle]');
      const navigation = document.getElementById('site-navigation');

      const updateThemeLabel = () => {
        if (!themeButton) return;
        const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        themeButton.setAttribute('aria-label', 'Switch to ' + next + ' theme');
        themeButton.title = 'Switch to ' + next + ' theme';
      };

      themeButton?.addEventListener('click', () => {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('symbiote-theme', root.dataset.theme); } catch {}
        updateThemeLabel();
      });
      updateThemeLabel();

      let scrollFrame = 0;
      const updateHeaderState = () => {
        scrollFrame = 0;
        header?.classList.toggle('is-scrolled', window.scrollY > 8);
      };
      const onScroll = () => {
        if (scrollFrame === 0) scrollFrame = requestAnimationFrame(updateHeaderState);
      };
      updateHeaderState();
      window.addEventListener('scroll', onScroll, { passive: true });

      const closeNavigation = () => {
        navigation?.classList.remove('is-open');
        navButton?.setAttribute('aria-expanded', 'false');
      };

      navButton?.addEventListener('click', () => {
        const open = !navigation?.classList.contains('is-open');
        navigation?.classList.toggle('is-open', open);
        navButton.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', (event) => {
        if (!navigation?.contains(event.target) && !navButton?.contains(event.target)) closeNavigation();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeNavigation();
      });
    })();
  </script>${renderSearchScript()}`;
}

export { routes };
