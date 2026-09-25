import { PIECE_VALUES, materialTotals } from './context';
import { Chess, candidates, outcome, rng, type Decision } from './chess';
type Node = { move: string; san: string; visits: number; total: number; children: Node[]; untried: string[]; turn: string };
export type SearchOptions = { iterations: number; rolloutDepth: number; exploration: number; seed: number };
export function evaluate(game: Chess, root: string): number {
  const end = outcome(game);
  if (end) return end.result === '1/2-1/2' ? .5 : game.turn() === root ? 0 : 1;
  const totals = materialTotals(game);
  const material = root === 'w' ? totals.white - totals.black : totals.black - totals.white;
  // Nonterminal material estimates never equal a proven win or loss.
  return Math.max(.01, Math.min(.99, 1 / (1 + Math.exp(-material / 4))));
}
export async function mcts(game: Chess, options: SearchOptions, progress?: (d: Decision) => void, signal?: AbortSignal): Promise<Decision> {
  if (outcome(game)) throw new Error('The game has ended.');
  const started = Date.now(), random = rng(options.seed), rootColor = game.turn();
  function node(move = '', san = ''): Node { return { move, san, visits: 0, total: 0, children: [], untried: game.moves({ verbose: true }).map(m => m.lan), turn: game.turn() }; }
  const root = node(), legal = candidates(game), snapshots: NonNullable<Decision['snapshots']> = [];
  let lastPath: string[] = [];
  function score(parent: Node, child: Node) {
    const q = child.total / child.visits;
    return (parent.turn === rootColor ? q : 1-q) + options.exploration * Math.sqrt(Math.log(parent.visits) / child.visits);
  }
  function report(): Decision {
    const rows = legal.map(c => {
      const n = root.children.find(n => n.move === c.uci);
      const exploration = n ? options.exploration * Math.sqrt(Math.log(Math.max(1,root.visits)) / n.visits) : undefined;
      return { ...c, visits: n?.visits ?? 0, value: n ? n.total/n.visits : undefined, exploration, uct: n ? score(root,n) : undefined };
    }).sort((a,b) => b.visits-a.visits || (b.value ?? 0)-(a.value ?? 0));
    return { engine: 'mcts', move: rows[0].uci, candidates: rows, elapsedMs: Date.now()-started, iterations: root.visits, seed: options.seed, path: lastPath, snapshots: [...snapshots], explanation: `The goal is checkmate: win=1, draw=0.5, loss=0. UCT selects branches; one new child is expanded per simulation. Random legal rollouts run up to ${options.rolloutDepth} plies, then material gives a secondary heuristic score (pawn=${PIECE_VALUES.p}, knight=${PIECE_VALUES.n}, bishop=${PIECE_VALUES.b}, rook=${PIECE_VALUES.r}, queen=${PIECE_VALUES.q}; king is priceless). Nonterminal scores stay between 0.01 and 0.99. Values are from the root player's perspective; opponents minimize that value. The final move has the most visits. Scores are not calibrated win probabilities.` };
  }
  for (let i=0;i<options.iterations;i++) {
    if (signal?.aborted) throw new Error('Search cancelled.');
    let current = root, made = 0;
    const path = [root];
    while (!outcome(game) && current.untried.length === 0 && current.children.length) {
      current = current.children.reduce((best,n) => score(current,n)>score(current,best) ? n : best);
      game.move(current.move); made++; path.push(current);
    }
    if (!outcome(game) && current.untried.length) {
      const index = Math.floor(random()*current.untried.length);
      const move = current.untried.splice(index,1)[0], played = game.move(move); made++;
      const child = node(move, played.san); current.children.push(child); current = child; path.push(child);
    }
    lastPath = path.slice(1).map(n=>n.san);
    for(let depth=0;depth<options.rolloutDepth && !outcome(game);depth++) {
      const moves = game.moves(); game.move(moves[Math.floor(random()*moves.length)]); made++;
    }
    const reward = evaluate(game,rootColor);
    for(const n of path) { n.visits++; n.total+=reward; }
    while(made-->0) game.undo();
    if ((i+1)%25 === 0 || i === options.iterations-1) {
      const d = report(); snapshots.push({iteration:i+1,leader:d.candidates[0].san,visits:d.candidates[0].visits!});
      progress?.(report()); await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  return report();
}
