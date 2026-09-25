// Vinext folds bare `typeof window` to "object" in client modules. Browser
// libraries shared with Web Workers must detect their actual runtime instead.
// Use a property lookup, which preserves the original semantics but is not
// subject to that framework transform. Vite's HMR client is also imported by
// worker dependencies in development and must retain its window guards.
export function preserveWorkerEnvironment() {
  return {
    name: 'preserve-bert-worker-environment',
    enforce: 'pre',
    transform(code, id) {
      const path = id.replaceAll('\\', '/').split('?')[0];
      const bertLibrary = /\/node_modules\/(?:@huggingface\/transformers|onnxruntime-web|onnxruntime-common)\//.test(path);
      const viteRuntime = path === '/@vite/client' || /\/node_modules\/vite\/dist\/client\//.test(path);
      if (!bertLibrary && !viteRuntime) return null;
      const patched = code.replace(/\btypeof\s+window\b/g, 'typeof globalThis.window');
      return patched === code ? null : { code: patched, map: null };
    },
  };
}
