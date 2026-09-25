import { buildChessContext } from './context';
import { buildJevPrompt, LLM_PROMPT } from './prompts';
import { retrieveChessReferences, REFERENCE_GUIDANCE } from './retrieval';
import { LEARNING_GUIDANCE, type LearningContext } from './learning';
import { candidates, outcome, rng, type Chess, type Engine, type Decision } from './chess';
export type Environment = Record<string,string | undefined>;
export function providerConfig(env: Environment, engine: Engine) {
  if(engine === 'jev') return { key: env.JEV_API_KEY || env.TYPESAFE_API_KEY, url: env.JEV_API_URL || 'https://api.typesafe.ai/v1/systemone', model: env.JEV_MODEL || 'jev-latest' };
  if(engine === 'openai') return { key: env.OPENAI_API_KEY, url: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions', model: env.OPENAI_MODEL || '' };
  return { key: env.DEEP_SEEK_API_KEY || env.DEEPSEEK_API_KEY, url: (env.DEEP_SEEK_BASE_URL || env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/,'')+'/chat/completions', model: env.DEEP_SEEK_MODEL || env.DEEPSEEK_MODEL || '' };
}

export function completionBudget(env: Environment, engine: Engine) {
  if (engine !== 'openai') return 1500;
  const value = Number(env.OPENAI_MAX_COMPLETION_TOKENS ?? 8192);
  if (!Number.isInteger(value) || value < 256 || value > 32768) throw new Error('OPENAI_MAX_COMPLETION_TOKENS must be an integer from 256 to 32768.');
  return value;
}
export function parseChatDecision(data: { choices?: { finish_reason?: string | null; message?: { content?: unknown; refusal?: unknown } }[] }, engine: Engine, budget: number) {
  const choice = data?.choices?.[0], name = engine.toUpperCase();
  if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw new Error(`${name} declined to return a chess move. The board was not changed.`);
  if (choice?.finish_reason === 'length') throw new Error(`${name} reached its ${budget}-token completion limit before finishing the move. This limit includes reasoning tokens.${engine === 'openai' ? ' Increase OPENAI_MAX_COMPLETION_TOKENS and restart the server, or retry this position.' : ' Retry this position.'} The board was not changed.`);
  if (choice?.finish_reason && choice.finish_reason !== 'stop') throw new Error(`${name} did not finish a move response. The board was not changed.`);
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error(`${name} returned no move text. Retry this position. The board was not changed.`);
  let answer: unknown;
  try { answer = JSON.parse(content); } catch { throw new Error(`${name} returned malformed move JSON. Retry this position. The board was not changed.`); }
  if (!answer || typeof answer !== 'object' || Array.isArray(answer) || !('move' in answer) || typeof answer.move !== 'string') throw new Error(`${name} returned JSON without a valid move field. The board was not changed.`);
  return { move: answer.move, explanation: 'explanation' in answer && typeof answer.explanation === 'string' ? answer.explanation : 'No public rationale returned.' };
}

export function validateProbabilities(probabilities: unknown, legal: string[]): Record<string,number> {
  if(!probabilities || typeof probabilities !== 'object' || Array.isArray(probabilities)) throw new Error('JEV did not return a probability map.');
  const p = probabilities as Record<string,number>;
  if(Object.keys(p).length !== legal.length || legal.some(k=>typeof p[k] !== 'number' || !Number.isFinite(p[k]) || p[k]<0 || p[k]>1)) throw new Error('JEV probability map does not cover exactly the legal moves.');
  if(Math.abs(Object.values(p).reduce((a,b)=>a+b,0)-1)>.02) throw new Error('JEV probabilities do not sum to one (within rounding tolerance).');
  return p;
}
export async function decide(game: Chess, engine: Engine, env: Environment, seed: number, signal?: AbortSignal, learning?: LearningContext): Promise<Decision> {
  if(outcome(game)) throw new Error('The game has ended.');
  const start=Date.now(), legal=candidates(game);
  if(engine==='random') return {engine,move:legal[Math.floor(rng(seed)()*legal.length)].uci,candidates:legal.map(c=>({...c,probability:1/legal.length})),elapsedMs:Date.now()-start,seed,explanation:'Uniform seeded random choice among all legal moves. Baseline only.'};
  const config=providerConfig(env,engine);
  if(!config.key) throw new Error(`${engine.toUpperCase()} API key is missing.`);
  if(!config.model) throw new Error(`${engine.toUpperCase()} model is missing from .env.`);
  const url=new URL(config.url);
  if(url.protocol!=='https:') throw new Error('Provider endpoints must use HTTPS.');
  const references=engine==='jev'||engine==='deepseek'?retrieveChessReferences(game,env.CHESS_RAG_ENABLED!=='false'):undefined;
  const state=buildChessContext(game,references,learning);
  const budget=completionBudget(env,engine);
  const responseFormat=engine==='openai'?{
    type:'json_schema',json_schema:{name:'chess_move',strict:true,schema:{
      type:'object',properties:{move:{type:'string',enum:legal.map(c=>c.uci)},explanation:{type:'string',description:'A brief public chess rationale, at most two sentences.'}},
      required:['move','explanation'],additionalProperties:false,
    }},
  }:{type:'json_object'};
  const body=engine==='jev'?{model:config.model,state,questions:{move:{type:'choice',instructions:buildJevPrompt(state),criteria:Object.fromEntries(legal.map(c=>[c.uci,`${c.san}; resulting position: ${c.fen}`]))}}}:{model:config.model,messages:[{role:'system',content:LLM_PROMPT+(learning?`\n\nLEARNING FROM PRIOR GAMES:\n${LEARNING_GUIDANCE}`:'')+(references?.enabled?`\n\nREFERENCE USE:\n${REFERENCE_GUIDANCE}`:'')},{role:'user',content:JSON.stringify(state)}],response_format:responseFormat,max_completion_tokens:budget};
  let response: Response;
  try { response=await fetch(url,{method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000)}); }
  catch { throw new Error(`${engine.toUpperCase()} request failed or timed out. The board was not changed.`); }
  if(!response.ok) throw new Error(`${engine.toUpperCase()} returned HTTP ${response.status}. Check model, credentials, balance and rate limits. The board was not changed.`);
  const data=await response.json() as {
    model?:string; usage?:unknown;
    answers?:{move?:{choice:string;probabilities:unknown}};
    choices?:{finish_reason?:string|null;message?:{content?:unknown;refusal?:unknown}}[];
  };
  let move: string, explanation: string;
  if(engine==='jev') {
    const answer=data.answers?.move;
    const p=validateProbabilities(answer?.probabilities,legal.map(c=>c.uci));
    move=answer!.choice;
    legal.forEach(c=>c.probability=p[c.uci]); legal.sort((a,b)=>b.probability!-a.probability!);
    explanation='JEV received the full history from the starting FEN, piece values (P=1, N=3, B=3, R=5, Q=9; king priceless), material totals, a checkmate-first objective, and every legal move with its resulting FEN. The selected move is the API choice; bars show its returned probabilities without rescaling. These are choice probabilities, not chess win probabilities. JEV does not return a textual reasoning trace.';
  } else {
    const answer=parseChatDecision(data,engine,budget);
    move=answer.move; explanation=answer.explanation;
  }
  if(!legal.some(c=>c.uci===move)) throw new Error(`${engine.toUpperCase()} returned an illegal move. The board was not changed.`);
  return {engine,move,context:state,candidates:legal,elapsedMs:Date.now()-start,model:data.model || config.model,explanation,usage:data.usage,...(engine==='jev'?{}:{completion:{finishReason:data.choices?.[0]?.finish_reason ?? null,maxCompletionTokens:budget}})};
}
