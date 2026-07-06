import { createHash } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const CLEANUP_DELETE_KEYS = [
  'deletePaths',
  'tempPaths',
  'scratchPaths',
  'frameSequencePaths',
  'audioChunkPaths',
  'transcriptScratchPaths',
  'browserProfilePaths',
  'workerTempPaths',
  'providerTempPaths',
];

const CLEANUP_RETAIN_KEYS = [
  'retainPaths',
  'durablePaths',
  'cachePaths',
  'artifactPaths',
  'proofPaths',
  'reusableCachePaths',
];

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 32);
}

function compactObject(value) {
  if (Array.isArray(value)) {
    let compacted = value.map(compactObject).filter((item) => item !== undefined);
    return compacted.length ? compacted : undefined;
  }
  if (!isObject(value)) {
    if (value === undefined || value === null || value === '') return undefined;
    return value;
  }
  let entries = Object.entries(value)
    .map(([key, item]) => [key, compactObject(item)])
    .filter(([, item]) => item !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function pickSurface(seed) {
  let surface = isObject(seed.surface) ? seed.surface : {};
  let source = isObject(seed.source) ? seed.source : {};
  return compactObject({
    url: seed.url || source.url || surface.url,
    route: seed.route || source.route || surface.route,
    surface: seed.activeSurface || surface.surface || surface.id || seed.surfaceId,
    tab: seed.activeTab || surface.tab || surface.tabId || seed.tabId,
  });
}

function pickViewport(seed) {
  let viewport = isObject(seed.viewport) ? seed.viewport : {};
  let video = isObject(seed.video) ? seed.video : {};
  return compactObject({
    width: viewport.width || video.viewportWidth || video.width,
    height: viewport.height || video.viewportHeight || video.height,
  });
}

function pickOutput(seed) {
  let video = isObject(seed.video) ? seed.video : {};
  let output = isObject(seed.output) ? seed.output : {};
  return compactObject({
    width: output.width || video.outputWidth || video.width,
    height: output.height || video.outputHeight || video.height,
    fps: output.fps || video.fps,
  });
}

function frameCacheProjection(seed = {}, extra = {}) {
  let timeline = isObject(seed.timeline) ? seed.timeline : {};
  let render = isObject(seed.render) ? seed.render : {};
  let app = isObject(seed.app) ? seed.app : {};
  let data = isObject(seed.data) ? seed.data : {};
  let viewport = isObject(seed.viewport) ? seed.viewport : {};
  return compactObject({
    providerId: seed.providerId || render.providerId,
    renderer: seed.renderer || render.renderer || seed.renderProvider?.id,
    source: pickSurface(seed),
    theme: seed.theme || seed.cascadeTheme || render.theme,
    viewport: pickViewport(seed),
    dpr: seed.dpr || seed.deviceScaleFactor || viewport.dpr || viewport.deviceScaleFactor,
    output: pickOutput(seed),
    timelineHash: seed.timelineHash || timeline.hash || render.timelineHash,
    appBuild: seed.appBuild || seed.build || seed.version || app.build || app.version,
    dataHash: seed.dataHash || data.hash || data.version,
    capture: seed.capture || render.capture,
    providerSettings: seed.providerSettings || render.providerSettings,
    extra,
  }) || {};
}

function arrayFrom(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function collectCleanupPaths(cleanup, keys) {
  if (!isObject(cleanup)) return [];
  let paths = [];
  for (let key of keys) {
    for (let item of arrayFrom(cleanup[key])) {
      let text = cleanString(item, '');
      if (text) paths.push(text);
    }
  }
  return paths;
}

function cleanupSources(record) {
  let input = isObject(record?.input) ? record.input : {};
  let result = isObject(record?.result) ? record.result : {};
  return [
    input.cleanup,
    input.render?.cleanup,
    input.audio?.cleanup,
    input.whisper?.cleanup,
    input.frames?.cleanup,
    result.cleanup,
  ].filter(isObject);
}

function retainResultPaths(record) {
  let result = isObject(record?.result) ? record.result : {};
  return [
    result.path,
    result.outputPath,
    result.manifestPath,
    result.proofPath,
    result.vttPath,
    result.captionsPath,
    result.metadataPath,
  ].map((path) => cleanString(path, '')).filter(Boolean);
}

function normalizeRoot(root) {
  let text = cleanString(root, '');
  if (!text) throw new Error('render retention cleanup root is required');
  return resolve(text);
}

function pathInsideRoot(path, root) {
  let rel = relative(root, path);
  return rel === '' || Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
}

function pathContains(parent, child) {
  let rel = relative(parent, child);
  return rel === '' || Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
}

function resolveCleanupPath(path, root) {
  let text = cleanString(path, '');
  if (!text || /^[a-z]+:\/\//i.test(text) || text.startsWith('file:')) return null;
  return resolve(isAbsolute(text) ? text : resolve(root, text));
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function createRenderFrameCacheKey(seed = {}, extra = {}) {
  return `frame:${stableHash({
    version: 1,
    ...frameCacheProjection(seed, extra),
  })}`;
}

export function createMemoryFrameCacheStore(options = {}) {
  let entries = options.entries instanceof Map ? options.entries : new Map();
  return {
    async put(key, value, metadata = {}) {
      let cacheKey = cleanString(key, '');
      if (!cacheKey) throw new Error('frame cache key is required');
      let now = new Date().toISOString();
      let existing = entries.get(cacheKey);
      let entry = {
        key: cacheKey,
        value: cloneJson(value),
        metadata: cloneJson(metadata),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        hits: existing?.hits || 0,
      };
      entries.set(cacheKey, entry);
      return cloneJson(entry);
    },
    async get(key) {
      let cacheKey = cleanString(key, '');
      let entry = entries.get(cacheKey);
      if (!entry) return null;
      entry.hits += 1;
      entry.updatedAt = new Date().toISOString();
      return cloneJson(entry);
    },
    async has(key) {
      return entries.has(cleanString(key, ''));
    },
    async delete(key) {
      return entries.delete(cleanString(key, ''));
    },
    list() {
      return [...entries.values()].map(cloneJson);
    },
    clear() {
      entries.clear();
    },
  };
}

export function createRenderRetentionCleanup(options = {}) {
  let root = normalizeRoot(options.root);
  let allowOutsideRoot = options.allowOutsideRoot === true;
  let retainResultPath = options.retainResultPath !== false;

  return async function renderRetentionCleanup(record = {}, context = {}) {
    let sources = cleanupSources(record);
    let deletePaths = new Set();
    let retainPaths = new Set();

    for (let source of sources) {
      for (let path of collectCleanupPaths(source, CLEANUP_DELETE_KEYS)) deletePaths.add(path);
      for (let path of collectCleanupPaths(source, CLEANUP_RETAIN_KEYS)) retainPaths.add(path);
    }
    if (retainResultPath) {
      for (let path of retainResultPaths(record)) retainPaths.add(path);
    }

    let retained = [...retainPaths]
      .map((path) => resolveCleanupPath(path, root))
      .filter(Boolean)
      .filter((path) => allowOutsideRoot || pathInsideRoot(path, root));
    let removed = [];
    let skipped = [];
    let errors = [];

    for (let originalPath of deletePaths) {
      let path = resolveCleanupPath(originalPath, root);
      if (!path) {
        skipped.push({ path: originalPath, reason: 'invalid-path' });
        continue;
      }
      if (!allowOutsideRoot && !pathInsideRoot(path, root)) {
        skipped.push({ path: originalPath, resolvedPath: path, reason: 'outside-root' });
        continue;
      }
      if (path === root) {
        skipped.push({ path: originalPath, resolvedPath: path, reason: 'root' });
        continue;
      }
      if (retained.some((retainedPath) => pathContains(path, retainedPath) || pathContains(retainedPath, path))) {
        skipped.push({ path: originalPath, resolvedPath: path, reason: 'retained' });
        continue;
      }
      try {
        if (!await exists(path)) {
          skipped.push({ path: originalPath, resolvedPath: path, reason: 'missing' });
          continue;
        }
        await rm(path, { recursive: true, force: true });
        removed.push({ path: originalPath, resolvedPath: path });
      } catch (error) {
        errors.push({
          path: originalPath,
          resolvedPath: path,
          message: error?.message || String(error),
          code: error?.code,
        });
      }
    }

    return {
      ok: errors.length === 0,
      reason: cleanString(context.reason, ''),
      root,
      removed,
      retained: retained.map((path) => ({ path })),
      skipped,
      errors,
    };
  };
}
