import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {parsePdf} from '../../packages/core/src/documents/pdf.js';
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const step of cleanup.splice(0))await step();});
it('reads only clean text pages from the text layer and keeps images, formulas, charts and blank pages visual',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pdf-profile-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const document=await PDFDocument.create(),body=await document.embedFont(StandardFonts.Helvetica),symbol=await document.embedFont(StandardFonts.Symbol),picture=await document.embedPng(await readFile('tests/fixtures/assets/diagram.png'));
 let page=document.addPage([595,842]);for(let line=0;line<40;line++)page.drawText('Line '+line+' of plain body text about channel capacity.',{x:50,y:800-line*18,size:11,font:body});
 page=document.addPage([595,842]);page.drawText('Figure page with a short caption only, long enough to pass the minimum text length check.',{x:50,y:800,size:9,font:body});page.drawImage(picture,{x:50,y:200,width:495,height:500});
 page=document.addPage([595,842]);for(let line=0;line<20;line++){page.drawText('Equation '+line+':',{x:50,y:800-line*30,size:11,font:body});page.drawText('α β γ Σ π θ λ ∑ ∫ ≤',{x:130,y:800-line*30,size:12,font:symbol});}
 page=document.addPage([595,842]);page.drawText('Chart page with axis labels and a description of the plotted throughput values.',{x:50,y:800,size:11,font:body});for(let bar=0;bar<300;bar++)page.drawLine({start:{x:50+bar,y:200},end:{x:50+bar,y:200+(bar*37)%300},thickness:0.5,color:rgb(0,0,0)});
 document.addPage([595,842]);
 const path=join(directory,'mixed.pdf');await writeFile(path,await document.save());
 const parsed=await parsePdf({path,workspaceId:'w',documentId:'d',version:'v'} as never,new AbortController().signal);
 const profiles=parsed.pages.map(item=>item.profile!);
 expect(profiles.map(profile=>profile.textSufficient)).toEqual([true,false,false,false,false]);
 expect(profiles[1]!.imageCoverage).toBeCloseTo(495*500/(595*842),2);
 expect(profiles[2]!.mathRatio).toBeGreaterThan(0.3);
 expect(profiles[3]!.pathOps).toBeGreaterThanOrEqual(300);
 expect(profiles[4]!.textChars).toBe(0);
 expect(profiles[0]).toMatchObject({garbledRatio:0,imageCoverage:0,mathRatio:0});
});
