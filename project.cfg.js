export default {
  static: {
    sourceDir: './site',
    outputDir: './_site',
    entryPatterns: ['*.html.js', '**/*.html.js', '**/index.js'],
    copy: [{ from: './site/static-assets', to: './' }]
  },
  minify: {
    html: false
  },
  importmap: {
    packageList: ['node:fs/promises', 'node:fs', 'node:path', 'node:crypto', 'node:process']
  }
};
