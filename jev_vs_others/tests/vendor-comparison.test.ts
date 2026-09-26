import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/vendor-compare/route';
import { ROSTER } from '../lib/jev-overview';
import { accuracy, llmVendorRequest, parseLlmVendorResponse } from '../lib/vendor/comparison';
import { priceSchedule, priceText } from '../lib/vendor/pricing';
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const labels = Object.fromEntries(ROSTER.map(row => [row.id, row.expected]));
const fixture = (model: string) => ({ model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(labels) } }], usage: { prompt_tokens: 250, completion_tokens: 30 } });

test('LLM vendor comparison constrains all roster labels and validates every response', () => {
  const body = llmVendorRequest('openai', 'test');
  assert.equal(body.response_format.type, 'json_schema');
  assert.match(body.messages[0].content, /all 20 decisions/);
  assert.equal(JSON.stringify(body).includes('"expected"'), false);
  const parsed = parseLlmVendorResponse(fixture('returned-model'));
  assert.equal(accuracy(parsed.decisions), 1);
  assert.equal(parsed.usage?.input_tokens, 250);
  assert.throws(() => parseLlmVendorResponse({ ...fixture('x'), choices: [{ finish_reason: 'length', message: { content: JSON.stringify(labels) } }] }), /did not finish/);
  assert.throws(() => parseLlmVendorResponse({ ...fixture('x'), choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ...labels, r05: 'v99' }) } }] }), /invalid label/);
  assert.equal(llmVendorRequest('deepseek', 'test').response_format.type, 'json_object');
});

test('comparison endpoint makes one safe call per requested engine and rejects invalid requests', async () => {
  const oldFetch = globalThis.fetch, oldOpenAI = process.env.OPENAI_API_KEY, oldModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = 'private-test-key'; process.env.OPENAI_MODEL = 'test-model';
  let calls = 0;
  globalThis.fetch = async (_url, init) => { calls++; assert.equal((init!.headers as Record<string,string>).Authorization, 'Bearer private-test-key'); assert.ok(!(init!.body as string).includes('"expected"')); return Response.json(fixture('returned-model')); };
  const request = (origin: string, engine: string) => new Request('http://localhost:3000/api/vendor-compare', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ engine }) });
  try {
    assert.equal((await POST(request('https://other.example', 'openai'))).status, 403);
    assert.equal((await POST(request('http://localhost:3000', 'invalid'))).status, 400);
    assert.equal(calls, 0);
    const response = await POST(request('http://localhost:3000', 'openai'));
    assert.equal(response.status, 200); assert.equal(calls, 1);
    const result = await response.json() as { decisions: unknown[]; model: string }; assert.equal(result.decisions.length, ROSTER.length); assert.equal(result.model, 'returned-model');
    assert.ok(!JSON.stringify(result).includes('private-test-key'));
  } finally { globalThis.fetch = oldFetch; if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldOpenAI; if (oldModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = oldModel; }
});


test('JEV comparison endpoint sends all Choice questions in one request', async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.JEV_API_KEY;
  process.env.JEV_API_KEY = 'jev-test-private';
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    assert.equal(Object.keys(body.questions).length, ROSTER.length);
    assert.equal(Object.keys(body.state.roster).length, ROSTER.length);
    assert.equal(JSON.stringify(body).includes('"expected"'), false);
    return Response.json({ model: 'jev-returned', answers: Object.fromEntries(ROSTER.map(row => [row.id, { choice: row.expected, confidence: 0.9, probabilities: Object.fromEntries(['v01','v02','v03','v04','unmatched'].map(option => [option, +(option === row.expected)])) }])) });
  };
  try {
    const request = new Request('http://localhost:3000/api/vendor-compare', { method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: JSON.stringify({ engine: 'jev' }) });
    const response = await POST(request);
    assert.equal(response.status, 200); assert.equal(calls, 1);
    const result = await response.json() as { decisions: { probabilities: Record<string, number> }[] };
    assert.equal(result.decisions.length, ROSTER.length); assert.equal(result.decisions[0].probabilities.v01, 1);
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.JEV_API_KEY; else process.env.JEV_API_KEY = oldKey; }
});


test('visible answer key covers balanced matches and does not appear in provider requests', () => {
  assert.equal(ROSTER.length, 20);
  const counts = Object.fromEntries(['v01', 'v02', 'v03', 'v04', 'unmatched'].map(option => [option, ROSTER.filter(row => row.expected === option).length]));
  assert.deepEqual(counts, { v01: 4, v02: 4, v03: 4, v04: 4, unmatched: 4 });
  const prompt = JSON.stringify(llmVendorRequest('deepseek', 'deepseek-v4-flash'));
  assert.ok(!prompt.includes('"expected"'));
  assert.ok(!JSON.stringify(ROSTER.find(row => row.id === 'r20')).includes('undefined'));
});

test('published OpenAI and DeepSeek rates produce cache-aware estimates and reject unknown models', () => {
  const openai = priceSchedule('openai', 'gpt-5.6-luna')!;
  assert.match(openai.label, /\$0\.20 input/);
  const a = openai.estimate({ input_tokens: 1000, output_tokens: 100, cached_input_tokens: 200, cache_write_tokens: 300 });
  assert.equal(a.low, a.high);
  assert.ok(Math.abs(a.low - 0.000299) < 1e-12);
  const uncertain = openai.estimate({ input_tokens: 1000, output_tokens: 100 });
  assert.ok(uncertain.high > uncertain.low);
  const deepseek = priceSchedule('deepseek', 'deepseek-v4-flash')!;
  const d = deepseek.estimate({ input_tokens: 1000, output_tokens: 100, cached_input_tokens: 200 });
  assert.ok(Math.abs(d.low - 0.0001806) < 1e-12);
  assert.equal(d.high, d.low * 2);
  assert.match(priceText(d), /^~\$0\.000181–\$0\.000361$/);
  assert.equal(priceSchedule('openai', 'unknown-model'), null);
});

test('LLM response preserves reported cache-hit and cache-write token counts for pricing', () => {
  const parsed = parseLlmVendorResponse({ ...fixture('gpt-5.6-luna'), usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 } } });
  assert.equal(parsed.usage?.cached_input_tokens, 200);
  assert.equal(parsed.usage?.cache_write_tokens, 300);
  const deepseek = parseLlmVendorResponse({ ...fixture('deepseek-v4-flash'), usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_cache_hit_tokens: 200 } });
  assert.equal(deepseek.usage?.cached_input_tokens, 200);
});
