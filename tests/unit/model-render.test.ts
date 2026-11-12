import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readdir,rm,writeFile,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {modelRender} from '../../packages/core/src/documents/pdf.js';
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const step of cleanup.splice(0))await step();});
async function directory(){const path=await mkdtemp(join(tmpdir(),'model-render-'));cleanup.push(()=>rm(path,{recursive:true,force:true}));return path;}
it('sends a scan-like page as a smaller JPEG on white and reuses it',async()=>{
 const root=await directory(),canvas=createCanvas(900,1200),context=canvas.getContext('2d');
 // Left half transparent; right half grain like a scanned page, which PNG compresses poorly.
 let seed=12345;const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)&255;};
 const pixels=context.createImageData(450,1200);for(let index=0;index<pixels.data.length;index+=4){const value=next();pixels.data[index]=value;pixels.data[index+1]=value;pixels.data[index+2]=value;pixels.data[index+3]=255;}context.putImageData(pixels,450,0);
 const page=join(root,'page-1.png');await writeFile(page,canvas.toBuffer('image/png'));
 const jpeg=await modelRender(page,new AbortController().signal);
 expect(jpeg).toBeDefined();expect(jpeg!.subarray(0,3)).toEqual(Buffer.from([0xff,0xd8,0xff]));expect(jpeg!.length).toBeLessThan((await stat(page)).size);
 const decoded=await loadImage(jpeg!),check=createCanvas(decoded.width,decoded.height).getContext('2d');check.drawImage(decoded,0,0);
 expect([...check.getImageData(100,100,1,1).data].slice(0,3).every(value=>value>245)).toBe(true);
 expect(await modelRender(page,new AbortController().signal)).toEqual(jpeg);
 expect((await readdir(root)).sort()).toEqual(['page-1.model.jpg','page-1.png']);
});
it('keeps a text page, which PNG stores more compactly, and remembers the decision',async()=>{
 const root=await directory(),canvas=createCanvas(900,1200),context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,900,1200);context.fillStyle='#111';context.font='16px sans-serif';for(let line=0;line<60;line++)context.fillText('Line '+line+' of body text about channel capacity, throughput and delay.',40,30+line*19);
 const page=join(root,'page-2.png');await writeFile(page,canvas.toBuffer('image/png'));
 expect(await modelRender(page,new AbortController().signal)).toBeUndefined();
 expect((await readdir(root)).sort()).toEqual(['page-2.model.jpg.none','page-2.png']);
 expect(await modelRender(page,new AbortController().signal)).toBeUndefined();
 expect(await modelRender(join(root,'photo.jpg'),new AbortController().signal)).toBeUndefined();
});
