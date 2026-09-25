import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess, play } from '../lib/chess';
import { BOOK_LINES } from '../lib/chess-library';
import { retrieveChessReferences, positionKey } from '../lib/retrieval';
import { decide } from '../lib/providers';

const fromMoves = (moves: string) => { const game = new Chess(); for (const move of moves.split(' ')) game.move(move, { strict: true }); return game; };

test('every corpus move is legal and all retrieved continuations replay from the matched position', () => {
  for (const line of BOOK_LINES) {
    const game = new Chess();
    for (const san of line.san) {
      const before = game.fen(), history = game.history();
      const refs = retrieveChessReferences(game);
      assert.ok(refs.entries.length <= 6);
      for (const entry of refs.entries.filter(e => e.match === 'exact_position')) {
        const branch = new Chess(before);
        assert.ok(entry.continuation!.length <= 6);
        for (const step of entry.continuation!) assert.equal(play(branch, step.uci).san, step.san);
      }
      assert.equal(game.fen(), before);
      assert.deepEqual(game.history(), history);
      game.move(san, { strict: true });
    }
  }
});

test('exact matching supports transpositions and respects castling and en passant rights', () => {
  const direct = fromMoves('d4 e6 e4 d5');
  const transposed = fromMoves('e4 e6 d4 d5');
  assert.deepEqual(retrieveChessReferences(direct), retrieveChessReferences(transposed));
  assert.ok(retrieveChessReferences(transposed).entries.some(e => e.id === 'french-mccutcheon' && e.continuation?.[0].uci === 'b1c3'));
  const noRights = new Chess(direct.fen().replace('KQkq', '-'));
  assert.ok(!retrieveChessReferences(noRights).entries.some(e => e.match === 'exact_position'));
  assert.notEqual(positionKey('8/8/8/3pP3/8/8/8/K6k w - d6 0 1'), positionKey('8/8/8/3pP3/8/8/8/K6k w - - 0 1'));
});

test('deviations receive no invented book move; endings retrieve appropriate notes', () => {
  const offBook = retrieveChessReferences(fromMoves('a3 h6'));
  assert.ok(!offBook.entries.some(e => e.match === 'exact_position'));
  const pawnEnding = retrieveChessReferences(new Chess('8/4k3/8/4K3/4P3/8/8/8 w - - 0 40'));
  assert.ok(pawnEnding.entries.some(e => e.id === 'opposition'));
  assert.ok(!pawnEnding.entries.some(e => e.id === 'development'));
  const mating = retrieveChessReferences(new Chess('7k/8/8/8/8/8/R7/K7 w - - 0 40'));
  assert.ok(mating.entries.some(e => e.id === 'simple-mates'));
});

test('disabled and terminal retrieval yield no references and preserve repetition history', () => {
  assert.equal(retrieveChessReferences(new Chess(), false).entries.length, 0);
  const drawn = fromMoves('Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8');
  assert.ok(drawn.isThreefoldRepetition());
  assert.equal(retrieveChessReferences(drawn).entries.length, 0);
  assert.ok(drawn.isThreefoldRepetition());
});

test('RAG off reaches both providers without references or an extra network request', async () => {
  const original = globalThis.fetch;
  const env = { CHESS_RAG_ENABLED: 'false', JEV_API_KEY: 'fixture', DEEP_SEEK_API_KEY: 'fixture', DEEP_SEEK_MODEL: 'fixture' };
  try {
    for (const engine of ['jev', 'deepseek'] as const) {
      let calls = 0;
      globalThis.fetch = async (_url, init) => {
        calls++;
        const body = JSON.parse(init!.body as string);
        const context = engine === 'jev' ? body.state : JSON.parse(body.messages[1].content);
        assert.equal(context.references.enabled, false);
        assert.deepEqual(context.references.entries, []);
        const legal = new Chess().moves({ verbose: true });
        return engine === 'jev'
          ? Response.json({ answers: { move: { choice: 'e2e4', probabilities: Object.fromEntries(legal.map(m => [m.lan, m.lan === 'e2e4' ? 1 : 0])) } } })
          : Response.json({ choices: [{ message: { content: JSON.stringify({ move: 'e2e4', explanation: 'Fixture' }) } }] });
      };
      const decision = await decide(new Chess(), engine, env, 1);
      assert.equal(decision.context?.references?.enabled, false);
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = original; }
});
