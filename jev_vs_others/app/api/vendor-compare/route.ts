import { isAllowedOrigin } from '../../../lib/origin';
import { providerConfig } from '../../../lib/providers';
import { parseVendorResponse, vendorRequest } from '../../../lib/jev-overview';
import { llmVendorRequest, parseLlmVendorResponse, type RemoteEngine } from '../../../lib/vendor/comparison';

export async function POST(request: Request) {
  if (!isAllowedOrigin(request, process.env.APP_ORIGIN)) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  let engine: RemoteEngine;
  try {
    const text = await request.text();
    if (text.length > 100) throw new Error();
    const parsed = JSON.parse(text);
    if (!parsed || Object.keys(parsed).length !== 1 || !['jev', 'openai', 'deepseek'].includes(parsed.engine)) throw new Error();
    engine = parsed.engine;
  } catch { return Response.json({ error: 'Invalid comparison request.' }, { status: 400 }); }
  const config = providerConfig(process.env, engine);
  if (!config.key || !config.model) return Response.json({ error: `${engine.toUpperCase()} key or model is not configured.` }, { status: 502 });
  let url: URL;
  try { url = new URL(config.url); if (url.protocol !== 'https:') throw new Error(); }
  catch { return Response.json({ error: 'Provider endpoints must use HTTPS.' }, { status: 502 }); }
  const body = engine === 'jev' ? vendorRequest(config.model) : llmVendorRequest(engine, config.model);
  const started = performance.now();
  try {
    const response = await fetch(url, { method: 'POST', redirect: 'manual', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]) });
    if (!response.ok) return Response.json({ error: `${engine.toUpperCase()} returned HTTP ${response.status}. Check credentials, model, balance and rate limits.` }, { status: 502 });
    const parsed = engine === 'jev' ? parseVendorResponse(await response.json()) : parseLlmVendorResponse(await response.json());
    return Response.json({ engine, ...parsed, model: parsed.model || config.model, elapsedMs: performance.now() - started, request: body }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: `${engine.toUpperCase()} failed, timed out, or returned an invalid answer.` }, { status: 502 }); }
}
