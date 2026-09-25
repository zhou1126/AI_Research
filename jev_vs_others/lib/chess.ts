import { Chess, DEFAULT_POSITION } from 'chess.js';
export { Chess, DEFAULT_POSITION };
export type Engine = 'jev' | 'mcts' | 'openai' | 'deepseek' | 'random';
export type Position = { initialFen: string; moves: string[] };
export type Candidate = { uci: string; san: string; fen: string; probability?: number; visits?: number; value?: number; exploration?: number; uct?: number };
export type Decision = { completion?: { finishReason: string | null; maxCompletionTokens: number }; context?: import('./context').ChessContext; engine: Engine; move: string; candidates: Candidate[]; elapsedMs: number; model?: string; explanation: string; iterations?: number; seed?: number; path?: string[]; snapshots?: { iteration: number; leader: string; visits: number }[]; usage?: unknown };
export function replay(position: Position) {
  if (!position || typeof position.initialFen !== 'string' || !Array.isArray(position.moves) || position.moves.length > 2000) throw new Error('Invalid game history.');
  const game = new Chess(position.initialFen);
  for (const move of position.moves) {
    if (outcome(game)) throw new Error('History continues after the game ended.');
    play(game, move);
  }
  return game;
}
export function play(game: Chess, uci: string) {
  const legal = game.moves({ verbose: true }).find(m => m.lan === uci);
  if (!legal) throw new Error('Engine returned an illegal move. The board was not changed.');
  return game.move(legal);
}
export function candidates(game: Chess): Candidate[] {
  return game.moves({ verbose: true }).map(m => ({ uci: m.lan, san: m.san, fen: m.after }));
}
// Match policy: both AIs always exercise available threefold / 50-move claims.
export function outcome(game: Chess): { result: string; reason: string } | null {
  if (game.isCheckmate()) return { result: game.turn() === 'w' ? '0-1' : '1-0', reason: 'Checkmate' };
  if (game.isStalemate()) return { result: '1/2-1/2', reason: 'Stalemate' };
  if (game.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'Insufficient mating material' };
  if (game.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'Threefold repetition · draw claimed' };
  if (game.isDrawByFiftyMoves()) return { result: '1/2-1/2', reason: '50-move rule · draw claimed' };
  return null;
}
export function rng(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
