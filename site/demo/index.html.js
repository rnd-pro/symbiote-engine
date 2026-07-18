import { renderHead, renderHeader, renderFooter, renderScripts } from '../layout.js';

export default /*html*/ `
<!DOCTYPE html>
<html lang="en">
${renderHead('In-memory demo', `
  .demo-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-top: 1rem;
  }
  .controls-panel {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    background: var(--bg-color);
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .btn-run {
    padding: 0.75rem 1.5rem;
    background: var(--primary-light);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 700;
    font-size: 1rem;
    transition: background 0.2s;
  }
  .btn-run:hover {
    background: var(--primary-light-hover);
  }
  .btn-run:disabled {
    background: var(--border-color);
    cursor: not-allowed;
    color: var(--nav-link-color);
  }
  .terminal-console {
    background: #0f172a;
    color: #38bdf8;
    font-family: var(--font-mono);
    padding: 1.25rem;
    border-radius: 8px;
    min-height: 250px;
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid #1e293b;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
  }
  .terminal-line {
    margin: 0.25rem 0;
    line-height: 1.4;
  }
  .terminal-info { color: #f8fafc; }
  .terminal-success { color: #4ade80; }
  .terminal-warn { color: #fbbf24; }
  .terminal-error { color: #f87171; }

  .visual-dag {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    background: var(--code-bg);
    overflow-x: auto;
    gap: 1rem;
  }
  .dag-node {
    border: 2px solid var(--border-color);
    background: var(--bg-color);
    padding: 0.75rem;
    border-radius: 6px;
    text-align: center;
    min-width: 150px;
    transition: all 0.3s;
    font-size: 0.85rem;
  }
  .dag-node.active {
    border-color: var(--primary-light);
    box-shadow: 0 0 0 3px var(--accent-border);
    transform: scale(1.02);
  }
  .dag-node.done {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.05);
  }
  .dag-arrow {
    font-size: 1.5rem;
    color: var(--nav-link-color);
    user-select: none;
  }
`, 'Run a deterministic three-node graph through the real browser-safe Executor API.', '/demo/')}
<body>
  ${renderHeader('demo')}

  <main id="main-content" class="content-shell content-shell--narrow">
    <h1>In-memory execution demo</h1>
    <p>
      This deterministic walkthrough executes a Directed Acyclic Graph directly in the browser with
      <code>symbiote-engine/browser</code> and the real <code>Executor.run</code> API. It uses fixed local values and makes no filesystem, network or server calls. It demonstrates execution—not isolation or sandboxing.
    </p>

    <div class="demo-container">
      <div class="controls-panel">
        <h2 style="margin-top: 0;">1. Execution Parameters</h2>
        <p style="font-size: 0.9rem; color: var(--nav-link-color); margin-top: -0.5rem;">
          Configure cache strategies and behavior settings to simulate engine resolutions.
        </p>

        <div style="display: flex; gap: 1.5rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: var(--text-color);">
            <input type="checkbox" id="param-cache" checked style="cursor: pointer;">
            <span style="font-weight: 600;">Reuse unchanged node outputs</span>
          </label>

          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: var(--text-color);">
            <input type="checkbox" id="param-delay" checked style="cursor: pointer;">
            <span style="font-weight: 600;">Add a real 300 ms process delay per node</span>
          </label>

          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: var(--text-color);">
            <input type="checkbox" id="param-force" style="cursor: pointer;">
            <span style="font-weight: 600;">Force this run (ignore incremental cache)</span>
          </label>
        </div>

        <div style="display: flex; gap: 1rem; align-items: center;">
          <button class="btn-run" id="btn-run-dag">Run DAG Walkthrough</button>
          <button class="btn-run" id="btn-clear-cache" style="background: none; border: 1px solid var(--border-color); color: var(--text-color);">Clear Cache Memory</button>
        </div>
      </div>

      <h2>2. Topological Layout</h2>
      <div class="visual-dag">
        <div class="dag-node" id="node-math1">
          <strong>Node A</strong><br>
          <span style="font-size: 0.8rem; color: var(--nav-link-color);">demo/math_add</span><br>
          <code>10 + 20</code>
        </div>
        <div class="dag-arrow">&rarr;</div>
        <div class="dag-node" id="node-math2">
          <strong>Node B</strong><br>
          <span style="font-size: 0.8rem; color: var(--nav-link-color);">demo/math_add</span><br>
          <code>(A) + 12</code>
        </div>
        <div class="dag-arrow">&rarr;</div>
        <div class="dag-node" id="node-fmt1">
          <strong>Node C</strong><br>
          <span style="font-size: 0.8rem; color: var(--nav-link-color);">demo/text_fmt</span><br>
          <code>Format "Result is: B"</code>
        </div>
      </div>

      <h2>3. Console Terminal logs</h2>
      <div class="terminal-console" id="demo-output">
        <div class="terminal-line terminal-info">System initialized. Click "Run DAG Walkthrough" to trigger execution...</div>
      </div>
    </div>
  </main>

  ${renderFooter()}
  ${renderScripts()}
  <script type="module" src="./index.js"></script>
</body>
</html>
`;
