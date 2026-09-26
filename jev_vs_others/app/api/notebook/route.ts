import { isAllowedOrigin } from '../../../lib/origin';
import { EXAMPLES } from '../../../lib/notebook/data';
import { classify, classifyJevBatch, classifyJevPrimitive, classifyJevPlayground, type RemoteEngine } from '../../../lib/notebook/providers';
import type { JevPrimitive } from '../../../lib/notebook/core';
import { buildPlaygroundBody } from '../../../lib/notebook/playground';
export async function POST(request: Request) {
  if (!isAllowedOrigin(request, process.env.APP_ORIGIN)) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  let engine: RemoteEngine, text = '', demo: boolean, id = '', mode: string, primitive: JevPrimitive | undefined, batchExamples: typeof EXAMPLES = [], playgroundDraft: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 40000) throw new Error('Request is too large.');
    const input = JSON.parse(raw);
    if (!input || !['basic', 'demo', 'primitive', 'classify', 'batch', 'playground'].includes(input.mode)) throw new Error('Invalid notebook mode.');
    mode = input.mode; demo = mode === 'demo'; engine = input.engine;
    if (mode !== 'playground' && raw.length > 10000) throw new Error('Request is too large.');
    if (!['jev', 'openai', 'deepseek'].includes(engine) || (input.mode !== 'classify' && engine !== 'jev')) throw new Error('Invalid provider.');
    if (mode === 'playground') {
      buildPlaygroundBody(input.draft, 'jev-latest');
      playgroundDraft = input.draft; id = 'playground';
    } else if (mode === 'batch') {
      if (!Array.isArray(input.ids) || ![5, 50].includes(input.ids.length) || input.ids.some((value: unknown, index: number) => value !== EXAMPLES[index].id)) throw new Error('Choose the first 5 or all 50 benchmark questions.');
      batchExamples = EXAMPLES.slice(0, input.ids.length);
    } else if (mode !== 'classify') {
      if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2000) throw new Error('Enter 1–2000 characters of text.');
      text = input.text; id = input.mode;
      if (mode === 'primitive') {
        if (!['choice', 'score', 'noul'].includes(input.primitive)) throw new Error('Choose Choice, Score or Noul.');
        primitive = input.primitive;
      }
    } else {
      const example = EXAMPLES.find(item => item.id === input.id);
      if (!example) throw new Error('Unknown question.');
      text = example.text; id = example.id;
    }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid request.' }, { status: 400 }); }
  try {
    const result = mode === 'playground' ? await classifyJevPlayground(playgroundDraft, process.env, request.signal)
      : mode === 'batch' ? await classifyJevBatch(batchExamples, process.env, request.signal)
      : mode === 'primitive' ? await classifyJevPrimitive(text, primitive!, process.env, request.signal)
        : await classify(text, engine, demo, process.env, request.signal);
    return Response.json({ id, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Classification failed.' }, { status: 502 }); }
}
