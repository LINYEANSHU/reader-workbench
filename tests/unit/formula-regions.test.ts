import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readdir,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {loadImage} from '@napi-rs/canvas';
import {parsePdf,renderPdfRegions,formulaRegions} from '../../packages/core/src/documents/pdf.js';
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const step of cleanup.splice(0))await step();});
async function paper(formulaLines:number[]){
 const directory=await mkdtemp(join(tmpdir(),'formula-regions-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const document=await PDFDocument.create(),body=await document.embedFont(StandardFonts.Helvetica),symbol=await document.embedFont(StandardFonts.Symbol),page=document.addPage([600,800]);
 for(let line=0;line<40;line++){const y=780-line*19;if(formulaLines.includes(line))page.drawText('α β γ Σ π θ λ ∑ ∫ ≤ α β γ Σ π θ λ ∑ ∫ ≤ α β γ Σ',{x:150,y,size:11,font:symbol});else page.drawText('Line '+line+' explains the channel capacity.',{x:40,y,size:11,font:body});}
 const path=join(directory,'paper.pdf');await writeFile(path,await document.save());return{directory,path};
}
it('finds one region per displayed formula on a page whose prose extracts cleanly',async()=>{
 const lines=[5,12,20,27,33,38],{path}=await paper(lines),parsed=await parsePdf({path,workspaceId:'w',documentId:'d',version:'v'} as never,new AbortController().signal);
 const profile=parsed.pages[0]!.profile!;expect(profile.textSufficient).toBe(false);expect(profile.mathRatio).toBeGreaterThan(0.08);
 const regions=profile.formulaRegions!;expect(regions).toHaveLength(lines.length);
 regions.forEach((region,index)=>{const baseline=(800-(780-lines[index]!*19))/800;expect(region[1]).toBeLessThan(baseline);expect(region[3]).toBeGreaterThan(baseline);expect(region[3]-region[1]).toBeLessThan(0.04);expect(region[0]).toBeGreaterThan(0.2);});
});
it('renders legible formula crops into the page cache and reuses them',async()=>{
 const {path,directory}=await paper([5,12,20,27,33,38]),regions=(await parsePdf({path,workspaceId:'w',documentId:'d',version:'v'} as never,new AbortController().signal)).pages[0]!.profile!.formulaRegions!.slice(0,2);
 const files=await renderPdfRegions(path,1,regions,directory,new AbortController().signal);
 expect(files.map(file=>file.split(/[\\/]/).at(-1))).toEqual(['page-1-formula-1.png','page-1-formula-2.png']);
 const image=await loadImage(files[0]!);expect(image.width/image.height).toBeCloseTo((regions[0]![2]-regions[0]![0])*600/((regions[0]![3]-regions[0]![1])*800),0);expect(image.height).toBeGreaterThan(30);
 expect(await renderPdfRegions(path,1,regions,directory,new AbortController().signal)).toEqual(files);expect((await readdir(directory)).filter(name=>name.endsWith('.tmp'))).toEqual([]);
});
it('joins scripts and fraction parts into one formula and gives up when formulas fill the page',()=>{
 const run=(x0:number,y0:number,x1:number,y1:number)=>({box:[x0,y0,x1,y1] as [number,number,number,number],size:10});
 expect(formulaRegions([run(100,100,140,110),run(141,95,146,102),run(100,112,140,122),run(300,400,340,410)],600,800)).toHaveLength(2);
 expect(formulaRegions(Array.from({length:13},(_,index)=>run(100,index*60,140,index*60+10)),600,800)).toBeUndefined();
 expect(formulaRegions([run(0,0,600,500)],600,800)).toBeUndefined();expect(formulaRegions([],600,800)).toBeUndefined();
});
