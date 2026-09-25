import { mkdirSync, writeFileSync } from 'node:fs';
import { Chess,DEFAULT_POSITION,outcome,play,type Engine,type Decision } from '../lib/chess';
import { mcts } from '../lib/mcts';
import { decide } from '../lib/providers';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const a=(args.a||'jev') as Engine,b=(args.b||'mcts') as Engine;
if(![a,b].every(e=>['jev','mcts','openai','deepseek','random'].includes(e)))throw new Error('Unknown engine.');
function number(key:string,fallback:number,min:number,max:number){const n=Number(args[key]??fallback);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Invalid ${key}`);return n;}
const pairs=number('pairs',1,1,100),maxPlies=number('max-plies',160,1,2000),options={iterations:number('iterations',200,25,2000),rolloutDepth:number('depth',12,1,60),exploration:Math.SQRT2,seed:number('seed',42,0,2147483647)};
const initialFen=args.fen||DEFAULT_POSITION,results:unknown[]=[];
mkdirSync('outputs',{recursive:true});
const output=`outputs/benchmark-${Date.now()}.json`;
const totals={aWins:0,bWins:0,draws:0,unfinished:0,errors:0};
for(let pair=0;pair<pairs;pair++)for(let color=0;color<2;color++){
 const white=color===0?a:b,black=color===0?b:a,game=new Chess(initialFen),records:{fen:string;decision:Decision}[]=[];
 let error:string|undefined;
 try{while(!outcome(game)&&records.length<maxPlies){const engine=game.turn()==='w'?white:black;const opts={...options,seed:options.seed+pair*10000+records.length};const fen=game.fen();const d=engine==='mcts'?await mcts(game,opts):await decide(game,engine,process.env,opts.seed);play(game,d.move);records.push({fen,decision:d});console.log(`Pair ${pair+1}, game ${color+1}, ply ${records.length}: ${engine} ${d.move}`);}}catch(e){error=e instanceof Error?e.message:'Unknown error';}
 const end=outcome(game),result=end?.result||'*';
 if(error)totals.errors++;else if(result==='1/2-1/2')totals.draws++;else if(result==='*')totals.unfinished++;else if((result==='1-0'?white:black)===a)totals.aWins++;else totals.bWins++;
 game.setHeader('White',white);game.setHeader('Black',black);game.setHeader('Result',result);
 results.push({pair:pair+1,white,black,result,reason:error?`Provider failure: ${error}`:end?.reason||'Ply limit: unfinished',pgn:game.pgn(),records});
 writeFileSync(output,JSON.stringify({a,b,pairs,initialFen,maxPlies,options,drawPolicy:'Always claim threefold and fifty-move draws',totals,results},null,2));
}
console.log(JSON.stringify({output,totals},null,2));
