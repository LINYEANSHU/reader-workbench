import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {migrateLegacyConfig} from '../../packages/core/src/runtime/legacy-config.js';
const cleanup:string[]=[];afterEach(async()=>{for(const path of cleanup.splice(0))await rm(path,{recursive:true,force:true});});
it('moves legacy private configuration to the user directory while preserving existing settings and conflict backups',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'reader config migration '));cleanup.push(directory);
 const source=join(directory,'project','user-config'),target=join(directory,'user','Config');await Promise.all([mkdir(source,{recursive:true}),mkdir(target,{recursive:true})]);
 await writeFile(join(source,'credentials.json'),JSON.stringify({legacy:'legacy-key',same:'older-key'}));
 await writeFile(join(target,'credentials.json'),JSON.stringify({current:'current-key',same:'current-key'}));
 await writeFile(join(source,'workspaces.json'),JSON.stringify([{id:'old',root:'/old',callerId:'local-owner'}]));
 await writeFile(join(target,'workspaces.json'),JSON.stringify([{id:'new',root:'/new',callerId:'local-owner'}]));
 await writeFile(join(source,'connection.json'),'stale-connection-token');
 await migrateLegacyConfig(target,[source]);
 expect(JSON.parse(await readFile(join(target,'credentials.json'),'utf8'))).toEqual({legacy:'legacy-key',current:'current-key',same:'current-key'});
 expect(JSON.parse(await readFile(join(target,'workspaces.json'),'utf8')).map((item:any)=>item.id).sort()).toEqual(['new','old']);
 await expect(access(join(source,'credentials.json'))).rejects.toMatchObject({code:'ENOENT'});
 await expect(access(join(source,'workspaces.json'))).rejects.toMatchObject({code:'ENOENT'});
 await expect(access(join(target,'connection.json'))).rejects.toMatchObject({code:'ENOENT'});
 await expect(migrateLegacyConfig(target,[source])).resolves.toBeUndefined();
});

it('does not relocate credentials while the previous authenticated service is still running',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'reader active config '));cleanup.push(directory);const source=join(directory,'old'),target=join(directory,'new');await mkdir(source);
 const server=createServer((_request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end('{}');});await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 try{await writeFile(join(source,'connection.json'),JSON.stringify({url:'http://127.0.0.1:'+(server.address() as {port:number}).port,token:'fixture-token'}));await writeFile(join(source,'credentials.json'),'{"fixture":"key"}');
  await expect(migrateLegacyConfig(target,[source])).rejects.toMatchObject({code:'LEGACY_SERVER_RUNNING'});expect(await readFile(join(source,'credentials.json'),'utf8')).toBe('{"fixture":"key"}');
 }finally{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
});

it('keeps credentials in place for a live old daemon bound to a non-loopback host',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'reader nonlocal config '));cleanup.push(directory);const source=join(directory,'old');await mkdir(source);
 await writeFile(join(source,'connection.json'),JSON.stringify({url:'http://0.0.0.0:4317',pid:process.pid,token:'fixture-token'}));await writeFile(join(source,'credentials.json'),'{"fixture":"key"}');
 await expect(migrateLegacyConfig(join(directory,'new'),[source])).rejects.toMatchObject({code:'LEGACY_SERVER_RUNNING'});expect(await readFile(join(source,'credentials.json'),'utf8')).toBe('{"fixture":"key"}');
});
