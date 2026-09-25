import { isAllowedOrigin } from '../../../lib/origin';
import { replay, outcome, type Engine } from '../../../lib/chess';
import { mcts } from '../../../lib/mcts';
import { decide } from '../../../lib/providers';
import { validateLearningRequest, type LearningContext } from '../../../lib/learning';
export async function POST(request: Request) {
  if(!isAllowedOrigin(request,process.env.APP_ORIGIN)) return Response.json({error:'Cross-origin requests are not allowed.'},{status:403});
  let input;
  let learning: LearningContext | undefined;
  try {
    const raw=await request.text(); if(raw.length>300000) throw new Error('Request too large.'); input=JSON.parse(raw);
    if(!['jev','mcts','openai','deepseek','random'].includes(input.engine)) throw new Error('Unknown engine.');
    if(input.ragEnabled!==undefined && typeof input.ragEnabled!=='boolean') throw new Error('ragEnabled must be a boolean.');
    replay(input.position);
    learning=validateLearningRequest(input.learning,input.engine,input.position);
  } catch(e) { return Response.json({error:e instanceof Error?e.message:'Invalid request.'},{status:400}); }
  const game=replay(input.position);
  const providerEnv=input.ragEnabled===undefined?process.env:{...process.env,CHESS_RAG_ENABLED:String(input.ragEnabled)};
  if(outcome(game)) return Response.json({error:'The game has ended.'},{status:409});
  const bounded=(x:unknown,fallback:number,min:number,max:number)=>typeof x==='number' && Number.isFinite(x)?Math.min(max,Math.max(min,Math.floor(x))):fallback;
  const options={iterations:bounded(input.options?.iterations,200,25,2000),rolloutDepth:bounded(input.options?.rolloutDepth,12,1,60),exploration:Math.max(0,Math.min(4,Number(input.options?.exploration) || Math.SQRT2)),seed:bounded(input.options?.seed,42,0,2147483647)};
  const encoder=new TextEncoder(), abort=new AbortController();
  request.signal.addEventListener('abort',()=>abort.abort());
  const stream=new ReadableStream({
    async start(controller) {
      const send=(type:string,data:unknown)=>{if(!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify({type,data})+'\n'));};
      try {
        const decision=input.engine==='mcts'?await mcts(game,options,d=>send('progress',d),abort.signal):await decide(game,input.engine as Engine,providerEnv,options.seed,abort.signal,learning);
        send('done',decision);
      } catch(e) { send('error',{message:e instanceof Error?e.message:'Analysis failed.'}); }
      finally { if(!abort.signal.aborted) controller.close(); }
    },cancel(){abort.abort();}
  });
  return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'}});
}
