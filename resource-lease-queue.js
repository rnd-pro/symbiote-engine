import { nanoid } from './nanoid.js';

const WORKLOAD_CLASSES = ['interactive', 'batch'];
const FAILURE_MESSAGES = {
  CALLBACK_FAILED: 'An event callback failed.',
  LEASE_EXPIRED: 'The lease expired after inactivity.',
  PREPARE_FAILED: 'Resource preparation failed.',
  RECOVERY_FAILED: 'Resource recovery failed; capacity remains blocked.',
};

function createAbortError(message) {
  let error = new Error(message);
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function createQueueError(code, message) {
  let error = new Error(message);
  error.name = 'ResourceLeaseQueueError';
  error.code = code;
  return error;
}

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw createQueueError('INVALID_ARGUMENT', `${name} must be a non-empty string.`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw createQueueError('INVALID_ARGUMENT', `${name} must be a positive safe integer.`);
  }
}

function assertNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw createQueueError('INVALID_ARGUMENT', `${name} must be a non-negative safe integer.`);
  }
}

function publicFailure(code) {
  return {
    code,
    message: FAILURE_MESSAGES[code],
  };
}

function copyFailure(failure) {
  if (!failure) {
    return undefined;
  }
  return { code: failure.code, message: failure.message };
}

function copyGrant(grant) {
  return {
    requestId: grant.requestId,
    leaseId: grant.leaseId,
    epoch: grant.epoch,
    fence: grant.fence,
    units: grant.units,
    grantedAt: grant.grantedAt,
    heartbeatAt: grant.heartbeatAt,
    deadlineAt: grant.deadlineAt,
  };
}

function copyHookRequest(request) {
  return {
    requestId: request.requestId,
    resourceKey: request.resourceKey,
    tenantKey: request.tenantKey,
    workloadClass: request.workloadClass,
    priority: request.priority,
    units: request.units,
    inactivityPolicy: { timeoutMs: request.inactivityPolicy.timeoutMs },
  };
}

function copyPublicEntry(entry) {
  let result = {
    requestId: entry.request.requestId,
    workloadClass: entry.request.workloadClass,
    priority: entry.request.priority,
    units: entry.request.units,
    status: entry.status,
    queuedAt: entry.queuedAt,
  };
  if (entry.grantedAt !== undefined) {
    result.grantedAt = entry.grantedAt;
  }
  if (entry.heartbeatAt !== undefined) {
    result.heartbeatAt = entry.heartbeatAt;
  }
  if (entry.deadlineAt !== undefined) {
    result.deadlineAt = entry.deadlineAt;
  }
  if (entry.completedAt !== undefined) {
    result.completedAt = entry.completedAt;
  }
  if (entry.failure) {
    result.failure = copyFailure(entry.failure);
  }
  if (entry.callbackFailureCount > 0) {
    result.callbackFailureCount = entry.callbackFailureCount;
    result.callbackFailure = copyFailure(entry.callbackFailure);
  }
  return result;
}

class ResourceLeaseQueue {
  constructor(options) {
    if (!options || typeof options !== 'object') {
      throw createQueueError('INVALID_ARGUMENT', 'Queue options are required.');
    }
    assertPositiveInteger(options.capacity, 'capacity');
    assertNonEmptyString(options.epoch, 'epoch');
    if (options.interactiveBurstMax !== undefined) {
      assertNonNegativeInteger(options.interactiveBurstMax, 'interactiveBurstMax');
    }
    if (options.batchAgingThresholdMs !== undefined) {
      assertNonNegativeInteger(options.batchAgingThresholdMs, 'batchAgingThresholdMs');
    }
    for (let hookName of ['prepare', 'cleanup', 'recover']) {
      if (options[hookName] !== undefined && typeof options[hookName] !== 'function') {
        throw createQueueError('INVALID_ARGUMENT', `${hookName} must be a function.`);
      }
    }

    this.capacity = options.capacity;
    this.epoch = options.epoch;
    this.interactiveBurstMax = options.interactiveBurstMax ?? 3;
    this.batchAgingThresholdMs = options.batchAgingThresholdMs ?? 5000;
    this.prepareFn = options.prepare ?? (async () => {});
    this.cleanupFn = options.cleanup ?? (async () => {});
    this.recoverFn = options.recover ?? (async () => {});
    this.status = 'open';
    this.activeUnits = 0;
    this.blockedUnits = 0;
    this.fenceCounter = 0;
    this.interactiveBurstCount = 0;
    this.requests = new Map();
    this.grants = new Map();
    this.classQueues = {
      interactive: { tenants: new Map(), order: [], cursor: 0 },
      batch: { tenants: new Map(), order: [], cursor: 0 },
    };
    this.closePromise = null;
  }

