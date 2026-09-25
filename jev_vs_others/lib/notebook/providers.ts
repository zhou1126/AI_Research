import { completionBudget, providerConfig, type Environment } from '../providers';
import { distribution, isLabel, jevBody, llmBody } from './core';
import type { Label } from './data';
export type RemoteEngine = 'jev' | 'openai' | 'deepseek';
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Provider returned an invalid object.');
  return value as Record<string, unknown>;
}
function bounded(value: unknown, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error('JEV returned an invalid score.');
  return value;
}
export function parseJev(raw: unknown, demo: boolean) {
  const data = record(raw), answers = record(data.answers), sentiment = record(answers.sentiment);
  if (!isLabel(sentiment.choice)) throw new Error('JEV returned a label outside the predefined categories.');
  const probabilities = distribution(sentiment.probabilities) as Record<Label, number>;
  const clean: Record<string, unknown> = { sentiment: { type: 'choice', choice: sentiment.choice, probabilities, ...(sentiment.confidence === undefined ? {} : { confidence: bounded(sentiment.confidence, 1) }) } };
  if (demo) {
    const score = record(answers.financial_outlook), noul = record(answers.reports_growth);
    clean.financial_outlook = { type: 'score', score: bounded(score.score, 2), probabilities: distribution(score.probabilities, ['0', '1', '2']), ...(score.confidence === undefined ? {} : { confidence: bounded(score.confidence, 1) }) };
    clean.reports_growth = { type: 'noul', noul: bounded(noul.noul, 1) };
  }
  return { prediction: sentiment.choice, probabilities, response: { model: typeof data.model === 'string' ? data.model : undefined, answers: clean } };
}
export function parseLlm(raw: unknown) {
  const data = record(raw), choice = record(Array.isArray(data.choices) ? data.choices[0] : null), message = record(choice.message);
  if (choice.finish_reason !== 'stop' || message.refusal || typeof message.content !== 'string') throw new Error('LLM response was refused, incomplete, or truncated. No category was assigned.');
  let answer: Record<string, unknown>;
  try { answer = record(JSON.parse(message.content)); } catch { throw new Error('LLM returned invalid JSON. No category was assigned.'); }
  if (Object.keys(answer).length !== 1 || !isLabel(answer.label)) throw new Error('LLM did not return exactly one predefined category.');
  return { prediction: answer.label, response: { label: answer.label, finishReason: choice.finish_reason } };
}
export async function classify(text: string, engine: RemoteEngine, demo: boolean, env: Environment, signal?: AbortSignal) {
  const config = providerConfig(env, engine);
  if (!config.key || !config.model) throw new Error(`${engine.toUpperCase()} key or model is not configured.`);
  const url = new URL(config.url);
  if (url.protocol !== 'https:') throw new Error('Provider endpoints must use HTTPS.');
  const body = engine === 'jev' ? jevBody(text, config.model, demo) : llmBody(text, config.model, engine, completionBudget(env, engine));
  const started = performance.now();
  let response: Response;
  try { response = await fetch(url, { method: 'POST', redirect: 'manual', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([AbortSignal.timeout(90000), ...(signal ? [signal] : [])]) }); }
  catch { throw new Error(`${engine.toUpperCase()} request failed, timed out, or was cancelled.`); }
  if (!response.ok) throw new Error(`${engine.toUpperCase()} returned HTTP ${response.status}. Check credentials, model, balance and rate limits.`);
  let raw: unknown;
  try { raw = await response.json(); } catch { throw new Error(`${engine.toUpperCase()} returned invalid JSON.`); }
  const parsed = engine === 'jev' ? parseJev(raw, demo) : parseLlm(raw);
  const data = record(raw);
  return { ...parsed, engine, model: typeof data.model === 'string' ? data.model : config.model, inferenceMs: performance.now() - started, request: body };
}
