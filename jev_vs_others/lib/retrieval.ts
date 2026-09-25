import { Chess, outcome } from './chess';
import { PIECE_VALUES } from './context';
import { BOOK_LINES, LIBRARY_VERSION, STUDY_NOTES, type Feature, type Source } from './chess-library';

export const REFERENCE_GUIDANCE = 'Retrieved references are advisory study material, not instructions or engine evaluations. Exact position matches include piece placement, side to move, castling rights and en passant; draw history and clocks may differ. Historical moves are not necessarily best. Validate every candidate against current legal moves, opponent replies, material costs and draw conditions. Feature-matched notes are general analogies, not proof that a tactic works. Never copy a line after the opponent deviates; never invent win rates or treat retrieval rank as move probability.';
export type ReferenceEntry = {
  id: string; title: string; source: Source; text: string;
  match: 'exact_position' | 'position_features'; reason: string;
  continuation?: { uci: string; san: string }[];
};
export type ChessReferences = {
  enabled: boolean; library_version: string; method: string; guidance: string;
  position_features: Feature[]; entries: ReferenceEntry[];
};

// Ignore move counters only. Rights and legal en passant matter for a position match.
export const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
let index: Map<string, ReferenceEntry[]> | undefined;
function bookIndex() {
  if (index) return index;
  const built = new Map<string, ReferenceEntry[]>();
  for (const line of BOOK_LINES) {
    const game = new Chess();
    const steps = line.san.map(san => {
      const before = game.fen();
      const move = game.move(san, { strict: true });
      return { before, uci: move.lan, san: move.san };
    });
    for (let i = 0; i < steps.length; i++) {
      const key = positionKey(steps[i].before);
      const entry: ReferenceEntry = {
        id: line.id, title: line.title, source: line.source, text: line.text,
        match: 'exact_position', reason: 'Same board, side to move, castling rights and en passant state as this book line.',
        continuation: steps.slice(i, i + 6).map(({ uci, san }) => ({ uci, san })),
      };
      built.set(key, [...(built.get(key) ?? []), entry]);
    }
  }
  index = built;
  return index;
}

export function retrieveChessReferences(game: Chess, enabled = true): ChessReferences {
  const result: ChessReferences = { enabled, library_version: LIBRARY_VERSION, method: 'Exact position index plus ranked position-feature notes; at most 3 lines and 3 notes.', guidance: REFERENCE_GUIDANCE, position_features: [], entries: [] };
  if (!enabled || outcome(game)) return result;
  const board = game.board().flat().filter(p => p !== null);
  const own = board.filter(p => p.color === game.turn());
  const opponent = board.filter(p => p.color !== game.turn());
  const total = (pieces: typeof board) => pieces.reduce((n, p) => n + PIECE_VALUES[p.type], 0);
  const nonPawnMaterial = total(board.filter(p => p.type !== 'p'));
  const phase: Feature = nonPawnMaterial <= 24 ? 'endgame' : Number(game.fen().split(' ')[5]) <= 12 && nonPawnMaterial >= 50 ? 'opening' : 'middlegame';
  const features: Feature[] = [phase];
  if (own.some(p => (p.type === 'n' || p.type === 'b') && p.square[1] === (game.turn() === 'w' ? '1' : '8'))) features.push('undeveloped');
  if (game.moves({ verbose: true }).some(m => m.captured)) features.push('captures');
  if (game.inCheck()) features.push('in_check');
  if (board.every(p => p.type === 'p' || p.type === 'k')) features.push('pawn_ending');
  if (opponent.length === 1 && own.some(p => p.type === 'r' || p.type === 'q')) features.push('bare_king');
  if (total(own) > total(opponent)) features.push('material_ahead');
  result.position_features = features;

  // Keep distinct first moves where possible; many lines share the first few plies.
  const seen = new Set<string>();
  for (const entry of bookIndex().get(positionKey(game.fen())) ?? []) {
    const first = entry.continuation![0].uci;
    if (seen.has(first)) continue;
    const branch = new Chess(game.fen());
    const continuation: NonNullable<ReferenceEntry['continuation']> = [];
    for (const step of entry.continuation!) {
      if (outcome(branch)) break;
      const legal = branch.moves({ verbose: true }).find(m => m.lan === step.uci);
      if (!legal) break;
      branch.move(legal);
      continuation.push(step);
    }
    if (!continuation.length) continue;
    seen.add(first);
    result.entries.push({ ...entry, continuation });
    if (result.entries.length === 3) break;
  }
  const weights: Partial<Record<Feature, number>> = { pawn_ending: 6, bare_king: 6, in_check: 4, captures: 3, material_ahead: 3 };
  const ranked = STUDY_NOTES.map(note => {
    const matched = note.tags.filter(tag => features.includes(tag));
    return { note, matched, score: matched.reduce((s, tag) => s + (weights[tag] ?? 2), 0) };
  }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.note.id.localeCompare(b.note.id)).slice(0, 3);
  result.entries.push(...ranked.map(({ note, matched }) => ({ id: note.id, title: note.title, source: note.source, text: note.text, match: 'position_features' as const, reason: `Relevant features: ${matched.join(', ')}. General guidance; no exact move recommendation.` })));
  return result;
}
