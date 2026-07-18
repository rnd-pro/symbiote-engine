import fs from 'fs';
import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { pathToFileURL } from 'node:url';

test('site-completion: docs use route-scoped Symbiote UI bundles', () => {
  const gettingStarted = fs.readFileSync('_site/docs/getting-started/index.html', 'utf8');
  const guide = fs.readFileSync('_site/docs/guide/index.html', 'utf8');
  const docsSource = fs.readFileSync('site/docs/shell.js', 'utf8');

  assert.match(gettingStarted, /<script[^>]+src=["']?[^ >]*\/docs\/node-preview\/index\.js/);
  assert.doesNotMatch(gettingStarted, /<script[^>]+src=["']?[^ >]*\/docs\/index\.js/);
  assert.match(guide, /<script[^>]+src=["']?[^ >]*\/docs\/index\.js/);
  assert.doesNotMatch(guide, /<script[^>]+src=["']?[^ >]*\/docs\/node-preview\/index\.js/);
  assert.ok(
    docsSource.indexOf('fallback.replaceWith(wrapper)') < docsSource.indexOf('enhanced.setContent(code.textContent, lang)'),
    'CodeBlock content is set after the component is connected',
  );
});

test('site-completion: header search is a local keyboard-accessible dialog', () => {
  const landing = fs.readFileSync('_site/index.html', 'utf8');
  const gettingStarted = fs.readFileSync('_site/docs/getting-started/index.html', 'utf8');
  const searchSource = fs.readFileSync('site/search/index.js', 'utf8');
  const searchOutput = fs.readFileSync('_site/search/index.js', 'utf8');
  const docsSource = fs.readFileSync('site/docs/shell.js', 'utf8');

  for (const page of [landing, gettingStarted]) {
    assert.match(page, /data-search-open/);
    assert.match(page, /<dialog[^>]+data-site-search-dialog/);
    assert.match(page, /\/symbiote-engine\/search\/index\.js/);
  }
  assert.ok(searchOutput.length < searchSource.length, 'Search client is minified');
  assert.match(searchSource, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(searchSource, /event\.key\.toLocaleLowerCase\(\) === 'k'/);
  assert.match(docsSource, /code-block\.docs-code-enhanced \.cb-pre/);
  assert.match(docsSource, /border:\s*0/);
  assert.match(docsSource, /background:\s*transparent/);
});

test('site-completion: a chapter animation is consumed after its first intersection', async () => {
  const originalDescriptors = new Map(
    ['document', 'matchMedia', 'IntersectionObserver', 'setTimeout', 'clearTimeout']
      .map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const classes = new Set();
  const chapter = {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
    },
  };
  let intersectionCallback;
  let settleCallback;
  const unobserved = [];

  globalThis.document = {
    documentElement: { classList: chapter.classList },
    querySelectorAll: () => [chapter],
  };
  globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {} });
  globalThis.IntersectionObserver = class {
    constructor(callback) { intersectionCallback = callback; }
    observe() {}
    unobserve(element) { unobserved.push(element); }
    disconnect() {}
  };
  globalThis.setTimeout = (callback, delay) => {
    assert.equal(delay, 4000);
    settleCallback = callback;
    return 1;
  };
  globalThis.clearTimeout = () => {};

  try {
    const moduleUrl = pathToFileURL(path.join(process.cwd(), 'site/animation/index.js'));
    await import(`${moduleUrl.href}?test=${Date.now()}`);
    intersectionCallback([{ isIntersecting: true, target: chapter }]);
    assert.ok(classes.has('is-revealed'));
    assert.ok(classes.has('is-playing'));
    assert.deepEqual(unobserved, [chapter]);

    intersectionCallback([{ isIntersecting: false, target: chapter }]);
    intersectionCallback([{ isIntersecting: true, target: chapter }]);
    assert.deepEqual(unobserved, [chapter]);

    settleCallback();
    assert.ok(classes.has('is-played'));
    assert.ok(!classes.has('is-playing'));
  } finally {
    for (const [name, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('site-completion: animation delays and durations', async (t) => {
  const builtHtmlPath = path.join(process.cwd(), '_site', 'index.html');
  const sourceHtmlJsPath = path.join(process.cwd(), 'site', 'index.html.js');

  const content = fs.existsSync(builtHtmlPath)
    ? fs.readFileSync(builtHtmlPath, 'utf8')
    : fs.readFileSync(sourceHtmlJsPath, 'utf8');

  function parseTime(str) {
    if (!str) return 0;
    const m = str.trim().match(/^(-?\d*\.?\d+)(s|ms)$/i);
    if (!m) return 0;
    const val = parseFloat(m[1]);
    return m[2].toLowerCase() === 'ms' ? val / 1000 : val;
  }

  // 1. Parse every landing animation: shorthand
  const animationRegex = /animation:\s*([^;}<]+)/ig;
  let match;
  let animations = [];
  while ((match = animationRegex.exec(content)) !== null) {
    const anim = match[1].trim();
    if (anim && anim !== 'none') {
      animations.push(anim);
    }
  }

  for (const anim of animations) {
    assert.ok(!anim.includes('infinite'), `Animation should not be infinite: ${anim}`);

    const parts = anim.split(/\s+/);
    const times = parts.filter(p => /^(-?\d*\.?\d+)(s|ms)$/i.test(p));

    let duration = 0;
    let delay = 0;
    if (times.length > 0) duration = parseTime(times[0]);
    if (times.length > 1) delay = parseTime(times[1]);

    const positiveDelay = Math.max(0, delay);
    assert.ok(
      duration + positiveDelay <= 4,
      `duration + positive delay should be <= 4s. Found ${duration}s + ${positiveDelay}s in: ${anim}`
    );
  }

  function extractDelay(identifier) {
    let foundDelay = null;

    // Strategy 1: Check CSS rules
    const cssRegex = new RegExp(`${identifier}[^\\{\\}<>]+\\{([^\\}]+)\\}`, 'ig');
    let m;
    while ((m = cssRegex.exec(content)) !== null) {
      const block = m[1];
      const delayMatch = block.match(/animation-delay:\s*([^;]+)/i);
      if (delayMatch) {
        foundDelay = parseTime(delayMatch[1]);
      }
      const animMatch = block.match(/animation:\s*([^;]+)/i);
      if (animMatch && animMatch[1].trim() !== 'none') {
        const parts = animMatch[1].trim().split(/\s+/);
        const times = parts.filter(p => /^(-?\d*\.?\d+)(s|ms)$/i.test(p));
        if (times.length > 1 && foundDelay === null) {
          foundDelay = parseTime(times[1]);
        } else if (times.length === 1 && foundDelay === null) {
          foundDelay = 0;
        }
      }
    }

    // Strategy 2: Check HTML inline styles
    const htmlRegex = new RegExp(`<[^>]*${identifier}[^>]*>`, 'ig');
    while ((m = htmlRegex.exec(content)) !== null) {
      const tag = m[0];
      const delayMatch = tag.match(/style="[^"]*animation-delay:\s*([^;"]+)/i);
      if (delayMatch) {
        foundDelay = parseTime(delayMatch[1]);
      }
      const animMatch = tag.match(/style="[^"]*animation:\s*([^;"]+)/i);
      if (animMatch && animMatch[1].trim() !== 'none') {
        const parts = animMatch[1].trim().split(/\s+/);
        const times = parts.filter(p => /^(-?\d*\.?\d+)(s|ms)$/i.test(p));
        if (times.length > 1 && foundDelay === null) {
          foundDelay = parseTime(times[1]);
        } else if (times.length === 1 && foundDelay === null) {
          foundDelay = 0;
        }
      }
    }

    return foundDelay;
  }

  // Check Chapter 02 distinct ordered delays
  const delay02Right = extractDelay('data-motion-accent="?slide-right"?');
  const delay02Left = extractDelay('data-motion-accent="?slide-left"?');

  assert.ok(delay02Right !== null, "Chapter 02 slide-right should have a delay definition");
  assert.ok(delay02Left !== null, "Chapter 02 slide-left should have a delay definition");


  // Check Chapter 03 distinct ordered delays
  const delay03Reuse = extractDelay('data-route="?reuse"?');
  const delay03Execute = extractDelay('data-route="?execute"?');

  assert.ok(delay03Reuse !== null, "Chapter 03 reuse should have a delay definition");
  assert.ok(delay03Execute !== null, "Chapter 03 execute should have a delay definition");
  assert.notStrictEqual(delay03Reuse, delay03Execute, "Chapter 03 reuse/execute should have distinct ordered delays");
});
