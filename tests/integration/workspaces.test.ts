import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,access,chmod} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {userInfo} from 'node:os';
import {join,win32} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {isWithin} from '../../packages/core/src/workspaces/path-guard.js';
import type {WorkspaceId} from '../../packages/contracts/src/ids.js';
const actor={callerId:'local-owner',transport:'internal' as const};const clean:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();});
async function setup(){const dir=await mkdtemp(join(tmpdir(),'reader workspace 中文 '));clean.push(()=>rm(dir,{recursive:true,force:true}));
  const config=join(dir,'config'),a=join(dir,'文档 A'),b=join(dir,'文档 B');await mkdir(a);await mkdir(b);
  const service=new WorkspaceService(config);clean.push(()=>service.close());return{dir,config,a,b,service};}
const hash=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
describe('workspace boundaries',()=>{
  it('waits for in-flight storage access and never reopens storage after close',async()=>{
    const {a,service}=await setup();const workspace=await service.select(a,actor);
    let entered!:()=>void,release!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
    const get=service.get.bind(service);
    vi.spyOn(service,'get').mockImplementationOnce(async id=>{entered();await gate;return get(id);});
    const reading=service.storeFor(workspace.id);await started;
    let closed=false;const closing=service.close().then(()=>{closed=true;});
    await new Promise<void>(resolve=>setImmediate(resolve));const closedBeforeReadFinished=closed;
    release();await Promise.all([reading,closing]);
    expect(closedBeforeReadFinished).toBe(false);
    await expect(service.storeFor(workspace.id)).rejects.toMatchObject({code:'SERVER_CLOSING'});
    await expect(service.select(a,actor)).rejects.toMatchObject({code:'SERVER_CLOSING'});
  });
  it('shares one storage handle for concurrent first reads of a reopened workspace',async()=>{
    const {a,config,service}=await setup();const workspace=await service.select(a,actor);await service.close();
    const reopened=new WorkspaceService(config);clean.push(()=>reopened.close());
    const stores=await Promise.all(Array.from({length:8},()=>reopened.storeFor(workspace.id)));
    try{expect(new Set(stores).size).toBe(1);}finally{for(const store of new Set(stores))await store.close();}
  });
  it('rejects traversal without changing originals',async()=>{
    const {a,b,service}=await setup();await writeFile(join(a,'原文 空格.md'),'中文 original\n');
    const before=hash(await readFile(join(a,'原文 空格.md')));
    await expect(service.storeFor('unknown' as WorkspaceId)).rejects.toMatchObject({code:'WORKSPACE_REQUIRED'});
    const workspace=await service.select(a,actor);const other=await service.select(b,actor);
    const source=await service.resolvePath(workspace.id,'原文 空格.md','read');
    expect(await readFile(source,'utf8')).toBe('中文 original\n');
    for(const bad of ['../outside.txt',join(a,'原文 空格.md'),'C:\\secret.txt','\\\\host\\share\\file','.reader-workbench/state.sqlite']){
      await expect(service.resolvePath(workspace.id,bad,'read')).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE'});
    }
    await service.saveUiState(workspace.id,'client-a',{sidebarCollapsed:true});
    expect(await service.getUiState(other.id,'client-a')).toBeNull();
    expect(await service.getUiState(workspace.id,'client-b')).toBeNull();
    expect(hash(await readFile(source))).toBe(before);
    await access(join(a,'.reader-workbench','state.sqlite'));
  });
  it('rejects linked reads and linked output parents outside the workspace',async()=>{
    const {a,b,service}=await setup();await writeFile(join(b,'secret.txt'),'outside');
    await symlink(b,join(a,'linked'),process.platform==='win32'?'junction':'dir');
    const workspace=await service.select(a,actor);
    await expect(service.resolvePath(workspace.id,'linked/secret.txt','read')).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE'});
    await expect(service.resolvePath(workspace.id,'linked/new/output.md','create')).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE'});
    await expect(service.resolvePath(workspace.id,'missing/nested/file.md','create')).resolves.toBe(join(workspace.root,'missing','nested','file.md'));
  });
  it('persists independent UI state across reopen and never exposes credentials',async()=>{
    const {a,config,service}=await setup();const workspace=await service.select(a,actor);
    await service.saveUiState(workspace.id,'client',{tabs:['one'],zoom:125});await service.close();
    const reopened=new WorkspaceService(config);clean.push(()=>reopened.close());
    expect(await reopened.getUiState(workspace.id,'client')).toEqual({tabs:['one'],zoom:125});
    await expect(reopened.select(config,actor)).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE'});
  });
  it('reports a missing directory without creating it',async()=>{
    const {dir,service}=await setup();
    await expect(service.select(join(dir,'nonexistent'),actor)).rejects.toMatchObject({code:'WORKSPACE_UNAVAILABLE'});
    await expect(access(join(dir,'nonexistent'))).rejects.toThrow();
  });
  it('uses component boundaries for Windows drive and UNC paths',()=>{
    expect(isWithin('C:\\Read','C:\\Read\\中文.md',win32)).toBe(true);
    expect(isWithin('C:\\Read','C:\\Reader\\a.md',win32)).toBe(false);
    expect(isWithin('C:\\Read','D:\\Read\\a.md',win32)).toBe(false);
    expect(isWithin('\\\\host\\share\\Read','\\\\host\\share\\Read\\a',win32)).toBe(true);
    expect(isWithin('\\\\host\\share\\Read','\\\\host\\other\\Read',win32)).toBe(false);
  });
  it('reports a read-only directory and protects configuration through aliases',async()=>{
    const {dir,a,service,config}=await setup();
    const execute=promisify(execFile);
    const account=(process.env.USERDOMAIN?process.env.USERDOMAIN+'\\':'')+userInfo().username;
    try{
      if(process.platform==='win32')await execute('icacls.exe',[a,'/inheritance:r','/grant:r',account+':(RX)','/deny',account+':(WD,AD)'],{windowsHide:true});
      else await chmod(a,0o500);
      await expect(service.select(a,actor)).rejects.toMatchObject({code:'WORKSPACE_NOT_WRITABLE'});
    }finally{
      if(process.platform==='win32'){await execute('icacls.exe',[a,'/remove:d',account,'/inheritance:e','/grant:r',account+':(OI)(CI)F'],{windowsHide:true});}
      else await chmod(a,0o700);
    }
    const parent=await service.select(dir,actor);
    await writeFile(join(config,'credentials.json'),'secret');
    await expect(service.resolvePath(parent.id,'config/credentials.json','read')).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE'});
    await symlink(config,join(a,'config-alias'),process.platform==='win32'?'junction':'dir');
    const workspace=await service.select(a,actor);
    await expect(service.resolvePath(workspace.id,'config-alias/credentials.json','read')).rejects.toMatchObject({code:'PATH_OUTSIDE_WORKSPACE'});
  });
});
