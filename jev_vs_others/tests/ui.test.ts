import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create,act,type ReactTestRenderer,type ReactTestInstance } from 'react-test-renderer';
import Home from '../app/page';
import { Board } from '../app/components/Board';
import { candidates,replay,DEFAULT_POSITION,type Engine,type Position } from '../lib/chess';
import { buildChessContext } from '../lib/context';
import { retrieveChessReferences } from '../lib/retrieval';
(globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const label=(node:ReactTestInstance):string=>node.children.map(child=>typeof child==='string'?child:label(child)).join('');
function button(renderer:ReactTestRenderer,text:string){return renderer.root.findAllByType('button').find(n=>label(n)===text)!;}
function response(engine:Engine,position:Position,ragEnabled=true){const game=replay(position),legal=candidates(game),preferred=game.turn()==='w'?'e2e4':'e7e5',move=legal.some(c=>c.uci===preferred)?preferred:legal[0].uci;
 return new Response(JSON.stringify({type:'done',data:{engine,move,elapsedMs:1,explanation:'fixture',context:buildChessContext(game,engine==='jev'||engine==='deepseek'?retrieveChessReferences(game,ragEnabled):undefined),candidates:legal.map(c=>({...c,probability:c.uci===move?.8:.2/(legal.length-1)}))}})+'\n');}
const config=()=>Response.json({jev:{configured:true,model:'fixture'},openai:{configured:true,model:'openai-test-model'},deepseek:{configured:true,model:'deepseek-test-model'}});

test('actual player controls remain selectable after moves; manual analysis previews without playing or paying twice',async()=>{
 const original=globalThis.fetch;const requests:{engine:Engine;position:Position}[]=[];let renderer!:ReactTestRenderer;
 globalThis.fetch=async(url,init)=>{if(String(url)==='/api/config')return config();const request=JSON.parse(init!.body as string);requests.push(request);return response(request.engine,request.position);};
 try{
  await act(async()=>{renderer=create(React.createElement(Home));});
  assert.ok(renderer.root.findAllByType('select').every(n=>!n.props.disabled));
  const models=label(renderer.root.findByProps({className:'model-catalog'}));
  assert.match(models,/openai-test-model/);assert.match(models,/deepseek-test-model/);
  const stage=renderer.root.findByProps({className:'board-stage'});
  assert.equal(stage.findAllByType(Board).length,1);
  assert.equal(stage.findByProps({'aria-label':'Turn controls'}).findAllByType('button').length,5);
  await act(async()=>{await button(renderer,'Analyze next move').props.onClick();});
  assert.equal(requests.length,1);assert.equal(renderer.root.findByType(Board).props.fen,DEFAULT_POSITION);
  assert.ok(button(renderer,'Play e4'));
  const references=renderer.root.findByProps({className:'model-context book-references'});
  assert.match(label(references),/Book references supplied/);
  assert.match(label(references),/Exact position match/);
  assert.ok(references.findAllByType('a').some(a=>a.props.href.includes('gutenberg.org')));
  const colored=renderer.root.findAllByType('button').filter(n=>n.props.className?.includes('legal-target'));
  assert.ok(colored.length>0);assert.ok(new Set(colored.map(n=>n.props.style.backgroundColor)).size>1);
  const knight=renderer.root.findAllByType('button').find(n=>n.props['aria-label']?.startsWith('g1, White knight'))!;
  await act(async()=>{knight.props.onClick();});assert.equal(renderer.root.findByType(Board).props.source,'g1');
  await act(async()=>{button(renderer,'Play e4').props.onClick();});
  assert.equal(requests.length,1);assert.equal(new (await import('../lib/chess')).Chess(renderer.root.findByType(Board).props.fen).turn(),'b');
  assert.ok(renderer.root.findAllByType('select').every(n=>!n.props.disabled),'selection must work after the first move');
  const previousFen=renderer.root.findByType(Board).props.fen;
  await act(async()=>{renderer.root.findAllByType('select')[1].props.onChange({target:{value:'deepseek'}});});
  assert.equal(renderer.root.findAllByType('select')[1].props.value,'deepseek');assert.equal(renderer.root.findByType(Board).props.fen,previousFen);
  await act(async()=>{await button(renderer,'Analyze next move').props.onClick();});
  assert.equal(requests[1].engine,'deepseek');assert.deepEqual(requests[1].position.moves,['e2e4']);assert.ok(button(renderer,'Play e5'));
  await act(async()=>{renderer.root.findAllByType('select')[1].props.onChange({target:{value:'mcts'}});});
  assert.ok(button(renderer,'Analyze next move'));assert.equal(button(renderer,'Play e5'),undefined);
  await act(async()=>{await button(renderer,'Analyze next move').props.onClick();});assert.equal(requests[2].engine,'mcts');
  await act(async()=>{button(renderer,'Play e5').props.onClick();});assert.equal(requests.length,3);
 }finally{await act(async()=>renderer?.unmount());globalThis.fetch=original;}
});

test('automatic mode advances without manual confirmation and returns player controls at the cap',async()=>{
 const original=globalThis.fetch;let renderer!:ReactTestRenderer;let calls=0;
 globalThis.fetch=async(url,init)=>{if(String(url)==='/api/config')return config();calls++;const r=JSON.parse(init!.body as string);return response(r.engine,r.position);};
 try{
  await act(async()=>{renderer=create(React.createElement(Home));});
  await act(async()=>{renderer.root.findAllByType('input').find(n=>n.props.value===160)!.props.onChange({target:{value:'2'}});button(renderer,'Automatic').props.onClick();});
  await act(async()=>{await button(renderer,'Play match').props.onClick();});
  assert.equal(calls,2);assert.equal(renderer.root.findAllByProps({className:'move-list'})[0].findAllByType('button').length,2);
  assert.ok(renderer.root.findAllByType('select').every(n=>!n.props.disabled));
  assert.match(label(renderer.root.findByProps({className:'panel results'})),/unfinished/);
 }finally{await act(async()=>renderer?.unmount());globalThis.fetch=original;}
});

test('cancel leaves the board unchanged and re-enables player selection',async()=>{
 const original=globalThis.fetch;let renderer!:ReactTestRenderer;let task:Promise<void>|undefined;
 globalThis.fetch=async(url,init)=>{if(String(url)==='/api/config')return config();return new Promise((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));});};
 try{
  await act(async()=>{renderer=create(React.createElement(Home));});
  await act(async()=>{task=button(renderer,'Analyze next move').props.onClick();});
  assert.ok(renderer.root.findAllByType('select').every(n=>n.props.disabled));
  await act(async()=>{button(renderer,'Cancel').props.onClick();await task;});
  assert.equal(renderer.root.findByType(Board).props.fen,DEFAULT_POSITION);assert.ok(renderer.root.findAllByType('select').every(n=>!n.props.disabled));
 }finally{await act(async()=>renderer?.unmount());globalThis.fetch=original;}
});

