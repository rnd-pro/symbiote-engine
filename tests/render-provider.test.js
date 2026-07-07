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

test('render artifact contract supports ordered frame-sequence metadata', () => {
  assert.deepEqual(
    normalizeRenderArtifact({
      kind: 'frame-sequence',
      providerId: 'browser-headless-screencast',
      frames: 2,
      fps: 24,
      durationSec: 0.5,
      width: 640,
      height: 360,
      framesDir: '/tmp/frames',
      framePattern: 'frame-%05d.png',
      mimeType: 'image/png',
      frameFiles: [
        { index: 0, path: '/tmp/frames/frame-00000.png', elapsedMs: 0 },
        { index: 1, path: '/tmp/frames/frame-00001.png', elapsedMs: 42 },
      ],
      source: { url: 'http://127.0.0.1:4570/?surface=media-studio' },
    }),
    {
      kind: 'frame-sequence',
      providerId: 'browser-headless-screencast',
      frames: 2,
      fps: 24,
      durationSec: 0.5,
      width: 640,
      height: 360,
      framesDir: '/tmp/frames',
      framePattern: 'frame-%05d.png',
      mimeType: 'image/png',
      frameFiles: [
        { index: 0, path: '/tmp/frames/frame-00000.png', elapsedMs: 0, mimeType: 'image/png' },
        { index: 1, path: '/tmp/frames/frame-00001.png', elapsedMs: 42, mimeType: 'image/png' },
      ],
      source: { url: 'http://127.0.0.1:4570/?surface=media-studio' },
    },
  );
  assert.throws(
    () => normalizeRenderArtifact({
      kind: 'frame-sequence',
      providerId: 'p',
      frames: 2,
      fps: 24,
      durationSec: 0.5,
      width: 640,
      height: 360,
      framesDir: '/tmp/frames',
      frameFiles: [{ path: '/tmp/frames/frame-00000.png' }],
    }),
    /renderArtifact\.frameFiles: must include 2 frame records/,
  );
  assert.throws(
    () => normalizeRenderArtifact({
      kind: 'frame-sequence',
      providerId: 'p',
      frames: 1,
      fps: 24,
      durationSec: 0.5,
      width: 640,
      height: 360,
      framesDir: '/tmp/frames',
      frameFiles: [{ path: '/tmp/frames/frame-00000.png' }],
    }),
    /renderArtifact\.source\.url: is required/,
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
  assert.equal(pkg.exports['./render-captions'], './render-captions.js');
  assert.equal(pkg.exports['./render-progress'], './render-progress.js');
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
  let stages = [];
  let execCalls = [];
  let closed = false;
  let launchOptions = null;
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
      launchOptions = options;
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

  let job = {
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
    cleanup: { retainPaths: [] },
  };
  let result = await provider.execute(job, {
    browserProfileRoot: tmp,
    onStage(event) {
      stages.push(event.stage);
    },
    onProgress(event) {
      progress.push(event.frame);
    },
  });

  assert.equal(page.url, 'http://example.test/');
  assert.deepEqual(progress, [1, 2]);
  assert.deepEqual(stages.filter((stage) => [
    'frames:prepare',
    'browser:launch',
    'browser:navigate',
    'setup:start',
    'capture:start',
    'capture:done',
    'encode:start',
    'encode:done',
    'screencast:done',
  ].includes(stage)), [
    'frames:prepare',
    'browser:launch',
    'browser:navigate',
    'setup:start',
    'capture:start',
    'capture:done',
    'encode:start',
    'encode:done',
    'screencast:done',
  ]);
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].file, 'ffmpeg');
  assert.ok(execCalls[0].args.includes(join(tmp, 'out/unit.mp4')));
  assert.ok(launchOptions.userDataDir.startsWith(tmp));
  assert.deepEqual(job.cleanup.browserProfilePaths, [launchOptions.userDataDir]);
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

test('local browser screencast provider can return a frame-sequence artifact without ffmpeg', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-frame-sequence-'));
  let progress = [];
  let stages = [];
  let execCalls = [];
  let screenshotPaths = [];
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
      screenshotPaths.push(options.path);
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        return {
          async newPage() { return page; },
          async close() { closed = true; },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async (...args) => {
      execCalls.push(args);
    },
  });

  let result = await provider.execute({
    id: 'sequence-unit',
    output: { path: 'out/ignored-sequence.mp4' },
    surface: { url: 'http://example.test/media' },
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
    artifactKind: 'frame-sequence',
    onStage(event) {
      stages.push(event.stage);
    },
    onProgress(event) {
      progress.push(event);
    },
  });

  assert.equal(page.url, 'http://example.test/media');
  assert.equal(execCalls.length, 0);
  assert.equal(closed, true);
  assert.equal(result.kind, 'frame-sequence');
  assert.equal(result.providerId, 'browser-headless-screencast');
  assert.equal(result.frames, 2);
  assert.equal(result.path, undefined);
  assert.equal(result.framePattern, 'frame-%05d.png');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.source.url, 'http://example.test/media');
  assert.deepEqual(
    result.frameFiles.map((frame) => [frame.index, frame.path, frame.elapsedMs, frame.mimeType]),
    [
      [0, screenshotPaths[0], 0, 'image/png'],
      [1, screenshotPaths[1], 1, 'image/png'],
    ],
  );
  assert.deepEqual(progress.map((event) => [event.frame, event.frames, event.progress, event.stage]), [
    [1, 2, 0.5, 'capture'],
    [2, 2, 1, 'capture'],
  ]);
  assert.ok(stages.includes('frame-sequence:done'));
  assert.equal(stages.includes('encode:start'), false);
});

