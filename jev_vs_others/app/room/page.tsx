'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LabNavigation } from '../components/LabNavigation';
import { ROOM_LABELS, ROOM_PRESETS, ROOM_RULES, replayRoom, roomStep, roomSuccess, shortestRoomPlan, validateRoom, type RoomAction, type RoomDecision, type RoomEngine, type RoomScenario } from '../../lib/room';
import { RoomBoard, tileNames } from './RoomBoard';

type Run = { history: RoomAction[]; decisions: RoomDecision[]; status: 'ready' | 'success' | 'step_limit' | 'error'; error?: string };
type Runs = Record<RoomEngine, Run>;
type Settings = { iterations: number; depth: number; seed: number; maxSteps: number };
type RecordPair = { scenario: RoomScenario; settings: Settings; runs: Runs; optimalSteps: number; completedAt: string };
const fresh = (): Runs => ({ jev: { history: [], decisions: [], status: 'ready' }, mcts: { history: [], decisions: [], status: 'ready' } });
type Pending = Partial<Record<RoomEngine, RoomDecision>>;
const finished = (run: Run) => run.status === 'success' || run.status === 'step_limit';

export default function RoomLab() {
  const [scenario, setScenario] = useState<RoomScenario>(ROOM_PRESETS[0].scenario);
  const [settings, setSettings] = useState<Settings>({ iterations: 300, depth: 40, seed: 42, maxSteps: 60 });
  const [runs, setRuns] = useState<Runs>(fresh), runsRef = useRef(runs);
  const [records, setRecords] = useState<RecordPair[]>([]), recorded = useRef(false);
  const [view, setView] = useState<RoomEngine>('jev'), [editing, setEditing] = useState(false), [brush, setBrush] = useState('.');
  const [busy, setBusy] = useState(false), active = useRef(false), controller = useRef<AbortController | null>(null);
  const [error, setError] = useState(''), [live, setLive] = useState<RoomDecision | null>(null);
  const [pending, setPending] = useState<Pending>({}), pendingRef = useRef<Pending>({});
  const [raised, setRaised] = useState(true), [showScores, setShowScores] = useState(true);
  const [model, setModel] = useState('Loading model…');
  useEffect(() => { fetch('/api/config').then(r => r.json()).then(data => setModel((data as { jev?: { model?: string } }).jev?.model || 'Not configured')).catch(() => setModel('Configuration unavailable')); return () => controller.current?.abort(); }, []);
  const checked = useMemo(() => { try { const room = validateRoom(scenario); const plan = shortestRoomPlan(room); return { room, optimal: plan?.length ?? null, error: plan === null ? 'No valid route to the goal. Edit the room layout.' : '' }; } catch (e) { return { room: null, optimal: null, error: e instanceof Error ? e.message : 'Invalid room.' }; } }, [scenario]);
  const run = runs[view];
  const decision = editing ? null : live?.engine === view ? live : pending[view];
  const state = decision?.context.current ?? (checked.room ? replayRoom(checked.room, run.history) : null);
  const inspectingHistory = !!decision && decision.context.steps_taken < run.history.length;
  const bothDone = finished(runs.jev) && finished(runs.mcts);
  function updatePending(next: Pending) { pendingRef.current = next; setPending(next); }
  function reset() { const next = fresh(); runsRef.current = next; setRuns(next); recorded.current = false; setLive(null); updatePending({}); setError(''); }
  function change(next: RoomScenario) { if (active.current) return; setScenario(next); reset(); }
  function changeSetting(key: keyof Settings, value: number, min: number, max: number) { if (active.current) return; setSettings(s => ({ ...s, [key]: Math.min(max, Math.max(min, Math.floor(value) || min)) })); reset(); }
  function paint(x: number, y: number) {
    if (!editing || active.current) return;
    const grid = scenario.grid.map(row => [...row]);
    if ('SEKPD'.includes(brush)) for (const row of grid) for (let i = 0; i < row.length; i++) if (row[i] === brush) row[i] = '.';
    grid[y][x] = brush; change({ ...scenario, grid: grid.map(row => row.join('')) });
  }
  function publish(next: Runs) {
    runsRef.current = next; setRuns(next);
    if (finished(next.jev) && finished(next.mcts) && !recorded.current && checked.room && checked.optimal !== null) {
      recorded.current = true; setRecords(previous => [...previous, { scenario: checked.room!, settings, runs: next, optimalSteps: checked.optimal!, completedAt: new Date().toISOString() }]);
    }
  }
  async function analyze(engine: RoomEngine): Promise<RoomDecision> {
    const abort = new AbortController(); controller.current = abort; setView(engine); setLive(null);
    const history = runsRef.current[engine].history;
    const response = await fetch('/api/room/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine, scenario: checked.room, history, maxSteps: settings.maxSteps, options: { ...settings, seed: settings.seed + history.length } }), signal: abort.signal });
    if (!response.ok) throw new Error((await response.json() as { error?: string }).error || 'Room analysis failed.');
    const reader = response.body!.getReader(), decoder = new TextDecoder(); let buffer = '', final: RoomDecision | undefined;
    while (true) {
      const { done, value } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n'); buffer = lines.pop()!;
      for (const line of lines) if (line) { const event = JSON.parse(line); if (event.type === 'error') throw new Error(event.data.message); if (event.type === 'progress' && active.current) setLive(event.data); if (event.type === 'done') final = event.data; }
      if (done) break;
    }
    if (!final) throw new Error('Room analysis ended without a decision.');
    return final;
  }
  async function prepare(engine: RoomEngine) {
    const previous = runsRef.current[engine]; if (finished(previous)) return;
    setView(engine); setLive(null);
    if (pendingRef.current[engine]) return;
    try {
      const nextDecision = await analyze(engine); if (!active.current) return;
      if (nextDecision.engine !== engine) throw new Error('Unexpected room planner response.');
      roomStep(checked.room!, replayRoom(checked.room!, previous.history), nextDecision.action);
      if (JSON.stringify(nextDecision.context.history) !== JSON.stringify(previous.history) || JSON.stringify(nextDecision.context.scenario) !== JSON.stringify(checked.room)) throw new Error('Room decision does not match the current scenario.');
      updatePending({ ...pendingRef.current, [engine]: nextDecision }); setLive(null);
      if (previous.status === 'error') publish({ ...runsRef.current, [engine]: { ...previous, status: 'ready', error: undefined } });
    } catch (e) { if (active.current) { const message = e instanceof Error ? e.message : 'Room analysis failed.'; publish({ ...runsRef.current, [engine]: { ...previous, status: 'error', error: message } }); throw e; } }
  }
  function apply(engine: RoomEngine) {
    const previous = runsRef.current[engine], nextDecision = pendingRef.current[engine];
    if (!nextDecision || finished(previous)) return;
    if (JSON.stringify(nextDecision.context.history) !== JSON.stringify(previous.history)) throw new Error('Analyze the current room before applying an action.');
    const after = roomStep(checked.room!, replayRoom(checked.room!, previous.history), nextDecision.action);
    const history = [...previous.history, nextDecision.action];
    const status = roomSuccess(checked.room!, after) ? 'success' : history.length >= settings.maxSteps ? 'step_limit' : 'ready';
    publish({ ...runsRef.current, [engine]: { history, decisions: [...previous.decisions, nextDecision], status } });
    updatePending({ ...pendingRef.current, [engine]: undefined }); setLive(null); setView(engine);
  }
  async function step(engine: RoomEngine) { await prepare(engine); if (active.current) apply(engine); }
  async function runTask(task: () => Promise<void>) {
    if (active.current || busy || checked.error) return; active.current = true; setBusy(true); setEditing(false); setError('');
    try { await task(); } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Room comparison failed.'); }
    finally { active.current = false; setBusy(false); controller.current = null; setLive(null); }
  }
  async function compare() { await runTask(async () => { while (active.current && !(finished(runsRef.current.jev) && finished(runsRef.current.mcts))) { for (const engine of ['jev', 'mcts'] as const) { if (!active.current) break; await step(engine); } if (active.current) await new Promise(r => setTimeout(r, 180)); } }); }
  function pause() { active.current = false; controller.current?.abort(); }
  function download() { const data = { version: 2, lab: 'room', scenario, settings, runs, pendingDecisions: pending, optimalSteps: checked.optimal, completedComparisons: records }; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); link.download = 'room-comparison.json'; link.click(); URL.revokeObjectURL(link.href); }
  return <main>
    <header><a href="/" className="brand"><span>AI<span className="brand-light"> / DECISION LAB</span></span></a><span className="header-note">Shared rules · measurable goals</span></header>
    <LabNavigation active="room"/>
    <section className="intro"><div><h1>Room planning lab</h1><p className="subtitle">Same room. Same goal. Compare actions to success.</p></div><div className="model-catalog"><div><span>JEV model</span><code>{model}</code></div><div><span>MCTS</span><code>Local UCT planner</code></div></div></section>
    <section className="panel room-rules" aria-label="Room rules">
      <div><h2>Before you begin</h2><p><strong>Your goal:</strong> {scenario.goal === 'deliver' ? 'Pick up the parcel and carry it to the exit.' : 'Reach the exit.'} Succeed in as few actions as possible.</p></div>
      <ol><li><strong>Move</strong> one cell north, south, east or west. Walls and locked doors block movement; no diagonals.</li><li><strong>Interact</strong> to pick up a key or parcel while on its cell. With the key, unlock a door from an adjacent cell. Keys are kept and doors stay open.</li><li><strong>Count</strong> each move, pickup and unlock as one step. Reaching the step limit without the goal is a failed run.</li></ol>
      <p><strong>Step by step:</strong> Analyze → inspect the choices in the room → apply the selected action. Or run both planners automatically.</p>
      <details><summary>Full simulator rules</summary><p>{ROOM_RULES}</p></details>
    </section>
    <div className="room-workspace">
      <section className="panel room-setup"><h2>Describe the task</h2>
        <label>Example room<select aria-label="Example room" disabled={busy} defaultValue="" onChange={e => { if (e.target.value !== '') change(ROOM_PRESETS[Number(e.target.value)].scenario); }}><option value="" disabled>Choose a preset</option>{ROOM_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}</select></label>
        {(['location', 'situation', 'purpose'] as const).map(key => <label key={key}>{key[0].toUpperCase() + key.slice(1)}<textarea aria-label={`Room ${key}`} maxLength={1200} rows={3} value={scenario[key]} disabled={busy} onChange={e => change({ ...scenario, [key]: e.target.value })}/></label>)}
        <label>Goal condition<select aria-label="Room goal" value={scenario.goal} disabled={busy} onChange={e => change({ ...scenario, goal: e.target.value as RoomScenario['goal'] })}><option value="deliver">Collect parcel and reach exit</option><option value="exit">Reach exit</option></select></label>
        <p className="fine">The grid and goal condition define the task for both planners. Descriptions give JEV context; MCTS searches the structured rules. Text alone does not add hazards or change success conditions.</p>
        <label>MCTS simulations<input aria-label="Room simulations" type="number" min="25" max="2000" value={settings.iterations} disabled={busy} onChange={e => changeSetting('iterations', +e.target.value, 25, 2000)}/></label>
        <div className="input-pair"><label>Rollout depth<input aria-label="Room rollout depth" type="number" min="1" max="80" value={settings.depth} disabled={busy} onChange={e => changeSetting('depth', +e.target.value, 1, 80)}/></label><label>Seed<input aria-label="Room seed" type="number" min="0" max="100000" value={settings.seed} disabled={busy} onChange={e => changeSetting('seed', +e.target.value, 0, 100000)}/></label></div>
        <label>Maximum steps per planner<input aria-label="Room step limit" type="number" min="1" max="200" value={settings.maxSteps} disabled={busy} onChange={e => changeSetting('maxSteps', +e.target.value, 1, 200)}/></label>
        <p className="fine">Each JEV analysis makes a paid API request. Applying its action makes no additional request. Editing the scenario or budget resets current runs and pending decisions.</p>
      </section>
      <section className="room-stage"><div className="room-play-area"><div className="tabs" role="group" aria-label="Room planner view">{(['jev', 'mcts'] as const).map(engine => <button key={engine} className={view === engine ? 'selected' : ''} onClick={() => { setView(engine); setLive(null); }}>{engine.toUpperCase()} · {runs[engine].history.length} steps</button>)}</div>
        <div className="room-view-controls"><button aria-pressed={raised} disabled={editing} onClick={() => setRaised(!raised)}>{raised ? '3D top view' : 'Flat top view'}</button><button aria-pressed={showScores} onClick={() => setShowScores(!showScores)}>{showScores ? 'Hide action scores' : 'Show action scores'}</button><span>↑ North</span></div>
        <div className="room-snapshot">{decision ? <span>{inspectingHistory ? 'History' : busy ? 'Analyzing' : 'Preview'} · before step {decision.context.steps_taken + 1} · {ROOM_LABELS[decision.action]}</span> : <span>Current room · {run.history.length} actions taken</span>}{inspectingHistory && <button onClick={() => setLive(null)}>Return to current room</button>}</div>
        <RoomBoard scenario={scenario} state={state} decision={decision} editing={editing} busy={busy} raised={raised} showScores={showScores} paint={paint}/>
        <p className="room-score-legend"><span className="heat-gradient"/>{view === 'jev' ? 'JEV probability on destination tiles' : 'MCTS visit share (not probability)'} · light → dark = low → high · gold outline = selected</p>
        <p className="room-floor-help">{decision ? 'Arrows and percentages are drawn on the floor. Pick up and Unlock label interaction cells.' : 'Green floor tiles show legal actions. Click Analyze to fill in the percentages, then Apply to move.'}</p>
        <p className="room-inventory">{view.toUpperCase()} · key {state?.hasKey ? 'held' : 'not held'} · parcel {state?.hasParcel ? 'held' : 'not held'} · door {state?.doorOpen ? 'open' : 'locked / absent'}</p>
        <div className="room-step-controls" aria-label="Step by step controls">{(['jev', 'mcts'] as const).map(engine => <div key={engine}><button disabled={busy || !!checked.error || finished(runs[engine]) || !!pending[engine]} onClick={() => runTask(() => prepare(engine))}>Analyze {engine.toUpperCase()}</button><button className="primary" disabled={busy || editing || !!checked.error || !pending[engine] || (inspectingHistory && view === engine)} title={pending[engine] ? ROOM_LABELS[pending[engine]!.action] : undefined} onClick={() => runTask(async () => apply(engine))}>Apply {engine.toUpperCase()} action</button></div>)}</div>
        <div className="room-controls" aria-label="Room controls"><button disabled={busy || !!checked.error || bothDone} onClick={compare}>Run comparison</button><button disabled={!busy} onClick={pause}>Pause room run</button><button disabled={busy} onClick={reset}>Reset room runs</button><button disabled={busy} aria-pressed={editing} onClick={() => { setEditing(!editing); setLive(null); }}>{editing ? 'Finish editing' : 'Edit room layout'}</button></div>
        {editing && <div className="room-brushes" role="group" aria-label="Room drawing tools">{Object.entries(tileNames).map(([tile, name]) => <button key={tile} aria-pressed={brush === tile} onClick={() => setBrush(tile)}>{name}</button>)}</div>}
        {(checked.error || error) && <p className="error" role="alert">{checked.error || error}</p>}
        <p role="status">{busy ? `Analyzing ${live?.engine.toUpperCase() ?? view.toUpperCase()}…` : pending[view] ? `Decision ready. Inspect the room, then apply ${ROOM_LABELS[pending[view]!.action].toLowerCase()}.` : run.status === 'success' ? `${view.toUpperCase()} reached the goal.` : run.status === 'step_limit' ? `${view.toUpperCase()} reached the step limit without success.` : 'Ready. Analyze a planner, then apply its action; or run both.'}</p>
        </div>
        <details className="room-visual-guide"><summary>Room objects & imagery</summary><p>The robot marks the planner’s position. The brass key unlocks the door; the box is the parcel. START and EXIT mark the endpoints. Editing uses the flat view: choose a tool, then click a cell.</p><p>Floor texture: <a href="https://polyhaven.com/a/large_floor_tiles_02" target="_blank" rel="noreferrer">Poly Haven / Rob Tuytel</a> (CC0). Robot, key and parcel are generated realistic images.</p></details>
        <div className="panel room-results"><h2>Steps to the goal</h2><p>Exact shortest plan: <strong>{checked.optimal ?? 'No route'}</strong> steps. Reference only; neither planner receives this answer.</p>{checked.optimal !== null && checked.optimal > settings.maxSteps && <p>The step limit is below the shortest plan. Neither planner can finish within this budget.</p>}
          <table><thead><tr><th>Planner</th><th>Result</th><th>Actions</th><th>Extra steps</th></tr></thead><tbody>{(['jev', 'mcts'] as const).map(engine => <tr key={engine}><th>{engine.toUpperCase()}</th><td>{runs[engine].status === 'ready' ? 'In progress' : runs[engine].status.replace('_', ' ')}</td><td>{runs[engine].history.length}</td><td>{runs[engine].status === 'success' && checked.optimal !== null ? runs[engine].history.length - checked.optimal : '—'}</td></tr>)}</tbody></table>
          <p>Compare step counts among successful runs. A capped or failed run has no successful step score.</p><button onClick={download}>Export room comparison</button><p>{records.length} completed comparisons in this session. Export before refreshing or changing labs.</p>
        </div>
      </section>
      <aside className="panel room-inspector"><h2>Inside the decision</h2>{decision ? <><p>Before step {decision.context.steps_taken + 1}: <strong>{ROOM_LABELS[decision.action]}</strong></p><p>{decision.engine === 'jev' ? 'Action-choice probability' : `MCTS · ${decision.iterations} simulations · visit counts`}</p><div className="candidates">{decision.candidates.map(candidate => <div className={`candidate ${candidate.action === decision.action ? 'chosen' : ''}`} key={candidate.action}><span className="candidate-main"><b>{ROOM_LABELS[candidate.action]}</b><span className="bar"><span style={{ width: `${100 * (candidate.probability ?? (candidate.visits ?? 0) / (decision.iterations || 1))}%` }}/></span></span><span className="candidate-value">{candidate.probability !== undefined ? `${(100 * candidate.probability).toFixed(1)}%` : `${candidate.visits} visits`}{candidate.value !== undefined && <small>Value {candidate.value.toFixed(3)} · UCT {candidate.uct?.toFixed(3)}</small>}</span></div>)}</div><p>{decision.explanation}</p>{decision.path && <p>Latest tree path: {decision.path.join(' → ') || 'root'}</p>}<details className="model-context"><summary>Decision context</summary><pre>{JSON.stringify(decision.context, null, 2)}</pre></details></> : <p>JEV probabilities and MCTS search statistics appear after analysis.</p>}
        <h3>Action history · {view.toUpperCase()}</h3><ol>{run.history.map((action, i) => <li key={i}><button disabled={busy || editing} onClick={() => setLive(run.decisions[i])}>{ROOM_LABELS[action]}</button></li>)}</ol>
      </aside>
    </div><footer><span>AI / DECISION LAB</span><span>Grid rules determine outcomes. Descriptions provide context.</span></footer>
  </main>;
}
