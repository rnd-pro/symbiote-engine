/**
 * ai/tts — Text-to-Speech via Qwen3-TTS
 *
 * Two modes:
 * - SSH: batch script on a configured remote server
 * - HTTP: POST to Qwen3 TTS HTTP endpoint
 *
 * Supports:
 * - Built-in speakers: ryan, vivian, aiden, dylan, eric, serena, sohee, chelsie, etc.
 * - Voice cloning via ref_audio (reference audio sample)
 * - Language: es (Spanish/Rioplatense), ru (Russian), en (English)
 *
 * SSH mode expects TTS_REMOTE_HOST and TTS_REMOTE_PATH, or matching params.
 *
 * @module symbiote-node/packs/ai/tts
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { runCommandWithWatchdog } from './run-command-watchdog.js';

function requestSignal(timeoutMs, parentSignal) {
  let timeoutSignal = AbortSignal.timeout(timeoutMs);
  return parentSignal && AbortSignal.any
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;
}

async function cleanupLocalFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[ai/tts] Failed to remove temp file ${filePath}: ${err.message}`);
    }
  }
}

export default {
  type: 'ai/tts',
  category: 'ai',
  icon: 'record_voice_over',

  driver: {
    description: 'Text-to-Speech via Qwen3-TTS (SSH batch or HTTP)',
    inputs: [{ name: 'text', type: 'string' }],
    outputs: [
      { name: 'audioPath', type: 'string' },
      { name: 'error', type: 'string' },
    ],
    params: {
      mode: { type: 'string', default: 'http', description: 'ssh | http' },
      language: { type: 'string', default: 'es', description: 'Language: es, ru, en' },
      speaker: { type: 'string', default: 'vivian', description: 'Built-in Qwen3 speaker ID' },
      refAudio: {
        type: 'string',
        default: '',
        description: 'Path to voice reference audio (clone mode)',
      },
      outputDir: {
        type: 'string',
        default: '',
        description: 'Output directory for generated audio',
      },
      outputFormat: { type: 'string', default: 'wav', description: 'wav | mp3' },
      exaggeration: { type: 'number', default: 0, description: 'Voice exaggeration (0-1)' },
      cfg: { type: 'number', default: 0.1, description: 'Classifier-free guidance (0-1)' },

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
        description: 'Remote Python venv path',
      },
      device: { type: 'string', default: 'cuda', description: 'cuda | cpu' },

      endpoint: {
        type: 'string',
        default: 'http://localhost:5008',
        description: 'TTS HTTP endpoint',
      },
      timeout: { type: 'int', default: 120000, description: 'Max wait time (ms)' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.text) return false;
      return true;
    },

    cacheKey: (inputs, params) =>
      `tts:${params.mode}:${params.speaker}:${params.language}:${inputs.text}`,

    execute: async (inputs, params) => {
      let { text } = inputs;
      let mode = params.mode || 'http';

      if (mode === 'ssh') {
        return executeSSH(text, params);
      }
      return executeHTTP(text, params);
    },
  },
};

/**
 * Qwen3-TTS built-in speaker IDs
 * @type {Set<string>}
 */
const SPEAKERS = new Set([
  'aiden',
  'dylan',
  'eric',
  'ono_anna',
  'ryan',
  'serena',
  'sohee',
  'uncle_fu',
  'vivian',
  'chelsie',
]);

/**
 * SSH mode: write batch JSON → scp → remote python exec → scp result back
 * @param {string} text - Text to synthesize
 * @param {Object} params - Node params
 * @returns {Promise<Object>}
 */
