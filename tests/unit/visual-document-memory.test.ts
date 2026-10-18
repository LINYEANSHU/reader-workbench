import {expect,it} from 'vitest';
const modulePath='../../plugins/visual-document-memory/reading.mjs';const contextPath='../../plugins/visual-document-memory/context.mjs';
it('pre-reads pages and overview without setting an output token cap',async()=>{
 const{prepare}=await import(modulePath),s=await setup();
 s.host.capabilities={...s.host.capabilities,contextWindow:1000000,maxOutputTokens:1};
 const generate=s.host.generate,requests:any[]=[];
 s.host.generate=async function*(input:any,signal:any){requests.push(structuredClone(input));yield* generate(input,signal);};
 const record=await prepare(s.host,new AbortController().signal);
 expect(record.completedPages).toHaveLength(7);
 expect(requests).toHaveLength(2);
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
 expect(attempts).toEqual([7,3,4,2,2]);
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
it('all seven page images go in one initial request and ready memory needs no new images',async()=>{const{prepare}=await import(modulePath),s=await setup();const record=await prepare(s.host,new AbortController().signal);expect(s.calls).toEqual([[1,2,3,4,5,6,7]]);expect(record.pages[6].summary).toBe('LAST PAGE');expect(record.status).toBe('ready');await prepare(s.host,new AbortController().signal);expect(s.calls.length).toBe(1);});
it('splits by model limit and resumes only uncompleted final page',async()=>{const{prepare}=await import(modulePath),s=await setup(3);s.fail=true;await expect(prepare(s.host,new AbortController().signal)).rejects.toThrow('network');expect(s.saved.completedPages).toEqual([1,2,3,4,5,6]);expect(s.saved.status).toBe('partial');s.fail=false;await prepare(s.host,new AbortController().signal);expect(s.calls).toEqual([[1,2,3],[4,5,6],[7],[7]]);});
it('rejects missing model page results and oversized single image',async()=>{const{prepare}=await import(modulePath),s=await setup();s.host.generate=async function*(){yield{kind:'delta',text:'{"pages":[]}'};yield{kind:'done'};};await expect(prepare(s.host,new AbortController().signal)).rejects.toThrow();const big=await setup();big.host.imageLimits.maxImageBytes=1;await expect(prepare(big.host,new AbortController().signal)).rejects.toThrow();expect(big.calls).toEqual([]);});
it('selects bounded memory retaining last-page source and indexes all pages',async()=>{const{prepare}=await import(modulePath),{select}=await import(contextPath),s=await setup();const record=await prepare(s.host,new AbortController().signal);const chosen=select(record,'LAST PAGE',1200);expect(chosen.pages).toContain(7);expect(Buffer.byteLength(chosen.text)).toBeLessThanOrEqual(1200);expect(chosen.text).toContain('7');expect(()=>select(record,'?',10)).toThrow();});
