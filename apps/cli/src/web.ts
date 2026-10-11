import open from 'open';
import { startServer } from '../../server/src/app.js';
import type { RuntimeConfig } from '../../../packages/contracts/src/runtime.js';
export async function runWeb(config:RuntimeConfig){
  const server=await startServer(config);
  process.stdout.write('Reader Workbench: '+server.bootstrapUrl+'\n');
  process.stdout.write('HTTP API: '+server.url+'/api/v1\n');
  const shutdown=async()=>{await server.close();process.exit(0);};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  if(!config.noOpen)await open(server.bootstrapUrl);
  return server;
}
