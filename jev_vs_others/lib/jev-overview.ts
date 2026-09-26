import { distribution } from './notebook/core';

export const VENDORS = [
  { id: 'v01', name: 'Northstar Catering Co.', service: 'Event meals and catering' },
  { id: 'v02', name: 'Blue Harbor Security Ltd.', service: 'Venue security staff' },
  { id: 'v03', name: 'Atlas AV Services', service: 'Audio and visual equipment' },
  { id: 'v04', name: 'Greenline Transport', service: 'Shuttle and ground transport' },
] as const;

export const ROSTER = [
  { id: 'r01', entry: 'Northstar Event Catering', service: 'Lunch service', expected: 'v01' },
  { id: 'r02', entry: 'Blue Harbour Sec. Ltd.', service: 'Overnight guards', expected: 'v02' },
  { id: 'r03', entry: 'Atlas Audio Visual', service: 'Projection and microphones', expected: 'v03' },
  { id: 'r04', entry: 'Green Line Shuttles', service: 'Airport transfers', expected: 'v04' },
  { id: 'r05', entry: 'Northstar Security', service: 'Security patrol', expected: 'unmatched' },
] as const;

export const VENDOR_OPTIONS = [...VENDORS.map(vendor => vendor.id), 'unmatched'] as const;
export type VendorOption = typeof VENDOR_OPTIONS[number];
export type VendorDecision = { id: string; choice: VendorOption; probabilities: Record<VendorOption, number>; confidence: number };
export type VendorDemoResult = { model: string; elapsedMs: number; decisions: VendorDecision[]; usage?: { input_tokens: number; output_tokens: number }; request: unknown };

export function vendorRequest(model: string) {
  return {
    model,
    state: {
      roster: Object.fromEntries(ROSTER.map(({ id, entry, service }) => [id, { entry, service }])),
      approved_vendors: Object.fromEntries(VENDORS.map(({ id, name, service }) => [id, { name, service }])),
    },
    questions: Object.fromEntries(ROSTER.map(({ id }) => [id, {
      type: 'choice',
      instructions: `Match only roster.${id} to an approved vendor by company identity and service. A similar name alone is insufficient. Choose unmatched if no approved vendor clearly matches this roster entry.`,
      criteria: Object.fromEntries([
        ...VENDORS.map(vendor => [vendor.id, `${vendor.name}: ${vendor.service}. Choose only if this is the same company and service.`]),
        ['unmatched', 'No approved vendor is clearly the same company offering this service.'],
      ]),
    }])),
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JEV returned an invalid object.');
  return value as Record<string, unknown>;
}

export function parseVendorResponse(raw: unknown) {
  const data = object(raw), answers = object(data.answers);
  if (Object.keys(answers).length !== ROSTER.length || Object.keys(answers).some(id => !ROSTER.some(row => row.id === id))) throw new Error('JEV returned missing or unexpected roster answers.');
  const decisions = ROSTER.map(row => {
    const answer = object(answers[row.id]);
    if (!VENDOR_OPTIONS.includes(answer.choice as VendorOption)) throw new Error(`JEV returned an unknown vendor for ${row.id}.`);
    const probabilities = distribution(answer.probabilities, VENDOR_OPTIONS) as Record<VendorOption, number>;
    if (typeof answer.confidence !== 'number' || !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) throw new Error(`JEV returned invalid confidence for ${row.id}.`);
    return { id: row.id, choice: answer.choice as VendorOption, probabilities, confidence: answer.confidence };
  });
  const usage = data.usage === undefined ? undefined : object(data.usage);
  const tokenCount = (name: string) => {
    const value = usage?.[name];
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('JEV returned invalid token usage.');
    return value as number;
  };
  return { model: typeof data.model === 'string' ? data.model : undefined, decisions,
    ...(usage ? { usage: { input_tokens: tokenCount('input_tokens'), output_tokens: tokenCount('output_tokens') } } : {}) };
}
