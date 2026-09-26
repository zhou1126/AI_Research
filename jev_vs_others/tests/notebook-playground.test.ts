import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { JevPlayground } from '../app/notebook/JevPlayground';
import { POST } from '../app/api/notebook/route';
import { buildPlaygroundBody, initialPlaygroundDraft, newPlaygroundQuestion, parsePlaygroundResponse, previewPlaygroundBody } from '../lib/notebook/playground';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : text(child)).join('');
const button = (renderer: ReactTestRenderer, label: string) => renderer.root.findAllByType('button').find(node => text(node) === label)!;

function mixedDraft() {
  const draft = initialPlaygroundDraft();
  draft.state = 'The museum closes at 5 pm. Can we visit at 6 pm?';
  draft.questions = [newPlaygroundQuestion('choice', 1), newPlaygroundQuestion('score', 2), newPlaygroundQuestion('noul', 3)];
  draft.questions[0].instructions = 'Choose the best team for this question.';
  draft.questions[0].options = [{ key: 'hours', description: 'Opening hours and availability' }, { key: 'tickets', description: 'Ticket purchases and refunds' }];
  draft.questions[1].levels = ['Routine', 'Soon', 'Urgent'];
  draft.questions[2].trueDescription = 'The visitor asks whether the museum is open.';
  draft.questions[2].falseDescription = 'The visitor does not ask whether the museum is open.';
  return draft;
}
function fixture() { return { model: 'jev-fixture', usage: { input_tokens: 21, output_tokens: 8 }, answers: {
  question_1: { type: 'choice', choice: 'hours', probabilities: { hours: .9, tickets: .1 }, confidence: .9 },
  question_2: { type: 'score', score: 1.5, probabilities: { '0': .1, '1': .3, '2': .6 }, confidence: .7 },
  question_3: { type: 'noul', noul: .95 },
} }; }

test('custom notebook composes mixed primitives from an arbitrary statement', () => {
  const draft = mixedDraft(), body = buildPlaygroundBody(draft, 'jev-fixture');
  assert.equal(body.state, draft.state);
  assert.deepEqual(Object.keys(body.questions), ['question_1', 'question_2', 'question_3']);
  assert.deepEqual(body.questions.question_1.criteria, { hours: 'Opening hours and availability', tickets: 'Ticket purchases and refunds' });
  assert.deepEqual(body.questions.question_2.criteria, ['Routine', 'Soon', 'Urgent']);
  assert.deepEqual(body.questions.question_3.criteria, { true: draft.questions[2].trueDescription, false: draft.questions[2].falseDescription });
  assert.deepEqual(previewPlaygroundBody(draft, 'jev-fixture'), body);
  const parsed = parsePlaygroundResponse(fixture(), body);
  assert.equal(parsed.answers.question_1.choice, 'hours');
  assert.equal(parsed.answers.question_2.score, 1.5);
  assert.equal(parsed.answers.question_3.noul, .95);
  assert.equal(parsed.usage?.input_tokens, 21);
});

test('custom notebook rejects incomplete or malformed requests and responses', () => {
  const draft = mixedDraft();
  draft.questions[0].options[1].key = 'hours';
  assert.throws(() => buildPlaygroundBody(draft, 'jev-fixture'), /unique lowercase option labels/);
  draft.questions[0].options[1].key = 'tickets';
  draft.questions[2].falseDescription = '';
  assert.throws(() => buildPlaygroundBody(draft, 'jev-fixture'), /both yes and no/);
  draft.questions[2].falseDescription = 'No question about opening hours.';
  draft.questions[1].id = 'question_1';
  assert.throws(() => buildPlaygroundBody(draft, 'jev-fixture'), /unique ID/);
  draft.questions[1].id = 'question_2';
  const body = buildPlaygroundBody(draft, 'jev-fixture');
  assert.throws(() => parsePlaygroundResponse({ ...fixture(), answers: { question_1: fixture().answers.question_1 } }, body), /missing or unexpected/);
  const bad = fixture(); bad.answers.question_1.probabilities.hours = 2;
  assert.throws(() => parsePlaygroundResponse(bad, body), /distribution/);
});

test('API validates the custom draft before calling JEV and sends all questions once', async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.JEV_API_KEY;
  process.env.JEV_API_KEY = 'fixture-secret';
  const sent: unknown[] = [];
  globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(init!.body as string)); return Response.json(fixture()); };
  const request = (draft: unknown) => new Request('http://localhost:3000/api/notebook', { method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: JSON.stringify({ mode: 'playground', engine: 'jev', draft }) });
  try {
    const invalid = mixedDraft(); invalid.questions[1].levels = ['Only one'];
    assert.equal((await POST(request(invalid))).status, 400);
    assert.equal(sent.length, 0);
    const draft = mixedDraft(), response = await POST(request(draft));
    assert.equal(response.status, 200);
    assert.equal(sent.length, 1);
    const result = await response.json() as { request: { model: string }; response: { answers: Record<string, { choice?: string }> } };
    assert.deepEqual(sent[0], buildPlaygroundBody(draft, result.request.model));
    assert.deepEqual(result.request, sent[0]);
    assert.equal(result.response.answers.question_1.choice, 'hours');
    assert.ok(!JSON.stringify(result).includes('fixture-secret'));
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.JEV_API_KEY; else process.env.JEV_API_KEY = oldKey; }
});

test('UI builds live JSON, allows mixed primitives, and displays actual returned answers', async () => {
  const oldFetch = globalThis.fetch;
  let renderer!: ReactTestRenderer; const calls: unknown[] = [];
  globalThis.fetch = async (_url, init) => { calls.push(JSON.parse(init!.body as string)); return Response.json({ model: 'jev-fixture', inferenceMs: 42, request: {}, response: { answers: { question_1: { type: 'choice', choice: 'hours', probabilities: { hours: .9, tickets: .1 } }, question_2: { type: 'noul', noul: .8 } } } }); };
  try {
    await act(async () => { renderer = create(React.createElement(JevPlayground, { model: 'jev-fixture', configured: true, disabled: false, onBusyChange: () => {} })); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Playground statement' }).props.onChange({ target: { value: 'Can the museum admit us at six?' } }); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Question 1 ID' }).props.onChange({ target: { value: 'question_1' } }); });
    await act(async () => { button(renderer, '+ Noul').props.onClick(); });
    const preview = JSON.parse(text(renderer.root.findByProps({ 'aria-label': 'Live JEV request JSON' })));
    assert.equal(preview.state, 'Can the museum admit us at six?');
    assert.equal(preview.questions.question_2.type, 'noul');
    await act(async () => { await button(renderer, 'Run custom JEV request').props.onClick(); });
    assert.equal(calls.length, 1);
    assert.equal((calls[0] as { mode: string }).mode, 'playground');
    assert.match(text(renderer.root), /Choice: hours/);
    assert.match(text(renderer.root), /Yes probability: 80\.0%/);
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Question 2 instructions' }).props.onChange({ target: { value: '' } }); });
    assert.equal(button(renderer, 'Run custom JEV request').props.disabled, true);
    assert.match(text(renderer.root), /Complete the request/);
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = oldFetch; }
});
