import { renderDocsPage } from './shell.js';
import { getCanonicalPath } from '../url.js';

const intro = `
  <div class="docs-header" id="overview">
    <h1>Overview</h1>
    <p>
      <strong>Symbiote Engine</strong> is a domain-agnostic execution runtime for schema-driven workflows modeled as Directed Acyclic Graphs (DAGs). Written as ECMAScript modules, the engine decouples execution logic and graph state from product interfaces and network services.
    </p>
  </div>
`;

const content = `
  <section id="overview-details">
    <p>
      It is designed to satisfy two main runtime environments:
    </p>
    <ul>
      <li><strong>Browser contexts:</strong> The <code>symbiote-engine/browser</code> export excludes Node-only server, provider, job-queue, and file-helper exports. Shared Persistence.js source still contains dormant dynamic Node imports.</li>
      <li><strong>Node entrypoint:</strong> Via the root <code>symbiote-engine</code> export, hosts can dynamically reload node handler scripts from the filesystem and process background jobs. GraphServer is only the <code>symbiote-engine/GraphServer.js</code> subpath.</li>
    </ul>
  </section>

  <section id="design-goals">
    <h2>Design goals</h2>
    <ul>
      <li><strong>Portability:</strong> Workflows serialize to pure JSON, allowing agents to author and modify them dynamically. Portable JSON is executable only after host registers node implementations.</li>
      <li><strong>Incremental Caching:</strong> Incremental cache reuses by node ID, without input comparison. Lifecycle keys are raw, order-sensitive <code>JSON.stringify({ i: inputs, p: params })</code>.</li>
      <li><strong>Socket compatibility:</strong> Registered input and output types are checked when graph connections are created, but only if both node definitions and named sockets are present.</li>
    </ul>
  </section>

  <section id="get-started">
    <h2>Get Started</h2>
    <p>
      To begin using Symbiote Engine, install the package and import the core classes.
    </p>

    <h3>Installation</h3>
    <pre><code data-language="bash">npm install symbiote-engine</code></pre>

    <p>
      For a complete basic setup and execution example, see the <a href="${getCanonicalPath('/docs/getting-started/')}">Getting Started</a> guide.
    </p>
  </section>
`;

export default renderDocsPage({
  title: 'Overview & Reference',
  description: 'Understand Symbiote Engine execution model, architectural boundaries, and core design goals.',
  canonicalPath: '/docs/',
  activeRoute: '/docs/',
  intro,
  content
});
