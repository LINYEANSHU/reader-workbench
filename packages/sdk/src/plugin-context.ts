import type {WorkspaceId} from '../../contracts/src/ids.js';
import type {CapabilityMap} from './capabilities.js';
import type {PluginManifest} from './manifest.js';
export interface PluginContext {
  readonly workspaceId:WorkspaceId;
  readonly settings:Readonly<Record<string,unknown>>;
  register<K extends keyof CapabilityMap>(kind:K,id:string,value:CapabilityMap[K]):()=>void;
  getCapability<K extends keyof CapabilityMap>(kind:K,id:string):CapabilityMap[K];
}
export interface Plugin {manifest:PluginManifest;activate(ctx:PluginContext):Promise<void>;dispose?():Promise<void>}
