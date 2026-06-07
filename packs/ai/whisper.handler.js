/**
 * ai/whisper — Audio transcription with word-level timestamps
 *
 * Two modes:
 * - SSH: uploads audio to remote server via scp, runs Whisper via SSH
 * - HTTP: sends audio to a Whisper HTTP endpoint (e.g., faster-whisper-server)
 *
 * SSH mode expects WHISPER_REMOTE_HOST and WHISPER_REMOTE_PATH, or matching params.
 *
 * @module symbiote-engine/packs/ai/whisper
 */

import { promises as fs } from 'fs';
import path from 'path';
import { runCommandWithWatchdog } from './run-command-watchdog.js';

function requestSignal(timeoutMs, parentSignal) {
  let timeoutSignal = AbortSignal.timeout(timeoutMs);
  return parentSignal && AbortSignal.any
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;
}

export default {
  type: 'ai/whisper',
  category: 'ai',
  icon: 'hearing',

  driver: {
    description: 'Audio transcription with word-level timestamps (SSH or HTTP mode)',
    inputs: [{ name: 'audioPath', type: 'string' }],
    outputs: [
      { name: 'text', type: 'string' },
      { name: 'words', type: 'any' },
      { name: 'duration', type: 'number' },
      { name: 'error', type: 'string' },
    ],
    params: {
      mode: { type: 'string', default: 'ssh', description: 'ssh | http' },
      language: { type: 'string', default: 'es', description: 'Language code' },
      model: {
        type: 'string',
        default: 'medium',
        description: 'Whisper model: tiny, base, small, medium, large-v3',
      },
      device: { type: 'string', default: 'cuda', description: 'cuda | cpu' },

      remoteHost: {
        type: 'string',
        default: '',
        description: 'SSH host',
      },
      remotePath: {
        type: 'string',
        default: '',
        description: 'Remote project path',
      },
      remoteVenv: {
        type: 'string',
        default: '',
        description: 'Remote Python venv',
      },

      endpoint: {
        type: 'string',
        default: 'http://localhost:5001',
        description: 'Whisper HTTP endpoint',
      },
      timeout: { type: 'int', default: 300000, description: 'Max wait time (ms)' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.audioPath) return false;
      return true;
    },

    cacheKey: (inputs, params) => `whisper:${params.mode}:${params.model}:${inputs.audioPath}`,

    execute: async (inputs, params) => {
      let { audioPath } = inputs;
      let mode = params.mode || process.env.WHISPER_MODE || 'ssh';

      if (mode === 'http') {
        return executeHTTP(audioPath, params);
      }
      return executeSSH(audioPath, params);
    },
  },
};

/**
 * SSH mode: scp upload → remote python exec → parse JSON output
 * @param {string} audioPath - Local audio file path
 * @param {Object} params - Node params
 * @returns {Promise<Object>} Result with text, words, duration
 */
async function executeSSH(audioPath, params) {
  let host = params.remoteHost || process.env.WHISPER_REMOTE_HOST || '';
  let remotePath = params.remotePath || process.env.WHISPER_REMOTE_PATH || '';
  let venv = params.remoteVenv || process.env.WHISPER_REMOTE_VENV || `${remotePath}/venv`;
  let model = params.model || process.env.WHISPER_MODEL || 'medium';
  let device = params.device || process.env.WHISPER_DEVICE || 'cuda';
  let language = params.language || 'es';
  let remoteTmpDir = '/tmp/symbiote-engine-whisper';

  try {
    if (!host || !remotePath || !venv) {
      throw new Error('Whisper SSH mode requires remoteHost, remotePath, and remoteVenv configuration');
    }

    await fs.access(audioPath);

    let filename = path.basename(audioPath);
    let remoteAudioPath = `${remoteTmpDir}/${filename}`;


    await runCommandWithWatchdog(`ssh ${host} "mkdir -p ${remoteTmpDir}"`, {
      inactivityMs: 10000,
      timeoutMs: 10000,
    });


    await runCommandWithWatchdog(`scp "${audioPath}" "${host}:${remoteAudioPath}"`, {
      inactivityMs: 60000,
      timeoutMs: 60000,
    });

    try {

      let pythonCmd = `${venv}/bin/python3`;
      let whisperScript = `${remotePath}/utils/whisper-word-timing.py`;

      let cmd = `"${pythonCmd}" "${whisperScript}" "${remoteAudioPath}" "${language}" --model "${model}" --device "${device}"`;
      let fullCmd = `ssh ${host} '${cmd}'`;

      let output = await runCommandWithWatchdog(fullCmd, {
        maxBuffer: 50 * 1024 * 1024,
        inactivityMs: params.timeout || 300000,
        timeoutMs: params.timeout || 300000,
      });

      let words = JSON.parse(output);
      let text = words.map((w) => w.word).join(' ');
      let duration = words.length > 0 ? words[words.length - 1].end : 0;

      return { text, words, duration, error: null };
    } finally {

      try {
        await runCommandWithWatchdog(`ssh ${host} "rm -f ${remoteAudioPath}"`, {
          inactivityMs: 5000,
          timeoutMs: 5000,
        });
      } catch (cleanupError) {
        console.warn(`Failed to cleanup remote Whisper audio ${remoteAudioPath}: ${cleanupError.message}`);
      }
    }
  } catch (err) {
    return { text: null, words: null, duration: 0, error: err.message };
  }
}

/**
 * HTTP mode: POST audio to Whisper endpoint via FormData
 * @param {string} audioPath - Local audio file path
 * @param {Object} params - Node params
 * @returns {Promise<Object>} Result with text, words, duration
 */
async function executeHTTP(audioPath, params) {
  let endpoint = params.endpoint || process.env.WHISPER_ENDPOINT || 'http://localhost:5001';
  let language = params.language || 'es';

  try {
    let audioBuffer = await fs.readFile(audioPath);
    let blob = new Blob([audioBuffer], { type: 'audio/wav' });

    let formData = new FormData();
    formData.append('file', blob, path.basename(audioPath));
    formData.append('language', language);
    formData.append('word_timestamps', 'true');

    if (params.model) {
      formData.append('model', params.model);
    }

    let response = await fetch(`${endpoint}/transcribe`, {
      method: 'POST',
      body: formData,
      signal: requestSignal(params.timeout || 300000, params.signal),
    });

    if (!response.ok) {
      return {
        text: null,
        words: null,
        duration: 0,
        error: `Whisper API error: ${response.status}`,
      };
    }

    let result = await response.json();
    let words = result.words || [];
    let text = result.text || words.map((w) => w.word).join(' ');
    let duration = words.length > 0 ? words[words.length - 1].end : 0;

    return { text, words, duration, error: null };
  } catch (err) {
    return { text: null, words: null, duration: 0, error: err.message };
  }
}
