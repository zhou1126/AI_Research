import type { Candidate, Decision, Position, Engine } from './chess';
export type SquareHeat = { square: string; moves: Candidate[]; weight?: number; intensity: number };
/** Aggregate destination weights; promotions and different source pieces remain distinct in moves. */
export function destinationHeat(candidates: Candidate[], source: string | null = null): SquareHeat[] {
  // Keep visit shares relative to the entire root, even when filtering a piece.
  const visits = candidates.reduce((sum, c) => sum + (c.visits ?? 0), 0);
  const hasProbabilities = candidates.length > 0 && candidates.every(c => c.probability !== undefined);
  const hasVisits = candidates.length > 0 && candidates.every(c => c.visits !== undefined) && visits > 0;
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (source && c.uci.slice(0, 2) !== source) continue;
    const destination = c.uci.slice(2, 4);
    groups.set(destination, [...(groups.get(destination) ?? []), c]);
  }
  const rows = [...groups].map(([square, moves]) => ({ square, moves, weight: hasProbabilities ? moves.reduce((sum, c) => sum + c.probability!, 0) : hasVisits ? moves.reduce((sum, c) => sum + c.visits!, 0) / visits : undefined }));
  const maximum = Math.max(0, ...rows.map(row => row.weight ?? 0));
  return rows.map(row => ({ ...row, intensity: row.weight === undefined || maximum === 0 ? .25 : row.weight / maximum }));
}
export type PendingMove = { position: Position; decision: Decision };
export function pendingMatches(pending: PendingMove | null, position: Position, engine: Engine) {
  return !!pending && pending.decision.engine === engine && pending.position.initialFen === position.initialFen && pending.position.moves.length === position.moves.length && pending.position.moves.every((move, index) => move === position.moves[index]);
}
