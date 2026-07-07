import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyRenderError,
  isRenderTimeout,
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
