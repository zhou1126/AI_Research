import { readProviderEnvironment } from './provider-env.mjs';
Object.assign(process.env, readProviderEnvironment());
