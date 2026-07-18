import { renderHead, renderHeader, renderFooter, renderScripts, routes } from './layout.js';

export default /*html*/ `
<!DOCTYPE html>
<html lang="en">
${renderHead('Page Not Found', `
  .error-container {
    text-align: center;
    padding: 4rem 1rem;
  }
  .error-title {
    font-size: 4rem;
    color: var(--primary-light);
    margin-bottom: 1rem;
  }
  .error-message {
    font-size: 1.25rem;
    margin-bottom: 2rem;
    color: var(--nav-link-color);
  }
  .error-subtitle {
    border: none;
    margin-top: 0;
  }
  .btn-home {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background: var(--primary-light);
    color: white;
    font-weight: bold;
    border-radius: 8px;
    text-decoration: none;
    transition: background 0.2s;
  }
  .btn-home:hover {
    background: var(--primary-light-hover);
    text-decoration: none;
  }
`, 'The requested Symbiote Engine page could not be found.', '/404.html')}
<body>
  ${renderHeader('none')}

  <main id="main-content" class="content-shell content-shell--narrow">
    <div class="error-container">
      <div class="error-title">404</div>
      <h1 class="error-subtitle">Page Not Found</h1>
      <p class="error-message">The documentation page or workspace resource you are looking for does not exist or has been relocated.</p>
      <a href="${routes.home}" class="btn-home">Return to Overview</a>
    </div>
  </main>

  ${renderFooter()}
  ${renderScripts()}
</body>
</html>
`;
