import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createResourceLeaseQueue } from '../resource-lease-queue.js';

function createRequest(requestId, overrides = {}) {
  return {
    requestId,
    resourceKey: 'opaque-resource',
    tenantKey: 'tenant-a',
    workloadClass: 'interactive',
    priority: 0,
    units: 1,
    inactivityPolicy: { timeoutMs: 500 },
    ...overrides,
  };
}

function createDeferred() {
  let resolve;
  let reject;
  let promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, timeoutMs = 250) {
  let deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      assert.fail('Condition did not become true before the test deadline.');
    }
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}

async function consume(queue, grantPromise, requestId, order) {
  let grant = await grantPromise;
  order.push(requestId);
  await queue.release(grant, { status: 'complete' });
}

function stringify(value) {
  return JSON.stringify(value);
}

function createTrackingSignal() {
  let controller = new AbortController();
  let listenerCount = 0;
  let signal = {
    get aborted() {
      return controller.signal.aborted;
    },
    addEventListener(type, listener, options) {
      listenerCount += 1;
      controller.signal.addEventListener(type, listener, options);
    },
    removeEventListener(type, listener) {
      listenerCount -= 1;
      controller.signal.removeEventListener(type, listener);
    },
  };
  return {
    signal,
    abort: () => controller.abort(),
    getListenerCount: () => listenerCount,
  };
}

