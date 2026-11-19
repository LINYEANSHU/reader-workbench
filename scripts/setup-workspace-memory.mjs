import {spawn,spawnSync} from 'node:child_process';
import {mkdir,access,writeFile,rename,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {userInfo} from 'node:os';
import envPaths from 'env-paths';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..'),values={};
for(let i=2;i<process.argv.length;i+=2){const flag=process.argv[i],value=process.argv[i+1];if(!['--config-dir','--runtime-dir','--python'].includes(flag)||!value)throw Error('Usage: node scripts/setup-workspace-memory.mjs [--config-dir PATH] [--runtime-dir PATH] [--python VERSION_OR_PATH]');values[flag]=value;}
const config=resolve(values['--config-dir']??envPaths('reader-workbench',{suffix:''}).config),runtime=resolve(values['--runtime-dir']??join(config,'cognee'));
const python=join(runtime,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),models=join(runtime,'models');
const run=(command,args,env=process.env)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{env,windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(command+' exited '+code)));});
await mkdir(runtime,{recursive:true});const uv=spawnSync('uv',['--version'],{windowsHide:true,stdio:'ignore'}).status===0;
try{await access(python);}catch{if(uv)await run('uv',['venv','--python',values['--python']??'3.11',join(runtime,'.venv')]);else await run(values['--python']??(process.platform==='win32'?'python':'python3'),['-m','venv',join(runtime,'.venv')]);}
const requirements=join(repository,'plugins/workspace-memory/requirements.txt');
if(uv)await run('uv',['pip','install','--python',python,'-r',requirements]);else await run(python,['-I','-m','pip','install','-r',requirements]);
await run(python,['-I','-u',join(repository,'plugins/workspace-memory/worker.py'),join(runtime,'setup'),'--prepare'],{...process.env,READER_COGNEE_MODEL_CACHE:models});
await access(join(models,'ready.json'));const agentDir=join(config,'agent');await mkdir(agentDir,{recursive:true,mode:0o700});
const protectWindows=async(target,directory=false)=>{if(process.platform!=='win32')return;const whoami=spawnSync('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true,encoding:'utf8'});const sid=whoami.stdout?.match(/\bS-1-\d+(?:-\d+)+\b/)?.[0];const principal=sid?'*'+sid:(process.env.USERDOMAIN?process.env.USERDOMAIN+'\\':'')+userInfo().username;await run('icacls.exe',[target,'/inheritance:r','/grant:r',principal+':'+(directory?'(OI)(CI)F':'F')]);};
await protectWindows(agentDir,true);
const destination=join(agentDir,'workspace-memory.json'),temporary=destination+'.'+randomUUID()+'.tmp';
try{await writeFile(temporary,JSON.stringify({pythonPath:python,modelCache:models},null,2)+'\n',{mode:0o600,flag:'wx'});await protectWindows(temporary,false);await rename(temporary,destination);}finally{await rm(temporary,{force:true}).catch(()=>{});}
console.log('Workspace memory runtime ready. Restart Reader Workbench; files are associated automatically after selecting a workspace.');
