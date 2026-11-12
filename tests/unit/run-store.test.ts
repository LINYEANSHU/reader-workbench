import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {SqliteWorkspaceStore} from '../../packages/core/src/storage/workspace-store.js';
import {RunRepository} from '../../packages/core/src/runs/repository.js';
import type {RunRecord} from '../../packages/contracts/src/runs.js';
import type {ContextEnvelope} from '../../packages/contracts/src/sessions.js';
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const step of cleanup.splice(0).reverse())await step();});
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'run-store-')),file=join(dir,'state.sqlite'),store=new SqliteWorkspaceStore('w' as never,file);
 cleanup.push(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
 await store.sessions.createSession({id:'s' as never,workspaceId:'w' as never,kind:'main',revision:0});
 const record:RunRecord={id:'r' as never,kind:'agent',workspaceId:'w' as never,sessionId:'s' as never,status:'queued',requestId:'q',request:{workspaceId:'w',sessionId:'s',question:'问题',documents:[],attachmentIds:[],providerId:'p',requestId:'q',allowArtifactWrites:false} as never,callerId:'c',partialText:''};
 await store.runs.create(record);
 const image='data:image/png;base64,'+Buffer.alloc(200*1024,1).toString('base64');
 const context={workspaceId:'w',sessionId:'s',mainRevision:0,documents:[],messages:[{role:'system',content:'系统'},{role:'user',content:[{type:'text',text:'页'},{type:'image_url',image_url:{url:image}}]}],sourceRanges:[],budget:{limit:1000,inputTokens:1,reservedOutputTokens:0,estimated:true}} as unknown as ContextEnvelope;
 return{store,file,record,context};
}
const rowBytes=(file:string,table:string,column:string)=>{const database=new DatabaseSync(file,{readOnly:true});try{return(database.prepare('SELECT length('+column+') AS size FROM '+table).get() as {size:number}).size;}finally{database.close();}};
it('keeps large context messages out of the frequently saved run row and restores them on read',async()=>{
 const {store,file,record,context}=await setup();
 record.context=context;record.status='running';await store.runs.save(record);
 for(let index=0;index<20;index++){record.partialText+='字';await store.runs.save(record);}
 expect(rowBytes(file,'runs','data')).toBeLessThan(4096);
 expect(rowBytes(file,'run_contexts','data')).toBeGreaterThan(200*1024);
 const loaded=await store.runs.get(record.id);
 expect(loaded.partialText).toBe('字'.repeat(20));expect(loaded.context?.messages).toEqual(context.messages);
 expect(await store.runs.status(record.id)).toBe('running');
 expect((await store.runs.findByRequest('s' as never,'c','q'))?.id).toBe('r');expect(await store.runs.findByRequest('s' as never,'c','other')).toBeNull();
 expect((await store.runs.list())[0]?.context?.messages).toEqual(context.messages);
});
it('wakes event readers when an event is appended instead of waiting for the fallback poll',async()=>{
 const {store,record}=await setup(),workspaces={storeFor:async()=>store} as never,runs=new RunRepository(workspaces),controller=new AbortController();
 const pending=runs.waitForEvent(record.workspaceId,record.id,controller.signal,60_000),started=Date.now();
 await runs.emit(record,'delta',{text:'一'});await pending.wait;
 expect(Date.now()-started).toBeLessThan(1000);
 const aborted=runs.waitForEvent(record.workspaceId,record.id,controller.signal,60_000);controller.abort();await aborted.wait;
 expect((await runs.readEvents(record.workspaceId,record.id,0)).map(event=>event.kind)).toEqual(['delta']);
});
