import { writeFileSync, chmodSync } from 'node:fs';
import { readProviderEnvironment } from './provider-env.mjs';
const target = new URL('../.dev.vars', import.meta.url);
const values = readProviderEnvironment();
// Always regenerate so removed secrets do not survive in a stale local file.
writeFileSync(target, Object.entries(values).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n', { mode: 0o600 });
chmodSync(target, 0o600);
console.log('Prepared server-only chess settings from optional .env files and environment variables.');
