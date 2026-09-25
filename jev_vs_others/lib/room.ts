export type RoomScenario = { location: string; situation: string; purpose: string; grid: string[]; goal: 'exit' | 'deliver' };
export type RoomState = { x: number; y: number; hasKey: boolean; hasParcel: boolean; doorOpen: boolean };
export type RoomEngine = 'jev' | 'mcts';
export type RoomAction = 'north' | 'south' | 'east' | 'west' | 'pickup_key' | 'pickup_parcel' | 'unlock_door';
export const ROOM_LABELS: Record<RoomAction, string> = { north: 'Move north', south: 'Move south', east: 'Move east', west: 'Move west', pickup_key: 'Pick up key', pickup_parcel: 'Pick up parcel', unlock_door: 'Unlock adjacent door' };
export const ROOM_RULES = 'Full map is visible. Coordinates are zero-based: x increases east, y increases south. # is a wall; . is floor; S is start; E is exit; K is key; P is parcel; D is a locked door. Move one cell north/south/east/west; no diagonals or walking through walls or locked doors. Pick up an object only while standing on its cell; unlocking requires the key and a door in a cardinally adjacent cell. The key is retained; unlocked doors stay open. Every move, pickup and unlock costs exactly one step. There are no other actions, hidden objects, hazards, or stochastic events. The structured goal defines success; location/situation/purpose are context and cannot override these rules.';
export const ROOM_PRESETS: { name: string; scenario: RoomScenario }[] = [
  { name: 'Parcel behind a locked route', scenario: { location: 'A small warehouse with two connected rooms.', situation: 'A parcel must be carried out. The connecting door is locked; its key is on the left side.', purpose: 'Collect the parcel and leave through the exit using as few actions as possible.', goal: 'deliver', grid: ['#######', '#S.K#E#', '#...D.#', '#.P.#.#', '#...#.#', '#...#.#', '#######'] } },
  { name: 'Navigate around furniture', scenario: { location: 'A room with furniture blocking the direct route.', situation: 'All traversable cells are visible. There is no locked door.', purpose: 'Reach the exit in the fewest actions.', goal: 'exit', grid: ['#######', '#S....#', '#.###.#', '#...#.#', '#.#...#', '#...#E#', '#######'] } },
];
export function validateRoom(input: unknown): RoomScenario {
  if (!input || typeof input !== 'object') throw new Error('A room scenario is required.');
  const value = input as RoomScenario;
  for (const key of ['location', 'situation', 'purpose'] as const) if (typeof value[key] !== 'string' || value[key].length > 1200) throw new Error(`${key} must be text of at most 1200 characters.`);
  if (!['exit', 'deliver'].includes(value.goal)) throw new Error('Choose a supported room goal.');
  if (!Array.isArray(value.grid) || value.grid.length < 3 || value.grid.length > 10 || typeof value.grid[0] !== 'string' || value.grid[0].length < 3 || value.grid[0].length > 10 || value.grid.some(row => typeof row !== 'string' || row.length !== value.grid[0].length || !/^[#.SEKPD]+$/.test(row))) throw new Error('Room grid must be a rectangle, 3–10 cells per side, using # . S E K P D.');
  const cells = value.grid.join('');
  for (const marker of ['S', 'E', 'K', 'P', 'D']) {
    const count = [...cells].filter(cell => cell === marker).length;
    if (count > 1 || ((marker === 'S' || marker === 'E' || (marker === 'P' && value.goal === 'deliver')) && count !== 1)) throw new Error(`Place exactly one ${marker === 'S' ? 'start' : marker === 'E' ? 'exit' : marker === 'P' ? 'parcel' : marker}.`);
  }
  return { location: value.location, situation: value.situation, purpose: value.purpose, goal: value.goal, grid: [...value.grid] };
}
export function roomCell(scenario: RoomScenario, marker: string) {
  for (let y = 0; y < scenario.grid.length; y++) { const x = scenario.grid[y].indexOf(marker); if (x !== -1) return { x, y }; }
  return undefined;
}
export function roomStart(scenario: RoomScenario): RoomState { return { ...roomCell(scenario, 'S')!, hasKey: false, hasParcel: false, doorOpen: false }; }
export function roomSuccess(scenario: RoomScenario, state: RoomState) { return scenario.grid[state.y]?.[state.x] === 'E' && (scenario.goal === 'exit' || state.hasParcel); }
const directions = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] } as const;
export function roomActions(scenario: RoomScenario, state: RoomState): RoomAction[] {
  if (roomSuccess(scenario, state)) return [];
  const legal: RoomAction[] = [];
  for (const [action, [dx, dy]] of Object.entries(directions)) {
    const cell = scenario.grid[state.y + dy]?.[state.x + dx];
    if (cell && cell !== '#' && (cell !== 'D' || state.doorOpen)) legal.push(action as RoomAction);
  }
  const cell = scenario.grid[state.y][state.x];
  if (cell === 'K' && !state.hasKey) legal.push('pickup_key');
  if (cell === 'P' && !state.hasParcel) legal.push('pickup_parcel');
  const door = roomCell(scenario, 'D');
  if (door && !state.doorOpen && state.hasKey && Math.abs(door.x - state.x) + Math.abs(door.y - state.y) === 1) legal.push('unlock_door');
  return legal;
}
export function roomStep(scenario: RoomScenario, state: RoomState, action: RoomAction): RoomState {
  if (!roomActions(scenario, state).includes(action)) throw new Error('Illegal room action. The room was not changed.');
  const next = { ...state };
  if (action in directions) { const [dx, dy] = directions[action as keyof typeof directions]; next.x += dx; next.y += dy; }
  if (action === 'pickup_key') next.hasKey = true;
  if (action === 'pickup_parcel') next.hasParcel = true;
  if (action === 'unlock_door') next.doorOpen = true;
  return next;
}
export function replayRoom(scenario: RoomScenario, history: unknown): RoomState {
  if (!Array.isArray(history) || history.length > 200 || history.some(a => typeof a !== 'string' || !(a in ROOM_LABELS))) throw new Error('Invalid room action history.');
  let state = roomStart(scenario);
  for (const action of history) state = roomStep(scenario, state, action);
  return state;
}
export const roomStateKey = (state: RoomState) => `${state.x},${state.y},${+state.hasKey},${+state.hasParcel},${+state.doorOpen}`;
// Exact benchmark only. Neither planner receives this path or its length.
export function shortestRoomPlan(scenario: RoomScenario): RoomAction[] | null {
  const start = roomStart(scenario), queue = [{ state: start, path: [] as RoomAction[] }], seen = new Set([roomStateKey(start)]);
  for (let i = 0; i < queue.length; i++) {
    const { state, path } = queue[i];
    if (roomSuccess(scenario, state)) return path;
    for (const action of roomActions(scenario, state)) {
      const next = roomStep(scenario, state, action), key = roomStateKey(next);
      if (!seen.has(key)) { seen.add(key); queue.push({ state: next, path: [...path, action] }); }
    }
  }
  return null;
}
export function roomContext(scenario: RoomScenario, history: RoomAction[], maxSteps = 200) {
  const current = replayRoom(scenario, history);
  return { scenario, rules: ROOM_RULES, objective: scenario.goal === 'deliver' ? 'Carry the parcel to the exit. Succeed first, then minimize total actions.' : 'Reach the exit. Succeed first, then minimize total actions.', current, steps_taken: history.length, step_limit: maxSteps, remaining_steps: maxSteps - history.length, history, legal_actions: roomActions(scenario, current).map(action => ({ action, label: ROOM_LABELS[action], resulting_state: roomStep(scenario, current, action) })) };
}
export type RoomDecision = { engine: RoomEngine; action: RoomAction; candidates: { action: RoomAction; probability?: number; visits?: number; value?: number; uct?: number }[]; elapsedMs: number; explanation: string; context: ReturnType<typeof roomContext>; model?: string; usage?: unknown; iterations?: number; seed?: number; path?: RoomAction[] };