test('RAG switch honors default, clears pending analysis, preserves board, and reaches manual and comparison requests',async()=>{
 const original=globalThis.fetch;const requests:{engine:Engine;position:Position;ragEnabled:boolean}[]=[];let renderer!:ReactTestRenderer;
 globalThis.fetch=async(url,init)=>{
  if(String(url)==='/api/config'){const data=await config().json() as Record<string,{configured:boolean;model:string;ragEnabled?:boolean}>;data.jev.ragEnabled=false;return Response.json(data);}
  const r=JSON.parse(init!.body as string);requests.push(r);return response(r.engine,r.position,r.ragEnabled);
 };
 try{
  await act(async()=>{renderer=create(React.createElement(Home));});
  const toggle=()=>renderer.root.findByProps({role:'switch'});
  assert.equal(toggle().props['aria-checked'],false);
  await act(async()=>{await button(renderer,'Analyze next move').props.onClick();});
  assert.equal(requests[0].ragEnabled,false);assert.ok(button(renderer,'Play e4'));
  assert.match(label(renderer.root.findByProps({className:'model-context book-references'})),/off/);
  await act(async()=>{toggle().props.onClick();});
  assert.equal(toggle().props['aria-checked'],true);assert.equal(button(renderer,'Play e4'),undefined);
  assert.equal(renderer.root.findByType(Board).props.fen,DEFAULT_POSITION);assert.equal(requests.length,1);
  await act(async()=>{await button(renderer,'Analyze next move').props.onClick();});
  assert.equal(requests[1].ragEnabled,true);
  await act(async()=>{button(renderer,'Play e4').props.onClick();});
  const fen=renderer.root.findByType(Board).props.fen;
  await act(async()=>{toggle().props.onClick();});
  assert.equal(renderer.root.findByType(Board).props.fen,fen);
  assert.equal(renderer.root.findByProps({className:'move-list'}).findAllByType('button').length,1);
  await act(async()=>{await button(renderer,'Compare this position ↗').props.onClick();});
  assert.deepEqual(requests.slice(2).map(r=>r.ragEnabled),[false,false]);
 }finally{await act(async()=>renderer?.unmount());globalThis.fetch=original;}
});

