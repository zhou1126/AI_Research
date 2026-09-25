import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess,candidates } from '../lib/chess';
import { decide,parseChatDecision,completionBudget } from '../lib/providers';
const data=(content:unknown,finish_reason='stop')=>({choices:[{finish_reason,message:{content}}]});
test('complete JSON is accepted but token-limited responses are never salvaged',()=>{
 const json=JSON.stringify({move:'e2e4',explanation:'Control the center.'});
 assert.equal(parseChatDecision(data(json),'openai',8192).move,'e2e4');
 for(const text of [json,'','{"move":"e2'])assert.throws(()=>parseChatDecision(data(text,'length'),'openai',8192),/8192-token completion limit/);
});
test('empty, malformed, missing fields and unexpected JSON shapes have actionable errors',()=>{
 for(const text of ['',null,undefined,[]])assert.throws(()=>parseChatDecision(data(text),'openai',8192),/no move text/);
 assert.throws(()=>parseChatDecision(data('{"move":'),'openai',8192),/malformed move JSON/);
 for(const text of ['null','[]','{}','{"move":5}'])assert.throws(()=>parseChatDecision(data(text),'openai',8192),/valid move field/);
});
test('refusals and filtered completions are recognized without exposing their content',()=>{
 assert.throws(()=>parseChatDecision({choices:[{message:{refusal:'private provider detail'}}]},'openai',8192),error=>error instanceof Error&&/declined/.test(error.message)&&!error.message.includes('private provider detail'));
 assert.throws(()=>parseChatDecision(data('{}','content_filter'),'openai',8192),/declined/);
 assert.throws(()=>parseChatDecision(data('{}','tool_calls'),'openai',8192),/did not finish/);
});
test('OpenAI uses a strict legal-move enum and records the completion budget without changing the model',async()=>{
 const original=globalThis.fetch;const g=new Chess(),before=g.fen();
 try{
 globalThis.fetch=async(_url,init)=>{const request=JSON.parse(init!.body as string);
  assert.equal(request.model,'configured-model');assert.equal(request.max_completion_tokens,8192);
  assert.equal(request.response_format.type,'json_schema');assert.equal(request.response_format.json_schema.strict,true);
  assert.deepEqual(request.response_format.json_schema.schema.properties.move.enum,candidates(g).map(c=>c.uci));
  return Response.json(data(JSON.stringify({move:'e2e4',explanation:'Center.'})));
 };
 const d=await decide(g,'openai',{OPENAI_API_KEY:'fixture',OPENAI_MODEL:'configured-model'},42);
 assert.equal(d.move,'e2e4');assert.equal(d.completion?.maxCompletionTokens,8192);assert.equal(g.fen(),before);
 }finally{globalThis.fetch=original;}
});
test('truncation keeps the position unchanged and does not make an automatic paid retry',async()=>{
 const original=globalThis.fetch;const g=new Chess(),before=g.fen();let calls=0;
 try{globalThis.fetch=async()=>{calls++;return Response.json(data('','length'));};
 await assert.rejects(decide(g,'openai',{OPENAI_API_KEY:'fixture',OPENAI_MODEL:'configured-model'},42),/completion limit/);
 assert.equal(calls,1);assert.equal(g.fen(),before);
 }finally{globalThis.fetch=original;}
});
test('OpenAI completion budget is configurable and bounded; other providers keep their budget',()=>{
 assert.equal(completionBudget({},'openai'),8192);assert.equal(completionBudget({OPENAI_MAX_COMPLETION_TOKENS:'12000'},'openai'),12000);
 for(const value of ['NaN','0','999999','3.5'])assert.throws(()=>completionBudget({OPENAI_MAX_COMPLETION_TOKENS:value},'openai'));
 assert.equal(completionBudget({},'deepseek'),1500);
});