  _validateRequest(request) {
    if (!request || typeof request !== 'object') {
      throw createQueueError('INVALID_REQUEST', 'A request object is required.');
    }
    assertNonEmptyString(request.requestId, 'requestId');
    assertNonEmptyString(request.resourceKey, 'resourceKey');
    assertNonEmptyString(request.tenantKey, 'tenantKey');
    if (this.requests.has(request.requestId)) {
      throw createQueueError('DUPLICATE_REQUEST', 'requestId must be unique.');
    }
    if (!WORKLOAD_CLASSES.includes(request.workloadClass)) {
      throw createQueueError(
        'INVALID_REQUEST',
        `workloadClass must be one of: ${WORKLOAD_CLASSES.join(', ')}.`,
      );
    }
    if (typeof request.priority !== 'number' || !Number.isFinite(request.priority)) {
      throw createQueueError('INVALID_REQUEST', 'priority must be a finite number.');
    }
    assertPositiveInteger(request.units, 'units');
    if (request.units > this.capacity) {
      throw createQueueError('REQUEST_TOO_LARGE', 'Request units exceed queue capacity.');
    }
    if (!request.inactivityPolicy || typeof request.inactivityPolicy !== 'object') {
      throw createQueueError('INVALID_REQUEST', 'inactivityPolicy is required.');
    }
    assertPositiveInteger(request.inactivityPolicy.timeoutMs, 'inactivityPolicy.timeoutMs');
  }

  _validateAcquireOptions(options) {
    if (!options || typeof options !== 'object') {
      throw createQueueError('INVALID_ARGUMENT', 'Acquire options must be an object.');
    }
    if (options.onEvent !== undefined && typeof options.onEvent !== 'function') {
      throw createQueueError('INVALID_ARGUMENT', 'onEvent must be a function.');
    }
    if (options.signal !== undefined) {
      let signal = options.signal;
      if (
        !signal
        || typeof signal.aborted !== 'boolean'
        || typeof signal.addEventListener !== 'function'
        || typeof signal.removeEventListener !== 'function'
      ) {
        throw createQueueError('INVALID_ARGUMENT', 'signal must be an AbortSignal.');
      }
    }
  }

  _emit(entry, type, details = {}) {
    if (!entry.onEvent) {
      return;
    }
    let event = {
      type,
      requestId: entry.request.requestId,
      status: entry.status,
      at: Date.now(),
      ...details,
    };
    try {
      entry.onEvent(event);
    } catch {
      entry.callbackFailureCount += 1;
      entry.callbackFailure = publicFailure('CALLBACK_FAILED');
    }
  }

  _removeAbortListener(entry) {
    if (!entry.abortHandler || !entry.signal) {
      return;
    }
    entry.signal.removeEventListener('abort', entry.abortHandler);
    entry.abortHandler = null;
  }

  _settleAcquire(entry, method, value) {
    if (entry.settled) {
      return;
    }
    entry.settled = true;
    this._removeAbortListener(entry);
    entry[method](value);
  }

  _enqueue(entry) {
    let classQueue = this.classQueues[entry.request.workloadClass];
    let tenantQueue = classQueue.tenants.get(entry.request.tenantKey);
    if (!tenantQueue) {
      tenantQueue = [];
      classQueue.tenants.set(entry.request.tenantKey, tenantQueue);
      classQueue.order.push(entry.request.tenantKey);
    }
    tenantQueue.push(entry);
  }

  _removeQueuedEntry(entry) {
    let classQueue = this.classQueues[entry.request.workloadClass];
    let tenantKey = entry.request.tenantKey;
    let tenantQueue = classQueue.tenants.get(tenantKey);
    if (!tenantQueue) {
      return;
    }
    let entryIndex = tenantQueue.indexOf(entry);
    if (entryIndex >= 0) {
      tenantQueue.splice(entryIndex, 1);
    }
    if (tenantQueue.length > 0) {
      return;
    }
    classQueue.tenants.delete(tenantKey);
    let tenantIndex = classQueue.order.indexOf(tenantKey);
    if (tenantIndex < 0) {
      return;
    }
    classQueue.order.splice(tenantIndex, 1);
    if (classQueue.order.length === 0) {
      classQueue.cursor = 0;
    } else if (tenantIndex < classQueue.cursor) {
      classQueue.cursor -= 1;
    } else if (classQueue.cursor >= classQueue.order.length) {
      classQueue.cursor = 0;
    }
  }

