import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {writePrivateJson} from './secure-file.js';

const pending=new Map<string,Promise<unknown>>();
/** Personal agent settings live beside credentials, outside reading workspaces. */
export class LocalSettings<T>{
 readonly file:string;
 constructor(configDir:string,name:string,private initial:()=>T){this.file=join(configDir,'agent',name+'.json');}
 private async read():Promise<T>{try{return JSON.parse(await readFile(this.file,'utf8')) as T;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return this.initial();throw error;}}
 async get():Promise<T>{await pending.get(this.file);return this.read();}
 async update(change:(current:T)=>T|Promise<T>):Promise<T>{
  const task=(pending.get(this.file)??Promise.resolve()).catch(()=>{}).then(async()=>{const value=await change(await this.read());await writePrivateJson(this.file,value);return value;});
  pending.set(this.file,task);try{return await task;}finally{if(pending.get(this.file)===task)pending.delete(this.file);}
 }
}
