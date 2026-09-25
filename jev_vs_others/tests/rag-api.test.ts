import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/analyze/route';
import { GET } from '../app/api/config/route';
import { Chess, DEFAULT_POSITION } from '../lib/chess';

test('RAG request overrides the default for both providers, omitted setting uses default, invalid values fail', async () => {
  const originalFetch = globalThis.fetch;
  const fixture = { APP_ORIGIN: 'http://localhost:3000', JEV_API_KEY: 'fixture', DEEP_SEEK_API_KEY: 'fixture', DEEP_SEEK_MODEL: 'fixture', CHESS_RAG_ENABLED: 'false' };
  const previous = Object.fromEntries(Object.keys(fixture).map(k => [k, process.env[k]]));
  Object.assign(process.env, fixture);
  const request = (engine: string, ragEnabled?: unknown) => new Request('http://localhost:3000/api/analyze', { method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: JSON.stringify({ engine, ragEnabled, position: { initialFen: DEFAULT_POSITION, moves: [] } }) });
  let calls = 0;
  try {
    for (const engine of ['jev', 'deepseek']) for (const defaultEnabled of [false, true]) {
      process.env.CHESS_RAG_ENABLED = String(defaultEnabled);
      const config = await GET().json() as Record<string, { ragEnabled: boolean }>;
      assert.equal(config[engine].ragEnabled, defaultEnabled);
      for (const override of [true, false, undefined]) {
        const expected = override ?? defaultEnabled;
        globalThis.fetch = async (_url, init) => {
          calls++;
          const body = JSON.parse(init!.body as string);
          const context = engine === 'jev' ? body.state : JSON.parse(body.messages[1].content);
          assert.equal(context.references.enabled, expected);
          assert.equal(context.references.entries.length > 0, expected);
          return engine === 'jev'
            ? Response.json({ answers: { move: { choice: 'e2e4', probabilities: Object.fromEntries(new Chess().moves({ verbose: true }).map(m => [m.lan, m.lan === 'e2e4' ? 1 : 0])) } } })
            : Response.json({ choices: [{ message: { content: JSON.stringify({ move: 'e2e4', explanation: 'Fixture' }) } }] });
        };
        const response = await POST(request(engine, override));
        assert.equal(response.status, 200);
        const event = JSON.parse((await response.text()).trim());
        assert.equal(event.type, 'done');
        assert.equal(event.data.context.references.enabled, expected);
        assert.equal(process.env.CHESS_RAG_ENABLED, String(defaultEnabled));
      }
    }
    assert.equal(calls, 12);
    for (const invalid of ['false', 0, null, {}]) {
      const response = await POST(request('jev', invalid));
      assert.equal(response.status, 400);
      assert.match((await response.json() as { error: string }).error, /ragEnabled must be a boolean/);
    }
    assert.equal(calls, 12);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
