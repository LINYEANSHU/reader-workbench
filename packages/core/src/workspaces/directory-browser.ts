import {readdir,realpath,stat} from 'node:fs/promises';
import {resolve,join,win32,posix} from 'node:path';
import {homedir} from 'node:os';
import type {DirectoryBrowser,DirectoryEntry} from '../../../contracts/src/workspaces.js';
import {ReaderError} from '../../../contracts/src/errors.js';

const paths=(path:string)=>/^(?:[a-z]:[\\/]|\\\\)/i.test(path)?win32:posix;
export function directoryRoot(path:string):string{return paths(path).parse(path).root;}
export function directoryParent(path:string):string|null{
 const api=paths(path),normalized=api.normalize(path),root=api.parse(normalized).root;
 const current=normalized.replace(/[\\/]+$/,'')||root;
 if(normalized.replace(/[\\/]+$/,'')===root.replace(/[\\/]+$/,''))return null;
 return api.dirname(current);
}
async function entriesAt(root:string):Promise<DirectoryEntry[]>{
 const entries=await readdir(root,{withFileTypes:true});
 return entries.filter(entry=>entry.isDirectory()&&!entry.name.startsWith('.')).map(entry=>({name:entry.name,path:join(root,entry.name)})).sort((a,b)=>a.name.localeCompare(b.name));
}
async function navigationRoots(current:string):Promise<DirectoryEntry[]>{
 const roots:DirectoryEntry[]=[{name:'主目录',path:await realpath(homedir()).catch(()=>homedir())}];
 const candidates=process.platform==='win32'?Array.from({length:26},(_,i)=>String.fromCharCode(65+i)+':\\'):['/'];
 const available=await Promise.all(candidates.map(async path=>{try{return(await stat(path)).isDirectory()?{name:path,path}:null;}catch{return null;}}));
 for(const entry of available)if(entry)roots.push(entry);
 const root=directoryRoot(current);if(root&&!roots.some(entry=>entry.path.toLowerCase()===root.toLowerCase()))roots.push({name:root,path:root});
 return roots;
}
export async function browseDirectoryBrowser(input:string):Promise<DirectoryBrowser>{
 try{
  const path=await realpath(resolve(input||homedir()));
  const [entries,roots]=await Promise.all([entriesAt(path),navigationRoots(path)]);
  return {path,parent:directoryParent(path),entries,roots};
 }catch{throw new ReaderError('DIRECTORY_UNAVAILABLE','目录不存在或不可访问',404);}
}
export async function browseDirectories(input:string):Promise<DirectoryEntry[]>{
 try{return await entriesAt(await realpath(resolve(input||homedir())));}
 catch{throw new ReaderError('DIRECTORY_UNAVAILABLE','目录不存在或不可访问',404);}
}