test('local browser screencast provider waits for document fonts before capture', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-font-readiness-'));
  let stageOrder = [];
  let calls = [];
  let page = {
    mouse: { click: async () => {} },
    async setViewport(viewport) {
      this.viewport = viewport;
    },
    async goto(url) {
      this.url = url;
    },
    async evaluate(_fn, payload) {
      calls.push(payload);
      return { supported: true, ready: true };
    },
    async screenshot(options) {
      stageOrder.push(`screenshot:${options.path}`);
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        return {
          async newPage() { return page; },
          async close() {},
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  });

  await provider.execute({
    id: 'font-ready-unit',
    output: { path: 'out/font-ready.mp4' },
    surface: { url: 'http://example.test/fonts' },
    video: {
      width: 320,
      height: 180,
      fps: 1000,
      durationMs: 1,
      frameCount: 1,
    },
    readiness: { fontsTimeoutMs: 5000 },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
  }, {
    artifactKind: 'frame-sequence',
    onStage(event) {
      stageOrder.push(event.stage);
    },
  });

  assert.deepEqual(calls, [{ timeoutMs: 5000 }]);
  assert.ok(stageOrder.indexOf('setup:done') < stageOrder.indexOf('fonts:wait'));
  assert.ok(stageOrder.indexOf('fonts:wait') < stageOrder.indexOf('fonts:ready'));
  assert.ok(stageOrder.indexOf('fonts:ready') < stageOrder.indexOf('capture:start'));
  assert.ok(stageOrder.indexOf('capture:start') < stageOrder.findIndex((stage) => stage.startsWith('screenshot:')));
});

test('local browser screencast provider aborts capture and closes browser', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-render-abort-'));
  let controller = new AbortController();
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
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        return {
          async newPage() { return page; },
          async close() { closed = true; },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async (...args) => {
      execCalls.push(args);
    },
  });

  await assert.rejects(
    () => provider.execute({
      id: 'abort-unit',
      output: { path: 'out/abort.mp4' },
      surface: { url: 'http://example.test/abort' },
      video: {
        width: 320,
        height: 180,
        fps: 1000,
        durationMs: 3,
        frameCount: 3,
      },
      setup: [],
      timeline: [],
      captions: { enabled: false, cues: [] },
    }, {
      signal: controller.signal,
      onProgress(event) {
        progress.push(event.frame);
        if (event.frame === 1) controller.abort('render cancel smoke');
      },
    }),
    /render cancel smoke/,
  );

  assert.equal(closed, true);
  assert.deepEqual(progress, [1]);
  assert.equal(execCalls.length, 0);
});

