import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildAudioMuxArgs,
  buildFrameSequenceEncodeArgs,
  buildRenderProofManifestProjection,
  parseFfprobeJson,
} from '../render-finalize.js';

test('render finalize builds frame sequence x264 args with optional audio', () => {
  assert.deepEqual(
    buildFrameSequenceEncodeArgs({
      fps: 12,
      frameInput: '/cache/frames/frame-%05d.png',
      audioPath: '/cache/audio/narration.wav',
      width: 1280,
      height: 720,
      outputPath: '/cache/render.mp4',
    }),
    [
      '-y',
      '-framerate', '12',
      '-i', '/cache/frames/frame-%05d.png',
      '-i', '/cache/audio/narration.wav',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=1280:720',
      '-c:a', 'aac',
      '-b:a', '192k',
      '/cache/render.mp4',
    ],
  );

  assert.deepEqual(
    buildFrameSequenceEncodeArgs({
      fps: 30,
      startNumber: 4,
      frameInput: 'frames/frame_%05d.png',
      scaleFilter: 'scale=640:360',
      outputPath: 'silent.mp4',
    }),
    [
      '-y',
      '-framerate', '30',
      '-start_number', '4',
      '-i', 'frames/frame_%05d.png',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=640:360',
      'silent.mp4',
    ],
  );
});

test('render finalize builds reusable audio mux args from a caller-owned filter graph', () => {
  assert.equal(buildAudioMuxArgs({ videoPath: 'in.mp4', audioSources: [], outputPath: 'out.mp4' }), null);

  let args = buildAudioMuxArgs({
    videoPath: 'in.mp4',
    audioSources: [{ src: 'a.wav' }, { src: 'b.wav' }],
    filterComplex: '[1:a]apad[a0];[2:a]apad[a1];[a0][a1]amix=inputs=2[aout]',
    audioMapLabel: '[aout]',
    outputPath: 'out.mp4',
    audioBitrate: '256k',
  });

  assert.deepEqual(args, [
    '-y',
    '-i', 'in.mp4',
    '-i', 'a.wav',
    '-i', 'b.wav',
    '-filter_complex', '[1:a]apad[a0];[2:a]apad[a1];[a0][a1]amix=inputs=2[aout]',
    '-map', '0:v:0',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '256k',
    '-shortest',
    'out.mp4',
  ]);
});

test('render finalize parses ffprobe JSON loudly', () => {
  assert.deepEqual(parseFfprobeJson('{"streams":[{"codec_type":"video"}]}'), {
    streams: [{ codec_type: 'video' }],
  });
  assert.throws(() => parseFfprobeJson('{nope'), /ffprobe output is not valid JSON/);
});

test('render finalize projects neutral proof manifests without route or URL fields', () => {
  let manifest = buildRenderProofManifestProjection({
    cacheKey: 'render:a',
    frameCacheKey: 'frame:b',
    providerId: 'browser-headless-screencast',
    usesTrackDemoFrames: false,
    frames: [{ index: 0, elapsedMs: 0, url: 'https://example.test/frame.png', path: '/tmp/frame.png' }],
    visualFrame: { index: 0, url: 'https://example.test/proof.png', path: '/tmp/proof.png' },
    audio: {
      sequenceMode: 'sequential',
      mix: { artifactId: 'sha256:1', url: 'https://example.test/audio.wav', path: '/tmp/audio.wav' },
      items: [{ voiceRef: 'voice-a', url: 'https://example.test/item.wav', path: '/tmp/item.wav' }],
    },
    output: { url: 'https://example.test/render.mp4', path: '/tmp/render.mp4', sha256: 'abc' },
    renderSeedProjection: { surface: { route: '/private?token=secret' } },
    ffprobe: { streams: [] },
    avSync: { ok: true },
  });

  let json = JSON.stringify(manifest);
  assert.equal(manifest.usesTrackDemoFrames, false);
  assert.equal(manifest.output.sha256, 'abc');
  assert.equal(manifest.frames[0].index, 0);
  assert.doesNotMatch(json, /https?:/);
  assert.doesNotMatch(json, /\/tmp\//);
  assert.doesNotMatch(json, /route/);
  assert.doesNotMatch(json, /token/);
});
