import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ReaderError } from '../../../contracts/src/errors.js';
import { writePrivateJson } from './secure-file.js';
const pending=new Map<string,Promise<void>>();
export class CredentialStore {
  private file:string;
  constructor(readonly directory:string){this.file=join(directory,'credentials.json');}
  private async load():Promise<Record<string,string>>{
    try{return JSON.parse(await readFile(this.file,'utf8')) as Record<string,string>;}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {};throw error;}
  }
  async setSecret(ref:string,value:string):Promise<void>{
    if(!/^[a-zA-Z0-9._-]{1,128}$/.test(ref)||!value)throw new ReaderError('INVALID_CREDENTIAL','凭据引用或值无效');
    const previous=pending.get(this.file)??Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{const data=await this.load();data[ref]=value;await writePrivateJson(this.file,data);});
    pending.set(this.file,next);try{await next;}finally{if(pending.get(this.file)===next)pending.delete(this.file);}
  }
  async getSecret(ref:string):Promise<string>{await pending.get(this.file)?.catch(()=>{});const value=(await this.load())[ref];if(!value)throw new ReaderError('CREDENTIAL_REQUIRED','请配置模型 API Key');return value;}
  async hasSecret(ref:string):Promise<boolean>{await pending.get(this.file)?.catch(()=>{});return Boolean((await this.load())[ref]);}
  async deleteSecret(ref:string):Promise<void>{
    if(!/^[a-zA-Z0-9._-]{1,128}$/.test(ref))throw new ReaderError('INVALID_CREDENTIAL','凭据引用无效');
    const previous=pending.get(this.file)??Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{const data=await this.load();if(Object.hasOwn(data,ref)){delete data[ref];await writePrivateJson(this.file,data);}});
    pending.set(this.file,next);try{await next;}finally{if(pending.get(this.file)===next)pending.delete(this.file);}
  }
}
