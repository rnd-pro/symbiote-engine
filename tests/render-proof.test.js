import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildRenderAvSyncProof,
  durationDriftMs,
  findProbeStream,
  normalizeProbeStreams,
  renderAuthorityDurationSec,
  streamDurationSec,
} from '../render-proof.js';

function ffprobe({ videoDuration = '1.000000', audioDuration = '1.000000', videoCodec = 'h264', audioCodec = 'aac' } = {}) {
  let streams = [
    {
      codec_type: 'video',
      codec_name: videoCodec,
      duration: videoDuration,
      width: 1280,
      height: 720,
      nb_frames: '12',
    },
  ];
  if (audioDuration !== null) {
    streams.push({
      codec_type: 'audio',
      codec_name: audioCodec,
      duration: audioDuration,
      sample_rate: '24000',
      channels: 1,
    });
  }
  return {
    streams,
    format: { duration: videoDuration },
  };
}

test('render proof normalizes probe streams and stream durations', () => {
  let probe = ffprobe({ videoDuration: '1.250000' });

  assert.equal(normalizeProbeStreams({}).length, 0);
  assert.equal(findProbeStream(probe, 'video').codec_name, 'h264');
  assert.equal(streamDurationSec({ tags: { DURATION: '2.5' } }, probe), 2.5);
  assert.equal(streamDurationSec({}, { format: { duration: '3.5' } }), 3.5);
  assert.equal(Math.round(durationDriftMs(1.1, 1)), 100);
  assert.equal(durationDriftMs(0, 1), null);
});

test('render proof validates h264/aac streams against audio-authority timing', () => {
  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe(),
    audio: { mix: { durationMs: 1000 } },
    transcript: { durationSec: 1 },
    fps: 12,
    includeAudio: true,
    thresholdMs: 40,
    frames: [{}, {}],
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.expectedDurationMs, 1000);
  assert.equal(proof.streams.video.codecName, 'h264');
  assert.equal(proof.streams.video.frames, 12);
  assert.equal(proof.streams.audio.codecName, 'aac');
  assert.equal(proof.driftsMs.videoVsAudioMs, 0);
  assert.equal(proof.driftsMs.captionsVsAuthorityMs, 0);
});

test('render proof reports codec, missing stream, and duration drift failures', () => {
  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe({ videoDuration: '1.100000', audioDuration: null, videoCodec: 'vp9' }),
    frameArtifact: { durationSec: 1 },
    fps: 1,
    includeAudio: true,
    thresholdMs: 40,
  });

  assert.equal(proof.ok, false);
  assert.match(proof.errors.join('\n'), /video stream must be h264, got vp9/);
  assert.match(proof.errors.join('\n'), /missing audio stream/);
  assert.match(proof.errors.join('\n'), /videoVsAuthorityMs 100ms exceeds 40ms/);
});

test('render proof supports no-audio mode without requiring an audio stream', () => {
  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe({ audioDuration: null }),
    frameArtifact: { durationSec: 1 },
    fps: 24,
    includeAudio: false,
    thresholdMs: 40,
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.streams.audio, null);
  assert.equal(proof.driftsMs.audioVsAuthorityMs, null);
  assert.equal(proof.driftsMs.videoVsAudioMs, null);
});

test('render proof reports caption drift and missing positive authority duration', () => {
  let captionDrift = buildRenderAvSyncProof({
    ffprobe: ffprobe(),
    audio: { mix: { durationMs: 1000 } },
    transcript: { durationSec: 1.1 },
    fps: 12,
    includeAudio: true,
    thresholdMs: 40,
  });
  let missingAuthority = buildRenderAvSyncProof({
    ffprobe: ffprobe({ videoDuration: '1.000000', audioDuration: null }),
    includeAudio: false,
    thresholdMs: 40,
    defaultDurationMs: 0,
  });

  assert.equal(captionDrift.ok, false);
  assert.match(captionDrift.errors.join('\n'), /captionsVsAuthorityMs 100ms exceeds 40ms/);
  assert.equal(missingAuthority.ok, false);
  assert.match(missingAuthority.errors.join('\n'), /missing positive audio-authority duration/);
});

test('render proof falls through authority sources when includeAudio has no audio object', () => {
  assert.equal(renderAuthorityDurationSec({ audio: { mix: { durationMs: 1200 } } }), 1.2);
  assert.equal(renderAuthorityDurationSec({ frameArtifact: { durationSec: 1.5 } }), 1.5);
  assert.equal(renderAuthorityDurationSec({ durationMs: 2000 }), 2);

  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe({ videoDuration: '1.500000', audioDuration: '1.500000' }),
    frameArtifact: { durationSec: 1.5 },
    fps: 12,
    includeAudio: true,
    thresholdMs: 40,
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.expectedDurationMs, 1500);
});
