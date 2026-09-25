import { Chess } from '../lib/chess';
import { decide } from '../lib/providers';
for(const engine of ['jev','openai','deepseek'] as const){try{const d=await decide(new Chess(),engine,process.env,42);console.log(JSON.stringify({engine,ok:true,model:d.model,move:d.move,candidates:d.candidates.length,probabilitySum:d.candidates.reduce((s,c)=>s+(c.probability||0),0),elapsedMs:d.elapsedMs}));}catch(e){console.log(JSON.stringify({engine,ok:false,error:e instanceof Error?e.message:'Failed'}));}}
