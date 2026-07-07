import { captionTranscriptDurationSec } from './render-captions.js';
import { finitePositiveNumber } from './render-utils.js';

export function normalizeProbeStreams(ffprobe = {}) {
  return Array.isArray(ffprobe?.streams) ? ffprobe.streams : [];
}

export function findProbeStream(ffprobe = {}, codecType = '') {
  return normalizeProbeStreams(ffprobe).find((stream) => stream?.codec_type === codecType) || null;
}

export function streamDurationSec(stream = {}, ffprobe = {}) {
  let safeStream = stream || {};
  return finitePositiveNumber(
    safeStream.duration,
    finitePositiveNumber(safeStream.tags?.DURATION, finitePositiveNumber(ffprobe?.format?.duration, 0)),
  );
}

export function renderAuthorityDurationSec({
  audio = {},
  frameArtifact = {},
  durationMs = 0,
  defaultDurationMs = 0,
} = {}) {
  let audioDuration = finitePositiveNumber(audio?.mix?.durationMs, 0) / 1000;
  if (audioDuration > 0) return audioDuration;
  let frameDuration = finitePositiveNumber(frameArtifact?.durationSec, 0);
  if (frameDuration > 0) return frameDuration;
  return finitePositiveNumber(durationMs, defaultDurationMs) / 1000;
}

export function durationDriftMs(actualSec, expectedSec) {
  if (!Number.isFinite(actualSec) || actualSec <= 0 || !Number.isFinite(expectedSec) || expectedSec <= 0) return null;
  return Math.abs(actualSec - expectedSec) * 1000;
}

export function buildRenderAvSyncProof(options = {}) {
  let {
    ffprobe = {},
    audio = {},
    frameArtifact = {},
    transcript = {},
    fps = 1,
    durationMs = 0,
    includeAudio = false,
    frames = [],
    thresholdMs,
    defaultDurationMs = 0,
    expectedVideoCodec = 'h264',
    expectedAudioCodec = 'aac',
  } = options || {};
  let safeFps = Math.max(1, Number(fps) || 1);
  let frameDurationMs = 1000 / safeFps;
  let safeThresholdMs = finitePositiveNumber(thresholdMs, frameDurationMs);
  let videoStream = findProbeStream(ffprobe, 'video');
  let audioStream = findProbeStream(ffprobe, 'audio');
  let expectedDurationSec = renderAuthorityDurationSec({
    audio,
    frameArtifact,
    durationMs,
    defaultDurationMs,
  });
  let videoDurationSec = streamDurationSec(videoStream, ffprobe);
  let audioDurationSec = streamDurationSec(audioStream, ffprobe);
  let captionDurationSec = captionTranscriptDurationSec(transcript);
  let drifts = {
    videoVsAuthorityMs: durationDriftMs(videoDurationSec, expectedDurationSec),
    audioVsAuthorityMs: includeAudio ? durationDriftMs(audioDurationSec, expectedDurationSec) : null,
    videoVsAudioMs: includeAudio ? durationDriftMs(videoDurationSec, audioDurationSec) : null,
    captionsVsAuthorityMs: includeAudio && captionDurationSec > 0
      ? durationDriftMs(captionDurationSec, expectedDurationSec)
      : null,
  };
  let errors = [];
  if (!videoStream) errors.push('missing video stream');
  if (videoStream && expectedVideoCodec && videoStream.codec_name !== expectedVideoCodec) {
    errors.push(`video stream must be ${expectedVideoCodec}, got ${videoStream.codec_name || 'unknown'}`);
  }
  if (includeAudio && !audioStream) errors.push('missing audio stream');
  if (includeAudio && audioStream && expectedAudioCodec && audioStream.codec_name !== expectedAudioCodec) {
    errors.push(`audio stream must be ${expectedAudioCodec}, got ${audioStream.codec_name || 'unknown'}`);
  }
  if (expectedDurationSec <= 0) errors.push('missing positive audio-authority duration');
  for (let [name, value] of Object.entries(drifts)) {
    if (value !== null && value > safeThresholdMs) errors.push(`${name} ${Math.round(value)}ms exceeds ${Math.round(safeThresholdMs)}ms`);
  }
  return {
    ok: errors.length === 0,
    errors,
    expectedDurationMs: Math.round(expectedDurationSec * 1000),
    thresholdMs: Math.round(safeThresholdMs),
    frameDurationMs: Math.round(frameDurationMs * 1000) / 1000,
    fps,
    streams: {
      video: videoStream ? {
        codecName: videoStream.codec_name || '',
        durationMs: Math.round(videoDurationSec * 1000),
        width: Number(videoStream.width || 0),
        height: Number(videoStream.height || 0),
        frames: Number(videoStream.nb_frames || (Array.isArray(frames) ? frames.length : 0) || 0),
      } : null,
      audio: audioStream ? {
        codecName: audioStream.codec_name || '',
        durationMs: Math.round(audioDurationSec * 1000),
        sampleRate: Number(audioStream.sample_rate || 0),
        channels: Number(audioStream.channels || 0),
      } : null,
    },
    driftsMs: Object.fromEntries(Object.entries(drifts).map(([key, value]) => [
      key,
      value === null ? null : Math.round(value),
    ])),
  };
}
