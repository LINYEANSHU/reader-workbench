import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {main} from '../dist/cli.mjs';
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const root=option('--workspace'),config=option('--config-dir'),output=option('--output');
const keepRunning=args.includes('--keep-running');
if(!root||!config||!output)throw new Error('Usage: node scripts/voice-smoke.mjs --workspace OWNED_TEST_DIRECTORY --config-dir PRIVATE_TEST_CONFIG --output EVIDENCE.json');
await mkdir(root,{recursive:true});const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const previous=process.stdout.write;process.stdout.write=()=>true;let host;try{host=await main(['web','--no-open','--port',String(port),'--config-dir',resolve(config)]);}finally{process.stdout.write=previous;}
try{
 const actor={callerId:'local-owner',transport:'internal'},workspace=await host.workspaces.select(resolve(root),actor),session=await host.sessions.createMain(workspace.id,'真实离线语音验收'),temporary=await host.sessions.createTemporary(workspace.id,session.id),headers={authorization:'Bearer '+host.auth.token,'content-type':'application/json'};
 const beforeMain=await host.sessionRepository.snapshot(workspace.id,session.id),beforeTemporary=await host.sessionRepository.snapshot(workspace.id,temporary.id);
 const request=async(path,body)=>{const response=await fetch(host.url+path,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error?.code??'Speech HTTP failure');return result;};
 const prefix='/api/v1/workspaces/'+workspace.id+'/sessions/'+temporary.id+'/speech',wait=async job=>{while(['queued','running'].includes(job.status)){await delay(250);job=await request(prefix+'/jobs/'+job.id);}if(job.status!=='completed')throw new Error(job.error?.code??job.status);return job;};
 await wait(await request(prefix+'/prepare',{requestId:randomUUID(),providerId:'core.sensevoice'}));const results=[];
 for(const[name,language,pattern]of [['voice-zh.wav','auto',/阅读.*文档/],['voice-en.wav',keepRunning?'auto':'en',/read.*document/i]]){const bytes=await readFile(new URL('../tests/fixtures/'+name,import.meta.url)),job=await wait(await request(prefix+'/transcribe',{requestId:randomUUID(),providerId:'core.sensevoice',language,audioBase64:bytes.toString('base64')}));if(!pattern.test(job.result.text))throw new Error('Unexpected real recognition: '+name);results.push({fixture:name,...job.result});}
 if(JSON.stringify(beforeMain)!==JSON.stringify(await host.sessionRepository.snapshot(workspace.id,session.id))||JSON.stringify(beforeTemporary)!==JSON.stringify(await host.sessionRepository.snapshot(workspace.id,temporary.id)))throw new Error('Recognition changed conversation history');
 await mkdir(join(resolve(output),'..'),{recursive:true});await writeFile(output,JSON.stringify({status:'passed',platform:process.platform,architecture:process.arch,node:process.version,source:'built CLI + managed packaged worker + actual authenticated HTTP + actual model',network:'cached local model; separate native test blocks Node outgoing network APIs',conversationWrites:0,results},null,2));process.stdout.write('Voice smoke passed: Chinese/English real recognition; histories unchanged.\n');
}finally{if(keepRunning){await writeFile(join(resolve(config),'launch-url.txt'),host.bootstrapUrl,{mode:0o600});process.stdout.write('Retained speech server PID '+process.pid+' at '+host.url+'; recognizer stays running.\n');}else{await host.close();process.removeAllListeners('SIGINT');process.removeAllListeners('SIGTERM');}}
if(!keepRunning){const released=createServer();await new Promise((resolve,reject)=>{released.once('error',reject);released.listen(port,'127.0.0.1',resolve);});await new Promise(resolve=>released.close(resolve));}
