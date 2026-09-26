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

test('vendor demo sends every bounded choice in one server-side request and reports only validated results', async () => {
  const body = vendorRequest('jev-test');
  assert.equal(Object.keys(body.questions).length, ROSTER.length);
  assert.ok(Object.values(body.state.roster).every(value => !Object.hasOwn(value, 'expected')));
  const parsed = parseVendorResponse(fixture());
  assert.equal(parsed.decisions.length, ROSTER.length);
  assert.equal(parsed.usage?.input_tokens, 5000);
  assert.throws(() => parseVendorResponse({ ...fixture(), answers: { r01: fixture().answers.r01 } }), /missing or unexpected/);
  const originalFetch = globalThis.fetch, originalKey = process.env.JEV_API_KEY;
  process.env.JEV_API_KEY = 'test-private-key';
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer test-private-key');
    const sent = JSON.parse(init!.body as string);
    assert.equal(Object.keys(sent.questions).length, ROSTER.length);
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
    assert.equal(data.decisions.length, ROSTER.length); assert.equal(data.usage.input_tokens, 5000); assert.ok(data.elapsedMs >= 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.JEV_API_KEY; else process.env.JEV_API_KEY = originalKey;
  }
});

test('About Jev presents the architecture as a hypothesis and links to the agent tab', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(JevOverview)); });
  try {
    assert.ok(renderer.root.findAllByType('a').some(node => node.props.href === '/jev' && node.props['aria-current'] === 'page'));
    assert.ok(renderer.root.findAllByType('a').some(node => node.props.href === '/agent'));
    const hypothesis = renderer.root.findAllByType('button').find(node => label(node) === 'Our model hypothesis')!;
    await act(async () => hypothesis.props.onClick());
    assert.match(label(renderer.root), /not a verified network diagram/i);
    assert.match(label(renderer.root), /parameter count/);
  } finally { await act(async () => renderer.unmount()); }
});
