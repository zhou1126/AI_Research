import { isAllowedOrigin } from '../../../../lib/origin';
import { replayRoom, roomSuccess, shortestRoomPlan, validateRoom, type RoomScenario } from '../../../../lib/room';
import { roomMcts } from '../../../../lib/room-search';
import { roomJev } from '../../../../lib/room-provider';
export async function POST(request: Request) {
  if (!isAllowedOrigin(request, process.env.APP_ORIGIN)) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  let input, scenario: RoomScenario;
  try {
    const raw = await request.text(); if (raw.length > 20000) throw new Error('Room request is too large.');
    input = JSON.parse(raw);
    if (!['jev', 'mcts'].includes(input.engine)) throw new Error('Choose JEV or MCTS.');
    scenario = validateRoom(input.scenario);
    const state = replayRoom(scenario, input.history);
    if (roomSuccess(scenario, state)) throw new Error('The room goal has already been reached.');
    if (shortestRoomPlan(scenario) === null) throw new Error('This room has no valid route to the goal. Edit the map.');
    if (!Number.isInteger(input.maxSteps) || input.maxSteps < 1 || input.maxSteps > 200 || input.history.length >= input.maxSteps) throw new Error('Room step limit must be 1–200 and not yet reached.');
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid room request.' }, { status: 400 }); }
  const bounded = (x: unknown, fallback: number, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, Math.floor(x))) : fallback;
  const options = { iterations: bounded(input.options?.iterations, 300, 25, 2000), depth: bounded(input.options?.depth, 40, 1, 80), seed: bounded(input.options?.seed, 42, 0, 2147483647), maxSteps: input.maxSteps };
  const abort = new AbortController(), encoder = new TextEncoder();
  if (request.signal.aborted) abort.abort();
  request.signal.addEventListener('abort', () => abort.abort());
  const stream = new ReadableStream({ async start(controller) {
    const send = (type: string, data: unknown) => { if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify({ type, data }) + '\n')); };
    try {
      const decision = input.engine === 'mcts' ? await roomMcts(scenario, input.history, options, d => send('progress', d), abort.signal) : await roomJev(scenario, input.history, input.maxSteps, process.env, abort.signal);
      send('done', decision);
    } catch (error) { send('error', { message: error instanceof Error ? error.message : 'Room analysis failed.' }); }
    finally { if (!abort.signal.aborted) controller.close(); }
  }, cancel() { abort.abort(); } });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
