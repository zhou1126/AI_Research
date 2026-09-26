import test from 'node:test';
import assert from 'node:assert/strict';
import { CRITERIA, EXAMPLES, LABELS, type Example } from '../lib/notebook/data';
import { finbertResult, jevBody, llmBody, metrics, type Prediction } from '../lib/notebook/core';
import { classify, parseJev, parseLlm } from '../lib/notebook/providers';
import { runBenchmark } from '../lib/notebook/runner';
import { POST } from '../app/api/notebook/route';
const probabilities = { positive: .8, neutral: .15, negative: .05 };
const jevResponse = () => ({ model: 'jev-fixture', answers: {
  sentiment: { type: 'choice', choice: 'positive', probabilities, confidence: .6 },
  financial_outlook: { type: 'score', score: 1.8, probabilities: { '0': 0, '1': .2, '2': .8 }, confidence: .6 },
  reports_growth: { type: 'noul', noul: .9 },
} });
const llmResponse = (content: string, finish = 'stop') => ({ model: 'llm-fixture', choices: [{ finish_reason: finish, message: { content } }] });

test('classification set has 50 unique original items, fixed labels, and no answer key in model requests', () => {
  assert.equal(EXAMPLES.length, 50); assert.equal(new Set(EXAMPLES.map(e => e.id)).size, 50); assert.equal(new Set(EXAMPLES.map(e => e.text)).size, 50);
  assert.deepEqual(LABELS.map(label => EXAMPLES.filter(e => e.expected === label).length), [17, 16, 17]);
  const jev = jevBody(EXAMPLES[0].text, 'jev-test');
  assert.deepEqual(jev.questions.sentiment.criteria, CRITERIA); assert.equal(jev.state, EXAMPLES[0].text); assert.equal(Object.keys(jev.questions).length, 1);
  assert.equal(Object.keys(jevBody('custom text', 'jev-test', true).questions).length, 3);
  const llm = llmBody(EXAMPLES[0].text, 'model', 'openai', 8192);
  assert.deepEqual(llm.response_format.json_schema?.schema.properties.label.enum, LABELS);
  assert.equal(llm.messages[1].content, EXAMPLES[0].text);
  assert.ok(!JSON.stringify({ jev, llm }).includes('expected'));
});

test('metrics use hand-calculated multiclass scores; failures count and missing attempts do not', () => {
  const examples: Example[] = ['positive', 'positive', 'neutral', 'negative'].map((expected, i) => ({ id: `${i}`, text: '', expected: expected as Example['expected'] }));
  const rows: Prediction[] = ['positive', 'negative', undefined, 'negative'].map((prediction, i) => ({ id: `${i}`, engine: 'jev', model: 'test', prediction: prediction as Prediction['prediction'], elapsedMs: 10, ...(prediction ? {} : { error: 'failed' }) }));
  const result = metrics(examples, rows);
  assert.equal(result.accuracy, .5); assert.equal(result.coverage, .75); assert.equal(result.errors, 1);
  assert.equal(result.precision, .5); assert.equal(result.recall, .5); assert.ok(Math.abs(result.f1! - 4 / 9) < 1e-9);
  assert.deepEqual(result.matrix, [[1, 0, 1, 0], [0, 0, 0, 1], [0, 0, 1, 0]]);
  assert.equal(result.elapsedMs, 40); assert.equal(result.meanMs, 10);
  assert.equal(metrics(examples, rows.slice(0, 1)).accuracy, 1);
  assert.equal(metrics(examples, []).accuracy, null);
  // Duplicate export rows cannot inflate the denominator or runtime.
  assert.equal(metrics(examples, [...rows, rows[0]]).attempted, 4);
});

test('typed outputs reject missing labels, malformed probability maps and truncated LLM results', () => {
  const result = parseJev(jevResponse(), true); assert.equal(result.prediction, 'positive'); assert.deepEqual(result.probabilities, probabilities);
  const invalid = jevResponse(); invalid.answers.sentiment.choice = 'other'; assert.throws(() => parseJev(invalid, false), /predefined/);
  assert.throws(() => parseJev({ answers: { sentiment: { choice: 'positive', probabilities: { positive: 1 } } } }, false), /distribution/);
  assert.throws(() => parseJev({ answers: { sentiment: { choice: 'positive', probabilities } } }, true));
  assert.equal(parseLlm(llmResponse('{"label":"neutral"}')).prediction, 'neutral');
  for (const value of ['not json', '{"label":"other"}', '{"label":"positive","confidence":0.8}']) assert.throws(() => parseLlm(llmResponse(value)));
  assert.throws(() => parseLlm(llmResponse('{"label":"positive"}', 'length')), /truncated/);
  assert.deepEqual(finbertResult(Object.entries(probabilities).map(([label, score]) => ({ label, score }))), { prediction: 'positive', probabilities });
  assert.throws(() => finbertResult([{ label: 'LABEL_0', score: 1 }]), /unknown/);
  assert.throws(() => finbertResult([{ label: 'positive', score: 1 }, { label: 'positive', score: 1 }]), /duplicate/);
});

