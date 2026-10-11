import {main} from '../dist/cli.mjs';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
const args=process.argv.slice(2),index=args.indexOf('--cache');if(index<0||!args[index+1])throw new Error('Usage: node scripts/prepare-speech.mjs --cache MODEL_CACHE');process.env.READER_SPEECH_ASSET_DIR=resolve(args[index+1]);
const directory=await mkdtemp(join(tmpdir(),'reader speech setup ')),probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));let host;const previous=process.stdout.write;process.stdout.write=()=>true;try{host=await main(['web','--no-open','--port',String(port),'--config-dir',directory]);}finally{process.stdout.write=previous;}
try{let percentage=-1;await host.capabilities.get('*','speech','core.sensevoice').prepare(AbortSignal.timeout(15*60*1000),progress=>{const next=Math.floor(progress.completedBytes/progress.totalBytes*100/10)*10;if(next!==percentage){percentage=next;process.stdout.write('Speech assets: '+next+'%\n');}});process.stdout.write('Speech assets verified and ready.\n');}finally{await host.close();process.removeAllListeners('SIGINT');process.removeAllListeners('SIGTERM');await rm(directory,{recursive:true,force:true});}
