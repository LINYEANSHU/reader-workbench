import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { get as httpGet } from 'node:http';
import { loadRuntimeConfig } from '../../packages/core/src/runtime/config.js';
import { CredentialStore } from '../../packages/core/src/runtime/credentials.js';
import { startServer } from '../../apps/server/src/app.js';

const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function configuration() {
  const configDir=await mkdtemp(join(tmpdir(),'reader runtime 中文 '));
  cleanup.push(()=>rm(configDir,{recursive:true,force:true}));
  return {host:'127.0.0.1',port:0,configDir,noOpen:true,demo:false};
}
async function boot() {
  const config=await configuration();
  const server=await startServer(config); cleanup.push(()=>server.close());
  const connection=JSON.parse(await readFile(join(config.configDir,'connection.json'),'utf8')) as {token:string;url:string};
  return {...server,config,connection};
}
describe('authenticated runtime',()=>{
  it('starts locally without opening and protects configuration',async()=>{
    await expect(loadRuntimeConfig(['web','--no-open'])).resolves.toMatchObject({host:'127.0.0.1',port:4317,noOpen:true});
    const runtime=await boot();
    const testKey='sk-reader-private-中文';
    await new CredentialStore(runtime.config.configDir).setSecret('test-provider',testKey);
    const unauthenticatedConfiguration=await fetch(runtime.url+'/api/v1/config');
    expect(unauthenticatedConfiguration.status).toBe(401);
    const response=await fetch(runtime.url+'/api/v1/config',{headers:{authorization:'Bearer '+runtime.connection.token}});
    expect(response.status).toBe(200);
    const maskedConfiguration=await response.json();
    expect(JSON.stringify(maskedConfiguration)).not.toContain(testKey);
    expect(JSON.stringify(maskedConfiguration)).not.toContain(runtime.connection.token);
    expect(await new CredentialStore(runtime.config.configDir).getSecret('test-provider')).toBe(testKey);
  });
  it('exchanges the fragment code once for a protected browser cookie',async()=>{
    const runtime=await boot();
    const code=new URL(runtime.bootstrapUrl).hash.slice(1).replace(/^bootstrap=/,'');
    expect(new URL(runtime.bootstrapUrl).search).toBe('');
    const exchange=()=>fetch(runtime.url+'/api/v1/auth/bootstrap',{method:'POST',headers:{origin:runtime.url,'content-type':'application/json'},body:JSON.stringify({code})});
    const response=await exchange();
    expect(response.status).toBe(200);
    const cookie=response.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/i);expect(cookie).toMatch(/SameSite=Strict/i);
    expect(await response.json()).toMatchObject({redirect:'/'});
    expect((await exchange()).status).toBe(401);
    expect((await fetch(runtime.url+'/api/v1/config',{headers:{cookie:cookie.split(';')[0]!}})).status).toBe(200);
    expect((await fetch(runtime.url+'/api/v1/config',{headers:{cookie:cookie.split(';')[0]!,origin:'https://attacker.example'}})).status).toBe(403);
  });
  it('rejects foreign Host and Origin even with a valid bearer',async()=>{
    const runtime=await boot();
    for(const extra of [{origin:'https://attacker.example'},{host:'attacker.example'}] as Record<string,string>[]){
      const status=await new Promise<number|undefined>((resolve,reject)=>{
        httpGet(runtime.url+'/api/v1/config',{headers:{authorization:'Bearer '+runtime.connection.token,...extra}},response=>{
          response.resume();resolve(response.statusCode);
        }).on('error',reject);
      });
      expect(status,JSON.stringify(extra)).toBe(403);
    }
    expect((await fetch(runtime.url+'/health')).status).toBe(200);
  });
  it('reports an occupied port without exposing secrets',async()=>{
    const occupied=createServer();await new Promise<void>(resolve=>occupied.listen(0,'127.0.0.1',resolve));
    cleanup.push(()=>new Promise<void>(resolve=>occupied.close(()=>resolve())));
    const address=occupied.address();if(!address||typeof address==='string')throw new Error('No bound port');
    const config={...await configuration(),port:address.port};
    await expect(startServer(config)).rejects.toThrow(/PORT_IN_USE|端口.*占用/);
  });
  it('rejects invalid flags and ports rather than silently changing the listener',async()=>{
    await expect(loadRuntimeConfig(['web','--port','abc'])).rejects.toThrow(/port|端口/i);
    await expect(loadRuntimeConfig(['web','--unknown'])).rejects.toThrow(/unknown|未知/i);
  });
});