  _hasQueued(workloadClass) {
    return this.classQueues[workloadClass].order.length > 0;
  }

  _hasAgedBatch() {
    let now = Date.now();
    for (let tenantQueue of this.classQueues.batch.tenants.values()) {
      if (now - tenantQueue[0].queuedAt >= this.batchAgingThresholdMs) {
        return true;
      }
    }
    return false;
  }

  _preferredClass() {
    let hasInteractive = this._hasQueued('interactive');
    let hasBatch = this._hasQueued('batch');
    if (hasBatch && (this._hasAgedBatch() || this.interactiveBurstCount >= this.interactiveBurstMax)) {
      return 'batch';
    }
    if (hasInteractive) {
      return 'interactive';
    }
    if (hasBatch) {
      return 'batch';
    }
    return null;
  }

  _takeFittingHead(workloadClass) {
    let classQueue = this.classQueues[workloadClass];
    let availableUnits = this.capacity - this.activeUnits;
    let tenantCount = classQueue.order.length;
    for (let offset = 0; offset < tenantCount; offset += 1) {
      let tenantIndex = (classQueue.cursor + offset) % tenantCount;
      let tenantKey = classQueue.order[tenantIndex];
      let tenantQueue = classQueue.tenants.get(tenantKey);
      let entry = tenantQueue[0];
      if (entry.request.units > availableUnits) {
        continue;
      }
      tenantQueue.shift();
      if (tenantQueue.length === 0) {
        classQueue.tenants.delete(tenantKey);
        classQueue.order.splice(tenantIndex, 1);
        classQueue.cursor = classQueue.order.length === 0
          ? 0
          : tenantIndex % classQueue.order.length;
      } else {
        classQueue.cursor = (tenantIndex + 1) % classQueue.order.length;
      }
      return entry;
    }
    return null;
  }

  _takeNextEntry() {
    let preferredClass = this._preferredClass();
    if (!preferredClass) {
      return null;
    }
    let entry = this._takeFittingHead(preferredClass);
    let selectedClass = preferredClass;
    if (!entry) {
      selectedClass = preferredClass === 'interactive' ? 'batch' : 'interactive';
      entry = this._takeFittingHead(selectedClass);
    }
    if (!entry) {
      return null;
    }
    if (selectedClass === 'interactive') {
      this.interactiveBurstCount += 1;
    } else {
      this.interactiveBurstCount = 0;
    }
    return entry;
  }

  _schedule() {
    if (this.status !== 'open') {
      return;
    }
    while (this.activeUnits < this.capacity) {
      let entry = this._takeNextEntry();
      if (!entry) {
        return;
      }
      this._startPreparing(entry);
    }
  }

  _startPreparing(entry) {
    if (this.fenceCounter >= Number.MAX_SAFE_INTEGER) {
      entry.status = 'failed';
      entry.failure = publicFailure('PREPARE_FAILED');
      this._emit(entry, 'failed', { failure: copyFailure(entry.failure) });
      this._settleAcquire(
        entry,
        'reject',
        createQueueError('PREPARE_FAILED', FAILURE_MESSAGES.PREPARE_FAILED),
      );
      return;
    }
    this.fenceCounter += 1;
    let now = Date.now();
    let grant = {
      requestId: entry.request.requestId,
      leaseId: nanoid(),
      epoch: this.epoch,
      fence: this.fenceCounter,
      units: entry.request.units,
      grantedAt: now,
      heartbeatAt: now,
      deadlineAt: now + entry.request.inactivityPolicy.timeoutMs,
    };
    let wrapper = {
      entry,
      grant,
      phase: 'preparing',
      timer: null,
      preparePromise: null,
      finalizePromise: null,
    };
    entry.grantIdentity = copyGrant(grant);
    entry.status = 'preparing';
    this.activeUnits += grant.units;
    this.grants.set(grant.leaseId, wrapper);
    wrapper.preparePromise = Promise.resolve().then(() => this._runPrepare(wrapper)).catch(() => {
      entry.operationFailure = publicFailure('RECOVERY_FAILED');
      if (wrapper.phase !== 'blocked') {
        wrapper.phase = 'blocked';
        this.blockedUnits += wrapper.grant.units;
        entry.status = 'failed';
        entry.failure = publicFailure('RECOVERY_FAILED');
        this._emit(entry, 'failed', { failure: copyFailure(entry.failure) });
      }
    });
    this._emit(entry, 'preparing');
  }

