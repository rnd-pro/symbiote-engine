import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  createRenderProviderRegistry,
  normalizeAudioProviderDescriptor,
  normalizeRenderArtifact,
  normalizeRenderProvider,
} from '../contracts/render-provider.js';
import { createLocalBrowserScreencastProvider } from '../providers/local-browser-screencast.js';

test('render provider contract validates providers and rejects duplicate ids', async () => {
  let first = {
    id: 'browser-headless-screencast',
    kind: 'screencast',
    execute: async () => ({
      path: '/tmp/out.mp4',
      frames: 2,
      fps: 12,
      durationSec: 1,
      width: 1280,
      height: 720,
    }),
  };
  let registry = createRenderProviderRegistry([first]);

  assert.deepEqual(registry.list(), [{ id: 'browser-headless-screencast', kind: 'screencast' }]);
  assert.equal(registry.get('browser-headless-screencast').id, 'browser-headless-screencast');
  assert.throws(() => registry.register(first), /duplicate provider/);
  assert.throws(() => normalizeRenderProvider({ id: 'x', kind: 'audio' }), /unsupported kind/);
});

test('render provider registry executes the selected provider and normalizes metadata', async () => {
  let calls = [];
  let registry = createRenderProviderRegistry([
    {
      id: 'a',
      kind: 'screencast',
      execute: async () => {
        calls.push('a');
        return {
          path: '/tmp/a.mp4',
          kind: 'screencast',
          providerId: 'a',
          frames: 2,
          fps: 24,
          durationSec: 0.5,
          width: 640,
          height: 360,
          ignored: true,
        };
      },
    },
    {
      id: 'b',
      kind: 'screencast',
      execute: async () => {
        calls.push('b');
        throw new Error('wrong provider');
      },
    },
  ]);

  let result = await registry.execute({
    id: 'job-1',
    kind: 'screencast',
    providerId: 'a',
  });

  assert.deepEqual(calls, ['a']);
  assert.deepEqual(result, {
    path: '/tmp/a.mp4',
    kind: 'screencast',
    providerId: 'a',
    frames: 2,
    fps: 24,
    durationSec: 0.5,
    width: 640,
    height: 360,
  });
  await assert.rejects(() => registry.execute({ kind: 'screencast', providerId: 'missing' }), /unknown provider/);
});

test('render and audio provider descriptors fail fast without fake audio execution', () => {
  assert.deepEqual(
    normalizeRenderArtifact({
      path: '/tmp/out.mp4',
      kind: 'screencast',
      providerId: 'p',
      frames: 12,
      fps: 12,
      durationSec: 1,
      width: 1280,
      height: 720,
    }),
    {
      path: '/tmp/out.mp4',
      kind: 'screencast',
      providerId: 'p',
      frames: 12,
      fps: 12,
      durationSec: 1,
      width: 1280,
      height: 720,
    },
  );
  assert.deepEqual(
    normalizeAudioProviderDescriptor({ id: 'browser', kind: 'browser-tts' }),
    { id: 'browser', kind: 'browser-tts' },
  );
  assert.throws(
    () => normalizeAudioProviderDescriptor({ id: 'fake', kind: 'unsupported-audio' }),
    /unsupported kind/,
  );
});

test('render provider contract stays browser-safe while local provider stays Node-only', async () => {
  let contractsDir = new URL('../contracts/', import.meta.url);
  for (let file of await readdir(contractsDir)) {
    if (!file.endsWith('.js')) continue;
    let source = await readFile(new URL(file, contractsDir), 'utf8');
    assert.doesNotMatch(source, /from ['"]node:/, `${file} must not import node:*`);
  }

  let browserSource = await readFile(new URL('../browser.js', import.meta.url), 'utf8');
  assert.doesNotMatch(browserSource, /local-browser-screencast/);
  let browser = await import('../browser.js');
  assert.equal(browser.createLocalBrowserScreencastProvider, undefined);
});

test('local browser provider keeps product row filters in the manifest', async () => {
  let source = await readFile(new URL('../providers/local-browser-screencast.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /DESCRIPTION|STATUS|unfold_more/);
  assert.match(source, /excludeTextPattern/);
});

test('package metadata publishes provider subpaths', async () => {
  let pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(pkg.exports['./providers/*'], './providers/*');
  assert.ok(pkg.files.includes('providers/'));
});

test('local browser screencast provider requires injected dependencies', () => {
  assert.throws(
    () => createLocalBrowserScreencastProvider({}),
    /requires injected puppeteer\.launch/,
  );
  assert.throws(
    () => createLocalBrowserScreencastProvider({ puppeteer: { launch() {} }, execFile: null }),
    /requires execFile function/,
  );
});

test('local browser screencast provider runs with injected browser and ffmpeg', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-render-provider-'));
  let progress = [];
  let execCalls = [];
  let closed = false;
  let page = {
    mouse: { click: async () => {} },
    async setViewport(viewport) {
      this.viewport = viewport;
    },
    async goto(url) {
      this.url = url;
    },
    async screenshot(options) {
      this.lastScreenshot = options.path;
    },
  };
  let puppeteer = {
    async launch(options) {
      return {
        options,
        async newPage() {
          return page;
        },
        async close() {
          closed = true;
        },
      };
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer,
    cwd: tmp,
    framesRoot: tmp,
    execFile: async (file, args, options) => {
      execCalls.push({ file, args, options });
    },
  });

  let result = await provider.execute({
    id: 'unit',
    output: { path: 'out/unit.mp4' },
    surface: { url: 'http://example.test/' },
    video: {
      width: 320,
      height: 180,
      fps: 1000,
      durationMs: 2,
      frameCount: 2,
    },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
  }, {
    onProgress(event) {
      progress.push(event.frame);
    },
  });

  assert.equal(page.url, 'http://example.test/');
  assert.deepEqual(progress, [1, 2]);
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].file, 'ffmpeg');
  assert.ok(execCalls[0].args.includes(join(tmp, 'out/unit.mp4')));
  assert.equal(closed, true);
  assert.deepEqual(result, {
    path: join(tmp, 'out/unit.mp4'),
    kind: 'screencast',
    providerId: 'browser-headless-screencast',
    frames: 2,
    fps: 1000,
    durationSec: 0.002,
    width: 320,
    height: 180,
  });
});
