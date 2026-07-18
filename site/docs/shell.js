import { getCanonicalPath, getCanonicalUrl } from '../url.js';
import { renderSearchDialog, renderSearchScript, renderSearchStyles } from '../search.js';
import { docsRoutes } from './routes.js';

const topRoutes = {
  home: getCanonicalPath('/'),
  docs: getCanonicalPath('/docs/'),
  demo: getCanonicalPath('/demo/'),
};

function navLink(route, label, active) {
  const current = active === route ? ' aria-current="page" class="nav-link is-current"' : ' class="nav-link"';
  return `<a href="${topRoutes[route]}"${current}>${label}</a>`;
}

function renderMobileOnThisPage(content) {
  const links = [...content.matchAll(/<section\s+id="([^"]+)"[^>]*>\s*<h2[^>]*>(.*?)<\/h2>/g)]
    .map(([, id, label]) => `<li><a href="#${id}" class="sidebar-link">${label.replace(/<[^>]+>/g, '')}</a></li>`);

  if (links.length === 0) return '';

  return `<details class="mobile-toc">
          <summary>On this page</summary>
          <div class="mobile-toc-content">
            <ul class="sidebar-list">${links.join('')}</ul>
          </div>
        </details>`;
}

function renderOnThisPage(content) {
  const links = [...content.matchAll(/<section\s+id="([^"]+)"[^>]*>\s*<h2[^>]*>(.*?)<\/h2>/g)]
    .map(([, id, label]) => `<li><a href="#${id}">${label.replace(/<[^>]+>/g, '')}</a></li>`);

  if (links.length === 0) return '';

  return `<aside class="on-this-page" aria-label="On this page">
        <h2>On this page</h2>
        <ul>${links.join('')}</ul>
      </aside>`;
}

