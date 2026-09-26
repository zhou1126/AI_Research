import { env, pipeline } from '@huggingface/transformers';
import { ROSTER, VENDORS, VENDOR_OPTIONS, type VendorOption } from '../jev-overview';

env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;
const MODEL = 'Xenova/all-MiniLM-L6-v2';
const REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
type Row = { id: string; choice: VendorOption; similarities: Record<string, number> };
self.onmessage = async (event: MessageEvent<{ id: number }>) => {
  const { id } = event.data;
  try {
    const loadStart = performance.now();
    const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8', device: 'wasm', revision: REVISION,
      progress_callback: progress => self.postMessage({ id, type: 'progress', message: 'file' in progress ? `${progress.status}: ${progress.file}${'progress' in progress ? ` ${Math.round(progress.progress)}%` : ''}` : progress.status }),
    });
    const loadMs = performance.now() - loadStart;
    const inferenceStart = performance.now();
    const texts = [...VENDORS.map(v => `${v.name}. ${v.service}.`), ...ROSTER.map(r => `${r.entry}. ${r.service}.`)];
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    const vectors = output.tolist() as number[][];
    if (vectors.length !== texts.length || vectors.some(vector => !Array.isArray(vector) || !vector.length)) throw new Error('Invalid embedding shape.');
    const rows: Row[] = ROSTER.map((roster, index) => {
      const similarities = Object.fromEntries(VENDORS.map((vendor, v) => [vendor.id, vectors[v].reduce((sum, value, i) => sum + value * vectors[VENDORS.length + index][i], 0)]));
      const ranked = VENDORS.map(vendor => ({ id: vendor.id, score: similarities[vendor.id] })).sort((a, b) => b.score - a.score);
      // A heuristic gate for this demonstration, not a calibrated probability.
      const choice = (ranked[0].score >= 0.55 ? ranked[0].id : 'unmatched') as VendorOption;
      return { id: roster.id, choice, similarities };
    });
    if (rows.some(row => !VENDOR_OPTIONS.includes(row.choice))) throw new Error('Invalid choice.');
    self.postMessage({ id, type: 'done', result: { engine: 'bert', model: MODEL, loadMs, elapsedMs: performance.now() - inferenceStart, decisions: rows } });
  } catch { self.postMessage({ id, type: 'error', message: 'The BERT-family matching model could not load or infer. Check browser access to Hugging Face and jsDelivr.' }); }
};
