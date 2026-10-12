import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {startServer} from '../../apps/server/src/app.js';
import {connectExternalMcp,ExternalMcpManager} from '../../packages/core/src/plugins/external-mcp.js';
import {processTool} from '../../packages/core/src/plugins/process-tools.js';
import {UiBridge} from '../../packages/core/src/plugins/ui-bridge.js';
import type {RunScope,RunId} from '../../packages/contracts/src/ids.js';
import {spawn} from 'node:child_process';import {once} from 'node:events';import {createInterface} from 'node:readline';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function setup(){const directory=await mkdtemp(join(tmpdir(),'reader plugins 中文 '));cleanup.push(()=>rm(directory,{recursive:true,force:true}));const root=join(directory,'工作区');await mkdir(root);await writeFile(join(root,'text.md'),'# RI\n\nRI 表示秩指示。');const host=await startServer({host:'127.0.0.1',port:0,configDir:join(directory,'config'),demo:true,noOpen:true});cleanup.push(()=>host.close());const workspace=await host.workspaces.select(root,{callerId:'local-owner',transport:'internal'}),main=await host.sessions.createMain(workspace.id,'插件阅读'),temporary=await host.sessions.createTemporary(workspace.id,main.id),scope:RunScope={workspaceId:workspace.id,sessionId:temporary.id,runId:randomUUID() as RunId,actor:{callerId:'local-owner',transport:'internal'},allowArtifactWrites:false};const release=await host.sessionRepository.registerScope(scope);cleanup.push(async()=>release());return{directory,root,host,workspace,main,temporary,scope};}
const python=process.env.READER_TEST_PYTHON??(process.platform==='win32'?'C:/Espressif/tools/python/python.exe':'python3');
it('configures credential-free stdio and HTTP MCP through the manager and restores them after restart',async()=>{
 const {host,workspace,scope}=await setup();
 const child=spawn(process.execPath,[resolve('tests/fixtures/mcp-tool-server.mjs'),'--http'],{stdio:['pipe','pipe','pipe'],windowsHide:true}),stopped=once(child,'exit');cleanup.push(async()=>{if(child.exitCode===null){child.stdin.end();await stopped;}});
 const lines=createInterface({input:child.stdout}),[line]=await once(lines,'line'),url=JSON.parse(line).url as string;
 const configs=[{id:'publicStdio',transport:'stdio' as const,command:process.execPath,args:[resolve('tests/fixtures/mcp-tool-server.mjs')],effects:{lookup:'read' as const}},{id:'publicHttp',transport:'http' as const,url,effects:{lookup:'read' as const}}];
 for(const config of configs){await host.externalMcp.configure(workspace.id,config);expect(host.externalMcp.list(workspace.id).find(item=>item.config.id===config.id)).toMatchObject({enabled:true,toolCount:6});expect(host.externalMcp.list(workspace.id).find(item=>item.config.id===config.id)!.config.credentialRef).toBeUndefined();expect((await host.runs.executor.execute('mcp_'+config.id+'_lookup',{term:'RI'},scope,scope.runId+':'+randomUUID(),new AbortController().signal)).content).toContain('RI');}
 await host.externalMcp.configure(workspace.id,configs[1]!,'fixture-only-secret');await host.externalMcp.configure(workspace.id,configs[1]!);expect(host.externalMcp.list(workspace.id).find(item=>item.config.id==='publicHttp')!.config.credentialRef).toBeTruthy();
 await host.externalMcp.close();const restored=new ExternalMcpManager(host.capabilities,host.workspaces);cleanup.push(()=>restored.close());await restored.loadWorkspace(workspace.id);
 expect(restored.list(workspace.id).filter(item=>item.enabled)).toHaveLength(2);for(const config of configs)expect((await host.runs.executor.execute('mcp_'+config.id+'_lookup',{term:'after restart'},scope,scope.runId+':'+randomUUID(),new AbortController().signal)).content).toContain('after restart');
},30000);
it('installs, configures, invokes and persistently reloads a reader plugin without changing its parent',async()=>{
 const {host,workspace,main,temporary,scope}=await setup(),before=await host.sessionRepository.snapshot(workspace.id,main.id);
 await host.plugins.install(resolve('plugins/reader-helper'),workspace.id);await host.plugins.enable('reader-helper',workspace.id);
 const result=await host.runs.executor.execute('reader_explain_term',{term:'RI'},scope,scope.runId+':term',new AbortController().signal);expect(result.content).toContain('秩指示');
 await host.plugins.updateSettings('reader-helper',workspace.id,{maxCharacters:18});
 const short=await host.runs.executor.execute('reader_explain_term',{term:'RI'},scope,scope.runId+':short',new AbortController().signal);expect([...short.content].length).toBeLessThanOrEqual(18);
 const doc=await host.documents.open(workspace.id,'text.md',new AbortController().signal);await host.documents.waitReady(doc,new AbortController().signal);
 const selection={text:'RI',anchors:[{workspaceId:workspace.id,documentId:doc.documentId,version:doc.version,location:{kind:'block' as const,blockId:'b1',start:0,end:2}}]},bridge=new UiBridge(host.capabilities,host.sessionRepository,host.selections);
 expect(bridge.listUiContributions(workspace.id).map(item=>item.id)).toContain('reader-helper.ask-selection');
 const action=await bridge.invokeUiAction('reader-helper.ask-selection',{actor:scope.actor,workspaceId:workspace.id,sessionId:temporary.id},selection);expect(action.target).toBe('temporary');expect(action.selection).toEqual(selection);
 await host.plugins.disable('reader-helper',workspace.id);expect(bridge.listUiContributions(workspace.id)).toHaveLength(0);expect(host.tools.list(workspace.id).some(tool=>tool.name==='reader_explain_term')).toBe(false);expect(await host.sessionRepository.snapshot(workspace.id,main.id)).toEqual(before);
 await host.plugins.enable('reader-helper',workspace.id);await host.plugins.reload(workspace.id);expect(host.plugins.list(workspace.id).find(item=>item.manifest.id==='reader-helper')).toMatchObject({enabled:true,settings:{maxCharacters:18}});
},30000);
it('reloads dependencies even when the dependent package was installed first',async()=>{
 const {host,workspace,directory}=await setup();for(const[id,dependencies]of [['dependent',['dependency']],['dependency',[]]] as const){const path=join(directory,id);await mkdir(path);await writeFile(join(path,'plugin.json'),JSON.stringify({id,version:'1.0.0',sdkRange:'^1.0.0',entry:'index.mjs',settingsSchema:{type:'object'},permissions:[],dependencies}));await writeFile(join(path,'index.mjs'),'export default {async activate(){}}');await host.plugins.install(path,workspace.id);}
 await host.plugins.enable('dependency',workspace.id);await host.plugins.enable('dependent',workspace.id);await host.plugins.reload(workspace.id);expect(host.plugins.list(workspace.id).every(plugin=>plugin.enabled)).toBe(true);
},15000);
it('manages actual HTTP MCP discovery, schema notifications, aborts and authenticated settings',async()=>{
 const {host,workspace,main,scope,temporary}=await setup(),before=await host.sessionRepository.snapshot(workspace.id,main.id);
 const child=spawn(process.execPath,[resolve('tests/fixtures/mcp-tool-server.mjs'),'--http'],{stdio:['pipe','pipe','pipe'],windowsHide:true});const stopped=once(child,'exit');cleanup.push(async()=>{if(child.exitCode===null){child.stdin.end();await stopped;}});let diagnostics='';child.stderr.on('data',bytes=>diagnostics+=bytes);
 const lines=createInterface({input:child.stdout}),[line]=await once(lines,'line');const url=JSON.parse(line).url as string;
 const request=async(path:string,method='GET',body?:unknown)=>{const response=await fetch(host.url+'/api/v1/workspaces/'+workspace.id+path,{method,headers:{authorization:'Bearer '+host.auth.token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};};
 expect((await request('/external-mcp','PUT',{config:{id:'httpProof',transport:'http',url,effects:{lookup:'read',rotate_schema:'read',long_call:'read',status:'read',parent_mutation:'read'}},secret:'reader-mcp-fixture-token'})).status).toBe(200);
 expect((await request('/external-mcp')).body).toMatchObject([{enabled:true,toolCount:6}]);expect(JSON.stringify((await request('/external-mcp')).body)).not.toContain('reader-mcp-fixture-token');
 const lookup=await request('/plugins/tools/mcp_httpProof_lookup/call','POST',{sessionId:temporary.id,input:{term:'RI'}});expect(lookup.status).toBe(200);expect(lookup.body.content).toContain('RI');
 expect((await request('/plugins/tools/mcp_httpProof_write_external/call','POST',{sessionId:temporary.id,input:{}})).body.error.code).toBe('TOOL_SCOPE_DENIED');
 await host.runs.executor.execute('mcp_httpProof_rotate_schema',{},scope,scope.runId+':rotate',new AbortController().signal);await host.externalMcp.refresh('httpProof',workspace.id);
 expect(host.tools.list(workspace.id).find(tool=>tool.name==='mcp_httpProof_lookup')!.inputSchema).toMatchObject({required:['term','revision']});
 await expect(host.runs.executor.execute('mcp_httpProof_lookup',{term:'RI'},scope,scope.runId+':bad-schema',new AbortController().signal)).rejects.toMatchObject({code:'TOOL_INPUT_INVALID'});
 const controller=new AbortController(),running=host.runs.executor.execute('mcp_httpProof_long_call',{},scope,scope.runId+':cancel',controller.signal),failure=expect(running).rejects.toThrow();await new Promise(resolve=>setTimeout(resolve,100));controller.abort();await failure;
 await expect.poll(async()=>{const value=await host.runs.executor.execute('mcp_httpProof_status',{},scope,scope.runId+':status'+randomUUID(),new AbortController().signal);return(value.data as {cancelled:boolean}).cancelled;}).toBe(true);
 const previewAbort=new AbortController(),preview=fetch(host.url+'/api/v1/workspaces/'+workspace.id+'/plugins/tools/mcp_httpProof_long_call/call',{method:'POST',signal:previewAbort.signal,headers:{authorization:'Bearer '+host.auth.token,'content-type':'application/json'},body:JSON.stringify({sessionId:temporary.id,input:{}})}),previewFailure=expect(preview).rejects.toThrow();await new Promise(resolve=>setTimeout(resolve,100));previewAbort.abort();await previewFailure;await expect.poll(async()=>{const value=await host.runs.executor.execute('mcp_httpProof_status',{},scope,scope.runId+':preview-status'+randomUUID(),new AbortController().signal);return(value.data as {cancelled:boolean}).cancelled;}).toBe(true);
 const mutation=await host.runs.executor.execute('mcp_httpProof_parent_mutation',{url:host.url,workspaceId:workspace.id,parentSessionId:main.id},scope,scope.runId+':parent',new AbortController().signal);expect(mutation.data).toMatchObject({parentAttemptStatus:401});expect(await host.sessionRepository.snapshot(workspace.id,main.id)).toEqual(before);
 expect((await request('/external-mcp/httpProof/disable','POST',{})).status).toBe(200);expect(host.tools.list(workspace.id).some(tool=>tool.name.startsWith('mcp_httpProof_'))).toBe(false);expect(diagnostics).toBe('');
 child.stdin.end();await stopped;expect(child.exitCode).toBe(0);
},30000);
it('calls a real Python process with Unicode and shell characters, and terminates timed-out and cancelled process trees',async()=>{
 const {host,workspace,main,scope,directory}=await setup(),before=await host.sessionRepository.snapshot(workspace.id,main.id);
 await host.plugins.install(resolve('plugins/python-helper'),workspace.id);await host.plugins.updateSettings('python-helper',workspace.id,{python});await host.plugins.enable('python-helper',workspace.id);
 const result=await host.runs.executor.execute('python_word_stats',{text:'你好 AI'},scope,scope.runId+':python',new AbortController().signal);expect(result.data).toMatchObject({char_count:5});
 const marker=join(directory,'should-not-exist');const text='你好 $(touch '+marker+') & ; `quoted`';const safe=await host.runs.executor.execute('python_word_stats',{text},scope,scope.runId+':literal',new AbortController().signal);expect(safe.data).toMatchObject({char_count:[...text].length});await expect(access(marker)).rejects.toThrow();
 const base={command:python,args:[resolve('tests/fixtures/process-tool.py')],timeoutMs:5000,tool:{name:'process_probe',effect:'read' as const,inputSchema:{type:'object',properties:{mode:{type:'string'},pidFile:{type:'string'}}}}};
 await expect(processTool(base).execute({mode:'error'},scope,new AbortController().signal)).rejects.toMatchObject({code:'PROCESS_TOOL_FAILED'});
 for(const mode of ['timeout','cancel']){const pidFile=join(directory,mode+'.json'),controller=new AbortController(),tool=processTool({...base,timeoutMs:mode==='timeout'?300:5000});const running=tool.execute({mode:'sleep',pidFile},scope,controller.signal);const failure=expect(running).rejects.toMatchObject({code:mode==='timeout'?'PROCESS_TIMEOUT':'CANCELLED'});await expect.poll(async()=>{try{return JSON.parse(await readFile(pidFile,'utf8'));}catch{return null;}}).toBeTruthy();const pids=JSON.parse(await readFile(pidFile,'utf8')) as number[];if(mode==='cancel')controller.abort();await failure;for(const pid of pids)expect(()=>process.kill(pid,0)).toThrow();}
 expect(await host.sessionRepository.snapshot(workspace.id,main.id)).toEqual(before);await host.plugins.disable('python-helper',workspace.id);
},30000);
it('discovers real external MCP tools, refreshes schemas, and refuses undeclared writes in a temporary run',async()=>{
 const {host,workspace,main,scope}=await setup(),before=await host.sessionRepository.snapshot(workspace.id,main.id);
 const connection=await connectExternalMcp({id:'proof',transport:'stdio',command:process.execPath,args:[resolve('tests/fixtures/mcp-tool-server.mjs')],effects:{lookup:'read',rotate_schema:'read',parent_mutation:'read'}},workspace.id);cleanup.push(()=>connection.close());
 host.capabilities.register(workspace.id,'tool','external-proof',connection.provider);
 const value=await host.runs.executor.execute('mcp_proof_lookup',{term:'RI'},scope,scope.runId+':external',new AbortController().signal);expect(value.content).toContain('RI');
 await expect(host.runs.executor.execute('mcp_proof_write_external',{},scope,scope.runId+':denied',new AbortController().signal)).rejects.toMatchObject({code:'TOOL_SCOPE_DENIED'});
 const mutation=await host.runs.executor.execute('mcp_proof_parent_mutation',{url:host.url,workspaceId:workspace.id,parentSessionId:main.id},scope,scope.runId+':parent',new AbortController().signal);expect(mutation.data).toMatchObject({parentAttemptStatus:401});expect(await host.sessionRepository.snapshot(workspace.id,main.id)).toEqual(before);
 await connection.client.callTool({name:'rotate_schema',arguments:{}});await connection.refresh();expect(connection.provider.tools.find(tool=>tool.name==='mcp_proof_lookup')!.inputSchema).toMatchObject({required:['term','revision']});
 await connection.close();await expect(connection.provider.tools[0]!.execute({term:'RI',revision:2},scope,new AbortController().signal)).rejects.toThrow();
},30000);
