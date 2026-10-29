import {Inflate} from 'fflate';
import {ReaderError} from '../../../contracts/src/errors.js';
// ZIP size fields are attacker-controlled, so every limit is enforced on the bytes actually inflated.
export interface ZipLimits{maxEntries:number;maxEntryBytes:number;maxTotalBytes:number;maxRatio:number}
export const defaultZipLimits:ZipLimits={maxEntries:5000,maxEntryBytes:64*1024*1024,maxTotalBytes:128*1024*1024,maxRatio:200};
const CHUNK=16*1024,RATIO_FLOOR=4*1024*1024;
const fail=(message:string):never=>{throw new ReaderError('ARCHIVE_LIMIT',message,413);};
const invalid=():never=>{throw new ReaderError('ARCHIVE_INVALID','压缩包结构无效');};
export function boundedUnzip(bytes:Uint8Array,options:{limits?:Partial<ZipLimits>;signal?:AbortSignal}={}):Record<string,Uint8Array>{
 const limits={...defaultZipLimits,...options.limits},view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=(at:number)=>at+2<=bytes.length?view.getUint16(at,true):invalid(),u32=(at:number)=>at+4<=bytes.length?view.getUint32(at,true):invalid();
 let end=-1;for(let at=bytes.length-22;at>=Math.max(0,bytes.length-22-0xffff);at--)if(u32(at)===0x06054b50){end=at;break;}
 if(end<0)invalid();
 const count=u16(end+10),directory=u32(end+16);
 if(count===0xffff||directory===0xffffffff)fail('不支持 ZIP64 压缩包');
 if(count>limits.maxEntries)fail('压缩包成员数量超过上限');
 const decoder=new TextDecoder(),files:Record<string,Uint8Array>={};let total=0;
 for(let index=0,at=directory;index<count;index++){
  options.signal?.throwIfAborted();
  if(u32(at)!==0x02014b50)invalid();
  const flags=u16(at+8),method=u16(at+10),compressed=u32(at+20),declared=u32(at+24),nameLength=u16(at+28),extraLength=u16(at+30),commentLength=u16(at+32),local=u32(at+42);
  if(at+46+nameLength>bytes.length)invalid();
  const name=decoder.decode(bytes.subarray(at+46,at+46+nameLength));at+=46+nameLength+extraLength+commentLength;
  if(flags&1)fail('不支持加密压缩包');
  if(declared>limits.maxEntryBytes||total+declared>limits.maxTotalBytes)fail('压缩包展开后超过大小上限');
  if(u32(local)!==0x04034b50)invalid();
  const start=local+30+u16(local+26)+u16(local+28);if(start+compressed>bytes.length)invalid();
  const data=bytes.subarray(start,start+compressed);
  if(method===0){if(data.length>limits.maxEntryBytes||(total+=data.length)>limits.maxTotalBytes)fail('压缩包展开后超过大小上限');files[name]=data.slice();continue;}
  if(method!==8)fail('压缩包使用了不支持的压缩方式');
  const chunks:Uint8Array[]=[];let size=0;
  const check=()=>{if(size>limits.maxEntryBytes||total+size>limits.maxTotalBytes)fail('压缩包展开后超过大小上限');if(size>RATIO_FLOOR&&size>Math.max(1,compressed)*limits.maxRatio)fail('压缩包压缩比异常，已拒绝展开');};
  const inflate=new Inflate((chunk:Uint8Array)=>{size+=chunk.length;check();chunks.push(chunk);});
  for(let offset=0;offset<data.length||offset===0;offset+=CHUNK){options.signal?.throwIfAborted();const final=offset+CHUNK>=data.length;inflate.push(data.subarray(offset,offset+CHUNK),final);if(final)break;}
  const output=new Uint8Array(size);let position=0;for(const chunk of chunks){output.set(chunk,position);position+=chunk.length;}
  total+=size;files[name]=output;
 }
 return files;
}
