import {expect,it} from 'vitest';
import {access,mkdtemp,mkdir,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createNativeRoot} from '../../packages/core/src/knowledge/native-root.js';

it('keeps Unicode cache data in the workspace and removes only its native alias',async()=>{
 const base=await mkdtemp(join(tmpdir(),'reader native root '));
 const root=join(base,'资料 📚');await mkdir(root);await writeFile(join(root,'original.txt'),'keep');
 let native:Awaited<ReturnType<typeof createNativeRoot>>|undefined;
 try{
  native=await createNativeRoot(root);
  expect(native.path).toMatch(/^[\x00-\x7f]+$/);
  expect(await realpath(native.path)).toBe(await realpath(root));
  await writeFile(join(native.path,'database.txt'),'in workspace');
  expect(await readFile(join(root,'database.txt'),'utf8')).toBe('in workspace');
  await Promise.all([native.close(),native.close()]);
  await expect(access(native.path)).rejects.toMatchObject({code:'ENOENT'});
  await expect(access(dirname(native.path))).rejects.toMatchObject({code:'ENOENT'});
  expect(await readFile(join(root,'original.txt'),'utf8')).toBe('keep');
 }finally{await native?.close();await rm(base,{recursive:true,force:true});}
});

it('uses a protected Windows Temp alias when the user temporary path is Unicode',async()=>{
 const base=await mkdtemp(join(tmpdir(),'reader native fallback '));
 const root=join(base,'资料 📚');await mkdir(root);
 let native:Awaited<ReturnType<typeof createNativeRoot>>|undefined;
 try{
  native=await createNativeRoot(root,join(base,'临时 📚'));
  expect(native.path).toMatch(/^[\x00-\x7f]+$/);
  expect(await realpath(native.path)).toBe(await realpath(root));
 }finally{await native?.close();await rm(base,{recursive:true,force:true});}
});
