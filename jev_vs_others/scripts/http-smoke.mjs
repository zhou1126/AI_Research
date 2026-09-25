import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
const base='http://localhost:3000';
const config=await (await fetch(base+'/api/config')).json();
assert.ok(config.jev.configured && config.openai.configured && config.deepseek.configured);
const page=await fetch(base);assert.equal(page.status,200);
const position={initialFen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',moves:['e2e4','e7e5','g1f3']};
const game=new Chess(position.initialFen);for(const move of position.moves)game.move(move);
for(const engine of ['mcts','jev']) {
 const response=await fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine,position,options:{iterations:25,rolloutDepth:2,seed:42}})});
 assert.equal(response.status,200);
 const events=(await response.text()).trim().split('\n').map(s=>JSON.parse(s));
 const result=events.at(-1);assert.equal(result.type,'done',JSON.stringify(result));assert.equal(result.data.candidates.length,game.moves().length);
 if(engine==='jev'){assert.deepEqual(result.data.context.history_uci,position.moves);assert.equal(result.data.context.piece_values_in_pawn_units.queen,9);assert.equal(result.data.context.history.length,3);}
 if(engine==='mcts')assert.ok(events.some(e=>e.type==='progress'));
 console.log(JSON.stringify({engine,move:result.data.move,events:events.length,ok:true}));
}
const bad=await fetch(base+'/api/analyze',{method:'POST',body:JSON.stringify({engine:'mcts',position:{...position,moves:['e2e5']}})});assert.equal(bad.status,400);
const cross=await fetch(base+'/api/analyze',{method:'POST',headers:{Origin:'https://unrelated.example'},body:'{}'});assert.equal(cross.status,403);
console.log('HTTP page, configuration, streaming, provider, invalid history and cross-origin checks passed.');
