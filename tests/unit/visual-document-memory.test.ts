import {expect,it} from 'vitest';
const modulePath='../../plugins/visual-document-memory/reading.mjs';const contextPath='../../plugins/visual-document-memory/context.mjs';
it('pre-reads pages and overview without setting an output token cap',async()=>{
 const{prepare}=await import(modulePath),s=await setup();
 s.host.capabilities={...s.host.capabilities,contextWindow:1000000,maxOutputTokens:1};
 const generate=s.host.generate,requests:any[]=[];
 s.host.generate=async function*(input:any,signal:any){requests.push(structuredClone(input));yield* generate(input,signal);};
 const record=await prepare(s.host,new AbortController().signal);
 expect(record.completedPages).toHaveLength(7);
 expect(requests).toHaveLength(3);
 for(const request of requests)expect(request).not.toHaveProperty('maxOutputTokens');
});
for(const code of ['MODEL_OUTPUT_LIMIT','DOCUMENT_MEMORY_INVALID'])it('retries smaller page batches after '+code+' without imposing an output limit',async()=>{
 const{prepare}=await import(modulePath),s=await setup(),generate=s.host.generate,attempts:number[]=[];
 s.host.generate=async function*(input:any,signal:any){
  const count=input.messages.flatMap((message:any)=>Array.isArray(message.content)?message.content.filter((block:any)=>block.type==='image_url'):[]).length;
  if(count){attempts.push(count);if(count>3)throw Object.assign(new Error('provider reading failed'),{code});}
  yield* generate(input,signal);
 };
 const record=await prepare(s.host,new AbortController().signal);
 expect(record.status).toBe('ready');expect(record.completedPages).toEqual([1,2,3,4,5,6,7]);
 // Batches run concurrently, so only the set of attempted batch sizes is fixed.
 expect([...attempts].sort()).toEqual([2,2,3,4]);
});
it('retries a timed-out page batch in halves',async()=>{
 const{prepare}=await import(modulePath),s=await setup(),generate=s.host.generate,attempts:number[]=[];
 s.host.generate=async function*(input:any,signal:any){
  const count=input.messages.flatMap((message:any)=>Array.isArray(message.content)?message.content.filter((block:any)=>block.type==='image_url'):[]).length;
  if(count){attempts.push(count);if(count>2)throw Object.assign(new Error('timeout'),{code:'MODEL_TIMEOUT'});}
  yield* generate(input,signal);
 };
 const record=await prepare(s.host,new AbortController().signal);
 expect(record.completedPages).toEqual([1,2,3,4,5,6,7]);expect([...attempts].sort()).toEqual([1,2,2,2,3,4]);
});
it('reads pages with a complete PDF text layer as text without rendering or sending their images',async()=>{
 const{prepare,prepareLocal}=await import(modulePath),s=await setup(),rendered:number[]=[],requests:any[]=[],generate=s.host.generate;
 s.host.readPageText=async(page:number)=>'TEXT LAYER '+page;s.host.readPageProfile=async(page:number)=>({textSufficient:page!==3});
 const readImage=s.host.readPageImage;s.host.readPageImage=async(page:number,signal:any)=>{rendered.push(page);return readImage(page,signal);};
 s.host.generate=async function*(input:any,signal:any){requests.push(input);yield* generate(input,signal);};
 await prepareLocal(s.host,new AbortController().signal);expect(rendered).toEqual([3]);rendered.splice(0);
 const record=await prepare(s.host,new AbortController().signal);expect(record.completedPages).toEqual([1,2,3,4,5,6,7]);expect(rendered).toEqual([3]);
 const sent=requests.filter(request=>request.messages[0].content.includes('VISUAL_DOCUMENT_MEMORY_PAGES')).flatMap(request=>request.messages[1].content);
 expect(sent.filter((block:any)=>block.type==='image_url')).toHaveLength(1);
 expect(sent.find((block:any)=>block.type==='text'&&block.text.startsWith('文档页 1'))?.text).toBe('文档页 1（PDF 文字层，未发送页面图像）\nTEXT LAYER 1');
});
it('reads at most two batches at once and commits each result without losing earlier pages',async()=>{
 const{prepare}=await import(modulePath),s=await setup(2),generate=s.host.generate,saves:number[][]=[];let active=0,peak=0;
 s.host.generate=async function*(input:any,signal:any){const reading=String(input.messages[0].content).includes('VISUAL_DOCUMENT_MEMORY_PAGES');if(reading){active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));}try{yield* generate(input,signal);}finally{if(reading)active--;}};
 const save=s.host.save;s.host.save=async(value:any,signal:any)=>{saves.push([...value.completedPages]);await new Promise(resolve=>setTimeout(resolve,value.completedPages.length%2?8:1));return save(value,signal);};
 const record=await prepare(s.host,new AbortController().signal);expect(record.completedPages).toEqual([1,2,3,4,5,6,7]);expect(peak).toBe(2);
 for(let index=1;index<saves.length;index++)expect(saves[index]!.length).toBeGreaterThanOrEqual(saves[index-1]!.length);expect(s.saved.completedPages).toEqual([1,2,3,4,5,6,7]);
});
it('merges the earlier overview with only the newly read pages when more pages are read',async()=>{
 const{prepare}=await import(modulePath),s=await setup(),generate=s.host.generate,overviews:string[]=[];
 s.host.generate=async function*(input:any,signal:any){if(String(input.messages[0].content).includes('VISUAL_DOCUMENT_MEMORY_OVERVIEW'))overviews.push(String(input.messages[1].content));yield* generate(input,signal);};
 s.host.readingPages=[1,2,3];await prepare(s.host,new AbortController().signal);
 expect(overviews).toHaveLength(1);expect(overviews[0]).toContain('"page":3');expect(s.saved.overviewPages).toEqual([1,2,3]);
 s.host.readingPages=[1,2,3,4,5,6,7];const record=await prepare(s.host,new AbortController().signal);
 expect(overviews).toHaveLength(2);expect(overviews[1]).toContain('已有概览（覆盖第 1-3 页');expect(overviews[1]).toContain('"page":7');expect(overviews[1]).not.toContain('"page":2');
 expect(record.overviewPages).toEqual([1,2,3,4,5,6,7]);expect(record.status).toBe('ready');
});
it('keeps an earlier overview tied to the pages it covers while new pages are still being read',async()=>{
 const{prepare}=await import(modulePath),s=await setup();s.host.readingPages=[1,2];await prepare(s.host,new AbortController().signal);
 s.host.readingPages=[1,2,3];s.fail=true;s.host.readPageImage=async(page:number)=>{if(page===3)throw Object.assign(new Error('render failed'),{code:'DOCUMENT_IMAGE_UNAVAILABLE'});return{page,mime:'image/png',bytes:Buffer.from('PAGE'+page),anchors:[]};};
 await expect(prepare(s.host,new AbortController().signal)).rejects.toThrow('render failed');
 expect(s.saved.overviewPages).toEqual([1,2]);expect(s.saved.overview).not.toBe('');
});
it('keeps page batches small even when the provider allows hundreds of images',async()=>{
 const{prepare}=await import(modulePath),s=await setup(600);await prepare(s.host,new AbortController().signal);
 expect(Math.max(...s.calls.map(pages=>pages.length))).toBeLessThanOrEqual(4);expect(s.calls.flat()).toEqual([1,2,3,4,5,6,7]);
});
for(const malformed of ['page','relation'])it('recovers from null '+malformed+' entries in model JSON',async()=>{
 const{prepare}=await import(modulePath),s=await setup(),generate=s.host.generate;
 s.host.generate=async function*(input:any,signal:any){
  const pages=input.messages.flatMap((message:any)=>Array.isArray(message.content)?message.content.filter((block:any)=>block.type==='text').map((block:any)=>Number(/文档页 (\d+)/.exec(block.text)?.[1])).filter(Boolean):[]);
  if(pages.length>3){yield{kind:'delta',text:JSON.stringify({pages:pages.map((page:number)=>malformed==='page'?null:{page,summary:'内容',transcription:'',figures:[],formulas:[],terms:[],uncertainties:[],crossPageRelations:[null]})})};yield{kind:'done'};return;}
  yield* generate(input,signal);
 };
 const record=await prepare(s.host,new AbortController().signal);
 expect(record.status).toBe('ready');expect(record.completedPages).toEqual([1,2,3,4,5,6,7]);
});
async function setup(maxImages=600){const calls:number[][]=[],ref={workspaceId:'w',documentId:'d',version:'v'};let saved:any=null,fail=false;const host:any={pluginId:'visual-document-memory',modelIdentity:'model',generation:0,memoryBudgetBytes:32000,capabilities:{vision:true,tools:false,contextWindow:100000,maxOutputTokens:12000,reasoningEfforts:['none']},imageLimits:{maxImages,maxImageBytes:4000000,maxTotalImageBytes:12000000,maxRequestBytes:16000000,imageTokens:1024},describe:async()=>({...ref,pageCount:7,viewer:{kind:'pdf'}}),readPageText:async()=>'',readPageImage:async(page:number)=>({page,mime:'image/png',bytes:Buffer.from('PAGE'+page),anchors:[]}),load:async()=>saved,save:async(value:any)=>{saved=structuredClone(value);},progress:async()=>{},async *generate(input:any){const instruction=input.messages[0].content;if(instruction.includes('VISUAL_DOCUMENT_MEMORY_PAGES')){const pages=input.messages.flatMap((m:any)=>typeof m.content==='string'?[]:m.content.filter((c:any)=>c.type==='text').map((c:any)=>Number(/文档页 (\d+)/.exec(c.text)?.[1])).filter(Boolean));calls.push(pages);if(fail&&pages.includes(7))throw Error('network');yield{kind:'delta',text:JSON.stringify({pages:pages.map((page:number)=>({page,summary:page===7?'LAST PAGE':'PAGE '+page,transcription:'',figures:[],formulas:[],terms:[],uncertainties:[],crossPageRelations:[]}))})};}else yield{kind:'delta',text:'完整概览，末页内容在第7页。'};yield{kind:'done'};}};return{host,calls,get saved(){return saved;},set fail(value:boolean){fail=value;}};}
it('reads seven page images in two bounded requests and ready memory needs no new images',async()=>{const{prepare}=await import(modulePath),s=await setup();const record=await prepare(s.host,new AbortController().signal);expect(s.calls).toEqual([[1,2,3,4],[5,6,7]]);expect(record.pages[6].summary).toBe('LAST PAGE');expect(record.status).toBe('ready');await prepare(s.host,new AbortController().signal);expect(s.calls.length).toBe(2);});
it('ranks Chinese questions by shared words instead of page order',async()=>{const{select}=await import(contextPath);const page=(page:number,summary:string)=>({page,summary,transcription:'x'.repeat(400),figures:[],formulas:[],terms:[],uncertainties:[],crossPageRelations:[]});const pages=[1,2,3,4,5,6,7,8].map(number=>page(number,number===7?'本页给出贝叶斯公式的适用条件：事件互斥且完备':'无关的背景介绍'));const record={document:{workspaceId:'w',documentId:'d',version:'v'},completedPages:pages.map(item=>item.page),pageCount:8,overview:'概览',pages};expect(select(record,'贝叶斯公式的适用条件是什么？',1500).pages).toEqual([7]);});
it('matches page numbers as whole numbers when ranking memory',async()=>{const{rankPages}=await import(contextPath);const page=(page:number,formulas:string[])=>({page,summary:'',transcription:'',figures:[],formulas,terms:[],uncertainties:[],crossPageRelations:[]});const ranked=rankPages([page(1,['式（30）：吞吐量']),page(2,['式（3）：信道容量'])],'式3 讲了什么');expect(ranked[0].page.page).toBe(2);});
it('splits by model limit and resumes only uncompleted final page',async()=>{const{prepare}=await import(modulePath),s=await setup(3);s.fail=true;await expect(prepare(s.host,new AbortController().signal)).rejects.toThrow('network');expect(s.saved.completedPages).toEqual([1,2,3,4,5,6]);expect(s.saved.status).toBe('partial');s.fail=false;await prepare(s.host,new AbortController().signal);expect(s.calls).toEqual([[1,2,3],[4,5,6],[7],[7]]);});
it('rejects missing model page results and oversized single image',async()=>{const{prepare}=await import(modulePath),s=await setup();s.host.generate=async function*(){yield{kind:'delta',text:'{"pages":[]}'};yield{kind:'done'};};await expect(prepare(s.host,new AbortController().signal)).rejects.toThrow();const big=await setup();big.host.imageLimits.maxImageBytes=1;await expect(prepare(big.host,new AbortController().signal)).rejects.toThrow();expect(big.calls).toEqual([]);});
it('selects bounded memory retaining last-page source and indexes all pages',async()=>{const{prepare}=await import(modulePath),{select}=await import(contextPath),s=await setup();const record=await prepare(s.host,new AbortController().signal);const chosen=select(record,'LAST PAGE',1200);expect(chosen.pages).toContain(7);expect(Buffer.byteLength(chosen.text)).toBeLessThanOrEqual(1200);expect(chosen.text).toContain('7');expect(()=>select(record,'?',10)).toThrow();});
