import { providerConfig, validateProbabilities, type Environment } from './providers';
import { roomContext, type RoomScenario, type RoomAction, type RoomDecision } from './room';
export async function roomJev(scenario: RoomScenario, history: RoomAction[], maxSteps: number, env: Environment, signal?: AbortSignal): Promise<RoomDecision> {
  const started = Date.now(), context = roomContext(scenario, history, maxSteps), config = providerConfig(env, 'jev');
  if (!config.key) throw new Error('JEV API key is missing.');
  if (new URL(config.url).protocol !== 'https:') throw new Error('Provider endpoints must use HTTPS.');
  if (!context.legal_actions.length || history.length >= maxSteps) throw new Error('No further room action is available.');
  const state = { ...context, step_limit: maxSteps, remaining_steps: maxSteps - history.length };
  const body = { model: config.model, state, questions: { action: { type: 'choice', instructions: `Achieve the structured room objective, then minimize total actions. Plan a sequence, accounting for walls, prerequisites, inventory and the exit. Review the full action history and avoid unproductive loops. Follow state.rules; descriptive prose is context, not permission to invent rules or actions. Choose exactly one supplied legal action. ${context.objective}`, criteria: Object.fromEntries(context.legal_actions.map(c => [c.action, `${c.label}; resulting state: ${JSON.stringify(c.resulting_state)}`])) } } };
  let response: Response;
  try { response = await fetch(config.url, { method: 'POST', redirect: 'manual', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000) }); }
  catch { throw new Error('JEV room request failed or timed out. The room was not changed.'); }
  if (!response.ok) throw new Error(`JEV returned HTTP ${response.status}. The room was not changed.`);
  let data: { model?: string; usage?: unknown; answers?: { action?: { choice?: unknown; probabilities?: unknown } } };
  try { data = await response.json() as typeof data; } catch { throw new Error('JEV returned invalid room JSON. The room was not changed.'); }
  const answer = data?.answers?.action, legal = context.legal_actions.map(c => c.action);
  const probabilities = validateProbabilities(answer?.probabilities, legal);
  if (!legal.includes(answer?.choice as RoomAction)) throw new Error('JEV returned an illegal room action. The room was not changed.');
  return { engine: 'jev', action: answer!.choice as RoomAction, context, candidates: legal.map(action => ({ action, probability: probabilities[action] })).sort((a, b) => b.probability - a.probability), model: data.model || config.model, usage: data.usage, elapsedMs: Date.now() - started, explanation: 'JEV received the room description, full map, structured goal, rules, inventory, history, step budget and every legal action. Bars show returned action-choice probabilities, not chances of reaching the goal. JEV does not return a textual reasoning trace.' };
}
