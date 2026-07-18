import { docsRoutes } from './docs/routes.js';
import { getCanonicalPath } from './url.js';

export function renderSearchStyles() {
  return `
    .site-search-dialog {
      width: min(40rem, calc(100% - 2rem));
      height: min(42rem, calc(100dvh - 2rem));
      max-height: min(42rem, calc(100dvh - 2rem));
      margin: auto;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 1rem;
      background: var(--page);
      color: var(--ink);
      box-shadow: 0 1.2rem 4rem rgb(0 0 0 / 0.18);
    }
    .site-search-dialog::backdrop { background: rgb(22 23 28 / 0.42); }
    .site-search-panel {
      display: grid;
      grid-template-rows: auto auto auto minmax(0, 1fr);
      height: 100%;
      min-height: 0;
    }
    .site-search-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.15rem 1.25rem 0.8rem;
    }
    .site-search-heading h2 { margin: 0; font-size: 1.05rem; letter-spacing: -0.01em; }
    .site-search-heading p {
      margin: 0 0 0.15rem;
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .site-search-close {
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 1.35rem;
      line-height: 1;
    }
    .site-search-close:hover { color: var(--ink); }
    .site-search-field {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      margin: 0 1.25rem;
      padding: 0 0.85rem;
      border: 1px solid var(--line-strong);
      border-radius: 0.72rem;
      background: var(--surface);
    }
    .site-search-field svg { width: 1.1rem; flex: 0 0 auto; color: var(--muted); }
    .site-search-input {
      width: 100%;
      min-width: 0;
      height: 2.8rem;
      padding: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--ink);
    }
    .site-search-status {
      margin: 0;
      padding: 0.7rem 1.25rem 0.45rem;
      color: var(--muted);
      font-size: 0.8rem;
    }
    .site-search-results {
      display: grid;
      gap: 0.2rem;
      margin: 0;
      padding: 0 0.65rem 0.75rem;
      min-height: 0;
      overflow-y: auto;
      list-style: none;
    }
    .site-search-result a {
      display: grid;
      gap: 0.12rem;
      padding: 0.72rem 0.85rem;
      border-radius: 0.65rem;
      color: var(--ink);
      text-decoration: none;
    }
    .site-search-result a:hover,
    .site-search-result a:focus-visible { background: var(--surface-soft); }
    .site-search-result strong { font-size: 0.93rem; }
    .site-search-result span { color: var(--muted); font-size: 0.8rem; line-height: 1.45; }
    @media (max-width: 540px) {
      .site-search-dialog { width: calc(100% - 1.25rem); max-height: calc(100dvh - 1.25rem); }
      .site-search-heading { padding-inline: 1rem; }
      .site-search-field { margin-inline: 1rem; }
      .site-search-status { padding-inline: 1rem; }
    }
  `;
}

export function renderSearchDialog() {
  const results = docsRoutes.map((route) => `
          <li class="site-search-result" data-search-item data-search-text="${route.title} ${route.section} ${route.description} ${route.keywords || ''}">
            <a href="${getCanonicalPath(route.path)}">
              <strong>${route.title}</strong>
              <span>${route.description}</span>
            </a>
          </li>`).join('');

  return `
  <dialog class="site-search-dialog" id="site-search-dialog" data-site-search-dialog aria-labelledby="site-search-title">
    <div class="site-search-panel">
      <div class="site-search-heading">
        <div>
          <p>Documentation</p>
          <h2 id="site-search-title">Search Symbiote Engine</h2>
        </div>
        <button class="site-search-close" type="button" data-search-close aria-label="Close search">×</button>
      </div>
      <label class="site-search-field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4.5 4.5"></path>
        </svg>
        <input class="site-search-input" type="search" data-search-input aria-label="Search documentation" placeholder="Search guides and reference" autocomplete="off" spellcheck="false">
      </label>
      <p class="site-search-status" data-search-status aria-live="polite"></p>
      <ul class="site-search-results">${results}
      </ul>
    </div>
  </dialog>`;
}

export function renderSearchScript() {
  return `<script type="module" src="${getCanonicalPath('/search/index.js')}"></script>`;
}