describe('createResourceLeaseQueue', () => {
  test('exports the factory from Node, browser, and package subpath entrypoints', async () => {
    let nodeEntry = await import('../index.js');
    let browserEntry = await import('../browser.js');
    let subpathEntry = await import('symbiote-engine/resource-lease-queue');

    assert.equal(nodeEntry.createResourceLeaseQueue, createResourceLeaseQueue);
    assert.equal(browserEntry.createResourceLeaseQueue, createResourceLeaseQueue);
    assert.equal(subpathEntry.createResourceLeaseQueue, createResourceLeaseQueue);
  });

  test('rejects invalid queue configuration', () => {
    assert.throws(() => createResourceLeaseQueue(), /options are required/i);
    assert.throws(() => createResourceLeaseQueue({ capacity: 0, epoch: 'epoch-a' }), /capacity/i);
    assert.throws(() => createResourceLeaseQueue({ capacity: 1.5, epoch: 'epoch-a' }), /capacity/i);
    assert.throws(() => createResourceLeaseQueue({ capacity: Infinity, epoch: 'epoch-a' }), /capacity/i);
    assert.throws(() => createResourceLeaseQueue({ capacity: 1, epoch: ' ' }), /epoch/i);
    assert.throws(
      () => createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a', interactiveBurstMax: -1 }),
      /interactiveBurstMax/,
    );
    assert.throws(
      () => createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a', interactiveBurstMax: 1.5 }),
      /interactiveBurstMax/,
    );
    assert.throws(
      () => createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a', batchAgingThresholdMs: -1 }),
      /batchAgingThresholdMs/,
    );
    assert.doesNotThrow(
      () => createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a', batchAgingThresholdMs: 0 }),
    );
    assert.throws(
      () => createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a', prepare: true }),
      /prepare/,
    );
  });

  test('rejects invalid requests, classes, options, and duplicate IDs', async () => {
    let queue = createResourceLeaseQueue({ capacity: 2, epoch: 'epoch-a' });
    let invalidRequests = [
      null,
      createRequest(''),
      createRequest('missing-resource', { resourceKey: '' }),
      createRequest('missing-tenant', { tenantKey: '' }),
      createRequest('bad-class', { workloadClass: 'background' }),
      createRequest('bad-priority', { priority: Infinity }),
      createRequest('bad-units-zero', { units: 0 }),
      createRequest('bad-units-fraction', { units: 1.5 }),
      createRequest('too-large', { units: 3 }),
      createRequest('missing-policy', { inactivityPolicy: null }),
      createRequest('bad-timeout-zero', { inactivityPolicy: { timeoutMs: 0 } }),
      createRequest('bad-timeout-fraction', { inactivityPolicy: { timeoutMs: 1.5 } }),
    ];

    for (let request of invalidRequests) {
      await assert.rejects(queue.acquire(request));
    }
    await assert.rejects(queue.acquire(createRequest('bad-callback'), { onEvent: true }));
    await assert.rejects(queue.acquire(createRequest('bad-signal'), { signal: {} }));

    let firstGrant = await queue.acquire(createRequest('duplicate'));
    await assert.rejects(queue.acquire(createRequest('duplicate')), error => {
      assert.equal(error.code, 'DUPLICATE_REQUEST');
      return true;
    });
    await queue.release(firstGrant, { status: 'complete' });
    await queue.close();
  });

  test('preserves FIFO within a tenant and class regardless of priority', async () => {
    let queue = createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a' });
    let blocker = await queue.acquire(createRequest('blocker', { tenantKey: 'blocker' }));
    let order = [];
    let consumers = [
      consume(queue, queue.acquire(createRequest('first', { priority: -100 })), 'first', order),
      consume(queue, queue.acquire(createRequest('second', { priority: 100 })), 'second', order),
      consume(queue, queue.acquire(createRequest('third', { priority: 0 })), 'third', order),
    ];

    await queue.release(blocker, { status: 'complete' });
    await Promise.all(consumers);

    assert.deepEqual(order, ['first', 'second', 'third']);
    await queue.close();
  });

  test('round-robins tenant heads within the selected class', async () => {
    let queue = createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a' });
    let blocker = await queue.acquire(createRequest('blocker', { tenantKey: 'blocker' }));
    let order = [];
    let consumers = [
      consume(queue, queue.acquire(createRequest('a-1')), 'a-1', order),
      consume(queue, queue.acquire(createRequest('a-2')), 'a-2', order),
      consume(
        queue,
        queue.acquire(createRequest('b-1', { tenantKey: 'tenant-b' })),
        'b-1',
        order,
      ),
      consume(
        queue,
        queue.acquire(createRequest('b-2', { tenantKey: 'tenant-b' })),
        'b-2',
        order,
      ),
    ];

    await queue.release(blocker, { status: 'complete' });
    await Promise.all(consumers);

    assert.deepEqual(order, ['a-1', 'b-1', 'a-2', 'b-2']);
    await queue.close();
  });

  test('applies one global bounded interactive burst', async () => {
    let queue = createResourceLeaseQueue({
      capacity: 1,
      epoch: 'epoch-a',
      interactiveBurstMax: 2,
    });
    let blocker = await queue.acquire(createRequest('blocker', { workloadClass: 'batch' }));
    let order = [];
    let consumers = [
      consume(queue, queue.acquire(createRequest('i-1')), 'i-1', order),
      consume(queue, queue.acquire(createRequest('i-2')), 'i-2', order),
      consume(queue, queue.acquire(createRequest('i-3')), 'i-3', order),
      consume(
        queue,
        queue.acquire(createRequest('b-1', { workloadClass: 'batch' })),
        'b-1',
        order,
      ),
      consume(
        queue,
        queue.acquire(createRequest('b-2', { workloadClass: 'batch' })),
        'b-2',
        order,
      ),
    ];

    await queue.release(blocker, { status: 'complete' });
    await Promise.all(consumers);

    assert.deepEqual(order, ['i-1', 'i-2', 'b-1', 'i-3', 'b-2']);
    await queue.close();
  });

  test('promotes an aged batch head ahead of new interactive work', async () => {
    let queue = createResourceLeaseQueue({
      capacity: 1,
      epoch: 'epoch-a',
      interactiveBurstMax: 100,
      batchAgingThresholdMs: 10,
    });
    let blocker = await queue.acquire(createRequest('blocker'));
    let order = [];
    let batch = consume(
      queue,
      queue.acquire(createRequest('batch', { workloadClass: 'batch' })),
      'batch',
      order,
    );
    await new Promise(resolve => setTimeout(resolve, 15));
    let interactive = consume(
      queue,
      queue.acquire(createRequest('interactive')),
      'interactive',
      order,
    );

    await queue.release(blocker, { status: 'complete' });
    await Promise.all([batch, interactive]);

    assert.deepEqual(order, ['batch', 'interactive']);
    await queue.close();
  });

  test('skips an unfitting tenant head without bypassing that tenant head', async () => {
    let queue = createResourceLeaseQueue({ capacity: 3, epoch: 'epoch-a' });
    let blocker = await queue.acquire(createRequest('blocker', {
      tenantKey: 'blocker',
      units: 2,
    }));
    let order = [];
    let aLarge = queue.acquire(createRequest('a-large', { units: 2 }));
    let aSmall = queue.acquire(createRequest('a-small'));
    let bSmall = queue.acquire(createRequest('b-small', { tenantKey: 'tenant-b' }));
    let bGrant = await bSmall;
    order.push('b-small');

    assert.equal(queue.get('a-large').status, 'queued');
    assert.equal(queue.get('a-small').status, 'queued');

    await queue.release(bGrant, { status: 'complete' });
    await queue.release(blocker, { status: 'complete' });
    let largeGrant = await aLarge;
    order.push('a-large');
    await queue.release(largeGrant, { status: 'complete' });
    let smallGrant = await aSmall;
    order.push('a-small');
    await queue.release(smallGrant, { status: 'complete' });

    assert.deepEqual(order, ['b-small', 'a-large', 'a-small']);
    await queue.close();
  });

  test('holds capacity through prepare failure cleanup and recovery', async () => {
    let recovery = createDeferred();
    let calls = [];
    let queue = createResourceLeaseQueue({
      capacity: 1,
      epoch: 'epoch-a',
      prepare: async grant => {
        if (grant.requestId === 'first') {
          calls.push('prepare');
          throw new Error('SENSITIVE_PREPARE_DETAIL');
        }
      },
      cleanup: async grant => {
        if (grant.requestId === 'first') {
          calls.push('cleanup');
          throw new Error('SENSITIVE_CLEANUP_DETAIL');
        }
      },
      recover: async grant => {
        if (grant.requestId === 'first') {
          calls.push('recover');
          await recovery.promise;
        }
      },
    });
    let first = queue.acquire(createRequest('first'));
    let second = queue.acquire(createRequest('second'));

    await assert.rejects(first, error => {
      assert.equal(error.code, 'PREPARE_FAILED');
      assert.doesNotMatch(error.message, /SENSITIVE/);
      return true;
    });
    await waitFor(() => calls.includes('recover'));
    assert.deepEqual(calls, ['prepare', 'cleanup', 'recover']);
    assert.equal(queue.get('second').status, 'queued');
    assert.equal(queue.snapshot().activeUnits, 1);

    recovery.resolve();
    let secondGrant = await second;
    await queue.release(secondGrant, { status: 'complete' });
    await queue.close();
  });

  test('holds capacity until cleanup failure recovery succeeds', async () => {
    let recovery = createDeferred();
    let queue = createResourceLeaseQueue({
      capacity: 1,
      epoch: 'epoch-a',
      cleanup: async grant => {
        if (grant.requestId === 'first') {
          throw new Error('SENSITIVE_CLEANUP_DETAIL');
        }
      },
      recover: async grant => {
        if (grant.requestId === 'first') {
          await recovery.promise;
        }
      },
    });
    let firstGrant = await queue.acquire(createRequest('first'));
    let second = queue.acquire(createRequest('second'));
    let release = queue.release(firstGrant, { detail: 'SENSITIVE_OUTCOME_DETAIL' });

    await waitFor(() => queue.get('first').status === 'recovering');
    assert.equal(queue.get('second').status, 'queued');
    assert.equal(queue.snapshot().activeUnits, 1);

    recovery.resolve();
    await release;
    let secondGrant = await second;
    await queue.release(secondGrant, { status: 'complete' });
    await queue.close();
  });

  test('retains blocked capacity and exposes only structured redacted failure', async () => {
    let events = [];
    let queue = createResourceLeaseQueue({
      capacity: 1,
      epoch: 'epoch-a',
      cleanup: async () => {
        throw new Error('SENSITIVE_CLEANUP_DETAIL');
      },
      recover: async () => {
        throw new Error('SENSITIVE_RECOVERY_DETAIL');
      },
    });
    let grant = await queue.acquire(createRequest('blocked'), {
      onEvent: event => events.push(event),
    });

    await assert.rejects(queue.release(grant, { detail: 'SENSITIVE_OUTCOME_DETAIL' }), error => {
      assert.equal(error.code, 'RESOURCE_BLOCKED');
      assert.equal(error.message, 'Resource recovery failed; capacity remains blocked.');
      return true;
    });

    let publicState = stringify({
      get: queue.get('blocked'),
      list: queue.list(),
      snapshot: queue.snapshot(),
      events,
    });
    assert.match(publicState, /RECOVERY_FAILED/);
    assert.doesNotMatch(publicState, /SENSITIVE/);
    assert.equal(queue.snapshot().activeUnits, 1);
    assert.equal(queue.snapshot().blockedUnits, 1);
    await assert.rejects(queue.close(), error => error.code === 'RESOURCE_BLOCKED');
  });

  test('queued abort rejects with AbortError and removes the listener', async () => {
    let queue = createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a' });
    let blocker = await queue.acquire(createRequest('blocker'));
    let tracking = createTrackingSignal();
    let queued = queue.acquire(createRequest('queued'), { signal: tracking.signal });

    assert.equal(tracking.getListenerCount(), 1);
    tracking.abort();
    await assert.rejects(queued, error => error.name === 'AbortError' && error.code === 'ABORT_ERR');
    assert.equal(tracking.getListenerCount(), 0);
    assert.equal(queue.get('queued').status, 'cancelled');
    assert.equal(queue.snapshot().counts.queued, 0);

    await queue.release(blocker, { status: 'complete' });
    await queue.close();
  });

  test('queued cancel rejects with AbortError and redacts the reason', async () => {
    let events = [];
    let tracking = createTrackingSignal();
    let queue = createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a' });
    let blocker = await queue.acquire(createRequest('blocker'));
    let queued = queue.acquire(createRequest('queued'), {
      onEvent: event => events.push(event),
      signal: tracking.signal,
    });

    assert.equal(tracking.getListenerCount(), 1);
    assert.equal(queue.cancel('queued', 'SENSITIVE_CANCEL_REASON'), true);
    await assert.rejects(queued, error => error.name === 'AbortError');
    assert.equal(tracking.getListenerCount(), 0);
    assert.equal(queue.cancel('queued', 'again'), false);
    assert.doesNotMatch(stringify(events), /SENSITIVE/);

    await queue.release(blocker, { status: 'complete' });
    await queue.close();
  });

  test('active abort and cancel do not release the lease', async () => {
    let queue = createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a' });
    let tracking = createTrackingSignal();
    let grant = await queue.acquire(createRequest('active'), { signal: tracking.signal });

    assert.equal(tracking.getListenerCount(), 0);
    tracking.abort();
    assert.equal(queue.cancel('active', 'client-disconnected'), false);
    assert.equal(queue.get('active').status, 'active');
    assert.equal(queue.snapshot().activeUnits, 1);

    await queue.release(grant, { status: 'complete' });
    await queue.close();
  });

  test('rejects stale and forged grants without mutating capacity', async () => {
    let queue = createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a' });
    let grant = await queue.acquire(createRequest('active'));
    let forgeries = [
      { ...grant, requestId: 'other' },
      { ...grant, leaseId: 'other' },
      { ...grant, epoch: 'epoch-b' },
      { ...grant, fence: grant.fence + 1 },
      { ...grant, units: grant.units + 1 },
    ];

    for (let forged of forgeries) {
      assert.throws(() => queue.heartbeat(forged), error => error.code === 'INVALID_GRANT');
      await assert.rejects(queue.release(forged, { status: 'complete' }), error => {
        assert.equal(error.code, 'INVALID_GRANT');
        return true;
      });
      assert.equal(queue.snapshot().activeUnits, 1);
    }

    await queue.release(grant, { status: 'complete' });
    await queue.close();
  });

  test('heartbeat extends the inactivity deadline', async () => {
    let recovered = false;
    let queue = createResourceLeaseQueue({
      capacity: 1,
      epoch: 'epoch-a',
      recover: async () => {
        recovered = true;
      },
    });
    let grant = await queue.acquire(createRequest('active', {
      inactivityPolicy: { timeoutMs: 30 },
    }));
    let firstDeadline = grant.deadlineAt;
    await new Promise(resolve => setTimeout(resolve, 15));
    let renewedGrant = queue.heartbeat(grant, { secret: 'not-public' });
    await new Promise(resolve => setTimeout(resolve, 20));

    assert.ok(renewedGrant.deadlineAt > firstDeadline);
    assert.equal(queue.get('active').status, 'active');
    assert.equal(recovered, false);

    await queue.release(renewedGrant, { status: 'complete' });
    await queue.close();
  });

  test('watchdog expiry recovers before regrant and records terminal failure', async () => {
    let recovery = createDeferred();
    let events = [];
    let queue = createResourceLeaseQueue({
      capacity: 1,
      epoch: 'epoch-a',
      recover: async () => recovery.promise,
    });
    await queue.acquire(createRequest('expiring', {
      inactivityPolicy: { timeoutMs: 15 },
    }), {
      onEvent: event => events.push(event.type),
    });
    let next = queue.acquire(createRequest('next'));

    await waitFor(() => queue.get('expiring').status === 'recovering');
    assert.equal(queue.get('next').status, 'queued');
    assert.equal(queue.snapshot().activeUnits, 1);
    recovery.resolve();
    let nextGrant = await next;

    assert.equal(queue.get('expiring').status, 'failed');
    assert.equal(queue.get('expiring').failure.code, 'LEASE_EXPIRED');
    assert.deepEqual(events.slice(-2), ['recovering', 'failed']);

    await queue.release(nextGrant, { status: 'complete' });
    await queue.close();
  });

  test('duplicate release is idempotent and does not mutate capacity', async () => {
    let cleanupCount = 0;
    let queue = createResourceLeaseQueue({
      capacity: 1,
      epoch: 'epoch-a',
      cleanup: async () => {
        cleanupCount += 1;
      },
    });
    let grant = await queue.acquire(createRequest('active'));

    assert.deepEqual(await queue.release(grant, { status: 'complete' }), { status: 'completed' });
    assert.deepEqual(await queue.release(grant, { status: 'duplicate' }), { status: 'completed' });
    assert.throws(() => queue.heartbeat(grant), error => error.code === 'INVALID_GRANT_STATE');
    assert.equal(cleanupCount, 1);
    assert.equal(queue.snapshot().activeUnits, 0);

    await queue.close();
  });

  test('events and public state omit resource keys, outcomes, progress, and raw errors', async () => {
    let events = [];
    let queue = createResourceLeaseQueue({ capacity: 1, epoch: 'SENSITIVE_EPOCH' });
    let grant = await queue.acquire(createRequest('public', {
      resourceKey: 'SENSITIVE_RESOURCE_KEY',
    }), {
      onEvent: event => events.push(event),
    });
    let renewedGrant = queue.heartbeat(grant, { detail: 'SENSITIVE_PROGRESS_DETAIL' });
    await queue.release(renewedGrant, { detail: 'SENSITIVE_OUTCOME_DETAIL' });

    let publicState = stringify({
      get: queue.get('public'),
      list: queue.list(),
      snapshot: queue.snapshot(),
      events,
    });
    assert.doesNotMatch(
      publicState,
      /opaque-resource|SENSITIVE/,
    );
    assert.match(publicState, /queued/);
    assert.match(publicState, /preparing/);
    assert.match(publicState, /granted/);
    assert.match(publicState, /heartbeat/);
    assert.match(publicState, /completed/);

    await queue.close();
  });

  test('event callback failures do not corrupt queue state', async () => {
    let queue = createResourceLeaseQueue({ capacity: 1, epoch: 'epoch-a' });
    let grant = await queue.acquire(createRequest('callback'), {
      onEvent: () => {
        throw new Error('SENSITIVE_CALLBACK_DETAIL');
      },
    });

    assert.ok(queue.get('callback').callbackFailureCount >= 1);
    await queue.release(grant, { status: 'complete' });
    assert.equal(queue.get('callback').status, 'completed');
    await queue.close();
  });

  test('close rejects queued work and waits for active cleanup', async () => {
    let cleanup = createDeferred();
    let events = [];
    let tracking = createTrackingSignal();
    let queue = createResourceLeaseQueue({
      capacity: 1,
      epoch: 'epoch-a',
      cleanup: async () => cleanup.promise,
    });
    await queue.acquire(createRequest('active'), {
      onEvent: event => events.push(event.type),
    });
    let queued = queue.acquire(createRequest('queued'), { signal: tracking.signal });
    let close = queue.close();

    await assert.rejects(queued, error => error.name === 'AbortError');
    assert.equal(tracking.getListenerCount(), 0);
    assert.equal(queue.snapshot().status, 'closing');
    assert.equal(queue.snapshot().activeUnits, 1);
    cleanup.resolve();
    await close;

    assert.equal(queue.snapshot().status, 'closed');
    assert.equal(queue.snapshot().activeUnits, 0);
    assert.ok(events.includes('closed'));
  });

  test('close during prepare rejects acquisition and waits for cleanup', async () => {
    let prepare = createDeferred();
    let cleanup = createDeferred();
    let tracking = createTrackingSignal();
    let queue = createResourceLeaseQueue({
      capacity: 1,
      epoch: 'epoch-a',
      prepare: async () => prepare.promise,
      cleanup: async () => cleanup.promise,
    });
    let acquisition = queue.acquire(createRequest('preparing'), { signal: tracking.signal });
    let close = queue.close();

    await assert.rejects(acquisition, error => error.name === 'AbortError');
    assert.equal(tracking.getListenerCount(), 0);
    assert.equal(queue.snapshot().activeUnits, 1);
    prepare.resolve();
    await waitFor(() => queue.get('preparing').status === 'closed');
    assert.equal(queue.snapshot().activeUnits, 1);
    cleanup.resolve();
    await close;

    assert.equal(queue.snapshot().status, 'closed');
    assert.equal(queue.snapshot().activeUnits, 0);
  });

  test('close rejects with blocked evidence when cleanup and recovery fail', async () => {
    let queue = createResourceLeaseQueue({
      capacity: 1,
      epoch: 'epoch-a',
      cleanup: async () => {
        throw new Error('SENSITIVE_CLEANUP_DETAIL');
      },
      recover: async () => {
        throw new Error('SENSITIVE_RECOVERY_DETAIL');
      },
    });
    await queue.acquire(createRequest('active'));

    await assert.rejects(queue.close(), error => {
      assert.equal(error.code, 'RESOURCE_BLOCKED');
      assert.doesNotMatch(error.message, /SENSITIVE/);
      return true;
    });
    assert.equal(queue.snapshot().activeUnits, 1);
    assert.equal(queue.snapshot().blockedUnits, 1);
    assert.equal(queue.get('active').failure.code, 'RECOVERY_FAILED');
  });
});
