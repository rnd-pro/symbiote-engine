export const docsRoutes = [
  {
    path: '/docs/',
    title: 'Overview',
    section: 'Getting Started',
    keywords: 'architecture execution model boundaries',
    description: 'Understand Symbiote Engine execution model, architectural boundaries, and core design goals.'
  },
  {
    path: '/docs/getting-started/',
    title: 'Getting Started',
    section: 'Getting Started',
    keywords: 'install node graph register executor',
    description: 'Installation, basic graph construction, custom node registration, and execution pipeline.'
  },
  {
    path: '/docs/guide/',
    title: 'Guide',
    section: 'Guide',
    keywords: 'cache caching DAG history undo redo',
    description: 'Deep dive into input contracts, Kahn topological execution, caching modes, and undo/redo history.'
  },
  {
    path: '/docs/runtime/',
    title: 'Runtime & CLI',
    section: 'Runtime',
    keywords: 'command line GraphServer handlers packs',
    description: 'Node packages, CLI commands, developer GraphServer primitive, and hot-loadable handler packs.'
  },
  {
    path: '/docs/rendering/',
    title: 'Media Rendering',
    section: 'Rendering',
    keywords: 'audio video capture ffmpeg frames',
    description: 'In-memory queues, audio providers, parallel browser capture, and FFmpeg/ffprobe proof helpers.'
  },
  {
    path: '/docs/reference/',
    title: 'API Reference',
    section: 'Reference',
    keywords: 'exports symbols modules package',
    description: 'Exact generated package export-map and live namespace inventories.'
  },
  {
    path: '/docs/safety/',
    title: 'Safety & Security',
    section: 'Safety',
    keywords: 'sandbox credentials isolation network drivers',
    description: 'Host-isolation boundaries, custom driver compilation, credentials security, and sandboxing requirements.'
  }
];