  async _runPrepare(wrapper) {
    let { entry, grant } = wrapper;
    try {
      await this.prepareFn(copyGrant(grant), copyHookRequest(entry.request));
    } catch {
      entry.failure = publicFailure('PREPARE_FAILED');
      this._settleAcquire(
        entry,
        'reject',
        createQueueError('PREPARE_FAILED', FAILURE_MESSAGES.PREPARE_FAILED),
      );
      await this._finalize(wrapper, { status: 'prepare-failed' }, 'failed');
      return;
    }

    if (this.status !== 'open' || entry.status === 'closed') {
      let alreadyClosed = entry.status === 'closed';
      entry.status = 'closed';
      if (!alreadyClosed) {
        this._emit(entry, 'closed');
      }
      this._settleAcquire(entry, 'reject', createAbortError('Queue closed before grant.'));
      await this._finalize(wrapper, { status: 'queue-closed' }, 'closed');
      return;
    }

    wrapper.phase = 'active';
    entry.status = 'active';
    entry.grantedAt = grant.grantedAt;
    entry.heartbeatAt = grant.heartbeatAt;
    entry.deadlineAt = grant.deadlineAt;
    this._armWatchdog(wrapper);
    this._settleAcquire(entry, 'resolve', copyGrant(grant));
    this._emit(entry, 'granted', {
      grantedAt: grant.grantedAt,
      deadlineAt: grant.deadlineAt,
    });
  }

  _armWatchdog(wrapper) {
    if (wrapper.timer) {
      clearTimeout(wrapper.timer);
    }
    let delay = Math.max(0, wrapper.grant.deadlineAt - Date.now());
    wrapper.timer = setTimeout(() => {
      let expiry = Promise.resolve().then(() => this._expire(wrapper));
      wrapper.finalizePromise = expiry;
      expiry.catch(() => {
        wrapper.entry.operationFailure = publicFailure('RECOVERY_FAILED');
        if (wrapper.phase !== 'blocked') {
          wrapper.phase = 'blocked';
          this.blockedUnits += wrapper.grant.units;
          wrapper.entry.status = 'failed';
          wrapper.entry.failure = publicFailure('RECOVERY_FAILED');
          this._emit(wrapper.entry, 'failed', {
            failure: copyFailure(wrapper.entry.failure),
          });
        }
      });
    }, delay);
  }

  _clearWatchdog(wrapper) {
    if (!wrapper.timer) {
      return;
    }
    clearTimeout(wrapper.timer);
    wrapper.timer = null;
  }

  async _expire(wrapper) {
    if (wrapper.phase !== 'active') {
      return;
    }
    wrapper.phase = 'recovering';
    wrapper.entry.status = 'recovering';
    wrapper.entry.failure = publicFailure('LEASE_EXPIRED');
    this._emit(wrapper.entry, 'recovering');
    await this._recover(wrapper, publicFailure('LEASE_EXPIRED'), 'failed');
  }

  async _finalize(wrapper, outcome, terminalStatus) {
    if (wrapper.finalizePromise) {
      return wrapper.finalizePromise;
    }
    wrapper.finalizePromise = Promise.resolve().then(
      () => this._runCleanup(wrapper, outcome, terminalStatus),
    );
    return wrapper.finalizePromise;
  }

  async _runCleanup(wrapper, outcome, terminalStatus) {
    this._clearWatchdog(wrapper);
    wrapper.phase = 'cleaning';
    try {
      await this.cleanupFn(
        copyGrant(wrapper.grant),
        outcome,
        copyHookRequest(wrapper.entry.request),
      );
    } catch {
      wrapper.entry.status = 'recovering';
      this._emit(wrapper.entry, 'recovering');
      return this._recover(wrapper, { code: 'CLEANUP_FAILED' }, terminalStatus);
    }
    this._releaseCapacity(wrapper, terminalStatus);
  }

  async _recover(wrapper, reason, terminalStatus) {
    this._clearWatchdog(wrapper);
    wrapper.phase = 'recovering';
    try {
      await this.recoverFn(
        copyGrant(wrapper.grant),
        { code: reason.code },
        copyHookRequest(wrapper.entry.request),
      );
    } catch {
      wrapper.phase = 'blocked';
      this.blockedUnits += wrapper.grant.units;
      wrapper.entry.status = 'failed';
      wrapper.entry.failure = publicFailure('RECOVERY_FAILED');
      wrapper.entry.completedAt = Date.now();
      this._emit(wrapper.entry, 'failed', {
        failure: copyFailure(wrapper.entry.failure),
      });
      throw createQueueError('RESOURCE_BLOCKED', FAILURE_MESSAGES.RECOVERY_FAILED);
    }
    this._releaseCapacity(wrapper, terminalStatus);
  }

