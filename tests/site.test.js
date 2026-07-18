import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

test('Clean build and exact artifacts/hashes', async () => {
  // 0. Frozen hashes
  const crypto = await import('node:crypto');
  const hashFile = (path) => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  // Removed mutable hashes
  assert.strictEqual(hashFile('site/demo/index.html.js'), '7495921413113916349fd83f2b9052547cd3c396cc5a88d35c8888ff55879d90');
  assert.strictEqual(hashFile('site/demo/index.js'), '0b6f6e14167b437d2c056257a7aafb54bc38b2e5a162fa937fdd222e262500e6');
  assert.strictEqual(hashFile('site/layout.js'), 'f4599573c53f17da90883dd07216d0900077b99042ce44b173edff5f99b7abd8');
  assert.strictEqual(hashFile('site/404.html.js'), 'e8be698b5f7eaae813a7a6052fdec8d81b0702a47d9e0a8b32384227ef9daa55');
  assert.strictEqual(hashFile('site/static-assets/robots.txt'), '16ceb5ee3e0dc13aa9adf31a3ebbe45a1d965b8c2b9f72eaf84e5911e140ed95');

  // 1. Gather pack inventory before build
  const packBefore = JSON.parse(execSync('npm pack --dry-run --json --ignore-scripts').toString());
  const filesBefore = packBefore[0].bundled?.length > 0 ? packBefore[0].bundled : packBefore[0].files.map(f => f.path);
  const sizeBefore = packBefore[0].unpackedSize;

  // 2. Create stale sentinel to verify clean works
  if (!fs.existsSync('_site')) fs.mkdirSync('_site');
  fs.writeFileSync('_site/sentinel.txt', 'stale');

  // 3. Build site
  execSync('npm run site:build', { env: { ...process.env, BASE_PATH: '/symbiote-engine', BASE_URL: 'https://rnd-pro.github.io/symbiote-engine' } });

  // 3.5 Frozen output hashes
  assert.strictEqual(fs.readFileSync('_site/animation-client.js', 'utf8'), fs.readFileSync('site/static-assets/animation-client.js', 'utf8'), 'animation-client.js copied exactly');
  assert.strictEqual(hashFile('_site/demo/index.html'), '5bccc6f6f717741fe04bb8df2377cbf4b5f02b57539f94d564a80b095d2b4d12');
  assert.strictEqual(hashFile('_site/demo/index.js'), '306f5849ca022b06ce33e83450dc69055e2172adb69d689285f696291fc1e6bc');
  assert.strictEqual(hashFile('_site/404.html'), 'e2236894d04cb9128cbf6b67d6fa391b32e25e3036fa8cb8c06d108649f78ea6');
  assert.strictEqual(hashFile('_site/robots.txt'), '16ceb5ee3e0dc13aa9adf31a3ebbe45a1d965b8c2b9f72eaf84e5911e140ed95');

  // 4. Sentinel should be removed by clean build
  assert.ok(!fs.existsSync('_site/sentinel.txt'), 'Sentinel was removed by clean build');

  // 5. Gather pack inventory after build
  const packAfter = JSON.parse(execSync('npm pack --dry-run --json --ignore-scripts').toString());
  const filesAfter = packAfter[0].bundled?.length > 0 ? packAfter[0].bundled : packAfter[0].files.map(f => f.path);
  const sizeAfter = packAfter[0].unpackedSize;

  // 6. Inventories must be identical
  assert.strictEqual(filesBefore.length, 80, 'pre-build npm inventory count is exactly 80');
  assert.strictEqual(sizeBefore, 565341, 'pre-build npm unpacked size is exactly 565341');
  assert.strictEqual(filesAfter.length, 80, 'post-build npm inventory count is exactly 80');
  assert.strictEqual(sizeAfter, 565341, 'post-build npm unpacked size is exactly 565341');
  assert.deepStrictEqual(filesBefore.sort(), filesAfter.sort(), 'Pack inventory exactly matches before and after site build');

  // 7. Verify exclusion policies
  const rejectedPaths = ['site/', '_site/', 'tests/', '.github/', 'project.cfg.js', 'package-lock.json', 'AGENTS.md'];
  for (const file of filesAfter) {
    for (const rejected of rejectedPaths) {
      assert.ok(!file.startsWith(rejected) && file !== rejected, `${rejected} is excluded from pack`);
    }
  }

  // 8. Compare exact walked 16-file output to explicit inventory
  const expectedFiles = [
    '404.html',
    'animation-client.js',
    'demo/index.html',
    'demo/index.js',
    'docs/index.html',
    'docs/getting-started/index.html',
    'docs/guide/index.html',
    'docs/runtime/index.html',
    'docs/rendering/index.html',
    'docs/reference/index.html',
    'docs/safety/index.html',
    'index.html',
    'llms.txt',
    'manifest.json',
    'robots.txt',
    'sitemap.xml'
  ];

  function walk(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const stat = fs.statSync(path.join(dir, file));
      if (stat.isDirectory()) {
        walk(path.join(dir, file), fileList);
      } else {
        fileList.push(path.join(dir, file));
      }
    }
    return fileList;
  }

  const allFiles = walk('_site');
  const relativeFiles = allFiles.map(file => path.relative('_site', file).replace(/\\/g, '/')).sort();
  assert.deepStrictEqual(relativeFiles, expectedFiles.sort(), 'Walked file list exactly matches the explicit 16-file inventory');

  // 9. Recompute keys, sizes and hashes for the entire output and compare
  const manifest = JSON.parse(fs.readFileSync('_site/manifest.json', 'utf8'));
  const recomputedManifest = {};

  for (const file of allFiles) {
    const relPath = path.relative('_site', file).replace(/\\/g, '/');
    if (relPath === 'manifest.json') continue;

    const content = fs.readFileSync(file);
    const hash = await import('node:crypto').then(c => c.createHash('sha256').update(content).digest('hex'));
    recomputedManifest[relPath] = { size: content.length, sha256: hash };
  }

  assert.deepStrictEqual(manifest, recomputedManifest, 'Manifest exactly matches recomputed files, sizes and hashes');
});

