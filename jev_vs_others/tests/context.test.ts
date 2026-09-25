import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess,DEFAULT_POSITION,candidates,play,replay,type Decision } from '../lib/chess';
import { buildChessContext,materialTotals,PIECE_GUIDE } from '../lib/context';
import { decide } from '../lib/providers';
import { LLM_PROMPT } from '../lib/prompts';
import { retrieveChessReferences, REFERENCE_GUIDANCE } from '../lib/retrieval';
import { evaluate } from '../lib/mcts';
import { destinationHeat,pendingMatches } from '../lib/heatmap';

test('shared context contains complete ordered history, piece points, captures, current material and win objective',()=>{
 const game=replay({initialFen:DEFAULT_POSITION,moves:['e2e4','d7d5','e4d5']});const c=buildChessContext(game);
 assert.deepEqual(c.history_san,['e4','d5','exd5']);assert.deepEqual(c.history_uci,['e2e4','d7d5','e4d5']);
 assert.equal(c.history[2].captured,'p');assert.equal(c.history[2].side,'White');assert.equal(c.side_to_move,'Black');
 assert.equal(c.initial_fen,DEFAULT_POSITION);assert.equal(c.fen,game.fen());assert.deepEqual(c.piece_values_in_pawn_units,PIECE_GUIDE);
 assert.deepEqual(c.material,{white:39,black:38,side_to_move_advantage:-1});assert.match(c.objective,/checkmating/);assert.match(c.pgn,/exd5/);
 assert.equal(c.legal_moves.length,game.moves().length);
});
test('history from a custom Black-to-move FEN retains original move numbers and promotions',()=>{
 const fen='7k/8/8/8/8/8/p7/7K b - - 0 21',g=new Chess(fen);play(g,'a2a1q');const c=buildChessContext(g);
 assert.equal(c.initial_fen,fen);assert.equal(c.history[0].move_number,21);assert.equal(c.history[0].side,'Black');assert.equal(c.history[0].promotion,'q');
});
test('providers share board data, JEV and DeepSeek receive the same retrieved references, and audit copies match requests',async()=>{
 const original=globalThis.fetch;const g=replay({initialFen:DEFAULT_POSITION,moves:['e2e4','e7e5','g1f3']});const legal=candidates(g);
 const env={JEV_API_KEY:'fixture',OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture',DEEP_SEEK_API_KEY:'fixture',DEEP_SEEK_MODEL:'fixture'};
 try{for(const engine of ['jev','openai','deepseek'] as const){
  const expected=buildChessContext(g,engine==='openai'?undefined:retrieveChessReferences(g));
  globalThis.fetch=async(_url,init)=>{const request=JSON.parse(init!.body as string);const state=engine==='jev'?request.state:JSON.parse(request.messages[1].content);assert.deepEqual(state,expected);
   if(engine==='jev') {
    const prompt=request.questions.move.instructions;
    assert.ok(prompt.includes(`FEN: ${expected.fen}`));
    assert.ok(prompt.includes(`Full move history: ${JSON.stringify(expected.history)}`));
    assert.ok(prompt.includes(JSON.stringify(expected.piece_values_in_pawn_units)));
    assert.ok(prompt.includes(JSON.stringify(expected.material)));
    assert.deepEqual(prompt.split('CHOICES:\n')[1].split('\n'),legal.map(c=>c.uci));
    assert.deepEqual(Object.keys(request.questions.move.criteria),legal.map(c=>c.uci));
    assert.ok(prompt.includes(REFERENCE_GUIDANCE));
   } else {
    assert.equal(request.messages[0].role,'system');
    assert.equal(request.messages[0].content,LLM_PROMPT+(engine==='deepseek'?`\n\nREFERENCE USE:\n${REFERENCE_GUIDANCE}`:''));
   }
   return engine==='jev'?Response.json({answers:{move:{choice:legal[0].uci,probabilities:Object.fromEntries(legal.map(c=>[c.uci,c===legal[0]?1:0]))}}}):Response.json({choices:[{message:{content:JSON.stringify({move:legal[0].uci,explanation:'Fixture'})}}]});};
  const d=await decide(g,engine,env,42);assert.deepEqual(d.context,expected);assert.equal(g.fen(),expected.fen);
 }}finally{globalThis.fetch=original;}
});
test('MCTS shares conventional values; terminal win and loss dominate material',()=>{
 assert.deepEqual(materialTotals(new Chess()),{white:39,black:39});
 const whiteAdvantage=new Chess('7k/8/8/8/8/8/Q7/K7 w - - 0 1');assert.ok(evaluate(whiteAdvantage,'w')>.5);assert.ok(evaluate(whiteAdvantage,'b')<.5);
 const mate=new Chess();for(const m of ['f2f3','e7e5','g2g4','d8h4'])play(mate,m);assert.equal(evaluate(mate,'b'),1);assert.equal(evaluate(mate,'w'),0);
 assert.equal(evaluate(new Chess('7k/8/8/8/8/8/8/K7 w - - 0 1'),'w'),.5);
 const enormous=new Chess('7k/8/8/8/8/QQQQQQQQ/QQQQQQQQ/K7 w - - 0 1');assert.ok(evaluate(enormous,'w')<1);assert.ok(evaluate(enormous,'b')>0);
});
test('heatmap aggregates promotions on a shared destination, without losing distinct moves',()=>{
 const moves=candidates(new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1')).map(c=>({...c,probability:c.uci.startsWith('a7')?.25:0}));
 const h=destinationHeat(moves,'a7');assert.equal(h.length,1);assert.equal(h[0].square,'a8');assert.equal(h[0].moves.length,4);assert.equal(h[0].weight,1);
});
test('heatmap groups converging pieces and filtering does not renormalize visit share',()=>{
 const moves=[{uci:'g1f3',san:'Nf3',fen:'',visits:30},{uci:'d2f3',san:'Nf3',fen:'',visits:10},{uci:'a2a3',san:'a3',fen:'',visits:60}];
 assert.equal(destinationHeat(moves).find(h=>h.square==='f3')!.weight,.4);
 assert.equal(destinationHeat(moves,'g1')[0].weight,.3);
 const unscored=destinationHeat(moves.map(({visits,...move})=>move));assert.ok(unscored.every(h=>h.weight===undefined));
 assert.ok(destinationHeat(moves.map(c=>({...c,visits:0}))).every(h=>Number.isFinite(h.intensity)));
});
test('a pending move becomes stale after a player, board, or history change',()=>{
 const position={initialFen:DEFAULT_POSITION,moves:[]};const decision:Decision={engine:'jev',move:'e2e4',candidates:candidates(new Chess()),elapsedMs:1,explanation:'fixture'};const pending={position,decision};
 assert.ok(pendingMatches(pending,position,'jev'));assert.ok(!pendingMatches(pending,position,'mcts'));
 assert.ok(!pendingMatches(pending,{...position,moves:['e2e4']},'jev'));assert.ok(!pendingMatches(pending,{initialFen:'different',moves:[]},'jev'));
 assert.ok(!pendingMatches(null,position,'jev'));
});
