import assert from 'node:assert/strict';
const base = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const deadline = Date.now() + 60000;
while (true) {
  try { const r = await fetch(base + '/api/config'); if (r.ok) break; } catch {}
  if (Date.now() > deadline) throw new Error('Dev server did not become ready within 60 seconds.');
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.equal((await fetch(base)).status, 200);
const notebookPage = await fetch(base + '/notebook');
assert.equal(notebookPage.status, 200);
assert.match(await notebookPage.text(), /Three basic JEV functions/);
const overviewPage = await fetch(base + '/jev');
assert.equal(overviewPage.status, 200);
assert.match(await overviewPage.text(), /JEV MODEL BRIEFING/);
const agentPage = await fetch(base + '/agent');
assert.equal(agentPage.status, 200);
const agentHtml = await agentPage.text();
assert.match(agentHtml, /AGENT COMPONENT/);
assert.match(agentHtml, /expected matches/);
assert.match(agentHtml, /r20/);
assert.match(agentHtml, /No approved vendor/);
const invalidCompare = await fetch(base + '/api/vendor-compare', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: 'invalid' }) });
assert.equal(invalidCompare.status, 400);
const invalidOverview = await fetch(base + '/api/jev-overview', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'invalid' }) });
assert.equal(invalidOverview.status, 400);
const invalidNotebook = await fetch(base + '/api/notebook', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'classify', engine: 'jev', id: 'not-a-question' }) });
assert.equal(invalidNotebook.status, 400);
const roomPage = await fetch(base + '/room');
assert.equal(roomPage.status, 200);
assert.match(await roomPage.text(), /Before you begin/);
for (const asset of ['floor.jpg', 'robot.png', 'key.png', 'parcel.png']) {
  const response = await fetch(`${base}/room/${asset}`);
  assert.equal(response.status, 200, `Room image ${asset} must be bundled and served locally.`);
  assert.match(response.headers.get('content-type') || '', /^image\//);
  assert.ok((await response.arrayBuffer()).byteLength > 1000);
}
const roomResponse = await fetch(base + '/api/room/analyze', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: 'mcts', scenario: { location: 'Smoke fixture', situation: 'Open room', purpose: 'Reach exit', goal: 'exit', grid: ['S.E', '...', '...'] }, history: [], maxSteps: 10, options: { iterations: 25, depth: 5, seed: 42 } }) });
assert.equal(roomResponse.status, 200);
const roomEvents = (await roomResponse.text()).trim().split('\n').map(line => JSON.parse(line));
assert.ok(roomEvents.some(event => event.type === 'progress'));
assert.equal(roomEvents.at(-1).type, 'done');
assert.ok(['east', 'south'].includes(roomEvents.at(-1).data.action));
const position = { initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: [] };
for (const engine of ['random', 'mcts']) {
  const response = await fetch(base + '/api/analyze', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ engine, position, options: { iterations: 25, rolloutDepth: 2, seed: 42 } }) });
  assert.equal(response.status, 200);
  const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.at(-1).type, 'done');
  assert.equal(events.at(-1).data.candidates.length, 20);
  if (engine === 'mcts') assert.ok(events.some(event => event.type === 'progress'));
}
const forbidden = await fetch(base + '/api/analyze', { method: 'POST', headers: { Origin: 'https://unrelated.example' }, body: '{}' });
assert.equal(forbidden.status, 403);
console.log('Local HTTP checks passed: Jev briefing, agent comparison, chess, room and notebook pages, demo validation, rules introduction, bundled room images, random, streamed chess/room MCTS, origin rejection. No provider API calls made.');
if (process.env.SMOKE_EXTERNAL_ORIGIN) {
  const response = await fetch(base + '/api/analyze', { method: 'POST', headers: { Origin: process.env.SMOKE_EXTERNAL_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: 'random', position }) });
  assert.equal(response.status, 200, 'The configured forwarded origin must pass framework and API checks.');
  assert.equal(JSON.parse((await response.text()).trim()).type, 'done');
  console.log('Configured external HTTPS origin passed end to end.');
}
