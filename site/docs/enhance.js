/**
 * @param {ParentNode} [root]
 * @returns {Promise<void>}
 */
export async function enhanceDocsCodeBlocks(root = document) {
  let codes = [...root.querySelectorAll('.lp-article pre > code')];
  if (codes.length === 0) return;
  try {
    await customElements.whenDefined('code-block');
    for (let code of codes) {
      let fallback = code.closest('pre');
      if (!fallback?.isConnected) continue;

      let lang = code.getAttribute('data-language') || 'js';
      let enhanced = document.createElement('code-block');
      enhanced.setAttribute('copyable', '');
      enhanced.setAttribute('language-label', lang);
      enhanced.setAttribute('line-numbers', 'hide');

      fallback.replaceWith(enhanced);
      try {
        enhanced.setContent(code.textContent, lang);
      } catch (error) {
        enhanced.replaceWith(fallback);
        throw error;
      }
    }
  } catch {
    // The semantic pre/code fallback remains visible when the optional component is unavailable.
  }
}
