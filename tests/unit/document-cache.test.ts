import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {WorkspaceService} from '../../packages/core/src/workspaces/service.js';
import {DocumentService} from '../../packages/core/src/documents/service.js';
import {CapabilityRegistry} from '../../packages/core/src/plugins/registry.js';
const cleanup:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
it('reads parsed content from storage once and serves status reads without it',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'document-cache-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));const root=join(directory,'A');await mkdir(root);
 await writeFile(join(root,'notes.md'),'# 标题\n\n第一段：信道容量。\n\n第二段：吞吐量。');
 const workspaces=new WorkspaceService(join(directory,'config'));cleanup.push(()=>workspaces.close());const workspace=await workspaces.select(root,{callerId:'local-owner',transport:'internal'});
 const documents=new DocumentService(workspaces,new CapabilityRegistry());cleanup.push(()=>documents.close());
 const document=await documents.open(workspace.id,'notes.md',new AbortController().signal);await documents.waitReady(document,new AbortController().signal);
 const store=await workspaces.storeFor(workspace.id),full=vi.spyOn(store.documents,'get');
 const meta=await store.documents.meta(document);expect(meta?.record.parseState).toBe('ready');expect(meta).not.toHaveProperty('parsed');expect((await store.documents.get(document))?.parsed?.pages).toHaveLength(1);full.mockClear();
 expect((await documents.get(document)).parseState).toBe('ready');expect(full).not.toHaveBeenCalled();
 const first=await documents.parsed(document);await documents.parsed(document);await documents.readBlock(document,first.blocks[0]!.id);const page=await documents.readPage(document,1);
 expect(full).toHaveBeenCalledTimes(1);expect(page.text).toContain('信道容量');expect(first.pages[0]).not.toHaveProperty('imagePath');
 expect(await documents.search(document,'吞吐量',2)).not.toHaveLength(0);
 // Any save of the stored document makes the next read go back to storage.
 const saved=(await store.documents.get(document))!;saved.parsed!.pages[0]!.text='改写后的文字';await store.documents.save(saved);full.mockClear();
 expect((await documents.parsed(document)).pages[0]!.text).toBe('改写后的文字');expect(full).toHaveBeenCalledTimes(1);
});
