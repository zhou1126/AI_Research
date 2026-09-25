import { ROOM_LABELS, roomActions, roomCell, roomStep, type RoomAction, type RoomDecision, type RoomScenario, type RoomState } from './room';

const shortLabels: Record<RoomAction, string> = { north: '↑', south: '↓', east: '→', west: '←', pickup_key: 'Pick up', pickup_parcel: 'Pick up', unlock_door: 'Unlock' };

function floorTarget(scenario: RoomScenario, state: RoomState, action: RoomAction) {
  const target = action === 'unlock_door' ? roomCell(scenario, 'D')! : roomStep(scenario, state, action);
  return { x: target.x, y: target.y, action, label: shortLabels[action] };
}

// Show legal destinations even before analysis, without inventing probabilities.
export function roomFloorChoices(scenario: RoomScenario, state: RoomState, decision?: RoomDecision | null) {
  if (decision) return roomOverlays(decision);
  return roomActions(scenario, state).map(action => ({ ...floorTarget(scenario, state, action), score: undefined, percentage: undefined, chosen: false,
    description: `${ROOM_LABELS[action]}: analyze to see its score` }));
}

// Movement scores belong to destinations. Interactions belong to the object,
// even when the action itself does not move the agent (e.g. unlocking a door).
export function roomOverlays(decision: RoomDecision) {
  const { scenario, current } = decision.context;
  const legal = roomActions(scenario, current);
  const candidates = decision.candidates.filter(candidate => legal.includes(candidate.action));
  const totalVisits = candidates.reduce((total, candidate) => total + (candidate.visits ?? 0), 0);
  return candidates.map(candidate => {
    const score = decision.engine === 'jev' ? candidate.probability : totalVisits > 0 ? (candidate.visits ?? 0) / totalVisits : undefined;
    const metric = decision.engine === 'jev' ? 'probability' : 'visit share';
    const percentage = score === undefined ? '—' : `${(score * 100).toFixed(1)}%`;
    return { ...floorTarget(scenario, current, candidate.action), score, percentage, metric, chosen: candidate.action === decision.action,
      badge: `${shortLabels[candidate.action]} ${percentage}`,
      description: `${ROOM_LABELS[candidate.action]}: ${percentage} ${metric}${candidate.action === decision.action ? ', selected' : ''}` };
  });
}
