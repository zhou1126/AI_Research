'use client';
import { useEffect, useRef, useState } from 'react';
import { LabNavigation } from '../components/LabNavigation';
import { ROSTER, VENDORS, vendorRequest } from '../../lib/jev-overview';
import { accuracy, llmVendorRequest, type AgentEngine, type AgentResult, type RemoteEngine } from '../../lib/vendor/comparison';
import { runVendorBert } from '../../lib/vendor/bert-client';

const ENGINES: AgentEngine[] = ['jev', 'openai', 'deepseek', 'bert'];
const name = (engine: AgentEngine) => engine === 'jev' ? 'JEV' : engine === 'openai' ? 'OpenAI' : engine === 'deepseek' ? 'DeepSeek' : 'BERT-family';
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
type Config = Record<RemoteEngine, { configured: boolean; model: string }>;
type Outcome = { result?: AgentResult; error?: string };

export default function AgentComponent() {
  const [config, setConfig] = useState<Config | null>(null);
  const [selected, setSelected] = useState<AgentEngine[]>(['bert']);
  const [outcomes, setOutcomes] = useState<Partial<Record<AgentEngine, Outcome>>>({});
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [threshold, setThreshold] = useState(0.85);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { fetch('/api/config').then(response => response.json()).then(data => { const next = data as Config; setConfig(next); setSelected(ENGINES.filter(engine => engine === 'bert' || next[engine]?.configured)); }).catch(() => setStatus('Could not load provider configuration.')); return () => controller.current?.abort(); }, []);
  const toggle = (engine: AgentEngine) => setSelected(previous => previous.includes(engine) ? previous.filter(item => item !== engine) : ENGINES.filter(item => item === engine || previous.includes(item)));
  async function run() {
    if (busy || !selected.length) return;
    const abort = new AbortController(); controller.current = abort;
    setOutcomes({}); setBusy(true);
    try {
      for (const engine of selected) {
        if (abort.signal.aborted) break;
        setStatus(`Running ${name(engine)}…`);
        try {
          let result: AgentResult;
          if (engine === 'bert') result = await runVendorBert(abort.signal, message => setStatus(`Loading BERT-family model: ${message}`));
          else {
            const response = await fetch('/api/vendor-compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine }), signal: abort.signal });
            const data = await response.json() as AgentResult & { error?: string };
            if (!response.ok) throw new Error(data.error || `${name(engine)} request failed.`);
            result = data as AgentResult;
          }
          setOutcomes(previous => ({ ...previous, [engine]: { result } }));
        } catch (cause) {
          if (abort.signal.aborted) break;
          setOutcomes(previous => ({ ...previous, [engine]: { error: cause instanceof Error ? cause.message : 'Run failed.' } }));
        }
      }
      setStatus(abort.signal.aborted ? 'Stopped.' : 'Comparison finished.');
    } finally { setBusy(false); controller.current = null; }
  }
  const runs = ENGINES.filter(engine => outcomes[engine]?.result);
  return <main className="jev-page agent-page"><header><a className="brand" href="/">AI / DECISION LAB</a><span className="header-note">One workflow · four approaches</span></header><LabNavigation active="agent"/>
    <div className="agent-intro"><span className="jev-slide-kicker">AGENT COMPONENT / VENDOR RECONCILIATION</span><h1>Which model makes the matching decision?</h1><p className="jev-lead">The agent receives five roster entries and four approved vendors. Each method chooses a vendor ID or <code>unmatched</code>. The same hidden answer key scores every run; it is never sent to a provider.</p><div className="jev-agent-flow"><span>roster + vendor directory</span><b>→</b><span>JEV / OpenAI / DeepSeek / BERT</span><b>→</b><span>validated labels</span><b>→</b><span>review or match</span></div></div>
    <section className="agent-panel"><div className="agent-panel-title"><h2>Shared records and rule</h2><span>Five synthetic, hand-labeled examples</span></div><p>Match company identity <strong>and</strong> service. A similar company name alone is insufficient; choose <code>unmatched</code> if no approved vendor clearly matches.</p><div className="jev-vendor-layout"><div className="jev-vendor-source"><h2>Approved vendors</h2>{VENDORS.map(vendor => <div key={vendor.id}><code>{vendor.id}</code><span><b>{vendor.name}</b><small>{vendor.service}</small></span></div>)}</div><div className="jev-vendor-run"><h2>Roster to reconcile</h2>{ROSTER.map(row => <div className="jev-roster-row" key={row.id}><div><b>{row.id} · {row.entry}</b><small>{row.service}</small></div><div><span>{outcomes.jev?.result?.decisions.find(decision => decision.id === row.id)?.choice ?? 'Awaiting run'}</span></div></div>)}</div></div></section>
    <section className="agent-panel"><div className="agent-panel-title"><h2>Choose methods and run</h2><span>One remote request per selected API method; BERT runs in the browser</span></div><div className="agent-methods">{ENGINES.map(engine => { const ready = engine === 'bert' || Boolean(config?.[engine]?.configured); return <label key={engine}><input type="checkbox" checked={selected.includes(engine)} disabled={busy || !ready} onChange={() => toggle(engine)}/><b>{name(engine)}</b><small>{engine === 'bert' ? 'Xenova/all-MiniLM-L6-v2 · browser WASM' : config?.[engine]?.model || 'Model not configured'}</small><span>{engine === 'jev' ? 'Five Choice questions · one shared state · one call' : engine === 'bert' ? 'Nine text embeddings · cosine similarity + 0.55 gate' : 'Five constrained labels · one JSON response'}</span>{!ready && <em>Missing key or model</em>}</label>; })}</div><div className="jev-controls"><button className="primary" onClick={run} disabled={busy || !selected.some(engine => engine === 'bert' || config?.[engine]?.configured)}>Run comparison</button>{busy && <button onClick={() => controller.current?.abort()}>Stop</button>}<label>JEV auto-match confidence: <strong>{Math.round(threshold * 100)}%</strong><input type="range" min="0.5" max="0.99" step="0.01" value={threshold} onChange={event => setThreshold(Number(event.target.value))}/></label><span role="status">{status}</span></div><p className="agent-fine">Remote runs use API credits only when you click Run. The BERT-family model downloads on first use and may take time; its load and inference times are separate. No vendor record is modified. Similarity scores are not probabilities. LLM confidence scores are not invented.</p></section>
    <section className="agent-panel"><div className="agent-panel-title"><h2>Comparison</h2><span>Accuracy on five examples; a demonstration, not a general benchmark</span></div><div className="notebook-table"><table><thead><tr><th>Method</th><th>Accuracy</th><th>Run time</th><th>Load</th><th>API calls</th><th>Tokens / cost</th></tr></thead><tbody>{ENGINES.map(engine => { const outcome = outcomes[engine], result = outcome?.result; const estimatedCost = engine === 'jev' && result?.usage ? result.usage.input_tokens * 0.042 / 1_000_000 : null; return <tr key={engine}><th>{name(engine)}<code>{result?.model || (engine === 'bert' ? 'Xenova/all-MiniLM-L6-v2' : config?.[engine]?.model || '—')}</code></th><td className={result ? 'prediction-correct' : outcome?.error ? 'prediction-error' : ''}>{result ? `${Math.round(accuracy(result.decisions) * ROSTER.length)}/${ROSTER.length} · ${(accuracy(result.decisions) * 100).toFixed(0)}%` : outcome?.error ? 'Error' : 'Not run'}</td><td>{result ? seconds(result.elapsedMs) : '—'}</td><td>{result?.loadMs === undefined ? '—' : seconds(result.loadMs)}</td><td>{result ? engine === 'bert' ? '0' : '1' : '—'}</td><td>{result?.usage ? `${result.usage.input_tokens.toLocaleString()} in / ${result.usage.output_tokens.toLocaleString()} out${estimatedCost === null ? '' : ` · ~$${estimatedCost.toFixed(6)}`}` : result ? engine === 'bert' ? 'Local; no API charge' : 'Not reported' : '—'}</td></tr>; })}</tbody></table></div>{ENGINES.map(engine => outcomes[engine]?.error && <p className="jev-error" role="alert" key={engine}>{name(engine)}: {outcomes[engine]?.error}</p>)}{runs.length > 0 && <div className="notebook-table"><table><thead><tr><th>Roster entry</th><th>Expected</th>{runs.map(engine => <th key={engine}>{name(engine)}</th>)}</tr></thead><tbody>{ROSTER.map(row => <tr key={row.id}><td><b>{row.entry}</b><p>{row.service}</p></td><td>{row.expected}</td>{runs.map(engine => { const decision = outcomes[engine]?.result?.decisions.find(item => item.id === row.id); const review = engine === 'jev' && decision && (decision.choice === 'unmatched' || (decision.confidence ?? 0) < threshold); return <td className={decision?.choice === row.expected ? 'prediction-correct' : 'prediction-wrong'} key={engine}><b>{decision?.choice || '—'}</b>{decision?.confidence !== undefined && <small> · {(decision.confidence * 100).toFixed(1)}% Choice confidence{review ? ' · review' : ' · auto match'}</small>}{decision?.probabilities && <details><summary>Choice probabilities</summary><pre>{JSON.stringify(decision.probabilities, null, 2)}</pre></details>}{decision?.similarities && <details><summary>Cosine similarities</summary><pre>{JSON.stringify(decision.similarities, null, 2)}</pre></details>}</td>; })}</tr>)}</tbody></table></div>}</section>
    <section className="agent-panel"><h2>How each component is called</h2><p>JEV asks five typed Choice questions against one shared state, so the provider can evaluate them in parallel within one call. OpenAI and DeepSeek each return one constrained JSON object with five labels. The BERT-family baseline embeds the nine names and descriptions locally and applies a code-defined similarity threshold.</p><details><summary>Inspect JEV request shape</summary><pre>{JSON.stringify(vendorRequest(config?.jev?.model || 'jev-latest'), null, 2)}</pre></details><details><summary>Inspect OpenAI request shape</summary><pre>{JSON.stringify(llmVendorRequest('openai', config?.openai?.model || '<configured model>'), null, 2)}</pre></details><details><summary>Inspect DeepSeek request shape</summary><pre>{JSON.stringify(llmVendorRequest('deepseek', config?.deepseek?.model || '<configured model>'), null, 2)}</pre></details><p className="agent-fine">JEV cost uses TypeSafe’s published input rate of $0.042 per million tokens; other provider costs are omitted because model pricing depends on configuration. Server requests never include the answer key. Sources: <a href="https://docs.typesafe.ai/cookbooks/parallel_questions" target="_blank" rel="noreferrer">TypeSafe parallel questions</a> · <a href="https://docs.typesafe.ai/models" target="_blank" rel="noreferrer">JEV pricing</a> · <a href="https://huggingface.co/Xenova/all-MiniLM-L6-v2" target="_blank" rel="noreferrer">BERT-family model card</a>.</p></section>
  </main>;
}
