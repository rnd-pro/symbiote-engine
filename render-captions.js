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
        speaker: attribution.speaker,
        attributionSource: attribution.source,
        cueIndex: attribution.cueIndex,
        unmappedWordCount: 0,
      };
      captionCues.push(current);
    }
    current.words.push(text);
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
        speaker: word.speaker,
        attributionSource: 'clip-transcript',
        cueIndex: word.cueIndex,
        unmappedWordCount: 0,
      };
      captionCues.push(current);
    }
    current.words.push(word.text);
    current.endSec = Math.max(current.endSec, word.endSec);
  }
  return captionCues.filter((cue) => cue.words.join(' ').trim());
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
} = {}) {
  let useClipTranscripts = sequenceMode === 'overlap'
    && Array.isArray(clipTranscripts)
    && clipTranscripts.length > 0;
  let cues = useClipTranscripts
    ? captionCuesFromClipTranscripts(clipTranscripts)
    : captionCuesFromTranscript(transcript, sourceCues);
  return {
    cues,
    vtt: renderVtt(cues),
    source: useClipTranscripts ? 'whisper+clip-range-map' : 'whisper+range-map',
  };
}
