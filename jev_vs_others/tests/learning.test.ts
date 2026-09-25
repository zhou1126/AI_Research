import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POSITION, Chess, replay, type Engine } from '../lib/chess';
import { reviewLearningGame, validateLearningRequest, LEARNING_GUIDANCE, type LearningGame } from '../lib/learning';
import { POST } from '../app/api/analyze/route';

const opening = (color: 'w' | 'b'): LearningGame => ({ position: { initialFen: DEFAULT_POSITION, moves: ['e2e4', 'e7e5'] }, learnerColor: color, opponent: 'mcts' });

test('rook-for-pawn exchange records four-point deterioration separately from final deficit', () => {
  const position = { initialFen: '7k/8/4p3/3p4/8/8/8/K2R4 w - - 0 1', moves: ['d1d5', 'e6d5'] };
  const report = reviewLearningGame({ position, learnerColor: 'w', opponent: 'mcts' }, 1);
  assert.equal(report.result, 'unfinished');
  assert.deepEqual(report.material, { own: 0, opponent: 1, balance: -1, deficit: 1, initial_balance: 3, balance_change: -4 });
  assert.equal(report.costly_exchanges[0].material_change, -4);
  assert.equal(report.costly_exchanges[0].move, 'd1d5');
  assert.equal(report.costly_exchanges[0].reply, 'e6d5');
  const other = reviewLearningGame({ position, learnerColor: 'b', opponent: 'jev' }, 1);
  assert.equal(other.material.deficit, 0);assert.equal(other.material.balance_change, 4);
});

test('mate, draws and capped games keep actual results regardless of material', () => {
  const mate = { initialFen: DEFAULT_POSITION, moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] };
  assert.equal(reviewLearningGame({ position: mate, learnerColor: 'w', opponent: 'mcts' }, 1).result, 'loss');
  assert.equal(reviewLearningGame({ position: mate, learnerColor: 'b', opponent: 'mcts' }, 1).result, 'win');
  const stalemate = reviewLearningGame({ position: { initialFen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', moves: [] }, learnerColor: 'b', opponent: 'jev' }, 1);
  assert.equal(stalemate.result, 'draw');assert.equal(stalemate.material.deficit, 9);
  const promoted = reviewLearningGame({ position: { initialFen: '7k/P7/8/8/8/8/8/7K w - - 0 1', moves: ['a7a8q'] }, learnerColor: 'w', opponent: 'jev' }, 1);
  assert.equal(promoted.result, 'unfinished');assert.equal(promoted.material.balance_change, 8);
});

test('game three includes games one and two; malformed, incomplete and opponent memory is rejected', () => {
  const current = { initialFen: DEFAULT_POSITION, moves: [] };
  const input = { learner: 'jev', learnerColor: 'w', plyLimit: 2, games: [opening('w'), opening('b')] };
  const memory = validateLearningRequest(input, 'jev', current)!;
  assert.equal(memory.game_number, 3);assert.deepEqual(memory.previous_games.map(g => g.game), [1, 2]);
  assert.equal(memory.previous_games[1].learner_color, 'b');
  assert.throws(() => validateLearningRequest(input, 'deepseek', current));
  assert.throws(() => validateLearningRequest({ ...input, games: [opening('b'), opening('w')] }, 'jev', current));
  assert.throws(() => validateLearningRequest({ ...input, plyLimit: 3 }, 'jev', current));
  assert.throws(() => validateLearningRequest({ ...input, games: [{ ...opening('b'), position: { ...current, moves: ['e2e5'] } }] }, 'jev', current));
  assert.throws(() => validateLearningRequest({ ...input, games: Array(20).fill(opening('w')) }, 'jev', current));
  assert.equal(validateLearningRequest(undefined, 'mcts', current), undefined);
});

test('API supplies cumulative memory to JEV, OpenAI and DeepSeek even with book RAG off', async () => {
  const original = globalThis.fetch;
  const fixture = { APP_ORIGIN: 'http://localhost:3000', JEV_API_KEY: 'fixture', OPENAI_API_KEY: 'fixture', OPENAI_MODEL: 'fixture', DEEP_SEEK_API_KEY: 'fixture', DEEP_SEEK_MODEL: 'fixture' };
  const previous = Object.fromEntries(Object.keys(fixture).map(k => [k, process.env[k]]));
  Object.assign(process.env, fixture);
  let calls = 0;
  try {
    for (const engine of ['jev', 'openai', 'deepseek'] as Engine[]) {
      globalThis.fetch = async (_url, init) => {
        calls++;
        const body = JSON.parse(init!.body as string), state = engine === 'jev' ? body.state : JSON.parse(body.messages[1].content);
        const prompt = engine === 'jev' ? body.questions.move.instructions : body.messages[0].content;
        assert.ok(prompt.includes(LEARNING_GUIDANCE));
        assert.equal(state.learning.game_number, 3);
        assert.deepEqual(state.learning.previous_games.map((r: { game: number }) => r.game), [1, 2]);
        assert.ok(!state.references?.enabled);
        return engine === 'jev' ? Response.json({ answers: { move: { choice: 'e2e4', probabilities: Object.fromEntries(new Chess().moves({ verbose: true }).map(m => [m.lan, m.lan === 'e2e4' ? 1 : 0])) } } }) : Response.json({ choices: [{ message: { content: JSON.stringify({ move: 'e2e4', explanation: 'Fixture' }) } }] });
      };
      const position = { initialFen: DEFAULT_POSITION, moves: [] };
      const request = new Request('http://localhost:3000/api/analyze', { method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: JSON.stringify({ engine, position, ragEnabled: false, learning: { learner: engine, learnerColor: 'w', plyLimit: 2, games: [opening('w'), opening('b')] } }) });
      const response = await POST(request);assert.equal(response.status, 200);
      const event = JSON.parse((await response.text()).trim());assert.equal(event.type, 'done');
      assert.equal(event.data.context.learning.previous_games.length, 2);
      assert.equal(replay(position).fen(), DEFAULT_POSITION);
    }
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
