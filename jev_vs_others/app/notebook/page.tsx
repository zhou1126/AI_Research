'use client';
import { useEffect, useRef, useState } from 'react';
import { LabNavigation } from '../components/LabNavigation';
import { CRITERIA, DATASET_VERSION, EXAMPLES, LABELS, type BenchEngine } from '../../lib/notebook/data';
import { BERT_DTYPE, BERT_MODEL, BERT_REVISION, jevBody, llmBody, metrics, type Prediction } from '../../lib/notebook/core';
import { runBenchmark } from '../../lib/notebook/runner';
import type { BertClient } from '../../lib/notebook/bert-client';

type Config = Partial<Record<'jev' | 'openai' | 'deepseek', { configured: boolean; model: string }>>;
type Run = { count: number; engines: BenchEngine[]; rows: Prediction[]; models: Record<string, string>; startedAt: string; activeMs: number; bertLoadMs: number; status: 'running' | 'paused' | 'complete' };
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const seconds = (ms: number | null) => ms === null ? '—' : `${(ms / 1000).toFixed(2)} s`;
const json = (value: unknown) => JSON.stringify(value, null, 2);
const name = (engine: BenchEngine) => engine === 'bert' ? 'BERT / FinBERT' : engine.toUpperCase();
export default function NotebookLab() {
  const [config, setConfig] = useState<Config>({});
  const [text, setText] = useState('Quarterly revenue grew 20 percent and the company raised its profit forecast.');
  const [demo, setDemo] = useState<Prediction | null>(null), [busy, setBusy] = useState<'demo' | 'benchmark' | null>(null);
  const [error, setError] = useState(''), [progress, setProgress] = useState('Ready.');
  const [count, setCount] = useState(50), [llm, setLlm] = useState<'openai' | 'deepseek'>('openai');
  const [include, setInclude] = useState({ jev: true, llm: true, bert: true });
  const [run, setRun] = useState<Run | null>(null), runRef = useRef<Run | null>(null);
  const controller = useRef<AbortController | null>(null), bert = useRef<BertClient | null>(null);
  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(data => setConfig(data as Config)).catch(() => setError('Provider configuration could not be loaded.'));
    return () => { controller.current?.abort(); bert.current?.dispose(); };
  }, []);
  const selected: BenchEngine[] = [...(include.jev ? ['jev' as const] : []), ...(include.llm ? [llm] : []), ...(include.bert ? ['bert' as const] : [])];
  const unavailable = selected.filter(engine => engine !== 'bert' && !config[engine]?.configured);
  function publish(next: Run) { runRef.current = next; setRun(next); }
  async function remote(body: unknown, signal: AbortSignal): Promise<Prediction> {
    const started = performance.now();
    const response = await fetch('/api/notebook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json(body), signal });
    const result = await response.json() as Prediction & { error?: string };
    if (!response.ok) throw new Error(result.error || 'Request failed.');
    return { ...result, elapsedMs: performance.now() - started };
  }
  async function demoRun() {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort; setBusy('demo'); setError(''); setDemo(null);
    try { const result = await remote({ mode: 'demo', engine: 'jev', text }, abort.signal); if (!abort.signal.aborted) setDemo(result); }
    catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Demo failed.'); }
    finally { controller.current = null; setBusy(null); }
  }
  async function benchmark(resume = false) {
    if (controller.current) return;
    const existing = resume ? runRef.current : null;
    const engines = existing?.engines ?? selected;
    if (!engines.length || engines.some(engine => engine !== 'bert' && !config[engine]?.configured)) { setError('Configure selected providers or deselect them.'); return; }
    const abort = new AbortController(); controller.current = abort; setBusy('benchmark'); setError('');
    const started = performance.now();
    const initial: Run = existing ? { ...existing, status: 'running' } : { count, engines, rows: [], models: Object.fromEntries(engines.map(engine => [engine, engine === 'bert' ? BERT_MODEL : config[engine]?.model || ''])), startedAt: new Date().toISOString(), activeMs: 0, bertLoadMs: 0, status: 'running' };
    publish(initial);
    try {
      if (engines.includes('bert') && !bert.current) {
        setProgress('Loading BERT in your browser. The first download may take a few minutes…');
        const { BertClient } = await import('../../lib/notebook/bert-client');
        if (abort.signal.aborted) return;
        bert.current = new BertClient();
        const loaded = await bert.current.load(abort.signal, setProgress);
        publish({ ...runRef.current!, bertLoadMs: runRef.current!.bertLoadMs + loaded.loadMs });
      }
      await runBenchmark(EXAMPLES.slice(0, initial.count), engines, initial.rows, async (example, engine) => {
        setProgress(`${name(engine)} · ${example.id} · ${runRef.current!.rows.length + 1}/${initial.count * engines.length} attempts`);
        if (engine !== 'bert') return remote({ mode: 'classify', engine, id: example.id }, abort.signal);
        const started = performance.now();
        const result = await bert.current!.predict(example.text, abort.signal);
        return { ...result, id: example.id, engine, elapsedMs: performance.now() - started, request: { text: example.text, model: BERT_MODEL, revision: BERT_REVISION, dtype: BERT_DTYPE, top_k: 3 } };
      }, row => publish({ ...runRef.current!, rows: [...runRef.current!.rows, row] }), abort.signal);
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Benchmark failed.'); bert.current?.dispose(); bert.current = null; }
    finally {
      const current = runRef.current!;
      const complete = current.rows.length === current.count * current.engines.length;
      publish({ ...current, activeMs: initial.activeMs + performance.now() - started, status: complete ? 'complete' : 'paused' });
      setProgress(complete ? 'Run complete. Results include any failed attempts.' : 'Paused. Results retained; export or resume.');
      controller.current = null; setBusy(null);
    }
  }
  function stop() { controller.current?.abort(); bert.current?.dispose(); bert.current = null; }
  function download() {
    if (!run) return;
    const examples = EXAMPLES.slice(0, run.count);
    const data = { version: 1, dataset: DATASET_VERSION, synthetic: true, categories: CRITERIA, examples, bert: { model: BERT_MODEL, revision: BERT_REVISION, dtype: BERT_DTYPE, runtime: 'Browser WASM, single thread; Transformers.js 3.8.1' }, run,
      metrics: Object.fromEntries(run.engines.map(engine => [engine, metrics(examples, run.rows.filter(row => row.engine === engine))])) };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json(data)], { type: 'application/json' })); a.download = 'classification-benchmark.json'; a.click(); URL.revokeObjectURL(a.href);
  }
  const examples = EXAMPLES.slice(0, run?.count ?? count);
  const exampleBody = jevBody(text, config.jev?.model || 'jev-latest', true);
  return <main>
    <header><a className="brand" href="/">AI / DECISION LAB</a><span className="header-note">Requests · predictions · measurements</span></header>
    <LabNavigation active="notebook"/>
    <section className="intro"><div><h1>JEV notebook</h1><p className="subtitle">Learn the calls, inspect real outputs, then compare three approaches.</p></div></section>
    <div className="notebook">
      <section className="panel notebook-cell"><span className="cell-number">[1] READ</span><h2>Three basic JEV functions</h2>
        <div className="primitive-grid"><article><h3>Choice</h3><p>Select one predefined category. Returns <code>choice</code>, a probability for each option, and <code>confidence</code>.</p></article><article><h3>Score</h3><p>Rate against ordered descriptions. Here the scale is 0–2; fractional scores represent a probability-weighted position.</p></article><article><h3>Noul</h3><p>Ask a yes/no question. Returns <code>noul</code>: a probability from 0 to 1, not a boolean.</p></article></div>
        <p>One state can have several independent questions in the same request. Confidence is not a guarantee of correctness. <a href="https://docs.typesafe.ai/introduction" target="_blank" rel="noreferrer">Official JEV introduction</a> · <a href="https://docs.typesafe.ai/primitives/choice">Choice</a> · <a href="https://docs.typesafe.ai/primitives/score">Score</a> · <a href="https://docs.typesafe.ai/primitives/noul">Noul</a></p>
      </section>
      <section className="panel notebook-cell"><span className="cell-number">[2] RUN</span><h2>Call JEV and inspect its answers</h2>
        <label>Financial statement<textarea aria-label="JEV example text" rows={3} maxLength={2000} value={text} disabled={!!busy} onChange={e => { setText(e.target.value); setDemo(null); }}/></label>
        <p>Model: <code>{config.jev?.model || 'Not configured'}</code>. Run sends one paid request with all three questions. API keys stay on the server.</p>
        <div className="notebook-code-pair"><div><h3>Python HTTP example (server-side)</h3><pre>{`import os, requests\n\nbody = ${json(exampleBody)}\nresponse = requests.post(\n    os.getenv("JEV_API_URL", "https://api.typesafe.ai/v1/systemone"),\n    headers={"Authorization": "Bearer " + os.environ["JEV_API_KEY"]},\n    json=body, timeout=90\n)\nresponse.raise_for_status()\nanswers = response.json()["answers"]\nprint(answers["sentiment"]["choice"])\nprint(answers["financial_outlook"]["score"])\nprint(answers["reports_growth"]["noul"])`}</pre></div><div><h3>Live output</h3>{demo ? <><p>{demo.model} · {seconds(demo.elapsedMs)} round trip</p><pre>{json(demo.response)}</pre><details><summary>Exact request used</summary><pre>{json(demo.request)}</pre></details></> : <p>No result yet. Click Run JEV example to call your configured model.</p>}</div></div>
        <button className="primary" disabled={!!busy || !config.jev?.configured || !text.trim()} onClick={demoRun}>Run JEV example</button>
      </section>
      <section className="panel notebook-cell"><span className="cell-number">[3] CONFIGURE</span><h2>Same questions, predefined categories</h2>
        <p>50 original synthetic financial statements with author-assigned labels: 17 positive, 16 neutral, 17 negative. These are examples for learning and comparison, not a representative or independently validated benchmark. Models receive only the statement; the answer key is used for scoring afterward.</p>
        <div className="primitive-grid">{LABELS.map(label => <article key={label}><h3>{label}</h3><p>{CRITERIA[label]}</p></article>)}</div>
        <div className="notebook-settings"><label>Questions<select aria-label="Benchmark question count" disabled={!!busy} value={count} onChange={e => setCount(+e.target.value)}><option value={50}>50 questions</option><option value={5}>5-question trial</option></select></label><label>LLM provider<select aria-label="Benchmark LLM" disabled={!!busy} value={llm} onChange={e => setLlm(e.target.value as typeof llm)}><option value="openai">OpenAI — {config.openai?.model || 'not configured'}</option><option value="deepseek">DeepSeek — {config.deepseek?.model || 'not configured'}</option></select></label></div>
        <div className="notebook-models">{(['jev', 'llm', 'bert'] as const).map(key => <label key={key}><input type="checkbox" checked={include[key]} disabled={!!busy} onChange={e => setInclude({ ...include, [key]: e.target.checked })}/>{key === 'llm' ? `LLM / ${llm.toUpperCase()}` : key === 'bert' ? 'BERT / FinBERT' : 'JEV'}<code>{key === 'bert' ? `${BERT_MODEL} · q8` : config[key === 'llm' ? llm : key]?.model || 'Not configured'}</code></label>)}</div>
        <p>JEV uses Choice. OpenAI uses a strict JSON schema enum; DeepSeek uses a JSON prompt plus category validation. Invalid labels are errors, never silently converted. FinBERT is a BERT model already fine-tuned for financial sentiment, running locally in a browser worker; its training differs from the prompted models. <a href="https://huggingface.co/Xenova/finbert">FinBERT model</a> · <a href="https://developers.openai.com/api/docs/guides/structured-outputs">OpenAI structured outputs</a></p>
        <p>BERT’s first run downloads approximately 110 MB of model weights plus runtime files from Hugging Face and jsDelivr. Downloads may be cached by the browser. No BERT API key is needed. Do not close this tab during a run.</p>
        <details><summary>See the classification calls</summary><pre>{json({ jev: jevBody(EXAMPLES[0].text, config.jev?.model || 'jev-latest'), llm: llmBody(EXAMPLES[0].text, config[llm]?.model || '<configured model>', llm, llm === 'openai' ? 8192 : 1500), bert: `pipeline('text-classification', '${BERT_MODEL}', { dtype: 'q8', device: 'wasm', revision: '${BERT_REVISION}' }); classifier(text, { top_k: 3 });` })}</pre><p>The LLM example shows the default token budget; each result records the actual request used.</p></details>
        <div className="notebook-toolbar"><button className="primary" disabled={!!busy || !selected.length || !!unavailable.length} onClick={() => benchmark(false)}>Run comparison</button><button disabled={!!busy || !run || run.status !== 'paused'} onClick={() => benchmark(true)}>Resume comparison</button><button disabled={!busy} onClick={stop}>Stop</button><button disabled={!run || !!busy} onClick={download}>Export results</button></div>
        <p>A new run clears the current results. With this selection: up to <strong>{count * selected.filter(engine => engine !== 'bert').length} paid API calls</strong>, one per statement per remote model. No automatic retries. Resume keeps the original settings and skips recorded attempts.</p>
        {!!unavailable.length && <p>Configure or deselect: {unavailable.map(name).join(', ')}.</p>}
        <p role="status">{busy === 'demo' ? 'Calling JEV…' : progress}</p>{error && <p className="error" role="alert">{error}</p>}
      </section>
      <section className="panel notebook-cell"><span className="cell-number">[4] RESULTS</span><h2>Quality and runtime</h2>
        <p>{run ? `${run.status.toUpperCase()} · ${run.count} questions per model · ${run.rows.length}/${run.count * run.engines.length} attempts recorded` : 'Run the comparison to calculate real measurements. No preset scores.'}</p>
        {run && <><p>Active wall time {seconds(run.activeMs)}{busy === 'benchmark' ? ' (updated when paused or finished)' : ''} · BERT load time {seconds(run.bertLoadMs)}. Model rows below sum request round trips, including transport overhead; BERT uses local worker round trips. This is not a hardware-matched inference-speed comparison.</p><div className="notebook-table"><table><thead><tr><th>Model</th><th>Attempted</th><th>Errors</th><th>Accuracy</th><th>Macro precision</th><th>Macro recall</th><th>Macro F1</th><th>Total time</th><th>Mean / question</th></tr></thead><tbody>{run.engines.map(engine => { const m = metrics(examples, run.rows.filter(row => row.engine === engine)); return <tr key={engine}><th>{name(engine)}<code>{run.models[engine]}</code></th><td>{m.attempted}/{run.count}</td><td>{m.errors}</td><td>{percent(m.accuracy)}</td><td>{percent(m.precision)}</td><td>{percent(m.recall)}</td><td>{percent(m.f1)}</td><td>{m.attempted ? seconds(m.elapsedMs) : '—'}</td><td>{seconds(m.meanMs)}</td></tr>; })}</tbody></table></div>
        {run.engines.map(engine => { const m = metrics(examples, run.rows.filter(row => row.engine === engine)); return <details key={engine}><summary>{name(engine)} · confusion matrix and per-class scores</summary><p>Rows = expected, columns = predicted. Valid response coverage: {percent(m.coverage)}.</p><div className="notebook-table"><table><thead><tr><th>Expected</th>{LABELS.map(label => <th key={label}>{label}</th>)}<th>Error</th><th>Support</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>{m.perClass.map((c, index) => <tr key={c.label}><th>{c.label}</th>{m.matrix[index].map((v, i) => <td key={i}>{v}</td>)}<td>{c.support}</td><td>{percent(c.precision)}</td><td>{percent(c.recall)}</td><td>{percent(c.f1)}</td></tr>)}</tbody></table></div></details>; })}</>}
        <details><summary>How metrics are calculated</summary><p>Accuracy = correct / attempted. Errors count as incorrect and as false negatives for the expected class. Precision = TP / (TP + FP); recall = TP / (TP + FN); F1 is their harmonic mean. Macro scores average the three class scores equally, with zero for a zero denominator. Unattempted questions are excluded: paused or running results are partial and may cover different subsets. Compare final scores only when each model attempted the same questions. No BERT loading time is included in per-question latency.</p></details>
      </section>
      <section className="panel notebook-cell"><span className="cell-number">[5] INSPECT</span><h2>Questions, answer key and individual predictions</h2><p>Question for every statement: “Is its financial sentiment positive, neutral, or negative?” Expand a prediction to inspect its returned probabilities and exact request. LLM probabilities are not invented.</p><div className="notebook-table"><table><thead><tr><th>Question</th><th>Expected</th>{(run?.engines ?? selected).map(engine => <th key={engine}>{name(engine)}</th>)}</tr></thead><tbody>{examples.map(example => <tr key={example.id}><td><b>{example.id}</b><p>{example.text}</p></td><td>{example.expected}</td>{(run?.engines ?? selected).map(engine => { const row = run?.rows.find(r => r.id === example.id && r.engine === engine); return <td key={engine}>{row ? <details><summary className={row.error ? 'prediction-error' : row.prediction === example.expected ? 'prediction-correct' : 'prediction-wrong'}>{row.error ? 'Error' : row.prediction} · {seconds(row.elapsedMs)}</summary>{row.error ? <p>{row.error}</p> : <><p>{row.prediction === example.expected ? 'Correct' : 'Incorrect'} · returned model: {row.model}</p>{row.probabilities && <div className="notebook-probabilities">{LABELS.map(label => <label key={label}>{label}<progress max={1} value={row.probabilities![label]}/>{percent(row.probabilities![label])}</label>)}</div>}<pre>{json({ request: row.request, response: row.response, inferenceMs: row.inferenceMs })}</pre></>}</details> : 'Not run'}</td>; })}</tr>)}</tbody></table></div></section>
    </div><footer><span>AI / DECISION LAB</span><span>Session results stay in this tab. Export before refreshing or switching labs.</span></footer>
  </main>;
}
