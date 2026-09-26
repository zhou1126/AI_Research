import { isAllowedOrigin } from '../../../lib/origin';
import { providerConfig } from '../../../lib/providers';
import { parseVendorResponse, vendorRequest } from '../../../lib/jev-overview';

export async function POST(request: Request) {
  if (!isAllowedOrigin(request, process.env.APP_ORIGIN)) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 256 || JSON.parse(text).mode !== 'vendor-demo') throw new Error('Invalid demo request.');
  } catch { return Response.json({ error: 'Invalid demo request.' }, { status: 400 }); }
  const config = providerConfig(process.env, 'jev');
  if (!config.key || !config.model) return Response.json({ error: 'JEV key or model is not configured.' }, { status: 502 });
  const url = new URL(config.url);
  if (url.protocol !== 'https:') return Response.json({ error: 'Provider endpoints must use HTTPS.' }, { status: 502 });
  const body = vendorRequest(config.model), started = performance.now();
  try {
    const response = await fetch(url, { method: 'POST', redirect: 'manual', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]) });
    if (!response.ok) throw new Error(`JEV returned HTTP ${response.status}. Check credentials, model, balance and rate limits.`);
    const result = parseVendorResponse(await response.json());
    return Response.json({ ...result, model: result.model || config.model, elapsedMs: performance.now() - started, request: body }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error && /^(JEV returned|JEV key|Provider endpoints)/.test(error.message) ? error.message : 'JEV request failed, timed out, or returned an invalid answer.' }, { status: 502 });
  }
}
