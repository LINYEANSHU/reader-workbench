import {fileURLToPath} from 'node:url';
import type {PluginManager} from './manager.js';import type {WorkspaceId} from '../../../contracts/src/ids.js';
const names=new Set(['reader-helper','python-helper','visual-document-memory']);
export function bundledPluginPath(name:string){if(!names.has(name))throw Error('Unknown bundled plugin');const relative=import.meta.url.includes('/packages/core/src/')?'../../../../plugins/':'../plugins/';return fileURLToPath(new URL(relative+name+'/',import.meta.url));}
export async function ensureBundledPlugins(plugins:PluginManager,workspaceId:WorkspaceId){await plugins.loadWorkspace(workspaceId);if(plugins.list(workspaceId).some(entry=>entry.manifest.id==='visual-document-memory'))return;await plugins.install(bundledPluginPath('visual-document-memory'),workspaceId);await plugins.enable('visual-document-memory',workspaceId);}