test('learning series resets each game, alternates colors, and sends all earlier games only to the learner',async()=>{
 const original=globalThis.fetch;let renderer!:ReactTestRenderer;const requests:any[]=[];
 globalThis.fetch=async(url,init)=>{if(String(url)==='/api/config')return config();const r=JSON.parse(init!.body as string);requests.push(r);return response(r.engine,r.position,r.ragEnabled);};
 try{
  await act(async()=>{renderer=create(React.createElement(Home));});
  await act(async()=>{
   renderer.root.findByProps({'aria-label':'Number of learning games'}).props.onChange({target:{value:'3'}});
   renderer.root.findAllByType('input').find(n=>n.props.value===160)!.props.onChange({target:{value:'2'}});
   renderer.root.findByProps({role:'switch'}).props.onClick();
  });
  await act(async()=>{await button(renderer,'Run learning series').props.onClick();});
  assert.equal(requests.length,6);
  assert.deepEqual(requests.map(r=>r.engine),['jev','mcts','mcts','jev','jev','mcts']);
  assert.deepEqual(requests.map(r=>r.position.moves.length),[0,1,0,1,0,1]);
  const learners=requests.filter(r=>r.learning);
  assert.deepEqual(learners.map(r=>r.learning.games.length),[0,1,2]);
  assert.deepEqual(learners.map(r=>r.learning.learnerColor),['w','b','w']);
  assert.deepEqual(learners[2].learning.games.map((g:any)=>g.learnerColor),['w','b']);
  assert.ok(requests.filter(r=>r.engine==='mcts').every(r=>r.learning===undefined));
  assert.ok(requests.every(r=>r.ragEnabled===false));
  assert.equal(new Set(requests.map(r=>r.options.seed)).size,6);
  const progress=renderer.root.findByProps({'aria-label':'Learning series progress'});
  assert.match(label(progress),/3 \/ 3 games finished · complete/);
  assert.equal(progress.findAllByType('details').length,3);
  assert.ok(progress.findAllByType('summary').every(s=>label(s).includes('unfinished')&&label(s).includes('deficit 0')));
  await act(async()=>{renderer.root.findByProps({'aria-label':'Number of learning games'}).props.onChange({target:{value:'1'}});});
  await act(async()=>{await button(renderer,'Run learning series').props.onClick();});
  assert.equal(requests[6].learning.games.length,0,'new series must start with fresh memory');
 }finally{await act(async()=>renderer?.unmount());globalThis.fetch=original;}
});

test('pausing a series preserves earlier games and resumes the interrupted game without a false result',async()=>{
 const original=globalThis.fetch;let renderer!:ReactTestRenderer;const requests:any[]=[];let task:Promise<void>|undefined;
 globalThis.fetch=async(url,init)=>{
  if(String(url)==='/api/config')return config();const r=JSON.parse(init!.body as string);requests.push(r);
  if(requests.length===3)return new Promise((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));});
  return response(r.engine,r.position,r.ragEnabled);
 };
 try{
  await act(async()=>{renderer=create(React.createElement(Home));});
  await act(async()=>{
   renderer.root.findByProps({'aria-label':'Number of learning games'}).props.onChange({target:{value:'2'}});
   renderer.root.findAllByType('input').find(n=>n.props.value===160)!.props.onChange({target:{value:'2'}});
  });
  await act(async()=>{
   task=button(renderer,'Run learning series').props.onClick();
   for(let i=0;i<40&&requests.length<3;i++)await new Promise(r=>setTimeout(r,25));
  });
  assert.equal(requests.length,3);
  assert.equal(renderer.root.findByProps({'aria-label':'Number of learning games'}).props.disabled,true);
  await act(async()=>{button(renderer,'Pause').props.onClick();await task;});
  let progress=renderer.root.findByProps({'aria-label':'Learning series progress'});
  assert.match(label(progress),/1 \/ 2 games finished · paused/);
  assert.equal(progress.findAllByType('details').length,1);
  await act(async()=>{await button(renderer,'Resume learning series').props.onClick();});
  assert.equal(requests.length,5);assert.deepEqual(requests[3].position.moves,[]);
  assert.equal(requests[4].learning.games.length,1);
  progress=renderer.root.findByProps({'aria-label':'Learning series progress'});
  assert.match(label(progress),/2 \/ 2 games finished · complete/);
  assert.equal(progress.findAllByType('details').length,2);
 }finally{await act(async()=>renderer?.unmount());globalThis.fetch=original;}
});

