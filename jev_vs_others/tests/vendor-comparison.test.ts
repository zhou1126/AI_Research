import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/vendor-compare/route';
import { ROSTER } from '../lib/jev-overview';
import { accuracy, llmVendorRequest, parseLlmVendorResponse } from '../lib/vendor/comparison';
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const labels = Object.fromEntries(ROSTER.map(row => [row.id, row.expected]));
const fixture = (model: string) => ({ model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(labels) } }], usage: { prompt_tokens: 250, completion_tokens: 30 } });

test('LLM vendor comparison constrains five labels and validates every response', () => {
  const body = llmVendorRequest('openai', 'test');
  assert.equal(body.response_format.type, 'json_schema');
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
    const result = await response.json() as { decisions: unknown[]; model: string }; assert.equal(result.decisions.length, 5); assert.equal(result.model, 'returned-model');
    assert.ok(!JSON.stringify(result).includes('private-test-key'));
  } finally { globalThis.fetch = oldFetch; if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldOpenAI; if (oldModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = oldModel; }
});


test('JEV comparison endpoint sends five parallel Choice questions in one request', async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.JEV_API_KEY;
  process.env.JEV_API_KEY = 'jev-test-private';
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    assert.equal(Object.keys(body.questions).length, 5);
    assert.equal(Object.keys(body.state.roster).length, 5);
    assert.equal(JSON.stringify(body).includes('"expected"'), false);
    return Response.json({ model: 'jev-returned', answers: Object.fromEntries(ROSTER.map(row => [row.id, { choice: row.expected, confidence: 0.9, probabilities: Object.fromEntries(['v01','v02','v03','v04','unmatched'].map(option => [option, +(option === row.expected)])) }])) });
  };
  try {
    const request = new Request('http://localhost:3000/api/vendor-compare', { method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: JSON.stringify({ engine: 'jev' }) });
    const response = await POST(request);
    assert.equal(response.status, 200); assert.equal(calls, 1);
    const result = await response.json() as { decisions: { probabilities: Record<string, number> }[] };
    assert.equal(result.decisions.length, 5); assert.equal(result.decisions[0].probabilities.v01, 1);
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.JEV_API_KEY; else process.env.JEV_API_KEY = oldKey; }
});
