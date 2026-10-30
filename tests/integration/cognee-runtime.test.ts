import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {DocumentService} from '../../packages/core/src/documents/service.js';
import {WorkspaceMemoryService} from '../../packages/core/src/knowledge/service.js';
import {CogneeEngine} from '../../packages/core/src/knowledge/cognee.js';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
it.skipIf(!process.env.READER_TEST_COGNEE)('loads the prepared embedding tokenizer with all network access blocked',async()=>{
 const settings=JSON.parse(await readFile(join(resolve(process.env.READER_TEST_COGNEE!),'agent','workspace-memory.json'),'utf8')) as {pythonPath:string;modelCache:string};
 const directory=await mkdtemp(join(tmpdir(),'reader offline tokenizer '));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const env:NodeJS.ProcessEnv={};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'])if(process.env[key])env[key]=process.env[key];
 const configuration={HF_HOME:join(settings.modelCache,'huggingface'),HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',COGNEE_ENV_FILE:join(directory,'worker.env'),TELEMETRY_DISABLED:'1',COGNEE_TRACING_ENABLED:'false',LITELLM_LOCAL_MODEL_COST_MAP:'True',OPENAI_API_KEY:'',LLM_API_KEY:'',LOG_LEVEL:'ERROR',COGNEE_LOGS_DIR:join(directory,'logs'),SYSTEM_ROOT_DIRECTORY:join(directory,'system'),DATA_ROOT_DIRECTORY:join(directory,'data'),CACHE_ROOT_DIRECTORY:join(directory,'cache'),COGNEE_REPOS_DIR:join(directory,'repos')};
 const script=[
  'import os,sys,pathlib',
  `os.environ.update(${JSON.stringify(configuration)})`,
  "pathlib.Path(os.environ['COGNEE_ENV_FILE']).write_text('',encoding='utf-8')",
  'def guard(event,args):',
  " if event in ('socket.connect','socket.getaddrinfo'): raise RuntimeError('Prepared tokenizer must not access the network')",
  'sys.addaudithook(guard)',
  'from cognee.infrastructure.llm.tokenizer.HuggingFace import HuggingFaceTokenizer',
  "tokenizer=HuggingFaceTokenizer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')",
  "assert tokenizer.count_tokens('电容阻抗与频域分析')>0",
  'assert tokenizer.model_input_limit>0',
  "print('Prepared tokenizer works offline')",
 ].join('\n');
 expect(execFileSync(settings.pythonPath,['-I','-c',script],{env,encoding:'utf8',windowsHide:true,timeout:60000})).toContain('Prepared tokenizer works offline');
},65000);
it.skipIf(!process.env.READER_TEST_COGNEE)('builds a real local Cognee graph and recalls cross-file source evidence in Chinese',async()=>{
 const root=await mkdtemp(join(tmpdir(),'reader real cognee 中文 '));cleanup.push(()=>rm(root,{recursive:true,force:true}));
 const config=join(root,'config'),workspaceRoot=join(root,'资料 中文');await mkdir(join(config,'agent'),{recursive:true});await mkdir(workspaceRoot);
 const settings=await readFile(join(resolve(process.env.READER_TEST_COGNEE!),'agent','workspace-memory.json'),'utf8');await writeFile(join(config,'agent','workspace-memory.json'),settings);
 await writeFile(join(workspaceRoot,'circuits.md'),'Capacitors store electrical energy. The impedance of a capacitor in alternating current is Z_C = 1/(j*omega*C). 电容的阻抗随角频率变化。');
 await writeFile(join(workspaceRoot,'signals.md'),'The Fourier transform represents a signal in terms of frequency. Frequency-domain circuit analysis uses the impedance of a capacitor: Z_C = 1/(j*omega*C). 傅里叶变换和电容阻抗都可以用于频域分析。');
 const workspaces=new WorkspaceService(config);cleanup.push(()=>workspaces.close());const documents=new DocumentService(workspaces);cleanup.push(()=>documents.close());
 const engine=new CogneeEngine(workspaces),memory=new WorkspaceMemoryService(workspaces,documents,engine);cleanup.push(()=>memory.close());
 const workspace=await workspaces.select(workspaceRoot,{callerId:'local-owner',transport:'internal'});expect(await engine.available()).toBe(true);
 await memory.sync(workspace.id,new AbortController().signal);expect((await memory.status(workspace.id)).state).toBe('ready');
 const hits=await memory.search(workspace.id,'电容阻抗与频域分析有什么联系？',new AbortController().signal);
 const paths=[...new Set(hits.flatMap(hit=>hit.sources.map(source=>source.relativePath)))];expect(paths.sort()).toEqual(['circuits.md','signals.md']);
 expect(hits.every(hit=>hit.sources.every(source=>source.anchor.workspaceId===workspace.id))).toBe(true);
 console.info('Real Cognee evidence:',JSON.stringify({files:paths,items:hits.length,status:await memory.status(workspace.id)}));
 await memory.close();
 const cache=join(await workspaces.internalDirectory(workspace.id),'knowledge','cognee');await rm(cache,{recursive:true,force:true});
 const restored=new WorkspaceMemoryService(workspaces,documents,new CogneeEngine(workspaces));cleanup.push(()=>restored.close());
 await restored.sync(workspace.id,new AbortController().signal);
 expect((await restored.search(workspace.id,'电容与频域分析',new AbortController().signal)).flatMap(hit=>hit.sources.map(source=>source.relativePath)).sort()).toEqual(['circuits.md','signals.md']);
},600000);
