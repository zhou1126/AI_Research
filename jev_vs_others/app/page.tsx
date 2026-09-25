'use client';
import { useEffect, useRef, useState } from 'react';
import { Chess, DEFAULT_POSITION, candidates, outcome, play, replay, type Candidate, type Decision, type Engine, type Position } from '../lib/chess';
import { LabNavigation } from './components/LabNavigation';
import { Board } from './components/Board';
import { buildChessContext } from '../lib/context';
import { isLearner, MAX_LEARNING_GAMES, reviewLearningGame, type LearningRequest } from '../lib/learning';
import type { LearningSeries, SeriesSettings } from '../lib/series';
import { LearningProgress, LearningMemory } from './components/LearningProgress';
import { BookReferences } from './components/BookReferences';
import { pendingMatches, type PendingMove } from '../lib/heatmap';
const names:Record<Engine,string>={jev:'JEV',mcts:'MCTS',openai:'OpenAI',deepseek:'DeepSeek',random:'Random'};
type Entry={position:Position;decision:Decision;san:string};
type ProviderConfig=Record<string,{configured:boolean;model:string;ragEnabled?:boolean}>;
type Match={white:Engine;black:Engine;whiteLabel:string;blackLabel:string;result:string;reason:string;plies:number;pgn:string;entries:Entry[]};
export default function Home(){
 const [position,setPosition]=useState<Position>({initialFen:DEFAULT_POSITION,moves:[]});
 const positionRef=useRef(position), [white,setWhite]=useState<Engine>('jev'),[black,setBlack]=useState<Engine>('mcts');
 const [config,setConfig]=useState<ProviderConfig>({});
 const [ragEnabled,setRagEnabled]=useState(true),ragChanged=useRef(false);
 const [iterations,setIterations]=useState(200),[depth,setDepth]=useState(12),[seed,setSeed]=useState(42),[limit,setLimit]=useState(160);
 const [busy,setBusy]=useState(false),[running,setRunning]=useState(false),[error,setError]=useState('');
 const [decisions,setDecisions]=useState<Partial<Record<Engine,Decision>>>({}),[view,setView]=useState<Engine>('jev');
 const [analysisPosition,setAnalysisPosition]=useState<Position>(position),[preview,setPreview]=useState<Candidate|null>(null);
 const [entries,setEntries]=useState<Entry[]>([]),entriesRef=useRef<Entry[]>([]),[matches,setMatches]=useState<Match[]>([]);
 const [historyIndex,setHistoryIndex]=useState<number|null>(null),[fenInput,setFenInput]=useState('');
 const [seriesCount,setSeriesCount]=useState('5'),[learnerSide,setLearnerSide]=useState<'w'|'b'>('w');
 const [series,setSeries]=useState<LearningSeries|null>(null),seriesRef=useRef<LearningSeries|null>(null);
 const [pastSeries,setPastSeries]=useState<LearningSeries[]>([]);
 const [mode,setMode]=useState<'manual'|'auto'>('manual');
 const [pending,setPending]=useState<PendingMove|null>(null),pendingRef=useRef<PendingMove|null>(null);
 const [source,setSource]=useState<string|null>(null),[destination,setDestination]=useState<string|null>(null);
 const controller=useRef<AbortController|null>(null),active=useRef(false);
 const game=replay(position), end=outcome(game);
 const visibleEntry=historyIndex===null?null:entries[historyIndex];
 const decision=visibleEntry?.decision ?? decisions[view];
 const inspectedPosition=visibleEntry?.position ?? (decision?analysisPosition:position);
 const inspectedGame=replay(inspectedPosition);
 const rows=decision?.candidates ?? (outcome(inspectedGame)?[]:candidates(inspectedGame));
 const filteredRows=rows.filter(c=>(!source||c.uci.startsWith(source))&&(!destination||c.uci.slice(2,4)===destination));
 const inspecting=!!visibleEntry||!!decision;
 const shownFen=preview?.fen ?? (inspecting?inspectedGame.fen():game.fen());
 const activeEngine=game.turn()==='w'?white:black;
 const canPlayPending=pendingMatches(pending,position,activeEngine);
 const context=decision?.context ?? buildChessContext(inspectedGame);
 const totalVisits=decision?.iterations || 1;
 useEffect(()=>{fetch('/api/config').then(r=>r.json()).then(data=>{const loaded=data as ProviderConfig;setConfig(loaded);if(!ragChanged.current&&!active.current)setRagEnabled(loaded.jev?.ragEnabled??true);}).catch(()=>setError('Could not load provider configuration.'));return()=>controller.current?.abort();},[]);
 function update(p:Position){positionRef.current=p;setPosition(p);}
 function clearPending(){pendingRef.current=null;setPending(null);}
 function clearInspection(){setDecisions({});setPreview(null);setHistoryIndex(null);setSource(null);setDestination(null);clearPending();}
 function changePlayer(side:'white'|'black',engine:Engine){if(active.current)return;if(side==='white')setWhite(engine);else setBlack(engine);clearInspection();setAnalysisPosition(positionRef.current);setView(engine);setError('');}
 function changeRag(){if(active.current||busy)return;ragChanged.current=true;setRagEnabled(value=>!value);clearInspection();setAnalysisPosition(positionRef.current);setError('');}
 function selectSquare(square:string){setPreview(null);if(rows.some(c=>c.uci.startsWith(square))){setSource(source===square?null:square);setDestination(null);}else{setDestination(destination===square?null:square);}}
 function playerLabel(color:'w'|'b',fallback:Engine){const engines=entriesRef.current.filter(e=>{const start=new Chess(e.position.initialFen).turn();const turn=e.position.moves.length%2?(start==='w'?'b':'w'):start;return turn===color;}).map(e=>e.decision.engine);return [...new Set([...engines,fallback])].map(e=>names[e]).join(' / ');}
 function reset(){if(active.current)return;const p={initialFen:DEFAULT_POSITION,moves:[]};update(p);setAnalysisPosition(p);setEntries([]);entriesRef.current=[];clearInspection();setError('');}
 async function analyze(engine:Engine,p:Position,training?:{settings:SeriesSettings;learning?:LearningRequest;gameIndex:number}):Promise<Decision>{
  ragChanged.current=true;
  setAnalysisPosition(p);setHistoryIndex(null);setPreview(null);setSource(null);setDestination(null);setView(engine);
  const c=new AbortController();controller.current=c;
  const settings=training?.settings??{iterations,depth,seed,limit,ragEnabled};
  const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine,position:p,ragEnabled:settings.ragEnabled,learning:training?.learning,options:{iterations:settings.iterations,rolloutDepth:settings.depth,exploration:Math.SQRT2,seed:settings.seed+(training?.gameIndex??0)*10000+p.moves.length}}),signal:c.signal});
  if(!response.ok){const e=await response.json() as {error?:string};throw new Error(e.error || 'Analysis failed.');}
  const reader=response.body!.getReader(), decoder=new TextDecoder();let buffer='',final:Decision|undefined;
  while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});const lines=buffer.split('\n');buffer=lines.pop()!;
   for(const line of lines){if(!line)continue;const event=JSON.parse(line);if(event.type==='error')throw new Error(event.data.message);setDecisions(d=>({...d,[engine]:event.data}));if(event.type==='done')final=event.data;}
   if(done)break;
  }
  if(!final)throw new Error('The response ended before a decision was received.');return final;
 }
 async function withBusy(task:()=>Promise<void>){if(active.current)return;active.current=true;setBusy(true);setError('');try{await task();}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Operation failed.');}finally{active.current=false;setBusy(false);setRunning(false);controller.current=null;}}
 function stop(){active.current=false;controller.current?.abort();setRunning(false);}
 function commit(p:Position,d:Decision){
  if(!pendingMatches({position:p,decision:d},positionRef.current,d.engine))throw new Error('The position changed. Analyze this position again.');
  const g=replay(p),move=play(g,d.move),entry={position:p,decision:d,san:move.san};
  entriesRef.current=[...entriesRef.current,entry];setEntries(entriesRef.current);
  const next={...p,moves:[...p.moves,d.move]};update(next);setAnalysisPosition(next);clearInspection();
 }
 async function prepareStep(){await withBusy(async()=>{clearInspection();const p=positionRef.current,g=replay(p);if(outcome(g))return;
  const d=await analyze(g.turn()==='w'?white:black,p);if(!active.current)return;
  const ready={position:p,decision:d};pendingRef.current=ready;setPending(ready);
 });}
 function playStep(){const ready=pendingRef.current;if(!ready||busy)return;const g=replay(positionRef.current),engine=g.turn()==='w'?white:black;
  if(!pendingMatches(ready,positionRef.current,engine)){clearPending();setError('Player or position changed. Analyze the move again.');return;}
  commit(ready.position,ready.decision);
  const result=outcome(replay(positionRef.current));
  if(result){const g=replay(positionRef.current);const wl=playerLabel('w',white),bl=playerLabel('b',black);g.setHeader('White',wl);g.setHeader('Black',bl);g.setHeader('Result',result.result);
   setMatches(m=>[...m,{white,black,whiteLabel:wl,blackLabel:bl,...result,plies:entriesRef.current.length,pgn:g.pgn(),entries:[...entriesRef.current]}]);}
 }
 async function turn(w:Engine,b:Engine){const p=positionRef.current,g=replay(p);if(outcome(g))return;const engine=g.turn()==='w'?w:b;
  const cached=pendingRef.current;let d:Decision;
  if(pendingMatches(cached,p,engine))d=cached!.decision;else{clearInspection();d=await analyze(engine,p);}
  if(!active.current)return;commit(p,d);
 }
 async function run(paired=false){await withBusy(async()=>{setRunning(true);setMode('auto');const start=positionRef.current;
  for(let round=0;round<(paired?2:1)&&active.current;round++){
   const w=round===1?black:white,b=round===1?white:black;
   if(paired){clearInspection();setWhite(w);setBlack(b);update({initialFen:start.initialFen,moves:[...start.moves]});entriesRef.current=[];setEntries([]);}
   while(active.current&&!outcome(replay(positionRef.current))&&positionRef.current.moves.length-start.moves.length<limit){await turn(w,b);await new Promise(r=>setTimeout(r,180));}
   if(!active.current)break;
   const g=replay(positionRef.current),result=outcome(g);const wl=playerLabel('w',w),bl=playerLabel('b',b);g.setHeader('White',wl);g.setHeader('Black',bl);g.setHeader('Result',result?.result||'*');
   setMatches(m=>[...m,{white:w,black:b,whiteLabel:wl,blackLabel:bl,result:result?.result||'*',reason:result?.reason||'Ply limit · unfinished',plies:positionRef.current.moves.length-start.moves.length,pgn:g.pgn(),entries:[...entriesRef.current]}]);
  }
 });}
 function saveSeries(next:LearningSeries){seriesRef.current=next;setSeries(next);}
 async function runLearningSeries(resume=false){await withBusy(async()=>{
  let current=resume?seriesRef.current:null;
  if(!current){
   const learner=learnerSide==='w'?white:black,opponent=learnerSide==='w'?black:white,target=Number(seriesCount);
   if(!isLearner(learner))throw new Error('Choose JEV, OpenAI or DeepSeek as the learner.');
   if(!Number.isInteger(target)||target<1||target>MAX_LEARNING_GAMES)throw new Error(`Choose 1–${MAX_LEARNING_GAMES} games.`);
   const initialFen=positionRef.current.initialFen;
   if(outcome(new Chess(initialFen)))throw new Error('The starting position has already ended. Load a playable starting position.');
   const previousSeries=seriesRef.current;if(previousSeries)setPastSeries(history=>[...history,previousSeries]);
   current={id:new Date().toISOString(),target,learner,opponent,firstColor:learnerSide,initialFen,settings:{iterations,depth,seed,limit,ragEnabled},status:'running',games:[],current:{initialFen,moves:[]},currentEntries:[]};
  }
  if(current.status==='complete')return;
  let session:LearningSeries={...current,status:'running'};
  saveSeries(session);setRunning(true);setMode('auto');clearInspection();
  setRagEnabled(session.settings.ragEnabled);ragChanged.current=true;setIterations(session.settings.iterations);setDepth(session.settings.depth);setSeed(session.settings.seed);setLimit(session.settings.limit);
  try{
   while(active.current&&session.games.length<session.target){
    const gameIndex=session.games.length,color=gameIndex%2?(session.firstColor==='w'?'b':'w'):session.firstColor;
    const w=color==='w'?session.learner:session.opponent,b=color==='b'?session.learner:session.opponent;
    setWhite(w);setBlack(b);update(session.current);setAnalysisPosition(session.current);entriesRef.current=[...session.currentEntries];setEntries(entriesRef.current);clearInspection();
    while(active.current&&!outcome(replay(positionRef.current))&&positionRef.current.moves.length<session.settings.limit){
     const p=positionRef.current,g=replay(p),engine=g.turn()==='w'?w:b;
     const learning:LearningRequest|undefined=g.turn()===color?{learner:session.learner,learnerColor:color,plyLimit:session.settings.limit,games:session.games.map(item=>item.record)}:undefined;
     const d=await analyze(engine,p,{settings:session.settings,learning,gameIndex});
     if(!active.current)break;
     commit(p,d);session={...session,current:positionRef.current,currentEntries:[...entriesRef.current]};saveSeries(session);
     await new Promise(r=>setTimeout(r,180));
    }
    if(!active.current)break;
    const record={position:session.current,learnerColor:color,opponent:session.opponent};
    const review=reviewLearningGame(record,gameIndex+1),g=replay(session.current),result=outcome(g);
    g.setHeader('White',names[w]);g.setHeader('Black',names[b]);g.setHeader('Result',result?.result||'*');
    const pgn=g.pgn(),completed={record,review,entries:[...session.currentEntries],pgn};
    setMatches(history=>[...history,{white:w,black:b,whiteLabel:names[w],blackLabel:names[b],result:result?.result||'*',reason:`Learning game ${gameIndex+1} · ${review.reason} · learner deficit ${review.material.deficit}`,plies:review.plies,pgn,entries:completed.entries}]);
    const games=[...session.games,completed];
    session={...session,games,status:games.length===session.target?'complete':'running',current:games.length===session.target?session.current:{initialFen:session.initialFen,moves:[]},currentEntries:games.length===session.target?session.currentEntries:[]};saveSeries(session);
   }
  }catch(e){if(active.current)throw e;}finally{if(session.status!=='complete')saveSeries({...session,status:'paused'});}
 });}
 function download(kind:'json'|'pgn'){const g=replay(position);g.setHeader('White',playerLabel('w',white));g.setHeader('Black',playerLabel('b',black));g.setHeader('Result',end?.result||'*');const content=kind==='json'?JSON.stringify({version:1,settings:{white,black,ragEnabled,iterations,rolloutDepth:depth,exploration:Math.SQRT2,seed,plyLimit:limit,drawPolicy:'Always claim threefold and fifty-move draws'},position,result:end,entries,matches,learningSeries:series,pastLearningSeries:pastSeries},null,2):g.pgn();const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:kind==='json'?'application/json':'application/x-chess-pgn'}));a.download=`chess-lab.${kind}`;a.click();URL.revokeObjectURL(a.href);}
 function modelName(engine:Engine){return engine==='mcts'?'UCT search':engine==='random'?'Uniform baseline':config[engine]?.model || (config[engine]?'Model not configured':'Loading model...');}
 function engineSelect(value:Engine,onChange:(x:Engine)=>void,label:string){return <label className="engine-select"><span>{label}</span><select disabled={busy} value={value} onChange={e=>onChange(e.target.value as Engine)}>{Object.entries(names).map(([key,name])=><option key={key} value={key}>{name}{config[key]?.model?` / ${config[key].model}`:''}{config[key]&&!config[key].configured?' · not configured':''}</option>)}</select><small className="selected-model">{modelName(value)}</small></label>;}
 return <main>
  <header><a className="brand" href="/"><span>AI<span className="brand-light"> / DECISION LAB</span></span></a><span className="header-note"><i/> Legal moves enforced</span></header>
  <LabNavigation active="chess"/>
  <section className="intro"><div><h1>Chess decision lab</h1><p className="subtitle">Compare AI choices. Inspect every legal move.</p></div><div className="model-catalog" aria-label="Configured language models">{(['openai','deepseek'] as const).map(engine=><div key={engine}><span>{names[engine]}</span><code>{modelName(engine)}</code></div>)}</div></section>
  <section className="workspace">
   <aside className="setup panel"><div className="panel-heading"><h2>Match setup</h2><span className="tag">STANDARD</span></div>
    {engineSelect(white,e=>changePlayer('white',e),'WHITE')}{engineSelect(black,e=>changePlayer('black',e),'BLACK')}<p className="fine">Change either player while paused. The board and full history are preserved; any pending decision is discarded.</p>
    <div className="provider-status">{[...new Set([white,black])].map(e=><p key={e}><i className={config[e]?.configured||e==='mcts'||e==='random'?'ready':''}/>{names[e]} <span>{e==='mcts'||e==='random'?'local':config[e]?.configured?'key loaded':'not configured'}</span></p>)}</div>
    <div className="rag-setting"><button type="button" role="switch" aria-checked={ragEnabled} aria-label="Use book references (RAG)" aria-describedby="rag-help" disabled={busy} onClick={changeRag}><span>Book references (RAG)</span><span className="rag-switch" aria-hidden="true"/><strong>{ragEnabled?'On':'Off'}</strong></button><p id="rag-help" className="fine">For JEV and DeepSeek. Change while paused; any pending analysis is discarded.</p></div>
    <div className="piece-values"><h3>Goal: win by checkmate</h3><p>P 1 / N 3 / B 3 / R 5 / Q 9</p><small>King: priceless. JEV, LLMs and MCTS share these values. Material is secondary to winning.</small></div><div className="divider"/><h3>Search budget</h3><label className="setting">Simulations <strong>{iterations}</strong><input aria-label="MCTS simulations" type="range" min="25" max="1000" step="25" value={iterations} disabled={busy} onChange={e=>setIterations(+e.target.value)}/></label>
    <div className="input-pair"><label>Rollout plies<input type="number" min="1" max="60" value={depth} disabled={busy} onChange={e=>setDepth(Math.max(1,Math.min(60,+e.target.value)))}/></label><label>Random seed<input type="number" min="0" max="100000" value={seed} disabled={busy} onChange={e=>setSeed(Math.max(0,+e.target.value))}/></label></div>
    <label className="setting">Match ply limit<input type="number" min="2" max="1000" value={limit} disabled={busy} onChange={e=>setLimit(Math.max(2,Math.min(1000,+e.target.value)))}/></label>
    <p className="fine">UCT exploration: √2. A ply is one player's move. Reaching the limit leaves a game unfinished.</p>
    <div className="divider"/><button className="wide" disabled={busy||!!end} onClick={()=>withBusy(async()=>{clearInspection();const p=positionRef.current;await analyze(white,p);if(black!==white&&active.current)await analyze(black,p);})}>Compare this position ↗</button><button className="wide ghost" disabled={busy||!!end} onClick={()=>run(true)}>Run color-swapped pair</button><p className="fine">API opponents use your account credits. Paired games share the starting position and search settings.</p>
    <div className="divider"/><h3>Learn across games</h3>
    <label className="setting">Learning player<select aria-label="Learning player" disabled={busy} value={learnerSide} onChange={e=>setLearnerSide(e.target.value as 'w'|'b')}><option value="w">White selection · {names[white]}</option><option value="b">Black selection · {names[black]}</option></select></label>
    <label className="setting">Number of learning games<input aria-label="Number of learning games" type="number" min="1" max={MAX_LEARNING_GAMES} step="1" disabled={busy} value={seriesCount} onChange={e=>setSeriesCount(e.target.value)}/></label>
    <button className="wide" disabled={busy||!isLearner(learnerSide==='w'?white:black)||!Number.isInteger(Number(seriesCount))||Number(seriesCount)<1||Number(seriesCount)>MAX_LEARNING_GAMES} onClick={()=>runLearningSeries()}>Run learning series</button>
    {series?.status==='paused'&&<button className="wide" disabled={busy} onClick={()=>runLearningSeries(true)}>Resume learning series</button>}
    <p className="fine">1–{MAX_LEARNING_GAMES} fresh games from the loaded starting FEN, alternating colors. The selected learner receives all earlier game reports; the opponent receives no learning memory. Uses the match ply limit. Book RAG is separate. Each move uses API credits; model weights stay unchanged. Resume restores saved series settings.</p>
   </aside>
   <section className="board-area"><div className="board-stage"><div className="player-strip"><div className="avatar black-avatar">♚</div><div><strong>{names[black]}</strong><span className="player-model">{modelName(black)}</span></div><span className="turn-pill">{game.turn()==='b'&&!end?'TO MOVE':'BLACK'}</span></div>
    <div className="board-wrap"><Board fen={shownFen} highlight={preview?.uci ?? (decision?.move || entries.at(-1)?.decision.move)} moves={preview?[]:rows} source={source} destination={destination} onSquare={selectSquare}/>{(preview||visibleEntry)&&<div className="preview-banner">{preview?`Candidate preview: ${preview.san}`:`Decision before ${visibleEntry?.san}`}<button onClick={()=>{if(preview)setPreview(null);else{setHistoryIndex(null);setSource(null);setDestination(null);}}}>{preview?'Back to legal moves':'Return to live board'}</button></div>}</div>

    <div className="player-strip"><div className="avatar white-avatar">♚</div><div><strong>{names[white]}</strong><span className="player-model">{modelName(white)}</span></div><span className="turn-pill">{game.turn()==='w'&&!end?'TO MOVE':'WHITE'}</span></div>
    <div className="game-status" aria-live="polite"><i className={busy?'pulse':''}/>{busy?`Analyzing ${names[view]}…`:end?`${end.result} · ${end.reason}`:game.inCheck()?'Check · a legal response is required':`Move ${Math.floor(position.moves.length/2)+1} · ${game.turn()==='w'?'White':'Black'} to play`}<span>{game.moves().length} legal moves</span></div>
    <div className="turn-toolbar" aria-label="Turn controls">
    <div className="mode-switch" role="group" aria-label="Play mode"><button aria-pressed={mode==='manual'} disabled={busy} className={mode==='manual'?'selected':''} onClick={()=>setMode('manual')}>Step-by-step</button><button aria-pressed={mode==='auto'} disabled={busy} className={mode==='auto'?'selected':''} onClick={()=>setMode('auto')}>Automatic</button></div>

    <div className="play-controls">{mode==='manual'?<button className="primary" disabled={busy||!!end} onClick={()=>canPlayPending?playStep():prepareStep()}>{canPlayPending?`Play ${pending?.decision.candidates.find(c=>c.uci===pending.decision.move)?.san}`:'Analyze next move'}</button>:<button className="primary" disabled={busy||!!end} onClick={()=>run()}>Play match</button>}<button disabled={!busy} onClick={stop}>{running?'Pause':'Cancel'}</button><button disabled={busy} onClick={reset} aria-label="Reset game">Reset</button></div>
    </div>
    {error&&<div className="error" role="alert">{error}</div>}
    </div>
    <details className="board-guide"><summary>How to read the board & step controls</summary>
    <div className="heat-legend"><span className="heat-gradient"/><span>{decision?.engine==='mcts'?'Light to dark green: lower to higher visit share':rows.some(c=>c.probability!==undefined)?'Light to dark green: lower to higher choice probability':'Green: legal destinations (not scored)'}</span></div>
    <p className="board-help">Select a piece to isolate its moves. Click a green destination to inspect its candidates. Weights on a shared square are added; shading is relative to the largest visible weight.</p>
    {(source||destination)&&<div className="board-filter">{source?`From ${source}`:'All pieces'}{destination?` to ${destination}`:''}<button onClick={()=>{setSource(null);setDestination(null);setPreview(null);}}>Show all legal moves</button></div>}
    <p className="step-instructions">{mode==='manual'?(canPlayPending?'Review the green squares, then play the chosen move. No second API call is made.':'1. Analyze the next move. 2. Inspect the green candidate squares. 3. Click Play to advance one ply.'):'Automatic mode analyzes and plays each turn. Pause to change players or inspect a position.'}</p>
    </details>
    <details className="position-details"><summary>Starting position & rules</summary><p>Standard chess: castling, en passant, check restrictions and all four promotions. Both AIs claim threefold-repetition and 50-move draws. No chess clock.</p><p>Common insufficient-material draws are detected; exotic dead positions are not exhaustively solved.</p><label>Custom starting FEN<input value={fenInput} onChange={e=>setFenInput(e.target.value)} placeholder={DEFAULT_POSITION}/></label><button disabled={busy} onClick={()=>{try{const g=new Chess(fenInput);reset();const p={initialFen:g.fen(),moves:[]};update(p);setAnalysisPosition(p);}catch{setError('Invalid FEN. Please check the position.');}}}>Load position</button></details>
   </section>
   <aside className="inspector panel"><div className="panel-heading"><h2>Inside the decision</h2><span className="tag">{busy?'LIVE':'INSPECT'}</span></div>
    <div className="tabs">{[...new Set([white,black])].map(e=><button key={e} className={view===e?'selected':''} onClick={()=>{setView(e);setHistoryIndex(null);setPreview(null);setSource(null);setDestination(null);}}>{names[e]}</button>)}</div>
    <div className="decision-summary"><p className="eyebrow">{decision?'SELECTED CANDIDATE':'READY TO EXPLORE'}</p><strong>{decision?rows.find(c=>c.uci===decision.move)?.san:'—'} <small>{decision?decision.move:'Run a step or compare'}</small></strong><div className="summary-meta"><span>{rows.length} legal candidates</span><span>{decision?`${(decision.elapsedMs/1000).toFixed(2)} s`:'No analysis yet'}</span></div></div>
    <div className="decision-model"><span>{decision?.model?'Returned model':'Configured model'}</span><code>{decision?.model || modelName(visibleEntry?.decision.engine ?? view)}</code></div><p className="inspection-context">Candidates before ply {inspectedPosition.moves.length+1} · {inspectedGame.turn()==='w'?'White':'Black'} to move</p><p className="metric-note">{decision?.engine==='mcts'?'Visit share · heuristic value · UCT':decision?.engine==='jev'?'JEV choice probability · raw API values':decision?.engine==='random'?'Uniform selection probability':decision?'Legal candidates · no probabilities supplied':'Select a candidate to preview its resulting position.'}</p>
    <div className="candidates">{filteredRows.map((c,i)=>{const fraction=c.probability??(c.visits===undefined?0:c.visits/totalVisits);return <button className={`candidate ${c.uci===decision?.move?'chosen':''} ${preview?.uci===c.uci?'previewing':''}`} key={c.uci} onClick={()=>setPreview(preview?.uci===c.uci?null:c)}><span className="candidate-index">{String(i+1).padStart(2,'0')}</span><span className="candidate-main"><span><b>{c.san}</b><small>{c.uci}</small></span><span className="bar"><span style={{width:`${fraction*100}%`}}/></span></span><span className="candidate-value">{c.probability!==undefined?`${(c.probability*100).toFixed(1)}%`:c.visits!==undefined?`${c.visits} visits`:'↗'}{c.value!==undefined&&<small>Q {c.value.toFixed(3)} · UCT {c.uct?.toFixed(2)}</small>}</span></button>})}</div>
    {decision?.engine==='mcts'&&<div className="search-trace"><h3>Search in motion <span>{decision.iterations} simulations</span></h3><p>Selection → Expansion → Rollout → Backpropagation</p><div className="path"><span>Root</span>{decision.path?.map((p,i)=><span key={i}>→ {p}</span>)}</div><p>Latest tree path (before rollout)</p><div className="timeline">{decision.snapshots?.slice(-6).map(s=><span key={s.iteration}><b>{s.iteration}</b>{s.leader}<small>{s.visits} visits</small></span>)}</div></div>}
    <LearningMemory learning={decision?.context?.learning}/>
    <BookReferences references={decision?.context?.references}/>
    <details className="model-context"><summary>{decision?.context?'Exact context sent to the model':'Position context & history'}</summary><p>{context.history.length} plies from starting FEN / White material {context.material.white} / Black material {context.material.black}</p><p>{context.history_san.length?context.pgn:'Starting position; no moves yet.'}</p><p>Shared values: pawn 1, knight 3, bishop 3, rook 5, queen 9. King is priceless.</p><pre>{JSON.stringify(context,null,2)}</pre></details>
    <div className="explanation"><h3>How to read this</h3><p>{decision?.explanation||'The rules engine generates every legal move first. The chosen AI evaluates those candidates. A move is validated again before it reaches the board.'}</p>{decision?.model&&<code>{decision.model}</code>}</div>
   </aside>
  </section>
  <LearningProgress series={series}/>
  <section className="records"><div className="panel history"><div className="panel-heading"><h2>Move journal <span>{entries.length} plies</span></h2><div><button onClick={()=>download('pgn')}>↓ PGN</button><button onClick={()=>download('json')}>↓ Decision JSON</button></div></div>{entries.length?<div className="move-list">{entries.map((e,i)=><button key={i} className={historyIndex===i?'selected':''} onClick={()=>{setHistoryIndex(i);setPreview(null);setSource(null);setDestination(null);setView(e.decision.engine);}}><small>{Math.floor((e.position.moves.length)/2)+1}{e.position.moves.length%2?'…':'.'}</small><b>{e.san}</b><span>{names[e.decision.engine]}</span><small>{(e.decision.elapsedMs/1000).toFixed(1)}s</small></button>)}</div>:<p className="empty">Your first move starts the journal. Select any recorded move to revisit its decision.</p>}</div><div className="panel results"><div className="panel-heading"><h2>Match results</h2><span className="tag">{matches.length} GAMES</span></div>{matches.length?matches.map((m,i)=><div className="result-row" key={i}><span>{m.whiteLabel} <small>vs</small> {m.blackLabel}<small>{m.reason} · {m.plies} plies</small></span><b>{m.result}</b></div>):<p className="empty">Completed and capped matches appear here. Color-swapped pairs help reveal first-move effects.</p>}</div></section>
  <footer><span>AI / DECISION LAB</span><span>Probabilities describe choices. Search scores estimate positions. Neither guarantees a win.</span></footer>
 </main>;
}
