import type { AgentEngine, VendorUsage } from './comparison';

export type PriceEstimate = { low: number; high: number; note: string };
export type PriceSchedule = { label: string; source: string; estimate: (usage: VendorUsage) => PriceEstimate };
const million = 1_000_000;

// Public standard text-token rates in USD per million tokens, checked 2026-09-26.
// Unknown model IDs intentionally receive no estimate.
export function priceSchedule(engine: AgentEngine, model: string): PriceSchedule | null {
  const id = model.toLowerCase();
  if (engine === 'jev') return {
    label: '$0.042 input / 1M · output free', source: 'https://docs.typesafe.ai/models',
    estimate: usage => ({ low: usage.input_tokens * 0.042 / million, high: usage.input_tokens * 0.042 / million, note: 'Published JEV input rate.' }),
  };
  if (engine === 'openai' && (id === 'gpt-5.6-luna' || id.startsWith('gpt-5.6-luna-'))) return {
    label: '$0.20 input · $0.02 cached · $1.20 output / 1M', source: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
    estimate: usage => {
      const cached = Math.min(usage.cached_input_tokens ?? 0, usage.input_tokens);
      const remaining = usage.input_tokens - cached;
      const writes = Math.min(usage.cache_write_tokens ?? 0, remaining);
      const base = (cached * 0.02 + (remaining - writes) * 0.20 + writes * 0.25 + usage.output_tokens * 1.20) / million;
      return usage.cache_write_tokens === undefined
        ? { low: base, high: base + remaining * 0.05 / million, note: 'Range allows for unreported cache-write tokens; standard direct API rate.' }
        : { low: base, high: base, note: 'Uses reported cached-input and cache-write tokens.' };
    },
  };
  if (engine === 'deepseek') {
    const flash = ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4.1-flash'].includes(id);
    const pro = id === 'deepseek-v4-pro';
    if (!flash && !pro) return null;
    const offPeak = flash ? { hit: 0.003, miss: 0.15, output: 0.6 } : { hit: 0.022, miss: 0.66, output: 1.98 };
    return {
      label: flash ? '$0.15 miss · $0.003 hit · $0.60 output / 1M off-peak; peak 2×' : '$0.66 miss · $0.022 hit · $1.98 output / 1M off-peak; peak 2×',
      source: 'https://api-docs.deepseek.com/quick_start/pricing/',
      estimate: usage => {
        const hit = Math.min(usage.cached_input_tokens ?? 0, usage.input_tokens);
        const offPeakCost = ((usage.input_tokens - hit) * offPeak.miss + hit * offPeak.hit + usage.output_tokens * offPeak.output) / million;
        return { low: offPeakCost, high: offPeakCost * 2, note: usage.cached_input_tokens === undefined ? 'Off-peak to peak range; assumes input cache misses because cache usage was not reported.' : 'Off-peak to peak range using reported cache hits.' };
      },
    };
  }
  return null;
}

export function priceText(estimate: PriceEstimate) {
  const money = (value: number) => `$${value.toFixed(6)}`;
  return estimate.low === estimate.high ? `~${money(estimate.low)}` : `~${money(estimate.low)}–${money(estimate.high)}`;
}
