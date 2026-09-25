import { isAllowedOrigin } from '../../../lib/origin';
import { EXAMPLES } from '../../../lib/notebook/data';
import { classify, type RemoteEngine } from '../../../lib/notebook/providers';
export async function POST(request: Request) {
  if (!isAllowedOrigin(request, process.env.APP_ORIGIN)) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  let engine: RemoteEngine, text: string, demo: boolean, id: string;
  try {
    const raw = await request.text();
    if (raw.length > 10000) throw new Error('Request is too large.');
    const input = JSON.parse(raw);
    if (!input || !['demo', 'classify'].includes(input.mode)) throw new Error('Choose demo or classify.');
    demo = input.mode === 'demo'; engine = input.engine;
    if (!['jev', 'openai', 'deepseek'].includes(engine) || (demo && engine !== 'jev')) throw new Error('Invalid provider.');
    if (demo) {
      if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2000) throw new Error('Enter 1–2000 characters of text.');
      text = input.text; id = 'demo';
    } else {
      const example = EXAMPLES.find(item => item.id === input.id);
      if (!example) throw new Error('Unknown question.');
      text = example.text; id = example.id;
    }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid request.' }, { status: 400 }); }
  try { return Response.json({ id, ...await classify(text, engine, demo, process.env, request.signal) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Classification failed.' }, { status: 502 }); }
}
