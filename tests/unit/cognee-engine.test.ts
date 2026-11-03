import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {CogneeEngine} from '../../packages/core/src/knowledge/cognee.js';
import {JsonWorker} from '../../packages/core/src/knowledge/process.js';
import * as nativeRoots from '../../packages/core/src/knowledge/native-root.js';

afterEach(()=>vi.restoreAllMocks());
it('does not start a worker if shutdown overlaps asynchronous initialization',async()=>{
 const root=await mkdtemp(join(tmpdir(),'reader engine shutdown '));
 const workspaces=new WorkspaceService(join(root,'config'));
 const engine=new CogneeEngine(workspaces);
 try{
  const directory=join(root,'documents');await mkdir(directory);
  const workspace=await workspaces.select(directory,{callerId:'local-owner',transport:'internal'});
  let entered!:()=>void,resume!:(value:{pythonPath:string;modelCache:string})=>void;
  const started=new Promise<void>(resolve=>entered=resolve);
  vi.spyOn(engine as unknown as {settings:()=>Promise<unknown>},'settings').mockImplementation(async()=>{
   entered();return new Promise(resolve=>resume=resolve);
  });
  const call=vi.spyOn(JsonWorker.prototype,'call').mockResolvedValue([]);
  const request=engine.search(workspace.id,'source',new AbortController().signal);
  const result=expect(request).rejects.toThrow('记忆组件正在退出');
  await started;const closing=engine.close();
  resume({pythonPath:process.execPath,modelCache:root});
  await result;await closing;expect(call).not.toHaveBeenCalled();
 }finally{await engine.close();await workspaces.close();await rm(root,{recursive:true,force:true});}
});

it('releases a native directory if shutdown finishes while the alias is being created',async()=>{
 const root=await mkdtemp(join(tmpdir(),'reader engine native shutdown '));
 const workspaces=new WorkspaceService(join(root,'config')),engine=new CogneeEngine(workspaces);
 try{
  const directory=join(root,'documents');await mkdir(directory);
  const workspace=await workspaces.select(directory,{callerId:'local-owner',transport:'internal'});
  vi.spyOn(engine as unknown as {settings:()=>Promise<unknown>},'settings').mockResolvedValue({pythonPath:process.execPath,modelCache:root});
  let entered!:()=>void,resume!:(value:nativeRoots.NativeRoot)=>void;
  const started=new Promise<void>(resolve=>entered=resolve);
  vi.spyOn(nativeRoots,'createNativeRoot').mockImplementation(async()=>{entered();return new Promise(resolve=>resume=resolve);});
  const call=vi.spyOn(JsonWorker.prototype,'call').mockResolvedValue([]),release=vi.fn(async()=>{});
  const request=engine.search(workspace.id,'source',new AbortController().signal);
  const result=expect(request).rejects.toThrow('记忆组件正在退出');
  await started;const closing=engine.close();resume({path:root,close:release});
  await result;await closing;expect(release).toHaveBeenCalledOnce();expect(call).not.toHaveBeenCalled();
 }finally{await engine.close();await workspaces.close();await rm(root,{recursive:true,force:true});}
});
