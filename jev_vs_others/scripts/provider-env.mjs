import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
export const projectDirectory = fileURLToPath(new URL('../', import.meta.url));
export const providerNames = [
  'JEV_API_KEY', 'JEV_API_URL', 'JEV_MODEL', 'TYPESAFE_API_KEY',
  'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'OPENAI_MAX_COMPLETION_TOKENS',
  'DEEP_SEEK_API_KEY', 'DEEP_SEEK_BASE_URL', 'DEEP_SEEK_MODEL',
  'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL', 'APP_ORIGIN',
  'CHESS_RAG_ENABLED',
];
/** @param {Record<string, string | undefined>} environment */
export function codespaceOrigin(environment = process.env) {
  if (environment.CODESPACES !== 'true' || !environment.CODESPACE_NAME) return undefined;
  const name = environment.CODESPACE_NAME;
  const domain = environment.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
  if (!/^[a-z0-9-]+$/i.test(name) || !/^[a-z0-9.-]+$/i.test(domain)) throw new Error('Invalid Codespaces host configuration.');
  return `https://${name}-3000.${domain}`;
}
/** @param {string} projectDir @param {Record<string, string | undefined>} environment */
export function readProviderEnvironment(projectDir = projectDirectory, environment = process.env) {
  const values = {};
  for (const path of [resolve(projectDir, '../.env'), resolve(projectDir, '.env')]) {
    if (existsSync(path)) Object.assign(values, parseEnv(readFileSync(path, 'utf8')));
  }
  // Inherited Codespaces secrets override optional files; no file is required.
  Object.assign(values, environment);
  const origin = codespaceOrigin(environment);
  if (origin) values.APP_ORIGIN = origin;
  return Object.fromEntries(providerNames.filter(name => typeof values[name] === 'string').map(name => [name, values[name]]));
}
