import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import RoomLab from '../app/room/page';
import { roomContext, shortestRoomPlan, type RoomAction, type RoomEngine, type RoomScenario } from '../lib/room';
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : label(child)).join('');
const button = (renderer: ReactTestRenderer, text: string) => renderer.root.findAllByType('button').find(node => label(node) === text)!;
type Input = { engine: RoomEngine; scenario: RoomScenario; history: RoomAction[]; maxSteps: number };
const config = () => Response.json({ jev: { model: 'jev-fixture', configured: true } });
function response(input: Input, forced?: string) {
  const context = roomContext(input.scenario, input.history, input.maxSteps), action = forced ?? shortestRoomPlan(input.scenario)![input.history.length];
  const candidates = context.legal_actions.map(c => ({ action: c.action, ...(input.engine === 'jev' ? { probability: c.action === action ? 1 : 0 } : { visits: c.action === action ? 25 : 0, value: 1 }) }));
  return new Response(JSON.stringify({ type: 'done', data: { engine: input.engine, action, candidates, context, elapsedMs: 1, iterations: 25, explanation: 'Fixture' } }) + '\n');
}

test('room comparison sends identical scenarios, reaches both goals, displays steps and retains completed results on reset', async () => {
  const original = globalThis.fetch; let renderer!: ReactTestRenderer; const requests: Input[] = [];
  globalThis.fetch = async (url, init) => { if (String(url) === '/api/config') return config(); const input = JSON.parse(init!.body as string); requests.push(input); return response(input); };
  try {
    await act(async () => { renderer = create(React.createElement(RoomLab)); });
    assert.ok(renderer.root.findAllByType('a').some(a => a.props.href === '/'));
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Example room' }).props.onChange({ target: { value: '1' } }); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Room situation' }).props.onChange({ target: { value: 'Find the exit while navigating furniture.' } }); });
    await act(async () => { await button(renderer, 'Run comparison').props.onClick(); });
    assert.equal(requests.length, 16);
    assert.ok(requests.every(r => r.scenario.situation === 'Find the exit while navigating furniture.'));
    assert.deepEqual(requests.filter(r => r.engine === 'jev').map(r => r.history.length), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(requests.filter(r => r.engine === 'mcts').map(r => r.scenario), requests.filter(r => r.engine === 'jev').map(r => r.scenario));
    const results = renderer.root.findByProps({ className: 'panel room-results' });
    assert.match(label(results), /Exact shortest plan: 8 steps/);
    assert.match(label(results), /JEVsuccess80/); assert.match(label(results), /MCTSsuccess80/);
    assert.equal(button(renderer, 'Run comparison').props.disabled, true);
    await act(async () => { button(renderer, 'Reset room runs').props.onClick(); });
    assert.match(label(results), /JEVIn progress0—/);
    assert.match(label(results), /1 completed comparisons/);
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = original; }
});