  _releaseCapacity(wrapper, terminalStatus) {
    if (!this.grants.has(wrapper.grant.leaseId)) {
      return;
    }
    this._clearWatchdog(wrapper);
    this.grants.delete(wrapper.grant.leaseId);
    this.activeUnits -= wrapper.grant.units;
    wrapper.phase = 'terminal';
    wrapper.entry.status = terminalStatus;
    wrapper.entry.completedAt = Date.now();
    if (terminalStatus === 'completed') {
      this._emit(wrapper.entry, 'completed');
    } else if (terminalStatus === 'failed') {
      this._emit(wrapper.entry, 'failed', {
        failure: copyFailure(wrapper.entry.failure),
      });
    }
    this._schedule();
  }

  _resolveGrant(grant, allowedPhases) {
    if (!grant || typeof grant !== 'object') {
      throw createQueueError('INVALID_GRANT', 'A complete grant is required.');
    }
    assertNonEmptyString(grant.requestId, 'grant.requestId');
    assertNonEmptyString(grant.leaseId, 'grant.leaseId');
    assertNonEmptyString(grant.epoch, 'grant.epoch');
    assertPositiveInteger(grant.fence, 'grant.fence');
    assertPositiveInteger(grant.units, 'grant.units');
    let wrapper = this.grants.get(grant.leaseId);
    if (!wrapper) {
      let entry = this.requests.get(grant.requestId);
      if (entry && entry.grantIdentity && this._sameGrant(entry.grantIdentity, grant)) {
        return { entry, wrapper: null, terminal: true };
      }
      throw createQueueError('INVALID_GRANT', 'Grant is stale or unknown.');
    }
    if (!this._sameGrant(wrapper.grant, grant)) {
      throw createQueueError('INVALID_GRANT', 'Grant identity does not match the active lease.');
    }
    if (!allowedPhases.includes(wrapper.phase)) {
      throw createQueueError('INVALID_GRANT_STATE', 'Grant is not active for this operation.');
    }
    return { entry: wrapper.entry, wrapper, terminal: false };
  }

  _sameGrant(expected, actual) {
    return expected.requestId === actual.requestId
      && expected.leaseId === actual.leaseId
      && expected.epoch === actual.epoch
      && expected.fence === actual.fence
      && expected.units === actual.units;
  }

  acquire(request, options = {}) {
    if (this.status !== 'open') {
      return Promise.reject(createAbortError('Queue is closing or closed.'));
    }
    try {
      this._validateAcquireOptions(options);
      this._validateRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }
    let requestCopy = copyHookRequest(request);
    let resolveGrant;
    let rejectGrant;
    let promise = new Promise((resolve, reject) => {
      resolveGrant = resolve;
      rejectGrant = reject;
    });
    let entry = {
      request: requestCopy,
      status: 'queued',
      queuedAt: Date.now(),
      grantedAt: undefined,
      heartbeatAt: undefined,
      deadlineAt: undefined,
      completedAt: undefined,
      failure: undefined,
      callbackFailure: undefined,
      callbackFailureCount: 0,
      signal: options.signal,
      onEvent: options.onEvent,
      abortHandler: null,
      settled: false,
      resolve: resolveGrant,
      reject: rejectGrant,
      grantIdentity: null,
    };
    this.requests.set(requestCopy.requestId, entry);
    this._enqueue(entry);
    this._emit(entry, 'queued');
    if (entry.status !== 'queued') {
      return promise;
    }
    if (entry.signal?.aborted) {
      this._cancelQueued(entry, 'Request was aborted while queued.');
      return promise;
    }
    if (entry.signal) {
      entry.abortHandler = () => {
        if (entry.status === 'queued') {
          this._cancelQueued(entry, 'Request was aborted while queued.');
        }
      };
      entry.signal.addEventListener('abort', entry.abortHandler, { once: true });
    }
    this._schedule();
    return promise;
  }

  _cancelQueued(entry, message) {
    this._removeQueuedEntry(entry);
    entry.status = 'cancelled';
    entry.completedAt = Date.now();
    this._emit(entry, 'cancelled');
    this._settleAcquire(entry, 'reject', createAbortError(message));
    this._schedule();
  }

