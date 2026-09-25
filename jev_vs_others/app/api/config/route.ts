import { providerConfig } from '../../../lib/providers';
export function GET() {
  return Response.json(Object.fromEntries((['jev','openai','deepseek'] as const).map(engine=>{
    const c=providerConfig(process.env,engine); return [engine,{configured:Boolean(c.key&&c.model),model:c.model,ragEnabled:engine!=='openai'&&process.env.CHESS_RAG_ENABLED!=='false'}];
  })),{headers:{'Cache-Control':'no-store'}});
}
