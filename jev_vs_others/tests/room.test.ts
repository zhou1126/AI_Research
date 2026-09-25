import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_PRESETS, replayRoom, roomActions, roomStart, roomStep, roomSuccess, shortestRoomPlan, validateRoom, type RoomScenario, type RoomAction } from '../lib/room';
import { roomMcts } from '../lib/room-search';
import { roomJev } from '../lib/room-provider';
import { POST } from '../app/api/room/analyze/route';
const room = (grid: string[], goal: 'exit' | 'deliver' = 'exit'): RoomScenario => ({ location: 'Fixture', situation: 'Visible map', purpose: 'Reach the goal', grid, goal });

test('room rules enforce bounds, walls, explicit pickups, key prerequisites and unit-cost unlocking', () => {
  const scenario = validateRoom(room(['SKDE', '####', '....']));
  const start = roomStart(scenario);
  assert.deepEqual(roomActions(scenario, start), ['east']);
  assert.throws(() => roomStep(scenario, start, 'north'));
  assert.throws(() => roomStep(scenario, start, 'pickup_key'));
  const onKey = roomStep(scenario, start, 'east');
  assert.equal(onKey.hasKey, false);
  assert.ok(!roomActions(scenario, onKey).includes('east'));
  assert.ok(!roomActions(scenario, onKey).includes('unlock_door'));
  const key = roomStep(scenario, onKey, 'pickup_key');
  const unlocked = roomStep(scenario, key, 'unlock_door');
  assert.equal(unlocked.x, 1);assert.ok(unlocked.doorOpen);
  assert.ok(roomActions(scenario, unlocked).includes('east'));
  const plan = shortestRoomPlan(scenario)!;
  assert.deepEqual(plan, ['east', 'pickup_key', 'unlock_door', 'east', 'east']);
  const end = replayRoom(scenario, plan);assert.ok(roomSuccess(scenario, end));
  assert.throws(() => replayRoom(scenario, [...plan, 'west']));
  assert.deepEqual(start, roomStart(scenario));
});

test('delivery requires the parcel; shortest-path benchmark includes interactions and reports unreachable rooms', () => {
  const scenario = room(['SPE', '...', '...'], 'deliver');
  const withoutParcel = replayRoom(scenario, ['east', 'east']);assert.equal(roomSuccess(scenario, withoutParcel), false);
  assert.equal(shortestRoomPlan(scenario)!.length, 3);
  assert.equal(shortestRoomPlan(room(['S#E', '###', '...'])), null);
  for (const preset of ROOM_PRESETS) { const plan = shortestRoomPlan(validateRoom(preset.scenario))!; assert.ok(roomSuccess(preset.scenario, replayRoom(preset.scenario, plan))); }
  assert.equal(shortestRoomPlan(ROOM_PRESETS[0].scenario)!.length, 13);
  assert.equal(shortestRoomPlan(ROOM_PRESETS[1].scenario)!.length, 8);
  assert.throws(() => validateRoom(room(['S.E', '##', '...'])));
  assert.throws(() => validateRoom(room(['SSE', '...', '...'])));
  assert.throws(() => validateRoom(room(['S.E', '...', '...'], 'deliver')));
});

test('room MCTS is seeded, conserves visits, emits progress and leaves the input intact', async () => {
  const scenario = room(['S.E', '...', '...']), history: RoomAction[] = [];
  const before = JSON.stringify(scenario), snapshots: number[] = [];
  const options = { iterations: 100, depth: 12, seed: 42, maxSteps: 20 };
  const a = await roomMcts(scenario, history, options, d => snapshots.push(d.iterations!));
  const b = await roomMcts(scenario, history, options);
  assert.equal(a.action, 'east');assert.deepEqual(a.candidates, b.candidates);
  assert.equal(a.candidates.reduce((sum, c) => sum + c.visits!, 0), 100);
  assert.deepEqual(snapshots, [25, 50, 75, 100]);
  assert.equal(JSON.stringify(scenario), before);assert.deepEqual(history, []);
  assert.equal(a.context.step_limit, 20);assert.equal(a.context.remaining_steps, 20);
  assert.ok(!('optimalSteps' in a.context));
  const abort = new AbortController();abort.abort();
  await assert.rejects(roomMcts(scenario, [], options, undefined, abort.signal), /cancelled/);
});

test('JEV receives descriptions, map, history and legal actions; invalid responses never produce an action', async () => {
  const original = globalThis.fetch, scenario = room(['SPE', '...', '...'], 'deliver'), history: RoomAction[] = ['east'];
  let mode = 'ok';
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      assert.deepEqual(body.state.scenario, scenario);assert.deepEqual(body.state.history, history);
      assert.equal(body.state.current.hasParcel, false);assert.equal(body.state.remaining_steps, 19);
      assert.deepEqual(Object.keys(body.questions.action.criteria), body.state.legal_actions.map((a: { action: string }) => a.action));
      const keys = Object.keys(body.questions.action.criteria);
      if (mode === 'http') return new Response('secret provider body', { status: 503 });
      return Response.json({ model: 'fixture-resolved', answers: { action: { choice: mode === 'illegal' ? 'teleport' : 'pickup_parcel', probabilities: mode === 'missing' ? {} : Object.fromEntries(keys.map(k => [k, k === 'pickup_parcel' ? 1 : 0])) } } });
    };
    const result = await roomJev(scenario, history, 20, { JEV_API_KEY: 'fixture' });
    assert.equal(result.action, 'pickup_parcel');assert.equal(result.model, 'fixture-resolved');assert.equal(result.context.step_limit, 20);
    mode = 'illegal';await assert.rejects(roomJev(scenario, history, 20, { JEV_API_KEY: 'fixture' }), /illegal/);
    mode = 'missing';await assert.rejects(roomJev(scenario, history, 20, { JEV_API_KEY: 'fixture' }), /probability/);
    mode = 'http';await assert.rejects(roomJev(scenario, history, 20, { JEV_API_KEY: 'fixture' }), e => e instanceof Error && e.message.includes('503') && !e.message.includes('secret'));
    assert.deepEqual(history, ['east']);
  } finally { globalThis.fetch = original; }
});

test('room API streams local decisions, rejects invalid history, unreachable maps, step overruns and cross-origin requests', async () => {
  const previous = process.env.APP_ORIGIN;process.env.APP_ORIGIN = 'http://localhost:3000';
  const body = { engine: 'mcts', scenario: room(['S.E', '...', '...']), history: [], maxSteps: 20, options: { iterations: 25, depth: 5 } };
  const request = (input: unknown, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/room/analyze', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify(input) });
  try {
    const response = await POST(request(body));assert.equal(response.status, 200);
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.ok(events.some(e => e.type === 'progress'));assert.equal(events.at(-1).type, 'done');
    for (const patch of [{ history: ['north'] }, { history: ['east'], maxSteps: 1 }, { scenario: room(['S#E', '###', '...']) }, { engine: 'openai' }, { maxSteps: '20' }]) assert.equal((await POST(request({ ...body, ...patch }))).status, 400);
    assert.equal((await POST(request(body, 'https://unrelated.example'))).status, 403);
  } finally { if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous; }
});