  heartbeat(grant, progress) {
    let resolved = this._resolveGrant(grant, ['active']);
    if (resolved.terminal) {
      throw createQueueError('INVALID_GRANT_STATE', 'Grant is no longer active.');
    }
    let { wrapper } = resolved;
    let now = Date.now();
    wrapper.grant.heartbeatAt = now;
    wrapper.grant.deadlineAt = now + wrapper.entry.request.inactivityPolicy.timeoutMs;
    wrapper.entry.heartbeatAt = wrapper.grant.heartbeatAt;
    wrapper.entry.deadlineAt = wrapper.grant.deadlineAt;
    this._armWatchdog(wrapper);
    this._emit(wrapper.entry, 'heartbeat', {
      heartbeatAt: wrapper.grant.heartbeatAt,
      deadlineAt: wrapper.grant.deadlineAt,
      hasProgress: progress !== undefined,
    });
    return copyGrant(wrapper.grant);
  }

  async release(grant, outcome) {
    let resolved = this._resolveGrant(grant, ['active', 'cleaning', 'recovering', 'blocked']);
    if (resolved.terminal) {
      return { status: resolved.entry.status };
    }
    if (resolved.wrapper.phase === 'blocked') {
      throw createQueueError('RESOURCE_BLOCKED', FAILURE_MESSAGES.RECOVERY_FAILED);
    }
    await this._finalize(resolved.wrapper, outcome, 'completed');
    return { status: resolved.wrapper.entry.status };
  }

  cancel(requestId, reason) {
    assertNonEmptyString(requestId, 'requestId');
    let entry = this.requests.get(requestId);
    if (!entry || entry.status !== 'queued') {
      return false;
    }
    this._cancelQueued(entry, 'Request was cancelled while queued.');
    return true;
  }

  get(requestId) {
    assertNonEmptyString(requestId, 'requestId');
    let entry = this.requests.get(requestId);
    return entry ? copyPublicEntry(entry) : null;
  }

  list() {
    return Array.from(this.requests.values(), entry => copyPublicEntry(entry));
  }

  snapshot() {
    let counts = {
      queued: 0,
      preparing: 0,
      active: 0,
      recovering: 0,
      completed: 0,
      cancelled: 0,
      failed: 0,
      closed: 0,
    };
    for (let entry of this.requests.values()) {
      if (counts[entry.status] !== undefined) {
        counts[entry.status] += 1;
      }
    }
    return {
      status: this.status,
      capacity: this.capacity,
      activeUnits: this.activeUnits,
      blockedUnits: this.blockedUnits,
      availableUnits: this.capacity - this.activeUnits,
      interactiveBurstCount: this.interactiveBurstCount,
      counts,
      requests: this.list(),
    };
  }

  close() {
    if (this.closePromise) {
      return this.closePromise;
    }
    this.status = 'closing';
    this.closePromise = Promise.resolve().then(() => this._close());
    return this.closePromise;
  }

  async _close() {
    for (let entry of this.requests.values()) {
      if (entry.status === 'queued') {
        this._removeQueuedEntry(entry);
        entry.status = 'closed';
        entry.completedAt = Date.now();
        this._emit(entry, 'closed');
        this._settleAcquire(entry, 'reject', createAbortError('Queue closed while queued.'));
      } else if (entry.status === 'preparing') {
        entry.status = 'closed';
        this._emit(entry, 'closed');
        this._settleAcquire(entry, 'reject', createAbortError('Queue closed while preparing.'));
      } else if (entry.status === 'active') {
        this._emit(entry, 'closed');
      }
    }

    let pending = [];
    for (let wrapper of this.grants.values()) {
      if (wrapper.phase === 'preparing') {
        pending.push(wrapper.preparePromise);
      } else if (wrapper.phase === 'active') {
        pending.push(this._finalize(wrapper, { status: 'queue-closed' }, 'closed'));
      } else if (wrapper.finalizePromise) {
        pending.push(wrapper.finalizePromise);
      }
    }
    await Promise.allSettled(pending);
    if (this.activeUnits !== 0) {
      throw createQueueError('RESOURCE_BLOCKED', FAILURE_MESSAGES.RECOVERY_FAILED);
    }
    this.status = 'closed';
  }
}

/**
 * @param {object} options
 * @returns {ResourceLeaseQueue}
 */
export function createResourceLeaseQueue(options) {
  return new ResourceLeaseQueue(options);
}
