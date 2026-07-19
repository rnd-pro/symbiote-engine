import { createPagesJsdaConfig } from 'library-pages/jsda';

export default createPagesJsdaConfig({
  sourceDir: './site',
  outputDir: './_site',
  entryPatterns: ['*.html.js', '**/*.html.js', '**/index.js'],
  copy: [{ from: './site/static-assets', to: './' }],
  importmapPackageList: ['node:fs/promises', 'node:fs', 'node:path', 'node:crypto', 'node:process'],
});
