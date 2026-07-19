import { renderPage } from 'library-pages/shell';
import { buildSearchIndex } from 'library-pages/search';
import { composeSiteConfig, docsRoutes, resolvePath } from './site.config.js';

const errorStyles = /*css*/ `
  .error-container {
    text-align: center;
    padding: 4rem 1rem;
  }
  .error-title {
    font-size: 4rem;
    color: var(--brand);
    margin-bottom: 1rem;
  }
  .error-message {
    font-size: 1.25rem;
    margin-bottom: 2rem;
    color: var(--muted);
  }
  .error-subtitle {
    border: none;
    margin-top: 0;
  }
  .btn-home {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background: var(--brand);
    color: white;
    font-weight: bold;
    border-radius: 8px;
    text-decoration: none;
    transition: background 0.2s;
  }
  .btn-home:hover {
    background: var(--brand-strong);
    text-decoration: none;
  }
`;

const contentHtml = /*html*/ `
    <div class="error-container">
      <div class="error-title">404</div>
      <h1 class="error-subtitle">Page Not Found</h1>
      <p class="error-message">The documentation page or workspace resource you are looking for does not exist or has been relocated.</p>
      <a href="${resolvePath('/')}" class="btn-home">Return to Overview</a>
    </div>
`;

export default renderPage({
  siteConfig: composeSiteConfig({
    pageStyles: errorStyles,
    description: 'The requested Symbiote Engine page could not be found.',
    narrow: true,
  }),
  pageTitle: 'Page Not Found',
  contentHtml,
  currentPath: '/404.html',
  searchIndex: buildSearchIndex(docsRoutes),
});
