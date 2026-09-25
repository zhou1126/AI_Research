// Check the actual dev-server transform: a source-only unit test misses RSC URL rewriting.
import assert from 'node:assert/strict';
import { runInNewContext, runInContext, createContext, SourceTextModule } from 'node:vm';
import { webcrypto } from 'node:crypto';
const base = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const client = await fetch(new URL('/lib/notebook/bert-client.ts', base));
assert.equal(client.status, 200);
const source = (await client.text()).split('//# sourceMappingURL')[0];
const importPath = source.match(/import\s+BertWorker\s+from\s+["']([^"']+)["']/)?.[1];
assert.ok(importPath, 'Client must import the Vite worker constructor.');
const response = await fetch(new URL(importPath, base));
assert.equal(response.status, 200);
const wrapper = (await response.text()).split('//# sourceMappingURL')[0];
let scriptURL, workerOptions;
const construct = runInNewContext(wrapper.replace('export default', '' ) + '\nWorkerWrapper;', {
  Worker: class {
    constructor(url, options) { scriptURL = new URL(url, base); workerOptions = options; }
  },
});
construct();
assert.equal(scriptURL.origin, new URL(base).origin, 'Worker must use the app origin, never file://.');
assert.equal(workerOptions.type, 'module');
const entry = await fetch(scriptURL);
assert.equal(entry.status, 200, 'Worker entry must be served successfully.');
assert.match(entry.headers.get('content-type'), /javascript/);
const entrySource = await entry.text();
assert.match(entrySource, /self\.onmessage/);
const transformersPath = entrySource.match(/from\s+["']([^"']*transformers[^"']*)["']/)?.[1];
assert.ok(transformersPath, 'Worker must import the browser Transformers library.');
const library = await fetch(new URL(transformersPath, base));
assert.equal(library.status, 200);
const librarySource = await library.text();
const browserCheck = librarySource.match(/const IS_BROWSER_ENV\s*=\s*([^;]+);/)?.[1];
assert.ok(browserCheck, 'Check the actual served dependency environment guard.');
assert.equal(runInNewContext(browserCheck, {}), false, 'Worker has no window: library must not dereference it.');
assert.equal(runInNewContext(browserCheck, { window: { document: {} } }), true, 'Page detection must still work.');
// Bootstrap the entire HTTP module graph, including Vite's injected HMR client.
// Testing only the entry point or Transformers guard missed a second window bug.
const messages = [];
const context = createContext({
  console, WebSocket, URL, URLSearchParams, TextEncoder, TextDecoder, fetch,
  Headers, Request, Response, AbortController, AbortSignal, performance,
  crypto: webcrypto, setTimeout, clearTimeout, queueMicrotask, structuredClone,
  navigator: { hardwareConcurrency: 1, userAgent: 'worker-bootstrap-check' },
  postMessage: message => messages.push(message),
  WorkerGlobalScope: class { static [Symbol.hasInstance]() { return true; } },
});
runInContext('self = globalThis', context);
const modules = new Map();
async function load(url) {
  if (modules.has(url)) return modules.get(url);
  const pending = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, `Worker dependency failed: ${url}`);
    return new SourceTextModule(await response.text(), {
      context, identifier: url,
      initializeImportMeta(meta) { meta.url = url; },
      async importModuleDynamically(specifier, referrer) {
        const module = await load(new URL(specifier, referrer.identifier).href);
        if (module.status === 'unlinked') await module.link(link);
        await module.evaluate();
        return module;
      },
    });
  })();
  modules.set(url, pending);
  return pending;
}
async function link(specifier, referrer) { return load(new URL(specifier, referrer.identifier).href); }
try {
  const module = await load(scriptURL.href);
  await module.link(link);
  await module.evaluate({ timeout: 15000 });
  assert.equal(runInContext('typeof window', context), 'undefined');
  assert.equal(runInContext('typeof self.onmessage', context), 'function');
  // Exercise the message handler without downloading a model or invoking a provider.
  await runInContext('self.onmessage({ data: { id: 1, kind: "predict", text: "test" } })', context);
  assert.equal(messages.at(-1)?.type, 'error');
  assert.match(messages.at(-1)?.message, /BERT inference failed/);
  console.log(`BERT worker bootstrap passed: ${modules.size} served modules evaluated without window; handler responds. No model download or paid calls.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
// The dev HMR client opens a persistent socket. End this disposable check process.
process.exit(process.exitCode || 0);
