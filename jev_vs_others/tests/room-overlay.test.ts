import test from 'node:test';
import assert from 'node:assert/strict';
import { roomContext, type RoomDecision, type RoomScenario } from '../lib/room';
import { roomOverlays } from '../lib/room-overlay';

const scenario: RoomScenario = { location: '', situation: '', purpose: '', grid: ['SKDE', '....', '....'], goal: 'exit' };
test('room overlays preserve JEV probabilities and distinguish pickup, movement and door targets', () => {
  const decision: RoomDecision = { engine: 'jev', action: 'pickup_key', elapsedMs: 1, explanation: '', context: roomContext(scenario, ['east']), candidates: [
    { action: 'pickup_key', probability: .73 }, { action: 'west', probability: .27 }, { action: 'south', probability: 0 },
  ] };
  const overlays = roomOverlays(decision);
  assert.deepEqual(overlays.map(o => [o.action, o.x, o.y, o.score, o.chosen]), [
    ['pickup_key', 1, 0, .73, true], ['west', 0, 0, .27, false], ['south', 1, 1, 0, false],
  ]);
  assert.equal(overlays[0].badge, 'Pick up 73.0%');
  assert.equal(overlays[2].badge, '↓ 0.0%');
  const unlock = roomOverlays({ ...decision, action: 'unlock_door', context: roomContext(scenario, ['east', 'pickup_key']), candidates: [{ action: 'unlock_door', probability: 1 }] })[0];
  assert.deepEqual([unlock.x, unlock.y, unlock.badge], [2, 0, 'Unlock 100.0%']);
  assert.match(unlock.description, /probability, selected/);
});

test('MCTS overlays normalize actual root visits and never display a supplied probability', () => {
  const decision: RoomDecision = { engine: 'mcts', action: 'east', elapsedMs: 1, explanation: '', context: roomContext(scenario, []), iterations: 999, candidates: [
    { action: 'east', visits: 3, probability: .1 }, { action: 'south', visits: 1 },
  ] };
  assert.deepEqual(roomOverlays(decision).map(o => [o.score, o.metric]), [[.75, 'visit share'], [.25, 'visit share']]);
  const waiting = roomOverlays({ ...decision, candidates: [{ action: 'east', visits: 0 }] })[0];
  assert.equal(waiting.score, undefined);
  assert.equal(waiting.badge, '→ —');
});
