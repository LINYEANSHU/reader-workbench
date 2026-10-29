import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp} from 'node:fs/promises';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {startServer} from '../../apps/server/src/app.js';
const actor={callerId:'local-owner',transport:'internal' as const};
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
// Each import of the plugin module appends one character, so the marker length counts top-level executions.
async function markerPlugin(directory:string,id:string,marker:string){
 const manifest={id,version:'1.0.0',sdkRange:'^1.0.0',entry:'index.mjs',dependencies:[],permissions:[],settingsSchema:{type:'object',additionalProperties:false,properties:{label:{type:'string',default:'a'}}}};
 await mkdir(directory,{recursive:true});await writeFile(join(directory,'plugin.json'),JSON.stringify(manifest));
 await writeFile(join(directory,'index.mjs'),`import {appendFileSync} from 'node:fs';\nappendFileSync(${JSON.stringify(marker)},'x');\nexport default {async activate(){}};\n`);
 return manifest;
}
const executions=(marker:string)=>readFile(marker,'utf8').then(text=>text.length,()=>0);
async function start(configDir:string){const host=await startServer({host:'127.0.0.1',port:0,configDir,demo:true,noOpen:true});let closed=false;cleanup.push(async()=>{if(!closed)await host.close();});return{host,close:async()=>{closed=true;await host.close();}};}
it('does not execute plugins or MCP commands supplied by an opened workspace until they are trusted locally',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'reader trust 中文 '));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const root=join(directory,'imported'),internal=join(root,'.reader-workbench'),marker=join(directory,'marker.txt');
 const enabled=await markerPlugin(join(internal,'plugins','planted-enabled'),'planted-enabled',marker),disabled=await markerPlugin(join(internal,'plugins','planted-disabled'),'planted-disabled',marker);
 const mcp={id:'planted',transport:'stdio',command:process.execPath,args:[resolve('tests/fixtures/mcp-tool-server.mjs')],effects:{lookup:'read'}};
 // No workspace identity record: the database is adopted by whichever path opens it.
 const database=new DatabaseSync(join(internal,'state.sqlite'));
 database.exec('CREATE TABLE records(domain TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(domain,id))');
 const insert=database.prepare('INSERT INTO records VALUES(?,?,?)');
 insert.run('plugins',enabled.id,JSON.stringify({manifest:enabled,path:join(internal,'plugins',enabled.id),enabled:true,settings:{label:'a'}}));
 insert.run('plugins',disabled.id,JSON.stringify({manifest:disabled,path:join(internal,'plugins',disabled.id),enabled:false,settings:{label:'a'}}));
 insert.run('external-mcp',mcp.id,JSON.stringify({config:mcp,enabled:true}));database.close();
 const {host}=await start(join(directory,'config'));
 const workspace=await host.workspaces.select(root,actor);
 expect(await executions(marker)).toBe(0);
 for(const id of [enabled.id,disabled.id])expect(host.plugins.list(workspace.id).find(item=>item.manifest.id===id)).toMatchObject({enabled:false,trusted:false});
 await expect(host.plugins.enable(enabled.id,workspace.id)).rejects.toMatchObject({code:'PLUGIN_UNTRUSTED'});
 await expect(host.plugins.updateSettings(enabled.id,workspace.id,{label:'b'})).rejects.toMatchObject({code:'PLUGIN_UNTRUSTED'});
 await host.plugins.reload(workspace.id);expect(await executions(marker)).toBe(0);
 expect(host.externalMcp.list(workspace.id)).toMatchObject([{enabled:false,trusted:false,toolCount:0}]);
 await expect(host.externalMcp.enable(mcp.id,workspace.id)).rejects.toMatchObject({code:'MCP_UNTRUSTED'});
 // Explicit local authorization is still a working path.
 await host.plugins.trust(enabled.id,workspace.id);await host.plugins.enable(enabled.id,workspace.id);
 expect(await executions(marker)).toBe(1);expect(host.plugins.list(workspace.id).find(item=>item.manifest.id===enabled.id)).toMatchObject({enabled:true,trusted:true});
 expect(await executions(marker)).toBe(1);
 await host.externalMcp.trust(mcp.id,workspace.id);await host.externalMcp.enable(mcp.id,workspace.id);
 expect(host.externalMcp.list(workspace.id)).toMatchObject([{enabled:true,trusted:true}]);
});
it('keeps local grants across restarts, does not import disabled plugins and rejects changed code, settings or copied workspaces',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'reader trust restart '));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const root=join(directory,'workspace'),config=join(directory,'config'),marker=join(directory,'marker.txt');await mkdir(root);
 const manifest=await markerPlugin(join(directory,'source'),'trust-marker',marker);
 let server=await start(config);let workspace=await server.host.workspaces.select(root,actor);
 await server.host.plugins.install(join(directory,'source'),workspace.id);expect(await executions(marker)).toBe(1);
 await server.close();
 server=await start(config);workspace=await server.host.workspaces.select(root,actor);
 expect(server.host.plugins.list(workspace.id).find(item=>item.manifest.id===manifest.id)).toMatchObject({enabled:false,trusted:true});
 expect(await executions(marker)).toBe(1);
 await server.host.plugins.enable(manifest.id,workspace.id);expect(await executions(marker)).toBe(2);
 await server.host.plugins.updateSettings(manifest.id,workspace.id,{label:'local'});
 await server.close();
 server=await start(config);workspace=await server.host.workspaces.select(root,actor);
 expect(server.host.plugins.list(workspace.id).find(item=>item.manifest.id===manifest.id)).toMatchObject({enabled:true,trusted:true,settings:{label:'local'}});
 expect(await executions(marker)).toBe(3);
 await server.close();
 // A copy of the workspace has a different path and therefore no local grant.
 const copy=join(directory,'copy');await cp(root,copy,{recursive:true});
 server=await start(config);const copied=await server.host.workspaces.select(copy,actor);
 expect(server.host.plugins.list(copied.id).find(item=>item.manifest.id===manifest.id)?.enabled??false).toBe(false);
 const before=await executions(marker);await server.close();expect(before).toBe(4);// the original workspace is restored on start
 const state=join(root,'.reader-workbench','state.sqlite');
 let database=new DatabaseSync(state);database.prepare("UPDATE records SET data=json_set(data,'$.settings.label','tampered') WHERE domain='plugins' AND id=?").run(manifest.id);database.close();
 server=await start(config);workspace=await server.host.workspaces.select(root,actor);
 expect(server.host.plugins.list(workspace.id).find(item=>item.manifest.id===manifest.id)).toMatchObject({enabled:false,trusted:false});
 expect(await executions(marker)).toBe(4);await server.close();
 database=new DatabaseSync(state);database.prepare("UPDATE records SET data=json_set(data,'$.settings.label','local') WHERE domain='plugins' AND id=?").run(manifest.id);database.close();
 await writeFile(join(root,'.reader-workbench','plugins',manifest.id,'index.mjs'),`import {appendFileSync} from 'node:fs';\nappendFileSync(${JSON.stringify(marker)},'changed');\nexport default {async activate(){}};\n`);
 server=await start(config);workspace=await server.host.workspaces.select(root,actor);
 expect(server.host.plugins.list(workspace.id).find(item=>item.manifest.id===manifest.id)).toMatchObject({enabled:false,trusted:false});
 expect(await executions(marker)).toBe(4);
});
