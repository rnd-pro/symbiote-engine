import { execFile as nodeExecFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { normalizeRenderArtifact } from '../contracts/render-provider.js';

const defaultExecFile = promisify(nodeExecFile);

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, Math.max(0, ms)));
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function positiveNumber(value, fallback, path) {
  let number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${path}: must be a positive number`);
  }
  return number;
}

function resolvePath(cwd, filePath, pathName) {
  let value = cleanString(filePath, '');
  if (!value) throw new Error(`${pathName}: is required`);
  return resolve(cwd, value);
}

function safeId(value) {
  return cleanString(value, 'screencast').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'screencast';
}

function validateRegexPattern(pattern, path) {
  let source = cleanString(pattern, '');
  if (!source) return;
  try {
    new RegExp(source, 'i');
  } catch (error) {
    throw new Error(`${path}: invalid regular expression: ${error.message}`);
  }
}

async function waitForText(page, text, timeoutMs = 10000) {
  await page.waitForFunction(
    (needle) => (document.body?.innerText || '').includes(needle),
    { timeout: timeoutMs },
    text,
  );
}

async function clickText(page, text, { exact = false } = {}) {
  let handles = await page.$$('button,[role="button"],a,input,textarea,[tabindex]');
  for (let handle of handles) {
    let matched = await handle.evaluate((el, { text: needle, exact: exactMatch }) => {
      let style = getComputedStyle(el);
      let rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return false;
      let clean = String(el.innerText || el.textContent || el.value || '').replace(/\s+/g, ' ').trim();
      return exactMatch ? clean === needle : clean.includes(needle);
    }, { text, exact });
    if (!matched) {
      await handle.dispose();
      continue;
    }
    await handle.click({ delay: 20 });
    for (let other of handles) {
      if (other !== handle) await other.dispose();
    }
    await handle.dispose();
    return;
  }
  throw new Error(`clickText target not found: ${text}`);
}

async function clickRowText(page, action) {
  let rect = await page.evaluate(({ text: needle, selector, excludeTextPattern }) => {
    let excludePattern = excludeTextPattern ? new RegExp(excludeTextPattern, 'i') : null;
    let rows = Array.from(document.querySelectorAll(selector || 'tr,[role="row"]'));
    let target = rows.find((el) => {
      let style = getComputedStyle(el);
      let box = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) return false;
      let text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || (excludePattern && excludePattern.test(text))) return false;
      return text.includes(needle);
    });
    if (!target) return null;
    let box = target.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, action);
  if (!rect) throw new Error(`clickRowText target not found: ${action.text}`);
  await page.mouse.click(rect.x, rect.y, { delay: 20 });
}

async function clickRowIndex(page, action) {
  let rect = await page.evaluate(({ rowIndex, selector, excludeTextPattern }) => {
    let excludePattern = excludeTextPattern ? new RegExp(excludeTextPattern, 'i') : null;
    let rows = Array.from(document.querySelectorAll(selector || 'tr,[role="row"]'))
      .filter((el) => {
        let style = getComputedStyle(el);
        let rect = el.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return false;
        let text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        return text && (!excludePattern || !excludePattern.test(text));
      });
    let target = rows[rowIndex];
    if (!target) return null;
    let box = target.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, action);
  if (!rect) throw new Error(`clickRowIndex target not found: ${action.rowIndex}`);
  await page.mouse.click(rect.x, rect.y, { delay: 20 });
}

async function executeAction(page, action, log) {
  if (action.type === 'waitMs') {
    await sleep(action.durationMs);
    return;
  }
  if (action.type === 'waitForText') {
    log(`wait text: ${action.text}`);
    await waitForText(page, action.text, action.timeoutMs || 10000);
    return;
  }
  if (action.type === 'waitForSelector') {
    log(`wait selector: ${action.selector}`);
    await page.waitForSelector(action.selector, { timeout: action.timeoutMs || 10000 });
    return;
  }
  if (action.type === 'clickText') {
    log(`click text: ${action.text}`);
    await clickText(page, action.text, { exact: action.exact });
    return;
  }
  if (action.type === 'clickSelector') {
    log(`click selector: ${action.selector}`);
    await page.click(action.selector);
    return;
  }
  if (action.type === 'clickRowText') {
    log(`click row: ${action.text}`);
    validateRegexPattern(action.excludeTextPattern, 'clickRowText.excludeTextPattern');
    await clickRowText(page, action);
    return;
  }
  if (action.type === 'clickRowIndex') {
    log(`click row index: ${action.rowIndex}`);
    validateRegexPattern(action.excludeTextPattern, 'clickRowIndex.excludeTextPattern');
    await clickRowIndex(page, action);
    return;
  }
  throw new Error(`Unsupported screencast action: ${action.type}`);
}

async function installCaptionOverlay(page) {
  await page.evaluate(() => {
    if (document.getElementById('sym-screencast-caption-style')) return;
    let style = document.createElement('style');
    style.id = 'sym-screencast-caption-style';
    style.textContent = `
      .sym-screencast-caption {
        position: fixed;
        left: 50%;
        bottom: 18px;
        z-index: 2147483647;
        width: min(760px, calc(100vw - 48px));
        transform: translateX(-50%);
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 14px;
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 8px;
        background: rgba(8, 12, 18, 0.86);
        color: #f8fafc;
        box-shadow: 0 16px 42px rgba(0,0,0,0.35);
        font: 600 15px/1.35 Inter, system-ui, sans-serif;
        pointer-events: none;
      }
      .sym-screencast-caption[hidden] { display: none !important; }
      .sym-screencast-caption__speaker {
        flex: 0 0 auto;
        color: #8fd3ff;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .sym-screencast-caption__text { min-width: 0; }
    `;
    document.head.appendChild(style);

    let caption = document.createElement('div');
    caption.id = 'sym-screencast-caption';
    caption.className = 'sym-screencast-caption';
    caption.hidden = true;
    caption.innerHTML = '<span class="sym-screencast-caption__speaker"></span><span class="sym-screencast-caption__text"></span>';
    document.body.appendChild(caption);
  });
}

async function setCaption(page, cue) {
  await page.evaluate((nextCue) => {
    let caption = document.getElementById('sym-screencast-caption');
    if (!caption) return;
    if (!nextCue) {
      caption.hidden = true;
      return;
    }
    caption.hidden = false;
    caption.querySelector('.sym-screencast-caption__speaker').textContent = nextCue.speaker || 'Agent';
    caption.querySelector('.sym-screencast-caption__text').textContent = nextCue.text || '';
  }, cue);
}

function captionAt(captions, elapsedMs) {
  if (!captions?.enabled) return null;
  return captions.cues.find((cue) => elapsedMs >= cue.startMs && elapsedMs < cue.endMs) || null;
}

function normalizeVideo(video = {}) {
  let fps = positiveNumber(video.fps, undefined, 'renderJob.video.fps');
  let durationMs = positiveNumber(video.durationMs, undefined, 'renderJob.video.durationMs');
  return {
    width: Math.round(positiveNumber(video.width, undefined, 'renderJob.video.width')),
    height: Math.round(positiveNumber(video.height, undefined, 'renderJob.video.height')),
    fps,
    durationMs,
    frameCount: Math.round(positiveNumber(video.frameCount, (durationMs / 1000) * fps, 'renderJob.video.frameCount')),
  };
}

function createFramesDir(root, id) {
  return join(root || join(os.tmpdir(), 'symbiote-engine-render'), `${safeId(id)}-${Date.now()}`);
}

export function createLocalBrowserScreencastProvider(options = {}) {
  let { puppeteer, ffmpegPath = 'ffmpeg', execFile = defaultExecFile, cwd = process.cwd(), framesRoot } = options;
  if (!puppeteer || typeof puppeteer.launch !== 'function') {
    throw new Error('local-browser-screencast requires injected puppeteer.launch');
  }
  if (typeof execFile !== 'function') {
    throw new Error('local-browser-screencast requires execFile function');
  }
  let providerId = cleanString(options.id, 'browser-headless-screencast') || 'browser-headless-screencast';

  return {
    id: providerId,
    kind: 'screencast',
    async execute(job, executionOptions = {}) {
      let log = executionOptions.verbose ? console.log.bind(console) : () => {};
      let output = resolvePath(cwd, executionOptions.output || job.output?.path, 'renderJob.output.path');
      let outputDir = dirname(output);
      await mkdir(outputDir, { recursive: true });

      let video = normalizeVideo(job.video);
      let framesDir = executionOptions.framesDir || createFramesDir(framesRoot, job.id);
      await rm(framesDir, { recursive: true, force: true });
      await mkdir(framesDir, { recursive: true });

      let browser = await puppeteer.launch({
        headless: true,
        args: [
          `--window-size=${video.width},${video.height}`,
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });

      try {
        let page = await browser.newPage();
        await page.setViewport({
          width: video.width,
          height: video.height,
          deviceScaleFactor: 1,
        });
        await page.goto(job.surface.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        for (let action of job.setup || []) {
          await executeAction(page, action, log);
        }

        if (job.captions?.enabled) {
          await installCaptionOverlay(page);
        }

        let actions = [...(job.timeline || [])].sort((a, b) => a.atMs - b.atMs);
        let nextActionIndex = 0;
        let lastCaptionKey = '';
        let frameIntervalMs = 1000 / video.fps;
        let startedAt = Date.now();

        for (let frame = 0; frame < video.frameCount; frame += 1) {
          let elapsedMs = frame * frameIntervalMs;
          while (nextActionIndex < actions.length && actions[nextActionIndex].atMs <= elapsedMs) {
            await executeAction(page, actions[nextActionIndex], log);
            nextActionIndex += 1;
          }

          let caption = captionAt(job.captions, elapsedMs);
          let captionKey = caption ? `${caption.speaker}:${caption.text}` : '';
          if (captionKey !== lastCaptionKey) {
            await setCaption(page, caption);
            lastCaptionKey = captionKey;
          }

          await page.screenshot({
            path: join(framesDir, `frame-${String(frame).padStart(5, '0')}.png`),
            fullPage: false,
          });

          if (typeof executionOptions.onProgress === 'function') {
            executionOptions.onProgress({ frame: frame + 1, frames: video.frameCount });
          }

          await sleep(startedAt + (frame + 1) * frameIntervalMs - Date.now());
        }

        await execFile(ffmpegPath, [
          '-y',
          '-framerate', String(video.fps),
          '-i', join(framesDir, 'frame-%05d.png'),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '18',
          '-pix_fmt', 'yuv420p',
          '-vf', `scale=${video.width}:${video.height}`,
          output,
        ], { cwd });

        if (!executionOptions.keepFrames) {
          await rm(framesDir, { recursive: true, force: true });
        } else {
          log(`Frames kept in: ${framesDir}`);
        }

        return normalizeRenderArtifact({
          path: output,
          kind: 'screencast',
          providerId,
          frames: video.frameCount,
          fps: video.fps,
          durationSec: video.durationMs / 1000,
          width: video.width,
          height: video.height,
        });
      } finally {
        await browser.close().catch(() => {});
      }
    },
  };
}
