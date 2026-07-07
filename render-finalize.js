import { cleanString, finiteNonNegativeNumber, finitePositiveNumber, isObject } from './render-utils.js';

function compact(value) {
  if (Array.isArray(value)) {
    let items = value.map(compact).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (!isObject(value)) {
    if (value === undefined || value === null || value === '') return undefined;
    return value;
  }
  let entries = Object.entries(value)
    .filter(([key]) => !['url', 'href', 'path', 'publicUrl', 'navigableUrl', 'route'].includes(key))
    .map(([key, item]) => [key, compact(item)])
    .filter(([, item]) => item !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function codecValue(value, fallback) {
  return cleanString(value, fallback) || fallback;
}

function optionalNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  return finiteNonNegativeNumber(value, null);
}

export function buildFrameSequenceEncodeArgs(options = {}) {
  let {
    fps = 1,
    frameInput = '',
    outputPath = '',
    audioPath = '',
    width = 0,
    height = 0,
    startNumber = null,
    videoCodec = 'libx264',
    preset = 'fast',
    crf = '18',
    pixelFormat = 'yuv420p',
    scaleFilter = '',
    audioCodec = 'aac',
    audioBitrate = '192k',
  } = options || {};
  let safeFrameInput = cleanString(frameInput, '');
  let safeOutputPath = cleanString(outputPath, '');
  if (!safeFrameInput) throw new Error('frame sequence encode requires frameInput');
  if (!safeOutputPath) throw new Error('frame sequence encode requires outputPath');

  let args = [
    '-y',
    '-framerate', String(Math.max(1, Number(fps) || 1)),
  ];
  let safeStartNumber = optionalNonNegativeNumber(startNumber);
  if (safeStartNumber !== null) args.push('-start_number', String(Math.round(safeStartNumber)));
  args.push('-i', safeFrameInput);

  let safeAudioPath = cleanString(audioPath, '');
  if (safeAudioPath) args.push('-i', safeAudioPath);
  args.push(
    '-c:v', codecValue(videoCodec, 'libx264'),
    '-preset', codecValue(preset, 'fast'),
    '-crf', String(crf ?? '18'),
    '-pix_fmt', codecValue(pixelFormat, 'yuv420p'),
  );
  let resolvedScaleFilter = cleanString(scaleFilter, '');
  let safeWidth = finitePositiveNumber(width, 0);
  let safeHeight = finitePositiveNumber(height, 0);
  if (!resolvedScaleFilter && safeWidth > 0 && safeHeight > 0) {
    resolvedScaleFilter = `scale=${Math.round(safeWidth)}:${Math.round(safeHeight)}`;
  }
  if (resolvedScaleFilter) args.push('-vf', resolvedScaleFilter);
  if (safeAudioPath) {
    args.push('-c:a', codecValue(audioCodec, 'aac'), '-b:a', codecValue(audioBitrate, '192k'));
  }
  args.push(safeOutputPath);
  return args;
}

export function buildAudioMuxArgs(options = {}) {
  let {
    videoPath = '',
    audioSources = [],
    filterComplex = '',
    audioMapLabel = '[aout]',
    outputPath = '',
    audioBitrate = '192k',
  } = options || {};
  let safeAudioSources = Array.isArray(audioSources) ? audioSources : [];
  if (!safeAudioSources.length) return null;
  let safeVideoPath = cleanString(videoPath, '');
  let safeOutputPath = cleanString(outputPath, '');
  let safeFilterComplex = cleanString(filterComplex, '');
  let safeAudioMapLabel = cleanString(audioMapLabel, '[aout]') || '[aout]';
  if (!safeVideoPath) throw new Error('audio mux requires videoPath');
  if (!safeOutputPath) throw new Error('audio mux requires outputPath');
  if (!safeFilterComplex) throw new Error('audio mux requires filterComplex');

  let args = ['-y', '-i', safeVideoPath];
  for (let source of safeAudioSources) {
    let src = cleanString(source?.src, '');
    if (!src) throw new Error('audio mux source requires src');
    args.push('-i', src);
  }
  args.push(
    '-filter_complex', safeFilterComplex,
    '-map', '0:v:0',
    '-map', safeAudioMapLabel,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', codecValue(audioBitrate, '192k'),
    '-shortest',
    safeOutputPath,
  );
  return args;
}

export function parseFfprobeJson(stdout = '') {
  try {
    let parsed = JSON.parse(String(stdout || '{}'));
    return isObject(parsed) ? parsed : {};
  } catch (error) {
    let failure = new Error(`ffprobe output is not valid JSON: ${error?.message || String(error)}`);
    failure.code = 'E_FFPROBE_JSON';
    throw failure;
  }
}

export function buildRenderProofManifestProjection(input = {}) {
  let projection = compact({
    version: 1,
    cacheKey: input.cacheKey,
    frameCacheKey: input.frameCacheKey,
    renderSeedProjection: input.renderSeedProjection,
    providerId: input.providerId,
    renderQueue: input.renderQueue,
    usesTrackDemoFrames: input.usesTrackDemoFrames === true ? true : input.usesTrackDemoFrames === false ? false : undefined,
    frameCount: input.frameCount,
    frameSequenceCleaned: input.frameSequenceCleaned === true,
    frames: input.frames,
    visualFrame: input.visualFrame,
    audio: input.audio,
    transcript: input.transcript,
    clipTranscripts: input.clipTranscripts,
    captions: input.captions,
    output: input.output,
    ffprobe: input.ffprobe,
    avSync: input.avSync,
    cleanup: input.cleanup,
    cleanupError: input.cleanupError,
    progressTimeline: input.progressTimeline,
    stageDurations: input.stageDurations,
  });
  return projection || {};
}
