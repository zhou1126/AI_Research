import type { BenchEngine, Example } from './data';
import type { Prediction } from './core';
// One call at a time. Rotate model order to reduce systematic ordering effects.
// Resume skips recorded attempts, including errors: no silent paid retry.
export async function runBenchmark(examples: Example[], engines: BenchEngine[], prior: Prediction[], classify: (example: Example, engine: BenchEngine) => Promise<Prediction>, onResult: (row: Prediction) => void, signal: AbortSignal) {
  const seen = new Set(prior.map(row => `${row.engine}:${row.id}`));
  for (let index = 0; index < examples.length; index++) {
    const order = [...engines.slice(index % engines.length), ...engines.slice(0, index % engines.length)];
    for (const engine of order) {
      if (signal.aborted) return;
      const example = examples[index], key = `${engine}:${example.id}`;
      if (seen.has(key)) continue;
      const started = performance.now();
      let row: Prediction;
      try { row = await classify(example, engine); }
      catch (error) {
        if (signal.aborted) return;
        row = { id: example.id, engine, model: engine, elapsedMs: performance.now() - started, error: error instanceof Error ? error.message : 'Prediction failed.' };
      }
      if (signal.aborted) return;
      onResult(row); seen.add(key);
      if (row.error) throw new Error(`${engine.toUpperCase()} failed on ${example.id}: ${row.error} Run paused. Resume skips this failed attempt; a new run retries the full set.`);
    }
  }
}
