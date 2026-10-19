import {afterEach,expect,it} from 'vitest';
import {resolve} from 'node:path';
import {JsonWorker} from '../../packages/core/src/knowledge/process.js';
const workers:JsonWorker[]=[];afterEach(async()=>{await Promise.all(workers.splice(0).map(worker=>worker.close()));});
const worker=()=>{const value=new JsonWorker(process.execPath,[resolve('tests/fixtures/knowledge-worker.mjs')],process.env,process.cwd());workers.push(value);return value;};
it('serializes real process requests and separates diagnostics from protocol results',async()=>{
 const child=worker();expect(await Promise.all([child.call('echo',{value:'中文'},new AbortController().signal),child.call('echo',{value:2},new AbortController().signal)])).toEqual([{value:'中文'},{value:2}]);
});
it('rejects malformed protocol output instead of accepting a completed request',async()=>{await expect(worker().call('invalid',{},new AbortController().signal)).rejects.toThrow('记忆组件返回了无效响应');});
it('handles a closed input pipe when a worker exits during a large request',async()=>{
 const child=new JsonWorker(process.execPath,['-e','process.exit(1)'],process.env,process.cwd());workers.push(child);
 await expect(child.call('replace',{text:'x'.repeat(8*1024*1024)},new AbortController().signal)).rejects.toThrow();
 await child.close();
});
it('cancels an in-flight worker and allows a later request to restart it',async()=>{
 const child=worker(),controller=new AbortController();const request=child.call('wait',{},controller.signal);setTimeout(()=>controller.abort(),100);await expect(request).rejects.toThrow();
 expect(await child.call('echo',{retry:true},new AbortController().signal)).toEqual({retry:true});
});
it('waits until the child process actually exits before reporting shutdown complete',async()=>{
 const child=worker(),result=await child.call('pid',{},new AbortController().signal) as {pid:number};
 await child.close();expect(()=>process.kill(result.pid,0)).toThrow();
});
it('closes owned database subprocesses as well as the protocol process',async()=>{
 const child=worker(),result=await child.call('tree',{},new AbortController().signal) as {pid:number};
 const alive=()=>{try{process.kill(result.pid,0);return true;}catch{return false;}};
 try{await child.close();await expect.poll(alive,{timeout:1500}).toBe(false);}finally{if(alive())process.kill(result.pid);}
});
