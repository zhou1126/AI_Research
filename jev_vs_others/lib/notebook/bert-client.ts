import type { Label } from './data';
import BertWorker from './bert-worker?worker';
export type BertResult = { prediction: Label; probabilities: Record<Label, number>; inferenceMs: number; model: string; response: unknown };
export class BertClient {
  // Let Vite create the same-origin URL in dev and the emitted asset URL in builds.
  // The RSC transform can replace import.meta.url with a file URL in this module.
  private worker = new BertWorker();
  private sequence = 0;
  private request<T>(kind: 'load' | 'predict', signal: AbortSignal, progress?: (message: string) => void, text?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const finish = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); this.worker.removeEventListener('message', message); this.worker.removeEventListener('error', failed); };
      const abort = () => { finish(); this.dispose(); reject(new DOMException('Cancelled', 'AbortError')); };
      const failed = () => { finish(); this.dispose(); reject(new Error('The BERT worker failed. Reload the page and check browser model-download access.')); };
      const message = (event: MessageEvent) => {
        if (event.data.id !== id) return;
        if (event.data.type === 'progress') progress?.(event.data.message);
        else { finish(); if (event.data.type === 'error') reject(new Error(event.data.message)); else resolve(event.data.result as T); }
      };
      const timeout = setTimeout(() => { finish(); this.dispose(); reject(new Error('BERT timed out. Check model-download access and available memory.')); }, kind === 'load' ? 600000 : 120000);
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      this.worker.addEventListener('message', message); this.worker.addEventListener('error', failed);
      this.worker.postMessage({ id, kind, text });
    });
  }
  load(signal: AbortSignal, progress?: (message: string) => void) { return this.request<{ loadMs: number }>('load', signal, progress); }
  predict(text: string, signal: AbortSignal) { return this.request<BertResult>('predict', signal, undefined, text); }
  dispose() { this.worker.terminate(); }
}
