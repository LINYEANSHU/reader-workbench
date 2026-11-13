import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {readOfficeParts} from '../../packages/core/src/documents/office-math.js';
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const step of cleanup.splice(0))await step();});
async function archive(bytes:Uint8Array){const directory=await mkdtemp(join(tmpdir(),'office-parts-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));const path=join(directory,'document.docx');await writeFile(path,bytes);return path;}
it.each([0,6] as const)('enforces the actual XML part size when ZIP metadata lies (compression %s)',async level=>{
 const bytes=zipSync({'word/document.xml':new Uint8Array(17*1024*1024).fill(65)},{level});
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),directory=view.getUint32(bytes.length-6,true);view.setUint32(directory+24,1,true);
 const file=await archive(bytes);
 const result=await readOfficeParts(file,name=>name==='word/document.xml').then(()=>({accepted:true}),error=>({code:error.code}));
 expect(result).toEqual({code:'ARCHIVE_LIMIT'});
});
it('reads selected XML without decompressing oversized unselected media',async()=>{
 const xml='<w:document>readable source</w:document>',file=await archive(zipSync({'word/document.xml':strToU8(xml),'word/media/image.png':new Uint8Array(17*1024*1024).fill(65)}));
 await expect(readOfficeParts(file,name=>name==='word/document.xml')).resolves.toEqual({'word/document.xml':xml});
});
