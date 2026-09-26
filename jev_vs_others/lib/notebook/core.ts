import { CRITERIA, LABELS, TASK, type BenchEngine, type Example, type Label } from './data';
export const BERT_MODEL = 'Xenova/finbert';
export const BERT_DTYPE = 'q8';
export const BERT_REVISION = '8f269abebfdd9009d7d9b5e96af7e5c6bfe50b20';
export type Prediction = { id: string; engine: BenchEngine; model: string; prediction?: Label; probabilities?: Record<Label, number>; elapsedMs: number; inferenceMs?: number; error?: string; request?: unknown; response?: unknown };
export const isLabel = (value: unknown): value is Label => LABELS.includes(value as Label);
export function distribution(input: unknown, labels: readonly string[] = LABELS): Record<string, number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Missing probability distribution.');
  const values = input as Record<string, number>;
  if (Object.keys(values).length !== labels.length || labels.some(label => !Object.hasOwn(values, label) || !Number.isFinite(values[label]) || values[label] < 0 || values[label] > 1) || Math.abs(Object.values(values).reduce((a, b) => a + b, 0) - 1) > .02) throw new Error('Invalid probability distribution.');
  return values;
}
export function finbertResult(output: unknown) {
  if (!Array.isArray(output)) throw new Error('BERT returned an invalid result.');
  const values: Record<string, number> = {};
  for (const item of output) {
    if (!item || !isLabel(item.label) || Object.hasOwn(values, item.label)) throw new Error('BERT returned an unknown or duplicate label.');
    values[item.label] = item.score;
  }
  const probabilities = distribution(values) as Record<Label, number>;
  const prediction = [...LABELS].sort((a, b) => probabilities[b] - probabilities[a])[0];
  return { prediction, probabilities };
}
export function jevBody(text: string, model: string, demo = false) {
  return { model, state: text, questions: {
    sentiment: { type: 'choice', instructions: TASK, criteria: CRITERIA },
    ...(demo ? {
      financial_outlook: { type: 'score', instructions: 'Rate the company’s financial outlook described in this statement.', criteria: ['Deteriorating financial performance or outlook', 'No clear change in financial performance or outlook', 'Improving financial performance or outlook'] },
      reports_growth: { type: 'noul', instructions: 'Does the statement explicitly report an increase in company revenue or sales?', criteria: { true: 'An increase in company revenue or sales is explicitly reported.', false: 'No increase in company revenue or sales is reported.' } },
    } : {}),
  } };
}
export type JevPrimitive = 'choice' | 'score' | 'noul';
export const PRIMITIVE_QUESTION = { choice: 'sentiment', score: 'financial_outlook', noul: 'reports_growth' } as const;
export function jevPrimitiveBody(text: string, model: string, primitive: JevPrimitive) {
  const full = jevBody(text, model, true);
  const question = PRIMITIVE_QUESTION[primitive];
  return { ...full, questions: { [question]: full.questions[question] } };
}
export function jevBatchBody(examples: Example[], model: string) {
  return { model, state: { statements: Object.fromEntries(examples.map(example => [example.id, example.text])) }, questions: Object.fromEntries(examples.map(example => [example.id, {
    type: 'choice', instructions: `${TASK} Evaluate only the statement at \`state.statements.${example.id}\`. Ignore the other statements.`, criteria: CRITERIA,
  }])) };
}
export function llmBody(text: string, model: string, engine: 'openai' | 'deepseek', budget: number) {
  return { model, messages: [
    { role: 'system', content: `${TASK}\nCategories: ${JSON.stringify(CRITERIA)}\nReturn only JSON: {"label":"positive|neutral|negative"}. No rationale or invented confidence scores.` },
    { role: 'user', content: text },
  ], response_format: engine === 'openai' ? { type: 'json_schema', json_schema: { name: 'sentiment', strict: true, schema: { type: 'object', properties: { label: { type: 'string', enum: LABELS } }, required: ['label'], additionalProperties: false } } } : { type: 'json_object' },
  ...(engine === 'openai' ? { max_completion_tokens: budget } : { max_tokens: budget }) };
}
export function metrics(examples: Example[], predictions: Prediction[]) {
  const byId = new Map(predictions.map(row => [row.id, row]));
  const attempted = examples.filter(example => byId.has(example.id));
  const matrix = LABELS.map(() => [0, 0, 0, 0]); // last column = error / invalid
  let valid = 0, correct = 0;
  for (const example of attempted) {
    const row = byId.get(example.id)!;
    const label = !row.error && isLabel(row.prediction) ? row.prediction : undefined;
    matrix[LABELS.indexOf(example.expected)][label ? LABELS.indexOf(label) : 3]++;
    if (label) valid++;
    if (label === example.expected) correct++;
  }
  const perClass = LABELS.map((label, index) => {
    const tp = matrix[index][index], support = matrix[index].reduce((a, b) => a + b, 0);
    const predicted = matrix.reduce((sum, row) => sum + row[index], 0);
    const precision = predicted ? tp / predicted : 0, recall = support ? tp / support : 0;
    return { label, support, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
  });
  const count = attempted.length;
  const elapsedMs = attempted.reduce((sum, item) => sum + byId.get(item.id)!.elapsedMs, 0);
  return { attempted: count, valid, errors: count - valid, correct, matrix, perClass, elapsedMs, meanMs: count ? elapsedMs / count : null,
    accuracy: count ? correct / count : null, coverage: count ? valid / count : null,
    precision: count ? perClass.reduce((sum, row) => sum + row.precision, 0) / LABELS.length : null,
    recall: count ? perClass.reduce((sum, row) => sum + row.recall, 0) / LABELS.length : null,
    f1: count ? perClass.reduce((sum, row) => sum + row.f1, 0) / LABELS.length : null };
}
