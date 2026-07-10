import { cleanString, finiteNonNegativeNumber } from './render-utils.js';

export function captionWordTimeSeconds(word = {}, key, fallback = 0) {
  let value = word[`${key}Sec`] ?? word[key] ?? fallback;
  let number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function overlapMs(aStartMs, aEndMs, bStartMs, bEndMs) {
  return Math.max(0, Math.min(aEndMs, bEndMs) - Math.max(aStartMs, bStartMs));
}

export function captionAttributionForRange(startSec, endSec, cues = []) {
  let startMs = Math.max(0, Number(startSec || 0) * 1000);
  let endMs = Math.max(startMs + 1, Number(endSec || startSec || 0) * 1000);
  let best = null;
  for (let cue of Array.isArray(cues) ? cues : []) {
    let cueStartMs = finiteNonNegativeNumber(cue?.startMs, null);
    let cueEndMs = finiteNonNegativeNumber(cue?.endMs, null);
    if (cueStartMs === null || cueEndMs === null) continue;
    let overlap = overlapMs(startMs, endMs, cueStartMs, cueEndMs);
    if (!best || overlap > best.overlapMs) {
      best = {
        speaker: cleanString(cue?.speaker, ''),
        cueIndex: Number.isFinite(Number(cue?.index)) ? Number(cue.index) : null,
        overlapMs: overlap,
      };
    }
  }
  if (best?.overlapMs > 0 && best.speaker) return { ...best, source: 'range-map' };
  return { speaker: '', cueIndex: null, overlapMs: 0, source: 'unmapped' };
}

function formatVttTimestamp(seconds) {
  let totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  let ms = totalMs % 1000;
  let totalSeconds = Math.floor(totalMs / 1000);
  let sec = totalSeconds % 60;
  let totalMinutes = Math.floor(totalSeconds / 60);
  let min = totalMinutes % 60;
  let hour = Math.floor(totalMinutes / 60);
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function escapeVttText(value) {
  return cleanString(value, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function finitePositiveNumber(value, fallback = 0) {
  let number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function assColor(value, fallback) {
  let text = cleanString(value, '');
  let hex = text.startsWith('#') ? text.slice(1) : text;
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    let rr = hex.slice(0, 2);
    let gg = hex.slice(2, 4);
    let bb = hex.slice(4, 6);
    return `&H00${bb}${gg}${rr}`.toUpperCase();
  }
  return fallback;
}

export function resolveCaptionStyle(input = {}) {
  let source = input && typeof input === 'object' ? input : {};
  let preset = cleanString(source.preset, 'tiktok') || 'tiktok';
  return {
    preset,
    fontName: cleanString(source.fontName || source.font, 'Arial'),
    fontSize: Math.round(finitePositiveNumber(source.fontSize, preset === 'tiktok' ? 28 : 22)),
    marginV: Math.round(finiteNonNegativeNumber(source.marginV, preset === 'tiktok' ? 80 : 52)),
    primaryColor: assColor(source.color, '&H00FFFFFF'),
    highlightColor: assColor(source.highlightColor, '&H0000FFFF'),
    outlineColor: assColor(source.outlineColor, '&H80000000'),
    backColor: assColor(source.backgroundColor || source.backColor, '&H7A000000'),
  };
}

function escapeAssText(value) {
  return cleanString(value, '')
    .replace(/[{}\r\n]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatAssTimestamp(seconds) {
  let totalCs = Math.max(0, Math.round(Number(seconds || 0) * 100));
  let cs = totalCs % 100;
  let totalSeconds = Math.floor(totalCs / 100);
  let sec = totalSeconds % 60;
  let totalMinutes = Math.floor(totalSeconds / 60);
  let min = totalMinutes % 60;
  let hour = Math.floor(totalMinutes / 60);
  return `${hour}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function cueText(cue = {}) {
  return Array.isArray(cue.words) ? cue.words.join(' ') : cleanString(cue.text, '');
}

export function captionCueHasWordTimings(cue = {}) {
  return Array.isArray(cue.wordTimings) && cue.wordTimings.length > 0;
}

function assKaraokeText(cue = {}) {
  let timings = Array.isArray(cue.wordTimings) ? cue.wordTimings : [];
  if (!timings.length) return escapeAssText(cueText(cue));
  let cursorSec = Math.max(0, Number(cue.startSec || 0));
  let parts = [];
  for (let word of timings) {
    let startSec = Math.max(cursorSec, Number(word.startSec || cursorSec));
    let endSec = Math.max(startSec + 0.01, Number(word.endSec || startSec + 0.35));
    let durationCs = Math.max(1, Math.round((endSec - cursorSec) * 100));
    parts.push(`{\\k${durationCs}}${escapeAssText(word.text)}`);
    cursorSec = endSec;
  }
  let tailCs = Math.max(0, Math.round((Number(cue.endSec || cursorSec) - cursorSec) * 100));
  if (tailCs > 0) parts.push(`{\\k${tailCs}}`);
  return parts.join(' ');
}

export function renderAss(cues = [], options = {}) {
  let style = resolveCaptionStyle(options.captionStyle || options.style || {});
  let safeCues = (Array.isArray(cues) ? cues : []).filter((cue) => cueText(cue));
  let hasTimedWords = safeCues.some(captionCueHasWordTimings);
  if (!safeCues.length || !hasTimedWords) return '';
  let header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'PlayResX: 1080',
    'PlayResY: 1920',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: TikTok,${style.fontName},${style.fontSize},${style.primaryColor},${style.highlightColor},${style.outlineColor},${style.backColor},-1,0,0,0,100,100,0,0,3,1,1,2,40,40,${style.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  let events = safeCues.map((cue) => [
    'Dialogue: 0',
    formatAssTimestamp(cue.startSec),
    formatAssTimestamp(cue.endSec),
    'TikTok',
    escapeAssText(cue.speaker || ''),
    '0000',
    '0000',
    '0000',
    '',
    assKaraokeText(cue),
  ].join(','));
  return `${header.concat(events).join('\n')}\n`;
}

export function captionTranscriptDurationSec(transcript = {}) {
  let explicit = Number(transcript.durationSec ?? transcript.duration ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  let words = Array.isArray(transcript.words) ? transcript.words : [];
  return words.reduce((max, word) => Math.max(max, captionWordTimeSeconds(word, 'end', 0)), 0);
}

export function captionCuesFromTranscript(transcript = {}, cues = []) {
  let words = Array.isArray(transcript.words) ? transcript.words : [];
  let captionCues = [];
  let current = null;
  for (let word of words) {
    let text = cleanString(word?.word || word?.text, '');
    if (!text) continue;
    let startSec = captionWordTimeSeconds(word, 'start', current?.endSec || 0);
    let endSec = Math.max(startSec + 0.05, captionWordTimeSeconds(word, 'end', startSec + 0.35));
    let attribution = captionAttributionForRange(startSec, endSec, cues);
    let gapSec = current ? startSec - current.endSec : 0;
    let shouldBreak = !current
      || current.speaker !== attribution.speaker
      || current.words.length >= 7
      || gapSec > 0.75
      || /[.!?]$/.test(current.words[current.words.length - 1] || '');
    if (shouldBreak) {
      current = {
        startSec,
        endSec,
        words: [],
        wordTimings: [],
        speaker: attribution.speaker,
        attributionSource: attribution.source,
        cueIndex: attribution.cueIndex,
        unmappedWordCount: 0,
      };
      captionCues.push(current);
    }
    current.words.push(text);
    current.wordTimings.push({ text, startSec, endSec });
    current.endSec = Math.max(current.endSec, endSec);
    if (attribution.source === 'unmapped') current.unmappedWordCount += 1;
  }
  if (!captionCues.length && transcript.text) {
    let durationSec = Number(transcript.durationSec || transcript.duration || 0);
    let safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 1;
    let attribution = captionAttributionForRange(0, safeDuration, cues);
    captionCues.push({
      startSec: 0,
      endSec: safeDuration,
      words: [cleanString(transcript.text, '')],
      wordTimings: [],
      speaker: attribution.speaker,
      attributionSource: attribution.source,
      cueIndex: attribution.cueIndex,
      unmappedWordCount: attribution.source === 'unmapped' ? 1 : 0,
    });
  }
  return captionCues.filter((cue) => cue.words.join(' ').trim());
}

export function captionCuesFromClipTranscripts(clipTranscripts = []) {
  let words = [];
  for (let clip of Array.isArray(clipTranscripts) ? clipTranscripts : []) {
    for (let word of Array.isArray(clip.words) ? clip.words : []) {
      let text = cleanString(word?.word || word?.text, '');
      if (!text) continue;
      let startSec = captionWordTimeSeconds(word, 'start', 0);
      let endSec = Math.max(startSec + 0.05, captionWordTimeSeconds(word, 'end', startSec + 0.35));
      words.push({
        text,
        startSec,
        endSec,
        speaker: cleanString(clip.speaker, ''),
        cueIndex: Number.isFinite(Number(clip.cueIndex)) ? Number(clip.cueIndex) : null,
      });
    }
  }
  words.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec || a.speaker.localeCompare(b.speaker));
  let captionCues = [];
  let current = null;
  for (let word of words) {
    let gapSec = current ? word.startSec - current.endSec : 0;
    let shouldBreak = !current
      || current.speaker !== word.speaker
      || current.words.length >= 7
      || gapSec > 0.75
      || /[.!?]$/.test(current.words[current.words.length - 1] || '');
    if (shouldBreak) {
      current = {
        startSec: word.startSec,
        endSec: word.endSec,
        words: [],
        wordTimings: [],
        speaker: word.speaker,
        attributionSource: 'clip-transcript',
        cueIndex: word.cueIndex,
        unmappedWordCount: 0,
      };
      captionCues.push(current);
    }
    current.words.push(word.text);
    current.wordTimings.push({ text: word.text, startSec: word.startSec, endSec: word.endSec });
    current.endSec = Math.max(current.endSec, word.endSec);
  }
  return captionCues.filter((cue) => cue.words.join(' ').trim());
}

function hasTimedClipTranscriptWords(clipTranscripts = []) {
  return (Array.isArray(clipTranscripts) ? clipTranscripts : []).some((clip) => (
    Array.isArray(clip?.words)
    && clip.words.some((word) => cleanString(word?.word || word?.text, ''))
  ));
}

export function renderVtt(cues = []) {
  let includeSpeaker = new Set(cues.map((cue) => cleanString(cue.speaker, '')).filter(Boolean)).size > 1;
  let lines = ['WEBVTT', ''];
  cues.forEach((cue, index) => {
    lines.push(String(index + 1));
    lines.push(`${formatVttTimestamp(cue.startSec)} --> ${formatVttTimestamp(cue.endSec)}`);
    let text = cue.words.join(' ');
    if (includeSpeaker && cue.speaker) text = `${cue.speaker.toUpperCase()}: ${text}`;
    lines.push(escapeVttText(text));
    lines.push('');
  });
  return `${lines.join('\n')}\n`;
}

export function buildCaptionCues({
  transcript = {},
  cues: sourceCues = [],
  clipTranscripts = [],
  sequenceMode = '',
  captionStyle = {},
} = {}) {
  let useClipTranscripts = hasTimedClipTranscriptWords(clipTranscripts);
  let cues = useClipTranscripts
    ? captionCuesFromClipTranscripts(clipTranscripts)
    : captionCuesFromTranscript(transcript, sourceCues);
  return {
    cues,
    vtt: renderVtt(cues),
    ass: renderAss(cues, { captionStyle }),
    source: useClipTranscripts ? 'whisper+clip-range-map' : 'whisper+range-map',
  };
}