test('learning series stops each game at mate, restarts, and keeps learner identity when colors swap',async()=>{
 const original=globalThis.fetch;let renderer!:ReactTestRenderer;const requests:any[]=[];
 const mate=['f2f3','e7e5','g2g4','d8h4'];
 globalThis.fetch=async(url,init)=>{
  if(String(url)==='/api/config')return config();const r=JSON.parse(init!.body as string);requests.push(r);
  const g=replay(r.position),move=mate[r.position.moves.length];
  return new Response(JSON.stringify({type:'done',data:{engine:r.engine,move,candidates:candidates(g),elapsedMs:1,explanation:'Fixture'}})+'\n');
 };
 try{
  await act(async()=>{renderer=create(React.createElement(Home));});
  await act(async()=>{
   renderer.root.findAllByType('select')[0].props.onChange({target:{value:'mcts'}});
   renderer.root.findAllByType('select')[1].props.onChange({target:{value:'deepseek'}});
   renderer.root.findByProps({'aria-label':'Learning player'}).props.onChange({target:{value:'b'}});
   renderer.root.findByProps({'aria-label':'Number of learning games'}).props.onChange({target:{value:'2'}});
  });
  await act(async()=>{await button(renderer,'Run learning series').props.onClick();});
  assert.equal(requests.length,8);
  assert.deepEqual(requests.map(r=>r.position.moves.length),[0,1,2,3,0,1,2,3]);
  assert.ok(requests.filter(r=>r.learning).every(r=>r.engine==='deepseek'));
  assert.deepEqual(requests.filter(r=>r.learning).map(r=>r.learning.games.length),[0,0,1,1]);
  const reports=renderer.root.findByProps({'aria-label':'Learning series progress'}).findAllByType('summary').map(label);
  assert.match(reports[0],/Black · win/);assert.match(reports[1],/White · loss/);
  assert.ok(!reports.some(r=>r.includes('unfinished')));
 }finally{await act(async()=>renderer?.unmount());globalThis.fetch=original;}
});

test('a provider failure pauses the series without counting a partial game or retrying automatically',async()=>{
 const original=globalThis.fetch;let renderer!:ReactTestRenderer;let calls=0;
 globalThis.fetch=async(url,init)=>{
  if(String(url)==='/api/config')return config();calls++;const r=JSON.parse(init!.body as string);
  if(calls===2)return Response.json({error:'Fixture provider failure'},{status:502});
  return response(r.engine,r.position,r.ragEnabled);
 };
 try{
  await act(async()=>{renderer=create(React.createElement(Home));});
  await act(async()=>{
   renderer.root.findByProps({'aria-label':'Number of learning games'}).props.onChange({target:{value:'1'}});
   renderer.root.findAllByType('input').find(n=>n.props.value===160)!.props.onChange({target:{value:'2'}});
  });
  await act(async()=>{await button(renderer,'Run learning series').props.onClick();});
  assert.equal(calls,2);
  assert.match(label(renderer.root.findByProps({'aria-label':'Learning series progress'})),/0 \/ 1 games finished · paused/);
  assert.match(label(renderer.root.findByProps({role:'alert'})),/Fixture provider failure/);
  assert.equal(replay({initialFen:DEFAULT_POSITION,moves:['e2e4']}).fen(),renderer.root.findByType(Board).props.fen);
  await act(async()=>{await button(renderer,'Resume learning series').props.onClick();});
  assert.equal(calls,3);
  assert.match(label(renderer.root.findByProps({'aria-label':'Learning series progress'})),/1 \/ 1 games finished · complete/);
 }finally{await act(async()=>renderer?.unmount());globalThis.fetch=original;}
});
