// Optional real model check: downloads public weights, no provider keys or paid API calls.
import { pipeline, env } from '@huggingface/transformers';
import { BERT_MODEL, BERT_REVISION, BERT_DTYPE, finbertResult, metrics } from '../lib/notebook/core.ts';
import { EXAMPLES } from '../lib/notebook/data.ts';
env.cacheDir = '.cache/transformers';
const started = performance.now();
const classifier = await pipeline('text-classification', BERT_MODEL, { revision: BERT_REVISION, dtype: BERT_DTYPE, device: 'cpu' });
const loadMs = performance.now() - started;
const rows = [];
for (const example of EXAMPLES) {
  const time = performance.now();
  const result = finbertResult(await classifier(example.text, { top_k: 3 }));
  rows.push({ id: example.id, engine: 'bert', model: BERT_MODEL, ...result, elapsedMs: performance.now() - time });
}
console.log(JSON.stringify({ runtime: 'Node CPU (browser uses WASM)', model: BERT_MODEL, revision: BERT_REVISION, dtype: BERT_DTYPE, loadMs, metrics: metrics(EXAMPLES, rows) }, null, 2));
await classifier.dispose();
