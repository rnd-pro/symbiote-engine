/**
 * video-pack.js - Video domain pack for symbiote-engine
 *
 * Registers video-specific node types and socket types.
 * Extracted from symbiote-video/src/graph/NodeTypes.js + NodeProcessors.js.
 *
 * @module symbiote-engine/packs/video-pack
 */

import { registerPack } from '../index.js';

/**
 * Video-domain socket types
 */
let socketTypes = {
  image: { color: '#C79650', label: 'Image', compatible: ['image'] },
  audio: { color: '#C1990E', label: 'Audio', compatible: ['audio'] },
  timeline: { color: '#5090C7', label: 'Timeline', compatible: ['timeline'] },
  skeleton: { color: '#90C750', label: 'Skeleton', compatible: ['skeleton'] },
  effect: { color: '#C750C7', label: 'Effect', compatible: ['effect'] },
};

/**
 * Video node type definitions
 */
let nodes = [

  {
    type: 'source/audio',
    category: 'source',
    icon: 'music_note',
    driver: {
      description: 'Audio source file',
      capabilities: ['source', 'audio'],
      inputs: [],
      outputs: [
        { name: 'audio', type: 'audio' },
        { name: 'duration', type: 'float' },
      ],
      params: {
        src: { type: 'string', required: true, description: 'Audio file path or URL' },
        volume: { type: 'float', default: 1.0, min: 0, max: 2 },
      },
    },
    process: (_inputs, params) => ({
      audio: { src: params.src, volume: params.volume },
      duration: params.duration || 0,
    }),
  },
  {
    type: 'source/webp-sequence',
    category: 'source',
    icon: 'movie',
    driver: {
      description: 'WebP image sequence as video frames',
      capabilities: ['source', 'video'],
      inputs: [],
      outputs: [
        { name: 'frames', type: 'image' },
        { name: 'frameCount', type: 'int' },
      ],
      params: {
        directory: { type: 'string', required: true },
        pattern: { type: 'string', default: '*.webp' },
        fps: { type: 'int', default: 30, min: 1, max: 120 },
      },
    },
    process: (_inputs, params) => ({
      frames: { directory: params.directory, pattern: params.pattern, fps: params.fps },
      frameCount: params.frameCount || 0,
    }),
  },
  {
    type: 'source/image',
    category: 'source',
    icon: 'image',
    driver: {
      description: 'Static image source',
      capabilities: ['source', 'image'],
      inputs: [],
      outputs: [{ name: 'image', type: 'image' }],
      params: {
        src: { type: 'string', required: true },
        fit: { type: 'string', default: 'cover', enum: ['cover', 'contain', 'fill', 'none'] },
      },
    },
    process: (_inputs, params) => ({
      image: { src: params.src, fit: params.fit },
    }),
  },
  {
    type: 'source/text',
    category: 'source',
    icon: 'text_fields',
    driver: {
      description: 'Text source for overlays and subtitles',
      capabilities: ['source', 'text'],
      inputs: [],
      outputs: [{ name: 'text', type: 'string' }],
      params: {
        content: { type: 'string', default: '' },
        style: { type: 'string', default: 'default' },
      },
    },
    process: (_inputs, params) => ({
      text: { content: params.content, style: params.style },
    }),
  },


  {
    type: 'analysis/beat-analyzer',
    category: 'analysis',
    icon: 'graphic_eq',
    driver: {
      description: 'Analyzes audio for beats, energy, and generates effect skeleton',
      capabilities: ['analysis', 'audio', 'ai'],
      inputs: [{ name: 'audio', type: 'audio', required: true }],
      outputs: [
        { name: 'skeleton', type: 'skeleton' },
        { name: 'beats', type: 'float' },
        { name: 'energy', type: 'float' },
      ],
      params: {
        energyPerSecond: { type: 'int', default: 10, min: 1, max: 100 },
        strongThreshold: { type: 'float', default: 1.3, min: 0.5, max: 3 },
      },
    },
    process: () => ({
      skeleton: {
        intensityZones: [],
        fadeZones: [],
        dropPoints: [],
        beatMarkers: [],
        transitionAnchors: [],
      },
      beats: [],
      energy: [],
    }),
  },
  {
    type: 'analysis/ai-director',
    category: 'analysis',
    icon: 'smart_toy',
    driver: {
      description: 'AI-driven timeline composition from skeleton and prompt',
      capabilities: ['analysis', 'ai', 'llm'],
      inputs: [
        { name: 'skeleton', type: 'skeleton', required: true },
        { name: 'prompt', type: 'string' },
      ],
      outputs: [{ name: 'timeline', type: 'timeline' }],
      params: {
        model: { type: 'string', default: 'auto' },
        temperature: { type: 'float', default: 0.7, min: 0, max: 2 },
      },
      constraints: { requiresSecret: 'OPENAI_API_KEY' },
    },
  },


  {
    type: 'processing/physics-vfx',
    category: 'processing',
    icon: 'bolt',
    driver: {
      description: 'Physics-based visual effects synced to beats',
      capabilities: ['effects', 'animation'],
      inputs: [
        { name: 'input', type: 'any' },
        { name: 'beats', type: 'float' },
      ],
      outputs: [{ name: 'output', type: 'effect' }],
      params: {
        preset: {
          type: 'string',
          default: 'bounceIn',
          enum: ['bounceIn', 'dropImpact', 'glitch', 'shake', 'zoom', 'rubberBand', 'pulse'],
        },
        beatSync: { type: 'boolean', default: true },
        intensity: { type: 'float', default: 1.0, min: 0, max: 3 },
      },
    },
  },
  {
    type: 'processing/color-correction',
    category: 'processing',
    icon: 'palette',
    driver: {
      description: 'Color grading and correction filters',
      capabilities: ['effects', 'color'],
      inputs: [{ name: 'input', type: 'image', required: true }],
      outputs: [{ name: 'output', type: 'image' }],
      params: {
        brightness: { type: 'float', default: 0, min: -100, max: 100 },
        contrast: { type: 'float', default: 0, min: -100, max: 100 },
        saturation: { type: 'float', default: 0, min: -100, max: 100 },
        hueRotate: { type: 'float', default: 0, min: 0, max: 360 },
      },
    },
  },
  {
    type: 'processing/transition',
    category: 'processing',
    icon: 'shuffle',
    driver: {
      description: 'Transition effect between two sources',
      capabilities: ['effects', 'transition'],
      inputs: [
        { name: 'from', type: 'image', required: true },
        { name: 'to', type: 'image', required: true },
      ],
      outputs: [{ name: 'output', type: 'image' }],
      params: {
        type: {
          type: 'string',
          default: 'fade',
          enum: ['fade', 'slide', 'wipe', 'zoom', 'dissolve'],
        },
        duration: { type: 'int', default: 30, min: 1 },
        direction: { type: 'string', default: 'left', enum: ['left', 'right', 'up', 'down'] },
      },
    },
  },


  {
    type: 'composition/layout',
    category: 'composition',
    icon: 'grid_view',
    driver: {
      description: 'Positions content in the viewport',
      capabilities: ['composition', 'layout'],
      inputs: [{ name: 'content', type: 'any', required: true }],
      outputs: [{ name: 'output', type: 'image' }],
      params: {
        anchor: { type: 'string', default: 'center' },
        x: { type: 'string', default: '50%' },
        y: { type: 'string', default: '50%' },
        width: { type: 'string', default: '100%' },
        height: { type: 'string', default: '100%' },
        rotation: { type: 'float', default: 0 },
      },
    },
  },
  {
    type: 'composition/blend',
    category: 'composition',
    icon: 'theaters',
    driver: {
      description: 'Blends/composites two image layers',
      capabilities: ['composition', 'blend'],
      inputs: [
        { name: 'base', type: 'image', required: true },
        { name: 'overlay', type: 'image', required: true },
      ],
      outputs: [{ name: 'output', type: 'image' }],
      params: {
        mode: {
          type: 'string',
          default: 'normal',
          enum: ['normal', 'multiply', 'screen', 'overlay', 'add'],
        },
        opacity: { type: 'float', default: 1.0, min: 0, max: 1 },
      },
    },
  },
  {
    type: 'composition/timeline',
    category: 'composition',
    icon: 'timer',
    driver: {
      description: 'Assembles layers into a timeline for rendering',
      capabilities: ['composition', 'timeline'],
      inputs: [
        { name: 'layers', type: 'any', required: true },
        { name: 'dynamics', type: 'skeleton' },
      ],
      outputs: [{ name: 'timeline', type: 'timeline' }],
      params: {
        fps: { type: 'int', default: 30, min: 1, max: 120 },
        duration: { type: 'string', default: 'auto' },
      },
    },
  },


  {
    type: 'output/viewport',
    category: 'output',
    icon: 'desktop_windows',
    driver: {
      description: 'Preview viewport for real-time monitoring',
      capabilities: ['output', 'preview'],
      inputs: [{ name: 'timeline', type: 'timeline', required: true }],
      outputs: [],
      params: {
        width: { type: 'int', default: 1080, min: 1 },
        height: { type: 'int', default: 1920, min: 1 },
        background: { type: 'string', default: '#000000' },
      },
    },
  },
  {
    type: 'output/render',
    category: 'output',
    icon: 'videocam',
    driver: {
      description: 'Renders timeline to video file',
      capabilities: ['output', 'render'],
      inputs: [{ name: 'timeline', type: 'timeline', required: true }],
      outputs: [],
      params: {
        format: { type: 'string', default: 'mp4', enum: ['mp4', 'webm', 'mov'] },
        codec: { type: 'string', default: 'h264', enum: ['h264', 'h265', 'vp9', 'av1'] },
        quality: { type: 'string', default: 'high', enum: ['low', 'medium', 'high', 'lossless'] },
        preset: { type: 'string', default: 'vertical', enum: ['vertical', 'horizontal', 'square'] },
      },
    },
  },
];

/**
 * Register the video pack
 */
export function registerVideoPack() {
  registerPack({
    name: 'video',
    socketTypes,
    nodes,
  });
}


registerVideoPack();
