import { candidates, type Chess } from './chess';
import type { ChessReferences } from './retrieval';
import type { LearningContext } from './learning';

/** Shared pawn-unit material convention. King is excluded from material accounting, never tradable. */
export const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PIECE_GUIDE = {
  pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9,
  king: 'Priceless: cannot be captured or traded. Checkmate decides the game. Excluded from material totals.',
};
export const CHESS_OBJECTIVE = 'Win by checkmating the opposing king. Win > draw > loss. Avoid being checkmated. Material points are a secondary heuristic, not the goal: prefer a forced win over material gain, and do not give away pieces without sufficient compensation. Both players claim available threefold-repetition and fifty-move draws.';
export function materialTotals(game: Chess) {
  const totals = { white: 0, black: 0 };
  for (const piece of game.board().flat()) if (piece) totals[piece.color === 'w' ? 'white' : 'black'] += PIECE_VALUES[piece.type];
  return totals;
}
export function buildChessContext(game: Chess, references?: ChessReferences, learning?: LearningContext) {
  const history = game.history({ verbose: true });
  const material = materialTotals(game);
  return {
    context_version: 2,
    objective: CHESS_OBJECTIVE,
    side_to_move: game.turn() === 'w' ? 'White' : 'Black',
    initial_fen: history[0]?.before ?? game.fen(),
    fen: game.fen(),
    board: game.ascii(),
    in_check: game.inCheck(),
    piece_values_in_pawn_units: PIECE_GUIDE,
    material: { ...material, side_to_move_advantage: game.turn() === 'w' ? material.white - material.black : material.black - material.white },
    history: history.map((move, index) => ({
      ply: index + 1, move_number: Number(move.before.split(' ')[5]), side: move.color === 'w' ? 'White' : 'Black',
      san: move.san, uci: move.lan, piece: move.piece, captured: move.captured ?? null, promotion: move.promotion ?? null,
    })),
    history_san: game.history(),
    history_uci: history.map(move => move.lan),
    pgn: game.pgn(),
    history_scope: 'Complete history from initial_fen. Any play before a custom starting FEN is unknown.',
    decision_checklist: [
      'Check whether a legal move delivers checkmate now. Prefer it.',
      'Consider the opponent’s strongest replies, especially checks, captures and mating threats.',
      'Protect your king and avoid hanging your queen, rooks or minor pieces. Consider recaptures before taking a piece.',
      'Use the full history to understand prior plans and repetitions. Develop pieces and contest the center when tactically safe.',
      'Choose exactly one listed legal move; each resulting_fen is the board AFTER that move, with the opponent to play.',
    ],
    legal_moves: candidates(game).map(c => ({ uci: c.uci, san: c.san, resulting_fen: c.fen })),
    ...(references ? { references } : {}),
    ...(learning ? { learning } : {}),
  };
}
export type ChessContext = ReturnType<typeof buildChessContext>;
