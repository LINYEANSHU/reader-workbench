import {expect,it} from 'vitest';
import {mkdtemp,cp,readFile,appendFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {bundledPluginPath,currentBundledPluginRoot} from '../../packages/core/src/plugins/bundled.js';

it('loads unchanged translation copies from the application dependency tree and preserves customized code',async()=>{
 const root=await mkdtemp(join(tmpdir(),'bundled-translation-'));
 try{
  await cp(bundledPluginPath('document-translation'),root,{recursive:true,filter:path=>!path.includes('__pycache__')});
  await mkdir(join(root,'__pycache__'));await writeFile(join(root,'__pycache__','local-worker.pyc'),'disposable cache');
  const manifest=JSON.parse(await readFile(join(root,'plugin.json'),'utf8'));
  expect(await currentBundledPluginRoot(root,manifest)).toBe(bundledPluginPath('document-translation'));
  await appendFile(join(root,'translation.mjs'),'\n// user customization\n');
  expect(await currentBundledPluginRoot(root,manifest)).toBe(root);
 }finally{await rm(root,{recursive:true,force:true});}
});

it('uses the current bundled reader for an unchanged legacy install and preserves customized plugins',async()=>{
 const root=await mkdtemp(join(tmpdir(),'legacy-reader-'));
 try{
  await cp('tests/fixtures/plugins/visual-memory-v1',root,{recursive:true});
  const manifest=JSON.parse(await readFile(join(root,'plugin.json'),'utf8'));
  expect(await currentBundledPluginRoot(root,manifest)).toBe(bundledPluginPath('visual-document-memory'));
  await appendFile(join(root,'context.mjs'),'\n// user customization\n');
  expect(await currentBundledPluginRoot(root,manifest)).toBe(root);
 }finally{await rm(root,{recursive:true,force:true});}
});