test('Animation and accessibility invariants', async () => {
  const html = fs.readFileSync('_site/index.html', 'utf8');
  const clientJs = fs.readFileSync('_site/animation-client.js', 'utf8');
  const htmlDocs = fs.readFileSync('_site/docs/index.html', 'utf8');

  // --- 0. Obsolete token rejection ---
  assert.ok(!html.includes('diagram-surface--unboxed'), 'Landing page must not contain obsolete token "diagram-surface--unboxed"');

  // --- 0.5. Generated route contract ---
  const scriptTags = html.match(/<script\b[^>]*>/g) || [];
  const moduleClients = scriptTags.filter(tag => {
    return (tag.includes('type="module"') || tag.includes("type='module'")) && (tag.includes('src='));
  });
  assert.strictEqual(moduleClients.length, 1, 'Exactly one landing module client script tag must exist');
  const clientTag = moduleClients[0];
  const srcMatch = clientTag.match(/(?:^|\s)src\s*=\s*(["'])([^"'>]*?)\1/);
  assert.ok(srcMatch, `Could not extract src attribute from: ${clientTag}`);
  const clientUrl = srcMatch[2];
  assert.strictEqual(clientUrl, './animation-client.js', 'Landing module client public relative URL must be exactly "./animation-client.js"');

  const resolvedPath = path.resolve('_site', clientUrl);
  assert.ok(fs.existsSync(resolvedPath), `Resolved script path must exist: ${resolvedPath}`);
  const stats = fs.statSync(resolvedPath);
  assert.ok(stats.isFile(), `Resolved script path must be a regular file: ${resolvedPath}`);

  const targetBytes = fs.readFileSync(resolvedPath);
  const sourceBytes = fs.readFileSync('site/static-assets/animation-client.js');
  assert.deepStrictEqual(targetBytes, sourceBytes, 'Animation client script bytes in _site must equal site/static-assets/animation-client.js');

  // --- 1. Path attribute boundary extraction ---
  function extractDAttribute(pathTag) {
    const match = pathTag.match(/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/);
    assert.ok(match, `Could not extract d attribute from: ${pathTag}`);
    return match[2];
  }

  const negativeTag = '<path id="route-data" fill="none" />';
  assert.ok(!/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/.test(negativeTag), 'Extractor must reject id= matching as d=');

  const mismatchTag1 = '<path d="M 10,10\' fill="none" />';
  const mismatchTag2 = '<path d=\'M 10,10" fill="none" />';
  assert.ok(!/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/.test(mismatchTag1), 'Extractor must reject mismatched quote delimiters');
  assert.ok(!/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/.test(mismatchTag2), 'Extractor must reject mismatched quote delimiters');

  const rawStartTags = html.match(/<[a-zA-Z0-9:-]+(?:\s+[^>]*?)?\/?>/g);
  const startTags = rawStartTags ? rawStartTags : [];
  for (const tag of startTags) {
    assert.ok(!tag.includes('""'), `SVG/HTML start tag must not contain doubled quotes: ${tag}`);
    assert.ok(!(tag.includes('data-visual-object=') && tag.includes('data-motion-accent=')), `SVG/HTML tag must not carry both data-visual-object and data-motion-accent: ${tag}`);
  }

  const rawPathTags = html.match(/<path[^>]*>/gi);
  const pathTags = rawPathTags ? rawPathTags : [];
  for (const pathTag of pathTags) {
    const dMatch = pathTag.match(/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/);
    assert.ok(dMatch, `Path d attribute must be extracted: ${pathTag}`);
    const idx = pathTag.indexOf(dMatch[0]);
    const postChar = pathTag[idx + dMatch[0].length];
    assert.ok(postChar !== '"' && postChar !== "'", `Path d attribute must be balanced and have no adjacent quotes: ${pathTag}`);
  }

  // --- 2. Anchored grammar for cubic routes ---
  class CubicRegExp extends RegExp {
    test(str) {
      const res = super.test(str);
      if (!res) return false;
      const match = str.match(this);
      if (!match) return false;
      for (let i = 1; i < match.length; i++) {
        if (!Number.isFinite(Number(match[i]))) return false;
      }
      return true;
    }
  }
  const cubicGrammarRegex = new CubicRegExp(/^\s*[Mm]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*[Cc]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*$/);

  const negativeFixtures = [
    'M 150,120 C 220,80 360,80 430,120 L 500,120',
    'prefix M 150,120 C 220,80 360,80 430,120',
    'M 150,120 C 220,80 360,80 430,120 suffix',
    'M 150 C 220,80 360,80 430,120',
    'M 150,120 C 220,80 360,80 430',
    'M 150,120 C 220,80abc 360,80 430,120',
    'M 150,120 C 220,80.80.80 360,80 430,120'
  ];
  for (const fix of negativeFixtures) {
    assert.ok(!cubicGrammarRegex.test(fix), `Cubic grammar regex must reject: ${fix}`);
  }

  // Helper to extract a chapter's content
  function getChapterHtml(htmlContent, chapterClass) {
    const startIdx = htmlContent.indexOf(chapterClass);
    if (startIdx === -1) return '';
    let endIdx = htmlContent.length;
    const nextChapters = ['chapter-01', 'chapter-02', 'chapter-03', 'chapter-04', 'landing-footer', 'footer', 'site-footer'].filter(c => c !== chapterClass);
    for (const next of nextChapters) {
      const idx = htmlContent.indexOf(next, startIdx);
      if (idx !== -1 && idx < endIdx) {
        endIdx = idx;
      }
    }
    return htmlContent.substring(startIdx, endIdx);
  }

  const cssStyleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  assert.ok(cssStyleMatch, 'Should have a style tag');
  const cssContent = cssStyleMatch[1];
  const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');

  // --- 3. Chapter 3 SVG Route Selection ---
  const ch3Html = getChapterHtml(html, 'chapter-03');
  const ch3SvgBlocks = [...ch3Html.matchAll(/<svg[^>]*>([\s\S]*?)<\/svg>/g)];
  assert.strictEqual(ch3SvgBlocks.length, 2, 'Chapter 3 must contain exactly 2 SVGs (desktop and mobile)');
  for (const block of ch3SvgBlocks) {
    const svgTag = block[0];
    const svgContent = block[1];
    let isMobile = false;
    if (svgTag.includes('mobile-only')) {
      isMobile = true;
    }

    const rawPaths = svgContent.match(/<path[^>]*>/g);
    const paths = rawPaths ? rawPaths : [];
    const reusePaths = paths.filter(tag => /data-route\s*=\s*["']reuse["']/.test(tag));
    const executePaths = paths.filter(tag => /data-route\s*=\s*["']execute["']/.test(tag));

    assert.strictEqual(reusePaths.length, 1, `Must have exactly one reuse path in Chapter 3 SVG: ${svgTag}`);
    assert.strictEqual(executePaths.length, 1, `Must have exactly one execute path in Chapter 3 SVG: ${svgTag}`);

    const reuseD = extractDAttribute(reusePaths[0]);
    const executeD = extractDAttribute(executePaths[0]);

    assert.notStrictEqual(reuseD, executeD, 'Reuse path data must not equal execute path data');

    assert.ok(cubicGrammarRegex.test(reuseD), `Reuse path data must match cubic grammar: ${reuseD}`);
    assert.ok(cubicGrammarRegex.test(executeD), `Execute path data must match cubic grammar: ${executeD}`);

    const parseExcursion = (dVal) => {
      const match = dVal.match(cubicGrammarRegex);
      const numbers = match.slice(1).map(Number);
      const startY = numbers[1];
      const cp1y = numbers[3];
      const cp2y = numbers[5];
      const endy = numbers[7];
      return Math.max(Math.abs(cp1y - startY), Math.abs(cp2y - startY), Math.abs(endy - startY));
    };

    const reuseExcursion = parseExcursion(reuseD);
    const executeExcursion = parseExcursion(executeD);

    if (isMobile) {
      assert.ok(reuseExcursion <= 45, `Mobile reuse excursion must be <= 45, got ${reuseExcursion}`);
      assert.ok(executeExcursion >= 65, `Mobile execute excursion must be >= 65, got ${executeExcursion}`);
    } else {
      assert.ok(reuseExcursion <= 50, `Desktop reuse excursion must be <= 50, got ${reuseExcursion}`);
      assert.ok(executeExcursion >= 80, `Desktop execute excursion must be >= 80, got ${executeExcursion}`);
    }

    for (const pathTag of [reusePaths[0], executePaths[0]]) {
      const dashMatch = pathTag.match(/stroke-dasharray\s*=\s*["']([^"']+)["']/);
      assert.ok(dashMatch, `Path must have stroke-dasharray attribute: ${pathTag}`);
      const dashArrayStr = dashMatch[1].trim();
      assert.ok(dashArrayStr.length > 0, `stroke-dasharray must be non-empty: ${pathTag}`);
      const dashVals = dashArrayStr.split(/[\s,]+/).filter(Boolean);
      assert.ok(dashVals.length > 0, `stroke-dasharray must have at least one value: ${pathTag}`);
      for (const val of dashVals) {
        assert.ok(!isNaN(parseFloat(val)), `stroke-dasharray value must be numeric: ${val}`);
      }
    }
  }

  // --- 4. Chapter 2 Static Fields ---
  const ch2Html = getChapterHtml(html, 'chapter-02');
  const ch2SvgBlocks = [...ch2Html.matchAll(/<svg[^>]*>([\s\S]*?)<\/svg>/g)];
  assert.strictEqual(ch2SvgBlocks.length, 2, 'Chapter 2 must contain exactly 2 SVGs');
  for (const block of ch2SvgBlocks) {
    const svgTag = block[0];
    const svgContent = block[1];

    const rawCircles = svgContent.match(/<circle[^>]*>/g);
    const circles = rawCircles ? rawCircles : [];
    const inputsCircles = circles.filter(tag => /data-field\s*=\s*["']inputs["']/.test(tag));
    const paramsCircles = circles.filter(tag => /data-field\s*=\s*["']params["']/.test(tag));

    assert.strictEqual(inputsCircles.length, 1, `Must have exactly one inputs circle in SVG: ${svgTag}`);
    assert.strictEqual(paramsCircles.length, 1, `Must have exactly one params circle in SVG: ${svgTag}`);

    for (const circle of [inputsCircles[0], paramsCircles[0]]) {
      const fillMatch = circle.match(/fill\s*=\s*["']([^"']+)["']/);
      assert.ok(fillMatch && fillMatch[1] !== 'none', `Circle fill must not be none: ${circle}`);

      let fillOpacity = null;
      const opAttrMatch = circle.match(/fill-opacity\s*=\s*["']([^"']+)["']/);
      if (opAttrMatch) {
        fillOpacity = opAttrMatch[1];
      } else {
        const opStyleMatch = circle.match(/style="[^"]*fill-opacity:\s*([^;"]+)/);
        if (opStyleMatch) {
          fillOpacity = opStyleMatch[1];
        }
      }
      assert.ok(fillOpacity !== null, `Circle must have explicit fill-opacity: ${circle}`);
      const opacityVal = parseFloat(fillOpacity);
      assert.ok(opacityVal < 0.5, `Circle fill-opacity must be < 0.5, got ${opacityVal}: ${circle}`);

      let strokeVal = null;
      const strokeAttrMatch = circle.match(/stroke\s*=\s*(["'])(.*?)\1/);
      if (strokeAttrMatch) {
        strokeVal = strokeAttrMatch[2].trim();
      } else {
        const strokeStyleMatch = circle.match(/style="[^"]*stroke\s*:\s*([^;"]+)/) || circle.match(/style='[^']*stroke\s*:\s*([^;']+)/);
        if (strokeStyleMatch) {
          strokeVal = strokeStyleMatch[1].trim();
        }
      }
      assert.ok(strokeVal !== null && strokeVal !== 'none', `Circle must have stroke whose value is not none, got ${strokeVal}: ${circle}`);
      assert.ok(!circle.includes('data-motion-accent'), `Circle must not carry data-motion-accent: ${circle}`);
    }
  }

  // --- 5. Chapter 2 Fingerprint ---
  function validateFingerprint(dVal) {
    const trimmed = dVal.trim();
    const subpathRegex = /^[Mm]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*[Ll]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*$/;
    const subpaths = trimmed.split(/(?=[Mm])/).map(s => s.trim()).filter(Boolean);
    if (subpaths.length !== 5) {
      return false;
    }
    for (const subpath of subpaths) {
      const match = subpath.match(subpathRegex);
      if (!match) return false;
      for (let i = 1; i <= 4; i++) {
        if (!Number.isFinite(Number(match[i]))) return false;
      }
    }
    const fullRegex = /^\s*(?:[Mm]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*[Ll]\s*(-?[\d.]+)(?:\s+|,\s*)(-?[\d.]+)\s*){5}$/;
    if (!fullRegex.test(trimmed)) return false;
    return true;
  }

  // Fingerprint validator negative proof list
  const groupedCommands = 'M 10,10 20,20 L 30,30 40,40 M 50,50 L 60,60 M 70,70 L 80,80 M 90,90 L 100,100 M 110,110 L 120,120';
  const fourLines = 'M 10,10 L 10,20 M 20,20 L 20,30 M 30,30 L 30,40 M 40,40 L 40,50';
  const extraCommandZ = 'M 10,10 L 10,20 M 20,20 L 20,30 M 30,30 L 30,40 M 40,40 L 40,50 M 50,50 L 50,60 Z';
  const extraCommandC = 'M 10,10 L 10,20 M 20,20 L 20,30 M 30,30 L 30,40 M 40,40 L 40,50 M 50,50 L 50,60 C 1 2 3 4 5 6';
  assert.ok(!validateFingerprint(groupedCommands), 'Reject grouped commands');
  assert.ok(!validateFingerprint(fourLines), 'Reject four lines');
  assert.ok(!validateFingerprint(extraCommandZ), 'Reject trailing Z');
  assert.ok(!validateFingerprint(extraCommandC), 'Reject extra C command');

  for (const block of ch2SvgBlocks) {
    const svgTag = block[0];
    const svgContent = block[1];

    const rawPaths = svgContent.match(/<path[^>]*>/g);
    const paths = rawPaths ? rawPaths : [];
    const staticFingerprints = paths.filter(tag => /data-visual-object\s*=\s*["']fingerprint["']/.test(tag));
    const revealOverlays = paths.filter(tag => /data-motion-accent\s*=\s*["']reveal["']/.test(tag));

    assert.strictEqual(staticFingerprints.length, 1, `Must have exactly one static fingerprint in SVG: ${svgTag}`);
    assert.strictEqual(revealOverlays.length, 1, `Must have exactly one reveal overlay in SVG: ${svgTag}`);

    const staticTag = staticFingerprints[0];
    const revealTag = revealOverlays[0];

    const staticD = extractDAttribute(staticTag);
    const revealD = extractDAttribute(revealTag);

    assert.strictEqual(staticD, revealD, 'Fingerprint static and reveal d attributes must be identical');

    assert.ok(validateFingerprint(staticD), `Static fingerprint must match fingerprint grammar: ${staticD}`);
    assert.ok(validateFingerprint(revealD), `Reveal overlay must match fingerprint grammar: ${revealD}`);

    const staticIdx = svgContent.indexOf(staticTag);
    const revealIdx = svgContent.indexOf(revealTag);
    assert.ok(staticIdx < revealIdx, 'Static fingerprint must appear before reveal overlay in SVG content');

    const staticStrokeMatch = staticTag.match(/stroke\s*=\s*(["'])(.*?)\1/);
    const revealStrokeMatch = revealTag.match(/stroke\s*=\s*(["'])(.*?)\1/);
    assert.ok(staticStrokeMatch, `Static fingerprint must have stroke: ${staticTag}`);
    assert.ok(revealStrokeMatch, `Reveal overlay must have stroke: ${revealTag}`);
    assert.notStrictEqual(staticStrokeMatch[2], revealStrokeMatch[2], `Strokes must differ: static=${staticStrokeMatch[2]}, reveal=${revealStrokeMatch[2]}`);
  }

  function getRevealRuleBody(cssText) {
    const regex = /\.is-enhanced\s+\.chapter-row\.is-playing\s+\[data-motion-accent=(?:"reveal"|'reveal'|reveal)\]\s*\{([^}]+)\}/;
    const match = cssText.match(regex);
    return match ? match[1] : null;
  }

  const revealBody = getRevealRuleBody(cleanCss);
  assert.ok(revealBody, 'Reveal selector `.is-enhanced .chapter-row.is-playing [data-motion-accent="reveal"]` must exist in CSS');

  const animationMatch = revealBody.match(/(?:^|;|\s)animation\s*:\s*([^;]+)/i);
  const animationNameMatch = revealBody.match(/(?:^|;|\s)animation-name\s*:\s*([^;]+)/i);

  let animationValue = null;
  if (animationNameMatch) {
    animationValue = animationNameMatch[1].trim();
  } else if (animationMatch) {
    animationValue = animationMatch[1].trim();
  }

  assert.ok(animationValue && animationValue !== 'none', 'Reveal animation value must not be none');

  const cssKeyframes = [];
  const revealKeyframeMatches = cleanCss.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g);
  for (const match of revealKeyframeMatches) {
    cssKeyframes.push(match[1]);
  }

  const animationTokens = animationValue.split(/\s+/).map(t => t.trim()).filter(Boolean);
  let matchedKeyframe = null;
  for (const token of animationTokens) {
    if (cssKeyframes.includes(token)) {
      matchedKeyframe = token;
      break;
    }
  }
  assert.ok(matchedKeyframe, `Animation keyframe name in "${animationValue}" must be declared in the CSS: declared keyframes are [${cssKeyframes.join(', ')}]`);

  // --- 6. Sizing primitive .diagram-surface rules ---
  const diagramSurfaceBlocks = [];
  const diagramSurfaceRegex = /\.diagram-surface\s*\{([^}]+)\}/g;
  let dsMatch;
  while ((dsMatch = diagramSurfaceRegex.exec(cleanCss)) !== null) {
    diagramSurfaceBlocks.push(dsMatch[1]);
  }
  assert.ok(diagramSurfaceBlocks.length > 0, 'CSS must contain .diagram-surface rules');

  // The diagram canvas stays quiet; semantic SVG shapes carry the visual framing.
  const mainBlock = diagramSurfaceBlocks[0];
  const requiredProps = ['background'];
  for (const prop of requiredProps) {
    const propRegex = new RegExp(`(?:^|;|\\s)${prop}\\s*:`, 'i');
    assert.ok(propRegex.test(mainBlock), `.diagram-surface rule must declare ${prop}: block = ${mainBlock}`);
  }
  for (const prop of ['border', 'border-radius']) {
    const propRegex = new RegExp(`(?:^|;|\\s)${prop}\\s*:`, 'i');
    assert.ok(!propRegex.test(mainBlock), `.diagram-surface rule must not add a generic ${prop}: frame = ${mainBlock}`);
  }

  // All blocks must continue to reject outline, box-shadow
  for (const block of diagramSurfaceBlocks) {
    const forbiddenProps = ['outline', 'box-shadow'];
    for (const prop of forbiddenProps) {
      const propRegex = new RegExp(`(?:^|;|\\s)${prop}\\s*:`, 'i');
      assert.ok(!propRegex.test(block), `.diagram-surface rule must not declare ${prop}: block = ${block}`);
    }
  }

  function getMediaBlockBody(cssText, mediaQuery) {
    let index = 0;
    const bodies = [];
    while (true) {
      const matchIdx = cssText.indexOf(mediaQuery, index);
      if (matchIdx === -1) break;

      const openBraceIdx = cssText.indexOf('{', matchIdx + mediaQuery.length);
      if (openBraceIdx === -1) {
        index = matchIdx + mediaQuery.length;
        continue;
      }

      let depth = 1;
      let pos = openBraceIdx + 1;
      while (pos < cssText.length && depth > 0) {
        if (cssText[pos] === '{') depth++;
        else if (cssText[pos] === '}') depth--;
        pos++;
      }

      if (depth === 0) {
        bodies.push(cssText.substring(openBraceIdx + 1, pos - 1));
        index = pos;
      } else {
        index = openBraceIdx + 1;
      }
    }
    return bodies.join('\n');
  }

  const fixtureCss = `@media (max-width: 900px) {
    .first-nested-rule { color: red; }
    .middle-nested-rule { color: green; }
    .last-nested-rule { color: blue; }
  }`;
  const fixtureResult = getMediaBlockBody(fixtureCss, '@media (max-width: 900px)');
  assert.ok(fixtureResult.includes('.first-nested-rule'), 'First rule must be returned in the helper result');
  assert.ok(fixtureResult.includes('.last-nested-rule'), 'Last rule must be returned in the helper result');

  const mobileMediaCss = getMediaBlockBody(cleanCss, '@media (max-width: 900px)');

  const mobileLandingShellMatch = mobileMediaCss.match(/\.landing-shell\s*\{([^}]+)\}/);
  assert.ok(mobileLandingShellMatch, 'Must have .landing-shell rule in mobile CSS');
  const mobileLandingShellCss = mobileLandingShellMatch[1];
  assert.ok(/padding\s*:\s*[^;]*24px/.test(mobileLandingShellCss), 'Mobile 24px gutter selector must exist in .landing-shell inside mobile CSS');

  const mobileDiagramSurfaceMatch = mobileMediaCss.match(/\.diagram-surface\s*\{([^}]+)\}/);
  assert.ok(mobileDiagramSurfaceMatch, 'Must have .diagram-surface rule in mobile CSS');
  const mobileDiagramSurfaceCss = mobileDiagramSurfaceMatch[1];
  assert.ok(/aspect-ratio\s*:\s*270\s*\/\s*220/.test(mobileDiagramSurfaceCss), 'Diagram surface mobile rule must contain aspect-ratio: 270 / 220');

  // --- 7. Change listener ---
  assert.ok(/mediaQuery\.(?:addEventListener\(\s*['"]change['"]|addListener\()/.test(clientJs), 'mediaQuery change event must be listened to directly in animation-client.js');

  // --- 8. Hero metrics exact values ---
  function getCSSProperty(cssText, selector, property) {
    const escapedSelector = selector.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\s|\\{|\\})${escapedSelector}\\s*\\{([^}]+)\\}`, 'g');
    let match;
    const values = [];
    while ((match = regex.exec(cssText)) !== null) {
      const body = match[1];
      const propRegex = new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;}]+)`, 'i');
      const propMatch = body.match(propRegex);
      if (propMatch) {
        values.push(propMatch[1].trim());
      }
    }
    return values;
  }

  const heroHeightStr = getCSSProperty(cleanCss, '.hero', 'height')[0];
  const displayTypeTopStr = getCSSProperty(cleanCss, '.display-type', 'top')[0];
  const displayTypeSpanDisplay = getCSSProperty(cleanCss, '.display-type span', 'display')[0];
  const heroLeadTopStr = getCSSProperty(cleanCss, '.hero-lead', 'top')[0];
  const heroActionsTopStr = getCSSProperty(cleanCss, '.hero-actions', 'top')[0];
  const storyIntroPaddingTopStr = getCSSProperty(cleanCss, '.story-intro', 'padding-top')[0];

  assert.strictEqual(heroHeightStr, '628px', '.hero height must be exactly 628px');
  assert.strictEqual(displayTypeTopStr, '80px', '.display-type top must be exactly 80px');
  assert.strictEqual(displayTypeSpanDisplay, 'block', '.display-type span display must be exactly block');
  assert.strictEqual(heroLeadTopStr, '336px', '.hero-lead top must be exactly 336px');
  assert.strictEqual(heroActionsTopStr, '524px', '.hero-actions top must be exactly 524px');
  assert.strictEqual(storyIntroPaddingTopStr, '24px', '.story-intro padding-top must be exactly 24px');

  function getBraceDepthBefore(str, targetIdx) {
    let depth = 0;
    let inString = false;
    let stringChar = null;
    let isEscaped = false;

    for (let i = 0; i < targetIdx; i++) {
      const c = str[i];
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (c === '\\') {
        isEscaped = true;
        continue;
      }
      if (inString) {
        if (c === stringChar) {
          inString = false;
        }
      } else {
        if (c === '"' || c === "'") {
          inString = true;
          stringChar = c;
        } else if (c === '{') {
          depth++;
        } else if (c === '}') {
          depth--;
        }
      }
    }
    return depth;
  }

  function getStandaloneAccentRules(cssText) {
    return [
      ...cssText.matchAll(
        /(?:^|[{}])\s*(\.hero-title-accent)\s*\{([^}]*)\}/g
      )
    ];
  }

  // Falsifying parser fixtures for getStandaloneAccentRules
  assert.strictEqual(
    getStandaloneAccentRules('.wrapper .hero-title-accent { color: var(--brand); }').length,
    0,
    'getStandaloneAccentRules rejects nested/compound selectors'
  );
  assert.strictEqual(
    getStandaloneAccentRules('.hero-title-accent:hover { color: var(--brand); }').length,
    0,
    'getStandaloneAccentRules rejects selector variations'
  );

  const accentTokens = cleanCss.match(/\.hero-title-accent\b/g) || [];
  const accentRules = getStandaloneAccentRules(cleanCss);

  assert.strictEqual(accentTokens.length, 1,
    '.hero-title-accent must appear exactly once in CSS');
  assert.strictEqual(accentRules.length, 1,
    '.hero-title-accent must have one exact standalone rule');

  const accentSelectorIndex =
    accentRules[0].index + accentRules[0][0].indexOf(accentRules[0][1]);

  assert.strictEqual(getBraceDepthBefore(cleanCss, accentSelectorIndex), 0,
    '.hero-title-accent must be a global top-level rule');
  assert.match(accentRules[0][2],
    /^\s*color\s*:\s*var\(--brand\)\s*;?\s*$/,
    '.hero-title-accent must declare only color: var(--brand)');

  const secondaryBtnBg = getCSSProperty(cleanCss, '.button:not(.button--primary)', 'background')[0];
  const secondaryBtnBorder = getCSSProperty(cleanCss, '.button:not(.button--primary)', 'border')[0];
  assert.strictEqual(secondaryBtnBg, 'var(--surface-soft)', 'Secondary button normal background must be var(--surface-soft)');
  assert.strictEqual(secondaryBtnBorder, '1px solid transparent', 'Secondary button normal border must be 1px solid transparent');

  const secondaryBtnHoverBg = getCSSProperty(cleanCss, '.button:not(.button--primary):hover', 'background')[0];
  const secondaryBtnHoverBorderColor = getCSSProperty(cleanCss, '.button:not(.button--primary):hover', 'border-color')[0];
  assert.strictEqual(secondaryBtnHoverBg, 'var(--surface)', 'Secondary button hover background must be var(--surface)');
  assert.strictEqual(secondaryBtnHoverBorderColor, 'transparent', 'Secondary button hover border color must be transparent');

  const heroHeightVal = Number(heroHeightStr.slice(0, -2));
  const displayTypeTopVal = Number(displayTypeTopStr.slice(0, -2));
  const heroLeadTopVal = Number(heroLeadTopStr.slice(0, -2));
  const heroActionsTopVal = Number(heroActionsTopStr.slice(0, -2));
  const storyIntroPaddingTopVal = Number(storyIntroPaddingTopStr.slice(0, -2));

  const headerHeight = 64;
  const storyStartPageY = headerHeight + heroHeightVal;
  const displayTypePageY = headerHeight + displayTypeTopVal;
  const heroLeadPageY = headerHeight + heroLeadTopVal;
  const heroActionsPageY = headerHeight + heroActionsTopVal;
  const storyIntroPageY = storyStartPageY + storyIntroPaddingTopVal;

  assert.strictEqual(storyStartPageY, 692, 'story must start at page y = 692');
  assert.strictEqual(displayTypePageY, 144, 'H1 (.display-type) must start at page y = 144');
  assert.strictEqual(heroLeadPageY, 400, 'Lead (.hero-lead) must start at page y = 400');
  assert.strictEqual(heroActionsPageY, 588, 'CTA/Actions (.hero-actions) must start at page y = 588');
  assert.strictEqual(storyIntroPageY, 716, 'Eyebrow (.story-intro) must start at page y = 716');

  // --- 9. Reject Comments ---
  assert.ok(!/<!--[\s\S]*?-->/.test(html), 'Landing page must not contain any HTML comments');
  const rawStyleTags = html.match(/<style[^>]*>([\s\S]*?)<\/style>/g);
  const styleTags = rawStyleTags ? rawStyleTags : [];
  for (const styleTag of styleTags) {
    assert.ok(!/\/\*[\s\S]*?\*\//.test(styleTag), 'CSS style blocks must not contain comments');
  }

  // --- Other accessibility and page invariants ---
  assert.ok(!html.includes('aria-live'), 'No aria-live reveal announcer exists');
  assert.ok(/<[^>]+aria-label=(?:"[^"]+"|'[^']+'|[^>\s]+)[^>]*>/.test(html), 'Has exact aria-label element');

  const rawHrefs = [...html.matchAll(/href=(?:"([^"]+)"|'([^']+)'|([^>\s]+))/g)];
  const hrefs = rawHrefs.map(m => {
    if (m[1]) return m[1];
    if (m[2]) return m[2];
    return m[3];
  });

  const rawSrcs = [...html.matchAll(/src=(?:"([^"]+)"|'([^']+)'|([^>\s]+))/g)];
  const srcs = rawSrcs.map(m => {
    if (m[1]) return m[1];
    if (m[2]) return m[2];
    return m[3];
  });

  const internals = [...hrefs, ...srcs].filter(url => {
    if (url.startsWith('./')) return true;
    if (url.startsWith('/symbiote-engine/')) return true;
    return false;
  });
  assert.ok(internals.length > 0, 'Parses internal link/asset/route');

  assert.ok(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.test(html), 'CSS supports reduced motion');

  const { execSync } = await import('node:child_process');

  const jsFiles = ['_site/animation-client.js', '_site/demo/index.js'];
  for (const jsFile of jsFiles) {
    execSync(`node --check ${jsFile}`);
  }

  assert.ok(/import\s+[^"']+['"][^'"]+['"]/.test(html) || html.includes('import(') || html.includes('type="module"'), 'Resolves module imports in HTML');

  const html404 = fs.readFileSync('_site/404.html', 'utf8');
  assert.ok(html404.includes('<h1 class="error-subtitle">Page Not Found</h1>') || /<h1[^>]*>Page Not Found<\/h1>/.test(html404), '404 title is an H1');
  assert.ok(!html404.includes('style="border: none; margin-top: 0;"'), '404 title has no inline style');

  assert.strictEqual((htmlDocs.match(/<nav\b[^>]*>/g) || []).length, 1, 'One desktop route navigation structure');
  assert.strictEqual((htmlDocs.match(/class="[^"]*nav-link is-current[^"]*"/g) || []).length, 1, 'One active route in top nav');

  assert.ok(/<details[^>]*>[\s\S]*?<summary[^>]*>[^<]*(?:Menu|Navigation|Table of Contents)[^<]*<\/summary>/i.test(htmlDocs), 'Mobile Menu native disclosure exists');
  assert.ok(/<details[^>]*>[\s\S]*?<summary[^>]*>[^<]*On this page[^<]*<\/summary>/i.test(htmlDocs), 'On this page native disclosure exists');

  assert.ok(/position:\s*(?:fixed|absolute)/.test(htmlDocs), 'CSS encodes fixed/overlay drawer behavior');
  assert.ok(htmlDocs.includes('320px'), 'CSS contains 320 px cap');
  assert.ok(htmlDocs.includes('48px'), 'CSS contains 48 px bar');
  assert.ok(htmlDocs.includes('24px'), 'CSS contains 24 px gutters');
  assert.ok(/order:\s*\d/.test(htmlDocs) || /grid-(?:auto|template)-flow/.test(htmlDocs) || /flex-direction/.test(htmlDocs), 'CSS contains non-reflow grid ordering');

  assert.ok(/272px/.test(htmlDocs), 'Desktop 272px geometry remains represented');
  assert.ok(/688px/.test(htmlDocs), 'Desktop 688px geometry remains represented');
  assert.ok(/208px/.test(htmlDocs) || /13rem/.test(htmlDocs), 'Desktop 208px geometry remains represented');

  assert.ok(/<h2[^>]*>\s*Design goals\s*<\/h2>/.test(htmlDocs), 'Design goals is an ordinary h2 section');
  assert.ok(!/<div[^>]*class="[^"]*callout[^"]*"[^>]*>[\s\S]*?Design goals/.test(htmlDocs), 'Design goals is not a callout');

  const calloutCssMatch = htmlDocs.match(/\.callout\s*\{([^}]+)\}/);
  if (calloutCssMatch) {
    const calloutCss = calloutCssMatch[1];
    assert.ok(!/border-left\s*:/.test(calloutCss) || /border-left\s*:\s*(?:0|none)/.test(calloutCss), 'No border-left on generic callout');
    assert.ok(!/border\s*:/.test(calloutCss) || /border\s*:\s*(?:0|none)/.test(calloutCss), 'No full border on generic callout');
  }

  assert.ok(/\.content-shell[^{]*\{[^}]*(?:padding-top:\s*0|padding:\s*0(?:\s+0)?)/.test(htmlDocs), 'content-shell resets padding');
  assert.ok(/\.docs-container[^{]*\{[^}]*gap:\s*0/.test(htmlDocs), 'docs-container resets gap');
  assert.ok(/\.docs-container[^{]*\{[^}]*margin-top:\s*0/.test(htmlDocs), 'docs-container resets inherited top margin');
  assert.ok(/\.docs-container[^{]*\{[^}]*align-items:\s*stretch/.test(htmlDocs), 'docs-container stretches the mobile bar to the viewport gutters');
  assert.ok(/\.docs-sidebar[^{]*\{[^}]*width:\s*auto/.test(htmlDocs), 'docs-sidebar resets width');
  assert.ok(/\.docs-sidebar[^{]*\{[^}]*height:\s*48px/.test(htmlDocs), 'docs-sidebar resets height');
  assert.ok(/\.docs-sidebar[^{]*\{[^}]*position:\s*static/.test(htmlDocs), 'docs-sidebar resets position');
  assert.ok(/\.docs-sidebar[^{]*\{[^}]*top:\s*auto/.test(htmlDocs), 'docs-sidebar resets top');
  assert.ok(/\.docs-sidebar[^{]*\{[^}]*overflow:\s*visible/.test(htmlDocs), 'docs-sidebar resets overflow');
  assert.ok(/\.docs-sidebar[^{]*\{[^}]*padding:\s*0/.test(htmlDocs), 'docs-sidebar resets padding');
  assert.ok(/\.docs-sidebar[^{]*\{[^}]*border:\s*(?:none|0)/.test(htmlDocs), 'docs-sidebar resets border');

  const breakpointMatch = htmlDocs.match(/@media\s*\(\s*max-width\s*:\s*380px\s*\)/);
  assert.ok(breakpointMatch, '380px breakpoint exists');
  if (breakpointMatch) {
    const chunk = htmlDocs.slice(breakpointMatch.index, breakpointMatch.index + 500);
    assert.ok(/(?:calc\(|min\()\s*100%\s*-\s*48px/.test(chunk), '380px breakpoint uses 100% - 48px for gutters');
    assert.ok(!/1\.25rem/.test(chunk) && !/20px/.test(chunk), '380px breakpoint does not use 1.25rem or 20px for gutters');
  }

  const layoutHtml = fs.readFileSync('_site/index.html', 'utf8');
  assert.ok(/aria-label="Navigation"/i.test(layoutHtml) || /aria-label="Menu"/i.test(layoutHtml), 'Uses a neutral navigation accessible name');
  assert.ok(/aria-expanded="false"/.test(layoutHtml), 'Keeps aria-expanded attribute');
  assert.ok(!layoutHtml.includes('<link rel="icon" href="data:,'), 'Rejects empty data:, placeholder');
  assert.ok(layoutHtml.includes('href="data:image/svg+xml'), 'Favicon matches brand mark icon contract (encoded SVG data URL)');

  const forbiddenLandingSubstrings = ['data-enhanced-controls', 'data-seek', 'data-action', 'AUTO MODE'];
  for (const term of forbiddenLandingSubstrings) {
    assert.ok(!html.includes(term), `Landing page must not contain "${term}"`);
  }

  const forbiddenSelectors = ['status', 'metric', 'caption', 'player', 'dashboard', 'hud', 'kpi', 'card-grid', 'controls'];
  for (const sel of forbiddenSelectors) {
    const classPattern = new RegExp(`class="[^"]*\\b${sel}\\b[^"]*"`);
    const idPattern = new RegExp(`id="[^"]*\\b${sel}\\b[^"]*"`);
    const dataPattern = new RegExp(`data-[^=\\s]*${sel}`);
    assert.ok(!classPattern.test(html), `Landing page must not contain class matching "${sel}"`);
    assert.ok(!idPattern.test(html), `Landing page must not contain id matching "${sel}"`);
    assert.ok(!dataPattern.test(html), `Landing page must not contain data-attribute matching "${sel}"`);
  }

  assert.ok(!html.includes('role="button"'), 'Narrative steps do not have role="button" initially');
  assert.ok(!html.includes('tabindex="0"'), 'Narrative steps do not have tabindex="0" initially');
  assert.ok(!html.includes('aria-current="step"'), 'No active playback status state');
  assert.ok(!clientJs.includes('requestAnimationFrame'), 'No rAF in animation-client.js');

  let hasRevealHooks = false;
  if (html.includes('reveal-on-scroll')) hasRevealHooks = true;
  if (html.includes('is-enhanced')) hasRevealHooks = true;
  assert.ok(hasRevealHooks, 'Enhancement / scroll reveal styling hooks exist');
  assert.ok(clientJs.includes('IntersectionObserver'), 'IntersectionObserver is used in client JS');

  const opacityZeroMatches = [...cleanCss.matchAll(/([^{}]+)\{[^}]*opacity:\s*0[^}]*\}/g)];
  for (const m of opacityZeroMatches) {
    const selector = m[1].trim();
    if (selector.includes('@keyframes') || selector.includes('from') || selector.includes('to') || selector.includes('%')) {
      continue;
    }
    assert.ok(selector.includes('.is-enhanced'), `Selector "${selector}" setting opacity: 0 must be scoped with .is-enhanced to support progressive enhancement static visibility`);
  }

  assert.ok(clientJs.includes('visibilitychange'), 'animation-client.js listens to visibilitychange events');
  assert.ok(clientJs.includes('hidden') || clientJs.includes('document.hidden'), 'animation-client.js checks document visibility/hidden state');
  assert.ok(!html.includes('linear infinite'), 'No linear infinite layout animations');
  assert.ok(!html.includes('min-width: 840px'), 'No 840px minimum width on execution SVG');

  const chapterClasses = ['chapter-01', 'chapter-02', 'chapter-03', 'chapter-04'];
  const kickers = [
    '01 / Graph shape',
    '02 / Cache identity',
    '03 / Cache branch',
    '04 / Observable outcome'
  ];
  chapterClasses.forEach((cls, idx) => {
    assert.ok(html.includes(cls), `Chapter ${cls} is present`);
    const chHtml = getChapterHtml(html, cls);
    assert.ok(chHtml.includes(kickers[idx]), `Chapter ${cls} kicker title contains "${kickers[idx]}"`);
  });
  assert.ok(!html.includes('chapter-05'), 'Chapter 05 is excluded');

  const heroH1Product = 'Symbiote Engine';
  const heroH1Thesis = 'Portable graph execution, made observable.';
  const heroLead = 'Define a portable graph once. At runtime, registered behavior, cache decisions, lifecycle failures, and execution results stay explicit to the host without binding the graph to a product shell.';

  const introEyebrow = 'How it works';
  const introH2 = 'One graph. Every branch stays visible.';
  const introLead = 'Graph data meets registered behavior at runtime. Engine resolves cache identity, chooses reuse or execution, and returns lifecycle failures as node-scoped output.';

  const ch1Title = 'A graph stays portable until the host supplies behavior.';
  const ch1Para = 'JSON carries node types, parameters, and connections. The registry maps those types to behavior at runtime, so graph data remains independent of a product shell.';
  const ch2Title = 'Inputs and parameters become one repeatable identity.';
  const ch2Para = 'For lifecycle-enabled nodes, the default cache key is exactly JSON.stringify({ i: inputs, p: params }). Execution context reaches execute, but it is not part of that default key.';
  const ch3Title = 'Validation comes first; then the cache chooses the path.';
  const ch3Para = 'After validation and key resolution, a matching auto-mode entry returns stored output. A miss executes, may post-process the output, and then stores it under the resolved key.';
  const ch4Title = 'A lifecycle failure becomes output, not a hidden stop.';
  const ch4Para = 'Validation, execution, or post-processing errors become node-scoped { _error } output and a structured execution-log record. The traversal loop continues; later nodes still depend on their resolved inputs.';

  assert.ok(html.includes(heroH1Product), 'Hero H1 product');
  assert.ok(html.includes(heroH1Thesis), 'Hero H1 thesis');
  assert.ok(html.includes(heroLead), 'Hero lead');
  assert.ok(html.includes(introEyebrow), 'Intro eyebrow');
  assert.ok(html.includes(introH2), 'Intro H2');
  function getExactStoryLeadMatches(markup) {
    return [...markup.matchAll(/<p class="story-lead">([^<]*)<\/p>/g)];
  }

  // Falsifying matches for getExactStoryLeadMatches
  assert.strictEqual(
    getExactStoryLeadMatches('<p class="not-story-lead">intro lead content</p>').length,
    0,
    'getExactStoryLeadMatches rejects class substring'
  );
  assert.strictEqual(
    getExactStoryLeadMatches('<p class="story-lead extra-class">intro lead content</p>').length,
    0,
    'getExactStoryLeadMatches rejects extra class'
  );

  const storyLeadMatches = getExactStoryLeadMatches(html);
  assert.strictEqual(storyLeadMatches.length, 1, 'exactly one <p class="story-lead"> match');
  assert.strictEqual(storyLeadMatches[0][1], introLead, 'strict equality of raw inner text to the locked sentence');
  assert.ok(html.includes(ch1Title) && html.includes(ch1Para), 'Ch1 copy');
  assert.ok(html.includes(ch2Title) && html.includes(ch2Para), 'Ch2 copy');
  assert.ok(html.includes(ch3Title) && html.includes(ch3Para), 'Ch3 copy');
  assert.ok(html.includes(ch4Title) && html.includes(ch4Para), 'Ch4 copy');

  chapterClasses.forEach(cls => {
    const chHtml = getChapterHtml(html, cls);
    const svgRegex = /<svg[^>]*>([\s\S]*?)<\/svg>/g;
    let match;
    let svgIndex = 0;
    while ((match = svgRegex.exec(chHtml)) !== null) {
      svgIndex++;
      const svgOuter = match[0];
      const svgContent = match[1];

      const visualObjectsCount = (svgContent.match(/data-visual-object/g) || []).length;
      assert.ok(visualObjectsCount <= 5, `Chapter ${cls} SVG #${svgIndex} has at most 5 visual objects, got ${visualObjectsCount}`);
      const motionAccentsCount = (svgContent.match(/data-motion-accent/g) || []).length;
      assert.ok(motionAccentsCount <= 3, `Chapter ${cls} SVG #${svgIndex} has at most 3 motion accents, got ${motionAccentsCount}`);

      assert.ok(!svgContent.includes('<rect'), `Chapter ${cls} SVG #${svgIndex} contains <rect>`);
      assert.ok(!svgContent.includes('<marker') && !svgOuter.includes('marker-end') && !svgOuter.includes('url(#arrow)'), `Chapter ${cls} SVG #${svgIndex} contains arrow markers`);

      const rawTexts = svgContent.match(/<text\b[^>]*>([\s\S]*?)<\/text>/g);
      const texts = rawTexts ? rawTexts : [];
      assert.ok(texts.length <= 5, `Chapter ${cls} SVG #${svgIndex} has more than 5 text labels`);
      texts.forEach(t => {
        const textContent = t.replace(/<[^>]+>/g, '').trim();
        assert.ok(textContent.length <= 18, `Chapter ${cls} SVG #${svgIndex} label length > 18: "${textContent}"`);
      });

      const forbiddenS = ['status', '[ERROR]', 'timeout', 'console', 'telemetry'];
      for (const f of forbiddenS) {
        assert.ok(!svgOuter.includes(f), `Chapter ${cls} SVG #${svgIndex} contains forbidden text: ${f}`);
      }

      if (svgOuter.includes('mobile-only')) {
        assert.ok(/viewBox="0 0 270\b/.test(svgOuter), `Chapter \${cls} mobile SVG viewBox width must be exactly 270`);
      }
    }
  });



  // Assert mobile illustration label floor of 12 CSS pixels: all <text> elements in mobile SVGs must have font-size >= 12
  const mobileSvgRegex = /<svg[^>]*class="[^"]*mobile-only[^"]*"[^>]*>([\s\S]*?)<\/svg>/g;
  let mobileSvgMatch;
  let mobileSvgCount = 0;
  while ((mobileSvgMatch = mobileSvgRegex.exec(html)) !== null) {
    mobileSvgCount++;
    const svgContent = mobileSvgMatch[1];
    let textMatch;
    const textTagRegex = /<text\b([^>]*)>/g;
    let foundText = false;
    while ((textMatch = textTagRegex.exec(svgContent)) !== null) {
      foundText = true;
      const attrs = textMatch[1];
      const fsAttr = attrs.match(/font-size="([\d.]+)"/);
      const fsStyle = attrs.match(/style="[^"]*font-size:\s*([\d.]+)px/);
      let size = null;
      if (fsAttr) {
        size = parseFloat(fsAttr[1]);
      } else if (fsStyle) {
        size = parseFloat(fsStyle[1]);
      }
      assert.ok(size !== null, `Text element in mobile SVG ${mobileSvgCount} must have an explicit font-size attribute or inline style`);
      assert.ok(size >= 12, `Text element in mobile SVG ${mobileSvgCount} must have font-size >= 12, got ${size}`);
    }
    assert.ok(foundText, `Mobile SVG ${mobileSvgCount} should contain text elements`);
  }
  assert.ok(mobileSvgCount >= 4, `Expected at least 4 mobile SVGs for the four chapters, got ${mobileSvgCount}`);

  assert.ok(!html.includes('links-grid'), 'No links-grid should be present in footer/CTA area');
  assert.ok(!html.includes('link-item'), 'No link-item should be present in footer/CTA area');

  const closingCtaIdx = html.lastIndexOf('closing-cta');
  let footerStart = -1;
  if (closingCtaIdx !== -1) {
    footerStart = closingCtaIdx;
  } else {
    const footerTagIdx = html.lastIndexOf('<footer');
    if (footerTagIdx !== -1) {
      footerStart = footerTagIdx;
    } else {
      footerStart = html.lastIndexOf('cta');
    }
  }

  if (footerStart !== -1) {
    const footerHtml = html.substring(footerStart);
    const rawLinks = footerHtml.match(/<a\s/g);
    const linkCount = rawLinks ? rawLinks.length : 0;
    assert.ok(linkCount <= 3, `Footer/CTA area has at most 3 links, got ${linkCount}`);
    assert.ok(footerHtml.toLowerCase().includes('github'), 'Footer/CTA area has a GitHub link');
  }

  assert.ok(!html.includes('diag-grid-1') && !html.includes('diag-grid-2'), 'No grid patterns in SVGs');

  const ch4Html = getChapterHtml(html, 'chapter-04');
  const rawCh4Tracks = [...ch4Html.matchAll(/<path[^>]*data-visual-object="track"[^>]*>/g)];
  const ch4Tracks = rawCh4Tracks.map(m => m[0]);
  assert.ok(ch4Tracks.length >= 2, 'Chapter 4 must contain at least 2 traversal track paths (desktop and mobile)');
  for (const track of ch4Tracks) {
    const dMatch = track.match(/(?:^|\s)d\s*=\s*(["'])([^"'>]*?)\1/);
    assert.ok(dMatch, `Track path must have d attribute: ${track}`);
    const dVal = dMatch[2];
    assert.ok(dVal.includes('C') || dVal.includes('c'), `Track path must be a cubic curve: ${track}`);

    const normalized = dVal.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    const commands = normalized.split(/(?=[MmLlHhVvCcSsQqTtAaZz])/);

    let currentY = 0;
    const yValues = new Set();

    for (const cmd of commands) {
      const type = cmd[0];
      const args = cmd.slice(1).trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
      if (type === 'M' || type === 'm') {
        currentY = args[1];
        yValues.add(currentY);
      } else if (type === 'C') {
        yValues.add(args[1]);
        yValues.add(args[3]);
        currentY = args[5];
        yValues.add(currentY);
      } else if (type === 'c') {
        yValues.add(currentY + args[1]);
        yValues.add(currentY + args[3]);
        currentY = currentY + args[5];
        yValues.add(currentY);
      }
    }
    assert.ok(yValues.size >= 3, `Track path must have at least 3 distinct y values (non-collinear), got: ${[...yValues].join(', ')} in ${track}`);
  }

  const rawMobileSvgs = html.match(/<svg[^>]*class="[^"]*mobile-only[^"]*"[^>]*>/g);
  const mobileSvgsList = rawMobileSvgs ? rawMobileSvgs : [];
  assert.ok(mobileSvgsList.length > 0, 'Must have mobile SVGs');
  for (const svg of mobileSvgsList) {
    const vbMatch = svg.match(/viewBox="([^"]+)"/);
    assert.ok(vbMatch, `Mobile SVG must have viewBox: ${svg}`);
    assert.strictEqual(vbMatch[1], '0 0 270 220', `Mobile SVG viewBox must be exactly "0 0 270 220": ${svg}`);
  }

  const rawSvgOuterMatches = html.match(/<svg[^>]*>[\s\S]*?<\/svg>/g);
  const svgOuterMatchesList = rawSvgOuterMatches ? rawSvgOuterMatches : [];
  const forbiddenTextsList = ['status', '[ERROR]', 'timeout', 'console', 'telemetry'];
  for (const svg of svgOuterMatchesList) {
    for (const word of forbiddenTextsList) {
      assert.ok(!svg.toLowerCase().includes(word.toLowerCase()), `SVG must not contain forbidden text: ${word}`);
    }
  }

  const rawMobileSvgContentMatches = html.match(/<svg[^>]*class="[^"]*mobile-only[^"]*"[^>]*>([\s\S]*?)<\/svg>/g);
  const mobileSvgContentMatchesList = rawMobileSvgContentMatches ? rawMobileSvgContentMatches : [];
  for (const svgContent of mobileSvgContentMatchesList) {
    const rawTextElements = svgContent.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
    const textElements = rawTextElements ? rawTextElements : [];
    for (const textElem of textElements) {
      const fontAttr = textElem.match(/font-size="([^"]+)"/);
      const fontStyle = textElem.match(/style="[^"]*font-size:\s*([^;"]+)px/);
      const sizeStr = fontAttr ? fontAttr[1] : (fontStyle ? fontStyle[1] : null);
      assert.ok(sizeStr, `Text element must have font-size: ${textElem}`);
      const size = parseFloat(sizeStr);
      assert.ok(size >= 13, `Text element font-size in mobile SVG must be >= 13, got ${size}: ${textElem}`);
    }
  }

  function stripKeyframes(cssText) {
    let result = '';
    let i = 0;
    while (i < cssText.length) {
      if (cssText.substring(i).startsWith('@keyframes')) {
        const braceIndex = cssText.indexOf('{', i);
        if (braceIndex === -1) {
          i++;
          continue;
        }
        let depth = 1;
        let j = braceIndex + 1;
        while (j < cssText.length && depth > 0) {
          if (cssText[j] === '{') depth++;
          else if (cssText[j] === '}') depth--;
          j++;
        }
        i = j;
      } else {
        result += cssText[i];
        i++;
      }
    }
    return result;
  }

  const declaredKeyframes = [];
  const keyframeMatches = cleanCss.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g);
  for (const match of keyframeMatches) {
    declaredKeyframes.push(match[1]);
  }

  const cssWithoutKeyframes = stripKeyframes(cleanCss);
  for (const name of declaredKeyframes) {
    const isUsed = new RegExp(`\\b${name}\\b`).test(cssWithoutKeyframes);
    assert.ok(isUsed, `Keyframe animation "${name}" is declared but never referenced in CSS rules`);
  }

  const motionAccentMatches = cleanCss.matchAll(/data-motion-accent\s*=\s*["']([^"']+)["']/g);
  for (const match of motionAccentMatches) {
    const accentVal = match[1];
    let inHtml = false;
    if (html.includes(`data-motion-accent="${accentVal}"`)) inHtml = true;
    if (html.includes(`data-motion-accent='${accentVal}'`)) inHtml = true;
    assert.ok(inHtml, `CSS rule references data-motion-accent="${accentVal}", but it is not used in HTML markup`);
  }

  assert.ok(!fs.existsSync('edit_test.cjs'), 'Scratch file edit_test.cjs must not exist in the workspace root');
});

test('URL projection', async () => {
  process.env.BASE_PATH = '/symbiote-engine';
  process.env.BASE_URL = 'https://rnd-pro.github.io/symbiote-engine';
  const { getCanonicalPath, getCanonicalUrl } = await import(path.resolve('site/url.js'));
  assert.strictEqual(getCanonicalPath('/docs/'), '/symbiote-engine/docs/');
  assert.strictEqual(getCanonicalUrl('/docs/'), 'https://rnd-pro.github.io/symbiote-engine/docs/');
});

test('Dependency and lock policy', () => {
  assert.ok(fs.existsSync('package-lock.json'), 'package-lock.json exists');
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  assert.strictEqual(lock.lockfileVersion, 3, 'lockfile is v3');
});

test('Executable first graph example (from evidence.md)', async () => {
  const { Graph, Executor, registerNodeType } = await import(path.resolve('browser.js'));

  registerNodeType({
    type: 'docs/source',
    driver: {
      inputs: [],
      outputs: [{ name: 'value', type: 'number' }],
    },
    process: (_inputs, { value }) => ({ value }),
  });

  registerNodeType({
    type: 'docs/double',
    driver: {
      inputs: [{ name: 'value', type: 'number' }],
      outputs: [{ name: 'result', type: 'number' }],
    },
    process: ({ value }) => ({ result: value * 2 }),
  });

  const graph = new Graph();
  const source = graph.addNode('docs/source', { value: 21 });
  const double = graph.addNode('docs/double');
  graph.connect(source, 'value', double, 'value');

  const result = await new Executor().run(graph);
  assert.strictEqual(result.outputs[double].result, 42);
});

test('GraphHistory snapshot and undo semantics', async () => {
  const { Graph, GraphHistory } = await import(path.resolve('browser.js'));
  const graph = new Graph();
  const history = new GraphHistory();

  history.push([...graph.nodes.values()], graph.connections);
  assert.strictEqual(history.undo(), null, 'One snapshot alone returns null');

  graph.addNode('docs/source', { value: 1 });
  history.push([...graph.nodes.values()], graph.connections);

  const snapshot = history.undo();
  assert.ok(snapshot !== null, 'Two snapshots allow undo() to return a snapshot');
  assert.ok(Array.isArray(snapshot.nodes) && Array.isArray(snapshot.connections), 'Snapshot contains nodes and connections arrays');
});

test('Targeted verification contract: sitemap, docs pages, links and safety rules', async () => {
  // 1. Verify docsRoutes has exactly 7 routes
  const { docsRoutes } = await import(path.resolve('site/docs/routes.js'));
  assert.strictEqual(docsRoutes.length, 7, 'docsRoutes must have exactly 7 routes');
  const routePaths = docsRoutes.map(r => r.path);
  assert.deepStrictEqual(routePaths, [
    '/docs/',
    '/docs/getting-started/',
    '/docs/guide/',
    '/docs/runtime/',
    '/docs/rendering/',
    '/docs/reference/',
    '/docs/safety/'
  ], 'Exact ordered route array');

  // 2. Verify sitemap has exactly 9 routes
  const sitemapXml = fs.readFileSync('_site/sitemap.xml', 'utf8');
  const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.strictEqual(locs.length, 9, 'Sitemap must contain exactly 9 URLs');

  const expectedUrls = [
    'https://rnd-pro.github.io/symbiote-engine/',
    'https://rnd-pro.github.io/symbiote-engine/docs/',
    'https://rnd-pro.github.io/symbiote-engine/docs/getting-started/',
    'https://rnd-pro.github.io/symbiote-engine/docs/guide/',
    'https://rnd-pro.github.io/symbiote-engine/docs/runtime/',
    'https://rnd-pro.github.io/symbiote-engine/docs/rendering/',
    'https://rnd-pro.github.io/symbiote-engine/docs/reference/',
    'https://rnd-pro.github.io/symbiote-engine/docs/safety/',
    'https://rnd-pro.github.io/symbiote-engine/demo/'
  ];
  assert.deepStrictEqual(locs.sort(), expectedUrls.sort(), 'Sitemap routes must match the 9 expected URLs');

  // 3. Docs pages assertions
  const docsPages = [
    'docs/index.html',
    'docs/getting-started/index.html',
    'docs/guide/index.html',
    'docs/runtime/index.html',
    'docs/rendering/index.html',
    'docs/reference/index.html',
    'docs/safety/index.html'
  ];

  const forbiddenWording = [
    'strict JSON contracts',
    'distributed worker safety',
    'distributed media service',
    'every node runs lifecycle',
    'every graph node executes',
    'automatic unchanged-input detection',
    'deterministic hash',
    'durable cache',
    'socket inheritance',
    'required sockets enforced',
    'root GraphServer export',
    'sandboxed capture',
    'worker ranges are worker_threads',
    'built-in OpenAI',
    'built-in ElevenLabs',
    'proof attestation',
    'immutable verified repository',
    'all browser exports run in SSR',
    'all browser exports run in Web Workers',
    'Engine guarantees credential secrecy',
    '1.6.0',
    'force bypasses all cache',
    'providers fall back to generic'
  ];

  const titles = new Set();
  const descriptions = new Set();

  for (const page of docsPages) {
    const filePath = path.join('_site', page);
    assert.ok(fs.existsSync(filePath), `Page file ${page} must exist`);
    const html = fs.readFileSync(filePath, 'utf8');

    // Semantic structure: one main, one h1, skip link
    const mainCount = (html.match(/<main/g) || []).length;
    assert.strictEqual(mainCount, 1, `Page ${page} must contain exactly one <main> tag`);

    // Check for H1 tag
    const h1Count = (html.match(/<h1/g) || []).length;
    assert.strictEqual(h1Count, 1, `Page ${page} must contain exactly one <h1> tag`);

    // Skip link must exist
    assert.ok(html.includes('class="skip-link"') || html.includes('id="skip-link"') || html.includes('href="#main-content"'), `Page ${page} must contain a skip link`);

    // Unique title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    assert.ok(titleMatch, `Page ${page} must have a title`);
    const titleText = titleMatch[1];
    assert.ok(!titles.has(titleText), `Title "${titleText}" must be unique across pages`);
    titles.add(titleText);

    // Unique meta description
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/) || html.match(/<meta\s+content="([^"]+)"\s+name="description"/);
    assert.ok(descMatch, `Page ${page} must have a meta description`);
    const descText = descMatch[1];
    assert.ok(!descriptions.has(descText), `Description "${descText}" must be unique across pages`);
    descriptions.add(descText);

    // Canonical link
    const canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/) || html.match(/<link\s+href="([^"]+)"\s+rel="canonical"/);
    assert.ok(canonicalMatch, `Page ${page} must have a canonical link`);
    const canonicalUrl = canonicalMatch[1];
    const expectedCanonicalSuffix = page.replace('index.html', '');
    assert.ok(canonicalUrl.endsWith('/symbiote-engine/' + expectedCanonicalSuffix), `Canonical URL for ${page} must be correct: got ${canonicalUrl}`);

    // Active sidebar item: exactly one sidebar-link is-active
    const activeSidebarCount = (html.match(/class="[^"]*sidebar-link[^"]*is-active[^"]*"/g) || []).length;
    assert.strictEqual(activeSidebarCount, 1, `Page ${page} must contain exactly one active sidebar link: got ${activeSidebarCount}`);

    // No duplicate IDs
    const idRegex = /id="([^"]+)"/g;
    const ids = [];
    let match;
    while ((match = idRegex.exec(html)) !== null) {
      ids.push(match[1]);
    }
    const idSet = new Set(ids);
    assert.strictEqual(ids.length, idSet.size, `Page ${page} has duplicate IDs: ${JSON.stringify(ids.filter((item, index) => ids.indexOf(item) !== index))}`);

    // Forbidden wording check
    for (const forbidden of forbiddenWording) {
      assert.ok(!html.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden wording "${forbidden}" must not be present in page ${page}`);
    }

    // Anchors and relative links validation covering href, src, srcset, both quote styles
    const regexes = [
      /href="([^"]+)"/g, /href='([^']+)'/g,
      /src="([^"]+)"/g, /src='([^']+)'/g,
      /srcset="([^"]+)"/g, /srcset='([^']+)'/g
    ];

    function resolveUrl(url, currentPage) {
      if (url.startsWith('http') || url.startsWith('//') || url.startsWith('data:') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('javascript:')) return null;
      if (url.startsWith('/')) {
        if (!url.startsWith('/symbiote-engine/')) {
          throw new Error(`Root-absolute URL "${url}" must start with /symbiote-engine/`);
        }
        let rel = url.substring('/symbiote-engine/'.length);
        if (rel === '' || rel.startsWith('#')) return 'index.html' + rel;
        return rel;
      }
      const currentDir = path.dirname(currentPage);
      return path.join(currentDir, url).replace(/\\/g, '/');
    }

    function resolveTargetFile(relPath) {
      if (!relPath) return null;
      let target = relPath.split('#')[0];
      if (target === '') return null;
      if (target.endsWith('/')) target += 'index.html';
      else if (!path.extname(target)) target += '/index.html';
      return target;
    }

    // Fixture-driven unit coverage for the URL resolver
    if (page === 'docs/index.html') {
      assert.throws(() => resolveUrl('/docs/guide/', 'index.html'), /must start with \/symbiote-engine\//, 'Fails on wrong root-absolute target');
      assert.strictEqual(resolveUrl('./asset.png', 'docs/guide/index.html'), 'docs/guide/asset.png', 'Resolves ./asset');
      assert.strictEqual(resolveUrl('../route/', 'docs/guide/index.html'), 'docs/route/', 'Resolves ../route/');
      assert.strictEqual(resolveTargetFile(resolveUrl('../route/', 'docs/guide/index.html')), 'docs/route/index.html', 'Maps trailing-slash route to index.html');
      assert.strictEqual(resolveTargetFile(resolveUrl('demo', 'docs/guide/index.html')), 'docs/guide/demo/index.html', 'Maps bare relative route to index.html');

      fs.mkdirSync('_site/tmp-fixture', { recursive: true });
      fs.writeFileSync('_site/tmp-fixture/index.html', '<div id="target-element"></div>');

      try {
        function checkFixtureUrl(u, p, h) {
          const resolvedPath = resolveUrl(u, p);
          if (resolvedPath === null) return;
          const targetFile = resolveTargetFile(resolvedPath);
          let targetHtml = h;
          if (targetFile) {
            const targetAbs = path.join('_site', targetFile);
            if (!fs.existsSync(targetAbs)) throw new Error(`Target file ${targetAbs} for "${u}" does not exist`);
            if (u.includes('#')) targetHtml = fs.readFileSync(targetAbs, 'utf8');
          }
          if (u.includes('#')) {
            const anchor = u.split('#')[1];
            if (anchor !== 'main-content') {
              const hasId = targetHtml.includes(`id="${anchor}"`) || targetHtml.includes(`name="${anchor}"`);
              if (!hasId) throw new Error(`Anchor "${u}" does not exist in target`);
            }
          }
        }

        assert.doesNotThrow(() => checkFixtureUrl('../tmp-fixture/#target-element', 'docs/index.html', ''), 'Passes on valid relative cross-page fragment');
        assert.throws(() => checkFixtureUrl('../tmp-fixture/#missing-element', 'docs/index.html', ''), /does not exist in target/, 'Fails on invalid relative cross-page fragment');
        assert.throws(() => checkFixtureUrl('../missing/', 'docs/index.html', ''), /does not exist/, 'Fails on missing relative target');
        assert.throws(() => checkFixtureUrl('./missing.png', 'docs/index.html', ''), /does not exist/, 'Fails on missing asset');

        const extractUrls = (htmlStr) => {
          const urls = [];
          for (const r of regexes) {
            let match;
            while ((match = r.exec(htmlStr)) !== null) {
              if (match[0].startsWith('srcset')) {
                const candidates = match[1].split(',').map(c => c.trim().split(' ')[0]).filter(Boolean);
                urls.push(...candidates);
                if (match[1].split(',').length > candidates.length) urls.push('');
              } else {
                urls.push(match[1]);
              }
            }
          }
          return urls;
        };

        assert.doesNotThrow(() => {
          const urls = extractUrls('<img srcset="../tmp-fixture/ 1x">');
          urls.forEach(u => checkFixtureUrl(u, 'docs/index.html', ''));
        }, 'Passes when srcset candidate exists');

        assert.throws(() => {
          const urls = extractUrls('<img srcset="../tmp-fixture/ 1x, ./missing.png 2x">');
          urls.forEach(u => {
            if (!u) throw new Error("Missing candidate");
            checkFixtureUrl(u, 'docs/index.html', '');
          });
        }, /does not exist/, 'Fails when second srcset candidate is missing');
      } finally {
        fs.rmSync('_site/tmp-fixture', { recursive: true, force: true });
      }
    }

    for (const r of regexes) {
      let match;
      while ((match = r.exec(html)) !== null) {
        if (match[0].startsWith('srcset')) {
          const candidates = match[1].split(',').map(c => c.trim().split(' ')[0]).filter(Boolean);
          if (match[1].split(',').length > candidates.length) {
            assert.fail(`Missing candidate in srcset in ${page}`);
          }
          candidates.forEach(url => checkUrl(url, page, html));
        } else {
          checkUrl(match[1], page, html);
        }
      }
    }

    function checkUrl(url, currentPage, currentHtml) {
      if (!url) return;
      let resolvedPath;
      try {
        resolvedPath = resolveUrl(url, currentPage);
      } catch (err) {
        assert.fail(`Error resolving ${url} in ${currentPage}: ${err.message}`);
      }
      if (resolvedPath === null) return;

      const targetFile = resolveTargetFile(resolvedPath);
      let targetHtml = currentHtml;

      if (targetFile) {
        const targetAbs = path.join('_site', targetFile);
        assert.ok(fs.existsSync(targetAbs), `Target file ${targetAbs} for "${url}" in ${currentPage} must exist`);
        if (url.includes('#')) {
          targetHtml = fs.readFileSync(targetAbs, 'utf8');
        }
      }

      if (url.includes('#')) {
        const anchor = url.split('#')[1];
        if (anchor !== 'main-content') {
          const hasId = targetHtml.includes(`id="${anchor}"`) || targetHtml.includes(`name="${anchor}"`);
          assert.ok(hasId, `Anchor "${url}" in ${currentPage} must resolve to an element with that ID`);
        }
      }
    }
  }

  // 4. Reference data exact check
  const refDataPath = path.resolve('site/docs/reference-data.js');
  assert.ok(fs.existsSync(refDataPath), "Reference data script must exist before import");
  const { packageExports, symbolInventory } = await import(refDataPath);

  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const pkgExports = Object.keys(pkg.exports || {}).sort();
  const genExports = packageExports.map(e => e.key).sort();
  assert.deepStrictEqual(genExports, pkgExports, 'Generated reference export-map keys match package.json exactly');

  const rootMod = await import(path.resolve('index.js'));
  const browserMod = await import(path.resolve('browser.js'));

  const liveKeys = Array.from(new Set([...Object.keys(rootMod), ...Object.keys(browserMod)])).sort();
  const genKeys = symbolInventory.map(s => s.name).sort();
  assert.deepStrictEqual(genKeys, liveKeys, 'Generated symbol rows match live root/browser namespaces exactly');

  // 3. Deployed JavaScript node --check check
  const jsFiles = ['_site/animation-client.js', '_site/demo/index.js'];
  for (const jsFile of jsFiles) {
    execSync(`node --check ${jsFile}`);
  }
});