async function executeSSH(text, params) {
  let host = params.remoteHost || process.env.TTS_REMOTE_HOST || '';
  let remotePath = params.remotePath || process.env.TTS_REMOTE_PATH || '';
  let venv = params.remoteVenv || process.env.TTS_REMOTE_VENV || `${remotePath}/venv`;
  let device = params.device || process.env.PODCAST_TTS_DEVICE || 'cuda';

  let outDir = params.outputDir || path.join(os.tmpdir(), 'symbiote-node-tts');
  let taskId = `tts_${Date.now()}`;
  let localWav = path.join(outDir, `${taskId}.wav`);
  let remoteTmpDir = '/tmp/symbiote-node-tts';

  try {
    if (!host || !remotePath || !venv) {
      throw new Error('TTS SSH mode requires remoteHost, remotePath, and remoteVenv configuration');
    }
    await fs.mkdir(outDir, { recursive: true });


    let batchTask = [
      {
        id: taskId,
        text,
        lang: params.language || 'es',
        prompt: params.refAudio || null,
        out: `${remoteTmpDir}/${taskId}.wav`,
        exaggeration: params.exaggeration ?? 0,
        cfg: params.cfg ?? 0.1,
      },
    ];


    if (!params.refAudio && SPEAKERS.has(params.speaker)) {
      batchTask[0].speaker = params.speaker;
    }


    let batchFile = path.join(outDir, `${taskId}_batch.json`);
    await fs.writeFile(batchFile, JSON.stringify(batchTask, null, 2));


    await runCommandWithWatchdog(`ssh ${host} "mkdir -p ${remoteTmpDir}"`, {
      inactivityMs: 10000,
      timeoutMs: 10000,
    });

    let remoteBatch = `${remoteTmpDir}/${taskId}_batch.json`;
    await runCommandWithWatchdog(`scp "${batchFile}" "${host}:${remoteBatch}"`, {
      inactivityMs: 30000,
      timeoutMs: 30000,
    });

    try {

      let pythonCmd = `${venv}/bin/python`;
      let scriptPath = `${remotePath}/utils/generate_qwen3tts_batch.py`;
      let cmd = `source "${venv}/bin/activate" && "${pythonCmd}" "${scriptPath}" --batch "${remoteBatch}" --device "${device}"`;

      await runCommandWithWatchdog(`ssh ${host} '${cmd}'`, {
        maxBuffer: 50 * 1024 * 1024,
        inactivityMs: params.timeout || 120000,
        timeoutMs: params.timeout || 120000,
      });


      let remoteOut = `${remoteTmpDir}/${taskId}.wav`;
      await runCommandWithWatchdog(`scp "${host}:${remoteOut}" "${localWav}"`, {
        inactivityMs: 30000,
        timeoutMs: 30000,
      });


      await cleanupLocalFile(batchFile);
      await runCommandWithWatchdog(`ssh ${host} "rm -f ${remoteBatch} ${remoteOut}"`, {
        inactivityMs: 5000,
        timeoutMs: 5000,
      });

      return { audioPath: localWav, error: null };
    } catch (err) {
      await cleanupLocalFile(batchFile);
      return { audioPath: null, error: err.message };
    }
  } catch (err) {
    return { audioPath: null, error: err.message };
  }
}

/**
 * HTTP mode: POST to Qwen3 TTS endpoint
 * @param {string} text - Text to synthesize
 * @param {Object} params - Node params
 * @returns {Promise<Object>}
 */
async function executeHTTP(text, params) {
  let endpoint = params.endpoint || process.env.TTS_SERVER_URL || 'http://localhost:5008';
  let outDir = params.outputDir || path.join(os.tmpdir(), 'symbiote-node-tts');
  let taskId = `tts_${Date.now()}`;
  let outputPath = path.join(outDir, `${taskId}.wav`);

  try {
    await fs.mkdir(outDir, { recursive: true });

    let body = {
      text,
      language: params.language || 'es',
      speaker: params.speaker || 'vivian',
      exaggeration: params.exaggeration ?? 0,
      cfg: params.cfg ?? 0.1,
    };


    if (params.refAudio) {
      let refBuffer = await fs.readFile(params.refAudio);
      body.ref_audio = refBuffer.toString('base64');
    }

    let response = await fetch(`${endpoint}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: requestSignal(params.timeout || 120000, params.signal),
    });

    if (!response.ok) {
      return { audioPath: null, error: `TTS API error: ${response.status}` };
    }


    let contentType = response.headers.get('content-type') || '';

    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      let buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outputPath, buffer);
      return { audioPath: outputPath, error: null };
    }


    let result = await response.json();
    if (result.audio_path) {
      return { audioPath: result.audio_path, error: null };
    }
    if (result.audio) {
      let buffer = Buffer.from(result.audio, 'base64');
      await fs.writeFile(outputPath, buffer);
      return { audioPath: outputPath, error: null };
    }

    return { audioPath: null, error: 'Unexpected TTS response format' };
  } catch (err) {
    return { audioPath: null, error: err.message };
  }
}
