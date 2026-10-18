import {fileURLToPath} from 'node:url';
import {readFile,readdir} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
import type {PluginManager} from './manager.js';import type {WorkspaceId} from '../../../contracts/src/ids.js';
import type {PluginManifest} from '../../../sdk/src/manifest.js';
import {ReaderError} from '../../../contracts/src/errors.js';
const names=new Set(['reader-helper','python-helper','visual-document-memory','document-translation']);
export function bundledPluginPath(name:string){if(!names.has(name))throw Error('Unknown bundled plugin');const relative=import.meta.url.includes('/packages/core/src/')?'../../../../plugins/':'../plugins/';return fileURLToPath(new URL(relative+name+'/',import.meta.url));}
// Known shipped v1 code only: use the updated bundle without overwriting user-owned files.
const legacyReadingFiles:Record<string,string>={
 'index.mjs':'c94656458faefa0eb1eff6f8721268fc848456fae4a87e1acaa25adbbe99ab33',
 'context.mjs':'2a3ba60f4d72f39f5fd263b27b3e45ee1b1173b287128ba8c745f82565b9d892',
 'plugin.json':'de2926f651240de1a21ef441166967c6eae7510db65ce0547898b31318a0b87b',
 'reading.mjs':'1bb9af55bfccffb872e8ab656bff0e1be2a38f09e54d5076d48567c0f74f8e2f'
};
export async function currentBundledPluginRoot(root:string,manifest:PluginManifest):Promise<string>{
 if(manifest.id==='document-translation'&&manifest.version==='1.0.0'&&manifest.entry==='index.mjs'){
  // An exact shipped copy resolves dependencies from the app, wherever the workspace lives.
  // Never redirect customized plugin code or overwrite workspace-owned files.
  try{
   const shipped=bundledPluginPath(manifest.id),names=['index.mjs','local-worker.py','plugin.json','translation.mjs'];
   const files=(await readdir(root)).filter(name=>name!=='__pycache__').sort();if(JSON.stringify(files)!==JSON.stringify(names))return root;
   for(const name of names){const [installed,current]=await Promise.all([readFile(join(root,name),'utf8'),readFile(join(shipped,name),'utf8')]);if(installed.replace(/\r\n/g,'\n')!==current.replace(/\r\n/g,'\n'))return root;}
   return shipped;
  }catch{return root;}
 }
 if(manifest.id!=='visual-document-memory'||manifest.version!=='1.0.0'||manifest.entry!=='index.mjs')return root;
 try{
  const files=await readdir(root);if(files.length!==Object.keys(legacyReadingFiles).length)return root;
  for(const[name,expected]of Object.entries(legacyReadingFiles))if(createHash('sha256').update((await readFile(join(root,name),'utf8')).replace(/\r\n/g,'\n')).digest('hex')!==expected)return root;
  return bundledPluginPath(manifest.id);
 }catch{return root;}
}
export async function ensureBundledPlugins(plugins:PluginManager,workspaceId:WorkspaceId){
 await plugins.loadWorkspace(workspaceId);
 for(const id of ['visual-document-memory','document-translation']){
  if(plugins.list(workspaceId).some(entry=>entry.manifest.id===id))continue;
  try{await plugins.install(bundledPluginPath(id),workspaceId);await plugins.enable(id,workspaceId);}
  catch(error){if(!(error instanceof ReaderError)||error.code!=='PLUGIN_ALREADY_INSTALLED')throw error;await plugins.recordDiagnostic(workspaceId,id,'同名插件目录已存在，已保留；自动安装未执行。请检查设置中的本机插件目录。');}
 }
}
