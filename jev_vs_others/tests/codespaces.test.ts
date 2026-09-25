import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProviderEnvironment,codespaceOrigin } from '../scripts/provider-env.mjs';
import { isAllowedOrigin } from '../lib/origin';

test('clean checkout needs no .env and Codespaces secrets override both optional files',()=>{
 const root=mkdtempSync(join(tmpdir(),'chess-env-'));const project=join(root,'project');mkdirSync(project);
 try {
  assert.deepEqual(readProviderEnvironment(project,{}),{});
  writeFileSync(join(root,'.env'),'JEV_API_KEY=parent\nFINNHUB_API_KEY=unrelated\n');
  writeFileSync(join(project,'.env'),'JEV_API_KEY=project\nOPENAI_MODEL=model-from-file\n');
  assert.equal(readProviderEnvironment(project,{}).JEV_API_KEY,'project');
  const config=readProviderEnvironment(project,{JEV_API_KEY:'codespaces',OPENAI_API_KEY:'fixture',CHESS_RAG_ENABLED:'false',GITHUB_TOKEN:'never-copy',CODESPACES:'true',CODESPACE_NAME:'lab-fixture',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev'});
  assert.equal(config.CHESS_RAG_ENABLED,'false');
  assert.equal(config.JEV_API_KEY,'codespaces');assert.equal(config.OPENAI_MODEL,'model-from-file');
  assert.equal(config.APP_ORIGIN,'https://lab-fixture-3000.app.github.dev');
  assert.equal(config.FINNHUB_API_KEY,undefined);assert.equal(config.GITHUB_TOKEN,undefined);assert.equal(config.CODESPACES,undefined);
 } finally { rmSync(root,{recursive:true,force:true}); }
});
test('Codespaces host is exact, validates inputs and is absent on local machines',()=>{
 assert.equal(codespaceOrigin({}),undefined);
 assert.equal(codespaceOrigin({CODESPACES:'true',CODESPACE_NAME:'my-space'}),'https://my-space-3000.app.github.dev');
 assert.throws(()=>codespaceOrigin({CODESPACES:'true',CODESPACE_NAME:'invalid/host'}));
});
test('forwarded HTTPS origin works without trusting arbitrary forwarded host headers',()=>{
 const forwarded='https://my-space-3000.app.github.dev';
 const request=(origin:string)=>new Request('http://localhost:3000/api/analyze',{headers:{Origin:origin,'X-Forwarded-Host':'attacker.example'}});
 assert.ok(isAllowedOrigin(request(forwarded),forwarded));
 assert.ok(isAllowedOrigin(request('http://localhost:3000')));
 assert.ok(!isAllowedOrigin(request('https://attacker.example'),forwarded));
 assert.ok(!isAllowedOrigin(request('https://other-space-3000.app.github.dev'),forwarded));
 assert.ok(!isAllowedOrigin(request('null'),forwarded));
 assert.ok(!isAllowedOrigin(request(forwarded),'malformed'));
});