test('local browser screencast provider can call live page methods and capture state', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-render-provider-state-'));
  let waitCalls = [];
  let evaluateCalls = [];
  let closed = false;
  let page = {
    mouse: { click: async () => {} },
    async setViewport(viewport) {
      this.viewport = viewport;
    },
    async goto(url) {
      this.url = url;
    },
    async waitForFunction(_fn, _options, parts) {
      waitCalls.push(parts);
    },
    async evaluate(_fn, payload) {
      evaluateCalls.push(payload);
      if (Object.hasOwn(payload, 'args')) return { status: 'started' };
      return { status: 'playing', caption: { text: 'Live caption' } };
    },
    async screenshot(options) {
      this.lastScreenshot = options.path;
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        return {
          async newPage() { return page; },
          async close() { closed = true; },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  });

  await provider.execute({
    id: 'state-unit',
    output: { path: 'out/unit.mp4' },
    surface: { url: 'http://example.test/' },
    video: {
      width: 320,
      height: 180,
      fps: 1000,
      durationMs: 1,
      frameCount: 1,
    },
    setup: [
      { type: 'waitForWindowPredicate', path: '__maximoTourRender.ready' },
      { type: 'waitForWindowMethod', path: '__maximoTourRender.playProviderTour' },
      {
        type: 'callWindowMethod',
        path: '__maximoTourRender.playProviderTour',
        args: [{ cues: [{ startMs: 0, endMs: 1000, text: 'Live caption' }] }],
      },
    ],
    timeline: [],
    captions: { enabled: false, cues: [] },
    captureState: {
      enabled: true,
      path: '__maximoTourRender.getState',
      outputPath: 'out/state.json',
      sampleEveryFrames: 1,
    },
  });

  let state = JSON.parse(await readFile(join(tmp, 'out/state.json'), 'utf8'));
  assert.equal(page.url, 'http://example.test/');
  assert.deepEqual(waitCalls, [
    ['__maximoTourRender', 'ready'],
    ['__maximoTourRender', 'playProviderTour'],
    ['__maximoTourRender', 'playProviderTour'],
  ]);
  assert.equal(evaluateCalls.length, 3);
  assert.deepEqual(evaluateCalls[1], { timeoutMs: 10000 });
  assert.equal(state.samples.length, 1);
  assert.equal(state.samples[0].state.status, 'playing');
  assert.equal(state.samples[0].state.caption.text, 'Live caption');
  assert.equal(closed, true);
});

test('local browser screencast provider labels setup action failures', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-render-provider-setup-error-'));
  let closed = false;
  let page = {
    async setViewport() {},
    async goto() {},
    async waitForFunction() {
      throw new Error('not ready');
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        return {
          async newPage() { return page; },
          async close() { closed = true; },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  });

  await assert.rejects(
    () => provider.execute({
      id: 'setup-error-unit',
      output: { path: 'out/unit.mp4' },
      surface: { url: 'http://example.test/' },
      video: {
        width: 320,
        height: 180,
        fps: 1,
        durationMs: 1000,
        frameCount: 1,
      },
      setup: [
        { type: 'waitForWindowPredicate', path: '__maximoTourRender.ready' },
      ],
      timeline: [],
      captions: { enabled: false, cues: [] },
    }),
    /setup action 0 \(waitForWindowPredicate:__maximoTourRender\.ready\) failed: not ready/,
  );
  assert.equal(closed, true);
});
