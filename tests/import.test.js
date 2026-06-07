import assert from 'node:assert/strict';
import { test } from 'node:test';

test('root engine API imports in Node', async () => {
  let engine = await import('../index.js');

  assert.equal(typeof engine.Graph, 'function');
  assert.equal(typeof engine.Executor, 'function');
  assert.equal(typeof engine.loadHandlers, 'function');
  assert.equal(typeof engine.normalizeResourceTreeItem, 'function');
  assert.equal(typeof engine.normalizeSourceDocument, 'function');
  assert.equal(typeof engine.createPersistenceAdapter, 'function');
});

test('graph can be constructed without browser runtime', async () => {
  let { Graph } = await import('../Graph.js');
  let graph = new Graph();

  assert.ok(graph);
});

test('contracts entrypoint imports in Node', async () => {
  let contracts = await import('../contracts/index.js');

  assert.equal(typeof contracts.buildResourceTreeFromEntries, 'function');
  assert.equal(typeof contracts.createSourceDocument, 'function');
  assert.equal(typeof contracts.createMemoryPersistenceAdapter, 'function');
});

test('resource tree contract builds normalized nested file trees', async () => {
  let { buildResourceTreeFromEntries } = await import('../contracts/index.js');
  let tree = buildResourceTreeFromEntries([
    { path: 'src/index.js', icon: 'javascript', badges: ['1f'] },
    { path: 'src/components/Button.js', badges: ['1c'] },
    { path: 'README.md', muted: true },
  ]);

  assert.equal(tree[0].id, 'src');
  assert.equal(tree[0].kind, 'directory');
  assert.equal(tree[0].children[0].id, 'src/components');
  assert.equal(tree[0].children[1].id, 'src/index.js');
  assert.deepEqual(tree[0].children[1].badges, ['1f']);
  assert.equal(tree[1].id, 'README.md');
  assert.equal(tree[1].muted, true);
});

test('source document and persistence contracts normalize host data', async () => {
  let {
    createMemoryPersistenceAdapter,
    createSourceDocument,
    normalizeSourceDocument,
  } = await import('../contracts/index.js');

  let document = createSourceDocument(
    { code: 'export const ok = true;', raw: 'export const ok = true;' },
    {
      path: 'src/index.js',
      language: 'js',
      readable: true,
      diagnostics: [{ message: 'ok', severity: 'info' }],
      saveAction: {
        id: 'save-source',
        label: 'Save',
        intent: 'source:save',
        payload: { path: 'src/index.js' },
      },
      syntaxTheme: {
        id: 'agent-dark',
        tokens: {
          keyword: 'var(--sn-syntax-keyword)',
          string: 'var(--sn-syntax-string)',
        },
      },
    }
  );
  assert.equal(document.path, 'src/index.js');
  assert.equal(document.language, 'js');
  assert.equal(document.content, 'export const ok = true;');
  assert.equal(document.readable, true);
  assert.equal(document.diagnostics[0].message, 'ok');
  assert.deepEqual(document.saveAction, {
    id: 'save-source',
    label: 'Save',
    intent: 'source:save',
    payload: { path: 'src/index.js' },
  });
  assert.deepEqual(document.syntaxTokens, {
    keyword: 'var(--sn-syntax-keyword)',
    string: 'var(--sn-syntax-string)',
  });
  assert.deepEqual(document.syntaxTheme, {
    id: 'agent-dark',
    tokens: {
      keyword: 'var(--sn-syntax-keyword)',
      string: 'var(--sn-syntax-string)',
    },
  });

  let contentOnly = createSourceDocument(
    { code: 'const local = true;' },
    { path: 'src/local.js', language: 'js' }
  );
  assert.equal(contentOnly.content, 'const local = true;');
  assert.equal(contentOnly.raw, 'const local = true;');

  let saveString = normalizeSourceDocument({
    path: 'README.md',
    content: '# Readme',
    saveAction: 'save-doc',
    syntaxTokens: {
      comment: 'var(--sn-syntax-comment)',
      empty: '',
    },
  });
  assert.deepEqual(saveString.saveAction, { id: 'save-doc', label: 'save-doc' });
  assert.deepEqual(saveString.syntaxTheme, {
    tokens: {
      comment: 'var(--sn-syntax-comment)',
    },
  });

  assert.throws(() => normalizeSourceDocument({ content: 'missing path' }), /path is required/);

  let adapter = createMemoryPersistenceAdapter({ a: 1 });
  assert.equal(await adapter.get('a'), 1);
  await adapter.set('b', 2);
  assert.deepEqual(await adapter.list(''), ['a', 'b']);
  assert.equal(await adapter.delete('a'), true);
});
