import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import PptxModule from 'pptxgenjs';
import {officeAdapter} from '../../packages/core/src/documents/office.js';
import {extractSlides} from '../../packages/core/src/documents/slides.js';
const PptxGenJS=PptxModule as unknown as typeof import('pptxgenjs').default;
const cleanup:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const done of cleanup.splice(0))await done();});
it('keeps a diagram inherited from the slide master visual when the slide XML contains only text',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'slide-master-profile-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.defineSlideMaster({title:'DIAGRAM',objects:[{image:{data:'image/png;base64,'+(await readFile('tests/fixtures/assets/diagram.png')).toString('base64'),x:0.5,y:1.2,w:12,h:6}}]});
 const slide=pptx.addSlide('DIAGRAM');slide.addText('This slide explains the complete signal processing diagram inherited from its layout and master.',{x:0.5,y:0.3,w:12,h:0.8,fontSize:16});
 const path=join(directory,'deck.pptx'),cacheDir=join(directory,'cache');await mkdir(cacheDir);await writeFile(path,await pptx.write({outputType:'nodebuffer'}) as Buffer);
 expect((await extractSlides(path))[0]?.textSufficient).toBe(true);
 const parsed=await officeAdapter.parse({path,cacheDir,workspaceId:'w',documentId:'d',version:'v',extension:'.pptx',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',relativePath:'deck.pptx'} as never,new AbortController().signal);
 expect(parsed.pages[0]?.profile?.imageCoverage).toBeGreaterThan(0.1);expect(parsed.pages[0]?.profile?.textSufficient).toBe(false);
},60_000);