test('server adapters send shared text, protect keys, use constraints, and redact HTTP errors', async () => {
  const original = globalThis.fetch; const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, init) => { const body = JSON.parse(init!.body as string); bodies.push(body); return Response.json(body.questions ? jevResponse() : llmResponse('{"label":"positive"}')); };
  const env = { JEV_API_KEY: 'secret-fixture', OPENAI_API_KEY: 'secret-fixture', OPENAI_MODEL: 'openai-fixture', DEEPSEEK_API_KEY: 'secret-fixture', DEEPSEEK_MODEL: 'deepseek-fixture' };
  try {
    for (const engine of ['jev', 'openai', 'deepseek'] as const) {
      const result = await classify('Sales rose.', engine, false, env);
      assert.equal(result.prediction, 'positive'); assert.ok(result.inferenceMs >= 0);
      assert.ok(!JSON.stringify(result).includes('secret-fixture'));
    }
    assert.equal(bodies[0].state, 'Sales rose.');
    assert.equal((bodies[1].messages as { content: string }[])[1].content, 'Sales rose.');
    assert.equal((bodies[2].response_format as { type: string }).type, 'json_object');
    globalThis.fetch = async () => new Response('secret-fixture provider diagnostic', { status: 429 });
    await assert.rejects(classify('Sales rose.', 'jev', false, env), error => error instanceof Error && /HTTP 429/.test(error.message) && !error.message.includes('secret-fixture'));
  } finally { globalThis.fetch = original; }
});

test('notebook API validates requests before any provider call and uses server question text', async () => {
  const original = globalThis.fetch, old = process.env.JEV_API_KEY; let calls = 0;
  process.env.JEV_API_KEY = 'fixture';
  globalThis.fetch = async (_url, init) => { calls++; const body = JSON.parse(init!.body as string); assert.equal(body.state, calls === 1 ? EXAMPLES[0].text : 'Sales rose.'); assert.equal(Object.keys(body.questions).length, 1); assert.ok(!JSON.stringify(body).includes('expected')); return Response.json(jevResponse()); };
  const request = (body: unknown, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/notebook', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify(body) });
  try {
    assert.equal((await POST(request({}, 'https://unrelated.example'))).status, 403);
    for (const body of [{ mode: 'classify', engine: 'bert', id: 'q01' }, { mode: 'classify', engine: 'jev', id: 'missing' }, { mode: 'basic', engine: 'jev', text: '' }, { mode: 'basic', engine: 'openai', text: 'test' }, { mode: 'demo', engine: 'jev', text: '' }, { mode: 'demo', engine: 'openai', text: 'test' }]) assert.equal((await POST(request(body))).status, 400);
    assert.equal(calls, 0);
    const response = await POST(request({ mode: 'classify', engine: 'jev', id: 'q01', text: 'Override', expected: 'negative' }));
    assert.equal(response.status, 200); assert.equal(calls, 1);
    assert.equal((await response.json() as { prediction: string }).prediction, 'positive');
    const basic = await POST(request({ mode: 'basic', engine: 'jev', text: 'Sales rose.' }));
    assert.equal(basic.status, 200); assert.equal(calls, 2);
    const basicResult = await basic.json() as { id: string; prediction: string; probabilities: Record<string, number>; response: unknown };
    assert.equal(basicResult.id, 'basic'); assert.equal(basicResult.prediction, 'positive'); assert.deepEqual(basicResult.probabilities, probabilities);
    assert.ok(!JSON.stringify(basicResult).includes('Authorization'));
  } finally { globalThis.fetch = original; if (old === undefined) delete process.env.JEV_API_KEY; else process.env.JEV_API_KEY = old; }
});

test('runner pauses on errors, records failures once, resumes without paid retries and honors cancellation', async () => {
  const rows: Prediction[] = [], abort = new AbortController(); let calls = 0;
  const classifier = async (example: Example, engine: Prediction['engine']): Promise<Prediction> => { calls++; if (calls === 2) throw new Error('HTTP 429'); return { id: example.id, engine, model: 'fixture', prediction: example.expected, elapsedMs: 1 }; };
  await assert.rejects(runBenchmark(EXAMPLES.slice(0, 2), ['jev', 'openai'], [], classifier, row => rows.push(row), abort.signal), /paused/);
  assert.equal(rows.length, 2); assert.equal(rows[1].error, 'HTTP 429');
  await runBenchmark(EXAMPLES.slice(0, 2), ['jev', 'openai'], rows, classifier, row => rows.push(row), abort.signal);
  assert.equal(calls, 4); assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(row => `${row.id}:${row.engine}`), ['q01:jev', 'q01:openai', 'q02:openai', 'q02:jev']);
  abort.abort(); await runBenchmark(EXAMPLES, ['jev'], [], classifier, row => rows.push(row), abort.signal); assert.equal(calls, 4);
});
