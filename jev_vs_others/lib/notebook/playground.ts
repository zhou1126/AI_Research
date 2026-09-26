import { distribution, type JevPrimitive } from './core';

export type PlaygroundOption = { key: string; description: string };
export type PlaygroundQuestion = { id: string; type: JevPrimitive; instructions: string; options: PlaygroundOption[]; levels: string[]; trueDescription: string; falseDescription: string };
export type PlaygroundDraft = { state: string; questions: PlaygroundQuestion[] };
export type PlaygroundAnswer = { type: JevPrimitive; choice?: string; score?: number; noul?: number; probabilities?: Record<string, number>; confidence?: number };
export const PLAYGROUND_TYPES = ['choice', 'score', 'noul'] as const;

export function newPlaygroundQuestion(type: JevPrimitive, index: number): PlaygroundQuestion {
  return { id: `question_${index}`, type,
    instructions: type === 'choice' ? 'Which team should handle this request?' : type === 'score' ? 'How urgent is this request?' : 'Does the customer ask to speak with a person?',
    options: [{ key: 'returns', description: 'Exchanges and wrong or damaged items' }, { key: 'shipping', description: 'Delivery status, delays, and missing packages' }, { key: 'billing', description: 'Charges, invoices, and payments' }],
    levels: ['Routine; no immediate impact', 'Time-sensitive; a workaround exists', 'Blocking; no workable alternative'],
    trueDescription: '', falseDescription: '',
  };
}
export function initialPlaygroundDraft(): PlaygroundDraft {
  return { state: 'My running shoes arrived in the wrong size. Can I swap them for a size 10?', questions: [newPlaygroundQuestion('choice', 1)] };
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter a valid playground request.');
  return value as Record<string, unknown>;
};
const requiredText = (value: unknown, label: string, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} must contain 1–${max} characters.`);
  return value.trim();
};
const optionalText = (value: unknown, label: string, max: number) => {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} must be at most ${max} characters.`);
  return value.trim();
};
export function previewPlaygroundBody(draft: PlaygroundDraft, model: string) {
  return { model, state: draft.state, questions: Object.fromEntries(draft.questions.map((question, index) => {
    const id = question.id || `question_${index + 1}`;
    const common = { type: question.type, instructions: question.instructions };
    return [id, question.type === 'choice' ? { ...common, criteria: Object.fromEntries(question.options.map(option => [option.key, option.description])) }
      : question.type === 'score' ? { ...common, criteria: question.levels }
        : { ...common, ...(question.trueDescription || question.falseDescription ? { criteria: { true: question.trueDescription, false: question.falseDescription } } : {}) }];
  })) };
}
export function buildPlaygroundBody(input: unknown, model: string) {
  const draft = object(input);
  const state = requiredText(draft.state, 'Statement', 5000);
  if (!Array.isArray(draft.questions) || draft.questions.length < 1 || draft.questions.length > 8) throw new Error('Add 1–8 questions.');
  const ids = new Set<string>();
  const questions = Object.fromEntries(draft.questions.map((value: unknown, index: number) => {
    const question = object(value);
    const id = requiredText(question.id, `Question ${index + 1} ID`, 40);
    if (!/^[a-z][a-z0-9_]*$/.test(id) || ids.has(id)) throw new Error(`Question ${index + 1} needs a unique ID starting with a letter, using only lowercase letters, digits, or underscores.`);
    ids.add(id);
    const type = question.type;
    if (!PLAYGROUND_TYPES.includes(type as JevPrimitive)) throw new Error(`Question ${id} needs Choice, Score, or Noul.`);
    const instructions = requiredText(question.instructions, `${id} instructions`, 500);
    if (type === 'choice') {
      if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 20) throw new Error(`${id} needs 2–20 Choice options.`);
      const labels = new Set<string>();
      const criteria = Object.fromEntries(question.options.map((value: unknown, optionIndex: number) => {
        const option = object(value);
        const key = requiredText(option.key, `${id} option ${optionIndex + 1} label`, 40);
        if (!/^[a-z][a-z0-9_]*$/.test(key) || labels.has(key)) throw new Error(`${id} needs unique lowercase option labels starting with a letter.`);
        labels.add(key);
        return [key, requiredText(option.description, `${id} option ${key} description`, 300)];
      }));
      return [id, { type, instructions, criteria }];
    }
    if (type === 'score') {
      if (!Array.isArray(question.levels) || question.levels.length < 2 || question.levels.length > 10) throw new Error(`${id} needs 2–10 ordered Score levels.`);
      return [id, { type, instructions, criteria: question.levels.map((level: unknown, levelIndex: number) => requiredText(level, `${id} level ${levelIndex}`, 300)) }];
    }
    const yes = optionalText(question.trueDescription, `${id} yes criteria`, 300);
    const no = optionalText(question.falseDescription, `${id} no criteria`, 300);
    if (Boolean(yes) !== Boolean(no)) throw new Error(`${id} needs both yes and no criteria, or neither.`);
    return [id, { type: 'noul', instructions, ...(yes ? { criteria: { true: yes, false: no } } : {}) }];
  }));
  const body = { model, state, questions };
  if (JSON.stringify(body).length > 30000) throw new Error('The generated request is too large. Shorten the statement or criteria.');
  return body;
}
const number = (value: unknown, max: number, label: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error(`JEV returned invalid ${label}.`);
  return value;
};
export function parsePlaygroundResponse(raw: unknown, request: ReturnType<typeof buildPlaygroundBody>) {
  const data = object(raw), answers = object(data.answers), keys = Object.keys(request.questions);
  if (Object.keys(answers).length !== keys.length || keys.some(key => !Object.hasOwn(answers, key))) throw new Error('JEV returned missing or unexpected playground answers.');
  const clean: Record<string, PlaygroundAnswer> = {};
  for (const id of keys) {
    const question = request.questions[id], answer = object(answers[id]);
    if (answer.type !== question.type) throw new Error(`JEV returned the wrong answer type for ${id}.`);
    if (question.type === 'choice') {
      const labels = Object.keys(question.criteria as Record<string, string>);
      if (typeof answer.choice !== 'string' || !labels.includes(answer.choice)) throw new Error(`JEV returned an invalid choice for ${id}.`);
      clean[id] = { type: 'choice', choice: answer.choice, probabilities: distribution(answer.probabilities, labels), ...(answer.confidence === undefined ? {} : { confidence: number(answer.confidence, 1, `${id} confidence`) }) };
    } else if (question.type === 'score') {
      const levels = question.criteria as string[];
      clean[id] = { type: 'score', score: number(answer.score, levels.length - 1, `${id} score`), probabilities: distribution(answer.probabilities, levels.map((_, index) => String(index))), ...(answer.confidence === undefined ? {} : { confidence: number(answer.confidence, 1, `${id} confidence`) }) };
    } else clean[id] = { type: 'noul', noul: number(answer.noul, 1, `${id} noul`) };
  }
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  if (data.usage !== undefined) {
    const value = object(data.usage);
    const count = (field: string) => { const n = value[field]; if (!Number.isSafeInteger(n) || (n as number) < 0) throw new Error('JEV returned invalid token usage.'); return n as number; };
    usage = { input_tokens: count('input_tokens'), output_tokens: count('output_tokens') };
  }
  return { model: typeof data.model === 'string' ? data.model : request.model, answers: clean, ...(usage ? { usage } : {}) };
}
