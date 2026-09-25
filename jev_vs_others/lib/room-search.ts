import { rng } from './chess';
import { roomActions, roomCell, roomContext, roomStart, roomStateKey, roomStep, roomSuccess, type RoomAction, type RoomDecision, type RoomScenario, type RoomState } from './room';
export type RoomSearchOptions = { iterations: number; depth: number; seed: number; maxSteps: number };
type Node = { state: RoomState; action?: RoomAction; visits: number; total: number; children: Node[]; untried: RoomAction[] };

// A deliberately simple rollout guide, not a shortest-path oracle.
function distance(scenario: RoomScenario, state: RoomState) {
  const target = roomCell(scenario, 'D') && !state.doorOpen
    ? roomCell(scenario, state.hasKey ? 'D' : 'K')
    : roomCell(scenario, scenario.goal === 'deliver' && !state.hasParcel ? 'P' : 'E');
  return target ? Math.abs(target.x - state.x) + Math.abs(target.y - state.y) : 0;
}
export async function roomMcts(scenario: RoomScenario, history: RoomAction[], options: RoomSearchOptions, progress?: (decision: RoomDecision) => void, signal?: AbortSignal): Promise<RoomDecision> {
  const started = Date.now(), context = roomContext(scenario, history, options.maxSteps), random = rng(options.seed);
  const remaining = options.maxSteps - history.length;
  if (!context.legal_actions.length || remaining <= 0) throw new Error('No further room action is available.');
  const makeNode = (state: RoomState, action?: RoomAction): Node => ({ state, action, visits: 0, total: 0, children: [], untried: roomActions(scenario, state) });
  const root = makeNode(context.current);
  const actualVisits = new Map<string, number>();
  let previous = roomStart(scenario);
  for (const action of history) { const key = roomStateKey(previous); actualVisits.set(key, (actualVisits.get(key) ?? 0) + 1); previous = roomStep(scenario, previous, action); }
  let lastPath: RoomAction[] = [];
  const uct = (parent: Node, child: Node) => child.total / child.visits + Math.SQRT2 * Math.sqrt(Math.log(parent.visits) / child.visits);
  const report = (): RoomDecision => {
    const candidates = context.legal_actions.map(({ action }) => {
      const child = root.children.find(n => n.action === action);
      return { action, visits: child?.visits ?? 0, value: child ? child.total / child.visits : undefined, uct: child ? uct(root, child) : undefined };
    }).sort((a, b) => b.visits - a.visits || (b.value ?? 0) - (a.value ?? 0));
    return { engine: 'mcts', action: candidates[0].action, candidates, context, elapsedMs: Date.now() - started, iterations: root.visits, seed: options.seed, path: lastPath, explanation: 'UCT expands legal actions and simulates the shared room rules. Rollouts mix random actions with a simple key → door → parcel → exit distance guide and avoid revisiting states when possible. Success earns 1 + 10/(1 + simulated actions); cutoff estimates stay below 0.5. Shorter successful plans score higher. Final choice uses visit count. Values are heuristic returns, not success probabilities. No shortest-path answer is supplied to the search.' };
  };
  for (let i = 0; i < options.iterations; i++) {
    if (signal?.aborted) throw new Error('Room search cancelled.');
    let node = root, steps = 0;
    const path = [root], seen = new Set<string>([roomStateKey(root.state)]);
    while (steps < remaining && !roomSuccess(scenario, node.state) && !node.untried.length && node.children.length) {
      node = node.children.reduce((best, next) => uct(node, next) > uct(node, best) ? next : best);
      path.push(node); seen.add(roomStateKey(node.state)); steps++;
    }
    if (steps < remaining && node.untried.length && !roomSuccess(scenario, node.state)) {
      const action = node.untried.splice(Math.floor(random() * node.untried.length), 1)[0];
      const child = makeNode(roomStep(scenario, node.state, action), action);
      node.children.push(child); node = child; path.push(node); steps++; seen.add(roomStateKey(node.state));
    }
    lastPath = path.slice(1).map(n => n.action!);
    let state = node.state;
    for (let depth = 0; depth < options.depth && steps < remaining && !roomSuccess(scenario, state); depth++) {
      const choices = roomActions(scenario, state).map(action => ({ action, state: roomStep(scenario, state, action) }));
      if (!choices.length) break;
      const fresh = choices.filter(c => !seen.has(roomStateKey(c.state)));
      const pool = fresh.length ? fresh : choices;
      pool.sort((a, b) => distance(scenario, a.state) - distance(scenario, b.state));
      const choice = random() < .25 ? pool[Math.floor(random() * pool.length)] : pool[0];
      state = choice.state; steps++; seen.add(roomStateKey(state));
    }
    const success = roomSuccess(scenario, state);
    const reward = success ? 1 + 10 / (1 + steps) : Math.max(0, .35 / (1 + distance(scenario, state)) + .05 * (+state.hasKey + +state.doorOpen + +state.hasParcel) - .005 * steps);
    const repeatCost = .03 * (actualVisits.get(roomStateKey(path[1]?.state ?? root.state)) ?? 0);
    for (const n of path) { n.visits++; n.total += Math.max(0, reward - (success ? 0 : repeatCost)); }
    if ((i + 1) % 25 === 0 || i + 1 === options.iterations) { progress?.(report()); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  return report();
}
