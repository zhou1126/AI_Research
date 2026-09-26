import BertWorker from './bert-worker?worker';
import type { AgentResult } from './comparison';
export function runVendorBert(signal: AbortSignal, progress: (message: string) => void): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    const worker = new BertWorker();
    const id = 1;
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('BERT timed out while downloading or running.')); }, 600000);
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = event => {
      if (event.data.id !== id) return;
      if (event.data.type === 'progress') progress(event.data.message);
      else { cleanup(); if (event.data.type === 'error') reject(new Error(event.data.message)); else resolve(event.data.result as AgentResult); }
    };
    worker.onerror = () => { cleanup(); reject(new Error('The BERT worker failed.')); };
    worker.postMessage({ id });
  });
}
