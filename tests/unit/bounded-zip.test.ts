import {describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {zipSync,unzipSync,strToU8} from 'fflate';
import {boundedUnzip} from '../../packages/core/src/documents/bounded-zip.js';
const MiB=1024*1024;
// Rewrites the uncompressed-size field of every central-directory entry.
function forgeDeclaredSizes(archive:Uint8Array,size:number){const bytes=archive.slice(),view=new DataView(bytes.buffer);for(let at=0;at+4<=bytes.length;at++)if(view.getUint32(at,true)===0x02014b50)view.setUint32(at+24,size,true);return bytes;}
describe('bounded ZIP decoding',()=>{
 it('decodes a real DOCX exactly like an unbounded decoder',async()=>{
  const docx=new Uint8Array(await readFile('tests/fixtures/reader.docx'));
  expect(boundedUnzip(docx)).toEqual(unzipSync(docx));
  const mixed=zipSync({'stored.bin':[new Uint8Array([1,2,3]),{level:0}],'word/document.xml':strToU8('<w:document/>'.repeat(100))});
  expect(boundedUnzip(mixed)).toEqual(unzipSync(mixed));
 });
 it('rejects a small archive with a large expansion before it is fully inflated',()=>{
  const bomb=zipSync({'word/document.xml':strToU8('<w:document/>'),'unused.bin':new Uint8Array(65*MiB)});
  expect(bomb.length).toBeLessThan(MiB);
  expect(()=>boundedUnzip(bomb)).toThrow(expect.objectContaining({code:'ARCHIVE_LIMIT'}));
 });
 it('counts the bytes actually inflated instead of trusting declared sizes',()=>{
  const archive=forgeDeclaredSizes(zipSync({'a.bin':new Uint8Array(3*MiB).fill(7)}),16);
  expect(()=>boundedUnzip(archive,{limits:{maxEntryBytes:MiB}})).toThrow(expect.objectContaining({code:'ARCHIVE_LIMIT'}));
  expect(()=>boundedUnzip(archive,{limits:{maxTotalBytes:2*MiB}})).toThrow(expect.objectContaining({code:'ARCHIVE_LIMIT'}));
 });
 it('limits member counts, honours cancellation and rejects malformed archives',()=>{
  const many=zipSync(Object.fromEntries(Array.from({length:11},(_,index)=>['part-'+index+'.xml',strToU8('<x/>')])));
  expect(()=>boundedUnzip(many,{limits:{maxEntries:10}})).toThrow(expect.objectContaining({code:'ARCHIVE_LIMIT'}));
  expect(Object.keys(boundedUnzip(many))).toHaveLength(11);
  const controller=new AbortController();controller.abort();
  expect(()=>boundedUnzip(many,{signal:controller.signal})).toThrow();
  expect(()=>boundedUnzip(new Uint8Array([1,2,3]))).toThrow(expect.objectContaining({code:'ARCHIVE_INVALID'}));
 });
});
