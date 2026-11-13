import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,rm,writeFile,readdir} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {startServer} from '../../apps/server/src/app.js';
const actor={callerId:'local-owner',transport:'internal' as const},cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
it('pre-reads a formula-heavy PDF page as its text plus formula crops',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'formula-crops-')),root=join(directory,'workspace');await mkdir(root);
 const pdf=await PDFDocument.create(),body=await pdf.embedFont(StandardFonts.Helvetica),symbol=await pdf.embedFont(StandardFonts.Symbol),page=pdf.addPage([600,800]),lines=[5,12,20,27,33,38];
 for(let line=0;line<40;line++){const y=780-line*19;if(lines.includes(line))page.drawText('α β γ Σ π θ λ ∑ ∫ ≤ α β γ Σ π θ λ ∑ ∫ ≤ α β γ Σ',{x:150,y,size:11,font:symbol});else page.drawText('Line '+line+' explains the channel capacity.',{x:40,y,size:11,font:body});}
 await writeFile(join(root,'formulas.pdf'),await pdf.save());
 const host=await startServer({host:'127.0.0.1',port:0,configDir:join(directory,'config'),demo:true,noOpen:true});cleanup.push(()=>rm(directory,{recursive:true,force:true}),()=>host.close());
 const workspace=await host.workspaces.select(root,actor),calls:any[]=[];
 host.capabilities.register(workspace.id,'model','vision-test',{identity:'vision-test',imageLimits:{maxImages:600,maxImageBytes:4*1024*1024,maxTotalImageBytes:12*1024*1024,maxRequestBytes:16*1024*1024,imageTokens:1024},capabilities:{vision:true,tools:false,contextWindow:100000},async *generate(input:any){calls.push(structuredClone(input));const system=String(input.messages[0].content);
  if(system.includes('VISUAL_DOCUMENT_MEMORY_PAGES'))yield{kind:'delta',text:JSON.stringify({pages:[{page:1,summary:'公式页',transcription:'',figures:[],formulas:['\\\\alpha+\\\\beta'],terms:[],uncertainties:[],crossPageRelations:[]}]})};
  else if(system.includes('VISUAL_DOCUMENT_MEMORY_OVERVIEW'))yield{kind:'delta',text:'第1页给出公式。'};else yield{kind:'delta',text:'回答'};yield{kind:'done'};}});
 const document=await host.documents.open(workspace.id,'formulas.pdf',new AbortController().signal);await host.documents.waitReady(document,new AbortController().signal);
 const main=await host.sessions.createMain(workspace.id,'公式'),run=await host.runs.submit({workspaceId:workspace.id,sessionId:main.id,documents:[document],question:'第1页的公式是什么？',providerId:'vision-test',requestId:randomUUID(),attachmentIds:[],allowArtifactWrites:false},actor);
 for await(const _event of host.runs.events(workspace.id,run.runId,0,new AbortController().signal)){}
 expect((await host.runs.get(workspace.id,run.runId)).status).toBe('completed');
 const read=calls.find(call=>String(call.messages[0].content).includes('VISUAL_DOCUMENT_MEMORY_PAGES')),blocks=read.messages[1].content;
 expect(blocks[0].text).toContain('文档页 1（PDF 文字层，公式另附局部截图，未发送整页图像）');expect(blocks[0].text).toContain('Line 0 explains');
 expect(blocks.filter((block:any)=>block.type==='image_url')).toHaveLength(lines.length);
 const cache=join(await host.workspaces.internalDirectory(workspace.id),'cache',document.documentId,document.version);
 expect((await readdir(cache)).filter(name=>/^page-1-formula-\d+\.png$/.test(name))).toHaveLength(lines.length);expect(await readdir(cache)).not.toContain('page-1.png');
},60_000);
