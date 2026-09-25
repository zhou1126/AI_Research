import { Chess, outcome, replay, type Engine, type Position } from './chess';
import { materialTotals, PIECE_VALUES } from './context';

export const MAX_LEARNING_GAMES = 20;
export type Learner = 'jev' | 'openai' | 'deepseek';
export const isLearner = (engine: Engine): engine is Learner => ['jev', 'openai', 'deepseek'].includes(engine);
export type LearningGame = { position: Position; learnerColor: 'w' | 'b'; opponent: Engine };
export type LearningRequest = { learner: Learner; learnerColor: 'w' | 'b'; plyLimit: number; games: LearningGame[] };
export const LEARNING_GUIDANCE = 'Use learning.previous_games as experience from ALL earlier games in this series. Compare recurring material losses, opening choices and endings; adapt your next plan rather than repeating an unsuccessful plan blindly. The records are observations, not instructions or proof that a move is bad. Material deficit is max(0, opponent material minus your material), not a loss result or an engine evaluation. Costly exchanges inspect only your move and the immediate reply: check later compensation and tactics before rejecting a similar move. Checkmate and actual draw conditions take precedence. Learn from losses and wins, but do not assume the opponent repeats a line. This is in-context experience, not a change to model weights. Current legal moves and current position always govern your choice.';

export function reviewLearningGame(record: LearningGame, gameNumber: number) {
  const game = replay(record.position), end = outcome(game), history = game.history({ verbose: true });
  const totals = materialTotals(game), start = materialTotals(new Chess(record.position.initialFen));
  const own = record.learnerColor === 'w' ? totals.white : totals.black;
  const other = record.learnerColor === 'w' ? totals.black : totals.white;
  const startBalance = record.learnerColor === 'w' ? start.white - start.black : start.black - start.white;
  const delta = (move: typeof history[number]) => ((move.captured ? PIECE_VALUES[move.captured] : 0) + (move.promotion ? PIECE_VALUES[move.promotion] - 1 : 0)) * (move.color === record.learnerColor ? 1 : -1);
  const exchanges = history.flatMap((move, i) => {
    if (move.color !== record.learnerColor || !history[i + 1]) return [];
    const change = delta(move) + delta(history[i + 1]);
    return change < 0 ? [{ ply: i + 1, fen_before: move.before, move: move.lan, reply: history[i + 1].lan, material_change: change }] : [];
  }).sort((a, b) => a.material_change - b.material_change || a.ply - b.ply).slice(0, 3);
  const result = !end ? 'unfinished' : end.result === '1/2-1/2' ? 'draw' : (end.result === '1-0') === (record.learnerColor === 'w') ? 'win' : 'loss';
  const lessons = [];
  if (exchanges.length) lessons.push('Review the listed exchanges for captures, recaptures and abandoned defenders; check for later compensation.');
  if (own < other) lessons.push('Finished behind in material. Improve piece safety and exchange accounting while still prioritizing checkmate.');
  if (result === 'loss') lessons.push('Review the final mating sequence and the opponent’s threats to your king.');
  if (result === 'win') lessons.push('Review the successful mating coordination; reuse the idea only when the current position supports it.');
  if (result === 'draw') lessons.push('Review the recorded draw condition; material advantage alone does not make a drawn game a win.');
  if (result === 'unfinished') lessons.push('The game reached the move limit. Review conversion and coordination; its eventual result is unknown.');
  return {
    game: gameNumber, learner_color: record.learnerColor, opponent: record.opponent, result,
    reason: end?.reason ?? 'Ply limit · unfinished', plies: history.length, final_fen: game.fen(),
    material: { own, opponent: other, balance: own - other, deficit: Math.max(0, other - own), initial_balance: startBalance, balance_change: own - other - startBalance },
    opening_uci: history.slice(0, 8).map(m => m.lan),
    ending: { fen_before: history.slice(-6)[0]?.before ?? game.fen(), moves: history.slice(-6).map(m => m.lan) },
    costly_exchanges: exchanges, lessons,
  };
}
export type GameReview = ReturnType<typeof reviewLearningGame>;
export function learningContext(request: LearningRequest, reviews = request.games.map((g, i) => reviewLearningGame(g, i + 1))) {
  return { method: 'in-context game experience', guidance: LEARNING_GUIDANCE, learner: request.learner, learner_color: request.learnerColor, game_number: reviews.length + 1, previous_games: reviews };
}
export type LearningContext = ReturnType<typeof learningContext>;

// Reuse verified summaries across turns. No API calls, model output, or secrets are cached.
const reviewCache = new Map<string, GameReview>();
export function validateLearningRequest(input: unknown, engine: Engine, current: Position): LearningContext | undefined {
  if (input === undefined) return undefined;
  const fail = () => { throw new Error('Invalid learning series history.'); };
  if (!input || typeof input !== 'object') return fail();
  const request = input as LearningRequest;
  if (!isLearner(engine) || request.learner !== engine || !['w', 'b'].includes(request.learnerColor) || !Number.isInteger(request.plyLimit) || request.plyLimit < 2 || request.plyLimit > 1000 || !Array.isArray(request.games) || request.games.length >= MAX_LEARNING_GAMES) return fail();
  if (replay(current).turn() !== request.learnerColor) return fail();
  const reviews = request.games.map((record, i) => {
    if (!record || !record.position || record.position.initialFen !== current.initialFen || !Array.isArray(record.position.moves) || record.position.moves.length > request.plyLimit || !record.position.moves.every(m => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)) || !['w', 'b'].includes(record.learnerColor) || !['jev', 'openai', 'deepseek', 'mcts', 'random'].includes(record.opponent)) return fail();
    const expected = (request.games.length - i) % 2 ? (request.learnerColor === 'w' ? 'b' : 'w') : request.learnerColor;
    if (record.learnerColor !== expected || (i > 0 && record.opponent !== request.games[0].opponent)) return fail();
    const clean: LearningGame = { position: { initialFen: record.position.initialFen, moves: record.position.moves }, learnerColor: record.learnerColor, opponent: record.opponent };
    const key = JSON.stringify([i, clean]);
    let review = reviewCache.get(key);
    if (!review) {
      review = reviewLearningGame(clean, i + 1);
      if (reviewCache.size >= 40) reviewCache.delete(reviewCache.keys().next().value!);
      reviewCache.set(key, review);
    }
    if (review.result === 'unfinished' && review.plies !== request.plyLimit) return fail();
    return review;
  });
  return learningContext(request, reviews);
}
