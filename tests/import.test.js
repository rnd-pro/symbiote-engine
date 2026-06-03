import assert from 'node:assert/strict';
import { test } from 'node:test';

test('root engine API imports in Node', async () => {
  let engine = await import('../index.js');

  assert.equal(typeof engine.Graph, 'function');
  assert.equal(typeof engine.Executor, 'function');
  assert.equal(typeof engine.loadHandlers, 'function');
});

test('graph can be constructed without browser runtime', async () => {
  let { Graph } = await import('../Graph.js');
  let graph = new Graph();

  assert.ok(graph);
});
