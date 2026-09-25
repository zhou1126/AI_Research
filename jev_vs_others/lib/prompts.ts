import type { ChessContext } from './context';

const WHOLE_BOARD_STRATEGY = `WHOLE-BOARD STRATEGY:
Treat all your pieces and pawns as a coordinated team. Assess every piece and pawn on BOTH sides, including pieces far from the last move: their activity, mobility, attacks, defensive duties, and interactions with other pieces.
Assess both kings, pawn structure, central control, open files and diagonals, weak squares, and potential promotion threats. Identify your least active pieces and the opponent's threats and likely plans.
Compare serious legal candidates involving different pieces and different plans. When no forcing tactic takes priority, choose a move that improves the position of your team as a whole: develop inactive pieces, coordinate attackers and defenders, support pawn breaks, and maintain king safety.
For each serious candidate, anticipate the opponent's strongest plausible legal responses and your own follow-up. Consider both forcing replies and quiet defensive or developing moves. Test whether your plan still works against resistance; do not rely on a single convenient predicted reply or assume you know what the opponent will play.
Account for how moving one piece changes the roles of others: defenders it abandons, lines it opens or blocks, overloaded defenders, and opportunities for coordinated threats. Avoid advancing an isolated piece without support or repeatedly moving the same piece while the rest remain undeveloped, unless a concrete tactical or defensive need justifies it.
Use the full history to understand existing plans, but revise the plan when the current position or the opponent's reply demands it. Coordination does not mean every piece must move or attack; a piece may best serve the team by defending or holding its square.
Select one legal move that best serves this coordinated plan while respecting immediate tactical threats and material costs.`;

const MATERIAL_COST_CHECK = `MATERIAL COST CHECK:
Use the supplied piece values: pawn = 1, knight = 3, bishop = 3, rook = 5, queen = 9. The king is priceless; checkmate takes priority over material.
For each serious candidate, examine the position AFTER the move and the opponent's strongest legal replies. Do not assume the opponent will cooperate or miss a capture.
Check whether the moved piece can be captured, whether moving it leaves another piece undefended, and whether it exposes a fork, pin, skewer, or mating threat.
For captures and exchanges, consider the likely sequence of captures and recaptures until the exchange settles. Compare the total value of enemy material won with your own material lost, including promotion gains. Count the whole exchange, not just the first capture.
For example, if your rook captures a pawn and the opponent then captures that rook, with no further recovery, you gained 1 and lost 5: a net material loss of 4 pawn units. Avoid this unless there is concrete sufficient compensation.
An attacked piece is not necessarily lost: check whether the capture is legal and whether recaptures or forcing tactics make it unfavorable for the opponent. A defended piece is not necessarily safe if the exchange still loses material.
Prefer a move that preserves material over one that gives away a piece for no compensation. Accept a material sacrifice only for a concrete benefit such as forced mate, a favorable tactical continuation, or avoiding an otherwise forced loss. A vague hope of an attack is not sufficient compensation.
If every move loses material, compare the least costly continuations while still prioritizing win over draw over loss.`;

export const LLM_PROMPT = `You are playing chess with the objective of maximizing the probability of winning the game.

Analyze the supplied current position, full move history, material information, and legal moves.

Before selecting a move, consider:
1. Immediate checks, captures, and threats for both sides.
2. The opponent's strongest response to each serious candidate move.
3. Tactical consequences, including checks, forks, pins, skewers, discovered attacks, hanging pieces, and mating threats.
4. Material consequences.
5. King safety.
6. Positional factors and long-term consequences when no forcing tactic dominates.
7. Whether the move allows an immediate tactical refutation.

${WHOLE_BOARD_STRATEGY}

${MATERIAL_COST_CHECK}

Choose exactly ONE move from the supplied list of legal UCI moves.

Do not output a move that is not in the supplied legal-move list.
Do not invent probabilities or numerical evaluations.

Return only a JSON object in this format:

{
  "move": "<legal UCI move>",
  "explanation": "<brief public chess rationale>"
}

The explanation should state the main chess reason for the move and may mention the opponent's most important reply, but should not contain private chain-of-thought or step-by-step internal reasoning.`;

export function buildJevPrompt(state: ChessContext): string {
  return `OBJECTIVE:
Win the game by checkmating the opposing king.
Prefer win > draw > loss.
Avoid moves that allow the opponent to force checkmate.
Material is only a secondary heuristic: prefer a forced win over
material gain, and do not sacrifice material without sufficient
compensation.
Assume both players claim a draw when eligible under threefold
repetition or the fifty-move rule.

STATE:
FEN: ${state.fen}
Initial FEN: ${state.initial_fen}
Full move history: ${JSON.stringify(state.history)}
History scope: ${state.history_scope}
Material information: ${JSON.stringify({ piece_values_in_pawn_units: state.piece_values_in_pawn_units, material: state.material })}

DECISION:
Choose the best move.

${WHOLE_BOARD_STRATEGY}

${MATERIAL_COST_CHECK}

${state.learning ? `LEARNING FROM PRIOR GAMES:\n${state.learning.guidance}\nReports are in state.learning.previous_games.\n\n` : ''}${state.references?.enabled ? `REFERENCE USE:\n${state.references.guidance}\nRelevant book notes and legal historical continuations are supplied in state.references.entries.\n\n` : ''}CHOICES:
${state.legal_moves.map(move => move.uci).join('\n')}`;
}
