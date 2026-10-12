import {fileURLToPath} from 'node:url';
import type {PluginManager} from './manager.js';import type {WorkspaceId} from '../../../contracts/src/ids.js';
import {ReaderError} from '../../../contracts/src/errors.js';
const names=new Set(['reader-helper','python-helper','visual-document-memory']);
export function bundledPluginPath(name:string){if(!names.has(name))throw Error('Unknown bundled plugin');const relative=import.meta.url.includes('/packages/core/src/')?'../../../../plugins/':'../plugins/';return fileURLToPath(new URL(relative+name+'/',import.meta.url));}
export async function ensureBundledPlugins(plugins:PluginManager,workspaceId:WorkspaceId){await plugins.loadWorkspace(workspaceId);if(plugins.list(workspaceId).some(entry=>entry.manifest.id==='visual-document-memory'))return;try{await plugins.install(bundledPluginPath('visual-document-memory'),workspaceId);await plugins.enable('visual-document-memory',workspaceId);}catch(error){if(!(error instanceof ReaderError)||error.code!=='PLUGIN_ALREADY_INSTALLED')throw error;await plugins.recordDiagnostic(workspaceId,'visual-document-memory','同名插件目录已存在，已保留；自动安装未执行。请检查设置中的本机插件目录。');}}
