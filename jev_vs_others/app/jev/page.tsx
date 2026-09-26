'use client';
import { useEffect, useState } from 'react';
import { LabNavigation } from '../components/LabNavigation';
import { ROSTER, VENDORS, vendorRequest, type VendorDemoResult } from '../../lib/jev-overview';

const SLIDES = ['What Jev is', 'Input & output', 'Speed & cost', 'Accuracy', 'Agent example'] as const;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const source = (href: string, label: string) => <a href={href} target="_blank" rel="noreferrer">{label} ↗</a>;

export default function JevOverview() {
  const [slide, setSlide] = useState(0);
  const [config, setConfig] = useState<{ configured: boolean; model: string }>({ configured: false, model: 'jev-latest' });
  const [threshold, setThreshold] = useState(0.85);
  const [result, setResult] = useState<VendorDemoResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/config').then(response => response.json()).then(data => setConfig((data as { jev?: { configured: boolean; model: string } }).jev || { configured: false, model: 'jev-latest' })).catch(() => setError('Could not load JEV configuration.'));
  }, []);
  useEffect(() => {
    if (!globalThis.window) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('button,input,textarea,select,a')) return;
      if (event.key === 'ArrowRight') setSlide(index => Math.min(SLIDES.length - 1, index + 1));
      if (event.key === 'ArrowLeft') setSlide(index => Math.max(0, index - 1));
    };
    globalThis.window.addEventListener('keydown', onKey);
    return () => globalThis.window.removeEventListener('keydown', onKey);
  }, []);
  async function runDemo() {
    if (busy || !config.configured) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch('/api/jev-overview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'vendor-demo' }) });
      const data = await response.json() as VendorDemoResult & { error?: string };
      if (!response.ok) throw new Error(data.error || 'JEV request failed.');
      setResult(data as VendorDemoResult);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'JEV request failed.'); }
    finally { setBusy(false); }
  }
  const correct = result?.decisions.filter(decision => decision.choice === ROSTER.find(row => row.id === decision.id)?.expected).length ?? 0;
  const auto = result?.decisions.filter(decision => decision.choice !== 'unmatched' && decision.confidence >= threshold).length ?? 0;
  const cost = result?.usage ? result.usage.input_tokens * 0.042 / 1_000_000 : null;
  const pages = [
    <section className="jev-slide jev-hero" key="intro" aria-labelledby="jev-slide-title">
      <div className="jev-slide-kicker">01 / THE MODEL</div>
      <div className="jev-hero-grid"><div><p className="jev-overline">SYSTEM ONE · STRUCTURED DECISIONS</p><h1 id="jev-slide-title">Jev turns a state into a decision your code can use.</h1><p className="jev-lead">Send text or structured records with typed questions. Get back choices, scores, and probabilities. Your application decides what to do next.</p><div className="jev-flow"><span>state</span><b>→</b><span>typed questions</span><b>→</b><span>probabilities</span><b>→</b><span>code action</span></div></div><div className="jev-terminal"><div className="jev-terminal-top">ONE QUERY · THREE JUDGMENTS</div><pre>{`state: "Supplier name differs from the roster"

questions:
  same_vendor:   Noul
  best_match:    Choice
  review_level:  Score

answers:
  same_vendor:   0.91
  best_match:    v02  ·  0.86
  review_level:  1.2 / 2`}</pre><small>Illustrative values, not a live result.</small></div></div>
      <p className="jev-caption">TypeSafe describes a new architecture, parallel sampler, and RLCD training. Its reviewed public pages do not specify the layer design, parameter count, or training recipe. {source('https://typesafe.ai/blog/introducing-system-one-models-and-jev', 'TypeSafe technical introduction')}</p>
    </section>,
    <section className="jev-slide" key="io" aria-labelledby="jev-slide-title">
      <div className="jev-slide-kicker">02 / CONTRACT</div><h1 id="jev-slide-title">One state. Typed questions. Predictable output.</h1><p className="jev-lead">Jev evaluates text supplied as a string, JSON object, or array. It does not currently accept images, audio, or video directly.</p>
      <div className="jev-primitives"><article><span className="jev-type">01 · NOUL</span><h2>Yes or no</h2><p>Returns <code>noul</code>, a probability between 0 and 1.</p><code>same_vendor → 0.91</code></article><article><span className="jev-type">02 · CHOICE</span><h2>One of a set</h2><p>Returns a selected label, probabilities over every option, and confidence.</p><code>vendor → v02 · 0.86</code></article><article><span className="jev-type">03 · SCORE</span><h2>Ordered level</h2><p>Returns a score across descriptive levels, plus probabilities and confidence.</p><code>review → 1.2 / 2</code></article></div>
      <div className="jev-metrics"><div><strong>64k</strong><span>total input tokens per request</span></div><div><strong>32k</strong><span>state + longest question limit</span></div><div><strong>0¢</strong><span>output-token charge</span></div></div>
      <p className="jev-caption">The API reports both <code>usage.input_tokens</code> and <code>usage.output_tokens</code>. Output tokens are tracked, but current Jev pricing charges for input tokens only. {source('https://docs.typesafe.ai/models', 'Models and limits')} · {source('https://docs.typesafe.ai/api', 'API response fields')}</p>
    </section>,
    <section className="jev-slide" key="speed" aria-labelledby="jev-slide-title">
      <div className="jev-slide-kicker">03 / ECONOMICS</div><h1 id="jev-slide-title">Parallel questions change the cost of asking.</h1><p className="jev-lead">Jev evaluates multiple independent questions against one shared state in a single request. This avoids sending the same state repeatedly.</p>
      <div className="jev-comparison"><article><span>13 separate calls</span><strong>2.71 s</strong><div className="jev-bar long"/><small>$0.006090 · 13 round trips</small></article><article className="featured"><span>13 questions, one call</span><strong>0.27 s</strong><div className="jev-bar short"/><small>$0.000497 · 1 round trip</small></article></div>
      <div className="jev-metrics"><div><strong>10×</strong><span>faster in this published example</span></div><div><strong>12.2×</strong><span>cheaper in this published example</span></div><div><strong>$0.042</strong><span>per million input tokens</span></div></div>
      <p className="jev-caption">These are TypeSafe’s measurements for 13 questions over one ~54k-character document, not a promise for every workload. TypeSafe separately reports 70–500 ms end-to-end responses; network and question size change actual time. {source('https://docs.typesafe.ai/cookbooks/parallel_questions', 'Parallel questions cookbook')} · {source('https://typesafe.ai/blog/introducing-system-one-models-and-jev', 'Provider speed claim')}</p>
    </section>,
    <section className="jev-slide" key="accuracy" aria-labelledby="jev-slide-title">
      <div className="jev-slide-kicker">04 / EVIDENCE</div><h1 id="jev-slide-title">Typed output is certain. Correct decisions are measured.</h1><p className="jev-lead">The output schema limits Jev to the options you define. It can still pick the wrong option or be overconfident on a particular task.</p>
      <div className="jev-accuracy-grid"><article><span className="jev-type">WHAT IS GUARANTEED</span><h2>Output shape</h2><p>Choice returns one of your allowed labels. Your code should still validate the response before acting.</p></article><article><span className="jev-type">WHAT IS TESTED</span><h2>Task accuracy</h2><p>TypeSafe’s workflow evals compare models against consensus labels from two frontier LLMs. Those labels are a reference, not independently verified truth.</p></article><article><span className="jev-type">WHAT TO MEASURE</span><h2>Your own records</h2><p>Use labeled examples, report accuracy and coverage, then test confidence thresholds for the cases you can safely automate.</p></article></div>
      <div className="jev-note"><b>No universal Jev accuracy % is published for roster matching.</b><span>The <a href="/notebook">JEV notebook</a> measures accuracy, precision, recall, and F1 on 50 labeled sentiment statements. The next slide measures a tiny synthetic vendor sample live.</span></div>
      <p className="jev-caption">TypeSafe documents failure modes for numerical reasoning, indirection, irrelevant context, and adversarial content. Put exact arithmetic and hard rules in code. {source('https://evals.typesafe.ai/', 'Workflow eval method')} · {source('https://docs.typesafe.ai/model-jaggedness/jev-1.13', 'Known limitations')}</p>
    </section>,
    <section className="jev-slide jev-agent" key="agent" aria-labelledby="jev-slide-title">
      <div className="jev-slide-kicker">05 / AGENT COMPONENT</div><h1 id="jev-slide-title">Roster → approved vendor mapping</h1><p className="jev-lead">A reconciliation agent has five roster entries and four approved vendors. Jev makes five Choice decisions in one call; code sends uncertain or unmatched cases to review.</p>
      <div className="jev-agent-flow"><span>candidate records</span><b>→</b><span>Jev: five choices</span><b>→</b><span>confidence gate</span><b>→</b><span>match or review</span></div>
      <div className="jev-vendor-layout"><div className="jev-vendor-source"><h2>Approved vendor directory</h2>{VENDORS.map(vendor => <div key={vendor.id}><code>{vendor.id}</code><span><b>{vendor.name}</b><small>{vendor.service}</small></span></div>)}<details><summary>Inspect the exact five-question request</summary><pre>{JSON.stringify(vendorRequest(config.model), null, 2)}</pre></details></div><div className="jev-vendor-run"><div className="jev-vendor-head"><h2>Roster entries</h2><span>{result ? `${correct}/${ROSTER.length} correct on this synthetic sample` : 'Five labeled examples'}</span></div>{ROSTER.map(row => { const decision = result?.decisions.find(item => item.id === row.id); const review = decision && (decision.choice === 'unmatched' || decision.confidence < threshold); return <div className="jev-roster-row" key={row.id}><div><b>{row.entry}</b><small>{row.service}</small></div><div>{decision ? <><strong>{decision.choice}</strong><small>{percent(decision.confidence)} confidence · {review ? 'review' : 'auto match'}</small></> : <span>Awaiting run</span>}</div></div>; })}</div></div>
      <div className="jev-controls"><button className="primary" disabled={busy || !config.configured} onClick={runDemo}>{busy ? 'Calling Jev…' : 'Run live vendor mapping'}</button><label>Auto-match confidence: <strong>{percent(threshold)}</strong><input type="range" min="0.5" max="0.99" step="0.01" value={threshold} onChange={event => setThreshold(Number(event.target.value))}/></label><span>{config.configured ? `Model: ${config.model}` : 'Set JEV_API_KEY to enable the live call.'}</span></div>
      {error && <p className="jev-error" role="alert">{error}</p>}{result && <div className="jev-result-strip"><div><strong>{(result.elapsedMs / 1000).toFixed(2)} s</strong><span>measured round trip</span></div><div><strong>{result.usage ? result.usage.input_tokens.toLocaleString() : '—'}</strong><span>input tokens</span></div><div><strong>{result.usage ? result.usage.output_tokens.toLocaleString() : '—'}</strong><span>output tokens · free</span></div><div><strong>{cost === null ? '—' : `$${cost.toFixed(6)}`}</strong><span>estimated input cost</span></div><div><strong>{auto}/{ROSTER.length}</strong><span>auto matched at threshold</span></div><details><summary>Returned probabilities and answer key</summary><pre>{JSON.stringify(result.decisions.map(decision => ({ ...decision, expected: ROSTER.find(row => row.id === decision.id)?.expected })), null, 2)}</pre></details></div>}
      <p className="jev-caption">Synthetic, hand-labeled records; this is an agent component demonstration, not a vendor-matching benchmark. Run makes one paid JEV request. No vendor record is changed. Adjusting the threshold reuses the answer without another request. {source('https://docs.typesafe.ai/patterns/confidence-routing', 'Confidence-gated routing')}</p>
    </section>,
  ];
  return <main className="jev-page"><header><a className="brand" href="/">AI / DECISION LAB</a><span className="header-note">Model notes · vendor example</span></header><LabNavigation active="jev"/><div className="jev-deck-nav"><div><span className="jev-deck-label">JEV MODEL BRIEFING</span><span className="jev-deck-count">{String(slide + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}</span></div><nav aria-label="Jev slides">{SLIDES.map((name, index) => <button key={name} aria-current={slide === index ? 'step' : undefined} onClick={() => setSlide(index)}>{name}</button>)}</nav></div><div className="jev-slide-frame">{pages[slide]}</div><div className="jev-deck-footer"><span>TypeSafe figures are provider-published; live measurements appear only after Run.</span><div><button disabled={slide === 0} onClick={() => setSlide(index => index - 1)}>← Previous</button><button className="primary" disabled={slide === SLIDES.length - 1} onClick={() => setSlide(index => index + 1)}>Next →</button></div></div></main>;
}
