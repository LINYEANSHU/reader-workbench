import {readFile,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';import {createHash} from 'node:crypto';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {writePrivateJson} from '../runtime/secure-file.js';
// Execution grants live in the global config directory. A workspace folder (including its
// .reader-workbench state) can describe plugins or MCP commands but can never authorize them.
export type TrustKind='plugin'|'external-mcp';
const MAX_FILES=5000,MAX_BYTES=256*1024*1024;
export function canonicalJson(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(key=>(value as Record<string,unknown>)[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonicalJson((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value)??'null';
}
export function trustIdentity(value:unknown){return createHash('sha256').update(canonicalJson(value)).digest('hex');}
/** Digest of every file in a plugin directory; links are rejected so the digest covers the code that runs. */
export async function directoryDigest(root:string):Promise<string>{
 const hash=createHash('sha256'),files:string[]=[];let bytes=0;
 const visit=async(relative:string)=>{for(const entry of (await readdir(join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
  const child=relative?relative+'/'+entry.name:entry.name,info=await lstat(join(root,child));
  if(info.isSymbolicLink())throw new ReaderError('PLUGIN_LINK_DENIED','插件包不能包含文件系统链接');
  if(info.isDirectory()){await visit(child);continue;}
  if(!info.isFile())continue;
  if(files.push(child)>MAX_FILES||(bytes+=info.size)>MAX_BYTES)throw new ReaderError('PLUGIN_TOO_LARGE','插件包文件过多或过大');
  hash.update(child+'\0'+info.size+'\0'+createHash('sha256').update(await readFile(join(root,child))).digest('hex')+'\n');
 }};
 await visit('');return hash.digest('hex');
}
export class ExecutionTrustStore{
 private entries?:Promise<Map<string,string>>;private writing:Promise<void>=Promise.resolve();
 constructor(private configDir:string){}
 private path(){return join(this.configDir,'execution-trust.json');}
 private key(kind:TrustKind,workspaceId:WorkspaceId,id:string){return kind+'\0'+workspaceId+'\0'+id;}
 private load(){return this.entries??=(async()=>{
  try{const parsed=JSON.parse(await readFile(this.path(),'utf8')) as {version?:number;entries?:Record<string,unknown>};
   return new Map(parsed?.version===1&&parsed.entries&&typeof parsed.entries==='object'?Object.entries(parsed.entries).filter((item):item is [string,string]=>typeof item[1]==='string'):[]);}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'||error instanceof SyntaxError)return new Map<string,string>();throw error;}
 })();}
 async trusted(kind:TrustKind,workspaceId:WorkspaceId,id:string,identity:string){return(await this.load()).get(this.key(kind,workspaceId,id))===identity;}
 async grant(kind:TrustKind,workspaceId:WorkspaceId,id:string,identity:string){const entries=await this.load();entries.set(this.key(kind,workspaceId,id),identity);await this.save(entries);}
 async revoke(kind:TrustKind,workspaceId:WorkspaceId,id:string){const entries=await this.load();if(entries.delete(this.key(kind,workspaceId,id)))await this.save(entries);}
 private save(entries:Map<string,string>){const next=this.writing.catch(()=>{}).then(()=>writePrivateJson(this.path(),{version:1,entries:Object.fromEntries(entries)}));this.writing=next;return next;}
}
