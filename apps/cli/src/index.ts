import { loadRuntimeConfig } from '../../../packages/core/src/runtime/config.js';
import { ReaderError } from '../../../packages/contracts/src/errors.js';
import { runWeb } from './web.js';
import { runDoctor } from './doctor.js';
import {runMcpCommand} from './mcp.js';
import {join} from 'node:path';import {packageRoot} from '../../../packages/core/src/runtime/resources.js';import {migrateLegacyConfig} from '../../../packages/core/src/runtime/legacy-config.js';
export async function main(args=process.argv.slice(2)){
  if(args.includes('--help')||args.includes('-h')){process.stdout.write('reader-workbench web [--host 127.0.0.1] [--port 4317] [--config-dir path] [--workspace path] [--no-open] [--demo]\nreader-workbench doctor [--config-dir path]\nreader-workbench mcp [--config-dir path] [--url http://127.0.0.1:4317] [--token-file path]\n');return;}
  const command=args[0]&&!args[0].startsWith('--')?args[0]:'web';
  if(command==='mcp')return runMcpCommand(args);
  if(!['web','doctor'].includes(command))throw new ReaderError('INVALID_ARGUMENT','未知命令: '+command);
  const config=await loadRuntimeConfig(args);if(command==='doctor')return runDoctor(config);
  if(!args.includes('--config-dir')){const root=await packageRoot();await migrateLegacyConfig(config.configDir,[join(root,'.reader-runtime','user-config'),join(root,'.worktrees','reader-workbench','.reader-runtime','user-config')]);}
  return runWeb(config);
}

