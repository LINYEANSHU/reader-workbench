import { loadRuntimeConfig } from '../../../packages/core/src/runtime/config.js';
import { ReaderError } from '../../../packages/contracts/src/errors.js';
import { runWeb } from './web.js';
import { runDoctor } from './doctor.js';
export async function main(args=process.argv.slice(2)){
  if(args.includes('--help')||args.includes('-h')){process.stdout.write('reader-workbench web [--host 127.0.0.1] [--port 4317] [--config-dir path] [--workspace path] [--no-open] [--demo]\nreader-workbench doctor [--config-dir path]\n');return;}
  const command=args[0]&&!args[0].startsWith('--')?args[0]:'web';
  if(!['web','doctor'].includes(command))throw new ReaderError('INVALID_ARGUMENT','未知命令: '+command);
  const config=await loadRuntimeConfig(args);if(command==='doctor')return runDoctor(config);return runWeb(config);
}
