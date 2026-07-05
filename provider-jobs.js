import {
  createAudioCacheKey,
  isAudioProviderNotReadyError,
  normalizeAudioJob,
  normalizeAudioProviderReadiness,
} from './contracts/audio-provider.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);
const DEFAULT_READINESS_RETRY_MS = 1000;
const DEFAULT_EVENT_HISTORY_LIMIT = 50;

function cloneJson(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function snapshot(record) {
  return cloneJson(record);
}

function timestamp() {
  return new Date().toISOString();
}

function stageFor(type, extra = {}) {
  if (type === 'audio-job:accepted') return 'accepted';
  if (type === 'audio-job:queued') return 'queued';
  if (type === 'audio-job:readiness-checking' || type === 'audio-job:not-ready') return 'readiness-wait';
  if (type === 'audio-job:running') return 'running';
  if (type === 'audio-job:progress') return cleanString(extra.progress?.stage, 'running');
  if (type === 'audio-job:artifact-write') return 'artifact-write';
  if (type === 'audio-job:cache-hit') return 'cache-hit';
  if (type === 'audio-job:succeeded') return 'done';
  if (type === 'audio-job:failed') return 'failed';
  if (type === 'audio-job:canceled') return 'canceled';
  return cleanString(type.replace(/^audio-job:/, ''), 'progress');
}

function jobGroup(job) {
  return cleanString(job.modelClass, job.profile || job.providerId);
}

function hasCapacity(activeByGroup, capacityByGroup, group) {
  let active = activeByGroup.get(group) || 0;
  let capacity = Number.isInteger(capacityByGroup[group]) ? capacityByGroup[group] : 1;
  return active < Math.max(0, capacity);
}

function setActive(activeByGroup, group, delta) {
  let next = Math.max(0, (activeByGroup.get(group) || 0) + delta);
  if (next === 0) activeByGroup.delete(group);
  else activeByGroup.set(group, next);
}

export function createAudioProviderJobQueue(options = {}) {
  let { registry } = options;
  if (!registry || typeof registry.execute !== 'function') {
    throw new Error('audio provider job queue requires a registry');
  }
  let capacityByGroup = options.capacityByGroup || {};
  let readinessRetryMs = Math.max(0, Number(options.readinessRetryMs ?? DEFAULT_READINESS_RETRY_MS));
  let eventHistoryLimit = Math.max(0, Math.round(Number(options.eventHistoryLimit ?? DEFAULT_EVENT_HISTORY_LIMIT)));
  let onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  let records = new Map();
  let queue = [];
  let cache = new Map();
  let controllers = new Map();
  let running = new Set();
  let waiters = new Map();
  let readinessChecks = new Set();
  let readinessRunning = new Set();
  let retryTimers = new Map();
  let retryUntilByGroup = new Map();
  let activeByGroup = new Map();

  function rememberEvent(type, record, extra = {}) {
    let at = timestamp();
    let event = {
      at,
      type,
      jobId: record.jobId,
      status: record.status,
      stage: stageFor(type, extra),
      kind: record.kind,
      providerId: record.providerId,
      profile: record.profile,
      modelClass: record.modelClass,
      ...cloneJson(extra),
    };
    record.stage = event.stage;
    record.updatedAt = at;
    if (type === 'audio-job:accepted') record.acceptedAt = record.acceptedAt || at;
    if (type === 'audio-job:queued') record.queuedAt = at;
    if (type === 'audio-job:readiness-checking') record.readinessCheckedAt = at;
    if (type === 'audio-job:running') record.startedAt = record.startedAt || at;
    if (type === 'audio-job:progress') record.lastProgress = cloneJson(extra.progress || {});
    if (extra.readiness) record.readiness = cloneJson(extra.readiness);
    if (TERMINAL_STATUSES.has(record.status)) record.completedAt = record.completedAt || at;
    if (!Array.isArray(record.events)) record.events = [];
    if (eventHistoryLimit > 0) {
      record.events.push(event);
      if (record.events.length > eventHistoryLimit) {
        record.events.splice(0, record.events.length - eventHistoryLimit);
      }
    }
    return event;
  }

  function resolveWaiters(record) {
    if (!TERMINAL_STATUSES.has(record.status)) return;
    let resolvers = waiters.get(record.jobId);
    if (!resolvers) return;
    waiters.delete(record.jobId);
    for (let resolve of resolvers) resolve(snapshot(record));
  }

  function emit(type, record, extra = {}) {
    let event = rememberEvent(type, record, extra);
    onEvent(cloneJson(event));
    resolveWaiters(record);
  }

  function recordFor(job, cacheKey) {
    let jobId = `job_${cacheKey.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return {
      jobId,
      id: job.id,
      status: 'queued',
      stage: 'accepted',
      kind: job.kind,
      providerId: job.providerId,
      profile: job.profile || '',
      modelClass: job.modelClass || '',
      priority: job.priority,
      input: cloneJson(job.input),
      cacheKey,
      cacheHit: false,
      group: jobGroup(job),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      events: [],
    };
  }

  function insertQueued(jobId, priority) {
    if (queue.includes(jobId)) return;
    if (priority !== 'interactive') {
      queue.push(jobId);
      return;
    }
    let index = queue.findIndex((id) => records.get(id)?.priority !== 'interactive');
    if (index === -1) queue.push(jobId);
    else queue.splice(index, 0, jobId);
  }

  function blockedByReadiness(record) {
    let until = retryUntilByGroup.get(record.group) || 0;
    return Date.now() < until;
  }

  function schedulePump(group, delayMs = readinessRetryMs) {
    let existing = retryTimers.get(group);
    if (existing) clearTimeout(existing);
    let timer = setTimeout(() => {
      retryTimers.delete(group);
      retryUntilByGroup.delete(group);
      pump();
    }, Math.max(0, delayMs));
    if (typeof timer.unref === 'function') timer.unref();
    retryTimers.set(group, timer);
  }

  function notReadyRecord(record, readiness, delayMs = readinessRetryMs) {
    record.status = 'queued';
    record.readiness = normalizeAudioProviderReadiness(readiness);
    retryUntilByGroup.set(record.group, Date.now() + Math.max(0, delayMs));
    insertQueued(record.jobId, record.priority);
    emit('audio-job:not-ready', record, { readiness: record.readiness, retryMs: delayMs });
    schedulePump(record.group, delayMs);
  }

  function pump() {
    for (let jobId of [...queue]) {
      let record = records.get(jobId);
      if (!record || record.status !== 'queued') continue;
      if (blockedByReadiness(record)) continue;
      if (readinessChecks.has(record.jobId)) continue;
      if (!hasCapacity(activeByGroup, capacityByGroup, record.group)) continue;
      checkReadinessThenStart(record);
    }
  }

  function checkReadinessThenStart(record) {
    let provider = typeof registry.get === 'function' ? registry.get(record.providerId) : null;
    if (!provider?.checkReady) {
      start(record);
      return;
    }
    if (typeof registry.checkReady !== 'function') {
      start(record);
      return;
    }
    readinessChecks.add(record.jobId);
    emit('audio-job:readiness-checking', record);
    let promise = (async () => {
      try {
        let readiness = normalizeAudioProviderReadiness(await registry.checkReady({
          id: record.id,
          kind: record.kind,
          providerId: record.providerId,
          profile: record.profile,
          modelClass: record.modelClass,
          input: cloneJson(record.input),
        }));
        let current = records.get(record.jobId);
        if (!current || current.status !== 'queued') return;
        if (!readiness.ready) {
          notReadyRecord(current, readiness);
          return;
        }
        current.readiness = readiness;
        start(current);
      } catch (err) {
        let current = records.get(record.jobId);
        if (!current || current.status !== 'queued') return;
        notReadyRecord(current, {
          ready: false,
          code: err?.code || 'READINESS_ERROR',
          reason: err?.message || String(err),
        });
      } finally {
        readinessChecks.delete(record.jobId);
      }
    })();
    readinessRunning.add(promise);
    promise.finally(() => readinessRunning.delete(promise)).catch(() => {});
  }

  function start(record) {
    let index = queue.indexOf(record.jobId);
    if (index >= 0) queue.splice(index, 1);
    let controller = new AbortController();
    controllers.set(record.jobId, controller);
    setActive(activeByGroup, record.group, 1);
    record.status = 'running';
    emit('audio-job:running', record);

    let promise = (async () => {
      try {
        let result = await registry.execute({
          id: record.id,
          kind: record.kind,
          providerId: record.providerId,
          profile: record.profile,
          modelClass: record.modelClass,
          input: cloneJson(record.input),
        }, {
          signal: controller.signal,
          onProgress(progress) {
            emit('audio-job:progress', record, { progress });
          },
        });
        if (controller.signal.aborted) {
          record.status = 'canceled';
          record.cancelReason = controller.signal.reason || 'aborted';
        } else {
          emit('audio-job:artifact-write', record, {
            artifact: result?.artifactId ? {
              artifactId: result.artifactId,
              mimeType: result.mimeType,
              durationSec: result.durationSec,
            } : undefined,
          });
          record.status = 'succeeded';
          record.result = cloneJson(result);
          cache.set(record.cacheKey, cloneJson(result));
        }
      } catch (err) {
        if (!controller.signal.aborted && isAudioProviderNotReadyError(err)) {
          notReadyRecord(record, err.readiness || {
            ready: false,
            code: err?.code || 'NOT_READY',
            reason: err?.message || String(err),
          });
        } else {
          record.status = controller.signal.aborted ? 'canceled' : 'failed';
          record.error = { message: err?.message || String(err), code: err?.code };
        }
      } finally {
        controllers.delete(record.jobId);
        setActive(activeByGroup, record.group, -1);
        if (record.status !== 'queued') emit(`audio-job:${record.status}`, record);
        pump();
      }
      return snapshot(record);
    })();

    running.add(promise);
    promise.finally(() => running.delete(promise)).catch(() => {});
  }

  return {
    async submit(request = {}) {
      let job = normalizeAudioJob(request);
      let provider = typeof registry.get === 'function' ? registry.get(job.providerId) : null;
      if (provider && !job.modelClass) job.modelClass = provider.modelClass || provider.profile || provider.id;
      let cacheKey = cleanString(request.cacheKey, createAudioCacheKey({
        kind: job.kind,
        profile: job.profile || '',
        modelVersion: request.modelVersion || provider?.modelVersion || '',
        input: job.input,
      }));
      let cached = cache.get(cacheKey);
      if (cached) {
        let existing = records.get(`job_${cacheKey.replace(/[^a-zA-Z0-9]/g, '_')}`);
        let record = existing || recordFor(job, cacheKey);
        record.status = 'succeeded';
        record.cacheHit = true;
        record.result = cloneJson(cached);
        if (!existing) records.set(record.jobId, record);
        emit('audio-job:cache-hit', record);
        emit('audio-job:succeeded', record);
        return {
          ...snapshot(record),
          status: 'succeeded',
          cacheHit: true,
          result: cloneJson(cached),
        };
      }
      let record = recordFor(job, cacheKey);
      let existing = records.get(record.jobId);
      if (existing) return { ...snapshot(existing), idempotent: true };

      records.set(record.jobId, record);
      emit('audio-job:accepted', record);
      insertQueued(record.jobId, record.priority);
      emit('audio-job:queued', record);
      pump();
      return snapshot(record);
    },
    get(jobId) {
      let record = records.get(jobId);
      return record ? snapshot(record) : null;
    },
    async cancel(jobId, reason = 'audio-job.cancel') {
      let record = records.get(jobId);
      if (!record) throw new Error(`audio job "${jobId}" does not exist`);
      if (TERMINAL_STATUSES.has(record.status)) return snapshot(record);
      let index = queue.indexOf(jobId);
      if (index >= 0) queue.splice(index, 1);
      let controller = controllers.get(jobId);
      if (controller && !controller.signal.aborted) controller.abort(reason);
      record.status = 'canceled';
      record.cancelReason = reason;
      emit('audio-job:canceled', record);
      return snapshot(record);
    },
    wait(jobId) {
      let record = records.get(jobId);
      if (!record) return Promise.reject(new Error(`audio job "${jobId}" does not exist`));
      if (TERMINAL_STATUSES.has(record.status)) return Promise.resolve(snapshot(record));
      return new Promise((resolve) => {
        let resolvers = waiters.get(jobId) || [];
        resolvers.push(resolve);
        waiters.set(jobId, resolvers);
      });
    },
    async drain() {
      pump();
      while (running.size > 0 || readinessRunning.size > 0) {
        await Promise.allSettled([...running, ...readinessRunning]);
        pump();
      }
    },
    list() {
      return [...records.values()].map(snapshot);
    },
  };
}
