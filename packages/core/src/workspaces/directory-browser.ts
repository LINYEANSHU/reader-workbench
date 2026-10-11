import {readdir,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import type {DirectoryEntry} from '../../../contracts/src/workspaces.js';
import {ReaderError} from '../../../contracts/src/errors.js';
export async function browseDirectories(input:string):Promise<DirectoryEntry[]>{
  try{const root=await realpath(resolve(input||homedir()));const entries=await readdir(root,{withFileTypes:true});
    return entries.filter(entry=>entry.isDirectory()&&!entry.name.startsWith('.')).map(entry=>({name:entry.name,path:join(root,entry.name)})).sort((a,b)=>a.name.localeCompare(b.name));}
  catch{throw new ReaderError('DIRECTORY_UNAVAILABLE','目录不存在或不可访问',404);}
}
