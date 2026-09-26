import { ROSTER, VENDORS, VENDOR_OPTIONS, type VendorOption } from '../jev-overview';

export type RemoteEngine = 'jev' | 'openai' | 'deepseek';
export type AgentEngine = RemoteEngine | 'bert';
export type AgentDecision = { id: string; choice: VendorOption; probabilities?: Record<VendorOption, number>; confidence?: number; similarities?: Record<string, number> };
export type VendorUsage = { input_tokens: number; output_tokens: number; cached_input_tokens?: number; cache_write_tokens?: number };
export type AgentResult = { engine: AgentEngine; model: string; elapsedMs: number; loadMs?: number; decisions: AgentDecision[]; usage?: VendorUsage; request?: unknown };

export const VENDOR_TASK = 'Match each roster entry to an approved vendor by company identity AND service. A similar name alone is insufficient. Choose unmatched when no approved vendor clearly matches. Return one of the five allowed labels for each roster ID.';
export const vendorState = () => ({ roster: Object.fromEntries(ROSTER.map(({ id, entry, service }) => [id, { entry, service }])), approved_vendors: Object.fromEntries(VENDORS.map(({ id, name, service }) => [id, { name, service }])) });
export function llmVendorRequest(engine: 'openai' | 'deepseek', model: string) {
  const properties = Object.fromEntries(ROSTER.map(row => [row.id, { type: 'string', enum: [...VENDOR_OPTIONS] }]));
  return {
    model,
    messages: [{ role: 'system', content: `You are a vendor-reconciliation component. ${VENDOR_TASK} Make all ${ROSTER.length} decisions. Return only a JSON object with exactly the ${ROSTER.length} roster IDs as keys and allowed vendor labels as values. Do not include explanations or probabilities.` }, { role: 'user', content: JSON.stringify(vendorState()) }],
    response_format: engine === 'openai' ? { type: 'json_schema', json_schema: { name: 'vendor_matches', strict: true, schema: { type: 'object', properties, required: ROSTER.map(row => row.id), additionalProperties: false } } } : { type: 'json_object' },
    max_completion_tokens: 4096,
  };
}
function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The model returned an invalid object.');
  return raw as Record<string, unknown>;
}
export function parseLlmVendorResponse(raw: unknown) {
  const data = record(raw), choices = data.choices;
  if (!Array.isArray(choices) || choices.length < 1) throw new Error('The model returned no answer.');
  const first = record(choices[0]);
  if (first.finish_reason !== 'stop') throw new Error('The model did not finish its answer.');
  const message = record(first.message);
  if (typeof message.content !== 'string') throw new Error('The model returned no JSON text.');
  let answer: Record<string, unknown>;
  try { answer = record(JSON.parse(message.content)); } catch { throw new Error('The model returned invalid JSON.'); }
  if (Object.keys(answer).length !== ROSTER.length || ROSTER.some(row => !Object.hasOwn(answer, row.id))) throw new Error('The model omitted or added roster IDs.');
  const decisions = ROSTER.map(row => {
    if (!VENDOR_OPTIONS.includes(answer[row.id] as VendorOption)) throw new Error(`The model returned an invalid label for ${row.id}.`);
    return { id: row.id, choice: answer[row.id] as VendorOption };
  });
  const usage = data.usage === undefined ? undefined : record(data.usage);
  const token = (field: string) => { const value = usage?.[field]; return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined; };
  const input_tokens = token('prompt_tokens'), output_tokens = token('completion_tokens');
  const details = usage?.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object' && !Array.isArray(usage.prompt_tokens_details) ? usage.prompt_tokens_details as Record<string, unknown> : undefined;
  const optionalCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (input_tokens === undefined || (value as number) <= input_tokens) ? value as number : undefined;
  const cached_input_tokens = optionalCount(usage?.prompt_cache_hit_tokens ?? details?.cached_tokens);
  const cache_write_tokens = optionalCount(details?.cache_write_tokens);
  return { model: typeof data.model === 'string' ? data.model : undefined, decisions, ...(input_tokens !== undefined && output_tokens !== undefined ? { usage: { input_tokens, output_tokens, ...(cached_input_tokens === undefined ? {} : { cached_input_tokens }), ...(cache_write_tokens === undefined ? {} : { cache_write_tokens }) } } : {}) };
}
export function accuracy(decisions: AgentDecision[]) { return decisions.filter(decision => ROSTER.find(row => row.id === decision.id)?.expected === decision.choice).length / ROSTER.length; }