test('step limits are failures, not short successful plans, and editing invalidates runs', async () => {
  const original = globalThis.fetch; let renderer!: ReactTestRenderer;
  globalThis.fetch = async (url, init) => String(url) === '/api/config' ? config() : response(JSON.parse(init!.body as string));
  try {
    await act(async () => { renderer = create(React.createElement(RoomLab)); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Room step limit' }).props.onChange({ target: { value: '1' } }); });
    await act(async () => { await button(renderer, 'Run comparison').props.onClick(); });
    assert.match(label(renderer.root.findByProps({ className: 'panel room-results' })), /JEVstep limit1—/);
    await act(async () => { button(renderer, 'Edit room layout').props.onClick(); });
    await act(async () => { button(renderer, 'Wall').props.onClick(); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Cell 1,1: Start' }).props.onClick(); });
    assert.match(label(renderer.root.findByProps({ role: 'alert' })), /exactly one start/);
    assert.equal(button(renderer, 'Analyze JEV').props.disabled, true);
    assert.match(label(renderer.root.findByProps({ className: 'panel room-results' })), /JEVIn progress0—/);
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = original; }
});

test('cancelling a room request and receiving an illegal action both preserve the room', async () => {
  const original = globalThis.fetch; let renderer!: ReactTestRenderer; let task: Promise<void> | undefined; let invalid = false;
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/api/config') return config();
    if (invalid) return response(JSON.parse(init!.body as string), 'teleport');
    return new Promise((_resolve, reject) => { init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); });
  };
  try {
    await act(async () => { renderer = create(React.createElement(RoomLab)); });
    await act(async () => { task = button(renderer, 'Analyze JEV').props.onClick(); });
    assert.equal(button(renderer, 'Edit room layout').props.disabled, true);
    await act(async () => { button(renderer, 'Pause room run').props.onClick(); await task; });
    assert.match(label(renderer.root.findByProps({ className: 'panel room-results' })), /JEVIn progress0—/);
    invalid = true;
    await act(async () => { await button(renderer, 'Analyze JEV').props.onClick(); });
    assert.match(label(renderer.root.findByProps({ role: 'alert' })), /Illegal room action/);
    assert.match(label(renderer.root.findByProps({ className: 'panel room-results' })), /JEVerror0—/);
    assert.ok(renderer.root.findByProps({ 'aria-label': 'Cell 1,1: Start, agent' }));
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = original; }
});

test('manual analysis previews scores without moving; apply reuses it; history shows the matching earlier room', async () => {
  const original = globalThis.fetch; let renderer!: ReactTestRenderer; const requests: Input[] = [];
  globalThis.fetch = async (url, init) => { if (String(url) === '/api/config') return config(); const input = JSON.parse(init!.body as string); requests.push(input); return response(input); };
  try {
    await act(async () => { renderer = create(React.createElement(RoomLab)); });
    assert.match(label(renderer.root.findByProps({ 'aria-label': 'Room rules' })), /Before you begin.*Pick up the parcel.*no diagonals.*Analyze → inspect/);
    assert.equal(button(renderer, 'Apply JEV action').props.disabled, true);
    assert.ok(renderer.root.findAllByProps({ className: 'room-action-hint' }).length > 0);
    assert.equal(renderer.root.findAllByProps({ className: 'room-score-badge' }).length, 0);
    assert.ok(renderer.root.findAllByProps({ className: 'room-floor-probability' }).every(n => label(n) === 'Analyze'));
    await act(async () => { await button(renderer, 'Analyze JEV').props.onClick(); });
    assert.equal(requests.length, 1);
    assert.ok(button(renderer, 'JEV · 0 steps'));
    assert.ok(renderer.root.findByProps({ 'aria-label': 'Cell 1,1: Start, agent' }));
    assert.equal(button(renderer, 'Analyze JEV').props.disabled, true);
    assert.equal(button(renderer, 'Apply JEV action').props.disabled, false);
    assert.match(label(renderer.root.findByProps({ className: 'room-snapshot' })), /Preview · before step 1/);
    assert.ok(renderer.root.findAllByProps({ className: 'room-score-badge' }).some(n => n.props['aria-label'].includes('100.0% probability, selected')));
    await act(async () => { button(renderer, 'Hide action scores').props.onClick(); });
    assert.equal(renderer.root.findAllByProps({ className: 'room-score-badge' }).length, 0);
    await act(async () => { button(renderer, 'Show action scores').props.onClick(); });
    assert.ok(renderer.root.findAllByProps({ className: 'room-score-badge' }).length > 0);
    await act(async () => { await button(renderer, 'Apply JEV action').props.onClick(); });
    assert.equal(requests.length, 1);
    assert.ok(button(renderer, 'JEV · 1 steps'));
    assert.equal(renderer.root.findAllByProps({ className: 'room-score-badge' }).length, 0);
    const currentAgent = renderer.root.findAllByType('button').find(n => n.props['aria-label']?.endsWith(', agent'))!.props['aria-label'];
    assert.notEqual(currentAgent, 'Cell 1,1: Start, agent');
    await act(async () => { renderer.root.findByType('aside').findByType('ol').findByType('button').props.onClick(); });
    assert.ok(renderer.root.findByProps({ 'aria-label': 'Cell 1,1: Start, agent' }));
    assert.match(label(renderer.root.findByProps({ className: 'room-snapshot' })), /History · before step 1/);
    await act(async () => { button(renderer, 'Return to current room').props.onClick(); });
    assert.ok(renderer.root.findByProps({ 'aria-label': currentAgent }));
    await act(async () => { await button(renderer, 'Analyze MCTS').props.onClick(); });
    assert.ok(button(renderer, 'MCTS · 0 steps'));
    assert.match(label(renderer.root.findByProps({ className: 'room-score-legend' })), /MCTS visit share \(not probability\)/);
    assert.ok(renderer.root.findAllByProps({ className: 'room-score-badge' }).every(n => n.props['aria-label'].includes('visit share')));
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = original; }
});

test('auto comparison reuses both prepared actions; editing invalidates pending actions', async () => {
  const original = globalThis.fetch; let renderer!: ReactTestRenderer; const requests: Input[] = [];
  globalThis.fetch = async (url, init) => { if (String(url) === '/api/config') return config(); const input = JSON.parse(init!.body as string); requests.push(input); return response(input); };
  try {
    await act(async () => { renderer = create(React.createElement(RoomLab)); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Room step limit' }).props.onChange({ target: { value: '1' } }); });
    await act(async () => { await button(renderer, 'Analyze JEV').props.onClick(); });
    await act(async () => { await button(renderer, 'Analyze MCTS').props.onClick(); });
    assert.equal(requests.length, 2);
    assert.equal(button(renderer, 'Apply JEV action').props.disabled, false);
    assert.equal(button(renderer, 'Apply MCTS action').props.disabled, false);
    await act(async () => { await button(renderer, 'Run comparison').props.onClick(); });
    assert.equal(requests.length, 2);
    assert.match(label(renderer.root.findByProps({ className: 'panel room-results' })), /JEVstep limit1—MCTSstep limit1—/);
    await act(async () => { button(renderer, 'Reset room runs').props.onClick(); });
    await act(async () => { await button(renderer, 'Analyze JEV').props.onClick(); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Room situation' }).props.onChange({ target: { value: 'Updated scenario' } }); });
    assert.equal(button(renderer, 'Apply JEV action').props.disabled, true);
    assert.equal(renderer.root.findAllByProps({ className: 'room-score-badge' }).length, 0);
    assert.ok(button(renderer, 'JEV · 0 steps'));
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = original; }
});