export function renderDocsPage({ title, description, canonicalPath, activeRoute, intro, content }) {
  const sectionMapping = {
    'Getting Started': 'Getting Started',
    'Guide': 'Guides & Runtime',
    'Runtime': 'Guides & Runtime',
    'Rendering': 'Guides & Runtime',
    'Reference': 'Reference & Safety',
    'Safety': 'Reference & Safety'
  };

  const currentIndex = docsRoutes.findIndex(r => r.path === activeRoute);
  const prevRoute = currentIndex > 0 ? docsRoutes[currentIndex - 1] : null;
  const nextRoute = currentIndex !== -1 && currentIndex < docsRoutes.length - 1 ? docsRoutes[currentIndex + 1] : null;
  const docsClientPath = activeRoute === '/docs/getting-started/'
    ? '/docs/node-preview/index.js'
    : '/docs/index.js';

  const pagerHtml = currentIndex !== -1 ? `
    <div class="docs-pager">
      ${prevRoute ? `<a href="${getCanonicalPath(prevRoute.path)}" class="pager-prev">
        <span class="pager-label">Previous</span>
        <span class="pager-title">${prevRoute.title}</span>
      </a>` : '<div></div>'}
      ${nextRoute ? `<a href="${getCanonicalPath(nextRoute.path)}" class="pager-next">
        <span class="pager-label">Next</span>
        <span class="pager-title">${nextRoute.title}</span>
      </a>` : '<div></div>'}
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
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

      --sn-sys-surface: var(--surface);
      --sn-sys-on-surface: var(--ink);
      --sn-sys-border: var(--line);
      --sn-sys-accent: var(--brand);
      --sn-sys-accent-soft: var(--brand-soft);
      --sn-sys-focus: var(--focus);
      --sn-sys-outline: var(--line);
      --sn-syntax-keyword: var(--brand);
      --sn-syntax-string: var(--mint);
      --sn-syntax-comment: var(--muted);
      --sn-syntax-function: var(--ink);
      --sn-syntax-number: var(--amber);
      --sn-syntax-builtin: var(--brand);
      --sn-syntax-property: var(--ink);
      --sn-syntax-literal: var(--mint);
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

      --sn-sys-surface: var(--surface);
      --sn-sys-on-surface: var(--ink);
      --sn-sys-border: var(--line);
      --sn-sys-accent: var(--brand);
      --sn-sys-accent-soft: var(--brand-soft);
      --sn-sys-focus: var(--focus);
      --sn-sys-outline: var(--line);
      --sn-syntax-keyword: var(--brand);
      --sn-syntax-string: var(--mint);
      --sn-syntax-comment: var(--muted);
      --sn-syntax-function: var(--ink);
      --sn-syntax-number: var(--amber);
      --sn-syntax-builtin: var(--brand);
      --sn-syntax-property: var(--ink);
      --sn-syntax-literal: var(--mint);
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
      width: min(1152px, calc(100% - 48px));
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
    .site-nav { display: flex; align-items: center; gap: 1rem; }
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

    .docs-container {
      display: grid;
      gap: 2.5rem;
      margin-top: 1rem;
      align-items: start;
    }
    .docs-header {
      grid-column: 2;
      grid-row: 1;
    }
    .docs-sidebar {
      grid-column: 1;
      grid-row: 1 / 3;
      flex-shrink: 0;
      position: sticky;
      top: 5rem;
      height: calc(100vh - 8rem);
      overflow-y: auto;
      padding-right: 1.5rem;
      border-right: 1px solid var(--border-color);
    }
    .docs-sidebar summary {
      display: none;
      list-style: none;
    }
    .docs-sidebar summary::-webkit-details-marker {
      display: none;
    }
    .docs-sidebar h3 {
      font-size: 14px;
      line-height: 24px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--nav-link-color);
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--line);
    }
    .docs-sidebar h3:first-child {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }
    .sidebar-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .sidebar-link {
      color: var(--nav-link-color);
      text-decoration: none;
      font-size: 16px;
      line-height: 24px;
      font-weight: 400;
      display: block;
      padding: 0.28rem 0;
      transition: color 150ms ease;
    }
    .sidebar-link:hover {
      color: var(--primary-light);
    }
    .sidebar-link.is-active {
      color: var(--primary-light);
      font-weight: 600;
    }
    .docs-content {
      grid-column: 2;
      grid-row: 2;
      min-width: 0;
      overflow-wrap: anywhere;
      max-width: 100%;
    }
    .docs-content section {
      scroll-margin-top: 6rem;
      margin-bottom: 3.5rem;
    }

    .on-this-page { display: none; }

    .reference-meta {
      font-size: 0.85rem;
      color: var(--muted);
    }

    .content-shell {
      width: min(1152px, calc(100% - 48px));
      margin: 0 auto;
      padding: clamp(2.5rem, 6vw, 5.8rem) 0;
    }
    h1, h2, h3, h4 {
      margin-top: 0;
      color: var(--ink);
      line-height: 1.12;
      letter-spacing: -0.025em;
    }
    h1 {
      font-size: 32px;
      line-height: 40px;
      font-weight: 600;
      letter-spacing: -0.64px;
    }
    h2 {
      font-size: 24px;
      line-height: 32px;
      font-weight: 600;
    }
    h3 { font-size: clamp(1.15rem, 2vw, 1.45rem); }
    p {
      font-size: 16px;
      line-height: 28px;
      margin: 16px 0;
    }
    code, pre { font-family: var(--mono); }
    :not(pre) > code {
      border: 1px solid var(--line);
      border-radius: 4px;
      background: var(--surface-soft);
      padding: 2px 5px;
      font-size: 0.88em;
    }
    pre {
      max-width: 100%;
      overflow-x: auto;
      margin: 1.75rem 0 2rem;
      padding: 1rem 1.15rem;
      border: 1px solid var(--line);
      border-radius: 0.65rem;
      background: var(--surface);
      color: var(--ink);
      line-height: 1.55;
    }
    pre code { font-size: 0.86rem; }

    .code-block-wrapper {
      margin: 1.75rem 0 2rem;
      border: 1px solid var(--line);
      border-radius: 0.65rem;
      background: var(--surface);
      overflow: hidden;
    }
    .code-block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--line);
      background: var(--surface-soft);
      font-family: var(--sans);
    }
    .code-block-lang {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .code-block-copy {
      font-size: 0.75rem;
      background: none;
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 0.2rem 0.5rem;
      color: var(--muted);
      cursor: pointer;
      transition: all 150ms ease;
    }
    .code-block-copy:hover {
      color: var(--ink);
      border-color: var(--line-strong);
    }

    .docs-code-enhanced {
      display: block;
      margin: 0;
      max-width: 100%;
      --cb-bg: transparent;
      --cb-border: transparent;
      --cb-fg: var(--ink);
    }
    .docs-code-enhanced[hidden] { display: none; }
    code-block.docs-code-enhanced .cb-gutter { display: none; }
    code-block.docs-code-enhanced .cb-pre {
      margin: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
    }

    .docs-pager {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-top: 4rem;
      padding-top: 2rem;
      border-top: 1px solid var(--line);
    }
    .docs-pager a {
      display: flex;
      flex-direction: column;
      padding: 1rem;
      border: 1px solid var(--line);
      border-radius: 0.65rem;
      text-decoration: none;
      transition: border-color 150ms ease;
    }
    .docs-pager a:hover {
      border-color: var(--brand);
    }
    .pager-prev { align-items: flex-start; text-align: left; }
    .pager-next { align-items: flex-end; text-align: right; }
    .pager-label {
      font-size: 0.75rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
    }
    .pager-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--brand);
    }

    .node-preview {
      margin: 2.25rem 0 2.5rem;
    }
    .node-preview-heading {
      margin: 0 0 0.75rem;
      color: var(--muted);
      font-size: 0.88rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .node-preview-stage {
      min-height: 270px;
      overflow: hidden;
    }
    .node-preview-stage node-canvas {
      display: block;
      width: 100%;
      height: 270px;
      --sn-node-min-width: 180px;
      --sn-node-max-width: 220px;
      --sn-sys-surface: var(--surface);
      --sn-grid-dot: var(--line-strong);
      --sn-accent-color: var(--brand);
      --sn-conn-color: var(--brand);
    }
    .node-preview-stage .material-symbols-outlined {
      font-size: 0;
      line-height: 0;
    }
    .node-preview-fallback {
      display: grid;
      min-height: 270px;
      place-items: center;
      padding: 2rem;
      color: var(--muted);
      text-align: center;
    }
    .node-preview.is-ready .node-preview-fallback { display: none; }
    .node-preview-note {
      margin: 0.75rem 0 0;
      color: var(--muted);
      font-size: 0.82rem;
      line-height: 1.5;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
      display: block;
      overflow-x: auto;
    }
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
      vertical-align: top;
    }
    th {
      background: var(--code-bg);
      font-weight: 600;
      color: var(--primary-color);
    }

    .callout {
      margin: 1.5rem 0;
      padding: 1.05rem 1.15rem;
      border-radius: 8px;
      background: var(--surface-soft);
    }
    .callout--warning { background: var(--amber-soft); }

    .site-footer {
      border-top: 1px solid var(--line);
      background: var(--page);
    }
    .footer-inner {
      width: min(1152px, calc(100% - 48px));
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

    @media (max-width: 900px) {
      .header-repository,
      .is-shell-enhanced [data-theme-toggle] { display: none; }
      .content-shell {
        padding: 0 0 3.5rem 0;
      }
      .docs-container {
        display: flex;
        flex-direction: column;
        gap: 0;
        margin-top: 0;
        align-items: stretch;
      }
      .mobile-docs-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 48px;
        border-bottom: 1px solid var(--line);
        margin: 0 -24px 32px;
        padding: 0 24px;
        position: sticky;
        top: 64px;
        background: var(--page);
        z-index: 40;
      }
      .docs-sidebar {
        width: auto;
        height: 48px;
        position: static;
        top: auto;
        overflow: visible;
        padding: 0;
        border: none;
        flex: none;
      }
      .docs-sidebar summary, .mobile-toc summary {
        display: flex;
        align-items: center;
        height: 100%;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        list-style: none;
        user-select: none;
        color: var(--ink);
      }
      .docs-sidebar summary::-webkit-details-marker, .mobile-toc summary::-webkit-details-marker { display: none; }
      .docs-sidebar summary::after, .mobile-toc summary::after {
        content: "▼";
        font-size: 0.7em;
        margin-left: 0.5rem;
        transition: transform 0.2s;
      }
      .docs-sidebar[open] summary::after, .mobile-toc[open] summary::after {
        transform: rotate(180deg);
      }
      .docs-sidebar[open] summary::before,
      .mobile-toc[open] summary::before {
        content: "";
        position: fixed;
        inset: 0;
        top: 112px;
        background: var(--ink);
        opacity: 0.15;
        z-index: 90;
        cursor: default;
      }
      .sidebar-content {
        position: fixed;
        top: 112px;
        left: 0;
        bottom: 0;
        width: 320px;
        max-width: 85vw;
        background: var(--page);
        border-right: 1px solid var(--line);
        overflow-y: auto;
        z-index: 100;
        padding: 1.5rem 24px;
      }
      .mobile-toc-content {
        position: absolute;
        top: 48px;
        left: 0;
        right: 0;
        background: var(--page);
        border-bottom: 1px solid var(--line);
        padding: 1.5rem 24px;
        z-index: 100;
        overflow-y: auto;
        max-height: calc(100vh - 112px);
      }
    }
    @media (min-width: 901px) {
      .mobile-docs-bar { display: contents; }
      .mobile-toc { display: none; }
      .site-header {
        background: linear-gradient(to right, var(--surface) 0 272px, var(--page) 272px);
      }
      .header-inner,
      .footer-inner {
        width: calc(100% - 4rem);
      }
      .content-shell {
        width: 100%;
        padding: 3rem 0 5.5rem;
      }
      .docs-container {
        grid-template-columns: 272px minmax(0, 1fr);
        column-gap: clamp(3rem, 7.78vw, 7rem);
        row-gap: 2rem;
        margin-top: 0;
      }
      .docs-header,
      .docs-content {
        width: min(688px, calc(100vw - 24rem));
      }
      .docs-sidebar {
        width: 272px;
        height: calc(100vh - 4rem);
        top: 4rem;
        margin-top: -3rem;
        padding: 1.25rem 2rem 2rem;
        border-right: 1px solid var(--line);
        background: var(--surface);
      }
      .docs-sidebar h3:first-child {
        margin-top: 0;
      }
      .docs-sidebar > .sidebar-content {
        display: block !important;
      }
    }
    @media (min-width: 1280px) {
      .docs-container {
        grid-template-columns: 272px minmax(0, 688px) minmax(120px, 208px);
        column-gap: clamp(3rem, 7.78vw, 7rem);
      }
      .on-this-page {
        display: block;
        grid-column: 3;
        grid-row: 1 / 3;
        position: sticky;
        top: 6rem;
        align-self: start;
        padding-left: 1rem;
        border-left: 1px solid var(--line);
        color: var(--muted);
      }
      .on-this-page h2 {
        margin: 0 0 0.65rem;
        font-size: 0.875rem;
        letter-spacing: 0;
      }
      .on-this-page ul {
        display: grid;
        gap: 0.55rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .on-this-page a {
        color: var(--muted);
        font-size: 0.875rem;
        line-height: 1.45;
        text-decoration: none;
      }
      .on-this-page a:hover { color: var(--ink); }
    }
    @media (max-width: 760px) {
      .header-inner { min-height: 4rem; height: auto; }
      .brand-label { max-width: 9.4rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .header-search { min-width: 0; width: 2.5rem; padding: 0; justify-content: center; }
      .header-search-label, .header-search kbd { display: none; }
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
      .header-inner, .content-shell, .footer-inner { width: min(100% - 48px, 1152px); }
      .brand-label { max-width: none; }
      .header-actions { gap: 0.35rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
    }
    ${renderSearchStyles()}
  </style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="${topRoutes.home}" aria-label="Symbiote Engine home">
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
          ${navLink('home', 'Overview', 'docs')}
          ${navLink('docs', 'Guide & Reference', 'docs')}
          ${navLink('demo', 'Demo', 'docs')}
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
  </header>${renderSearchDialog()}

  <main id="main-content" class="content-shell">
    <div class="docs-container">
      <div class="mobile-docs-bar">
        <details class="docs-sidebar">
          <summary>Menu</summary>
          <div class="sidebar-content">
${Object.entries(docsRoutes.reduce((acc, route) => {
    const section = sectionMapping[route.section] || route.section;
    if (!acc[section]) acc[section] = [];
    acc[section].push(route);
    return acc;
  }, {})).map(([section, routes]) => `            <h3>${section}</h3>
            <ul class="sidebar-list">
${routes.map(route => `              <li><a href="${getCanonicalPath(route.path)}" class="sidebar-link${activeRoute === route.path ? ' is-active' : ''}"${activeRoute === route.path ? ' aria-current="page"' : ''}>${route.title}</a></li>`).join('\n')}
            </ul>`).join('\n\n')}
          </div>
        </details>
        ${renderMobileOnThisPage(content)}
      </div>

      ${intro}

      <div class="docs-content">
        ${content}
        ${pagerHtml}
      </div>

      ${renderOnThisPage(content)}
    </div>
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <p>Portable graph execution with explicit host boundaries.</p>
      <p>Symbiote Engine · MIT License</p>
    </div>
  </footer>

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

      const sidebar = document.querySelector('.docs-sidebar');
      if (sidebar) {
        const handleResize = () => {
          if (window.innerWidth <= 900) {
            sidebar.removeAttribute('open');
          } else {
            sidebar.setAttribute('open', '');
          }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
      }

      const codeBlocks = [...document.querySelectorAll('.docs-content pre > code')];
      const enhanceCodeBlocks = async () => {
        if (codeBlocks.length === 0) return;
        try {
          await customElements.whenDefined('code-block');
          for (const code of codeBlocks) {
            const fallback = code.closest('pre');
            if (!fallback || !fallback.isConnected) continue;

            const lang = code.getAttribute('data-language') || 'js';
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            const header = document.createElement('div');
            header.className = 'code-block-header';

            const langSpan = document.createElement('span');
            langSpan.className = 'code-block-lang';
            langSpan.textContent = lang;

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'code-block-copy';
            copyBtn.textContent = 'Copy';
            copyBtn.setAttribute('aria-live', 'polite');
            let copyTimeout;
            copyBtn.onclick = async () => {
              try {
                await navigator.clipboard.writeText(code.textContent);
                copyBtn.textContent = 'Copied';
              } catch {
                copyBtn.textContent = 'Copy failed';
              }
              clearTimeout(copyTimeout);
              copyTimeout = setTimeout(() => {
                copyBtn.textContent = 'Copy';
              }, 2000);
            };

            header.append(langSpan, copyBtn);

            const enhanced = document.createElement('code-block');
            enhanced.className = 'docs-code-enhanced';

            wrapper.append(header, enhanced);
            fallback.replaceWith(wrapper);

            try {
              enhanced.setContent(code.textContent, lang);
            } catch (error) {
              wrapper.replaceWith(fallback);
              throw error;
            }
          }
        } catch {
          // The semantic pre/code fallback remains visible when the optional component is unavailable.
        }
      };
      enhanceCodeBlocks();

      const nodePreview = document.querySelector('[data-node-preview]');
      if (nodePreview) {
        const previewRoot = nodePreview.closest('.node-preview');
        const fallback = nodePreview.querySelector('.node-preview-fallback');
        const enhanceNodePreview = async () => {
          try {
            await import('${getCanonicalPath('/docs/node-preview/index.js')}');
            await customElements.whenDefined('node-canvas');
            const canvas = document.createElement('node-canvas');
            canvas.setAttribute('data-readonly', '');
            nodePreview.append(canvas);
            canvas.setChrome(false);
            canvas.setPanels(false);
            canvas.setViewportLocked(true);
            canvas.setEditorModel({
              readonly: true,
              nodes: [
                { id: 'source', type: 'docs/source', name: 'Source', outputs: [{ name: 'value', type: 'number', label: 'value' }] },
                { id: 'double', type: 'docs/double', name: 'Double', inputs: [{ name: 'value', type: 'number', label: 'value' }], outputs: [{ name: 'result', type: 'number', label: 'result' }] },
              ],
              connections: [{ id: 'source-to-double', from: 'source', out: 'value', to: 'double', in: 'value' }],
              positions: { source: [48, 74], double: { x: 300, y: 74 } },
            });
            await new Promise((resolve) => requestAnimationFrame(resolve));
            canvas.flyToNodes(['source', 'double'], { padding: 28, minZoom: 0.9, maxZoom: 1.15, select: false });
            previewRoot?.classList.add('is-ready');
            fallback?.setAttribute('hidden', '');
          } catch {
            // Keep the static fallback as the source of truth if the optional component cannot load.
          }
        };
        enhanceNodePreview();
      }
    })();
  </script>
  <script type="module" src="${getCanonicalPath(docsClientPath)}"></script>${renderSearchScript()}
</body>
</html>`;
}
