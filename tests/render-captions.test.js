import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCaptionCues,
  captionAttributionForRange,
  captionCuesFromClipTranscripts,
  captionCuesFromTranscript,
  captionTranscriptDurationSec,
  captionWordTimeSeconds,
  overlapMs,
  renderVtt,
} from '../render-captions.js';

function word(text, startSec, endSec) {
  return { word: text, startSec, endSec };
}

test('caption transcript cues group by speaker, max words, gaps, and sentence breaks', () => {
  let cues = [
    { index: 0, startMs: 0, endMs: 3500, speaker: 'guide' },
    { index: 1, startMs: 4500, endMs: 6200, speaker: 'ops' },
  ];
  let transcript = {
    words: [
      word('one', 0, 0.2),
      word('two', 0.25, 0.45),
      word('three', 0.5, 0.7),
      word('four', 0.75, 0.95),
      word('five', 1, 1.2),
      word('six', 1.25, 1.45),
      word('seven', 1.5, 1.7),
      word('eight', 1.75, 1.95),
      word('gap', 3, 3.2),
      word('ops', 4.6, 4.8),
      word('done.', 4.9, 5.1),
      word('next', 5.2, 5.4),
    ],
  };

  let result = captionCuesFromTranscript(transcript, cues);

  assert.deepEqual(result.map((cue) => cue.words.join(' ')), [
    'one two three four five six seven',
    'eight',
    'gap',
    'ops done.',
    'next',
  ]);
  assert.deepEqual(result.map((cue) => cue.speaker), ['guide', 'guide', 'guide', 'ops', 'ops']);
  assert.equal(result[0].attributionSource, 'range-map');
});

test('caption transcript cues fall back to transcript text when words are missing', () => {
  let result = captionCuesFromTranscript(
    { text: 'hello fallback', durationSec: 2.5 },
    [{ index: 2, startMs: 0, endMs: 2500, speaker: 'guide' }],
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].words.join(' '), 'hello fallback');
  assert.equal(result[0].endSec, 2.5);
  assert.equal(result[0].speaker, 'guide');
});

test('caption clip transcripts sort across clips and preserve speaker attribution', () => {
  let result = captionCuesFromClipTranscripts([
    {
      speaker: 'ops',
      cueIndex: 2,
      words: [word('second', 2, 2.2)],
    },
    {
      speaker: 'guide',
      cueIndex: 1,
      words: [word('first', 0.2, 0.5), word('phrase.', 0.6, 0.9), word('after', 1, 1.2)],
    },
  ]);

  assert.deepEqual(result.map((cue) => cue.words.join(' ')), ['first phrase.', 'after', 'second']);
  assert.deepEqual(result.map((cue) => cue.speaker), ['guide', 'guide', 'ops']);
  assert.equal(result.every((cue) => cue.attributionSource === 'clip-transcript'), true);
});

test('caption attribution chooses the largest cue overlap and reports unmapped ranges', () => {
  let cues = [
    { index: 0, startMs: 0, endMs: 1000, speaker: 'guide' },
    { index: 1, startMs: 800, endMs: 2200, speaker: 'ops' },
  ];

  assert.equal(overlapMs(0, 100, 50, 150), 50);
  assert.deepEqual(captionAttributionForRange(0.9, 1.4, cues), {
    speaker: 'ops',
    cueIndex: 1,
    overlapMs: 500,
    source: 'range-map',
  });
  assert.deepEqual(captionAttributionForRange(3, 3.2, cues), {
    speaker: '',
    cueIndex: null,
    overlapMs: 0,
    source: 'unmapped',
  });
});

test('renderVtt formats timestamps, speaker prefixes, escaping, and trailing newline', () => {
  let output = renderVtt([
    { startSec: -1, endSec: 1.234, speaker: 'guide', words: ['A&B', '<ok>'] },
    { startSec: 3661.2, endSec: 3661.234, speaker: 'ops', words: ['done'] },
  ]);

  assert.equal(output, [
    'WEBVTT',
    '',
    '1',
    '00:00:00.000 --> 00:00:01.234',
    'GUIDE: A&amp;B &lt;ok&gt;',
    '',
    '2',
    '01:01:01.200 --> 01:01:01.234',
    'OPS: done',
    '',
    '',
  ].join('\n'));
});

test('caption helpers expose duration, word time, and caption build source', () => {
  assert.equal(captionWordTimeSeconds({ end: 1.25 }, 'end', 0), 1.25);
  assert.equal(captionWordTimeSeconds({ end: -1 }, 'end', 0.5), 0.5);
  assert.equal(captionTranscriptDurationSec({ words: [word('a', 0, 0.5), word('b', 1, 1.75)] }), 1.75);

  let built = buildCaptionCues({
    sequenceMode: 'overlap',
    clipTranscripts: [{ speaker: 'guide', words: [word('hello', 0, 0.2)] }],
  });
  assert.equal(built.source, 'whisper+clip-range-map');
  assert.match(built.vtt, /^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:00\.200\nhello\n\n$/);
});
