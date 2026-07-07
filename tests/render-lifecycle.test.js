import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildTerminalRenderJobPatch,
  classifyRenderError,
  isRenderTimeout,
  isTerminalRenderStatus,
  mapRenderEventToProgress,
} from '../render-lifecycle.js';

test('render lifecycle maps provider events to engine progress phases', () => {
  assert.deepEqual(mapRenderEventToProgress({ type: 'render-job:queued', stage: 'queued' }), {
    phase: 'queue',
    stage: 'queued',
    progress: 0.52,
  });
  assert.deepEqual(mapRenderEventToProgress({ type: 'render-job:stage', stage: 'fonts:ready' }), {
    phase: 'browser',
    stage: 'fonts:ready',
    progress: 0.57,
  });
  assert.deepEqual(mapRenderEventToProgress({ type: 'render-job:stage', stage: 'frame-sequence:done' }), {
    phase: 'capture',
    stage: 'frame-sequence:done',
    progress: 0.84,
  });
  assert.deepEqual(mapRenderEventToProgress({ type: 'render-job:stage', stage: 'cleanup:done' }, { currentProgress: 0.91 }), {
    phase: 'cleanup',
    stage: 'cleanup:done',
    progress: 0.91,
  });
});

test('render lifecycle maps frame progress events without host state', () => {
  assert.deepEqual(mapRenderEventToProgress({
    type: 'render-job:progress',
    progress: { stage: 'capture:frame', progress: 0.5, frame: 10, frames: 20 },
  }), {
    phase: 'capture',
    stage: 'capture:frame',
    progress: 0.7,
  });
  assert.equal(mapRenderEventToProgress({
    type: 'render-job:progress',
    progress: { stage: 'capture:frame', progress: 4 },
  }).progress, 0.82);
});

test('render lifecycle classifies render errors by stable kind and code', () => {
  assert.deepEqual(classifyRenderError({ timeout: true, error: { message: 'waited too long', code: 'TIMEOUT' } }), {
    kind: 'timeout',
    code: 'TIMEOUT',
    detail: 'waited too long',
  });
  assert.deepEqual(classifyRenderError({ canceled: true, message: 'operator canceled' }), {
    kind: 'canceled',
    code: 'RENDER_JOB_CANCELED',
    detail: 'operator canceled',
  });
  assert.deepEqual(classifyRenderError({ message: 'provider exploded', code: 'E_PROVIDER' }), {
    kind: 'failed',
    code: 'E_PROVIDER',
    detail: 'provider exploded',
  });
  assert.equal(isRenderTimeout({ error: { code: 'TIMEOUT' } }), true);
  assert.equal(isRenderTimeout({ code: 'E_PROVIDER' }), false);
});

test('render lifecycle exposes terminal render status vocabulary', () => {
  for (let status of ['succeeded', 'failed', 'canceled', 'timeout']) {
    assert.equal(isTerminalRenderStatus(status), true);
  }
  for (let status of ['running', 'queued', '', 'unknown']) {
    assert.equal(isTerminalRenderStatus(status), false);
  }
});

test('render lifecycle builds neutral terminal failure patches', () => {
  assert.deepEqual(buildTerminalRenderJobPatch({ message: 'provider failed', code: 'E_PROVIDER' }), {
    status: 'failed',
    error: 'provider failed',
  });
  assert.equal('timeout' in buildTerminalRenderJobPatch({ message: 'provider failed' }), false);
  assert.equal('cancelReason' in buildTerminalRenderJobPatch({ message: 'provider failed' }), false);
});

test('render lifecycle builds neutral timeout patches with id fallbacks', () => {
  assert.deepEqual(buildTerminalRenderJobPatch(
    { code: 'RENDER_JOB_TIMEOUT', timeoutReason: 'browser waited too long', renderJobId: 'render-direct' },
    { renderJobId: 'render-fallback', audioJobId: 'audio-fallback' },
  ), {
    status: 'timeout',
    timeout: true,
    timeoutReason: 'browser waited too long',
    error: 'browser waited too long',
    renderJobId: 'render-direct',
    audioJobId: 'audio-fallback',
  });
  assert.deepEqual(buildTerminalRenderJobPatch(
    { timeout: true, message: 'audio waited too long', audioJobId: 'audio-direct' },
    { renderJobId: 'render-fallback', audioJobId: 'audio-fallback' },
  ), {
    status: 'timeout',
    timeout: true,
    timeoutReason: 'audio waited too long',
    error: 'audio waited too long',
    renderJobId: 'render-fallback',
    audioJobId: 'audio-direct',
  });
});

test('render lifecycle lets cancel override failed error classification', () => {
  let abort = new Error('operator canceled');
  abort.name = 'AbortError';
  assert.deepEqual(buildTerminalRenderJobPatch(abort), {
    status: 'canceled',
    cancelReason: 'operator canceled',
  });
  assert.deepEqual(buildTerminalRenderJobPatch({ message: 'provider failed' }, {
    cancelRequested: true,
    cancelReason: 'user stopped render',
  }), {
    status: 'canceled',
    cancelReason: 'user stopped render',
  });
  assert.equal('error' in buildTerminalRenderJobPatch({ canceled: true }), false);
});

test('render lifecycle leaves terminal patch strings raw for host redaction', () => {
  let raw = `failed at https://example.invalid/render?auth=raw-value with ${'Bear'}er raw.token`;
  assert.deepEqual(buildTerminalRenderJobPatch({ message: raw }), {
    status: 'failed',
    error: raw,
  });
});
