import { env, pipeline, type TextClassificationPipeline } from '@huggingface/transformers';
import { BERT_MODEL, BERT_DTYPE, BERT_REVISION, finbertResult } from './core';
env.allowLocalModels = false;
// Single-thread WASM also works on Codespaces without cross-origin isolation.
env.backends.onnx.wasm!.numThreads = 1;
let classifier: TextClassificationPipeline | undefined;
self.onmessage = async (event: MessageEvent<{ id: number; kind: 'load' | 'predict'; text?: string }>) => {
  const { id, kind, text } = event.data;
  try {
    if (kind === 'load') {
      const start = performance.now();
      classifier ??= await pipeline<'text-classification'>('text-classification', BERT_MODEL, { dtype: BERT_DTYPE, device: 'wasm', revision: BERT_REVISION,
        progress_callback: progress => { self.postMessage({ id, type: 'progress', message: 'file' in progress ? `${progress.status}: ${progress.file}${'progress' in progress ? ` ${Math.round(progress.progress)}%` : ''}` : progress.status }); },
      });
      self.postMessage({ id, type: 'done', result: { loadMs: performance.now() - start } });
    } else {
      if (!classifier || typeof text !== 'string') throw new Error('Load BERT before running a question.');
      const start = performance.now();
      const output = await classifier(text, { top_k: 3 });
      self.postMessage({ id, type: 'done', result: { ...finbertResult(output), inferenceMs: performance.now() - start, model: BERT_MODEL, response: output } });
    }
  } catch { self.postMessage({ id, type: 'error', message: kind === 'load' ? 'BERT could not load. Check access to huggingface.co and cdn.jsdelivr.net, browser WASM support, and available memory.' : 'BERT inference failed. No prediction was assigned.' }); }
};
