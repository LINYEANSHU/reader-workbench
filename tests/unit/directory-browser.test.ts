import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,mkdir,rm,realpath,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import Fastify from 'fastify';
import * as browser from '../../packages/core/src/workspaces/directory-browser.js';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {workspaceRoutes} from '../../apps/server/src/routes/workspaces.js';
import {Authentication} from '../../apps/server/src/auth.js';
import type {WorkspaceId} from '../../packages/contracts/src/ids.js';
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function fixture(){const root=await mkdtemp(join(tmpdir(),'reader-browser-'));cleanup.push(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'子目录'));await mkdir(join(root,'.hidden'));await writeFile(join(root,'file.md'),'document');return root;}
describe('directory browser metadata',()=>{
 it('keeps drive and UNC roots terminal and finds their immediate parents',()=>{
  expect(browser.directoryParent('C:\\')).toBeNull();
  expect(browser.directoryParent('C:\\Read')).toBe('C:\\');
  expect(browser.directoryParent('C:\\Read\\papers\\')).toBe('C:\\Read');
  expect(browser.directoryParent('\\\\server\\share\\')).toBeNull();
  expect(browser.directoryParent('\\\\server\\share\\papers')).toBe('\\\\server\\share\\');
  expect(browser.directoryParent('/')).toBeNull();
  expect(browser.directoryParent('/home/reader/')).toBe('/home');
 });
 it('returns a canonical current path, immediate children and navigable roots',async()=>{
  const root=await fixture(),result=await browser.browseDirectoryBrowser(join(root,'子目录','..'));
  expect(result.path).toBe(await realpath(root));expect(result.parent).toBe(dirname(result.path));
  expect(result.entries).toEqual([{name:'子目录',path:join(result.path,'子目录')}]);
  expect(result.roots.some(entry=>entry.path===browser.directoryRoot(result.path))).toBe(true);
  expect(await browser.browseDirectories(root)).toEqual(result.entries);
 });
 it('adds browser metadata without changing legacy API and preserves caller boundaries',async()=>{
  const root=await fixture(),service=new WorkspaceService(join(root,'.config')),app=Fastify(),auth=new Authentication();cleanup.push(()=>service.close());cleanup.push(()=>app.close());
  workspaceRoutes(app,service,auth);const headers={authorization:'Bearer '+auth.token};
  const legacy=await app.inject({url:'/api/v1/directories?path='+encodeURIComponent(root),headers});expect(legacy.statusCode).toBe(200);expect(Array.isArray(legacy.json())).toBe(true);
  const metadata=await app.inject({url:'/api/v1/directories/browser?path='+encodeURIComponent(root),headers});expect(metadata.statusCode).toBe(200);expect(metadata.json()).toMatchObject({path:await realpath(root),entries:legacy.json()});
  const denied=await app.inject({url:'/api/v1/directories/browser?workspaceId=foreign&path='+encodeURIComponent(root),headers});expect(denied.statusCode).toBe(403);
  await expect(service.browseDirectoryBrowser(root,{callerId:'other',transport:'internal'},'foreign' as WorkspaceId)).rejects.toMatchObject({code:'WORKSPACE_DENIED'});
 });
});
