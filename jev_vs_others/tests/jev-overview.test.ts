import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { POST } from '../app/api/jev-overview/route';
import JevOverview from '../app/jev/page';
import { ROSTER, VENDOR_OPTIONS, parseVendorResponse, vendorRequest } from '../lib/jev-overview';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : label(child)).join('');
const fixture = () => ({ model: 'jev-fixture', usage: { input_tokens: 5000, output_tokens: 100 }, answers: Object.fromEntries(ROSTER.map((row, index) => [row.id, { type: 'choice', choice: row.expected, confidence: index === 1 ? 0.7 : 0.95, probabilities: Object.fromEntries(VENDOR_OPTIONS.map(option => [option, +(option === row.expected)])) }])) });

test('vendor demo sends five bounded choices in one server-side request and reports only validated results', async () => {
  const body = vendorRequest('jev-test');
  assert.equal(Object.keys(body.questions).length, ROSTER.length);
  assert.ok(Object.values(body.state.roster).every(value => !Object.hasOwn(value, 'expected')));
  const parsed = parseVendorResponse(fixture());
  assert.equal(parsed.decisions.length, 5);
  assert.equal(parsed.usage?.input_tokens, 5000);
  assert.throws(() => parseVendorResponse({ ...fixture(), answers: { r01: fixture().answers.r01 } }), /missing or unexpected/);
  const originalFetch = globalThis.fetch, originalKey = process.env.JEV_API_KEY;
  process.env.JEV_API_KEY = 'test-private-key';
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer test-private-key');
    const sent = JSON.parse(init!.body as string);
    assert.equal(Object.keys(sent.questions).length, 5);
    assert.ok(!JSON.stringify(sent).includes('test-private-key'));
    return Response.json(fixture());
  };
  const request = (origin: string, mode: string) => new Request('http://localhost:3000/api/jev-overview', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ mode }) });
  try {
    assert.equal((await POST(request('https://unrelated.example', 'vendor-demo'))).status, 403);
    assert.equal((await POST(request('http://localhost:3000', 'invalid'))).status, 400);
    assert.equal(calls, 0);
    const response = await POST(request('http://localhost:3000', 'vendor-demo'));
    assert.equal(response.status, 200); assert.equal(calls, 1);
    const data = await response.json() as { decisions: unknown[]; usage: { input_tokens: number }; elapsedMs: number };
    assert.equal(data.decisions.length, 5); assert.equal(data.usage.input_tokens, 5000); assert.ok(data.elapsedMs >= 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.JEV_API_KEY; else process.env.JEV_API_KEY = originalKey;
  }
});

test('slide navigation keeps a single live mapping result while changing the confidence threshold', async () => {
  const originalFetch = globalThis.fetch; let renderer!: ReactTestRenderer; let paidCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === '/api/config') return Response.json({ jev: { configured: true, model: 'jev-test' } });
    paidCalls++;
    return Response.json({ ...parseVendorResponse(fixture()), model: 'jev-fixture', elapsedMs: 120, request: vendorRequest('jev-test') });
  };
  try {
    await act(async () => { renderer = create(React.createElement(JevOverview)); });
    assert.match(label(renderer.root), /Jev turns a state/);
    const agentButton = renderer.root.findAllByType('button').find(node => label(node) === 'Agent example')!;
    await act(async () => agentButton.props.onClick());
    assert.match(label(renderer.root), /Roster → approved vendor mapping/);
    const run = renderer.root.findAllByType('button').find(node => label(node) === 'Run live vendor mapping')!;
    await act(async () => { await run.props.onClick(); });
    assert.equal(paidCalls, 1);
    assert.match(label(renderer.root), /5\/5 correct on this synthetic sample/);
    assert.match(label(renderer.root), /3\/5auto matched|3\/5auto matched/);
    const slider = renderer.root.findByProps({ type: 'range' });
    await act(async () => slider.props.onChange({ target: { value: '0.65' } }));
    assert.equal(paidCalls, 1);
    assert.match(label(renderer.root), /4\/5auto matched/);
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = originalFetch; }
});
